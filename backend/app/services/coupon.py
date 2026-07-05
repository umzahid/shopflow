"""Coupon validation + atomic usage increment.

apply_coupon() is a single SQL round-trip: an UPDATE that only fires if the
coupon is active, unexpired, and below its usage limit. The RETURNING clause
gives back the row so we can compute the discount. If no row comes back,
exactly one of the gates failed and we 400.
"""
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class CouponError(Exception):
    """Raised when a coupon can't be applied. Use .detail in handler response."""

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


async def apply_coupon(
    db: AsyncSession, code: str, subtotal: Decimal
) -> tuple[str, Decimal]:
    """Atomically reserve one use of `code` and compute the discount.

    Returns (coupon_id, discount_amount). Raises CouponError if the code
    doesn't exist, is inactive, expired, or maxed out.
    """
    stmt = text(
        """
        UPDATE coupons
        SET usage_count = usage_count + 1
        WHERE code = :code
          AND is_active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (usage_limit IS NULL OR usage_count < usage_limit)
        RETURNING id, discount_type, value
        """
    )
    row = (await db.execute(stmt, {"code": code})).first()
    if row is None:
        # Determine which gate failed for a better error message
        check = await db.execute(
            text("SELECT is_active, expires_at, usage_count, usage_limit FROM coupons WHERE code = :code"),
            {"code": code},
        )
        info = check.first()
        if info is None:
            raise CouponError("Coupon code not found")
        if not info.is_active:
            raise CouponError("Coupon is no longer active")
        if info.expires_at is not None and info.usage_limit is None:
            raise CouponError("Coupon has expired")
        if info.usage_limit is not None and info.usage_count >= info.usage_limit:
            raise CouponError("Coupon usage limit reached")
        raise CouponError("Coupon has expired")

    coupon_id, discount_type, value = row
    coupon_id = str(coupon_id)  # asyncpg returns UUID; column is str-typed
    value = Decimal(value)
    if discount_type == "percentage":
        discount = (subtotal * value / Decimal("100")).quantize(Decimal("0.01"))
    else:  # flat
        discount = value
    # Don't let discount exceed subtotal
    discount = min(discount, subtotal)
    return coupon_id, discount


async def release_coupon(db: AsyncSession, coupon_id: str) -> None:
    """Undo the usage_count++ if a downstream step fails. Call inside the same
    failed transaction; commit/rollback semantics still apply at the outer
    session boundary.
    """
    await db.execute(
        text("UPDATE coupons SET usage_count = usage_count - 1 WHERE id = :id AND usage_count > 0"),
        {"id": coupon_id},
    )
