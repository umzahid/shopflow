from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.models.models import Category, Product, ProductStatus, User, UserRole
from app.schemas.product import (
    PaginatedProducts,
    ProductCreate,
    ProductResponse,
    ProductSearchResult,
    ProductUpdate,
)

router = APIRouter(prefix="/products", tags=["products"])


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


def _cursor_for(product: Product) -> str:
    return encode_cursor(product.created_at, product.id)


# ---------------------------------------------------------------------------
# /products/search — must be declared BEFORE /products/{product_id} so FastAPI
# doesn't route "search" as a product id.
# ---------------------------------------------------------------------------

@router.get("/search", response_model=list[ProductSearchResult])
async def search_products(
    q: str = Query(min_length=1, max_length=255),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Full-text search over title + description. Returns up to `limit` active
    products ranked by tsvector relevance. Semantic search arrives in Week 5
    via the embedding column; this endpoint is the lexical baseline.
    """
    tsv = func.to_tsvector(
        "english",
        func.coalesce(Product.title, "") + " " + func.coalesce(Product.description, ""),
    )
    tsq = func.plainto_tsquery("english", q)
    score = func.ts_rank(tsv, tsq).label("score")

    stmt = (
        select(Product, score)
        .where(
            tsv.op("@@")(tsq),
            Product.deleted_at.is_(None),
            Product.status == ProductStatus.active,
        )
        .order_by(score.desc(), Product.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        ProductSearchResult(
            **ProductResponse.model_validate(p).model_dump(),
            relevance_score=float(s),
        )
        for p, s in rows
    ]


# ---------------------------------------------------------------------------
# /products — list with cursor pagination and filters
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedProducts)
async def list_products(
    request: Request,
    cursor: str | None = Query(default=None),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    category_slug: str | None = Query(default=None),
    price_min: Decimal | None = Query(default=None, ge=0),
    price_max: Decimal | None = Query(default=None, ge=0),
    merchant_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    page_size = resolve_page_size(page_size)

    stmt = select(Product).where(
        Product.deleted_at.is_(None),
        Product.status == ProductStatus.active,
    )

    if category_slug:
        stmt = stmt.join(Category, Category.id == Product.category_id).where(
            Category.slug == category_slug,
        )
    if price_min is not None:
        stmt = stmt.where(Product.price >= price_min)
    if price_max is not None:
        stmt = stmt.where(Product.price <= price_max)
    if merchant_id is not None:
        stmt = stmt.where(Product.merchant_id == str(merchant_id))

    stmt = apply_cursor(stmt, Product.created_at, Product.id, cursor, page_size)
    rows = (await db.execute(stmt)).scalars().all()
    items, next_cursor = build_page(rows, page_size, _cursor_for)
    return PaginatedProducts(
        items=[ProductResponse.model_validate(p) for p in items],
        next_cursor=next_cursor,
    )


# ---------------------------------------------------------------------------
# /products/{product_id} — read
# ---------------------------------------------------------------------------

@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.id == str(product_id), Product.deleted_at.is_(None))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product not found", request.url.path)
    return ProductResponse.model_validate(product)


# ---------------------------------------------------------------------------
# POST /products — merchant only
# ---------------------------------------------------------------------------

@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    product = Product(
        merchant_id=current_user.id,
        title=body.title,
        description=body.description,
        price=body.price,
        stock_qty=body.stock_qty,
        images=list(body.images),
        category_id=body.category_id,
        status=body.status,
    )
    db.add(product)
    await db.flush()
    await db.refresh(product)
    return ProductResponse.model_validate(product)


# ---------------------------------------------------------------------------
# PATCH /products/{product_id} — owner only
# ---------------------------------------------------------------------------

@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    body: ProductUpdate,
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.id == str(product_id), Product.deleted_at.is_(None))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product not found", request.url.path)
    if product.merchant_id != current_user.id:
        raise _problem(status.HTTP_403_FORBIDDEN, "Forbidden", "You do not own this product", request.url.path)

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(product, field, value)

    await db.flush()
    await db.refresh(product)
    return ProductResponse.model_validate(product)


# ---------------------------------------------------------------------------
# DELETE /products/{product_id} — soft delete, owner only
# ---------------------------------------------------------------------------

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product).where(Product.id == str(product_id), Product.deleted_at.is_(None))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product not found", request.url.path)
    if product.merchant_id != current_user.id:
        raise _problem(status.HTTP_403_FORBIDDEN, "Forbidden", "You do not own this product", request.url.path)

    product.deleted_at = func.now()
    await db.flush()
