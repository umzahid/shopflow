from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class RevenueWindows(BaseModel):
    last_7d: Decimal = Decimal("0")
    last_30d: Decimal = Decimal("0")
    last_90d: Decimal = Decimal("0")


class OrderStatusCount(BaseModel):
    status: str
    count: int


class TopProduct(BaseModel):
    product_id: str
    title: str
    units_sold: int
    revenue: Decimal


class MerchantDashboard(BaseModel):
    revenue: RevenueWindows
    orders_by_status: list[OrderStatusCount]
    top_products: list[TopProduct]


class DailyRevenue(BaseModel):
    day: date
    revenue: Decimal


class RevenueSummary(BaseModel):
    start: date
    end: date
    series: list[DailyRevenue]


class PlatformStats(BaseModel):
    total_users: int
    total_orders: int
    total_revenue: Decimal
    orders_by_status: list[OrderStatusCount]


class RevenueSummaryQuery(BaseModel):
    """Validated dates; FastAPI builds this from query params."""
    start: date = Field(description="Inclusive start date, YYYY-MM-DD")
    end: date = Field(description="Inclusive end date, YYYY-MM-DD")


class ForecastPointResponse(BaseModel):
    ds: date
    yhat: float
    yhat_lower: float
    yhat_upper: float


class ProductForecastResponse(BaseModel):
    product_id: str
    horizon_days: int
    points: list[ForecastPointResponse]


class RestockAlertResponse(BaseModel):
    product_id: str
    title: str
    current_stock: int
    predicted_demand_units: float
    shortfall_units: float
    days_until_stockout: int | None


class RestockAlertsResponse(BaseModel):
    lead_time_days: int
    alerts: list[RestockAlertResponse]
