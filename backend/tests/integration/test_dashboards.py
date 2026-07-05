"""Merchant + Admin dashboard integration."""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    advance_order_to_delivered,
    bearer,
    checkout,
    create_product,
    register_admin,
    register_customer,
    register_merchant,
)


@pytest.mark.asyncio
async def test_merchant_dashboard_empty_for_new_merchant(client):
    mt, _ = await register_merchant(client, "m1@e.com")
    res = await client.get("/api/v1/merchant/dashboard", headers=bearer(mt))
    assert res.status_code == 200
    body = res.json()
    assert body["revenue"]["last_7d"] == "0"
    assert body["top_products"] == []


@pytest.mark.asyncio
async def test_merchant_dashboard_includes_delivered_revenue(client):
    mt, _ = await register_merchant(client, "m2@e.com")
    p = await create_product(client, mt, price="50.00", stock=10)
    ct, _ = await register_customer(client, "c1@e.com")
    await add_to_cart(client, ct, p["id"], qty=2)
    order = (await checkout(client, ct)).json()
    await advance_order_to_delivered(client, mt, order["id"])

    res = await client.get("/api/v1/merchant/dashboard", headers=bearer(mt))
    body = res.json()
    assert body["revenue"]["last_7d"] == "100.00"
    assert body["top_products"][0]["title"] == p["title"]
    assert body["top_products"][0]["revenue"] == "100.00"


@pytest.mark.asyncio
async def test_customer_cannot_see_merchant_dashboard(client):
    ct, _ = await register_customer(client, "c2@e.com")
    res = await client.get("/api/v1/merchant/dashboard", headers=bearer(ct))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_revenue_summary_validates_date_range(client):
    mt, _ = await register_merchant(client, "m3@e.com")
    res = await client.get(
        "/api/v1/merchant/revenue-summary?start=2026-06-30&end=2026-06-01",
        headers=bearer(mt),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_revenue_summary_returns_daily_series(client):
    mt, _ = await register_merchant(client, "m4@e.com")
    p = await create_product(client, mt, price="20.00", stock=10)
    ct, _ = await register_customer(client, "c3@e.com")
    await add_to_cart(client, ct, p["id"], qty=2)
    order = (await checkout(client, ct)).json()
    await advance_order_to_delivered(client, mt, order["id"])

    res = await client.get(
        "/api/v1/merchant/revenue-summary?start=2026-01-01&end=2027-01-01",
        headers=bearer(mt),
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["series"]) == 1
    assert body["series"][0]["revenue"] == "40.00"


@pytest.mark.asyncio
async def test_admin_platform_stats(client):
    at, _ = await register_admin(client, "a1@e.com")
    # Add some users
    await register_customer(client, "c4@e.com")
    await register_merchant(client, "m5@e.com")
    res = await client.get("/api/v1/admin/platform-stats", headers=bearer(at))
    assert res.status_code == 200
    body = res.json()
    assert body["total_users"] >= 3  # admin + customer + merchant
    assert body["total_orders"] == 0


@pytest.mark.asyncio
async def test_admin_endpoint_rejects_merchant(client):
    mt, _ = await register_merchant(client, "m6@e.com")
    res = await client.get("/api/v1/admin/platform-stats", headers=bearer(mt))
    assert res.status_code == 403
