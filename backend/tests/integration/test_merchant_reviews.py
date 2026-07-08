"""GET /merchant/reviews — recent reviews on the merchant's products (scenario 31 surface)."""
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Review

from tests.integration.helpers import bearer, create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _seed_review(product_id: str, customer_id: str, rating: int, body: str):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            db.add(Review(
                product_id=product_id, customer_id=customer_id,
                rating=rating, body=body,
                created_at=datetime.now(timezone.utc),
            ))
            await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-mrev-role@e.com")
    res = await client.get("/api/v1/merchant/reviews", headers=bearer(ctoken))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_lists_reviews_on_own_products_newest_first(client):
    mtoken, _ = await register_merchant(client, "m-mrev@e.com")
    _, cid1 = await register_customer(client, "c-mrev-1@e.com")
    _, cid2 = await register_customer(client, "c-mrev-2@e.com")
    prod = await create_product(client, mtoken, title="Reviewed Mug")
    # one review per customer per product (uq_review_product_customer)
    await _seed_review(prod["id"], cid1, 5, "Lovely glaze.")
    await _seed_review(prod["id"], cid2, 3, "Chipped on arrival.")

    res = await client.get("/api/v1/merchant/reviews", headers=bearer(mtoken))
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert len(items) == 2
    assert items[0]["product_title"] == "Reviewed Mug"
    assert {i["body"] for i in items} == {"Lovely glaze.", "Chipped on arrival."}
    assert all(set(i) >= {"id", "product_id", "product_title", "rating", "body", "created_at"} for i in items)


@pytest.mark.asyncio
async def test_merchant_isolation(client):
    ma, _ = await register_merchant(client, "m-mrev-a@e.com")
    mb, _ = await register_merchant(client, "m-mrev-b@e.com")
    _, cid = await register_customer(client, "c-mrev-iso@e.com")
    pa = await create_product(client, ma, title="A-only product")
    await _seed_review(pa["id"], cid, 4, "Only A should see this.")

    res = await client.get("/api/v1/merchant/reviews", headers=bearer(mb))
    assert res.status_code == 200
    assert res.json()["items"] == []
