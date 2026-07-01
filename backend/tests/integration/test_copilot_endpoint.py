"""POST /merchant/copilot — end-to-end with a scripted fake LLM."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus
from app.services.copilot import LLMBlock, LLMResponse, set_llm

from tests.integration.helpers import bearer, create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


def _script(*responses):
    calls = {"i": 0}

    async def _turn(messages, tools):
        r = responses[calls["i"]]
        calls["i"] += 1
        return r

    return _turn


async def _seed_delivered_order(product_id, customer_id, unit_price, qty):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            ts = datetime.now(timezone.utc)
            order = Order(
                customer_id=customer_id, status=OrderStatus.delivered,
                total_amount=Decimal(unit_price) * qty,
                shipping_address={"line1": "1 X", "city": "K", "postal_code": "0", "country": "PK"},
                created_at=ts, updated_at=ts,
            )
            db.add(order)
            await db.flush()
            db.add(OrderItem(order_id=order.id, product_id=product_id, quantity=qty, unit_price=Decimal(unit_price)))
            await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_copilot_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-cp-role@e.com")
    res = await client.post("/api/v1/merchant/copilot", json={"question": "hi"}, headers=bearer(ctoken))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_copilot_rejects_empty_question(client):
    mtoken, _ = await register_merchant(client, "m-cp-empty@e.com")
    res = await client.post("/api/v1/merchant/copilot", json={"question": "   "}, headers=bearer(mtoken))
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_copilot_happy_path_with_tool_call(client):
    mtoken, _ = await register_merchant(client, "m-cp-happy@e.com")
    _, cid = await register_customer(client, "c-cp-happy@e.com")
    p = await create_product(client, mtoken, title="HappyWidget", price="10.00")
    await _seed_delivered_order(p["id"], cid, "10.00", 4)

    set_llm(_script(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="get_revenue_summary", input={"period_days": 30})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="Your 30-day revenue was $40.00.")]),
    ))
    res = await client.post("/api/v1/merchant/copilot", json={"question": "revenue last 30 days?"}, headers=bearer(mtoken))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["answer"] == "Your 30-day revenue was $40.00."
    assert body["tool_calls"][0]["tool"] == "get_revenue_summary"
    assert Decimal(body["tool_calls"][0]["result"]["revenue"]) == Decimal("40.00")


@pytest.mark.asyncio
async def test_copilot_isolation_between_merchants(client):
    m1, _ = await register_merchant(client, "m-cp-iso-a@e.com")
    m2, _ = await register_merchant(client, "m-cp-iso-b@e.com")
    _, cid = await register_customer(client, "c-cp-iso@e.com")
    # Only merchant 1 has revenue.
    p1 = await create_product(client, m1, title="IsoA", price="50.00")
    await _seed_delivered_order(p1["id"], cid, "50.00", 2)

    # Merchant 2 asks the same revenue question; the tool runs scoped to m2.
    set_llm(_script(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="get_revenue_summary", input={"period_days": 30})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="done")]),
    ))
    res = await client.post("/api/v1/merchant/copilot", json={"question": "my revenue?"}, headers=bearer(m2))
    assert res.status_code == 200
    # Merchant 2 sees zero — never merchant 1's $100.
    assert Decimal(res.json()["tool_calls"][0]["result"]["revenue"]) == Decimal("0")
