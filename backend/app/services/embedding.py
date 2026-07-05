"""Text embeddings for semantic product search.

Uses sentence-transformers/all-MiniLM-L6-v2 (384 dims — matches the pgvector
column in migration 002). The model is lazily loaded on first use so importing
this module (or the app) doesn't pay the ~90MB download cost until a semantic
call actually happens.

Tests swap in a deterministic hash-based encoder via set_encoder() to avoid
downloading the model in CI. Toggle at runtime with SHOPFLOW_FAKE_EMBEDDINGS=1.
"""
from __future__ import annotations

import hashlib
import math
import os
from functools import lru_cache
from typing import Callable

EMBEDDING_DIM = 384
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

_encoder_override: Callable[[str], list[float]] | None = None


@lru_cache(maxsize=1)
def _load_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def _fake_encode(text: str) -> list[float]:
    """Deterministic hash-based encoder for tests. Normalized to unit length so
    cosine distance behaves the same shape as the real model output."""
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    raw = [((seed[i % len(seed)] / 255.0) * 2 - 1) for i in range(EMBEDDING_DIM)]
    norm = math.sqrt(sum(x * x for x in raw)) or 1.0
    return [x / norm for x in raw]


def encode(text: str) -> list[float]:
    if _encoder_override is not None:
        return _encoder_override(text)
    if os.getenv("SHOPFLOW_FAKE_EMBEDDINGS") == "1":
        return _fake_encode(text)
    vec = _load_model().encode(text, normalize_embeddings=True)
    return vec.tolist()


def encode_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if _encoder_override is not None:
        return [_encoder_override(t) for t in texts]
    if os.getenv("SHOPFLOW_FAKE_EMBEDDINGS") == "1":
        return [_fake_encode(t) for t in texts]
    vecs = _load_model().encode(texts, normalize_embeddings=True, batch_size=32)
    return [v.tolist() for v in vecs]


def embed_product_text(title: str, description: str | None) -> list[float]:
    """Canonical text representation of a product for embedding."""
    return encode(f"{title}\n{description or ''}".strip())


def set_encoder(fn: Callable[[str], list[float]] | None) -> None:
    """Test hook — swap in a custom encoder or None to restore the default."""
    global _encoder_override
    _encoder_override = fn
