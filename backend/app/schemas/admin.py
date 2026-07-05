from datetime import datetime

from pydantic import BaseModel

from app.models.models import UserRole


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
