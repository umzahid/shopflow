"""Cursor-based pagination.

Cursor encodes (created_at, id) — created_at orders, id breaks ties.
Pages sort by (created_at DESC, id DESC); next page is everything strictly
less than the cursor tuple. Opaque base64 to keep clients from parsing it.
"""
import base64
import binascii
from datetime import datetime
from typing import Sequence, TypeVar

from fastapi import HTTPException, status
from sqlalchemy import tuple_
from sqlalchemy.sql import Select


DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

T = TypeVar("T")


def bad_cursor(instance: str = "") -> HTTPException:
    """RFC 7807 400 for a malformed cursor — shared by every cursor scheme."""
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "type": "https://shopflow.io/errors/bad-request",
            "title": "Bad Request",
            "status": 400,
            "detail": "Invalid pagination cursor",
            "instance": instance,
        },
    )


def encode_cursor_parts(*parts: str) -> str:
    """Opaque base64 of `part|part|...` — the low-level codec every cursor
    scheme shares. Callers stringify their own values before encoding."""
    return base64.urlsafe_b64encode("|".join(parts).encode()).decode().rstrip("=")


def decode_cursor_parts(cursor: str, count: int, *, instance: str = "") -> list[str]:
    """Inverse of encode_cursor_parts; raises bad_cursor on a malformed cursor.
    Returns exactly `count` string parts; callers convert to their own types."""
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(cursor + padding).decode()
    except (binascii.Error, UnicodeDecodeError) as e:
        raise bad_cursor(instance) from e
    parts = raw.split("|", count - 1)
    if len(parts) != count:
        raise bad_cursor(instance)
    return parts


def encode_cursor(created_at: datetime, id_: str) -> str:
    return encode_cursor_parts(created_at.isoformat(), id_)


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    created_at_str, id_ = decode_cursor_parts(cursor, 2)
    try:
        return datetime.fromisoformat(created_at_str), id_
    except ValueError as e:
        raise bad_cursor() from e


def apply_cursor(
    stmt: Select,
    created_at_col,
    id_col,
    cursor: str | None,
    page_size: int,
) -> Select:
    """Append WHERE/ORDER BY/LIMIT for cursor pagination.

    Caller fetches `page_size + 1` rows; if the result is longer, the last row
    is dropped and its predecessor's cursor is returned as next_cursor.
    """
    if cursor:
        c_at, c_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(created_at_col, id_col) < tuple_(c_at, c_id))
    return stmt.order_by(created_at_col.desc(), id_col.desc()).limit(page_size + 1)


def resolve_page_size(requested: int | None) -> int:
    if requested is None:
        return DEFAULT_PAGE_SIZE
    if requested < 1:
        return DEFAULT_PAGE_SIZE
    return min(requested, MAX_PAGE_SIZE)


def build_page(
    rows: Sequence[T],
    page_size: int,
    cursor_fn,
) -> tuple[list[T], str | None]:
    """Trim the +1 sentinel, return (items, next_cursor).

    cursor_fn: callable(row) -> str, applied to the LAST kept item.
    """
    has_more = len(rows) > page_size
    items = list(rows[:page_size])
    next_cursor = cursor_fn(items[-1]) if has_more and items else None
    return items, next_cursor
