"""Train the LightGBM fraud classifier on synthetic labeled orders.

There is no labeled fraud data in a fresh ShopFlow install, so this script
generates a synthetic dataset with a *planted* signal — new accounts with thin
history placing high-value or heavily-discounted orders (especially off-hours)
are more likely to be fraud — trains a gradient-boosted classifier on it, and
saves the booster to the artifact `app/ml/fraud.py` loads at runtime.

The feature columns and their order match `app.ml.fraud.FEATURE_NAMES` exactly;
that ordering is the contract between training and scoring.

Deterministic by `--seed`. AUC and a confusion matrix are printed so the model's
quality is visible without a separate eval step.

Run:
    python -m app.scripts.train_fraud_model [--samples 20000] [--seed 42]
                                            [--fraud-rate 0.12] [--out PATH]
"""
from __future__ import annotations

import argparse

import numpy as np

from app.ml.fraud import FEATURE_NAMES, MODEL_PATH, REVIEW_THRESHOLD


def _generate_dataset(
    n: int, fraud_rate: float, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    """Build an (n, len(FEATURE_NAMES)) feature matrix and binary labels.

    Features are drawn from plausible marginal distributions; the fraud label is
    sampled from a logistic of a hand-built risk score plus noise, then calibrated
    to roughly `fraud_rate` positives.
    """
    order_total = rng.gamma(shape=2.0, scale=120.0, size=n)  # right-skewed, mean ~240
    item_count = rng.poisson(lam=2.5, size=n) + 1
    distinct_items = np.minimum(item_count, rng.poisson(lam=1.5, size=n) + 1)
    avg_unit_price = order_total / item_count
    max_unit_price = avg_unit_price * rng.uniform(1.0, 2.5, size=n)
    account_age_hours = rng.exponential(scale=720.0, size=n)  # mean ~30 days
    prior_order_count = rng.poisson(lam=3.0, size=n)
    prior_cancellation_count = rng.binomial(n=prior_order_count + 1, p=0.05)
    discount_ratio = np.clip(rng.beta(a=1.2, b=8.0, size=n), 0.0, 0.9)
    is_off_hours = rng.binomial(n=1, p=0.2, size=n).astype(float)
    # Most orders are the only one from their IP in 24h; a heavy tail models
    # card-testing bursts.
    orders_from_ip_24h = rng.poisson(lam=0.4, size=n).astype(float)
    billing_shipping_mismatch = rng.binomial(n=1, p=0.15, size=n).astype(float)

    new_account = np.clip(1.0 - account_age_hours / 168.0, 0.0, 1.0)
    no_history = (prior_order_count == 0).astype(float)

    # Planted linear risk signal (same shape the heuristic scorer approximates).
    risk = (
        0.9 * np.minimum(order_total / 1000.0, 1.5)
        + 0.6 * new_account
        + 0.5 * no_history
        + 0.9 * np.minimum(prior_cancellation_count / 3.0, 1.0)
        + 1.6 * discount_ratio
        + 0.4 * is_off_hours
        + 0.5 * np.minimum(max_unit_price / 500.0, 1.0)
        + 0.7 * np.minimum(orders_from_ip_24h / 5.0, 1.0)
        + 0.8 * billing_shipping_mismatch
    )
    risk += rng.normal(0.0, 0.4, size=n)  # irreducible noise

    # Calibrate the intercept so the positive rate ≈ fraud_rate.
    intercept = np.quantile(risk, 1.0 - fraud_rate)
    prob = 1.0 / (1.0 + np.exp(-3.0 * (risk - intercept)))
    labels = (rng.uniform(size=n) < prob).astype(int)

    features = np.column_stack(
        [
            order_total,
            item_count,
            distinct_items,
            avg_unit_price,
            max_unit_price,
            account_age_hours,
            prior_order_count,
            prior_cancellation_count,
            discount_ratio,
            is_off_hours,
            orders_from_ip_24h,
            billing_shipping_mismatch,
        ]
    )
    assert features.shape[1] == len(FEATURE_NAMES), "feature column count drifted from FEATURE_NAMES"
    return features, labels


def _roc_auc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    """Rank-based AUC (Mann–Whitney U) — avoids a scikit-learn dependency."""
    order = np.argsort(y_score, kind="mergesort")
    ranks = np.empty(len(y_score), dtype=float)
    ranks[order] = np.arange(1, len(y_score) + 1)
    # Average ranks over ties so ties count as 0.5.
    _, inv, counts = np.unique(y_score, return_inverse=True, return_counts=True)
    tie_sum = np.zeros(len(counts))
    np.add.at(tie_sum, inv, ranks)
    ranks = (tie_sum / counts)[inv]

    n_pos = int(y_true.sum())
    n_neg = len(y_true) - n_pos
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    sum_pos_ranks = ranks[y_true == 1].sum()
    return float((sum_pos_ranks - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def _confusion(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[int, int, int, int]:
    tp = int(np.sum((y_pred == 1) & (y_true == 1)))
    fp = int(np.sum((y_pred == 1) & (y_true == 0)))
    fn = int(np.sum((y_pred == 0) & (y_true == 1)))
    tn = int(np.sum((y_pred == 0) & (y_true == 0)))
    return tp, fp, fn, tn


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the LightGBM fraud classifier.")
    parser.add_argument("--samples", type=int, default=20000, help="Synthetic rows to generate.")
    parser.add_argument("--fraud-rate", type=float, default=0.12, help="Target positive rate.")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducibility.")
    parser.add_argument("--out", type=str, default=str(MODEL_PATH), help="Booster output path.")
    args = parser.parse_args()

    import lightgbm as lgb

    rng = np.random.default_rng(args.seed)
    x, y = _generate_dataset(args.samples, args.fraud_rate, rng)

    # 80/20 train/val split.
    split = int(len(x) * 0.8)
    perm = rng.permutation(len(x))
    tr, va = perm[:split], perm[split:]
    x_tr, y_tr, x_va, y_va = x[tr], y[tr], x[va], y[va]

    print(f"→ {len(x)} samples ({int(y.sum())} fraud, {y.mean():.1%} positive rate)")
    train_set = lgb.Dataset(x_tr, label=y_tr, feature_name=FEATURE_NAMES)
    val_set = lgb.Dataset(x_va, label=y_va, reference=train_set, feature_name=FEATURE_NAMES)

    params = {
        "objective": "binary",
        "metric": "auc",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_data_in_leaf": 50,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
        "seed": args.seed,
        "verbosity": -1,
    }
    booster = lgb.train(
        params,
        train_set,
        num_boost_round=300,
        valid_sets=[val_set],
        callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(0)],
    )

    scores = booster.predict(x_va)
    preds = (scores >= REVIEW_THRESHOLD).astype(int)
    auc = _roc_auc(y_va, scores)
    tp, fp, fn, tn = _confusion(y_va, preds)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0

    print(f"✓ Validation AUC: {auc:.4f}")
    print(f"  Confusion @ threshold {REVIEW_THRESHOLD}:")
    print("                 pred_fraud  pred_ok")
    print(f"    true_fraud   {tp:>10} {fn:>8}")
    print(f"    true_ok      {fp:>10} {tn:>8}")
    print(f"  Precision: {precision:.3f}  Recall: {recall:.3f}")

    out_path = args.out
    booster.save_model(out_path)
    print(f"✓ Saved booster → {out_path}")


if __name__ == "__main__":
    main()
