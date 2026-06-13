from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class CartItemAdd(BaseModel):
    product_id: UUID
    qty: int = Field(ge=1)


class CartItemUpdate(BaseModel):
    qty: int = Field(ge=0)  # 0 removes the item


class CartItemResponse(BaseModel):
    product_id: str
    title: str
    qty: int
    unit_price: Decimal
    line_total: Decimal


class CartResponse(BaseModel):
    items: list[CartItemResponse]
    subtotal: Decimal
