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
