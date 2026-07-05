"""HNSW index on products.embedding for fast semantic search

Revision ID: 003
Revises: 002
Create Date: 2026-07-01
"""
from alembic import op


revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # HNSW over IVFFlat: no training step, works on an empty table, and
    # gives lower recall/latency tradeoffs out of the box. vector_cosine_ops
    # matches how the search endpoint queries (cosine distance / similarity).
    # Partial index — many products may still have NULL embeddings while the
    # backfill script runs.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_products_embedding_hnsw
        ON products USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE embedding IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_products_embedding_hnsw")
