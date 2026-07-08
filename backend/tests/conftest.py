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

# The suite hammers endpoints from one client; keep the rate limiter off so it
# doesn't throttle tests. A dedicated test (test_rate_limit.py) enables its own
# limiter to verify enforcement + Retry-After.
from app.main import limiter as _limiter  # noqa: E402

_limiter.enabled = False

TEST_DATABASE_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


def _sync_run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── Session-level: create tables once, drop after all tests ─────────────────

@pytest.fixture(scope="session", autouse=True)
def setup_test_db(request):
    """Session-level DB setup. Skip if narrative-service tests only (no DB needed)."""
    # Check if running narrative service tests only (they don't need a database).
    # This allows CI/local dev to run unit tests without Postgres running.
    items = getattr(request, 'session', None)
    if items and hasattr(items.config, 'invocation_params'):
        args = items.config.invocation_params.args
        if args and len(args) > 0:
            test_arg = str(args[0])
            # Skip DB setup if only narrative tests are running
            if 'test_narrative' in test_arg and len(args) == 1:
                yield
                return

    async def _create():
        engine = create_async_engine(TEST_DATABASE_URL)
        try:
            async with engine.begin() as conn:
                # pgvector must be installed before create_all — Product.embedding
                # is Vector(384) and create_all can't emit the DDL otherwise.
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                await conn.run_sync(Base.metadata.drop_all)
                await conn.run_sync(Base.metadata.create_all)
        except Exception as e:
            print(f"⚠ DB setup failed (continuing with unit tests only): {e}")
            return False
        finally:
            await engine.dispose()
        return True

    async def _drop():
        engine = create_async_engine(TEST_DATABASE_URL)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
        except Exception:
            pass
        finally:
            await engine.dispose()

    result = _sync_run(_create())
    yield
    if result is not False:
        _sync_run(_drop())


@pytest.fixture(scope="session", autouse=True)
def _use_fake_encoder():
    """Swap in the hash-based encoder for the whole test session — avoids
    downloading the 90MB sentence-transformers model in CI, and makes semantic
    ranking deterministic across runs."""
    from app.services.embedding import _fake_encode, set_encoder

    set_encoder(_fake_encode)
    yield
    set_encoder(None)


@pytest.fixture(scope="session", autouse=True)
def _use_fake_forecaster():
    """Swap in the linear-projection forecaster so tests don't fit real Prophet
    models — Prophet + cmdstanpy adds ~2s per fit and pulls in a Stan runtime
    we don't need for exercising the API layer."""
    from app.ml.forecast import _fake_forecast, set_forecaster

    set_forecaster(_fake_forecast)
    yield
    set_forecaster(None)


@pytest.fixture(scope="session", autouse=True)
def _use_fake_fraud_scorer():
    """Swap in the deterministic heuristic fraud scorer so tests never need a
    trained LightGBM artifact. Same pattern as the encoder/forecaster swaps."""
    from app.ml.fraud import _fake_score, set_scorer

    set_scorer(_fake_score)
    yield
    set_scorer(None)


@pytest.fixture(autouse=True)
def _reset_copilot_llm():
    """Reset the Copilot LLM swap hook after each test so a stray test can't
    leave a scripted turn set for the next one."""
    yield
    from app.services.copilot import set_llm

    set_llm(None)


@pytest.fixture(autouse=True)
def _reset_description_generator():
    """Reset the description generator swap hook after each test."""
    yield
    from app.services.descriptions import set_generator

    set_generator(None)


# ── Function-level: truncate all rows between tests ─────────────────────────

@pytest.fixture(autouse=True)
def truncate_between_tests(setup_test_db):
    yield

    # Skip truncation if DB setup was skipped
    if setup_test_db is None:
        return

    async def _truncate():
        engine = create_async_engine(TEST_DATABASE_URL)
        try:
            async with engine.begin() as conn:
                for table in reversed(Base.metadata.sorted_tables):
                    await conn.execute(text(f'TRUNCATE TABLE "{table.name}" CASCADE'))
        except Exception:
            pass
        finally:
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
