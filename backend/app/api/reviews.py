"""Product reviews.

Write rules:
- Only customers can post a review.
- Customer must have a *delivered* order containing the product.
- One review per (customer, product) — enforced by uq_review_product_customer.

Read rules:
- Public. Anyone can list reviews for a product (no auth required).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.core.pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    apply_cursor,
    build_page,
    encode_cursor,
    resolve_page_size,
)
from app.models.models import (
    Order,
    OrderItem,
    OrderStatus,
    Product,
    Review,
    User,
    UserRole,
)
from app.schemas.review import (
    PaginatedReviews,
    RatingHistogram,
    ReviewCreate,
    ReviewResponse,
    ReviewUpdate,
)

router = APIRouter(tags=["reviews"])


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


def _cursor_for(r: Review) -> str:
    return encode_cursor(r.created_at, r.id)


async def _rating_histogram(db: AsyncSession, product_id: str) -> RatingHistogram:
    counts = await db.execute(
        select(
            func.count(case((Review.rating == 1, 1))).label("one"),
            func.count(case((Review.rating == 2, 1))).label("two"),
            func.count(case((Review.rating == 3, 1))).label("three"),
            func.count(case((Review.rating == 4, 1))).label("four"),
            func.count(case((Review.rating == 5, 1))).label("five"),
            func.count(Review.id).label("total"),
            func.coalesce(func.avg(Review.rating), 0).label("avg"),
        ).where(Review.product_id == product_id)
    )
    row = counts.first()
    return RatingHistogram(
        one=row.one, two=row.two, three=row.three, four=row.four, five=row.five,
        total=row.total, average=round(float(row.avg), 2),
    )


# ---------------------------------------------------------------------------
# GET /products/{product_id}/reviews — public, paginated + histogram
# ---------------------------------------------------------------------------
@router.get("/products/{product_id}/reviews", response_model=PaginatedReviews)
async def list_product_reviews(
    product_id: UUID,
    request: Request,
    cursor: str | None = Query(default=None),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
):
    pid = str(product_id)
    product = (await db.execute(
        select(Product.id).where(Product.id == pid, Product.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not product:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product not found", request.url.path)

    page_size = resolve_page_size(page_size)
    stmt = select(Review).where(Review.product_id == pid)
    stmt = apply_cursor(stmt, Review.created_at, Review.id, cursor, page_size)
    rows = (await db.execute(stmt)).scalars().all()
    items, next_cursor = build_page(rows, page_size, _cursor_for)

    histogram = await _rating_histogram(db, pid)
    return PaginatedReviews(
        items=[ReviewResponse.model_validate(r) for r in items],
        next_cursor=next_cursor,
        histogram=histogram,
    )


# ---------------------------------------------------------------------------
# POST /products/{product_id}/reviews — customer w/ delivered order only
# ---------------------------------------------------------------------------
@router.post(
    "/products/{product_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_review(
    product_id: UUID,
    body: ReviewCreate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.customer)),
    db: AsyncSession = Depends(get_db),
):
    pid = str(product_id)
    product = (await db.execute(
        select(Product.id).where(Product.id == pid, Product.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not product:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product not found", request.url.path)

    # Must have a delivered order containing this product
    has_delivered = (await db.execute(
        select(OrderItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            OrderItem.product_id == pid,
            Order.customer_id == current_user.id,
            Order.status == OrderStatus.delivered,
        )
        .limit(1)
    )).scalar_one_or_none()
    if not has_delivered:
        raise _problem(
            status.HTTP_403_FORBIDDEN, "Forbidden",
            "You can only review products you have received (delivered orders)",
            request.url.path,
        )

    review = Review(
        product_id=pid,
        customer_id=current_user.id,
        rating=body.rating,
        body=body.body,
    )
    db.add(review)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise _problem(
            status.HTTP_409_CONFLICT, "Conflict",
            "You have already reviewed this product", request.url.path,
        )
    return ReviewResponse.model_validate(review)


# ---------------------------------------------------------------------------
# PATCH /reviews/{review_id} — owner only
# ---------------------------------------------------------------------------
@router.patch("/reviews/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: UUID,
    body: ReviewUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.customer)),
    db: AsyncSession = Depends(get_db),
):
    review = (await db.execute(
        select(Review).where(Review.id == str(review_id))
    )).scalar_one_or_none()
    if not review:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Review not found", request.url.path)

    if review.customer_id != current_user.id:
        raise _problem(status.HTTP_403_FORBIDDEN, "Forbidden", "Not your review", request.url.path)

    if body.rating is not None:
        review.rating = body.rating
    if body.body is not None:
        review.body = body.body
    await db.flush()
    return ReviewResponse.model_validate(review)


# ---------------------------------------------------------------------------
# DELETE /reviews/{review_id} — owner or admin
# ---------------------------------------------------------------------------
@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    review = (await db.execute(
        select(Review).where(Review.id == str(review_id))
    )).scalar_one_or_none()
    if not review:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Review not found", request.url.path)

    if review.customer_id != current_user.id and current_user.role != UserRole.admin:
        raise _problem(status.HTTP_403_FORBIDDEN, "Forbidden", "Not your review", request.url.path)

    await db.delete(review)
    await db.flush()
