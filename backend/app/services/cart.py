"""Redis-backed cart.

Storage layout
    key   : cart:{user_id}
    field : product_id (UUID string)
    value : JSON {"qty": int, "unit_price": str, "title": str}

`unit_price` here is for display only — checkout re-snapshots from the
live `products.price` so a stale cart can't change the order total.
"""
import json
from decimal import Decimal
from typing import Any

import redis.asyncio as aioredis


CART_TTL_SECONDS = 7 * 86400  # 7-day idle expiry


def _key(user_id: str) -> str:
    return f"cart:{user_id}"


async def get(redis: aioredis.Redis, user_id: str) -> dict[str, dict[str, Any]]:
    raw = await redis.hgetall(_key(user_id))
    return {pid: json.loads(payload) for pid, payload in raw.items()}


async def set_item(
    redis: aioredis.Redis,
    user_id: str,
    product_id: str,
    qty: int,
    unit_price: Decimal,
    title: str,
) -> None:
    """Overwrite the quantity for one product. qty=0 removes the entry."""
    key = _key(user_id)
    if qty <= 0:
        await redis.hdel(key, product_id)
        return
    payload = json.dumps({"qty": qty, "unit_price": str(unit_price), "title": title})
    await redis.hset(key, product_id, payload)
    await redis.expire(key, CART_TTL_SECONDS)


async def add_or_increment(
    redis: aioredis.Redis,
    user_id: str,
    product_id: str,
    qty: int,
    unit_price: Decimal,
    title: str,
) -> int:
    """Increment qty if product already in cart, otherwise insert. Returns new qty."""
    key = _key(user_id)
    existing = await redis.hget(key, product_id)
    new_qty = qty + (json.loads(existing)["qty"] if existing else 0)
    await set_item(redis, user_id, product_id, new_qty, unit_price, title)
    return new_qty


async def remove_item(redis: aioredis.Redis, user_id: str, product_id: str) -> int:
    return await redis.hdel(_key(user_id), product_id)


async def clear(redis: aioredis.Redis, user_id: str) -> None:
    await redis.delete(_key(user_id))
