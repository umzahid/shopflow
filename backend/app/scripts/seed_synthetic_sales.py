"""Seed 180 days of synthetic sales data so Prophet has real signal to fit.

The generator hard-codes weekly seasonality (weekends peak) and a mild upward
trend across the window — the two components Prophet will most obviously
identify. Deterministic by seed so re-runs land on the same numbers.

Run:
    python -m app.scripts.seed_synthetic_sales [--products 10] [--days 180]
                                               [--seed 42] [--reset]

--reset wipes existing seed data (identified by merchant/customer email) before
regenerating, otherwise the script skips products that already exist and
appends new orders to the tail of the window.
"""
from __future__ import annotations

import argparse
import asyncio
import random
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.models.models import (
    Category,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductStatus,
    User,
    UserRole,
)
from app.services.embedding import embed_product_text

SEED_MERCHANT_EMAIL = "seed-merchant@shopflow.io"
SEED_CUSTOMER_EMAIL = "seed-customer@shopflow.io"
SEED_CATEGORY_SLUG = "seed"

SEED_PRODUCT_TITLES = [
    ("Trailhead Runner", "Lightweight trail-running shoe with grippy sole."),
    ("Studio Desk Lamp", "Adjustable LED desk lamp with warm-to-cool tuning."),
    ("Cordless Kettle", "Fast-boil 1.7L kettle with keep-warm setting."),
    ("Everyday Backpack", "Water-resistant 22L backpack with laptop sleeve."),
    ("Wireless Earbuds Pro", "Noise-cancelling earbuds with 24hr charging case."),
    ("Ceramic Mug Set", "Set of four hand-glazed ceramic mugs, 350ml each."),
    ("Yoga Mat Studio", "Non-slip 6mm yoga mat with alignment lines."),
    ("Aluminum Bottle 1L", "Insulated aluminum water bottle, keeps cold 24hrs."),
    ("Bamboo Cutting Board", "Sustainable bamboo cutting board with juice groove."),
    ("Espresso Grinder", "Stepless burr grinder tuned for espresso extraction."),
]

REVENUE_STATUSES = [
    OrderStatus.confirmed,
    OrderStatus.shipped,
    OrderStatus.delivered,
]


async def _get_or_create_user(db, email: str, role: UserRole) -> User:
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        return existing
    user = User(email=email, password_hash=hash_password("SeedPass123!"), role=role)
    db.add(user)
    await db.flush()
    return user


async def _get_or_create_category(db) -> Category:
    existing = (
        await db.execute(select(Category).where(Category.slug == SEED_CATEGORY_SLUG))
    ).scalar_one_or_none()
    if existing:
        return existing
    cat = Category(name="Seed", slug=SEED_CATEGORY_SLUG)
    db.add(cat)
    await db.flush()
    return cat


async def _get_or_create_products(
    db, merchant_id: str, category_id: str, count: int
) -> list[Product]:
    products: list[Product] = []
    for i, (title, description) in enumerate(SEED_PRODUCT_TITLES[:count]):
        existing = (
            await db.execute(select(Product).where(Product.title == title))
        ).scalar_one_or_none()
        if existing:
            products.append(existing)
            continue
        # Prices between $9.99 and $199.99, stepping so forecasts have varied scale.
        price = Decimal(str(9.99 + i * 20))
        p = Product(
            merchant_id=merchant_id,
            category_id=category_id,
            title=title,
            description=description,
            price=price,
            stock_qty=50 + i * 10,
            status=ProductStatus.active,
            embedding=embed_product_text(title, description),
        )
        db.add(p)
        products.append(p)
    await db.flush()
    return products


async def _reset(db, merchant: User, customer: User) -> None:
    """Delete previously-seeded orders + products so we start clean."""
    await db.execute(
        delete(Order).where(Order.customer_id == customer.id)
    )
    await db.execute(
        delete(Product).where(Product.merchant_id == merchant.id)
    )
    await db.flush()


def _orders_for_day(day_index: int, total_days: int, rng: random.Random) -> int:
    """Expected order count per day = trend (5→20 across the window) + weekly
    seasonality (weekends +3) + noise (-2..3). Clamped ≥ 1."""
    trend = 5 + (day_index / total_days) * 15
    weekend_boost = 3 if (day_index % 7) >= 5 else 0
    noise = rng.randint(-2, 3)
    return max(1, int(round(trend + weekend_boost + noise)))


async def _seed_orders(
    db,
    customer: User,
    products: list[Product],
    days: int,
    rng: random.Random,
) -> tuple[int, int]:
    """Generate `days` days of orders backdated to that day. Returns (orders, items)."""
    today = date.today()
    orders_created = 0
    items_created = 0

    for offset in range(days):
        day_index = days - offset - 1  # 0 = oldest, days-1 = today
        day = today - timedelta(days=offset)
        n_orders = _orders_for_day(day_index, days, rng)

        for _ in range(n_orders):
            # Spread orders across the day.
            ts = datetime.combine(
                day,
                time(hour=rng.randint(0, 23), minute=rng.randint(0, 59)),
                tzinfo=timezone.utc,
            )

            # 1-3 line items per order; pick without replacement so no dupes.
            k = rng.randint(1, min(3, len(products)))
            picks = rng.sample(products, k)
            items = [(p, rng.randint(1, 3)) for p in picks]

            total = sum(p.price * qty for p, qty in items)

            order = Order(
                customer_id=customer.id,
                status=rng.choice(REVENUE_STATUSES),
                total_amount=total,
                shipping_address={
                    "line1": "1 Seed Ln",
                    "city": "Karachi",
                    "postal_code": "75500",
                    "country": "PK",
                },
                created_at=ts,
                updated_at=ts,
            )
            db.add(order)
            await db.flush()

            for product, qty in items:
                db.add(
                    OrderItem(
                        order_id=order.id,
                        product_id=product.id,
                        quantity=qty,
                        unit_price=product.price,
                    )
                )
                items_created += 1
            orders_created += 1

        # Commit day-by-day so we don't hold huge transactions.
        await db.commit()

    return orders_created, items_created


async def _run(days: int, product_count: int, seed: int, reset: bool) -> None:
    rng = random.Random(seed)

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as db:
            merchant = await _get_or_create_user(db, SEED_MERCHANT_EMAIL, UserRole.merchant)
            customer = await _get_or_create_user(db, SEED_CUSTOMER_EMAIL, UserRole.customer)
            await db.commit()

            if reset:
                async with Session() as reset_db:
                    m = (await reset_db.execute(select(User).where(User.email == SEED_MERCHANT_EMAIL))).scalar_one()
                    c = (await reset_db.execute(select(User).where(User.email == SEED_CUSTOMER_EMAIL))).scalar_one()
                    await _reset(reset_db, m, c)
                    await reset_db.commit()

            category = await _get_or_create_category(db)
            products = await _get_or_create_products(db, merchant.id, category.id, product_count)
            await db.commit()

            print(f"→ Seeding {days} days of orders across {len(products)} products…")
            orders, items = await _seed_orders(db, customer, products, days, rng)
            print(f"✓ {orders} orders, {items} line items")
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed synthetic sales data for Prophet forecasting.")
    parser.add_argument("--products", type=int, default=10, help="How many products to seed (max 10).")
    parser.add_argument("--days", type=int, default=180, help="Days of history to generate.")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducibility.")
    parser.add_argument("--reset", action="store_true", help="Wipe existing seed data before regenerating.")
    args = parser.parse_args()

    asyncio.run(_run(args.days, args.products, args.seed, args.reset))


if __name__ == "__main__":
    main()
