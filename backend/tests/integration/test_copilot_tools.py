"""Merchant-scoped Copilot tool handlers (real DB)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus, Product, User
from app.services import copilot

from tests.integration.helpers import create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _seed_delivered_order(product_id: str, customer_id: str, unit_price: str, qty: int) -> None:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            ts = datetime.now(timezone.utc)
            order = Order(
                customer_id=customer_id,
                status=OrderStatus.delivered,
                total_amount=Decimal(unit_price) * qty,
                shipping_address={"line1": "1 X", "city": "K", "postal_code": "0", "country": "PK"},
                created_at=ts,
                updated_at=ts,
            )
            db.add(order)
            await db.flush()
            db.add(OrderItem(order_id=order.id, product_id=product_id, quantity=qty, unit_price=Decimal(unit_price)))
            await db.commit()
    finally:
        await engine.dispose()


async def _run(handler_name, mid, args):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            merchant = (await db.execute(select(User).where(User.id == mid))).scalar_one()
            return await copilot.TOOL_HANDLERS[handler_name](db, merchant, args)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_all_tools_registered():
    for name in ["get_revenue_summary", "get_top_products", "get_order_stats",
                 "find_products", "get_product_forecast", "get_restock_alerts"]:
        assert name in copilot.TOOL_HANDLERS
    names = {t["name"] for t in copilot.TOOL_DEFS}
    assert names == set(copilot.TOOL_HANDLERS)


@pytest.mark.asyncio
async def test_revenue_summary_scoped_to_merchant(client):
    mtoken, mid = await register_merchant(client, "m-cp-rev@e.com")
    _, cid = await register_customer(client, "c-cp-rev@e.com")
    p = await create_product(client, mtoken, title="Rev Widget", price="10.00")
    await _seed_delivered_order(p["id"], cid, "10.00", 3)

    result = await _run("get_revenue_summary", mid, {"period_days": 30})
    assert Decimal(result["revenue"]) == Decimal("30.00")


@pytest.mark.asyncio
async def test_find_products_returns_only_own_catalog(client):
    m1, mid1 = await register_merchant(client, "m-cp-find-a@e.com")
    m2, _ = await register_merchant(client, "m-cp-find-b@e.com")
    await create_product(client, m1, title="Alpha Gadget")
    await create_product(client, m2, title="Alpha Gizmo")  # other merchant

    result = await _run("find_products", mid1, {"query": "Alpha"})
    titles = [p["title"] for p in result["products"]]
    assert titles == ["Alpha Gadget"]


@pytest.mark.asyncio
async def test_forecast_rejects_foreign_product(client):
    m1, _ = await register_merchant(client, "m-cp-fc-a@e.com")
    m2, mid2 = await register_merchant(client, "m-cp-fc-b@e.com")
    p = await create_product(client, m1, title="Not Yours")

    result = await _run("get_product_forecast", mid2, {"product_id": p["id"], "horizon_days": 14})
    assert "error" in result


@pytest.mark.asyncio
async def test_restock_alerts_runs(client):
    mtoken, mid = await register_merchant(client, "m-cp-ra@e.com")
    await create_product(client, mtoken, title="Stocked", stock=1000)
    result = await _run("get_restock_alerts", mid, {"lead_time_days": 7})
    assert "alerts" in result
