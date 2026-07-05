"""Auth/authorization security checks (PRD §6.5): token tampering, expiry,
and cross-merchant isolation."""
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.core.config import settings
from tests.integration.helpers import bearer, create_product, register_customer, register_merchant


@pytest.mark.asyncio
async def test_tampered_token_is_rejected(client):
    token, _ = await register_customer(client, "tamper@e.com")
    # Flip the last char of the signature — signature no longer verifies.
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    res = await client.get("/api/v1/users/me", headers=bearer(tampered))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_is_rejected(client):
    _, user_id = await register_customer(client, "expired@e.com")
    expired = jwt.encode(
        {
            "sub": user_id,
            "role": "customer",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    res = await client.get("/api/v1/users/me", headers=bearer(expired))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_token_signed_with_wrong_key_is_rejected(client):
    _, user_id = await register_customer(client, "wrongkey@e.com")
    forged = jwt.encode(
        {
            "sub": user_id,
            "role": "admin",  # privilege-escalation attempt
            "type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        "not-the-real-secret",
        algorithm=settings.JWT_ALGORITHM,
    )
    res = await client.get("/api/v1/admin/users", headers=bearer(forged))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_missing_token_on_protected_route(client):
    assert (await client.get("/api/v1/users/me")).status_code == 401


@pytest.mark.asyncio
async def test_customer_cannot_reach_merchant_or_admin_endpoints(client):
    token, _ = await register_customer(client, "justcustomer@e.com")
    assert (await client.get("/api/v1/merchant/dashboard", headers=bearer(token))).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=bearer(token))).status_code == 403


@pytest.mark.asyncio
async def test_merchant_cannot_modify_another_merchants_product(client):
    a_token, _ = await register_merchant(client, "sec-a@e.com")
    product = await create_product(client, a_token, title="A's Product")

    b_token, _ = await register_merchant(client, "sec-b@e.com")
    patch = await client.patch(
        f"/api/v1/products/{product['id']}",
        json={"price": "1.00"},
        headers=bearer(b_token),
    )
    assert patch.status_code in (403, 404)
    delete = await client.delete(f"/api/v1/products/{product['id']}", headers=bearer(b_token))
    assert delete.status_code in (403, 404)
