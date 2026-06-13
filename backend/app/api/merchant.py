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

from app.core.database import get_db
from app.core.deps import require_role
from app.models.models import (
    Order,
    OrderItem,
    OrderStatus,
    Product,
    User,
    UserRole,
)
from app.schemas.dashboard import (
    DailyRevenue,
    MerchantDashboard,
    OrderStatusCount,
    RevenueSummary,
    RevenueWindows,
    TopProduct,
)

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


async def _revenue_since(db: AsyncSession, merchant_id: str, days: int) -> Decimal:
    """Sum (qty * unit_price) for this merchant's items in revenue-status orders
    placed in the last `days` days."""
    cutoff = func.now() - timedelta(days=days)
    stmt = (
        select(func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= cutoff,
        )
    )
    return Decimal((await db.execute(stmt)).scalar() or 0)


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
