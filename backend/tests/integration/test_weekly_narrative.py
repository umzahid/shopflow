"""POST /merchant/weekly-narrative — endpoint, cache, isolation. Fake narrator."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus
from app.services import narrative as nsvc

from tests.integration.helpers import bearer, create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


@pytest.fixture(autouse=True)
def _restore_narrator():
    yield
    nsvc.set_narrator(None)


async def _seed_order(product_id, customer_id, unit_price, qty, days_ago):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            ts = datetime.now(timezone.utc) - timedelta(days=days_ago)
            order = Order(
                customer_id=customer_id, status=OrderStatus.delivered,
                total_amount=Decimal(unit_price) * qty,
                shipping_address={"line1": "1 X", "city": "K", "postal_code": "0", "country": "PK"},
                created_at=ts, updated_at=ts,
            )
            db.add(order)
            await db.flush()
            db.add(OrderItem(order_id=order.id, product_id=product_id, quantity=qty, unit_price=Decimal(unit_price)))
            await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-narr-role@e.com")
    res = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(ctoken))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_empty_store_returns_quiet_week(client):
    mtoken, _ = await register_merchant(client, "m-narr-empty@e.com")
    nsvc.set_narrator(nsvc._fake_narrate)  # explicit fake — CI sets no env toggle
    res = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mtoken))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["narrative"]
    assert body["cached"] is False


@pytest.mark.asyncio
async def test_cache_hit_then_refresh(client):
    mtoken, _ = await register_merchant(client, "m-narr-cache@e.com")
    nsvc.set_narrator(nsvc._fake_narrate)
    first = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mtoken))
    assert first.json()["cached"] is False
    second = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mtoken))
    assert second.json()["cached"] is True
    assert second.json()["generated_at"] == first.json()["generated_at"]
    refreshed = await client.post(
        "/api/v1/merchant/weekly-narrative?refresh=true", headers=bearer(mtoken)
    )
    assert refreshed.json()["cached"] is False


@pytest.mark.asyncio
async def test_merchant_isolation(client):
    ma, mida = await register_merchant(client, "m-narr-a@e.com")
    mb, midb = await register_merchant(client, "m-narr-b@e.com")
    ca, cida = await register_customer(client, "c-narr-a@e.com")
    pa = await create_product(client, ma, title="AlphaOnly", price="10.00")
    await _seed_order(pa["id"], cida, "10.00", 2, days_ago=1)

    captured = {}

    async def spy(stats):
        captured.update(stats)
        return "ok", []

    nsvc.set_narrator(spy)
    res = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mb))
    assert res.status_code == 200
    titles = [p["title"] for p in captured["top_products"]]
    assert "AlphaOnly" not in titles  # B never sees A's product
