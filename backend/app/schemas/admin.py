from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.models import DiscountType, UserRole


class AdminUserResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    created_at: datetime
    deleted_at: datetime | None = None

    model_config = {"from_attributes": True}


class PaginatedUsers(BaseModel):
    items: list[AdminUserResponse]
    next_cursor: str | None = None


class AdminUserUpdate(BaseModel):
    """Partial update. `role` changes the user's role; `is_active=False`
    soft-deletes (sets deleted_at), `True` restores."""
    role: UserRole | None = None
    is_active: bool | None = None


class CouponCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    discount_type: DiscountType
    value: Decimal = Field(gt=0)
    expires_at: datetime | None = None
    usage_limit: int | None = Field(default=None, ge=1)


class CouponResponse(BaseModel):
    id: str
    code: str
    discount_type: DiscountType
    value: Decimal
    expires_at: datetime | None
    usage_limit: int | None
    usage_count: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
