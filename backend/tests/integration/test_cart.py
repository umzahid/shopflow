"""Cart endpoints integration."""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    bearer,
    create_product,
    register_customer,
    register_merchant,
)


@pytest.mark.asyncio
async def test_empty_cart_returns_empty_response(client):
    token, _ = await register_customer(client, "c1@e.com")
    res = await client.get("/api/v1/cart", headers=bearer(token))
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["subtotal"] == "0"


@pytest.mark.asyncio
async def test_merchant_cannot_use_cart(client):
    token, _ = await register_merchant(client, "m1@e.com")
    res = await client.get("/api/v1/cart", headers=bearer(token))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_add_item_increments_subtotal(client):
    mt, _ = await register_merchant(client, "m2@e.com")
    p = await create_product(client, mt, price="10.00", stock=5)
    ct, _ = await register_customer(client, "c2@e.com")
    res = await add_to_cart(client, ct, p["id"], qty=2)
    assert res["subtotal"] == "20.00"


@pytest.mark.asyncio
async def test_add_item_exceeding_stock_returns_409(client):
    mt, _ = await register_merchant(client, "m3@e.com")
    p = await create_product(client, mt, stock=2)
    ct, _ = await register_customer(client, "c3@e.com")
    res = await client.post(
        "/api/v1/cart/items",
        json={"product_id": p["id"], "qty": 999},
        headers=bearer(ct),
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_add_to_nonexistent_product_404(client):
    ct, _ = await register_customer(client, "c4@e.com")
    res = await client.post(
        "/api/v1/cart/items",
        json={"product_id": "00000000-0000-0000-0000-000000000000", "qty": 1},
        headers=bearer(ct),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_clear_cart_removes_all_items(client):
    mt, _ = await register_merchant(client, "m4@e.com")
    p = await create_product(client, mt)
    ct, _ = await register_customer(client, "c5@e.com")
    await add_to_cart(client, ct, p["id"])
    res = await client.delete("/api/v1/cart", headers=bearer(ct))
    assert res.status_code == 204
    after = await client.get("/api/v1/cart", headers=bearer(ct))
    assert after.json()["items"] == []


@pytest.mark.asyncio
async def test_patch_item_to_zero_removes_it(client):
    mt, _ = await register_merchant(client, "m5@e.com")
    p = await create_product(client, mt)
    ct, _ = await register_customer(client, "c6@e.com")
    await add_to_cart(client, ct, p["id"])
    res = await client.patch(
        f"/api/v1/cart/items/{p['id']}",
        json={"qty": 0},
        headers=bearer(ct),
    )
    assert res.status_code == 200
    assert res.json()["items"] == []
