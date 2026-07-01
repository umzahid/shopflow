"""Search modes: lexical (tsvector), semantic (pgvector), hybrid (weighted)."""
import pytest

from tests.integration.helpers import bearer, create_product, register_merchant


@pytest.mark.asyncio
async def test_lexical_search_finds_by_token(client):
    token, _ = await register_merchant(client, "s1@e.com")
    await create_product(client, token, title="Red Running Shoes")
    await create_product(client, token, title="Blue Coffee Mug")

    res = await client.get("/api/v1/products/search?q=running&mode=lexical")
    assert res.status_code == 200
    titles = [p["title"] for p in res.json()]
    assert "Red Running Shoes" in titles
    assert "Blue Coffee Mug" not in titles


@pytest.mark.asyncio
async def test_lexical_search_ignores_drafts_and_deleted(client):
    token, _ = await register_merchant(client, "s2@e.com")
    active = await create_product(client, token, title="Widget Deluxe", status="active")
    await create_product(client, token, title="Widget Beta", status="draft")
    deleted = await create_product(client, token, title="Widget Zombie", status="active")
    await client.delete(f"/api/v1/products/{deleted['id']}", headers=bearer(token))

    res = await client.get("/api/v1/products/search?q=widget&mode=lexical")
    assert res.status_code == 200
    ids = [p["id"] for p in res.json()]
    assert active["id"] in ids
    assert deleted["id"] not in ids
    assert all(p["status"] == "active" for p in res.json())


@pytest.mark.asyncio
async def test_semantic_search_returns_self_at_top(client):
    """With the deterministic hash encoder, encode(q) == encode(product_text)
    when q matches the canonical product text — so the product ranks first
    with similarity ≈ 1.0. Other products have unrelated vectors."""
    token, _ = await register_merchant(client, "s3@e.com")
    match = await create_product(client, token, title="alpha")
    await create_product(client, token, title="beta")
    await create_product(client, token, title="gamma")

    res = await client.get("/api/v1/products/search?q=alpha&mode=semantic&limit=3")
    assert res.status_code == 200
    body = res.json()
    assert body, "expected at least one result"
    assert body[0]["id"] == match["id"]
    assert body[0]["relevance_score"] == pytest.approx(1.0, abs=1e-4)


@pytest.mark.asyncio
async def test_semantic_search_populates_relevance_score(client):
    token, _ = await register_merchant(client, "s4@e.com")
    await create_product(client, token, title="single")

    res = await client.get("/api/v1/products/search?q=single&mode=semantic")
    assert res.status_code == 200
    scored = res.json()
    assert scored and "relevance_score" in scored[0]
    assert isinstance(scored[0]["relevance_score"], float)


@pytest.mark.asyncio
async def test_hybrid_default_mode(client):
    """Default mode is hybrid — response shape is the same as any other mode."""
    token, _ = await register_merchant(client, "s5@e.com")
    await create_product(client, token, title="Wireless Headphones")

    res = await client.get("/api/v1/products/search?q=wireless")
    assert res.status_code == 200
    body = res.json()
    assert body and body[0]["title"] == "Wireless Headphones"
    assert body[0]["relevance_score"] > 0


@pytest.mark.asyncio
async def test_hybrid_includes_lexical_only_matches(client):
    """A lexical-only match (no strong embedding similarity) should still
    surface in hybrid, driven by the tsvector branch of the OR filter."""
    token, _ = await register_merchant(client, "s6@e.com")
    lexical_hit = await create_product(
        client, token, title="Standard Item", price="12.00"
    )
    # Give the query enough token overlap to hit tsvector
    res = await client.get("/api/v1/products/search?q=standard&mode=hybrid")
    assert res.status_code == 200
    ids = [p["id"] for p in res.json()]
    assert lexical_hit["id"] in ids


@pytest.mark.asyncio
async def test_search_rejects_invalid_mode(client):
    res = await client.get("/api/v1/products/search?q=x&mode=wat")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_search_rejects_empty_query(client):
    res = await client.get("/api/v1/products/search?q=&mode=lexical")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_search_limit_respected(client):
    token, _ = await register_merchant(client, "s7@e.com")
    for i in range(5):
        await create_product(client, token, title=f"limit-item-{i}")

    res = await client.get("/api/v1/products/search?q=limit&mode=lexical&limit=2")
    assert res.status_code == 200
    assert len(res.json()) <= 2


@pytest.mark.asyncio
async def test_create_populates_embedding(client):
    """POST /products should set embedding automatically; PATCH on title/desc
    should refresh it, PATCH on unrelated fields should leave it alone."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import settings
    from app.models.models import Product

    token, _ = await register_merchant(client, "s8@e.com")
    p = await create_product(client, token, title="Initial")

    test_url = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"
    engine = create_async_engine(test_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        result = await db.execute(select(Product).where(Product.id == p["id"]))
        product = result.scalar_one()
        original_embedding = list(product.embedding)
        assert len(original_embedding) == 384

    # PATCH price only — embedding should not change
    await client.patch(
        f"/api/v1/products/{p['id']}",
        json={"price": "99.00"},
        headers=bearer(token),
    )
    async with Session() as db:
        result = await db.execute(select(Product).where(Product.id == p["id"]))
        product = result.scalar_one()
        assert list(product.embedding) == original_embedding

    # PATCH title — embedding should change
    await client.patch(
        f"/api/v1/products/{p['id']}",
        json={"title": "Completely Different"},
        headers=bearer(token),
    )
    async with Session() as db:
        result = await db.execute(select(Product).where(Product.id == p["id"]))
        product = result.scalar_one()
        assert list(product.embedding) != original_embedding

    await engine.dispose()
