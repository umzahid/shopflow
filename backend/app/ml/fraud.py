"""LightGBM fraud scoring for checkout orders.

A trained gradient-boosted classifier scores each order at checkout, producing
a fraud probability in [0, 1] (stored on `Order.fraud_score`) plus a short list
of human-readable reasons (stored on `Order.fraud_reasons`). Orders scoring at
or above `REVIEW_THRESHOLD` are routed to `pending_review` instead of `pending`.

Reasons come from *per-order* SHAP feature attributions. Rather than pull in the
`shap` package (which drags in `numba` and a tighter numpy pin — a bad trade for
an already CUDA/disk-sensitive image), we use LightGBM's built-in TreeSHAP via
`Booster.predict(X, pred_contrib=True)`. The top positively-contributing features
map to the templated phrases below.

Like the embedding/forecast wrappers, the real model is loaded lazily so importing
this module is cheap, and tests short-circuit scoring via `set_scorer()` or the
`SHOPFLOW_FAKE_FRAUD=1` env var. When no trained artifact is present the module
falls back to a deterministic heuristic scorer (with a logged warning) so the app
never hard-fails at checkout.
"""
from __future__ import annotations

import logging
import math
import os
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

# Ordered feature vector. This order is the contract between the training script
# and the scorer — it MUST match the columns the model was trained on.
FEATURE_NAMES = [
    "order_total",
    "item_count",
    "distinct_items",
    "avg_unit_price",
    "max_unit_price",
    "account_age_hours",
    "prior_order_count",
    "prior_cancellation_count",
    "discount_ratio",
    "is_off_hours",
    "orders_from_ip_24h",
    "billing_shipping_mismatch",
]

# How each feature reads when it drives a score up.
_REASON_TEMPLATES = {
    "order_total": "Unusually high order value",
    "item_count": "High item quantity in a single order",
    "distinct_items": "Many distinct products in one order",
    "avg_unit_price": "High average item price",
    "max_unit_price": "Contains an unusually expensive item",
    "account_age_hours": "New customer account",
    "prior_order_count": "Little or no purchase history",
    "prior_cancellation_count": "History of cancelled orders",
    "discount_ratio": "Large discount applied",
    "is_off_hours": "Order placed during off-hours",
    "orders_from_ip_24h": "Many recent orders from the same IP address",
    "billing_shipping_mismatch": "Billing and shipping addresses differ",
}

# Trained booster location. The training script writes here; override in prod via
# env if the artifact ships elsewhere.
MODEL_PATH = Path(
    os.getenv(
        "SHOPFLOW_FRAUD_MODEL_PATH",
        str(Path(__file__).parent / "artifacts" / "fraud_model.txt"),
    )
)
REVIEW_THRESHOLD = float(os.getenv("SHOPFLOW_FRAUD_THRESHOLD", "0.5"))
MAX_REASONS = 3


@dataclass
class FraudFeatures:
    order_total: float
    item_count: int
    distinct_items: int
    avg_unit_price: float
    max_unit_price: float
    account_age_hours: float
    prior_order_count: int
    prior_cancellation_count: int
    discount_ratio: float
    is_off_hours: int
    orders_from_ip_24h: int = 0
    billing_shipping_mismatch: int = 0

    def to_vector(self) -> list[float]:
        """Ordered numeric vector for the model — order matches FEATURE_NAMES."""
        return [float(getattr(self, name)) for name in FEATURE_NAMES]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class FraudPrediction:
    score: float
    is_flagged: bool
    reasons: list[str]

    def to_dict(self) -> dict:
        return {
            "score": round(self.score, 4),
            "is_flagged": self.is_flagged,
            "reasons": self.reasons,
        }


ScorerFn = Callable[[FraudFeatures], FraudPrediction]

_scorer_override: ScorerFn | None = None


def _fake_score(f: FraudFeatures) -> FraudPrediction:
    """Deterministic heuristic scorer — used in tests and as the no-model fallback.

    Mirrors the signal the training script plants: new accounts with no history
    placing high-value or heavily-discounted orders (especially off-hours) are
    riskiest. A plain new account with a small, full-price order stays well below
    the review threshold; risk only crosses it when signals compound.
    """
    new_account = max(0.0, 1.0 - f.account_age_hours / 168.0)  # 1.0 at 0h, 0 by one week
    contributions = {
        "order_total": 0.8 * min(f.order_total / 1000.0, 1.5),
        "max_unit_price": 0.5 * min(f.max_unit_price / 500.0, 1.0),
        "account_age_hours": 0.6 * new_account,
        "prior_order_count": 0.5 if f.prior_order_count == 0 else 0.0,
        "prior_cancellation_count": 0.7 * min(f.prior_cancellation_count / 3.0, 1.0),
        "discount_ratio": 1.2 * min(f.discount_ratio, 1.0),
        "is_off_hours": 0.4 * f.is_off_hours,
        "orders_from_ip_24h": 0.5 * min(f.orders_from_ip_24h / 5.0, 1.0),
        "billing_shipping_mismatch": 0.6 * f.billing_shipping_mismatch,
    }
    raw = sum(contributions.values())
    # Logistic centred so ~raw=2.0 sits at the 0.5 mark.
    score = 1.0 / (1.0 + math.exp(-3.0 * (raw - 2.0)))
    reasons = _reasons_from_contributions(contributions, min_contribution=0.15)
    return FraudPrediction(score=score, is_flagged=score >= REVIEW_THRESHOLD, reasons=reasons)


def _reasons_from_contributions(
    contributions: dict[str, float], min_contribution: float
) -> list[str]:
    """Top MAX_REASONS features by positive contribution → templated phrases."""
    ranked = sorted(contributions.items(), key=lambda kv: kv[1], reverse=True)
    return [
        _REASON_TEMPLATES[name]
        for name, value in ranked
        if value > min_contribution and name in _REASON_TEMPLATES
    ][:MAX_REASONS]


@lru_cache(maxsize=1)
def _load_booster():  # pragma: no cover - requires a trained artifact, out of test scope
    import lightgbm as lgb

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Fraud model artifact not found at {MODEL_PATH}")
    return lgb.Booster(model_file=str(MODEL_PATH))


def _model_score(f: FraudFeatures) -> FraudPrediction:  # pragma: no cover - needs lightgbm + artifact
    import numpy as np

    booster = _load_booster()
    x = np.array([f.to_vector()], dtype=float)
    score = float(booster.predict(x)[0])

    # Native TreeSHAP: one column per feature plus a trailing bias/expected-value
    # term. Positive contributions pushed the score up → those are the reasons.
    contrib_row = booster.predict(x, pred_contrib=True)[0]
    contributions = {name: float(c) for name, c in zip(FEATURE_NAMES, contrib_row[:-1])}
    reasons = _reasons_from_contributions(contributions, min_contribution=0.0)
    return FraudPrediction(score=score, is_flagged=score >= REVIEW_THRESHOLD, reasons=reasons)


def set_scorer(fn: ScorerFn | None) -> None:
    """Test hook — swap in a custom scorer, or None to restore the default."""
    global _scorer_override
    _scorer_override = fn


@lru_cache(maxsize=1)
def _lightgbm_available() -> bool:
    try:
        import lightgbm  # noqa: F401
        import numpy  # noqa: F401 - _model_score needs it too

        return True
    except ImportError:
        return False


def _current_scorer() -> ScorerFn:
    if _scorer_override is not None:
        return _scorer_override
    if os.getenv("SHOPFLOW_FAKE_FRAUD") == "1":
        return _fake_score
    if not MODEL_PATH.exists():
        logger.warning(
            "Fraud model artifact not found at %s — using heuristic scorer. "
            "Run `python -m app.scripts.train_fraud_model` to train one.",
            MODEL_PATH,
        )
        return _fake_score
    if not _lightgbm_available():
        # Artifact present but the ML runtime isn't installed — never hard-fail
        # checkout; degrade to the heuristic scorer.
        logger.warning("lightgbm unavailable — falling back to heuristic fraud scorer.")
        return _fake_score
    return _model_score


def score_order(features: FraudFeatures) -> FraudPrediction:
    """Score a set of order features, returning probability + flag + reasons."""
    return _current_scorer()(features)
