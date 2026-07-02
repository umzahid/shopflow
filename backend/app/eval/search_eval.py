"""Offline semantic-search relevance evaluation (NDCG@k + recall@k per mode).

Meaningful semantic/hybrid numbers require the real all-MiniLM-L6-v2 encoder
(run with SHOPFLOW_FAKE_EMBEDDINGS unset). The deterministic fake encoder is
semantically random and only useful for smoke-testing the harness plumbing.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.products import _hybrid_search, _lexical_search, _semantic_search
from app.core.security import hash_password
from app.eval.metrics import ndcg_at_k, recall_at_k
from app.models.models import Product, ProductStatus, User, UserRole
from app.services.embedding import embed_product_text

GOLDEN_PATH = Path(__file__).parent / "data" / "search_golden.json"
_SEED_MERCHANT_EMAIL = "eval-search-seed@shopflow.local"

_MODES = {
    "lexical": _lexical_search,
    "semantic": _semantic_search,
    "hybrid": _hybrid_search,
}


def load_golden(path: Path | None = None) -> dict:
    return json.loads((path or GOLDEN_PATH).read_text())


async def seed_search_corpus(db: AsyncSession, corpus: list[dict]) -> str:
    """Insert the golden product corpus under a dedicated eval merchant.

    Returns the merchant id. Clears any prior products from a previous seed so
    repeated runs don't accumulate rows.
    """
    merchant = (
        await db.execute(select(User).where(User.email == _SEED_MERCHANT_EMAIL))
    ).scalar_one_or_none()
    if merchant is not None:
        await db.execute(delete(Product).where(Product.merchant_id == merchant.id))
    else:
        merchant = User(
            email=_SEED_MERCHANT_EMAIL,
            password_hash=hash_password("eval-seed-not-a-login"),
            role=UserRole.merchant,
        )
        db.add(merchant)
        await db.flush()

    for entry in corpus:
        title = entry["title"]
        description = entry.get("description", "")
        db.add(
            Product(
                merchant_id=merchant.id,
                title=title,
                description=description,
                price=entry.get("price", 9.99),
                stock_qty=entry.get("stock_qty", 100),
                images=[],
                status=ProductStatus.active,
                embedding=embed_product_text(title, description),
            )
        )
    await db.flush()
    return merchant.id


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


async def evaluate_search(db: AsyncSession, golden: dict, *, k: int = 10) -> dict:
    """Run every golden query through each mode; return per-mode NDCG@k + recall@k."""
    queries = golden["queries"]
    report: dict = {"k": k, "query_count": len(queries), "modes": {}}
    for mode, search_fn in _MODES.items():
        ndcgs: list[float] = []
        recalls: list[float] = []
        for q in queries:
            rel_by_title = {r["title"]: float(r["relevance"]) for r in q["relevant"]}
            rows = await search_fn(db, q["query"], k)
            titles = [product.title for product, _score in rows]
            ranked_rel = [rel_by_title.get(t, 0.0) for t in titles]
            ndcgs.append(ndcg_at_k(ranked_rel, list(rel_by_title.values()), k))
            relevant_titles = {t for t, g in rel_by_title.items() if g > 0}
            recalls.append(recall_at_k(titles, relevant_titles, k))
        report["modes"][mode] = {
            "ndcg@k": round(_mean(ndcgs), 4),
            "recall@k": round(_mean(recalls), 4),
        }
    return report
