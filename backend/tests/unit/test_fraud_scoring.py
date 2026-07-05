"""Unit tests for the heuristic fraud scorer and feature vector contract."""
from app.ml.fraud import (
    FEATURE_NAMES,
    MAX_REASONS,
    REVIEW_THRESHOLD,
    FraudFeatures,
    _fake_score,
)


def _features(**overrides) -> FraudFeatures:
    """A low-risk baseline order; override individual fields per test."""
    base = dict(
        order_total=40.0,
        item_count=2,
        distinct_items=2,
        avg_unit_price=20.0,
        max_unit_price=25.0,
        account_age_hours=5000.0,  # established account (~7 months)
        prior_order_count=8,
        prior_cancellation_count=0,
        discount_ratio=0.0,
        is_off_hours=0,
    )
    base.update(overrides)
    return FraudFeatures(**base)


def test_feature_vector_matches_feature_names():
    vec = _features().to_vector()
    assert len(vec) == len(FEATURE_NAMES)
    assert all(isinstance(v, float) for v in vec)


def test_established_customer_small_order_is_low_risk():
    pred = _fake_score(_features())
    assert pred.score < REVIEW_THRESHOLD
    assert pred.is_flagged is False


def test_new_account_small_order_stays_below_threshold():
    # A brand-new account alone should not flag a small, full-price order.
    pred = _fake_score(_features(account_age_hours=0.0, prior_order_count=0))
    assert pred.score < REVIEW_THRESHOLD
    assert pred.is_flagged is False


def test_new_account_high_value_order_is_flagged():
    pred = _fake_score(
        _features(
            order_total=2000.0,
            avg_unit_price=2000.0,
            max_unit_price=2000.0,
            item_count=1,
            distinct_items=1,
            account_age_hours=0.0,
            prior_order_count=0,
        )
    )
    assert pred.score >= REVIEW_THRESHOLD
    assert pred.is_flagged is True
    assert "Unusually high order value" in pred.reasons


def test_heavy_discount_and_cancellations_flag():
    pred = _fake_score(
        _features(
            discount_ratio=0.8,
            prior_cancellation_count=4,
            account_age_hours=0.0,
            prior_order_count=0,
            is_off_hours=1,
        )
    )
    assert pred.is_flagged is True
    assert "Large discount applied" in pred.reasons


def test_reasons_are_capped():
    # Everything maxed out — reasons must still be bounded.
    pred = _fake_score(
        _features(
            order_total=5000.0,
            max_unit_price=5000.0,
            account_age_hours=0.0,
            prior_order_count=0,
            prior_cancellation_count=10,
            discount_ratio=0.9,
            is_off_hours=1,
        )
    )
    assert 0 < len(pred.reasons) <= MAX_REASONS


def test_score_is_deterministic():
    f = _features(order_total=800.0, account_age_hours=10.0, prior_order_count=0)
    assert _fake_score(f).score == _fake_score(f).score
