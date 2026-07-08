"""_gather_week_stats — week-over-week bundle, tested directly (no endpoint)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.merchant import _gather_week_stats
from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus

from tests.integration.helpers import bearer, create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


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


async def _stats_for(merchant_id: str) -> dict:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            return await _gather_week_stats(db, merchant_id)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_stats_split_this_vs_prior_week(client):
    mtoken, mid = await register_merchant(client, "m-stats-split@e.com")
    _, cid = await register_customer(client, "c-stats-split@e.com")
    prod = await create_product(client, mtoken, title="Mug", price="10.00")
    await _seed_order(prod["id"], cid, "10.00", 5, days_ago=2)   # this week: 50
    await _seed_order(prod["id"], cid, "10.00", 3, days_ago=10)  # prior week: 30

    stats = await _stats_for(mid)
    assert Decimal(stats["revenue_this_week"]) == Decimal("50.00")
    assert Decimal(stats["revenue_prior_week"]) == Decimal("30.00")
    assert stats["top_products"][0]["title"] == "Mug"


@pytest.mark.asyncio
async def test_stats_merchant_isolation(client):
    ma, mida = await register_merchant(client, "m-stats-a@e.com")
    mb, midb = await register_merchant(client, "m-stats-b@e.com")
    _, cid = await register_customer(client, "c-stats-a@e.com")
    pa = await create_product(client, ma, title="AlphaOnly", price="10.00")
    await _seed_order(pa["id"], cid, "10.00", 2, days_ago=1)

    stats_b = await _stats_for(midb)
    assert Decimal(stats_b["revenue_this_week"]) == Decimal("0")
    assert [p["title"] for p in stats_b["top_products"]] == []
