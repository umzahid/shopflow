# Evaluation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline evaluation harness that reports (a) semantic-search relevance — NDCG@k + recall@k across `lexical`/`semantic`/`hybrid` modes over a graded golden query set, and (b) fraud-classifier quality — confusion matrix + precision/recall/F1/accuracy + ROC-AUC over a labeled synthetic order set.

**Architecture:** Pure metric math lives in a new coverage-counted package `app/eval/` (unit-tested). Two thin run-once CLIs in `app/scripts/` (already coverage-excluded) drive the evaluators and write JSON reports to a gitignored `eval_reports/`. The fraud evaluator reuses `_generate_dataset` from `app/scripts/train_fraud_model.py`; the search evaluator reuses the `_lexical/_semantic/_hybrid_search` helpers already in `app/api/products.py`.

**Tech Stack:** FastAPI/SQLAlchemy async, Pydantic v2, `numpy` (already a dep), pytest against a real `shopflow_test` Postgres. No scikit-learn (metrics are hand-rolled, matching the existing `train_fraud_model.py` AUC convention).

## Global Constraints

- **No new dependencies.** NDCG/recall/confusion-matrix/P-R-F1/ROC-AUC are implemented by hand. `numpy` only, already pinned.
- **`app/eval/` is real package code** → counted by `--cov=app`. `app/scripts/eval_*.py` are run-once CLIs → already omitted via `[coverage:run]` in `setup.cfg` (`app/scripts/*`).
- **No F541** — never write an f-string with no placeholders (pyflakes F541 is not ignored and fails CI). Use plain strings for static print lines.
- flake8 (exact CI flags): `--max-line-length=120 --extend-ignore=E501,W503,E203`. F401 (unused import) fails CI.
- Coverage gate: `pytest --cov=app --cov-fail-under=70` (in-container with `COVERAGE_FILE=/tmp/.coverage`).
- Tests run inside `shopflow-backend-1` (app/ and tests/ are volume-mounted). `setup.cfg` is baked into the image — if `[coverage:run] omit` needs no change (it already globs `app/scripts/*`), no rebuild needed.
- Search-eval semantic numbers are only meaningful with the real encoder; the smoke test runs with the fake encoder and asserts *shape only* (keys present, values in `[0,1]`), never quality thresholds.

---

### Task 1: Metrics library + unit tests

**Files:**
- Create: `backend/app/eval/__init__.py` (empty)
- Create: `backend/app/eval/metrics.py`
- Test: `backend/tests/unit/test_eval_metrics.py`

**Interfaces produced:**
- `dcg_at_k(gains, k) -> float`
- `ndcg_at_k(ranked_relevances, ideal_relevances, k) -> float`
- `recall_at_k(retrieved_ids, relevant_ids, k) -> float`
- `confusion_matrix(y_true, y_pred) -> {tp, fp, tn, fn}`
- `classification_metrics(cm) -> {precision, recall, f1, accuracy}`
- `roc_auc(y_true, y_score) -> float`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_eval_metrics.py`:

```python
"""Hand-rolled evaluation metrics — hand-computed expected values."""
import math

import pytest

from app.eval.metrics import (
    classification_metrics,
    confusion_matrix,
    dcg_at_k,
    ndcg_at_k,
    recall_at_k,
    roc_auc,
)


def test_ndcg_perfect_ranking_is_one():
    assert ndcg_at_k([3, 2, 1], [3, 2, 1], 3) == pytest.approx(1.0)


def test_ndcg_known_reorder():
    # ranked [2,3,1] vs ideal [3,2,1] → 4.39279/4.76186
    assert ndcg_at_k([2, 3, 1], [3, 2, 1], 3) == pytest.approx(0.9225, abs=1e-3)


def test_ndcg_all_zero_relevance_is_zero():
    assert ndcg_at_k([0, 0, 0], [0, 0, 0], 3) == 0.0


def test_dcg_matches_formula():
    assert dcg_at_k([3, 2], 2) == pytest.approx(3 / math.log2(2) + 2 / math.log2(3))


def test_recall_partial_and_full():
    assert recall_at_k(["a", "b", "c"], {"a", "c", "d"}, 3) == pytest.approx(2 / 3)
    assert recall_at_k(["a", "b"], {"a", "c", "d"}, 2) == pytest.approx(1 / 3)
    assert recall_at_k(["a"], set(), 1) == 0.0


def test_confusion_matrix_counts():
    cm = confusion_matrix([1, 1, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0])
    assert cm == {"tp": 2, "fp": 1, "tn": 2, "fn": 1}


def test_classification_metrics_values_and_zero_guard():
    m = classification_metrics({"tp": 2, "fp": 1, "tn": 2, "fn": 1})
    assert m["precision"] == pytest.approx(2 / 3)
    assert m["recall"] == pytest.approx(2 / 3)
    assert m["f1"] == pytest.approx(2 / 3)
    assert m["accuracy"] == pytest.approx(2 / 3)
    zero = classification_metrics({"tp": 0, "fp": 0, "tn": 0, "fn": 0})
    assert zero == {"precision": 0.0, "recall": 0.0, "f1": 0.0, "accuracy": 0.0}


def test_roc_auc_separable_ties_and_one_class():
    assert roc_auc([1, 1, 0, 0], [0.9, 0.8, 0.2, 0.1]) == pytest.approx(1.0)
    assert roc_auc([1, 1, 0, 0], [0.5, 0.5, 0.5, 0.5]) == pytest.approx(0.5)
    assert roc_auc([1, 1, 1], [0.9, 0.8, 0.7]) == pytest.approx(0.5)  # one class → 0.5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_eval_metrics.py -q`
Expected: FAIL — `ModuleNotFoundError: app.eval.metrics`.

- [ ] **Step 3: Create the package + metrics**

Create `backend/app/eval/__init__.py` (empty file).

Create `backend/app/eval/metrics.py`:

```python
"""Hand-rolled evaluation metrics — no scikit-learn.

NDCG / recall for search relevance, and confusion-matrix-based classification
metrics + ROC-AUC for the fraud classifier. Dependency-light (numpy only, already
pinned) so the eval harness adds no image weight. Mirrors the project convention
of hand-rolling metric math (see train_fraud_model.py's Mann-Whitney AUC).
"""
from __future__ import annotations

import math
from typing import Sequence


def dcg_at_k(gains: Sequence[float], k: int) -> float:
    """Discounted cumulative gain of the first k gains (rank i discounted by log2(i+2))."""
    return sum(g / math.log2(i + 2) for i, g in enumerate(list(gains)[:k]))


def ndcg_at_k(
    ranked_relevances: Sequence[float],
    ideal_relevances: Sequence[float],
    k: int,
) -> float:
    """NDCG@k: DCG of the retrieved ranking over DCG of the best attainable ranking.

    `ranked_relevances` is the graded relevance of each result in retrieved order;
    `ideal_relevances` is the full multiset of relevance grades available for the
    query (so unretrieved relevant items still count against the score via IDCG).
    Returns 0.0 when no gain is attainable.
    """
    idcg = dcg_at_k(sorted(ideal_relevances, reverse=True), k)
    if idcg == 0.0:
        return 0.0
    return dcg_at_k(ranked_relevances, k) / idcg


def recall_at_k(
    retrieved_ids: Sequence[str],
    relevant_ids: set[str],
    k: int,
) -> float:
    """Fraction of the relevant set retrieved within the top k. 0.0 if none relevant."""
    relevant = set(relevant_ids)
    if not relevant:
        return 0.0
    hits = sum(1 for rid in list(retrieved_ids)[:k] if rid in relevant)
    return hits / len(relevant)


def confusion_matrix(y_true: Sequence[int], y_pred: Sequence[int]) -> dict:
    """Binary confusion matrix as {tp, fp, tn, fn}."""
    tp = fp = tn = fn = 0
    for t, p in zip(y_true, y_pred):
        if t == 1 and p == 1:
            tp += 1
        elif t == 0 and p == 1:
            fp += 1
        elif t == 0 and p == 0:
            tn += 1
        else:
            fn += 1
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn}


def classification_metrics(cm: dict) -> dict:
    """Precision / recall / F1 / accuracy from a confusion matrix (zero-safe)."""
    tp, fp, tn, fn = cm["tp"], cm["fp"], cm["tn"], cm["fn"]
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    total = tp + fp + tn + fn
    accuracy = (tp + tn) / total if total else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "accuracy": accuracy}


def roc_auc(y_true: Sequence[int], y_score: Sequence[float]) -> float:
    """ROC-AUC via the Mann-Whitney U statistic with average ranks for ties.

    Returns 0.5 for a degenerate single-class input.
    """
    import numpy as np

    yt = np.asarray(list(y_true))
    ys = np.asarray(list(y_score), dtype=float)
    n_pos = int((yt == 1).sum())
    n_neg = int((yt == 0).sum())
    if n_pos == 0 or n_neg == 0:
        return 0.5

    order = np.argsort(ys, kind="mergesort")
    sorted_scores = ys[order]
    ranks = np.empty(len(ys), dtype=float)
    i, n = 0, len(ys)
    while i < n:
        j = i
        while j + 1 < n and sorted_scores[j + 1] == sorted_scores[i]:
            j += 1
        ranks[order[i : j + 1]] = (i + j) / 2.0 + 1.0  # 1-based average rank
        i = j + 1

    sum_ranks_pos = float(ranks[yt == 1].sum())
    return (sum_ranks_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_eval_metrics.py -q`
Expected: PASS (8 passed).

- [ ] **Step 5: flake8 the new files**

Run: `docker exec shopflow-backend-1 python -m flake8 app/eval/ tests/unit/test_eval_metrics.py --max-line-length=120 --extend-ignore=E501,W503,E203`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/eval/__init__.py backend/app/eval/metrics.py backend/tests/unit/test_eval_metrics.py
git commit -m "feat(eval): hand-rolled search + classification metrics library"
```

---

### Task 2: Search relevance evaluator + golden fixture + CLI + smoke test

**Files:**
- Create: `backend/app/eval/data/search_golden.json`
- Create: `backend/app/eval/search_eval.py`
- Create: `backend/app/scripts/eval_search.py`
- Test: `backend/tests/integration/test_eval_search_smoke.py`

**Interfaces produced:**
- `load_golden(path=None) -> dict` (`{corpus: [...], queries: [...]}`)
- `async seed_search_corpus(db, corpus) -> merchant_id`
- `async evaluate_search(db, golden, *, k=10) -> {k, query_count, modes: {mode: {ndcg@k, recall@k}}}`

- [ ] **Step 1: Create the golden fixture**

Create `backend/app/eval/data/search_golden.json`. Hand-authored corpus (distinct titles) + graded queries (relevance 0–3). Keep titles unique — the evaluator maps hits back to grades by title.

```json
{
  "corpus": [
    {"title": "Wireless Noise-Cancelling Headphones", "description": "Over-ear bluetooth headphones with active noise cancellation and 30-hour battery."},
    {"title": "True Wireless Earbuds", "description": "In-ear bluetooth earbuds with charging case and touch controls."},
    {"title": "Wired Studio Headphones", "description": "Closed-back over-ear monitoring headphones for music production."},
    {"title": "Portable Bluetooth Speaker", "description": "Waterproof rechargeable speaker with deep bass for outdoor use."},
    {"title": "Stainless Steel Water Bottle", "description": "Insulated 1L vacuum flask that keeps drinks cold for 24 hours."},
    {"title": "Ceramic Coffee Mug", "description": "12oz stoneware mug, microwave and dishwasher safe."},
    {"title": "Cast Iron Skillet", "description": "Pre-seasoned 12-inch frying pan for stovetop and oven cooking."},
    {"title": "Yoga Mat", "description": "Non-slip 6mm exercise mat for yoga and pilates."},
    {"title": "Running Shoes", "description": "Lightweight cushioned trainers for road running."},
    {"title": "Mechanical Keyboard", "description": "Backlit tactile switch keyboard for typing and gaming."},
    {"title": "USB-C Charging Cable", "description": "Braided fast-charge cable, 2 meter, USB-C to USB-C."},
    {"title": "Laptop Backpack", "description": "Water-resistant backpack with padded 15-inch laptop sleeve."}
  ],
  "queries": [
    {"query": "bluetooth headphones", "relevant": [
      {"title": "Wireless Noise-Cancelling Headphones", "relevance": 3},
      {"title": "True Wireless Earbuds", "relevance": 2},
      {"title": "Wired Studio Headphones", "relevance": 1}
    ]},
    {"query": "earbuds", "relevant": [
      {"title": "True Wireless Earbuds", "relevance": 3},
      {"title": "Wireless Noise-Cancelling Headphones", "relevance": 1}
    ]},
    {"query": "speaker for outdoors", "relevant": [
      {"title": "Portable Bluetooth Speaker", "relevance": 3}
    ]},
    {"query": "insulated water bottle", "relevant": [
      {"title": "Stainless Steel Water Bottle", "relevance": 3}
    ]},
    {"query": "coffee mug", "relevant": [
      {"title": "Ceramic Coffee Mug", "relevance": 3}
    ]},
    {"query": "frying pan", "relevant": [
      {"title": "Cast Iron Skillet", "relevance": 3}
    ]},
    {"query": "exercise mat for yoga", "relevant": [
      {"title": "Yoga Mat", "relevance": 3}
    ]},
    {"query": "shoes for running", "relevant": [
      {"title": "Running Shoes", "relevance": 3}
    ]},
    {"query": "keyboard for gaming", "relevant": [
      {"title": "Mechanical Keyboard", "relevance": 3}
    ]},
    {"query": "usb c cable", "relevant": [
      {"title": "USB-C Charging Cable", "relevance": 3}
    ]},
    {"query": "bag for laptop", "relevant": [
      {"title": "Laptop Backpack", "relevance": 3}
    ]}
  ]
}
```

- [ ] **Step 2: Write the failing smoke test**

Create `backend/tests/integration/test_eval_search_smoke.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_eval_search_smoke.py -q`
Expected: FAIL — `ModuleNotFoundError: app.eval.search_eval`.

- [ ] **Step 4: Write the evaluator**

Create `backend/app/eval/search_eval.py`:

```python
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
```

- [ ] **Step 5: Run smoke test to verify it passes**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_eval_search_smoke.py -q`
Expected: PASS (2 passed).

- [ ] **Step 6: Write the CLI**

Create `backend/app/scripts/eval_search.py`:

```python
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
```

- [ ] **Step 7: flake8 the new files**

Run: `docker exec shopflow-backend-1 python -m flake8 app/eval/search_eval.py app/scripts/eval_search.py tests/integration/test_eval_search_smoke.py --max-line-length=120 --extend-ignore=E501,W503,E203`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/eval/data/search_golden.json backend/app/eval/search_eval.py backend/app/scripts/eval_search.py backend/tests/integration/test_eval_search_smoke.py
git commit -m "feat(eval): search relevance evaluator (NDCG@k + recall@k) + golden set + CLI"
```

---

### Task 3: Fraud classifier evaluator + CLI + smoke test

**Files:**
- Create: `backend/app/eval/fraud_eval.py`
- Create: `backend/app/scripts/eval_fraud.py`
- Test: `backend/tests/unit/test_eval_fraud.py`

**Interfaces produced:**
- `evaluate_fraud(*, samples=5000, fraud_rate=0.12, seed=7, threshold=None) -> dict`
  with `{samples, fraud_rate, seed, threshold, positives, confusion_matrix, metrics}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_eval_fraud.py`:

```python
"""Fraud evaluator — heuristic scorer, shape + invariant assertions."""
import pytest

from app.eval.fraud_eval import evaluate_fraud


@pytest.fixture()
def _heuristic_scorer(monkeypatch):
    # Force the deterministic heuristic scorer regardless of any local artifact.
    monkeypatch.setenv("SHOPFLOW_FAKE_FRAUD", "1")
    yield


def test_fraud_eval_report_is_wellformed(_heuristic_scorer):
    report = evaluate_fraud(samples=300, fraud_rate=0.2, seed=1)
    cm = report["confusion_matrix"]
    assert cm["tp"] + cm["fp"] + cm["tn"] + cm["fn"] == 300
    assert report["positives"] == cm["tp"] + cm["fn"]
    m = report["metrics"]
    for key in ("precision", "recall", "f1", "accuracy", "roc_auc"):
        assert 0.0 <= m[key] <= 1.0


def test_fraud_eval_is_deterministic(_heuristic_scorer):
    a = evaluate_fraud(samples=200, fraud_rate=0.15, seed=3)
    b = evaluate_fraud(samples=200, fraud_rate=0.15, seed=3)
    assert a["confusion_matrix"] == b["confusion_matrix"]


def test_higher_threshold_flags_no_more_positives(_heuristic_scorer):
    lo = evaluate_fraud(samples=300, fraud_rate=0.2, seed=2, threshold=0.3)
    hi = evaluate_fraud(samples=300, fraud_rate=0.2, seed=2, threshold=0.8)
    lo_flagged = lo["confusion_matrix"]["tp"] + lo["confusion_matrix"]["fp"]
    hi_flagged = hi["confusion_matrix"]["tp"] + hi["confusion_matrix"]["fp"]
    assert hi_flagged <= lo_flagged
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_eval_fraud.py -q`
Expected: FAIL — `ModuleNotFoundError: app.eval.fraud_eval`.

- [ ] **Step 3: Write the evaluator**

Create `backend/app/eval/fraud_eval.py`:

```python
"""Offline fraud-classifier evaluation: confusion matrix + P/R/F1 + ROC-AUC.

Reuses the training script's synthetic-label generator to build a holdout set,
scores it with the production scorer (real booster if the artifact is present,
else the heuristic fallback), and reports quality at the review threshold.
"""
from __future__ import annotations

from app.eval.metrics import classification_metrics, confusion_matrix, roc_auc
from app.ml.fraud import FEATURE_NAMES, REVIEW_THRESHOLD, FraudFeatures, score_order


def _features_from_row(row) -> FraudFeatures:
    v = {name: float(value) for name, value in zip(FEATURE_NAMES, row)}
    return FraudFeatures(
        order_total=v["order_total"],
        item_count=int(v["item_count"]),
        distinct_items=int(v["distinct_items"]),
        avg_unit_price=v["avg_unit_price"],
        max_unit_price=v["max_unit_price"],
        account_age_hours=v["account_age_hours"],
        prior_order_count=int(v["prior_order_count"]),
        prior_cancellation_count=int(v["prior_cancellation_count"]),
        discount_ratio=v["discount_ratio"],
        is_off_hours=int(v["is_off_hours"]),
    )


def evaluate_fraud(
    *,
    samples: int = 5000,
    fraud_rate: float = 0.12,
    seed: int = 7,
    threshold: float | None = None,
) -> dict:
    """Score a synthetic holdout set and report classifier quality at `threshold`."""
    import numpy as np

    from app.scripts.train_fraud_model import _generate_dataset

    threshold = REVIEW_THRESHOLD if threshold is None else threshold
    rng = np.random.default_rng(seed)
    features, labels = _generate_dataset(samples, fraud_rate, rng)

    scores: list[float] = []
    preds: list[int] = []
    for row in features:
        prediction = score_order(_features_from_row(row))
        scores.append(prediction.score)
        preds.append(1 if prediction.score >= threshold else 0)

    y_true = [int(label) for label in labels]
    cm = confusion_matrix(y_true, preds)
    metrics = classification_metrics(cm)
    metrics["roc_auc"] = round(roc_auc(y_true, scores), 4)
    return {
        "samples": samples,
        "fraud_rate": fraud_rate,
        "seed": seed,
        "threshold": threshold,
        "positives": int(sum(y_true)),
        "confusion_matrix": cm,
        "metrics": {k: round(v, 4) for k, v in metrics.items()},
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_eval_fraud.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Write the CLI**

Create `backend/app/scripts/eval_fraud.py`:

```python
"""CLI: evaluate the fraud classifier (confusion matrix + P/R/F1 + ROC-AUC).

    docker exec shopflow-backend-1 python -m app.scripts.eval_fraud --samples 5000
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.eval.fraud_eval import evaluate_fraud
from app.ml.fraud import MODEL_PATH


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the fraud classifier.")
    parser.add_argument("--samples", type=int, default=5000)
    parser.add_argument("--fraud-rate", dest="fraud_rate", type=float, default=0.12)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--threshold", type=float, default=None)
    parser.add_argument("--out", type=Path, default=Path("eval_reports/fraud_eval.json"))
    args = parser.parse_args()

    scorer = "trained booster" if MODEL_PATH.exists() else "heuristic fallback (no artifact)"
    report = evaluate_fraud(
        samples=args.samples,
        fraud_rate=args.fraud_rate,
        seed=args.seed,
        threshold=args.threshold,
    )
    report["scorer"] = scorer

    cm = report["confusion_matrix"]
    m = report["metrics"]
    print("\nFraud eval — scorer: %s" % scorer)
    print("samples=%d positives=%d threshold=%s"
          % (report["samples"], report["positives"], report["threshold"]))
    print("\nConfusion matrix:")
    print("                 pred_fraud  pred_legit")
    print("  actual_fraud   %10d  %10d" % (cm["tp"], cm["fn"]))
    print("  actual_legit   %10d  %10d" % (cm["fp"], cm["tn"]))
    print("\nprecision=%.4f recall=%.4f f1=%.4f accuracy=%.4f roc_auc=%.4f"
          % (m["precision"], m["recall"], m["f1"], m["accuracy"], m["roc_auc"]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2))
    print("\nReport written to %s" % args.out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: flake8 the new files**

Run: `docker exec shopflow-backend-1 python -m flake8 app/eval/fraud_eval.py app/scripts/eval_fraud.py tests/unit/test_eval_fraud.py --max-line-length=120 --extend-ignore=E501,W503,E203`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/eval/fraud_eval.py backend/app/scripts/eval_fraud.py backend/tests/unit/test_eval_fraud.py
git commit -m "feat(eval): fraud classifier evaluator (confusion matrix + P/R/F1 + AUC) + CLI"
```

---

### Task 4: gitignore, full-suite verification, lint, PROMPT_LOG, memory

**Files:**
- Modify: `.gitignore`
- Modify: `PROMPT_LOG.md`
- (memory files under `~/.claude/.../memory/`)

- [ ] **Step 1: Ignore generated reports**

Add to `.gitignore` (both repo-root and backend-relative to be safe):

```
eval_reports/
backend/eval_reports/
```

- [ ] **Step 2: Run the full suite with the coverage gate**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/ -q --cov=app --cov-fail-under=70`
Expected: PASS, coverage ≥ 70%. `app/eval/metrics.py` fully covered; `app/eval/search_eval.py` + `app/eval/fraud_eval.py` covered by the smoke tests; `app/scripts/eval_*.py` excluded.

- [ ] **Step 3: Run flake8 with the exact CI flags**

Run: `docker exec shopflow-backend-1 python -m flake8 app/ tests/ --max-line-length=120 --extend-ignore=E501,W503,E203`
Expected: no output (clean).

- [ ] **Step 4: Sanity-run both CLIs (optional but recommended)**

```bash
docker exec shopflow-backend-1 python -m app.scripts.eval_fraud --samples 3000
docker exec -e SHOPFLOW_FAKE_EMBEDDINGS=1 shopflow-backend-1 python -m app.scripts.eval_search --k 10
```
The fraud run prints a real confusion matrix; the search run prints the harness table with the "not meaningful" warning (fake embeddings). For a meaningful search run, execute without `SHOPFLOW_FAKE_EMBEDDINGS` (downloads the model on first use).

- [ ] **Step 5: Fill PROMPT_LOG Entry 28**

Replace the Entry 28 stub with a filled entry: Tool Used (Claude Code, Opus 4.8; superpowers pipeline), the verbatim prompt, Output Quality, What You Changed (metrics library, search + fraud evaluators, golden fixture, two CLIs, tests, spec/plan under `docs/superpowers/`), and What You Learned (hand-rolled metrics keep the image lean; search-eval is model-honest — semantic NDCG needs the real encoder so it stays an offline report not a CI gate; fraud eval reuses the training generator for a deterministic holdout).

- [ ] **Step 6: Update memory**

Update `shopflow_project.md`: Week 7 (or "eval") now includes the evaluation harness (Entry 28) — `app/eval/` metrics + two `app/scripts/eval_*` CLIs, golden query set, JSON reports. Note the model-honest search-eval decision. Update `shopflow_conventions.md` if the `app/eval/` package / `eval_reports/` artifact convention is worth recording. Update the `MEMORY.md` index lines.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/shopflow
git add .gitignore PROMPT_LOG.md
git commit -m "docs(eval): fill PROMPT_LOG Entry 28; ignore eval_reports"
```

---

## Self-Review

**1. Spec coverage:**
- Search NDCG@k + recall@k across lexical/semantic/hybrid → Task 2 `evaluate_search`. ✓
- Fraud confusion matrix + P/R/F1/accuracy + ROC-AUC at threshold → Task 3 `evaluate_fraud`. ✓
- Shared hand-rolled metrics library, no sklearn → Task 1 `app/eval/metrics.py`. ✓
- Two CLIs writing JSON reports → Tasks 2 & 3 `app/scripts/eval_*.py`. ✓
- Fraud eval reuses `_generate_dataset` → Task 3. ✓
- Model-honest search eval (real encoder offline; fake = smoke only, warned) → Task 2 CLI + smoke test asserts shape only. ✓
- Graded golden query set fixture → Task 2 `search_golden.json`. ✓
- Deterministic, network-free tests → Task 1 unit, Task 2 fake-encoder smoke, Task 3 heuristic-scorer unit. ✓
- Reports gitignored → Task 4. ✓

**2. Placeholder scan:** No "TBD"/"similar to Task N"; every code step carries full code. ✓

**3. Type consistency:** `ndcg_at_k(ranked, ideal, k)`, `recall_at_k(retrieved, relevant_set, k)`, `confusion_matrix→{tp,fp,tn,fn}`, `classification_metrics(cm)→{precision,recall,f1,accuracy}`, `roc_auc(y_true,y_score)`, `evaluate_search(db,golden,*,k)→{k,query_count,modes}`, `evaluate_fraud(*,samples,fraud_rate,seed,threshold)→{...,confusion_matrix,metrics}` used consistently across tasks and tests. ✓

**4. CI-gotcha guards:** No F541 (static prints use `%`-formatting / plain strings, not empty f-strings); no F401; `app/scripts/*` coverage-excluded already; `numpy` already a dep; search helpers return `(Product, score)` rows so `for product, _score in rows` is correct. ✓

**5. Risks / notes:**
- `evaluate_fraud` scores rows in a Python loop — fine for CLI `--samples 5000`; tests use ≤300.
- `roc_auc` uses average-rank tie handling so all-equal scores → exactly 0.5 (unit-tested).
- Smoke test relies on `shopflow_test` DB + a fresh engine (same pattern as `test_descriptions_endpoint.py`); conftest truncation cleans seeded rows between tests.
- ROC-AUC math is duplicated with `train_fraud_model._roc_auc` (left as-is to avoid touching the training script); unifying is a documented future cleanup.
