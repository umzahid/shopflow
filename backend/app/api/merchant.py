"""Merchant analytics endpoints.

Revenue is recognized for orders in (confirmed, shipped, delivered) — i.e.,
past the pending/pending_review gate but not cancelled. Each merchant only
sees data on their own products.
"""
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_role
from app.core.pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    apply_cursor,
    build_page,
    encode_cursor,
    resolve_page_size,
)
from app.models.models import (
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductStatus,
    User,
    UserRole,
)
from app.schemas.order import OrderResponse, PaginatedOrders
from app.schemas.product import PaginatedProducts, ProductResponse
from app.schemas.copilot import CopilotRequest, CopilotResponse, ToolCallTrace
from app.schemas.dashboard import (
    DailyRevenue,
    ForecastPointResponse,
    MerchantDashboard,
    OrderStatusCount,
    ProductForecastResponse,
    RestockAlertResponse,
    RestockAlertsResponse,
    RevenueSummary,
    RevenueWindows,
    TopProduct,
)
from app.schemas.descriptions import DescriptionRequest, DescriptionResponse
from app.ml.forecast import forecast_product_demand
from app.services import copilot as copilot_svc
from app.services import descriptions as descriptions_svc
from app.services.restock import get_restock_alerts

router = APIRouter(prefix="/merchant", tags=["merchant"])


REVENUE_STATUSES = (OrderStatus.confirmed, OrderStatus.shipped, OrderStatus.delivered)


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


async def _revenue_between(
    db: AsyncSession, merchant_id: str, start_days_ago: int, end_days_ago: int
) -> Decimal:
    """Recognized revenue for orders created in [now-start_days_ago, now-end_days_ago)."""
    lower = func.now() - timedelta(days=start_days_ago)
    upper = func.now() - timedelta(days=end_days_ago)
    stmt = (
        select(func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= lower,
            Order.created_at < upper,
        )
    )
    return Decimal((await db.execute(stmt)).scalar() or 0)


async def _revenue_since(db: AsyncSession, merchant_id: str, days: int) -> Decimal:
    return await _revenue_between(db, merchant_id, days, 0)


async def _gather_week_stats(db: AsyncSession, merchant_id: str) -> dict:
    """Week-over-week bundle fed to the narrative model. Merchant-scoped reads only."""
    this_week = await _revenue_between(db, merchant_id, 7, 0)
    prior_week = await _revenue_between(db, merchant_id, 14, 7)
    delta_pct = (
        round(float((this_week - prior_week) / prior_week) * 100, 1)
        if prior_week != 0 else None
    )

    cutoff = func.now() - timedelta(days=7)
    status_rows = (await db.execute(
        select(Order.status, func.count(func.distinct(Order.id)))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == merchant_id, Order.created_at >= cutoff)
        .group_by(Order.status)
    )).all()
    orders_by_status = {s.value: c for s, c in status_rows}

    top_rows = (await db.execute(
        select(
            Product.title,
            func.sum(OrderItem.quantity).label("units"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("rev"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= cutoff,
        )
        .group_by(Product.title)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        .limit(3)
    )).all()
    top_products = [
        {"title": t, "units_sold": int(u), "revenue": str(Decimal(r))} for t, u, r in top_rows
    ]

    alerts = await get_restock_alerts(db, merchant_id)  # lead_time_days defaults to 7
    # RestockAlert exposes .title and .current_stock (verified in app/services/restock.py:21-34)
    restock_alerts = [{"title": a.title, "current_stock": a.current_stock} for a in alerts]

    return {
        "revenue_this_week": str(this_week),
        "revenue_prior_week": str(prior_week),
        "delta_pct": delta_pct,
        "orders_this_week": sum(orders_by_status.values()),
        "orders_by_status": orders_by_status,
        "top_products": top_products,
        "restock_alerts": restock_alerts,
    }


@router.get("/dashboard", response_model=MerchantDashboard)
async def merchant_dashboard(
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    mid = current_user.id

    rev_7 = await _revenue_since(db, mid, 7)
    rev_30 = await _revenue_since(db, mid, 30)
    rev_90 = await _revenue_since(db, mid, 90)

    # Order counts by status — distinct orders that contain at least one of this
    # merchant's products.
    by_status_rows = (await db.execute(
        select(Order.status, func.count(func.distinct(Order.id)))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == mid)
        .group_by(Order.status)
    )).all()
    by_status = [OrderStatusCount(status=s.value, count=c) for s, c in by_status_rows]

    # Top 5 products by lifetime revenue (revenue-status orders only)
    top_rows = (await db.execute(
        select(
            Product.id,
            Product.title,
            func.sum(OrderItem.quantity).label("units"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Product.merchant_id == mid,
            Order.status.in_(REVENUE_STATUSES),
        )
        .group_by(Product.id, Product.title)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        .limit(5)
    )).all()
    top_products = [
        TopProduct(product_id=pid, title=title, units_sold=units, revenue=Decimal(rev))
        for pid, title, units, rev in top_rows
    ]

    return MerchantDashboard(
        revenue=RevenueWindows(last_7d=rev_7, last_30d=rev_30, last_90d=rev_90),
        orders_by_status=by_status,
        top_products=top_products,
    )


@router.get("/revenue-summary", response_model=RevenueSummary)
async def revenue_summary(
    request: Request,
    start: date = Query(description="Inclusive YYYY-MM-DD"),
    end: date = Query(description="Inclusive YYYY-MM-DD"),
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    if end < start:
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request",
            "end must be >= start", request.url.path,
        )
    if (end - start).days > 365:
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request",
            "Date range cannot exceed 365 days", request.url.path,
        )

    # end is inclusive — extend to end-of-day by adding one day to upper bound
    upper = end + timedelta(days=1)
    day_expr = func.date_trunc("day", Order.created_at)
    rows = (await db.execute(
        select(
            day_expr.label("day"),
            func.coalesce(
                func.sum(OrderItem.quantity * OrderItem.unit_price), 0
            ).label("revenue"),
        )
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Product.merchant_id == current_user.id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= start,
            Order.created_at < upper,
        )
        .group_by(day_expr)
        .order_by(day_expr)
    )).all()

    series = [DailyRevenue(day=day.date(), revenue=Decimal(rev)) for day, rev in rows]
    return RevenueSummary(start=start, end=end, series=series)


@router.get("/products", response_model=PaginatedProducts)
async def merchant_products(
    request: Request,
    cursor: str | None = Query(default=None),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status_filter: ProductStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    """The merchant's own products for the product manager.

    Unlike the public `GET /products` (active-only), this returns every
    status — draft/active/archived — so the merchant can manage the full
    catalog. Soft-deleted rows are still excluded.
    """
    page_size = resolve_page_size(page_size)
    stmt = select(Product).where(
        Product.merchant_id == current_user.id,
        Product.deleted_at.is_(None),
    )
    if status_filter is not None:
        stmt = stmt.where(Product.status == status_filter)

    stmt = apply_cursor(stmt, Product.created_at, Product.id, cursor, page_size)
    rows = (await db.execute(stmt)).scalars().all()
    items, next_cursor = build_page(
        rows, page_size, lambda p: encode_cursor(p.created_at, p.id)
    )
    return PaginatedProducts(
        items=[ProductResponse.model_validate(p) for p in items],
        next_cursor=next_cursor,
    )


@router.get("/orders", response_model=PaginatedOrders)
async def merchant_orders(
    request: Request,
    cursor: str | None = Query(default=None),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    """Orders containing at least one of this merchant's products, for the
    order manager. Same scoping as `GET /orders` for a merchant, exposed under
    the /merchant namespace per the API contract."""
    page_size = resolve_page_size(page_size)
    owned_orders = (
        select(OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == current_user.id)
        .subquery()
    )
    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id.in_(select(owned_orders)))
    )
    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)

    stmt = apply_cursor(stmt, Order.created_at, Order.id, cursor, page_size)
    rows = (await db.execute(stmt)).scalars().unique().all()
    items, next_cursor = build_page(
        rows, page_size, lambda o: encode_cursor(o.created_at, o.id)
    )
    return PaginatedOrders(
        items=[OrderResponse.model_validate(o) for o in items],
        next_cursor=next_cursor,
    )


@router.get(
    "/products/{product_id}/forecast",
    response_model=ProductForecastResponse,
)
async def product_forecast(
    product_id: str,
    request: Request,
    horizon: int = Query(default=30, ge=1, le=180),
    force_refresh: bool = Query(default=False),
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    """Prophet-driven demand forecast for one of the merchant's products.

    Returns an empty `points` list if the product has fewer than 14 days of
    revenue-status sales history — Prophet fits below that threshold produce
    uninformative confidence bands.
    """
    product = (
        await db.execute(
            select(Product).where(
                Product.id == product_id, Product.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if not product:
        raise _problem(
            status.HTTP_404_NOT_FOUND, "Not Found",
            "Product not found", request.url.path,
        )
    if product.merchant_id != current_user.id:
        raise _problem(
            status.HTTP_403_FORBIDDEN, "Forbidden",
            "You do not own this product", request.url.path,
        )

    points = await forecast_product_demand(db, product_id, horizon, force_refresh=force_refresh)
    return ProductForecastResponse(
        product_id=product_id,
        horizon_days=horizon,
        points=[
            ForecastPointResponse(
                ds=p.ds, yhat=p.yhat, yhat_lower=p.yhat_lower, yhat_upper=p.yhat_upper,
            )
            for p in points
        ],
    )


@router.get("/restock-alerts", response_model=RestockAlertsResponse)
async def restock_alerts(
    request: Request,
    lead_time: int = Query(
        default=7, ge=1, le=90,
        description="Days between order-to-restock and inventory hitting the shelf.",
    ),
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    """Products where predicted demand across `lead_time` days exceeds current
    stock — sorted by shortfall (largest first)."""
    alerts = await get_restock_alerts(db, current_user.id, lead_time_days=lead_time)
    return RestockAlertsResponse(
        lead_time_days=lead_time,
        alerts=[RestockAlertResponse(**a.to_dict()) for a in alerts],
    )


@router.post("/copilot", response_model=CopilotResponse)
async def merchant_copilot(
    body: CopilotRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    """Single-turn, read-only natural-language analytics for the merchant's store."""
    question = body.question.strip()
    if not question:
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request",
            "question must not be empty", request.url.path,
        )
    try:
        result = await copilot_svc.answer_question(db, current_user, question)
    except copilot_svc.CopilotError as e:
        title = "Service Unavailable" if e.status_code == status.HTTP_503_SERVICE_UNAVAILABLE else "Bad Gateway"
        raise _problem(e.status_code, title, e.detail, request.url.path)

    return CopilotResponse(
        answer=result.answer,
        tool_calls=[
            ToolCallTrace(tool=c.tool, input=c.input, result=c.result) for c in result.tool_calls
        ],
    )


@router.post("/generate-description", response_model=DescriptionResponse)
async def generate_description(
    body: DescriptionRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
):
    """Generate up to 3 marketing description variants from product attributes.

    Stateless: returns text only — the merchant saves a chosen variant through the
    normal product create/update flow.
    """
    if not body.title.strip():
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request",
            "title must not be empty", request.url.path,
        )
    try:
        variants = await descriptions_svc.generate_descriptions(body)
    except descriptions_svc.DescriptionError as e:
        title = "Service Unavailable" if e.status_code == status.HTTP_503_SERVICE_UNAVAILABLE else "Bad Gateway"
        raise _problem(e.status_code, title, e.detail, request.url.path)
    return DescriptionResponse(variants=variants)
