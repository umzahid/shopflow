"""Platform-wide admin analytics. Admin-only."""
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.models import Order, OrderItem, OrderStatus, User, UserRole
from app.schemas.dashboard import OrderStatusCount, PlatformStats

router = APIRouter(prefix="/admin", tags=["admin"])


REVENUE_STATUSES = (OrderStatus.confirmed, OrderStatus.shipped, OrderStatus.delivered)


@router.get("/platform-stats", response_model=PlatformStats)
async def platform_stats(
    current_user: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(
        select(func.count(User.id)).where(User.deleted_at.is_(None))
    )).scalar() or 0

    total_orders = (await db.execute(select(func.count(Order.id)))).scalar() or 0

    total_revenue_raw = (await db.execute(
        select(func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.status.in_(REVENUE_STATUSES))
    )).scalar() or 0

    by_status_rows = (await db.execute(
        select(Order.status, func.count(Order.id))
        .group_by(Order.status)
    )).all()
    by_status = [OrderStatusCount(status=s.value, count=c) for s, c in by_status_rows]

    return PlatformStats(
        total_users=total_users,
        total_orders=total_orders,
        total_revenue=Decimal(total_revenue_raw),
        orders_by_status=by_status,
    )
