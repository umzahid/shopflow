from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.models import ProductStatus


class ProductBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    price: Decimal = Field(ge=0)
    stock_qty: int = Field(ge=0, default=0)
    images: list[str] = Field(default_factory=list)
    category_id: UUID | None = None


class ProductCreate(ProductBase):
    status: ProductStatus = ProductStatus.draft


class ProductUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    stock_qty: int | None = Field(default=None, ge=0)
    images: list[str] | None = None
    category_id: UUID | None = None
    status: ProductStatus | None = None


class ProductResponse(BaseModel):
    id: str
    merchant_id: str
    category_id: str | None
    title: str
    description: str | None
    price: Decimal
    stock_qty: int
    images: list[str]
    status: ProductStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductSearchResult(ProductResponse):
    relevance_score: float


class ProductSummaryResponse(BaseModel):
    product_id: str
    summary: str


class PaginatedProducts(BaseModel):
    items: list[ProductResponse]
    next_cursor: str | None = None


class CategoryResponse(BaseModel):
    id: str
    name: str
    slug: str
    parent_id: str | None = None

    model_config = {"from_attributes": True}
