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
