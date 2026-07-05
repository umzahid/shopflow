"""Restock alerts — flag products whose forecast demand outstrips on-hand stock.

Powered by app.ml.forecast; a "restock alert" fires when the cumulative
predicted demand across the merchant's chosen lead time exceeds the current
`stock_qty`. Alerts are sorted by shortfall (largest first) so the most
urgent items surface at the top.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.forecast import ForecastPoint, forecast_product_demand
from app.models.models import Product, ProductStatus


@dataclass
class RestockAlert:
    product_id: str
    title: str
    current_stock: int
    predicted_demand_units: float
    shortfall_units: float
    days_until_stockout: int | None

    def to_dict(self) -> dict:
        return {
            "product_id": self.product_id,
            "title": self.title,
            "current_stock": self.current_stock,
            "predicted_demand_units": round(self.predicted_demand_units, 2),
            "shortfall_units": round(self.shortfall_units, 2),
            "days_until_stockout": self.days_until_stockout,
        }


def _days_until_stockout(points: Iterable[ForecastPoint], stock: int) -> int | None:
    """Walk the forecast day-by-day, subtracting from stock. Return the 1-based
    day index at which cumulative demand exceeds stock, or None if it never
    does within the window."""
    running = 0.0
    for i, p in enumerate(points, start=1):
        running += p.yhat
        if running > stock:
            return i
    return None


async def get_restock_alerts(
    db: AsyncSession,
    merchant_id: str,
    lead_time_days: int = 7,
) -> list[RestockAlert]:
    stmt = select(Product).where(
        Product.merchant_id == merchant_id,
        Product.status == ProductStatus.active,
        Product.deleted_at.is_(None),
    )
    products = (await db.execute(stmt)).scalars().all()

    alerts: list[RestockAlert] = []
    for product in products:
        forecast = await forecast_product_demand(db, product.id, lead_time_days)
        if not forecast:
            continue

        predicted_demand = sum(p.yhat for p in forecast)
        if predicted_demand <= product.stock_qty:
            continue

        alerts.append(
            RestockAlert(
                product_id=product.id,
                title=product.title,
                current_stock=product.stock_qty,
                predicted_demand_units=predicted_demand,
                shortfall_units=predicted_demand - product.stock_qty,
                days_until_stockout=_days_until_stockout(forecast, product.stock_qty),
            )
        )

    alerts.sort(key=lambda a: a.shortfall_units, reverse=True)
    return alerts
