from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.core.pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    apply_cursor,
    build_page,
    encode_cursor,
    resolve_page_size,
)
from app.core.redis import get_redis
from app.models.models import (
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductStatus,
    User,
    UserRole,
)
from app.schemas.order import (
    CheckoutRequest,
    OrderResponse,
    OrderStatusUpdate,
    PaginatedOrders,
)
from app.services import cart as cart_svc
from app.services import coupon as coupon_svc
from app.services import fraud as fraud_svc
from app.services.order_state import allowed_transitions, can_transition

router = APIRouter(prefix="/orders", tags=["orders"])


def _problem(status_code: int, title: str, detail: str, instance: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "type": f"https://shopflow.io/errors/{title.lower().replace(' ', '-')}",
            "title": title,
            "status": status_code,
            "detail": detail,
            "instance": instance,
        },
    )


def _cursor_for(order: Order) -> str:
    return encode_cursor(order.created_at, order.id)


# ---------------------------------------------------------------------------
# POST /orders/checkout — the transaction that actually matters
# ---------------------------------------------------------------------------

@router.post("/checkout", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    body: CheckoutRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.customer)),
    db: AsyncSession = Depends(get_db),
):
    redis = await get_redis()
    cart_raw = await cart_svc.get(redis, current_user.id)
    if not cart_raw:
        raise _problem(status.HTTP_400_BAD_REQUEST, "Bad Request", "Cart is empty", request.url.path)

    product_ids = list(cart_raw.keys())

    # SELECT FOR UPDATE locks the rows so concurrent checkouts can't double-spend stock.
    products_rows = (await db.execute(
        select(Product)
        .where(Product.id.in_(product_ids), Product.deleted_at.is_(None))
        .with_for_update()
    )).scalars().all()
    products_by_id = {p.id: p for p in products_rows}

    # Validate every cart line against the locked product row.
    subtotal = Decimal("0")
    for pid, line in cart_raw.items():
        product = products_by_id.get(pid)
        qty = line["qty"]
        if not product or product.status != ProductStatus.active:
            raise _problem(
                status.HTTP_409_CONFLICT, "Conflict",
                f"Product {pid} is no longer available", request.url.path,
            )
        if product.stock_qty < qty:
            raise _problem(
                status.HTTP_409_CONFLICT, "Conflict",
                f"Insufficient stock for {product.title} (have {product.stock_qty}, need {qty})",
                request.url.path,
            )
        subtotal += product.price * qty

    # Coupon (atomic — increments usage_count and is reversed on transaction rollback)
    coupon_id: str | None = None
    discount = Decimal("0")
    if body.coupon_code:
        try:
            coupon_id, discount = await coupon_svc.apply_coupon(db, body.coupon_code, subtotal)
        except coupon_svc.CouponError as e:
            raise _problem(status.HTTP_400_BAD_REQUEST, "Bad Request", e.detail, request.url.path)

    total = subtotal - discount

    # Fraud scoring — computed before the order is persisted so the prior-history
    # features exclude this in-flight order. A flagged order lands in
    # pending_review rather than pending, so it never auto-progresses to fulfilment.
    line_items = [(products_by_id[pid].price, line["qty"]) for pid, line in cart_raw.items()]
    _, fraud = await fraud_svc.assess_order(
        db,
        customer=current_user,
        order_total=total,
        discount_amount=discount,
        line_items=line_items,
    )
    order_status = OrderStatus.pending_review if fraud.is_flagged else OrderStatus.pending

    # Decrement stock + snapshot prices into OrderItems in the same transaction
    order = Order(
        customer_id=current_user.id,
        status=order_status,
        total_amount=total,
        discount_amount=discount,
        shipping_address=body.shipping_address.model_dump(),
        coupon_id=coupon_id,
        fraud_score=fraud.score,
        fraud_reasons=fraud.reasons,
    )
    db.add(order)
    await db.flush()  # need order.id

    for pid, line in cart_raw.items():
        product = products_by_id[pid]
        qty = line["qty"]
        product.stock_qty -= qty
        db.add(OrderItem(
            order_id=order.id,
            product_id=pid,
            quantity=qty,
            unit_price=product.price,  # snapshot — current value, not the cart's stale one
        ))

    await db.flush()
    # get_db autocommits on success; if anything above raised, the rollback
    # also reverses the coupon usage increment, so no compensating action needed.

    # Cart cleared after commit logically — do it after flush; if the outer
    # commit fails the user keeps their cart and can retry.
    await cart_svc.clear(redis, current_user.id)

    # Reload with items eagerly so the response model has them
    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
    )
    return OrderResponse.model_validate(result.scalar_one())


# ---------------------------------------------------------------------------
# GET /orders — role-scoped list
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedOrders)
async def list_orders(
    request: Request,
    cursor: str | None = Query(default=None),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    page_size = resolve_page_size(page_size)
    stmt = select(Order).options(selectinload(Order.items))

    if current_user.role == UserRole.customer:
        stmt = stmt.where(Order.customer_id == current_user.id)
    elif current_user.role == UserRole.merchant:
        # Orders where at least one item is the merchant's product
        merchant_subq = (
            select(OrderItem.order_id)
            .join(Product, Product.id == OrderItem.product_id)
            .where(Product.merchant_id == current_user.id)
            .subquery()
        )
        stmt = stmt.where(Order.id.in_(select(merchant_subq)))
    # admin: no filter

    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)

    stmt = apply_cursor(stmt, Order.created_at, Order.id, cursor, page_size)
    rows = (await db.execute(stmt)).scalars().unique().all()
    items, next_cursor = build_page(rows, page_size, _cursor_for)
    return PaginatedOrders(
        items=[OrderResponse.model_validate(o) for o in items],
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# GET /orders/{order_id}
# ---------------------------------------------------------------------------

@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    order = (await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == str(order_id))
    )).scalar_one_or_none()
    if not order:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Order not found", request.url.path)

    if current_user.role == UserRole.customer and order.customer_id != current_user.id:
        raise _problem(status.HTTP_403_FORBIDDEN, "Forbidden", "Not your order", request.url.path)
    if current_user.role == UserRole.merchant:
        product_ids = [it.product_id for it in order.items]
        owned = (await db.execute(
            select(Product.id).where(Product.id.in_(product_ids), Product.merchant_id == current_user.id)
        )).scalars().first()
        if not owned:
            raise _problem(status.HTTP_403_FORBIDDEN, "Forbidden", "Not your order", request.url.path)

    return OrderResponse.model_validate(order)


# ---------------------------------------------------------------------------
# PATCH /orders/{order_id}/status — merchant/admin only, state-machine gated
# ---------------------------------------------------------------------------

@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: UUID,
    body: OrderStatusUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.merchant, UserRole.admin):
        raise _problem(
            status.HTTP_403_FORBIDDEN, "Forbidden",
            "Only merchant or admin can change order status", request.url.path,
        )

    order = (await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == str(order_id))
    )).scalar_one_or_none()
    if not order:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Order not found", request.url.path)

    if current_user.role == UserRole.merchant:
        product_ids = [it.product_id for it in order.items]
        owned = (await db.execute(
            select(Product.id).where(Product.id.in_(product_ids), Product.merchant_id == current_user.id)
        )).scalars().first()
        if not owned:
            raise _problem(status.HTTP_403_FORBIDDEN, "Forbidden", "Not your order", request.url.path)

    if not can_transition(order.status, body.status):
        allowed = [s.value for s in allowed_transitions(order.status)]
        raise _problem(
            status.HTTP_409_CONFLICT, "Conflict",
            f"Cannot transition from {order.status.value} to {body.status.value}. "
            f"Allowed: {allowed or 'none (terminal)'}",
            request.url.path,
        )

    order.status = body.status
    await db.flush()
    await db.refresh(order, ["status", "updated_at"])
    return OrderResponse.model_validate(order)
