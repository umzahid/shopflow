"""GET /products?sort= — price sorting with cursor pagination (PRD §2.2 sort dropdown)."""
import pytest

from tests.integration.helpers import create_product, register_merchant


async def _seed_three(client, tag: str):
    mtoken, _ = await register_merchant(client, f"m-sort-{tag}@e.com")
    await create_product(client, mtoken, title=f"Mid {tag}", price="20.00")
    await create_product(client, mtoken, title=f"Cheap {tag}", price="10.00")
    await create_product(client, mtoken, title=f"Pricey {tag}", price="30.00")


@pytest.mark.asyncio
async def test_sort_price_asc(client):
    await _seed_three(client, "asc")
    res = await client.get("/api/v1/products?sort=price_asc")
    assert res.status_code == 200
    prices = [float(p["price"]) for p in res.json()["items"]]
    assert prices == sorted(prices)


@pytest.mark.asyncio
async def test_sort_price_desc(client):
    await _seed_three(client, "desc")
    res = await client.get("/api/v1/products?sort=price_desc")
    assert res.status_code == 200
    prices = [float(p["price"]) for p in res.json()["items"]]
    assert prices == sorted(prices, reverse=True)


@pytest.mark.asyncio
async def test_sort_price_cursor_pagination_no_dupes_no_gaps(client):
    await _seed_three(client, "page")
    first = await client.get("/api/v1/products?sort=price_asc&page_size=2")
    assert first.status_code == 200
    body = first.json()
    assert len(body["items"]) == 2
    assert body["next_cursor"]

    second = await client.get(
        f"/api/v1/products?sort=price_asc&page_size=2&cursor={body['next_cursor']}"
    )
    assert second.status_code == 200
    ids_first = {p["id"] for p in body["items"]}
    ids_second = {p["id"] for p in second.json()["items"]}
    assert not (ids_first & ids_second)  # no duplicates across pages
    all_prices = [float(p["price"]) for p in body["items"] + second.json()["items"]]
    assert all_prices == sorted(all_prices)  # globally ascending across pages
    assert len(all_prices) == 3


@pytest.mark.asyncio
async def test_default_sort_is_newest(client):
    await _seed_three(client, "def")
    res = await client.get("/api/v1/products")
    assert res.status_code == 200
    items = res.json()["items"]
    created = [p["created_at"] for p in items]
    assert created == sorted(created, reverse=True)  # newest first


@pytest.mark.asyncio
async def test_invalid_sort_rejected(client):
    res = await client.get("/api/v1/products?sort=bogus")
    assert res.status_code == 422
