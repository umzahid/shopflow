"""Order status state machine.

  pending --> confirmed --> shipped --> delivered
     |           |
     +-> cancelled (from pending or confirmed)
     |
     +-> pending_review (fraud detection, Week 6)

  pending_review --> confirmed | cancelled
  delivered is terminal.
"""
from app.models.models import OrderStatus


_ALLOWED: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.pending: {OrderStatus.confirmed, OrderStatus.cancelled, OrderStatus.pending_review},
    OrderStatus.pending_review: {OrderStatus.confirmed, OrderStatus.cancelled},
    OrderStatus.confirmed: {OrderStatus.shipped, OrderStatus.cancelled},
    OrderStatus.shipped: {OrderStatus.delivered},
    OrderStatus.delivered: set(),
    OrderStatus.cancelled: set(),
}


def can_transition(current: OrderStatus, target: OrderStatus) -> bool:
    return target in _ALLOWED[current]


def allowed_transitions(current: OrderStatus) -> list[OrderStatus]:
    return sorted(_ALLOWED[current], key=lambda s: s.value)
