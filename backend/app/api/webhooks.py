"""Payment webhook (mock Stripe).

Stripe-style signed webhook: the caller sends the raw JSON body plus an
`X-Webhook-Signature` header holding `hex(HMAC-SHA256(body, WEBHOOK_SECRET))`.
We recompute and compare in constant time before trusting the payload — the
body is never parsed until the signature checks out.

Events:
  payment.succeeded { data: { order_id } } -> order pending/pending_review -> confirmed
  payment.failed    { data: { order_id } } -> order pending/pending_review -> cancelled
"""
import hashlib
import hmac
import json

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from fastapi import Depends
from app.models.models import Order, OrderStatus
from app.services.order_state import can_transition

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

SIGNATURE_HEADER = "X-Webhook-Signature"


def _problem(status_code: int, title: str, detail: str, instance: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "type": f"https://shopflow.io/errors/{title.lower().replace(' ', '-')}",
            "title": title,
            "status": status_code,
            "detail": detail,
            "instance": instance,
        },
    )


def _expected_signature(body: bytes) -> str:
    return hmac.new(
        settings.WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()


@router.post("/payment")
async def payment_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw = await request.body()

    provided = request.headers.get(SIGNATURE_HEADER, "")
    expected = _expected_signature(raw)
    if not provided or not hmac.compare_digest(provided, expected):
        raise _problem(
            status.HTTP_401_UNAUTHORIZED,
            "Unauthorized",
            "Invalid or missing webhook signature",
            request.url.path,
        )

    try:
        event = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request", "Body is not valid JSON", request.url.path
        )

    event_type = event.get("type")
    order_id = (event.get("data") or {}).get("order_id")
    if not event_type or not order_id:
        raise _problem(
            status.HTTP_400_BAD_REQUEST,
            "Bad Request",
            "Missing event type or data.order_id",
            request.url.path,
        )

    order = (
        await db.execute(select(Order).where(Order.id == order_id))
    ).scalar_one_or_none()
    if not order:
        raise _problem(
            status.HTTP_404_NOT_FOUND, "Not Found", "Order not found", request.url.path
        )

    target = {
        "payment.succeeded": OrderStatus.confirmed,
        "payment.failed": OrderStatus.cancelled,
    }.get(event_type)
    if target is None:
        # Unknown event types are acknowledged (idempotent) but ignored, so the
        # sender doesn't retry forever.
        return {"received": True, "order_id": order_id, "status": order.status.value, "ignored": True}

    # Idempotent: if already in the target state (a retried webhook), just ack.
    if order.status != target and can_transition(order.status, target):
        order.status = target
        await db.flush()

    return {"received": True, "order_id": order_id, "status": order.status.value}
