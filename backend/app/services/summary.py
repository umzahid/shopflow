"""Customer-facing AI product summary.

A short, punchy summary shown on the product detail page. Follows the same
swap-hook + deterministic-fake pattern as the description/copilot services so
CI never needs an API key: without `ANTHROPIC_API_KEY` (or with
`SHOPFLOW_FAKE_SUMMARY=1`) a deterministic heuristic summary is returned.
"""
from __future__ import annotations

import os
import re
from typing import Callable

from app.core.config import settings

SummarizerFn = Callable[[str, str | None], str]

_summarizer_override: SummarizerFn | None = None


def set_summarizer(fn: SummarizerFn | None) -> None:
    """Test hook — swap in a custom summarizer, or None to restore default."""
    global _summarizer_override
    _summarizer_override = fn


def _fake_summarize(title: str, description: str | None) -> str:
    """Deterministic heuristic: lead with the title, then the first sentence or
    ~30 words of the description. No network, stable output for tests."""
    if not description or not description.strip():
        return f"{title} — a quality pick from an independent ShopFlow merchant."
    first_sentence = re.split(r"(?<=[.!?])\s", description.strip())[0]
    words = first_sentence.split()
    if len(words) > 30:
        first_sentence = " ".join(words[:30]) + "…"
    return f"{title}: {first_sentence}"


def _anthropic_summarize(title: str, description: str | None) -> str:  # pragma: no cover - needs anthropic + network
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    prompt = (
        "Write a single-sentence, customer-facing summary (max 30 words) for this "
        f"product. Be concrete and appealing, no hype.\n\nTitle: {title}\n"
        f"Description: {description or '(none)'}"
    )
    msg = client.messages.create(
        model=settings.DESCRIPTION_MODEL,
        max_tokens=120,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text").strip()


def summarize_product(title: str, description: str | None) -> str:
    if _summarizer_override is not None:
        return _summarizer_override(title, description)
    if os.getenv("SHOPFLOW_FAKE_SUMMARY") == "1" or not settings.ANTHROPIC_API_KEY:
        return _fake_summarize(title, description)
    try:  # pragma: no cover - network path
        return _anthropic_summarize(title, description)
    except Exception:
        return _fake_summarize(title, description)
