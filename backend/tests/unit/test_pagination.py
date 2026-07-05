"""Cursor pagination — encode/decode round-trip and edge cases."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.core.pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    build_page,
    decode_cursor,
    encode_cursor,
    resolve_page_size,
)


def test_encode_decode_roundtrip():
    dt = datetime(2026, 6, 13, 14, 30, 0, tzinfo=timezone.utc)
    cursor = encode_cursor(dt, "abc-123")
    out_dt, out_id = decode_cursor(cursor)
    assert out_dt == dt
    assert out_id == "abc-123"


def test_cursor_is_opaque_base64url_with_no_padding():
    cursor = encode_cursor(datetime.now(timezone.utc), "x")
    assert "=" not in cursor
    # base64url uses '-' and '_' instead of '+' and '/'
    assert "+" not in cursor
    assert "/" not in cursor


def test_decode_invalid_cursor_raises_400():
    with pytest.raises(HTTPException) as exc:
        decode_cursor("!!!not-base64!!!")
    assert exc.value.status_code == 400


def test_decode_malformed_payload_raises_400():
    # Base64-decodable but no '|' separator
    import base64
    bad = base64.urlsafe_b64encode(b"no-pipe").decode().rstrip("=")
    with pytest.raises(HTTPException):
        decode_cursor(bad)


def test_resolve_page_size_defaults():
    assert resolve_page_size(None) == DEFAULT_PAGE_SIZE


def test_resolve_page_size_clamps_to_max():
    assert resolve_page_size(99999) == MAX_PAGE_SIZE


def test_resolve_page_size_clamps_negative_to_default():
    assert resolve_page_size(-5) == DEFAULT_PAGE_SIZE
    assert resolve_page_size(0) == DEFAULT_PAGE_SIZE


def test_resolve_page_size_passthrough_in_range():
    assert resolve_page_size(25) == 25


class _FakeRow:
    def __init__(self, id_: str):
        self.id = id_


def test_build_page_no_next_cursor_when_underfilled():
    rows = [_FakeRow("a"), _FakeRow("b")]
    items, next_cursor = build_page(rows, page_size=5, cursor_fn=lambda r: r.id)
    assert items == rows
    assert next_cursor is None


def test_build_page_has_next_cursor_when_overfilled():
    # build_page assumes caller fetched page_size+1; if longer, has_more=True
    rows = [_FakeRow("a"), _FakeRow("b"), _FakeRow("c")]
    items, next_cursor = build_page(rows, page_size=2, cursor_fn=lambda r: r.id)
    assert len(items) == 2
    assert items[-1].id == "b"
    assert next_cursor == "b"


def test_build_page_empty_rows():
    items, next_cursor = build_page([], page_size=10, cursor_fn=lambda r: r.id)
    assert items == []
    assert next_cursor is None


def test_build_page_exact_page_size_no_next_cursor():
    rows = [_FakeRow("a"), _FakeRow("b"), _FakeRow("c")]
    items, next_cursor = build_page(rows, page_size=3, cursor_fn=lambda r: r.id)
    assert items == rows
    assert next_cursor is None
