"""Order status state machine."""
from app.models.models import OrderStatus
from app.services.order_state import allowed_transitions, can_transition


def test_pending_can_be_confirmed():
    assert can_transition(OrderStatus.pending, OrderStatus.confirmed)


def test_pending_can_be_cancelled():
    assert can_transition(OrderStatus.pending, OrderStatus.cancelled)


def test_pending_can_go_to_pending_review():
    assert can_transition(OrderStatus.pending, OrderStatus.pending_review)


def test_pending_cannot_jump_to_shipped():
    assert not can_transition(OrderStatus.pending, OrderStatus.shipped)


def test_pending_cannot_jump_to_delivered():
    assert not can_transition(OrderStatus.pending, OrderStatus.delivered)


def test_confirmed_to_shipped():
    assert can_transition(OrderStatus.confirmed, OrderStatus.shipped)


def test_confirmed_to_cancelled_still_allowed():
    assert can_transition(OrderStatus.confirmed, OrderStatus.cancelled)


def test_shipped_to_delivered():
    assert can_transition(OrderStatus.shipped, OrderStatus.delivered)


def test_shipped_cannot_be_cancelled():
    assert not can_transition(OrderStatus.shipped, OrderStatus.cancelled)


def test_delivered_is_terminal():
    for status in OrderStatus:
        assert not can_transition(OrderStatus.delivered, status)


def test_cancelled_is_terminal():
    for status in OrderStatus:
        assert not can_transition(OrderStatus.cancelled, status)


def test_pending_review_to_confirmed():
    assert can_transition(OrderStatus.pending_review, OrderStatus.confirmed)


def test_pending_review_to_cancelled():
    assert can_transition(OrderStatus.pending_review, OrderStatus.cancelled)


def test_allowed_transitions_for_pending_is_sorted():
    out = allowed_transitions(OrderStatus.pending)
    assert [s.value for s in out] == sorted(s.value for s in out)


def test_allowed_transitions_for_terminal_is_empty():
    assert allowed_transitions(OrderStatus.delivered) == []
    assert allowed_transitions(OrderStatus.cancelled) == []
