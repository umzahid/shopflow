"""Custom Prometheus metrics beyond the HTTP defaults.

- db_query_duration_seconds: histogram of SQL statement execution time, wired
  via SQLAlchemy engine cursor events (works for the async engine — the events
  fire on the underlying sync engine).
- active_orders_total: gauge of in-flight orders (pending/confirmed/shipped),
  refreshed by a background task so it self-corrects across restarts.

Both register on prometheus_client's default REGISTRY, which is what the
Instrumentator in main.py exposes at /metrics.
"""
from __future__ import annotations

import asyncio
import logging
import time

from prometheus_client import Gauge, Histogram
from sqlalchemy import event, func, select

logger = logging.getLogger(__name__)

DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "SQL statement execution time in seconds",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)

ACTIVE_ORDERS = Gauge(
    "active_orders_total",
    "Orders currently in flight (pending, confirmed, or shipped)",
)


def instrument_engine(async_engine) -> None:
    """Attach cursor-execute timing to the engine's sync core."""
    sync_engine = async_engine.sync_engine

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):
        context._query_start = time.perf_counter()

    @event.listens_for(sync_engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):
        start = getattr(context, "_query_start", None)
        if start is not None:
            DB_QUERY_DURATION.observe(time.perf_counter() - start)


async def refresh_active_orders_loop(interval_seconds: int = 15) -> None:
    """Periodically set ACTIVE_ORDERS from the DB. Cancelled on shutdown."""
    # Imported here to avoid a circular import at module load.
    from app.core.database import AsyncSessionLocal
    from app.models.models import Order, OrderStatus

    active = (OrderStatus.pending, OrderStatus.confirmed, OrderStatus.shipped)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                count = (
                    await db.execute(
                        select(func.count(Order.id)).where(Order.status.in_(active))
                    )
                ).scalar() or 0
            ACTIVE_ORDERS.set(int(count))
        except Exception as exc:  # noqa: BLE001 - a metrics refresh must never crash the app
            logger.warning("active_orders refresh failed: %s", exc)
        await asyncio.sleep(interval_seconds)
