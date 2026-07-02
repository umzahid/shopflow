"""Search evaluator plumbing — fake encoder, shape assertions only.

Fake embeddings are semantically random, so this asserts the report is
well-formed (modes present, metrics in [0, 1]) — NOT quality thresholds.
"""
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.eval.search_eval import evaluate_search, load_golden, seed_search_corpus
from app.services.embedding import _fake_encode, set_encoder

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


@pytest.fixture()
def _fake_embeddings():
    set_encoder(_fake_encode)
    yield
    set_encoder(None)


@pytest.mark.asyncio
async def test_search_eval_report_is_wellformed(_fake_embeddings):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        golden = load_golden()
        async with Session() as db:
            await seed_search_corpus(db, golden["corpus"])
            await db.flush()
            report = await evaluate_search(db, golden, k=5)
    finally:
        await engine.dispose()

    assert report["k"] == 5
    assert report["query_count"] == len(golden["queries"])
    assert set(report["modes"]) == {"lexical", "semantic", "hybrid"}
    for stats in report["modes"].values():
        assert 0.0 <= stats["ndcg@k"] <= 1.0
        assert 0.0 <= stats["recall@k"] <= 1.0


@pytest.mark.asyncio
async def test_lexical_mode_finds_exact_title_match(_fake_embeddings):
    """Lexical is deterministic regardless of embeddings — a token-exact query
    should retrieve its target, so lexical recall must be > 0."""
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        golden = load_golden()
        async with Session() as db:
            await seed_search_corpus(db, golden["corpus"])
            await db.flush()
            report = await evaluate_search(db, golden, k=10)
    finally:
        await engine.dispose()

    assert report["modes"]["lexical"]["recall@k"] > 0.0
