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
    # Discrimination floor: the heuristic scorer must actually rank fraud above
    # legit (deterministic at this seed, AUC ~0.71). Catches a silently-degraded
    # or constant scorer that would otherwise pass the shape-only checks above.
    assert m["roc_auc"] > 0.65


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
