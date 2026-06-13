"""Cart router helpers — pure logic (no Redis)."""
from decimal import Decimal

from app.api.cart import _to_response


def test_to_response_empty_cart_has_zero_subtotal():
    out = _to_response({})
    assert out.items == []
    assert out.subtotal == Decimal("0")


def test_to_response_one_item_subtotal_matches_line_total():
    raw = {
        "prod-1": {"qty": 2, "unit_price": "10.00", "title": "Widget"},
    }
    out = _to_response(raw)
    assert len(out.items) == 1
    assert out.subtotal == Decimal("20.00")
    assert out.items[0].line_total == Decimal("20.00")


def test_to_response_multi_item_subtotal_is_sum():
    raw = {
        "p1": {"qty": 1, "unit_price": "5.50", "title": "A"},
        "p2": {"qty": 3, "unit_price": "2.00", "title": "B"},
    }
    out = _to_response(raw)
    assert out.subtotal == Decimal("11.50")


def test_to_response_preserves_title():
    raw = {"p1": {"qty": 1, "unit_price": "1.00", "title": "My Product"}}
    out = _to_response(raw)
    assert out.items[0].title == "My Product"
