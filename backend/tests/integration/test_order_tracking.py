"""GET /orders/{id}/tracking — timeline + access control."""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    bearer,
    create_product,
    register_customer,
    register_merchant,
)


async def _place_order(client) -> tuple[str, str]:
    """Returns (customer_token, order_id)."""
    merchant, _ = await register_merchant(client, "trk-m@e.com")
    product = await create_product(client, merchant, title="Trackable", stock=5)
    customer, _ = await register_customer(client, "trk-c@e.com")
    await add_to_cart(client, customer, product["id"], qty=1)
    checkout = await client.post(
        "/api/v1/orders/checkout",
        json={"shipping_address": {"line1": "1 St", "city": "K", "postal_code": "0", "country": "PK"}},
        headers=bearer(customer),
    )
    assert checkout.status_code == 201, checkout.text
    return customer, checkout.json()["id"]


@pytest.mark.asyncio
async def test_tracking_returns_timeline(client):
    customer, order_id = await _place_order(client)
    res = await client.get(f"/api/v1/orders/{order_id}/tracking", headers=bearer(customer))
    assert res.status_code == 200
    body = res.json()
    assert body["order_id"] == order_id
    assert body["tracking_number"].startswith("SF")
    assert body["carrier"]
    assert len(body["timeline"]) >= 4
    # First stage (order placed) is always reached.
    assert body["timeline"][0]["reached"] is True


@pytest.mark.asyncio
async def test_tracking_forbidden_for_other_customer(client):
    _, order_id = await _place_order(client)
    other, _ = await register_customer(client, "trk-other@e.com")
    res = await client.get(f"/api/v1/orders/{order_id}/tracking", headers=bearer(other))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_tracking_unknown_order_404(client):
    customer, _ = await _place_order(client)
    res = await client.get(
        "/api/v1/orders/00000000-0000-0000-0000-000000000000/tracking",
        headers=bearer(customer),
    )
    assert res.status_code == 404
