"""Rate limiting: the custom middleware enforces the public tier and returns
429 + Retry-After (RFC 7807). The suite runs with the limiter disabled
(conftest); this test flips it on for itself and restores it after."""
import pytest

from app.main import _rl_buckets, limiter


@pytest.mark.asyncio
async def test_public_limit_returns_429_with_retry_after(client):
    limiter.enabled = True
    _rl_buckets.clear()
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
    finally:
        limiter.enabled = False
        _rl_buckets.clear()
