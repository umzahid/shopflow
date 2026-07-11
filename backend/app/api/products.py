import asyncio
from decimal import Decimal
from typing import Literal
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
from app.models.models import Category, Product, ProductStatus, Review, User, UserRole
from app.schemas.product import (
    PaginatedProducts,
    ProductCreate,
    ProductResponse,
    ProductSearchResult,
    ProductSummaryResponse,
    ProductUpdate,
)
from app.services.embedding import embed_product_text, encode_query
from app.services.summary import summarize_product

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


# Price-sorted listing uses its own cursor scheme (price|id) — the shared
# pagination helper is hard-wired to (created_at, id) and every other list
# endpoint depends on it, so it stays untouched.
def _encode_price_cursor(price: Decimal, id_: str) -> str:
    import base64

    return base64.urlsafe_b64encode(f"{price}|{id_}".encode()).decode().rstrip("=")


def _decode_price_cursor(cursor: str, request: Request) -> tuple[Decimal, str]:
    import base64
    import binascii

    try:
        padding = "=" * (-len(cursor) % 4)
        price_str, id_ = base64.urlsafe_b64decode(cursor + padding).decode().split("|", 1)
        return Decimal(price_str), id_
    except (ValueError, ArithmeticError, binascii.Error, UnicodeDecodeError):
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request",
            "Invalid pagination cursor", request.url.path,
        )


# ---------------------------------------------------------------------------
# /products/search — must be declared BEFORE /products/{product_id} so FastAPI
# doesn't route "search" as a product id.
# ---------------------------------------------------------------------------

# Hybrid ranking weights per the PRD spec: final = 0.7·semantic + 0.3·keyword.
# Semantic drives discovery of meaning-similar items; lexical keeps exact-token
# hits visible.
_LEX_WEIGHT = 0.3
_SEM_WEIGHT = 0.7
# Below this cosine similarity a product is considered unrelated for hybrid
# purposes and won't show up on semantic strength alone.
_SEM_THRESHOLD = 0.3


def _active_product_filters():
    return (Product.deleted_at.is_(None), Product.status == ProductStatus.active)


def _tsv_expr():
    return func.to_tsvector(
        "english",
        func.coalesce(Product.title, "") + " " + func.coalesce(Product.description, ""),
    )


async def _lexical_search(db: AsyncSession, q: str, limit: int):
    tsv = _tsv_expr()
    tsq = func.plainto_tsquery("english", q)
    score = func.ts_rank(tsv, tsq).label("score")
    stmt = (
        select(Product, score)
        .where(tsv.op("@@")(tsq), *_active_product_filters())
        .order_by(score.desc(), Product.created_at.desc())
        .limit(limit)
    )
    return (await db.execute(stmt)).all()


async def _semantic_search(db: AsyncSession, q: str, limit: int):
    # Offload the CPU-bound encode to a worker thread so it never blocks the
    # async event loop (a cache miss would otherwise stall every concurrent
    # request on a single worker). Cache hits return near-instantly.
    qvec = await asyncio.to_thread(encode_query, q)
    distance = Product.embedding.cosine_distance(qvec)
    similarity = (1 - distance).label("score")
    stmt = (
        select(Product, similarity)
        .where(Product.embedding.is_not(None), *_active_product_filters())
        .order_by(distance)
        .limit(limit)
    )
    return (await db.execute(stmt)).all()


async def _hybrid_search(db: AsyncSession, q: str, limit: int):
    tsv = _tsv_expr()
    tsq = func.plainto_tsquery("english", q)
    lex_score = func.ts_rank(tsv, tsq)

    qvec = await asyncio.to_thread(encode_query, q)
    distance = Product.embedding.cosine_distance(qvec)
    sem_score = 1 - distance

    combined = (
        _LEX_WEIGHT * func.coalesce(lex_score, 0.0)
        + _SEM_WEIGHT * func.coalesce(sem_score, 0.0)
    ).label("score")

    stmt = (
        select(Product, combined)
        .where(
            *_active_product_filters(),
            # Keep products that either match lexically OR have a strong
            # enough semantic match. Without the threshold, every product with
            # any embedding would show up in every query.
            tsv.op("@@")(tsq) | (sem_score > _SEM_THRESHOLD),
        )
        .order_by(combined.desc(), Product.created_at.desc())
        .limit(limit)
    )
    return (await db.execute(stmt)).all()


@router.get("/search", response_model=list[ProductSearchResult])
async def search_products(
    q: str = Query(min_length=1, max_length=255),
    limit: int = Query(default=20, ge=1, le=50),
    mode: Literal["lexical", "semantic", "hybrid"] = Query(default="hybrid"),
    db: AsyncSession = Depends(get_db),
):
    """Search products by title + description.

    - `lexical`: Postgres tsvector rank (exact-token match).
    - `semantic`: pgvector cosine similarity on all-MiniLM-L6-v2 embeddings.
    - `hybrid` (default): weighted blend of both, favoring semantic for recall
      and lexical for exact-term precision.
    """
    if mode == "lexical":
        rows = await _lexical_search(db, q, limit)
    elif mode == "semantic":
        rows = await _semantic_search(db, q, limit)
    else:
        rows = await _hybrid_search(db, q, limit)

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
    rating_min: float | None = Query(default=None, ge=1, le=5),
    merchant_id: UUID | None = Query(default=None),
    sort: Literal["newest", "price_asc", "price_desc"] = Query(default="newest"),
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
    if rating_min is not None:
        # NULL averages (no reviews) never satisfy >=, so unrated products are
        # excluded once a rating floor is set — matches marketplace convention.
        avg_rating = (
            select(func.avg(Review.rating))
            .where(Review.product_id == Product.id)
            .correlate(Product)
            .scalar_subquery()
        )
        stmt = stmt.where(avg_rating >= rating_min)
    if merchant_id is not None:
        stmt = stmt.where(Product.merchant_id == str(merchant_id))

    if sort == "newest":
        stmt = apply_cursor(stmt, Product.created_at, Product.id, cursor, page_size)
        rows = (await db.execute(stmt)).scalars().all()
        items, next_cursor = build_page(rows, page_size, _cursor_for)
    else:
        # Price sort: cursor encodes (price, id); id breaks ties on equal prices.
        from sqlalchemy import literal, tuple_

        if cursor:
            c_price, c_id = _decode_price_cursor(cursor, request)
            key = tuple_(Product.price, Product.id)
            # Explicit bind types: id is a native uuid column holding str values —
            # untyped binds go over the wire as varchar and PG has no uuid>varchar.
            after = tuple_(
                literal(c_price, Product.price.type), literal(c_id, Product.id.type)
            )
            stmt = stmt.where(key > after if sort == "price_asc" else key < after)
        order = (
            (Product.price.asc(), Product.id.asc())
            if sort == "price_asc"
            else (Product.price.desc(), Product.id.desc())
        )
        stmt = stmt.order_by(*order).limit(page_size + 1)
        rows = (await db.execute(stmt)).scalars().all()
        items, next_cursor = build_page(
            rows, page_size, lambda p: _encode_price_cursor(p.price, p.id)
        )

    # One aggregate over just this page's ids (≤ page_size) — cheaper than a
    # correlated subquery per row and keeps both cursor branches untouched.
    avg_by_product: dict[str, float] = {}
    if items:
        rating_rows = await db.execute(
            select(Review.product_id, func.avg(Review.rating))
            .where(Review.product_id.in_([p.id for p in items]))
            .group_by(Review.product_id)
        )
        # Same shape as the reviews histogram: float rounded to 2 places.
        avg_by_product = {pid: round(float(avg), 2) for pid, avg in rating_rows}

    responses = []
    for p in items:
        resp = ProductResponse.model_validate(p)
        resp.avg_rating = avg_by_product.get(p.id)
        responses.append(resp)

    return PaginatedProducts(items=responses, next_cursor=next_cursor)


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


@router.get("/{product_id}/summary", response_model=ProductSummaryResponse)
async def get_product_summary(
    product_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """AI-generated one-line summary for the storefront (public). Falls back to
    a deterministic heuristic when no LLM is configured."""
    product = (
        await db.execute(
            select(Product).where(Product.id == str(product_id), Product.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not product:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Product not found", request.url.path)
    return ProductSummaryResponse(
        product_id=product.id,
        summary=summarize_product(product.title, product.description),
    )


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
        embedding=embed_product_text(body.title, body.description),
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
    text_changed = "title" in updates or "description" in updates
    for field, value in updates.items():
        setattr(product, field, value)
    if text_changed:
        product.embedding = embed_product_text(product.title, product.description)

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
