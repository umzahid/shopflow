"""Review endpoints integration."""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    advance_order_to_delivered,
    bearer,
    checkout,
    create_product,
    register_customer,
    register_merchant,
)


async def _deliver_product_for(client, customer_email: str, merchant_email: str):
    """Return (product_dict, customer_token, merchant_token) with one delivered order."""
    mt, _ = await register_merchant(client, merchant_email)
    p = await create_product(client, mt, stock=10)
    ct, _ = await register_customer(client, customer_email)
    await add_to_cart(client, ct, p["id"])
    order = (await checkout(client, ct)).json()
    await advance_order_to_delivered(client, mt, order["id"])
    return p, ct, mt


@pytest.mark.asyncio
async def test_list_reviews_for_nonexistent_product_404(client):
    res = await client.get("/api/v1/products/00000000-0000-0000-0000-000000000000/reviews")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_list_reviews_empty_with_zero_histogram(client):
    mt, _ = await register_merchant(client, "m1@e.com")
    p = await create_product(client, mt)
    res = await client.get(f"/api/v1/products/{p['id']}/reviews")
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["histogram"]["total"] == 0


@pytest.mark.asyncio
async def test_post_without_delivered_order_403(client):
    mt, _ = await register_merchant(client, "m2@e.com")
    p = await create_product(client, mt)
    ct, _ = await register_customer(client, "c1@e.com")
    res = await client.post(
        f"/api/v1/products/{p['id']}/reviews",
        json={"rating": 5, "body": "love it"},
        headers=bearer(ct),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_post_with_delivered_order_succeeds(client):
    p, ct, _ = await _deliver_product_for(client, "c2@e.com", "m3@e.com")
    res = await client.post(
        f"/api/v1/products/{p['id']}/reviews",
        json={"rating": 4, "body": "good"},
        headers=bearer(ct),
    )
    assert res.status_code == 201
    assert res.json()["rating"] == 4


@pytest.mark.asyncio
async def test_duplicate_review_returns_409(client):
    p, ct, _ = await _deliver_product_for(client, "c3@e.com", "m4@e.com")
    body = {"rating": 4}
    await client.post(f"/api/v1/products/{p['id']}/reviews", json=body, headers=bearer(ct))
    dup = await client.post(f"/api/v1/products/{p['id']}/reviews", json=body, headers=bearer(ct))
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_histogram_reflects_rating(client):
    p, ct, _ = await _deliver_product_for(client, "c4@e.com", "m5@e.com")
    await client.post(
        f"/api/v1/products/{p['id']}/reviews",
        json={"rating": 5}, headers=bearer(ct),
    )
    listing = await client.get(f"/api/v1/products/{p['id']}/reviews")
    h = listing.json()["histogram"]
    assert h["five"] == 1
    assert h["total"] == 1
    assert h["average"] == 5.0


@pytest.mark.asyncio
async def test_owner_can_update_own_review(client):
    p, ct, _ = await _deliver_product_for(client, "c5@e.com", "m6@e.com")
    created = await client.post(
        f"/api/v1/products/{p['id']}/reviews",
        json={"rating": 5}, headers=bearer(ct),
    )
    rid = created.json()["id"]
    res = await client.patch(
        f"/api/v1/reviews/{rid}",
        json={"rating": 2, "body": "actually meh"},
        headers=bearer(ct),
    )
    assert res.status_code == 200
    assert res.json()["rating"] == 2


@pytest.mark.asyncio
async def test_non_owner_cannot_update_review(client):
    p, ct, _ = await _deliver_product_for(client, "c6@e.com", "m7@e.com")
    created = await client.post(
        f"/api/v1/products/{p['id']}/reviews",
        json={"rating": 5}, headers=bearer(ct),
    )
    rid = created.json()["id"]
    other_token, _ = await register_customer(client, "c7@e.com")
    res = await client.patch(
        f"/api/v1/reviews/{rid}",
        json={"rating": 1},
        headers=bearer(other_token),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_owner_can_delete_own_review(client):
    p, ct, _ = await _deliver_product_for(client, "c8@e.com", "m8@e.com")
    created = await client.post(
        f"/api/v1/products/{p['id']}/reviews",
        json={"rating": 5}, headers=bearer(ct),
    )
    rid = created.json()["id"]
    res = await client.delete(f"/api/v1/reviews/{rid}", headers=bearer(ct))
    assert res.status_code == 204
    listing = await client.get(f"/api/v1/products/{p['id']}/reviews")
    assert listing.json()["items"] == []
