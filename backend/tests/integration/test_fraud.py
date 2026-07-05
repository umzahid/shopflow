"""Checkout fraud scoring (Week 6 LightGBM track).

Uses the deterministic heuristic scorer wired in via the session-scoped
`_use_fake_fraud_scorer` conftest fixture — no trained artifact needed.
"""
import pytest

from tests.integration.helpers import (
    add_to_cart,
    bearer,
    checkout,
    create_product,
    register_admin,
    register_customer,
    register_merchant,
)


@pytest.mark.asyncio
async def test_normal_checkout_is_not_flagged(client):
    mtoken, _ = await register_merchant(client, "m-fraud-ok@e.com")
    ctoken, _ = await register_customer(client, "c-fraud-ok@e.com")
    product = await create_product(client, mtoken, title="Cheap Mug", price="10.00", stock=50)

    await add_to_cart(client, ctoken, product["id"], qty=1)
    res = await checkout(client, ctoken)

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["fraud_score"] is not None
    assert float(body["fraud_score"]) < 0.5


@pytest.mark.asyncio
async def test_high_value_new_account_is_flagged(client):
    mtoken, _ = await register_merchant(client, "m-fraud-flag@e.com")
    ctoken, _ = await register_customer(client, "c-fraud-flag@e.com")
    # A brand-new account buying a very expensive item — compounds new-account
    # risk with high order value, which the scorer flags.
    product = await create_product(client, mtoken, title="Gold Bar", price="2000.00", stock=5)

    await add_to_cart(client, ctoken, product["id"], qty=1)
    res = await checkout(client, ctoken)

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "pending_review"
    assert float(body["fraud_score"]) >= 0.5
    assert body["fraud_reasons"]
    assert "Unusually high order value" in body["fraud_reasons"]


@pytest.mark.asyncio
async def test_flagged_order_visible_to_admin_by_status_filter(client):
    mtoken, _ = await register_merchant(client, "m-fraud-admin@e.com")
    ctoken, _ = await register_customer(client, "c-fraud-admin@e.com")
    atoken, _ = await register_admin(client, "a-fraud-admin@e.com")
    product = await create_product(client, mtoken, title="Diamond", price="2500.00", stock=3)

    await add_to_cart(client, ctoken, product["id"], qty=1)
    checkout_res = await checkout(client, ctoken)
    assert checkout_res.status_code == 201
    order_id = checkout_res.json()["id"]

    res = await client.get(
        "/api/v1/orders?status=pending_review", headers=bearer(atoken)
    )
    assert res.status_code == 200
    ids = [o["id"] for o in res.json()["items"]]
    assert order_id in ids
    flagged = next(o for o in res.json()["items"] if o["id"] == order_id)
    assert flagged["fraud_reasons"]


@pytest.mark.asyncio
async def test_fraud_score_persisted_on_get_order(client):
    mtoken, _ = await register_merchant(client, "m-fraud-get@e.com")
    ctoken, _ = await register_customer(client, "c-fraud-get@e.com")
    product = await create_product(client, mtoken, title="Notebook", price="12.00", stock=20)

    await add_to_cart(client, ctoken, product["id"], qty=2)
    order_id = (await checkout(client, ctoken)).json()["id"]

    res = await client.get(f"/api/v1/orders/{order_id}", headers=bearer(ctoken))
    assert res.status_code == 200
    body = res.json()
    assert body["fraud_score"] is not None
    # fraud_reasons is always a list (possibly empty for clean orders)
    assert isinstance(body["fraud_reasons"], list)
