"""Admin user/order management endpoints."""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    bearer,
    create_product,
    register,
    register_admin,
    register_customer,
    register_merchant,
)


@pytest.mark.asyncio
async def test_list_users_returns_all(client):
    admin, _ = await register_admin(client, "adm@e.com")
    await register_customer(client, "u1@e.com")
    await register_merchant(client, "u2@e.com")

    res = await client.get("/api/v1/admin/users", headers=bearer(admin))
    assert res.status_code == 200
    emails = {u["email"] for u in res.json()["items"]}
    assert {"adm@e.com", "u1@e.com", "u2@e.com"} <= emails


@pytest.mark.asyncio
async def test_list_users_role_filter(client):
    admin, _ = await register_admin(client, "adm2@e.com")
    await register_merchant(client, "merch@e.com")

    res = await client.get("/api/v1/admin/users?role=merchant", headers=bearer(admin))
    assert res.status_code == 200
    assert all(u["role"] == "merchant" for u in res.json()["items"])


@pytest.mark.asyncio
async def test_patch_user_role(client):
    admin, _ = await register_admin(client, "adm3@e.com")
    _, target_id = await register_customer(client, "promote@e.com")

    res = await client.patch(
        f"/api/v1/admin/users/{target_id}",
        json={"role": "merchant"},
        headers=bearer(admin),
    )
    assert res.status_code == 200
    assert res.json()["role"] == "merchant"


@pytest.mark.asyncio
async def test_patch_user_deactivate_and_reactivate(client):
    admin, _ = await register_admin(client, "adm4@e.com")
    _, target_id = await register_customer(client, "victim@e.com")

    off = await client.patch(
        f"/api/v1/admin/users/{target_id}",
        json={"is_active": False},
        headers=bearer(admin),
    )
    assert off.status_code == 200
    assert off.json()["deleted_at"] is not None

    on = await client.patch(
        f"/api/v1/admin/users/{target_id}",
        json={"is_active": True},
        headers=bearer(admin),
    )
    assert on.json()["deleted_at"] is None


@pytest.mark.asyncio
async def test_admin_cannot_deactivate_self(client):
    admin, admin_id = await register_admin(client, "adm5@e.com")
    res = await client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"is_active": False},
        headers=bearer(admin),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_patch_unknown_user_404(client):
    admin, _ = await register_admin(client, "adm6@e.com")
    res = await client.patch(
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000000",
        json={"role": "customer"},
        headers=bearer(admin),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_admin_endpoints_require_admin(client):
    token, _ = await register_customer(client, "notadmin@e.com")
    assert (await client.get("/api/v1/admin/users", headers=bearer(token))).status_code == 403
    assert (await client.get("/api/v1/admin/orders", headers=bearer(token))).status_code == 403


@pytest.mark.asyncio
async def test_admin_orders_lists_all(client):
    admin, _ = await register_admin(client, "adm7@e.com")
    merchant, _ = await register_merchant(client, "m@e.com")
    product = await create_product(client, merchant, title="Buy", stock=5)
    customer, _ = await register_customer(client, "buyer@e.com")
    await add_to_cart(client, customer, product["id"], qty=1)
    await client.post(
        "/api/v1/orders/checkout",
        json={"shipping_address": {"line1": "1 St", "city": "K", "postal_code": "0", "country": "PK"}},
        headers=bearer(customer),
    )

    res = await client.get("/api/v1/admin/orders", headers=bearer(admin))
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1
