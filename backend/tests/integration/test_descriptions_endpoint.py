"""POST /merchant/generate-description — end-to-end with a fake generator."""
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Product
from app.services.descriptions import set_generator

from tests.integration.helpers import bearer, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _product_count() -> int:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            return (await db.execute(select(func.count(Product.id)))).scalar() or 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_generate_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-desc-role@e.com")
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "Widget"},
        headers=bearer(ctoken),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_generate_rejects_empty_title(client):
    mtoken, _ = await register_merchant(client, "m-desc-empty@e.com")
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "   "},
        headers=bearer(mtoken),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_generate_happy_path_returns_variants(client):
    mtoken, _ = await register_merchant(client, "m-desc-happy@e.com")

    async def _three(req):
        return [f"desc-1 {req.title}", "desc-2", "desc-3"]

    set_generator(_three)
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "Aluminum Bottle", "tone": "luxury", "length": "long",
              "key_features": ["1L", "insulated"]},
        headers=bearer(mtoken),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["variants"]) == 3
    assert body["variants"][0] == "desc-1 Aluminum Bottle"


@pytest.mark.asyncio
async def test_generate_is_stateless_no_product_created(client):
    mtoken, _ = await register_merchant(client, "m-desc-stateless@e.com")

    async def _three(req):
        return ["a", "b", "c"]

    set_generator(_three)
    before = await _product_count()
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "Nothing Persisted"},
        headers=bearer(mtoken),
    )
    assert res.status_code == 200
    after = await _product_count()
    assert after == before  # endpoint never creates a product row
