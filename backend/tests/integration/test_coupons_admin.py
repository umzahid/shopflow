"""Admin coupon management + redemption at checkout."""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    bearer,
    create_product,
    register_admin,
    register_customer,
    register_merchant,
)


async def _checkout_with_coupon(client, token, code):
    return await client.post(
        "/api/v1/orders/checkout",
        json={
            "shipping_address": {"line1": "1 St", "city": "K", "postal_code": "0", "country": "PK"},
            "coupon_code": code,
        },
        headers=bearer(token),
    )


@pytest.mark.asyncio
async def test_admin_creates_and_lists_coupon(client):
    admin, _ = await register_admin(client, "ca1@e.com")
    res = await client.post(
        "/api/v1/admin/coupons",
        json={"code": "WELCOME10", "discount_type": "percentage", "value": 10},
        headers=bearer(admin),
    )
    assert res.status_code == 201
    assert res.json()["code"] == "WELCOME10"

    listed = await client.get("/api/v1/admin/coupons", headers=bearer(admin))
    assert listed.status_code == 200
    assert any(c["code"] == "WELCOME10" for c in listed.json())


@pytest.mark.asyncio
async def test_duplicate_code_conflicts(client):
    admin, _ = await register_admin(client, "ca2@e.com")
    body = {"code": "DUP", "discount_type": "flat", "value": 5}
    assert (await client.post("/api/v1/admin/coupons", json=body, headers=bearer(admin))).status_code == 201
    assert (await client.post("/api/v1/admin/coupons", json=body, headers=bearer(admin))).status_code == 409


@pytest.mark.asyncio
async def test_coupons_require_admin(client):
    token, _ = await register_customer(client, "notadmin-c@e.com")
    assert (await client.get("/api/v1/admin/coupons", headers=bearer(token))).status_code == 403
    assert (
        await client.post(
            "/api/v1/admin/coupons",
            json={"code": "X", "discount_type": "flat", "value": 1},
            headers=bearer(token),
        )
    ).status_code == 403


@pytest.mark.asyncio
async def test_redemption_applies_discount_and_enforces_usage_limit(client):
    admin, _ = await register_admin(client, "ca3@e.com")
    await client.post(
        "/api/v1/admin/coupons",
        json={"code": "ONCE", "discount_type": "percentage", "value": 10, "usage_limit": 1},
        headers=bearer(admin),
    )
    merchant, _ = await register_merchant(client, "cmr@e.com")
    product = await create_product(client, merchant, title="C-Item", price="100.00", stock=10)

    buyer1, _ = await register_customer(client, "b1@e.com")
    await add_to_cart(client, buyer1, product["id"], qty=1)
    first = await _checkout_with_coupon(client, buyer1, "ONCE")
    assert first.status_code == 201
    assert first.json()["discount_amount"] == "10.00"

    # Second redemption exceeds usage_limit=1 → rejected.
    buyer2, _ = await register_customer(client, "b2@e.com")
    await add_to_cart(client, buyer2, product["id"], qty=1)
    second = await _checkout_with_coupon(client, buyer2, "ONCE")
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_deactivated_coupon_cannot_be_redeemed(client):
    admin, _ = await register_admin(client, "ca4@e.com")
    created = await client.post(
        "/api/v1/admin/coupons",
        json={"code": "GONE", "discount_type": "flat", "value": 5},
        headers=bearer(admin),
    )
    coupon_id = created.json()["id"]
    assert (await client.delete(f"/api/v1/admin/coupons/{coupon_id}", headers=bearer(admin))).status_code == 204

    merchant, _ = await register_merchant(client, "cmr2@e.com")
    product = await create_product(client, merchant, title="C2", price="20.00", stock=5)
    buyer, _ = await register_customer(client, "b3@e.com")
    await add_to_cart(client, buyer, product["id"], qty=1)
    res = await _checkout_with_coupon(client, buyer, "GONE")
    assert res.status_code == 400
