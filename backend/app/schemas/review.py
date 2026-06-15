from datetime import datetime

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    body: str | None = Field(default=None, max_length=4000)


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    body: str | None = Field(default=None, max_length=4000)


class ReviewResponse(BaseModel):
    id: str
    product_id: str
    customer_id: str
    rating: int
    body: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RatingHistogram(BaseModel):
    """Counts per star rating, 1..5. Average is over all reviews."""
    one: int = 0
    two: int = 0
    three: int = 0
    four: int = 0
    five: int = 0
    total: int = 0
    average: float = 0.0


class PaginatedReviews(BaseModel):
    items: list[ReviewResponse]
    next_cursor: str | None = None
    histogram: RatingHistogram
