"""Composite indexes for dashboard aggregations and fraud IP-velocity lookups

Revision ID: 006
Revises: 005
Create Date: 2026-07-07
"""
from alembic import op


revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Revenue/dashboard queries filter status IN (...) AND created_at >= cutoff.
    op.create_index("ix_orders_status_created", "orders", ["status", "created_at"])
    # Fraud scoring counts orders per IP in the last 24h; the composite makes the
    # single-column ix_orders_ip_address redundant.
    op.create_index("ix_orders_ip_created", "orders", ["ip_address", "created_at"])
    op.drop_index("ix_orders_ip_address", table_name="orders")
    # Merchant catalog listing filters merchant_id AND deleted_at IS NULL.
    op.create_index(
        "ix_products_merchant_active",
        "products",
        ["merchant_id"],
        postgresql_where="deleted_at IS NULL",
    )


def downgrade() -> None:
    op.drop_index("ix_products_merchant_active", table_name="products")
    op.create_index("ix_orders_ip_address", "orders", ["ip_address"])
    op.drop_index("ix_orders_ip_created", table_name="orders")
    op.drop_index("ix_orders_status_created", table_name="orders")
