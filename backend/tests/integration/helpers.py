"""Shared helpers for integration tests — register, login, auth header."""
from httpx import AsyncClient


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
    data = await register(client, email, role="admin")
    return data["access_token"], data["user"]["id"]


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
