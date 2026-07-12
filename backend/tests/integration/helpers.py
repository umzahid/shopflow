"""Shared helpers for integration tests — register, login, auth header."""
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import User, UserRole

_TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def register(client: AsyncClient, email: str, password: str = "Password123", role: str = "customer") -> dict:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "role": role},
    )
    assert res.status_code == 201, res.text
    return res.json()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def register_customer(client: AsyncClient, email: str = "c@e.com") -> tuple[str, str]:
    """Return (access_token, user_id)."""
    data = await register(client, email, role="customer")
    return data["access_token"], data["user"]["id"]


async def register_merchant(client: AsyncClient, email: str = "m@e.com") -> tuple[str, str]:
    data = await register(client, email, role="merchant")
    return data["access_token"], data["user"]["id"]


async def register_admin(client: AsyncClient, email: str = "a@e.com") -> tuple[str, str]:
    """Return (access_token, user_id) for an admin.

    Admin is not self-registerable (privilege-escalation guard in auth.register),
    so provision it the way real admins are: create a normal account, promote it
    in the DB, then log in for a token that carries the admin role.
    """
    data = await register(client, email, role="customer")
    user_id = data["user"]["id"]

    engine = create_async_engine(_TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            await db.execute(update(User).where(User.id == user_id).values(role=UserRole.admin))
            await db.commit()
    finally:
        await engine.dispose()

    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "Password123"})
    assert res.status_code == 200, res.text
    return res.json()["access_token"], user_id


async def create_product(
    client: AsyncClient,
    merchant_token: str,
    title: str = "Widget",
    price: str = "10.00",
    stock: int = 100,
    status: str = "active",
) -> dict:
    res = await client.post(
        "/api/v1/products",
        json={"title": title, "price": price, "stock_qty": stock, "status": status},
        headers=bearer(merchant_token),
    )
    assert res.status_code == 201, res.text
    return res.json()


async def add_to_cart(client: AsyncClient, customer_token: str, product_id: str, qty: int = 1) -> dict:
    res = await client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "qty": qty},
        headers=bearer(customer_token),
    )
    assert res.status_code == 201, res.text
    return res.json()


async def checkout(client: AsyncClient, customer_token: str, coupon: str | None = None) -> dict:
    body = {"shipping_address": {"line1": "1 St", "city": "Karachi", "postal_code": "75500", "country": "PK"}}
    if coupon:
        body["coupon_code"] = coupon
    res = await client.post(
        "/api/v1/orders/checkout",
        json=body,
        headers=bearer(customer_token),
    )
    return res


async def advance_order_to_delivered(client: AsyncClient, merchant_token: str, order_id: str) -> None:
    for s in ("confirmed", "shipped", "delivered"):
        res = await client.patch(
            f"/api/v1/orders/{order_id}/status",
            json={"status": s},
            headers=bearer(merchant_token),
        )
        assert res.status_code == 200, f"transition to {s} failed: {res.text}"
