"""Backfill product embeddings for rows written before Week 4's encode-on-write.

Run:
    python -m app.scripts.backfill_embeddings [--batch 32] [--dry-run]

Idempotent — only touches rows where embedding IS NULL.
"""
from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Product
from app.services.embedding import encode_batch


async def _backfill(batch: int, dry_run: bool) -> tuple[int, int]:
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    processed = 0
    skipped = 0
    try:
        async with Session() as db:
            result = await db.execute(
                select(Product).where(Product.embedding.is_(None))
            )
            pending = result.scalars().all()
            print(f"Found {len(pending)} products with NULL embedding")

            for i in range(0, len(pending), batch):
                chunk = pending[i : i + batch]
                texts = [f"{p.title}\n{p.description or ''}".strip() for p in chunk]
                vectors = encode_batch(texts)
                for product, vec in zip(chunk, vectors):
                    if dry_run:
                        skipped += 1
                        continue
                    product.embedding = vec
                    processed += 1
                if not dry_run:
                    await db.commit()
                print(f"  batch {i // batch + 1}: {len(chunk)} products")
    finally:
        await engine.dispose()

    return processed, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill missing product embeddings.")
    parser.add_argument("--batch", type=int, default=32, help="Batch size for encoder (default 32).")
    parser.add_argument("--dry-run", action="store_true", help="Encode but do not persist.")
    args = parser.parse_args()

    processed, skipped = asyncio.run(_backfill(args.batch, args.dry_run))
    print(f"Done. processed={processed} skipped(dry-run)={skipped}")


if __name__ == "__main__":
    main()
