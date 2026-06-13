from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.models import OrderStatus


class ShippingAddress(BaseModel):
    line1: str = Field(min_length=1, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str = Field(min_length=1, max_length=20)
    country: str = Field(min_length=2, max_length=2)  # ISO-3166-1 alpha-2


class CheckoutRequest(BaseModel):
    shipping_address: ShippingAddress
    coupon_code: str | None = Field(default=None, max_length=50)


class OrderItemResponse(BaseModel):
    id: str
    product_id: str
    quantity: int
    unit_price: Decimal

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: str
    customer_id: str
    status: OrderStatus
    total_amount: Decimal
    discount_amount: Decimal
    shipping_address: dict
    coupon_id: str | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]

    model_config = {"from_attributes": True}


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class PaginatedOrders(BaseModel):
    items: list[OrderResponse]
    next_cursor: str | None = None
