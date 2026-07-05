from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ProfileUpdate(BaseModel):
    """Change email and/or password. Changing the password requires the current
    one (verified server-side)."""
    email: EmailStr | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8)


class AddressBase(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    line1: str = Field(min_length=1, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str = Field(min_length=1, max_length=20)
    country: str = Field(min_length=2, max_length=2)
    is_default: bool = False


class AddressCreate(AddressBase):
    pass


class AddressUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=50)
    line1: str | None = Field(default=None, min_length=1, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, min_length=1, max_length=20)
    country: str | None = Field(default=None, min_length=2, max_length=2)
    is_default: bool | None = None


class AddressResponse(AddressBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MyReviewResponse(BaseModel):
    id: str
    product_id: str
    product_title: str
    rating: int
    body: str | None
    created_at: datetime
