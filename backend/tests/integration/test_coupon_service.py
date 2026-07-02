"""Coupon service — every gate and discount branch, against the real test DB.

Complements the checkout-level coupon tests in test_orders.py (invalid code,
valid percentage) by exercising apply_coupon/release_coupon directly.
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.services.coupon import CouponError, apply_coupon, release_coupon

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _seed(db, code, *, dtype="percentage", value=10, is_active=True,
                expires_at=None, usage_limit=None, usage_count=0):
    cid = str(uuid.uuid4())
    await db.execute(
        text(
            "INSERT INTO coupons (id, code, discount_type, value, is_active, "
            "expires_at, usage_limit, usage_count) VALUES "
            "(:id, :code, :dtype, :value, :active, :exp, :limit, :count)"
        ),
        {"id": cid, "code": code, "dtype": dtype, "value": value, "active": is_active,
         "exp": expires_at, "limit": usage_limit, "count": usage_count},
    )
    return cid


async def _usage_count(db, cid):
    return (await db.execute(
        text("SELECT usage_count FROM coupons WHERE id = :id"), {"id": cid}
    )).scalar()


@pytest.fixture()
async def db():
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_percentage_discount_and_usage_increment(db):
    cid = await _seed(db, "PCT20", dtype="percentage", value=20)
    coupon_id, discount = await apply_coupon(db, "PCT20", Decimal("50.00"))
    assert coupon_id == cid
    assert discount == Decimal("10.00")
    assert await _usage_count(db, cid) == 1


@pytest.mark.asyncio
async def test_flat_discount(db):
    await _seed(db, "FLAT5", dtype="flat", value=5)
    _, discount = await apply_coupon(db, "FLAT5", Decimal("30.00"))
    assert discount == Decimal("5.00")


@pytest.mark.asyncio
async def test_discount_capped_at_subtotal(db):
    await _seed(db, "FLAT100", dtype="flat", value=100)
    _, discount = await apply_coupon(db, "FLAT100", Decimal("7.50"))
    assert discount == Decimal("7.50")  # never exceeds the subtotal


@pytest.mark.asyncio
async def test_unknown_code_raises(db):
    with pytest.raises(CouponError, match="not found"):
        await apply_coupon(db, "NO-SUCH-CODE", Decimal("10.00"))


@pytest.mark.asyncio
async def test_inactive_coupon_raises(db):
    await _seed(db, "OLDCODE", is_active=False)
    with pytest.raises(CouponError, match="no longer active"):
        await apply_coupon(db, "OLDCODE", Decimal("10.00"))


@pytest.mark.asyncio
async def test_expired_coupon_raises(db):
    past = datetime.now(timezone.utc) - timedelta(days=1)
    await _seed(db, "EXPIRED", expires_at=past)
    with pytest.raises(CouponError, match="expired"):
        await apply_coupon(db, "EXPIRED", Decimal("10.00"))


@pytest.mark.asyncio
async def test_usage_limit_reached_raises(db):
    cid = await _seed(db, "MAXED", usage_limit=2, usage_count=2)
    with pytest.raises(CouponError, match="usage limit"):
        await apply_coupon(db, "MAXED", Decimal("10.00"))
    assert await _usage_count(db, cid) == 2  # failed apply must not increment


@pytest.mark.asyncio
async def test_release_coupon_decrements(db):
    cid = await _seed(db, "RELEASE1", usage_count=0)
    await apply_coupon(db, "RELEASE1", Decimal("10.00"))
    assert await _usage_count(db, cid) == 1
    await release_coupon(db, cid)
    assert await _usage_count(db, cid) == 0


@pytest.mark.asyncio
async def test_release_coupon_never_goes_negative(db):
    cid = await _seed(db, "RELEASE0", usage_count=0)
    await release_coupon(db, cid)
    assert await _usage_count(db, cid) == 0
