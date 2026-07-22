"""Product endpoints integration."""
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Category

from tests.integration.helpers import (
    add_to_cart,
    advance_order_to_delivered,
    bearer,
    checkout,
    create_product,
    register_customer,
    register_merchant,
)

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _seed_category(name: str, slug: str) -> str:
    """Categories have no write API — seed directly like other DB-only fixtures."""
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            cat = Category(name=name, slug=slug)
            db.add(cat)
            await db.commit()
            return cat.id
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_list_products_empty(client):
    res = await client.get("/api/v1/products")
    assert res.status_code == 200
    assert res.json()["items"] == []


@pytest.mark.asyncio
async def test_merchant_can_create_product(client):
    token, _ = await register_merchant(client, "m1@e.com")
    res = await client.post(
        "/api/v1/products",
        json={"title": "Widget", "price": "10.00", "stock_qty": 5, "status": "active"},
        headers=bearer(token),
    )
    assert res.status_code == 201
    assert res.json()["title"] == "Widget"


@pytest.mark.asyncio
async def test_customer_cannot_create_product(client):
    token, _ = await register_customer(client, "c1@e.com")
    res = await client.post(
        "/api/v1/products",
        json={"title": "X", "price": "1.00"},
        headers=bearer(token),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_anonymous_cannot_create_product(client):
    res = await client.post("/api/v1/products", json={"title": "X", "price": "1.00"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_product_by_id(client):
    token, _ = await register_merchant(client, "m2@e.com")
    p = await create_product(client, token, title="One")
    res = await client.get(f"/api/v1/products/{p['id']}")
    assert res.status_code == 200
    assert res.json()["title"] == "One"


@pytest.mark.asyncio
async def test_get_product_404(client):
    res = await client.get("/api/v1/products/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_only_active_products_appear_in_list(client):
    token, _ = await register_merchant(client, "m3@e.com")
    await create_product(client, token, title="Draft", status="draft")
    await create_product(client, token, title="Active", status="active")
    res = await client.get("/api/v1/products")
    titles = [p["title"] for p in res.json()["items"]]
    assert "Active" in titles
    assert "Draft" not in titles


@pytest.mark.asyncio
async def test_merchant_can_patch_own_product(client):
    token, _ = await register_merchant(client, "m4@e.com")
    p = await create_product(client, token, title="Original")
    res = await client.patch(
        f"/api/v1/products/{p['id']}",
        json={"title": "Renamed"},
        headers=bearer(token),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Renamed"


@pytest.mark.asyncio
async def test_merchant_cannot_patch_other_merchants_product(client):
    t1, _ = await register_merchant(client, "m5@e.com")
    p = await create_product(client, t1)
    t2, _ = await register_merchant(client, "m6@e.com")
    res = await client.patch(
        f"/api/v1/products/{p['id']}",
        json={"title": "Stolen"},
        headers=bearer(t2),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_soft_delete_hides_product_from_list(client):
    token, _ = await register_merchant(client, "m7@e.com")
    p = await create_product(client, token, title="To Delete")
    res = await client.delete(f"/api/v1/products/{p['id']}", headers=bearer(token))
    assert res.status_code == 204
    listing = await client.get("/api/v1/products")
    assert all(it["id"] != p["id"] for it in listing.json()["items"])


@pytest.mark.asyncio
async def test_price_filter(client):
    token, _ = await register_merchant(client, "m8@e.com")
    await create_product(client, token, title="Cheap", price="5.00")
    await create_product(client, token, title="Expensive", price="500.00")
    res = await client.get("/api/v1/products?price_max=10")
    titles = [p["title"] for p in res.json()["items"]]
    assert "Cheap" in titles
    assert "Expensive" not in titles


@pytest.mark.asyncio
async def test_list_rejects_bad_cursor(client):
    res = await client.get("/api/v1/products?cursor=!!!not-a-cursor!!!")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_categories_endpoint_lists_sorted(client):
    assert (await client.get("/api/v1/categories")).json() == []
    await _seed_category("Pottery", "pottery")
    await _seed_category("Apparel", "apparel")
    res = await client.get("/api/v1/categories")
    assert res.status_code == 200
    assert [c["slug"] for c in res.json()] == ["apparel", "pottery"]


@pytest.mark.asyncio
async def test_category_slug_filter(client):
    cat_id = await _seed_category("Pottery", "pottery")
    token, _ = await register_merchant(client, "mcat@e.com")
    p = await create_product(client, token, title="Vase")
    await create_product(client, token, title="Socks")
    res = await client.patch(
        f"/api/v1/products/{p['id']}",
        json={"category_id": cat_id},
        headers=bearer(token),
    )
    assert res.status_code == 200
    res = await client.get("/api/v1/products?category_slug=pottery")
    assert [i["title"] for i in res.json()["items"]] == ["Vase"]


@pytest.mark.asyncio
async def test_rating_min_filter(client):
    mt, _ = await register_merchant(client, "mrate@e.com")
    good = await create_product(client, mt, title="Good")
    bad = await create_product(client, mt, title="Bad")
    await create_product(client, mt, title="Unrated")

    ct, _ = await register_customer(client, "crate@e.com")
    for product, rating in ((good, 5), (bad, 2)):
        await add_to_cart(client, ct, product["id"])
        order = (await checkout(client, ct)).json()
        await advance_order_to_delivered(client, mt, order["id"])
        res = await client.post(
            f"/api/v1/products/{product['id']}/reviews",
            json={"rating": rating, "body": "review"},
            headers=bearer(ct),
        )
        assert res.status_code == 201, res.text

    res = await client.get("/api/v1/products?rating_min=4")
    assert res.status_code == 200
    # Low-rated and never-reviewed products are both excluded by the floor.
    assert [i["title"] for i in res.json()["items"]] == ["Good"]

    all_titles = {i["title"] for i in (await client.get("/api/v1/products")).json()["items"]}
    assert all_titles == {"Good", "Bad", "Unrated"}


@pytest.mark.asyncio
async def test_list_includes_avg_rating(client):
    mt, _ = await register_merchant(client, "mavg@e.com")
    rated = await create_product(client, mt, title="Rated")
    await create_product(client, mt, title="Unrated")

    # Two customers so the product carries a non-trivial average (5 and 4 → 4.5).
    for email, rating in (("cavg1@e.com", 5), ("cavg2@e.com", 4)):
        ct, _ = await register_customer(client, email)
        await add_to_cart(client, ct, rated["id"])
        order = (await checkout(client, ct)).json()
        await advance_order_to_delivered(client, mt, order["id"])
        res = await client.post(
            f"/api/v1/products/{rated['id']}/reviews",
            json={"rating": rating, "body": "review"},
            headers=bearer(ct),
        )
        assert res.status_code == 201, res.text

    items = {i["title"]: i for i in (await client.get("/api/v1/products")).json()["items"]}
    # Same shape the detail page's histogram uses: float rounded to 2 places;
    # None (not 0) distinguishes "no reviews yet" from a genuinely low rating.
    assert items["Rated"]["avg_rating"] == 4.5
    assert items["Unrated"]["avg_rating"] is None
