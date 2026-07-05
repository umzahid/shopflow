"""Public AI product summary endpoint."""
import pytest

from tests.integration.helpers import bearer, create_product, register_merchant


@pytest.mark.asyncio
async def test_product_summary_public(client):
    merchant, _ = await register_merchant(client, "sum@e.com")
    product = await create_product(client, merchant, title="Ceramic Mug")

    # Public — no auth header.
    res = await client.get(f"/api/v1/products/{product['id']}/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["product_id"] == product["id"]
    assert "Ceramic Mug" in body["summary"]


@pytest.mark.asyncio
async def test_product_summary_unknown_404(client):
    res = await client.get("/api/v1/products/00000000-0000-0000-0000-000000000000/summary")
    assert res.status_code == 404
