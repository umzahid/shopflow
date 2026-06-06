"""
Test configuration.

Strategy: let FastAPI manage its own DB sessions normally.
We create/truncate tables using a separate engine per test to avoid asyncpg
event-loop conflicts. We also reset the global Redis client between tests so
each test gets a fresh connection on its own event loop.
"""
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base
import app.models.models  # noqa: F401 — registers all models in Base.metadata

TEST_DATABASE_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


def _sync_run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── Session-level: create tables once, drop after all tests ─────────────────

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    async def _create():
        engine = create_async_engine(TEST_DATABASE_URL)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    async def _drop():
        engine = create_async_engine(TEST_DATABASE_URL)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    _sync_run(_create())
    yield
    _sync_run(_drop())


# ── Function-level: truncate all rows between tests ─────────────────────────

@pytest.fixture(autouse=True)
def truncate_between_tests(setup_test_db):
    yield

    async def _truncate():
        engine = create_async_engine(TEST_DATABASE_URL)
        async with engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                await conn.execute(text(f'TRUNCATE TABLE "{table.name}" CASCADE'))
        await engine.dispose()

    _sync_run(_truncate())


# ── Function-level: reset global Redis client so each test gets its own loop ─

@pytest_asyncio.fixture(autouse=True)
async def reset_redis():
    import app.core.redis as redis_module
    redis_module._redis_client = None
    yield
    # Close on the same event loop the test used — avoids "loop is closed" error
    if redis_module._redis_client:
        try:
            await redis_module._redis_client.aclose()
        except Exception:
            pass
        redis_module._redis_client = None


# ── HTTP client ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    """Drive the FastAPI app against the test database."""
    import app.core.database as db_module
    from sqlalchemy.ext.asyncio import async_sessionmaker

    original_engine = db_module.engine
    original_session = db_module.AsyncSessionLocal

    new_engine = create_async_engine(TEST_DATABASE_URL)
    db_module.engine = new_engine
    db_module.AsyncSessionLocal = async_sessionmaker(new_engine, expire_on_commit=False)

    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    await new_engine.dispose()
    db_module.engine = original_engine
    db_module.AsyncSessionLocal = original_session
