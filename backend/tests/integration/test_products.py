"""Product endpoints integration."""
import pytest

from tests.integration.helpers import (
    bearer,
    create_product,
    register_customer,
    register_merchant,
)


@pytest.mark.asyncio
async def test_list_products_empty(client):
    res = await client.get("/api/v1/products")
    assert res.status_code == 200
    assert res.json()["items"] == []


@pytest.mark.asyncio
async def test_merchant_can_create_product(client):
    token, _ = await register_merchant(client, "m1@e.com")
    res = await client.post(
        "/api/v1/products",
        json={"title": "Widget", "price": "10.00", "stock_qty": 5, "status": "active"},
        headers=bearer(token),
    )
    assert res.status_code == 201
    assert res.json()["title"] == "Widget"


@pytest.mark.asyncio
async def test_customer_cannot_create_product(client):
    token, _ = await register_customer(client, "c1@e.com")
    res = await client.post(
        "/api/v1/products",
        json={"title": "X", "price": "1.00"},
        headers=bearer(token),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_anonymous_cannot_create_product(client):
    res = await client.post("/api/v1/products", json={"title": "X", "price": "1.00"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_product_by_id(client):
    token, _ = await register_merchant(client, "m2@e.com")
    p = await create_product(client, token, title="One")
    res = await client.get(f"/api/v1/products/{p['id']}")
    assert res.status_code == 200
    assert res.json()["title"] == "One"


@pytest.mark.asyncio
async def test_get_product_404(client):
    res = await client.get("/api/v1/products/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_only_active_products_appear_in_list(client):
    token, _ = await register_merchant(client, "m3@e.com")
    await create_product(client, token, title="Draft", status="draft")
    await create_product(client, token, title="Active", status="active")
    res = await client.get("/api/v1/products")
    titles = [p["title"] for p in res.json()["items"]]
    assert "Active" in titles
    assert "Draft" not in titles


@pytest.mark.asyncio
async def test_merchant_can_patch_own_product(client):
    token, _ = await register_merchant(client, "m4@e.com")
    p = await create_product(client, token, title="Original")
    res = await client.patch(
        f"/api/v1/products/{p['id']}",
        json={"title": "Renamed"},
        headers=bearer(token),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Renamed"


@pytest.mark.asyncio
async def test_merchant_cannot_patch_other_merchants_product(client):
    t1, _ = await register_merchant(client, "m5@e.com")
    p = await create_product(client, t1)
    t2, _ = await register_merchant(client, "m6@e.com")
    res = await client.patch(
        f"/api/v1/products/{p['id']}",
        json={"title": "Stolen"},
        headers=bearer(t2),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_soft_delete_hides_product_from_list(client):
    token, _ = await register_merchant(client, "m7@e.com")
    p = await create_product(client, token, title="To Delete")
    res = await client.delete(f"/api/v1/products/{p['id']}", headers=bearer(token))
    assert res.status_code == 204
    listing = await client.get("/api/v1/products")
    assert all(it["id"] != p["id"] for it in listing.json()["items"])


@pytest.mark.asyncio
async def test_price_filter(client):
    token, _ = await register_merchant(client, "m8@e.com")
    await create_product(client, token, title="Cheap", price="5.00")
    await create_product(client, token, title="Expensive", price="500.00")
    res = await client.get("/api/v1/products?price_max=10")
    titles = [p["title"] for p in res.json()["items"]]
    assert "Cheap" in titles
    assert "Expensive" not in titles


@pytest.mark.asyncio
async def test_list_rejects_bad_cursor(client):
    res = await client.get("/api/v1/products?cursor=!!!not-a-cursor!!!")
    assert res.status_code == 400
