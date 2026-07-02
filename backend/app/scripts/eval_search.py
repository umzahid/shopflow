"""CLI: evaluate semantic-search relevance (NDCG@k + recall@k) per mode.

Run with the real encoder for meaningful semantic/hybrid numbers:
    docker exec shopflow-backend-1 python -m app.scripts.eval_search --k 10
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.eval.search_eval import evaluate_search, load_golden, seed_search_corpus


async def _run(k: int, seed_corpus: bool) -> dict:
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        golden = load_golden()
        async with Session() as db:
            if seed_corpus:
                await seed_search_corpus(db, golden["corpus"])
                await db.commit()
            return await evaluate_search(db, golden, k=k)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate search relevance (NDCG@k + recall@k).")
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--seed-corpus", dest="seed_corpus", action="store_true", default=True)
    parser.add_argument("--no-seed-corpus", dest="seed_corpus", action="store_false")
    parser.add_argument("--out", type=Path, default=Path("eval_reports/search_eval.json"))
    args = parser.parse_args()

    if os.getenv("SHOPFLOW_FAKE_EMBEDDINGS") == "1":
        print("WARNING: SHOPFLOW_FAKE_EMBEDDINGS=1 — semantic/hybrid numbers are NOT meaningful.")

    report = asyncio.run(_run(args.k, args.seed_corpus))

    print("\nSearch relevance @k=%d over %d queries:" % (report["k"], report["query_count"]))
    print("%-10s %8s %10s" % ("mode", "NDCG@k", "recall@k"))
    for mode, stats in report["modes"].items():
        print("%-10s %8.4f %10.4f" % (mode, stats["ndcg@k"], stats["recall@k"]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2))
    print("\nReport written to %s" % args.out)


if __name__ == "__main__":
    main()
