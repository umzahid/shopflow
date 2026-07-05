# Evaluation Harness — Design Spec

**Date:** 2026-07-02
**Assignment task:** Domain 5 — Entry 28 (Evaluation harness: search NDCG + fraud confusion matrix)
**Status:** DRAFT — pending approval before implementation plan

## Purpose

An **offline evaluation harness** that measures the quality of the two ML
features already in ShopFlow:

1. **Semantic search relevance** — NDCG@k and recall@k for each search mode
   (`lexical`, `semantic`, `hybrid`) over a hand-authored golden query set, so we
   can show the hybrid blend actually beats either mode alone.
2. **Fraud classifier quality** — a confusion matrix plus precision / recall / F1
   / accuracy (and ROC-AUC) for the checkout scorer at the review threshold, over
   a labeled synthetic order set.

Both are **reporting tools**, not production endpoints: they run on demand
(CLIs), print a readable table, and write a JSON report artifact. They are
non-destructive — they never mutate application data beyond an optional,
clearly-scoped seed of demo products for the search corpus.

## Decisions (proposed — confirm before plan)

- **Two CLIs, one shared metrics library.** Pure metric math lives in a real
  package (`app/eval/`) so it is unit-tested and coverage-counted; the runnable
  entrypoints live in `app/scripts/` (which `setup.cfg` already excludes from
  coverage as run-once CLIs).
- **No new heavy dependencies.** NDCG, recall, confusion matrix, precision/
  recall/F1, and ROC-AUC are implemented by hand (a few lines each) — no
  scikit-learn. This matches the existing convention (`train_fraud_model.py`
  already hand-rolls Mann–Whitney AUC to avoid sklearn) and keeps the
  disk/CUDA-sensitive image lean. `numpy` is already a dep.
- **Fraud eval reuses the training data generator.** `eval_fraud.py` imports
  `_generate_dataset` from `app.scripts.train_fraud_model` (fixed `--seed`) to
  produce a **holdout** labeled set, runs the real scorer (`score_order` on
  `FraudFeatures`), and reports metrics at `REVIEW_THRESHOLD`. It works with or
  without a trained booster: no artifact → the heuristic `_fake_score` is
  evaluated (with a logged note), so it always runs in CI-like environments.
- **Search eval is model-honest.** Meaningful semantic NDCG requires the real
  `all-MiniLM-L6-v2` encoder, so `eval_search.py` is documented as an offline
  tool run with `SHOPFLOW_FAKE_EMBEDDINGS` **unset** against a seeded corpus. The
  deterministic fake encoder produces semantically-random vectors, so a
  `--fake-embeddings` run is supported only for smoke-testing the harness plumbing
  (it prints a warning that the numbers are not meaningful).
- **Golden query set is a versioned fixture**, hand-authored, small (~8–12
  queries), with graded relevance so NDCG (not just binary recall) is meaningful.

## Architecture & components

Mirrors existing conventions: swap-hook/fake toggles for determinism, real-DB
access via the same async engine, `app/scripts/*` for run-once CLIs, JSON
artifacts gitignored.

- **`app/eval/__init__.py`** — new package.
- **`app/eval/metrics.py`** — pure, dependency-light functions (unit-tested,
  coverage-counted):
  - `dcg_at_k(gains: list[float], k: int) -> float`
  - `ndcg_at_k(ranked_relevances: list[float], ideal_relevances: list[float], k: int) -> float`
  - `recall_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float`
  - `confusion_matrix(y_true: list[int], y_pred: list[int]) -> dict` → `{tp, fp, tn, fn}`
  - `classification_metrics(cm: dict) -> dict` → `{precision, recall, f1, accuracy}`
  - `roc_auc(y_true, y_score) -> float` (Mann–Whitney; may be lifted/shared from
    the training script so there is one implementation).
- **`app/eval/data/search_golden.json`** — the golden query set:
  `[{ "query": str, "relevant": [{ "title": str, "relevance": int }] }]`, graded
  0–3. Also carries the demo product corpus (titles + descriptions + category) so
  the harness can seed a clean set on demand.
- **`app/scripts/eval_search.py`** — CLI (coverage-excluded):
  1. Optionally seed the golden corpus of products (encode-on-write via the real
     product create path or `embed_product_text`), tagged so it can be cleaned up.
  2. For each mode ∈ {lexical, semantic, hybrid}: run every golden query through
     the existing `_lexical/_semantic/_hybrid_search` helpers (or the `/search`
     endpoint), map returned products back to relevance grades, compute NDCG@k and
     recall@k, average across queries.
  3. Print a per-mode table; write `eval_reports/search_eval_<...>.json`.
  Flags: `--k 10`, `--seed-corpus/--no-seed-corpus`, `--fake-embeddings` (smoke
  only, warns), `--out PATH`.
- **`app/scripts/eval_fraud.py`** — CLI (coverage-excluded):
  1. `_generate_dataset(n, fraud_rate, rng)` with a fixed seed → holdout features
     + labels.
  2. Score each row via `app.ml.fraud.score_order` (real model if the artifact is
     present, else heuristic — reported which).
  3. `y_pred = score >= REVIEW_THRESHOLD`; compute confusion matrix +
     precision/recall/F1/accuracy + ROC-AUC.
  4. Print the confusion matrix + metrics; write
     `eval_reports/fraud_eval_<...>.json`.
  Flags: `--samples 5000`, `--fraud-rate 0.12`, `--seed 7`,
  `--threshold` (default `REVIEW_THRESHOLD`), `--out PATH`.
- **`.gitignore`** — add `eval_reports/` (generated artifacts) and
  `backend/eval_reports/`.

## Data flow

**Search:** golden fixture → (optional) seed corpus + embeddings → per-mode search
→ map hits to graded relevance → `ndcg_at_k` / `recall_at_k` per query → mean per
mode → table + JSON report.

**Fraud:** `_generate_dataset(seed)` → `FraudFeatures` rows → `score_order` →
threshold → `confusion_matrix` + `classification_metrics` + `roc_auc` → table +
JSON report.

## Testing (real Postgres for search plumbing; no external API / model in CI)

- **Unit** (`tests/unit/test_eval_metrics.py`): hand-computed expected values —
  - `ndcg_at_k`: perfect ranking → 1.0; a known reordering → a known fraction;
    empty / all-zero relevance → 0.0.
  - `recall_at_k`: partial and full retrieval cases.
  - `confusion_matrix` / `classification_metrics`: a tiny labeled vector with
    hand-computed tp/fp/tn/fn and P/R/F1; divide-by-zero guarded (→ 0.0).
  - `roc_auc`: perfectly separable → 1.0; random tie case → ~0.5.
- **Integration** (`tests/integration/test_eval_search_smoke.py`): with
  `SHOPFLOW_FAKE_EMBEDDINGS=1`, seed the small golden corpus and run the search
  evaluator's core function end-to-end; assert it returns a well-formed
  per-mode report dict (keys present, NDCG/recall in `[0, 1]`) — **not** asserting
  quality numbers (fake embeddings are semantically random).
- **Integration** (`tests/integration/test_eval_fraud_smoke.py` or unit): run the
  fraud evaluator on a tiny generated set with the heuristic scorer; assert the
  report has a confusion matrix summing to N and metrics in `[0, 1]`.

CI gates unchanged: flake8 (`--max-line-length=120 --extend-ignore=E501,W503,E203`;
no F401), pytest `--cov=app --cov-fail-under=70`. `app/eval/metrics.py` is fully
covered by unit tests; `app/scripts/eval_*.py` are coverage-excluded run-once CLIs.

## Scope

**In:** search NDCG@k + recall@k across the three modes over a graded golden set;
fraud confusion matrix + precision/recall/F1/accuracy + ROC-AUC at the review
threshold; two CLIs; shared hand-rolled metrics library; JSON report artifacts;
deterministic, network-free tests of the metric math and harness plumbing.

**Out (documented future extensions):**
- Wiring the harness into CI as a scored gate (it stays an on-demand report;
  fake embeddings make an automated semantic-NDCG threshold meaningless).
- MRR / MAP / precision@k beyond NDCG + recall (easy to add later in `metrics.py`).
- A Grafana panel / dashboard for eval trends over time.
- Threshold sweep / PR-curve plots for the fraud model.
- Human-labeled (vs. synthetic) fraud evaluation set.

## Follow-up after implementation

- Fill `PROMPT_LOG.md` Entry 28.
- Update memory (`shopflow_project.md`, `shopflow_conventions.md` if a new
  convention lands — e.g. the `app/eval/` package and `eval_reports/` artifacts).
- Verify against the exact CI commands before committing (flake8 flags + coverage
  gate, in-container with `COVERAGE_FILE=/tmp/.coverage`).
