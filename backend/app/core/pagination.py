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


def encode_cursor(created_at: datetime, id_: str) -> str:
    raw = f"{created_at.isoformat()}|{id_}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(cursor + padding).decode()
        created_at_str, id_ = raw.split("|", 1)
        return datetime.fromisoformat(created_at_str), id_
    except (ValueError, binascii.Error, UnicodeDecodeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "type": "https://shopflow.io/errors/bad-request",
                "title": "Bad Request",
                "status": 400,
                "detail": "Invalid pagination cursor",
                "instance": "",
            },
        ) from e


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
