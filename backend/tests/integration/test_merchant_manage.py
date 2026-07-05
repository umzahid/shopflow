"""Merchant product/order management endpoints (GET /merchant/products,
GET /merchant/orders)."""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    bearer,
    create_product,
    register_customer,
    register_merchant,
)


@pytest.mark.asyncio
async def test_merchant_products_returns_all_statuses(client):
    """Unlike public /products (active-only), the merchant view shows drafts
    and archived products so the whole catalog is manageable."""
    token, _ = await register_merchant(client, "mm1@e.com")
    await create_product(client, token, title="Active One", status="active")
    await create_product(client, token, title="Draft One", status="draft")
    await create_product(client, token, title="Archived One", status="archived")

    res = await client.get("/api/v1/merchant/products", headers=bearer(token))
    assert res.status_code == 200
    statuses = sorted(p["status"] for p in res.json()["items"])
    assert statuses == ["active", "archived", "draft"]


@pytest.mark.asyncio
async def test_merchant_products_status_filter(client):
    token, _ = await register_merchant(client, "mm2@e.com")
    await create_product(client, token, title="A", status="active")
    await create_product(client, token, title="D", status="draft")

    res = await client.get("/api/v1/merchant/products?status=draft", headers=bearer(token))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] == "draft"


@pytest.mark.asyncio
async def test_merchant_products_scoped_to_owner(client):
    """A merchant never sees another merchant's products."""
    mine, _ = await register_merchant(client, "mine@e.com")
    theirs, _ = await register_merchant(client, "theirs@e.com")
    await create_product(client, mine, title="Mine", status="active")
    await create_product(client, theirs, title="Theirs", status="active")

    res = await client.get("/api/v1/merchant/products", headers=bearer(mine))
    titles = [p["title"] for p in res.json()["items"]]
    assert titles == ["Mine"]


@pytest.mark.asyncio
async def test_merchant_products_requires_merchant_role(client):
    token, _ = await register_customer(client, "cust@e.com")
    res = await client.get("/api/v1/merchant/products", headers=bearer(token))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_merchant_orders_lists_orders_with_own_products(client):
    merchant, _ = await register_merchant(client, "mo1@e.com")
    product = await create_product(client, merchant, title="Buyable", stock=10)

    customer, _ = await register_customer(client, "buyer@e.com")
    await add_to_cart(client, customer, product["id"], qty=1)
    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"shipping_address": {"line1": "1 St", "city": "K", "postal_code": "0", "country": "PK"}},
        headers=bearer(customer),
    )
    assert checkout.status_code == 201, checkout.text

    res = await client.get("/api/v1/merchant/orders", headers=bearer(merchant))
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1


@pytest.mark.asyncio
async def test_merchant_orders_excludes_other_merchants_orders(client):
    """An order for merchant A's product must not appear for merchant B."""
    merchant_a, _ = await register_merchant(client, "ma@e.com")
    merchant_b, _ = await register_merchant(client, "mb@e.com")
    product_a = await create_product(client, merchant_a, title="A-Prod", stock=10)

    customer, _ = await register_customer(client, "buyer2@e.com")
    await add_to_cart(client, customer, product_a["id"], qty=1)
    await client.post(
        "/api/v1/orders/checkout",
        json={"shipping_address": {"line1": "1 St", "city": "K", "postal_code": "0", "country": "PK"}},
        headers=bearer(customer),
    )

    res = await client.get("/api/v1/merchant/orders", headers=bearer(merchant_b))
    assert res.status_code == 200
    assert res.json()["items"] == []


@pytest.mark.asyncio
async def test_merchant_orders_requires_merchant_role(client):
    token, _ = await register_customer(client, "cust2@e.com")
    res = await client.get("/api/v1/merchant/orders", headers=bearer(token))
    assert res.status_code == 403
