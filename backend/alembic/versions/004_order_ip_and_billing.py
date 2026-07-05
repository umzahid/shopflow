"""Add ip_address + billing_address to orders (fraud features)

Revision ID: 004
Revises: 003
Create Date: 2026-07-05
"""
import sqlalchemy as sa
from alembic import op


revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Captured at checkout to power the orders-per-IP-24h and
    # billing-vs-shipping-mismatch fraud features. Nullable so historical rows
    # and non-fraud-path inserts stay valid.
    op.add_column("orders", sa.Column("ip_address", sa.String(length=45), nullable=True))
    op.add_column("orders", sa.Column("billing_address", sa.JSON(), nullable=True))
    op.create_index("ix_orders_ip_address", "orders", ["ip_address"])


def downgrade() -> None:
    op.drop_index("ix_orders_ip_address", table_name="orders")
    op.drop_column("orders", "billing_address")
    op.drop_column("orders", "ip_address")
