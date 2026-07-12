"""Merchant forecast + restock-alerts endpoints (Week 5 Prophet track)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus, Product

from tests.integration.helpers import bearer, create_product, register_customer, register_merchant


TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _seed_daily_sales(product_id: str, customer_id: str, unit_price: str, days: int, per_day: int) -> None:
    """Insert `days` days of orders (backdated), `per_day` units per day."""
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            today = datetime.now(timezone.utc)
            for offset in range(days):
                ts = today - timedelta(days=offset)
                order = Order(
                    customer_id=customer_id,
                    status=OrderStatus.delivered,
                    total_amount=Decimal(unit_price) * per_day,
                    shipping_address={
                        "line1": "1 X",
                        "city": "K",
                        "postal_code": "0",
                        "country": "PK",
                    },
                    created_at=ts,
                    updated_at=ts,
                )
                db.add(order)
                await db.flush()
                db.add(
                    OrderItem(
                        order_id=order.id,
                        product_id=product_id,
                        quantity=per_day,
                        unit_price=Decimal(unit_price),
                    )
                )
            await db.commit()
    finally:
        await engine.dispose()


async def _set_stock(product_id: str, stock: int) -> None:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            product = (
                await db.execute(select(Product).where(Product.id == product_id))
            ).scalar_one()
            product.stock_qty = stock
            await db.commit()
    finally:
        await engine.dispose()


# ── /merchant/products/{id}/forecast ────────────────────────────────────────

@pytest.mark.asyncio
async def test_forecast_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "cust-fc@e.com")
    res = await client.get(
        "/api/v1/merchant/products/00000000-0000-0000-0000-000000000000/forecast",
        headers=bearer(ctoken),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_forecast_404_for_missing_product(client):
    mtoken, _ = await register_merchant(client, "m-fc-404@e.com")
    res = await client.get(
        "/api/v1/merchant/products/00000000-0000-0000-0000-000000000000/forecast",
        headers=bearer(mtoken),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_forecast_rejects_non_uuid_product(client):
    # Non-UUID product id must 422, not 500 from a bad uuid cast (authenticated
    # ZAP scan hit this on the merchant surface).
    mtoken, _ = await register_merchant(client, "m-fc-uuid@e.com")
    res = await client.get(
        "/api/v1/merchant/products/not-a-uuid/forecast", headers=bearer(mtoken)
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_forecast_403_for_other_merchants_product(client):
    m1, _ = await register_merchant(client, "m-fc-a@e.com")
    m2, _ = await register_merchant(client, "m-fc-b@e.com")
    p = await create_product(client, m1, title="Rival")
    res = await client.get(
        f"/api/v1/merchant/products/{p['id']}/forecast",
        headers=bearer(m2),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_forecast_empty_when_no_history(client):
    mtoken, _ = await register_merchant(client, "m-fc-empty@e.com")
    p = await create_product(client, mtoken, title="No History")
    res = await client.get(
        f"/api/v1/merchant/products/{p['id']}/forecast?horizon=14",
        headers=bearer(mtoken),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["product_id"] == p["id"]
    assert body["horizon_days"] == 14
    assert body["points"] == []


@pytest.mark.asyncio
async def test_forecast_returns_horizon_points_with_history(client):
    mtoken, mid = await register_merchant(client, "m-fc-hist@e.com")
    _, cid = await register_customer(client, "c-fc-hist@e.com")
    p = await create_product(client, mtoken, title="With History")

    await _seed_daily_sales(p["id"], cid, unit_price="10.00", days=30, per_day=2)

    res = await client.get(
        f"/api/v1/merchant/products/{p['id']}/forecast?horizon=14",
        headers=bearer(mtoken),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["horizon_days"] == 14
    assert len(body["points"]) == 14
    # Fake forecaster returns mean(last 14 days) = 2, bands ±20%.
    p0 = body["points"][0]
    assert p0["yhat"] == pytest.approx(2.0, abs=0.01)
    assert p0["yhat_lower"] == pytest.approx(1.6, abs=0.01)
    assert p0["yhat_upper"] == pytest.approx(2.4, abs=0.01)


# ── /merchant/restock-alerts ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_restock_alerts_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "cust-ra@e.com")
    res = await client.get("/api/v1/merchant/restock-alerts", headers=bearer(ctoken))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_restock_alerts_empty_when_stock_ample(client):
    mtoken, _ = await register_merchant(client, "m-ra-ok@e.com")
    _, cid = await register_customer(client, "c-ra-ok@e.com")
    p = await create_product(client, mtoken, title="Ample", stock=1000)

    await _seed_daily_sales(p["id"], cid, unit_price="10.00", days=30, per_day=2)

    res = await client.get(
        "/api/v1/merchant/restock-alerts?lead_time=7",
        headers=bearer(mtoken),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["lead_time_days"] == 7
    assert body["alerts"] == []


@pytest.mark.asyncio
async def test_restock_alert_fires_when_demand_exceeds_stock(client):
    mtoken, _ = await register_merchant(client, "m-ra-low@e.com")
    _, cid = await register_customer(client, "c-ra-low@e.com")
    p = await create_product(client, mtoken, title="Low", stock=100)

    # 30 days of 5 units/day → forecast projects ~5/day forward. Stock of 3
    # will run out in <1 day at that rate.
    await _seed_daily_sales(p["id"], cid, unit_price="10.00", days=30, per_day=5)
    await _set_stock(p["id"], 3)

    res = await client.get(
        "/api/v1/merchant/restock-alerts?lead_time=7",
        headers=bearer(mtoken),
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["alerts"]) == 1
    alert = body["alerts"][0]
    assert alert["product_id"] == p["id"]
    assert alert["current_stock"] == 3
    # 7 days × 5/day = 35 predicted units; shortfall = 32.
    assert alert["predicted_demand_units"] == pytest.approx(35.0, abs=0.5)
    assert alert["shortfall_units"] == pytest.approx(32.0, abs=0.5)
    assert alert["days_until_stockout"] == 1


@pytest.mark.asyncio
async def test_restock_alerts_sorted_by_shortfall(client):
    mtoken, _ = await register_merchant(client, "m-ra-sort@e.com")
    _, cid = await register_customer(client, "c-ra-sort@e.com")
    p_small = await create_product(client, mtoken, title="Small Shortfall", stock=30)
    p_big = await create_product(client, mtoken, title="Big Shortfall", stock=5)

    await _seed_daily_sales(p_small["id"], cid, unit_price="10.00", days=30, per_day=5)
    await _seed_daily_sales(p_big["id"], cid, unit_price="10.00", days=30, per_day=5)

    res = await client.get(
        "/api/v1/merchant/restock-alerts?lead_time=7",
        headers=bearer(mtoken),
    )
    assert res.status_code == 200
    alerts = res.json()["alerts"]
    assert len(alerts) == 2
    # 7×5=35 units; big has stock 5 (shortfall 30), small has stock 30 (shortfall 5).
    assert alerts[0]["title"] == "Big Shortfall"
    assert alerts[1]["title"] == "Small Shortfall"
    assert alerts[0]["shortfall_units"] > alerts[1]["shortfall_units"]
