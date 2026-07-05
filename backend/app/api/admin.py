"""Platform-wide admin analytics + user/order management. Admin-only."""
from datetime import datetime, timezone
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
from app.models.models import Order, OrderItem, OrderStatus, User, UserRole
from app.schemas.admin import AdminUserUpdate, PaginatedUsers, AdminUserResponse
from app.schemas.dashboard import OrderStatusCount, PlatformStats
from app.schemas.order import OrderResponse, PaginatedOrders

router = APIRouter(prefix="/admin", tags=["admin"])


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


@router.get("/users", response_model=PaginatedUsers)
async def list_users(
    cursor: str | None = Query(default=None),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    role: UserRole | None = Query(default=None),
    include_deleted: bool = Query(default=False),
    current_user: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """All platform users, cursor-paginated. Soft-deleted users are hidden
    unless `include_deleted=true`."""
    page_size = resolve_page_size(page_size)
    stmt = select(User)
    if not include_deleted:
        stmt = stmt.where(User.deleted_at.is_(None))
    if role is not None:
        stmt = stmt.where(User.role == role)

    stmt = apply_cursor(stmt, User.created_at, User.id, cursor, page_size)
    rows = (await db.execute(stmt)).scalars().all()
    items, next_cursor = build_page(
        rows, page_size, lambda u: encode_cursor(u.created_at, u.id)
    )
    return PaginatedUsers(
        items=[AdminUserResponse.model_validate(u) for u in items],
        next_cursor=next_cursor,
    )


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    body: AdminUserUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """Change a user's role and/or (de)activate them (soft delete/restore)."""
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise _problem(
            status.HTTP_404_NOT_FOUND, "Not Found", "User not found", request.url.path
        )
    if user.id == current_user.id and body.is_active is False:
        raise _problem(
            status.HTTP_400_BAD_REQUEST,
            "Bad Request",
            "An admin cannot deactivate their own account",
            request.url.path,
        )

    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.deleted_at = None if body.is_active else datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(user)
    return AdminUserResponse.model_validate(user)


@router.get("/orders", response_model=PaginatedOrders)
async def list_all_orders(
    cursor: str | None = Query(default=None),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """Every order on the platform, cursor-paginated, optional status filter."""
    page_size = resolve_page_size(page_size)
    stmt = select(Order).options(selectinload(Order.items))
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
