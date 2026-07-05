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
