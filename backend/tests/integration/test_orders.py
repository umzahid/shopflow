"""Order checkout + state machine integration."""
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.integration.helpers import (
    add_to_cart,
    advance_order_to_delivered,
    bearer,
    checkout,
    create_product,
    register_customer,
    register_merchant,
)


async def _insert_coupon(code: str, percent: int = 10, usage_limit: int | None = None):
    """Seed a coupon directly. The real coupon admin UI is post-Week-2."""
    from app.core.config import settings
    test_url = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"
    engine = create_async_engine(test_url)
    async with engine.begin() as conn:
        await conn.execute(text(
            "INSERT INTO coupons (id, code, discount_type, value, usage_limit, usage_count, is_active) "
            "VALUES (gen_random_uuid(), :code, 'percentage', :pct, :lim, 0, TRUE)"
        ), {"code": code, "pct": percent, "lim": usage_limit})
    await engine.dispose()


@pytest.mark.asyncio
async def test_checkout_empty_cart_returns_400(client):
    ct, _ = await register_customer(client, "c1@e.com")
    res = await checkout(client, ct)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_checkout_creates_order_and_clears_cart(client):
    mt, _ = await register_merchant(client, "m1@e.com")
    p = await create_product(client, mt, price="15.00", stock=10)
    ct, _ = await register_customer(client, "c2@e.com")
    await add_to_cart(client, ct, p["id"], qty=2)
    res = await checkout(client, ct)
    assert res.status_code == 201
    assert res.json()["total_amount"] == "30.00"
    # cart cleared
    after = await client.get("/api/v1/cart", headers=bearer(ct))
    assert after.json()["items"] == []


@pytest.mark.asyncio
async def test_checkout_decrements_stock(client):
    mt, _ = await register_merchant(client, "m2@e.com")
    p = await create_product(client, mt, price="5.00", stock=10)
    ct, _ = await register_customer(client, "c3@e.com")
    await add_to_cart(client, ct, p["id"], qty=3)
    await checkout(client, ct)
    res = await client.get(f"/api/v1/products/{p['id']}")
    assert res.json()["stock_qty"] == 7


@pytest.mark.asyncio
async def test_checkout_invalid_coupon(client):
    mt, _ = await register_merchant(client, "m3@e.com")
    p = await create_product(client, mt)
    ct, _ = await register_customer(client, "c4@e.com")
    await add_to_cart(client, ct, p["id"])
    res = await checkout(client, ct, coupon="NOPE")
    assert res.status_code == 400
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_checkout_with_valid_coupon_applies_discount(client):
    await _insert_coupon("TEST10", percent=10, usage_limit=5)
    mt, _ = await register_merchant(client, "m4@e.com")
    p = await create_product(client, mt, price="100.00", stock=10)
    ct, _ = await register_customer(client, "c5@e.com")
    await add_to_cart(client, ct, p["id"])
    res = await checkout(client, ct, coupon="TEST10")
    assert res.status_code == 201
    assert res.json()["discount_amount"] == "10.00"
    assert res.json()["total_amount"] == "90.00"


@pytest.mark.asyncio
async def test_coupon_usage_limit_blocks_third_use(client):
    await _insert_coupon("LIMIT2", percent=5, usage_limit=2)
    mt, _ = await register_merchant(client, "m5@e.com")
    p = await create_product(client, mt, price="10.00", stock=10)
    ct, _ = await register_customer(client, "c6@e.com")
    for _ in range(2):
        await add_to_cart(client, ct, p["id"])
        res = await checkout(client, ct, coupon="LIMIT2")
        assert res.status_code == 201
    await add_to_cart(client, ct, p["id"])
    res = await checkout(client, ct, coupon="LIMIT2")
    assert res.status_code == 400
    assert "limit" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_order_state_transitions(client):
    mt, _ = await register_merchant(client, "m6@e.com")
    p = await create_product(client, mt)
    ct, _ = await register_customer(client, "c7@e.com")
    await add_to_cart(client, ct, p["id"])
    order = (await checkout(client, ct)).json()
    await advance_order_to_delivered(client, mt, order["id"])
    res = await client.get(f"/api/v1/orders/{order['id']}", headers=bearer(ct))
    assert res.json()["status"] == "delivered"


@pytest.mark.asyncio
async def test_terminal_state_blocks_further_transition(client):
    mt, _ = await register_merchant(client, "m7@e.com")
    p = await create_product(client, mt)
    ct, _ = await register_customer(client, "c8@e.com")
    await add_to_cart(client, ct, p["id"])
    order = (await checkout(client, ct)).json()
    await advance_order_to_delivered(client, mt, order["id"])
    res = await client.patch(
        f"/api/v1/orders/{order['id']}/status",
        json={"status": "cancelled"},
        headers=bearer(mt),
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_customer_only_sees_own_orders(client):
    mt, _ = await register_merchant(client, "m8@e.com")
    p = await create_product(client, mt)
    c1, _ = await register_customer(client, "c9@e.com")
    c2, _ = await register_customer(client, "c10@e.com")
    await add_to_cart(client, c1, p["id"])
    await checkout(client, c1)
    res = await client.get("/api/v1/orders", headers=bearer(c2))
    assert res.status_code == 200
    assert res.json()["items"] == []
