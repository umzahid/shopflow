"""POST /webhooks/payment — signed mock-Stripe webhook."""
import hashlib
import hmac
import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderStatus
from tests.integration.helpers import register_customer

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


def _sign(body: bytes) -> str:
    return hmac.new(settings.WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


async def _seed_pending_order(customer_id: str) -> str:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            order = Order(
                customer_id=customer_id,
                status=OrderStatus.pending,
                total_amount=10,
                shipping_address={"line1": "1 St", "city": "K", "postal_code": "0", "country": "PK"},
                discount_amount=0,
            )
            db.add(order)
            await db.commit()
            return order.id
    finally:
        await engine.dispose()


async def _order_status(order_id: str) -> str:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            o = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one()
            return o.status.value
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_valid_signature_confirms_pending_order(client):
    _, customer_id = await register_customer(client, "wh-c@e.com")
    order_id = await _seed_pending_order(customer_id)

    body = json.dumps({"type": "payment.succeeded", "data": {"order_id": order_id}}).encode()
    res = await client.post(
        "/api/v1/webhooks/payment",
        content=body,
        headers={"X-Webhook-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "confirmed"
    assert await _order_status(order_id) == "confirmed"


@pytest.mark.asyncio
async def test_payment_failed_cancels_pending_order(client):
    _, customer_id = await register_customer(client, "wh-c2@e.com")
    order_id = await _seed_pending_order(customer_id)

    body = json.dumps({"type": "payment.failed", "data": {"order_id": order_id}}).encode()
    res = await client.post(
        "/api/v1/webhooks/payment",
        content=body,
        headers={"X-Webhook-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_bad_signature_rejected(client):
    _, customer_id = await register_customer(client, "wh-c3@e.com")
    order_id = await _seed_pending_order(customer_id)
    body = json.dumps({"type": "payment.succeeded", "data": {"order_id": order_id}}).encode()

    res = await client.post(
        "/api/v1/webhooks/payment",
        content=body,
        headers={"X-Webhook-Signature": "deadbeef", "Content-Type": "application/json"},
    )
    assert res.status_code == 401
    # Order untouched.
    assert await _order_status(order_id) == "pending"


@pytest.mark.asyncio
async def test_missing_signature_rejected(client):
    body = json.dumps({"type": "payment.succeeded", "data": {"order_id": "x"}}).encode()
    res = await client.post(
        "/api/v1/webhooks/payment",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_unknown_event_acknowledged(client):
    _, customer_id = await register_customer(client, "wh-c4@e.com")
    order_id = await _seed_pending_order(customer_id)
    body = json.dumps({"type": "payment.refunded", "data": {"order_id": order_id}}).encode()

    res = await client.post(
        "/api/v1/webhooks/payment",
        content=body,
        headers={"X-Webhook-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert res.status_code == 200
    assert res.json().get("ignored") is True
    assert await _order_status(order_id) == "pending"


@pytest.mark.asyncio
async def test_valid_signature_unknown_order_404(client):
    body = json.dumps(
        {"type": "payment.succeeded", "data": {"order_id": "00000000-0000-0000-0000-000000000000"}}
    ).encode()
    res = await client.post(
        "/api/v1/webhooks/payment",
        content=body,
        headers={"X-Webhook-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert res.status_code == 404
