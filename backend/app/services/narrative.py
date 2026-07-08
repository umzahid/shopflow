"""AI weekly narrative generator.

One non-agentic Claude call turns a week-over-week stats bundle into a short
store summary (headline paragraph + a few highlight bullets), using structured
outputs. The Anthropic call sits behind a set_narrator() swap hook (and the
SHOPFLOW_FAKE_NARRATIVE toggle) so CI never hits the network.
"""
from __future__ import annotations

import json
import os
from typing import Awaitable, Callable

from app.core.config import settings

SYSTEM_PROMPT = (
    "You are a retail analyst writing a brief weekly summary for a single online "
    "store's owner. Using ONLY the JSON stats provided, write a 2-4 sentence "
    "week-in-review: lead with the revenue movement week-over-week, name the "
    "standout product, and flag any stock risk. Never invent numbers not in the "
    "data. Plain, factual tone — no hype. Also return 2-3 short highlight bullets."
)

NARRATIVE_SCHEMA = {
    "type": "object",
    "properties": {
        "narrative": {"type": "string"},
        "highlights": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["narrative", "highlights"],
    "additionalProperties": False,
}


class NarrativeError(Exception):
    def __init__(self, detail: str, status_code: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


NarratorFn = Callable[[dict], Awaitable[tuple[str, list[str]]]]

_narrator_override: NarratorFn | None = None
_client = None


def _build_user_prompt(stats: dict) -> str:
    return "This week's store stats (JSON):\n" + json.dumps(stats, default=str, indent=2)


def _get_client():  # pragma: no cover - needs anthropic + network
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise NarrativeError("The weekly summary is not configured on this deployment.", 503)
        from anthropic import AsyncAnthropic

        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def _anthropic_narrate(stats: dict) -> tuple[str, list[str]]:  # pragma: no cover
    from anthropic import APIConnectionError, APIStatusError, RateLimitError

    client = _get_client()
    try:
        response = await client.messages.create(
            model=settings.NARRATIVE_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_user_prompt(stats)}],
            extra_body={"output_config": {"format": {"type": "json_schema", "schema": NARRATIVE_SCHEMA}}},
        )
    except RateLimitError as e:
        raise NarrativeError("The weekly summary is rate-limited; please retry shortly.", 503) from e
    except (APIStatusError, APIConnectionError) as e:
        raise NarrativeError("The weekly summary is temporarily unavailable.", 502) from e

    if response.stop_reason == "refusal":
        raise NarrativeError("The weekly summary could not be generated.", 502)
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as e:
        raise NarrativeError("The weekly summary returned an unreadable response.", 502) from e
    narrative = data.get("narrative") if isinstance(data, dict) else None
    highlights = data.get("highlights") if isinstance(data, dict) else None
    if not isinstance(narrative, str) or not isinstance(highlights, list):
        raise NarrativeError("The weekly summary returned no content.", 502)
    return narrative, [str(h) for h in highlights]


async def _fake_narrate(stats: dict) -> tuple[str, list[str]]:
    """Deterministic no-network output for tests/CI."""
    rev = stats.get("revenue_this_week", "0")
    delta = stats.get("delta_pct")
    top = stats.get("top_products") or []
    alerts = stats.get("restock_alerts") or []
    lead = top[0]["title"] if top else "no standout product"
    if float(str(rev)) == 0.0 and not top:
        narrative = "(fake) A quiet week — no recorded sales. Nothing stands out to report."
    else:
        move = f"{delta}% week-over-week" if delta is not None else "with no prior-week baseline"
        narrative = f"(fake) Revenue this week was ${rev} ({move}). Top seller: {lead}."
    highlights = [f"Revenue: ${rev}"]
    if delta is not None:
        highlights.append(f"Week-over-week: {delta}%")
    if alerts:
        highlights.append(f"{len(alerts)} product(s) low on stock")
    return narrative, highlights


def set_narrator(fn: NarratorFn | None) -> None:
    """Test hook — swap in a custom narrator, or None to restore the default."""
    global _narrator_override
    _narrator_override = fn


def _current_narrator() -> NarratorFn:
    if _narrator_override is not None:
        return _narrator_override
    if os.getenv("SHOPFLOW_FAKE_NARRATIVE") == "1":
        return _fake_narrate
    return _anthropic_narrate


async def narrate(stats: dict) -> tuple[str, list[str]]:
    """Generate (narrative, highlights) from a week-over-week stats bundle."""
    return await _current_narrator()(stats)
