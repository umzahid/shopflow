"""Order fraud feature extraction + assessment at checkout time.

Features are derived entirely from data available during the checkout
transaction: the in-flight order's line items, the customer's account age, and
their prior order history. The in-flight order is not persisted yet when this
runs, so the prior-history counts naturally exclude it.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.fraud import FraudFeatures, FraudPrediction, score_order
from app.models.models import Order, OrderStatus, User

REVENUE_STATUSES = (OrderStatus.confirmed, OrderStatus.shipped, OrderStatus.delivered)

# Orders placed before this hour (UTC) count as "off-hours" — a weak but real
# fraud signal (card-testing runs and bot checkouts skew overnight).
OFF_HOURS_BEFORE = 6

# Address fields compared for a billing-vs-shipping mismatch.
_ADDRESS_KEYS = ("line1", "line2", "city", "state", "postal_code", "country")

LineItem = tuple[Decimal, int]  # (unit_price, quantity)


def _addresses_mismatch(shipping: dict | None, billing: dict | None) -> int:
    """1 if a billing address was supplied and differs from shipping on any
    normalized field, else 0. No billing address → treated as same (0)."""
    if not billing or not shipping:
        return 0

    def norm(addr: dict, key: str) -> str:
        return str(addr.get(key) or "").strip().lower()

    return int(any(norm(shipping, k) != norm(billing, k) for k in _ADDRESS_KEYS))


async def extract_features(
    db: AsyncSession,
    *,
    customer: User,
    order_total: Decimal,
    discount_amount: Decimal,
    line_items: list[LineItem],
    order_time: datetime | None = None,
    ip_address: str | None = None,
    shipping_address: dict | None = None,
    billing_address: dict | None = None,
) -> FraudFeatures:
    order_time = order_time or datetime.now(timezone.utc)

    item_count = sum(qty for _, qty in line_items)
    distinct_items = len(line_items)
    unit_prices = [float(price) for price, _ in line_items] or [0.0]
    total = float(order_total)
    gross = total + float(discount_amount)  # pre-discount subtotal

    prior_orders = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.customer_id == customer.id,
                Order.status.in_(REVENUE_STATUSES),
            )
        )
    ).scalar() or 0
    prior_cancellations = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.customer_id == customer.id,
                Order.status == OrderStatus.cancelled,
            )
        )
    ).scalar() or 0

    created = customer.created_at
    if created.tzinfo is None:  # server_default is tz-aware, but be defensive
        created = created.replace(tzinfo=timezone.utc)
    account_age_hours = max(0.0, (order_time - created).total_seconds() / 3600.0)

    discount_ratio = float(discount_amount) / gross if gross > 0 else 0.0

    # Orders from the same IP in the last 24h (velocity / card-testing signal).
    # The in-flight order isn't persisted yet, so it's naturally excluded.
    orders_from_ip_24h = 0
    if ip_address:
        orders_from_ip_24h = (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.ip_address == ip_address,
                    Order.created_at >= order_time - timedelta(hours=24),
                )
            )
        ).scalar() or 0

    return FraudFeatures(
        order_total=total,
        item_count=int(item_count),
        distinct_items=int(distinct_items),
        avg_unit_price=total / item_count if item_count else 0.0,
        max_unit_price=max(unit_prices),
        account_age_hours=account_age_hours,
        prior_order_count=int(prior_orders),
        prior_cancellation_count=int(prior_cancellations),
        discount_ratio=discount_ratio,
        is_off_hours=1 if order_time.hour < OFF_HOURS_BEFORE else 0,
        orders_from_ip_24h=int(orders_from_ip_24h),
        billing_shipping_mismatch=_addresses_mismatch(shipping_address, billing_address),
    )


async def assess_order(
    db: AsyncSession,
    *,
    customer: User,
    order_total: Decimal,
    discount_amount: Decimal,
    line_items: list[LineItem],
    order_time: datetime | None = None,
    ip_address: str | None = None,
    shipping_address: dict | None = None,
    billing_address: dict | None = None,
) -> tuple[FraudFeatures, FraudPrediction]:
    """Extract features for an in-flight order and score them."""
    features = await extract_features(
        db,
        customer=customer,
        order_total=order_total,
        discount_amount=discount_amount,
        line_items=line_items,
        order_time=order_time,
        ip_address=ip_address,
        shipping_address=shipping_address,
        billing_address=billing_address,
    )
    return features, score_order(features)
