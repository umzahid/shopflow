"""Prophet-based demand forecasting for individual products.

Aggregates historical `order_items` into daily unit-sold counts, fits a
Prophet model, and returns per-day predictions with confidence intervals.

Prophet fits are relatively slow (~1-2s each) so results are cached in Redis
for 24 hours per (product_id, horizon) pair — cache-miss traffic funnels
into a single fit, subsequent hits return in <5ms.

Tests short-circuit the fit via `set_forecaster()` or the
`SHOPFLOW_FAKE_FORECAST=1` env var to avoid pulling Prophet's stan backend
into every CI run.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.models import Order, OrderItem, OrderStatus

REVENUE_STATUSES = (OrderStatus.confirmed, OrderStatus.shipped, OrderStatus.delivered)
CACHE_TTL_SECONDS = 24 * 60 * 60
MIN_HISTORY_DAYS = 14  # Prophet gives noisy fits with less than two weeks.


@dataclass
class ForecastPoint:
    ds: date
    yhat: float
    yhat_lower: float
    yhat_upper: float

    def to_dict(self) -> dict:
        return {
            "ds": self.ds.isoformat(),
            "yhat": self.yhat,
            "yhat_lower": self.yhat_lower,
            "yhat_upper": self.yhat_upper,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ForecastPoint":
        return cls(
            ds=date.fromisoformat(d["ds"]),
            yhat=d["yhat"],
            yhat_lower=d["yhat_lower"],
            yhat_upper=d["yhat_upper"],
        )


ForecasterFn = Callable[[list[tuple[date, int]], int], list[ForecastPoint]]

_forecaster_override: ForecasterFn | None = None


def _fake_forecast(history: list[tuple[date, int]], horizon: int) -> list[ForecastPoint]:
    """Linear projection using mean(last 14d) with a ±20% band. Deterministic,
    fast, and good enough to exercise the ranking logic in tests."""
    if not history:
        return []
    recent = history[-14:] if len(history) >= 14 else history
    mean_y = sum(y for _, y in recent) / len(recent)
    last_date = history[-1][0]
    return [
        ForecastPoint(
            ds=last_date + timedelta(days=i + 1),
            yhat=mean_y,
            yhat_lower=mean_y * 0.8,
            yhat_upper=mean_y * 1.2,
        )
        for i in range(horizon)
    ]


def _prophet_forecast(history: list[tuple[date, int]], horizon: int) -> list[ForecastPoint]:
    """Real Prophet fit — imported lazily so the module load itself is cheap."""
    import pandas as pd
    from prophet import Prophet

    df = pd.DataFrame(
        {"ds": [pd.Timestamp(d) for d, _ in history], "y": [y for _, y in history]}
    )
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=False,
        interval_width=0.8,
    )
    # Silence Stan chatter — logs go straight to stderr otherwise.
    import logging

    logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
    logging.getLogger("prophet").setLevel(logging.WARNING)

    model.fit(df)
    future = model.make_future_dataframe(periods=horizon, include_history=False)
    forecast = model.predict(future)

    points: list[ForecastPoint] = []
    for _, row in forecast.iterrows():
        # Clamp negative predictions — you can't sell fewer than zero units.
        yhat = max(0.0, float(row["yhat"]))
        lower = max(0.0, float(row["yhat_lower"]))
        upper = max(0.0, float(row["yhat_upper"]))
        points.append(
            ForecastPoint(
                ds=row["ds"].date(),
                yhat=yhat,
                yhat_lower=lower,
                yhat_upper=upper,
            )
        )
    return points


def set_forecaster(fn: ForecasterFn | None) -> None:
    """Test hook — swap in a custom forecaster or None to restore the default."""
    global _forecaster_override
    _forecaster_override = fn


def _current_forecaster() -> ForecasterFn:
    if _forecaster_override is not None:
        return _forecaster_override
    if os.getenv("SHOPFLOW_FAKE_FORECAST") == "1":
        return _fake_forecast
    return _prophet_forecast


async def _load_daily_sales(db: AsyncSession, product_id: str) -> list[tuple[date, int]]:
    """Sum units sold per day, revenue-status orders only. Missing days are
    filled with zeros so Prophet sees a continuous series."""
    stmt = (
        select(
            func.date_trunc("day", Order.created_at).label("day"),
            func.sum(OrderItem.quantity).label("units"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            OrderItem.product_id == product_id,
            Order.status.in_(REVENUE_STATUSES),
        )
        .group_by("day")
        .order_by("day")
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    by_day: dict[date, int] = {}
    for row in rows:
        d = row.day.date() if hasattr(row.day, "date") else row.day
        by_day[d] = int(row.units)

    first, last = min(by_day), max(by_day)
    span = (last - first).days + 1
    return [(first + timedelta(days=i), by_day.get(first + timedelta(days=i), 0)) for i in range(span)]


async def forecast_product_demand(
    db: AsyncSession,
    product_id: str,
    horizon_days: int,
    force_refresh: bool = False,
) -> list[ForecastPoint]:
    """Forecast next `horizon_days` daily unit demand for `product_id`.

    Returns an empty list if the product has fewer than MIN_HISTORY_DAYS of
    sales — Prophet can technically fit shorter series but the confidence
    bands become uninformative.
    """
    cache_key = f"forecast:{product_id}:{horizon_days}"
    redis = await get_redis()

    if not force_refresh:
        cached = await redis.get(cache_key)
        if cached:
            payload = json.loads(cached)
            return [ForecastPoint.from_dict(p) for p in payload]

    history = await _load_daily_sales(db, product_id)
    if len(history) < MIN_HISTORY_DAYS:
        return []

    forecaster = _current_forecaster()
    points = forecaster(history, horizon_days)

    await redis.setex(
        cache_key,
        CACHE_TTL_SECONDS,
        json.dumps([p.to_dict() for p in points]),
    )
    return points


async def invalidate_forecast_cache(product_id: str) -> None:
    """Clear cached forecasts for one product. Call from admin tools or when
    the underlying sales history changes materially."""
    redis = await get_redis()
    async for key in redis.scan_iter(match=f"forecast:{product_id}:*"):
        await redis.delete(key)
