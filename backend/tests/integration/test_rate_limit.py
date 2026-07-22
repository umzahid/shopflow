"""Rate limiting: a Redis-backed fixed window enforces the public tier and
returns 429 + Retry-After (RFC 7807). The suite runs with the limiter disabled
(conftest); this test flips it on for itself and restores it after. The counter
must live in Redis (shared across replicas), not per-process memory."""
import pytest

from app.core.redis import get_redis
from app.main import limiter


async def _clear_rl_keys(redis) -> list[str]:
    keys = await redis.keys("ratelimit:*")
    if keys:
        await redis.delete(*keys)
    return keys


@pytest.mark.asyncio
async def test_public_limit_returns_429_with_retry_after(client):
    redis = await get_redis()
    await _clear_rl_keys(redis)
    limiter.enabled = True
    try:
        # Public limit is 100/minute per IP — the first 100 pass.
        for _ in range(100):
            assert (await client.get("/health")).status_code == 200
        # The 101st exceeds the window.
        blocked = await client.get("/health")
        assert blocked.status_code == 429
        assert "retry-after" in blocked.headers
        assert int(blocked.headers["retry-after"]) > 0
        body = blocked.json()
        assert body["status"] == 429
        assert body["title"] == "Too Many Requests"
        # The counter is in Redis (multi-replica safe), not per-process memory.
        rl_keys = await redis.keys("ratelimit:*")
        assert rl_keys, "expected a ratelimit:* counter in Redis"
        assert int(await redis.get(rl_keys[0])) >= 101
    finally:
        limiter.enabled = False
        await _clear_rl_keys(redis)
