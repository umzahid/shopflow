"""AI product description generator.

One non-agentic Claude call turns product attributes into up to 3 marketing
description variants, using structured outputs. The Anthropic call sits behind a
set_generator() swap hook (and the SHOPFLOW_FAKE_DESCRIPTIONS toggle) so CI never
hits the network; a deterministic fake returns canned variants.
"""
from __future__ import annotations

import json
import os
from typing import Awaitable, Callable

from app.core.config import settings
from app.schemas.descriptions import DescriptionRequest

SYSTEM_PROMPT = (
    "You are an expert e-commerce copywriter. Write marketing product "
    "descriptions from the attributes the user provides. Match the requested "
    "tone and length. Return exactly 3 distinct variants. Do not invent "
    "specifications, materials, dimensions, or claims that are not implied by "
    "the given attributes."
)

VARIANTS_SCHEMA = {
    "type": "object",
    "properties": {"variants": {"type": "array", "items": {"type": "string"}}},
    "required": ["variants"],
    "additionalProperties": False,
}


class DescriptionError(Exception):
    def __init__(self, detail: str, status_code: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


GeneratorFn = Callable[[DescriptionRequest], Awaitable[list[str]]]

_generator_override: GeneratorFn | None = None
_client = None


def _build_user_prompt(req: DescriptionRequest) -> str:
    lines = [f"Title: {req.title}"]
    if req.category:
        lines.append(f"Category: {req.category}")
    if req.key_features:
        lines.append("Key features:")
        lines.extend(f"- {feature}" for feature in req.key_features)
    lines.append(f"Tone: {req.tone.value}")
    lines.append(f"Length: {req.length.value}")
    return "\n".join(lines)


def _get_client():  # pragma: no cover - needs anthropic + network
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic

        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def _anthropic_generate(req: DescriptionRequest) -> list[str]:  # pragma: no cover
    from anthropic import APIConnectionError, APIStatusError, RateLimitError

    client = _get_client()
    try:
        response = await client.messages.create(
            model=settings.DESCRIPTION_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_user_prompt(req)}],
            # output_config is not a named kwarg in anthropic==0.69.0 — pass it via
            # extra_body so structured outputs reach the wire regardless of build.
            extra_body={"output_config": {"format": {"type": "json_schema", "schema": VARIANTS_SCHEMA}}},
        )
    except RateLimitError as e:
        raise DescriptionError("The generator is rate-limited; please retry shortly.", 503) from e
    except (APIStatusError, APIConnectionError) as e:
        raise DescriptionError("The generator is temporarily unavailable.", 502) from e

    if response.stop_reason == "refusal":
        return []
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as e:
        raise DescriptionError("The generator returned an unreadable response.", 502) from e
    variants = data.get("variants") if isinstance(data, dict) else None
    if not isinstance(variants, list):
        raise DescriptionError("The generator returned no variants.", 502)
    return [str(v) for v in variants]


async def _fake_generate(req: DescriptionRequest) -> list[str]:
    """Deterministic 3-variant output for tests/CI — no network."""
    base = req.title.strip()
    return [
        f"[{req.tone.value}/{req.length.value}] Meet the {base}. Variant {i}."
        for i in range(1, 4)
    ]


def set_generator(fn: GeneratorFn | None) -> None:
    """Test hook — swap in a custom generator, or None to restore the default."""
    global _generator_override
    _generator_override = fn


def _current_generator() -> GeneratorFn:
    if _generator_override is not None:
        return _generator_override
    if os.getenv("SHOPFLOW_FAKE_DESCRIPTIONS") == "1":
        return _fake_generate
    return _anthropic_generate


async def generate_descriptions(req: DescriptionRequest) -> list[str]:
    """Generate up to DESCRIPTION_MAX_VARIANTS marketing descriptions for a product."""
    variants = await _current_generator()(req)
    return variants[: settings.DESCRIPTION_MAX_VARIANTS]
