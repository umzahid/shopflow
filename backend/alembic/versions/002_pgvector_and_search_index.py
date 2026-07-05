"""pgvector extension + embedding column + tsvector GIN index for search

Revision ID: 002
Revises: 001
Create Date: 2026-06-10
"""
from alembic import op


revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgvector for Week 5 semantic search. 384 dims matches all-MiniLM-L6-v2.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("ALTER TABLE products ADD COLUMN embedding vector(384)")

    # Functional GIN index so /products/search hits the index instead of seq scan.
    op.execute(
        """
        CREATE INDEX ix_products_search_tsv
        ON products
        USING GIN (
            to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_products_search_tsv")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS embedding")
    # Leave the vector extension installed — other tables may depend on it later.
