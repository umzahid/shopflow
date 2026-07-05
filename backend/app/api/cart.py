from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.core.redis import get_redis
from app.models.models import Product, ProductStatus, User, UserRole
from app.schemas.cart import CartItemAdd, CartItemResponse, CartItemUpdate, CartResponse
from app.services import cart as cart_svc

router = APIRouter(prefix="/cart", tags=["cart"])


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


def _to_response(raw: dict[str, dict]) -> CartResponse:
    items = []
    subtotal = Decimal("0")
    for pid, payload in raw.items():
        qty = payload["qty"]
        unit_price = Decimal(payload["unit_price"])
        line_total = unit_price * qty
        subtotal += line_total
        items.append(
            CartItemResponse(
                product_id=pid,
                title=payload["title"],
                qty=qty,
                unit_price=unit_price,
                line_total=line_total,
            )
        )
    return CartResponse(items=items, subtotal=subtotal)


@router.get("", response_model=CartResponse)
async def get_cart(
    current_user: User = Depends(require_role(UserRole.customer)),
):
    redis = await get_redis()
    raw = await cart_svc.get(redis, current_user.id)
    return _to_response(raw)


@router.post("/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
async def add_to_cart(
    body: CartItemAdd,
    request: Request,
    current_user: User = Depends(require_role(UserRole.customer)),
    db: AsyncSession = Depends(get_db),
):
    product = (await db.execute(
        select(Product).where(
            Product.id == str(body.product_id),
            Product.deleted_at.is_(None),
        )
    )).scalar_one_or_none()

    if not product or product.status != ProductStatus.active:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product not available", request.url.path)
    if product.stock_qty < body.qty:
        raise _problem(
            status.HTTP_409_CONFLICT, "Conflict",
            f"Only {product.stock_qty} units in stock", request.url.path,
        )

    redis = await get_redis()
    new_qty = await cart_svc.add_or_increment(
        redis, current_user.id, product.id, body.qty, product.price, product.title,
    )

    # Re-check after increment in case existing qty + new qty > stock
    if new_qty > product.stock_qty:
        # roll back to previous qty
        await cart_svc.set_item(
            redis, current_user.id, product.id,
            new_qty - body.qty, product.price, product.title,
        )
        raise _problem(
            status.HTTP_409_CONFLICT, "Conflict",
            f"Cart total would exceed stock ({product.stock_qty} available)", request.url.path,
        )

    raw = await cart_svc.get(redis, current_user.id)
    return _to_response(raw)


@router.patch("/items/{product_id}", response_model=CartResponse)
async def update_cart_item(
    product_id: UUID,
    body: CartItemUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.customer)),
    db: AsyncSession = Depends(get_db),
):
    redis = await get_redis()
    existing = await cart_svc.get(redis, current_user.id)
    pid_str = str(product_id)
    if pid_str not in existing:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Item not in cart", request.url.path)

    if body.qty == 0:
        await cart_svc.remove_item(redis, current_user.id, pid_str)
    else:
        product = (await db.execute(
            select(Product).where(Product.id == pid_str, Product.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not product or product.status != ProductStatus.active:
            raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product no longer available", request.url.path)
        if body.qty > product.stock_qty:
            raise _problem(
                status.HTTP_409_CONFLICT, "Conflict",
                f"Only {product.stock_qty} units in stock", request.url.path,
            )
        await cart_svc.set_item(
            redis, current_user.id, pid_str, body.qty, product.price, product.title,
        )

    raw = await cart_svc.get(redis, current_user.id)
    return _to_response(raw)


@router.delete("/items/{product_id}", response_model=CartResponse)
async def remove_cart_item(
    product_id: UUID,
    current_user: User = Depends(require_role(UserRole.customer)),
):
    redis = await get_redis()
    await cart_svc.remove_item(redis, current_user.id, str(product_id))
    raw = await cart_svc.get(redis, current_user.id)
    return _to_response(raw)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_cart(
    current_user: User = Depends(require_role(UserRole.customer)),
):
    redis = await get_redis()
    await cart_svc.clear(redis, current_user.id)
