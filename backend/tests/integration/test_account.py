"""Customer account endpoints: profile, saved addresses, own reviews."""
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Product, Review
from tests.integration.helpers import (
    bearer,
    create_product,
    register_customer,
    register_merchant,
)

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"

ADDR = {
    "label": "Home",
    "line1": "1 Test St",
    "city": "Islamabad",
    "postal_code": "44000",
    "country": "PK",
}


@pytest.mark.asyncio
async def test_get_me(client):
    token, _ = await register_customer(client, "me@e.com")
    res = await client.get("/api/v1/users/me", headers=bearer(token))
    assert res.status_code == 200
    assert res.json()["email"] == "me@e.com"


@pytest.mark.asyncio
async def test_update_email(client):
    token, _ = await register_customer(client, "old@e.com")
    res = await client.patch("/api/v1/users/me", json={"email": "new@e.com"}, headers=bearer(token))
    assert res.status_code == 200
    assert res.json()["email"] == "new@e.com"


@pytest.mark.asyncio
async def test_update_email_conflict(client):
    await register_customer(client, "taken@e.com")
    token, _ = await register_customer(client, "mine@e.com")
    res = await client.patch("/api/v1/users/me", json={"email": "taken@e.com"}, headers=bearer(token))
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_password_change_requires_correct_current(client):
    token, _ = await register_customer(client, "pw@e.com")
    bad = await client.patch(
        "/api/v1/users/me",
        json={"current_password": "wrong", "new_password": "Newpass123"},
        headers=bearer(token),
    )
    assert bad.status_code == 400

    ok = await client.patch(
        "/api/v1/users/me",
        json={"current_password": "Password123", "new_password": "Newpass123"},
        headers=bearer(token),
    )
    assert ok.status_code == 200
    # New password works for login.
    login = await client.post("/api/v1/auth/login", json={"email": "pw@e.com", "password": "Newpass123"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_address_crud(client):
    token, _ = await register_customer(client, "addr@e.com")

    created = await client.post("/api/v1/users/me/addresses", json={**ADDR, "is_default": True}, headers=bearer(token))
    assert created.status_code == 201
    addr_id = created.json()["id"]

    listed = await client.get("/api/v1/users/me/addresses", headers=bearer(token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    updated = await client.patch(
        f"/api/v1/users/me/addresses/{addr_id}", json={"city": "Lahore"}, headers=bearer(token)
    )
    assert updated.status_code == 200
    assert updated.json()["city"] == "Lahore"

    deleted = await client.delete(f"/api/v1/users/me/addresses/{addr_id}", headers=bearer(token))
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/users/me/addresses", headers=bearer(token))).json() == []


@pytest.mark.asyncio
async def test_only_one_default_address(client):
    token, _ = await register_customer(client, "def@e.com")
    a = await client.post("/api/v1/users/me/addresses", json={**ADDR, "is_default": True}, headers=bearer(token))
    await client.post("/api/v1/users/me/addresses", json={**ADDR, "label": "Work", "is_default": True}, headers=bearer(token))
    rows = (await client.get("/api/v1/users/me/addresses", headers=bearer(token))).json()
    defaults = [r for r in rows if r["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["label"] == "Work"
    # The first address is no longer default.
    assert not next(r for r in rows if r["id"] == a.json()["id"])["is_default"]


@pytest.mark.asyncio
async def test_cannot_touch_another_users_address(client):
    owner, _ = await register_customer(client, "owner@e.com")
    created = await client.post("/api/v1/users/me/addresses", json=ADDR, headers=bearer(owner))
    addr_id = created.json()["id"]

    intruder, _ = await register_customer(client, "intruder@e.com")
    assert (await client.patch(f"/api/v1/users/me/addresses/{addr_id}", json={"city": "X"}, headers=bearer(intruder))).status_code == 404
    assert (await client.delete(f"/api/v1/users/me/addresses/{addr_id}", headers=bearer(intruder))).status_code == 404


@pytest.mark.asyncio
async def test_my_reviews(client):
    merchant, _ = await register_merchant(client, "rm@e.com")
    product = await create_product(client, merchant, title="Reviewed Thing")
    customer, customer_id = await register_customer(client, "reviewer@e.com")

    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            db.add(Review(product_id=product["id"], customer_id=customer_id, rating=5, body="Great!"))
            await db.commit()
    finally:
        await engine.dispose()

    res = await client.get("/api/v1/users/me/reviews", headers=bearer(customer))
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["product_title"] == "Reviewed Thing"
    assert items[0]["rating"] == 5
