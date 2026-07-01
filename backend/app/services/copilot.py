"""Merchant Copilot — single-turn, read-only Claude tool-calling analytics.

Runs a manual async agentic loop: Claude requests read-only tools, the backend
executes them scoped to the authenticated merchant, and Claude synthesizes an
answer. The Anthropic turn is behind `set_llm()` so tests (and the
SHOPFLOW_FAKE_COPILOT toggle) never touch the network.

Security invariant: the model never supplies merchant_id — every handler
receives the authenticated merchant injected here.
"""
from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import User

SYSTEM_PROMPT = (
    "You are ShopFlow Merchant Copilot, a read-only analytics assistant for a "
    "single merchant's store. Answer questions using ONLY the provided tools and "
    "the data they return — never invent numbers. If a tool returns no data, say "
    "so plainly. You cannot change any data. Politely decline requests unrelated "
    "to this merchant's store analytics. Keep answers concise."
)


@dataclass
class LLMBlock:
    """Duck-typed stand-in for an Anthropic content block (also matches SDK blocks)."""
    type: str
    text: str | None = None
    id: str | None = None
    name: str | None = None
    input: dict | None = None


@dataclass
class LLMResponse:
    stop_reason: str
    content: list


@dataclass
class ToolCall:
    tool: str
    input: dict
    result: dict


@dataclass
class CopilotAnswer:
    answer: str
    tool_calls: list[ToolCall] = field(default_factory=list)


class CopilotError(Exception):
    def __init__(self, detail: str, status_code: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


LLMTurn = Callable[[list, list], Awaitable[LLMResponse]]

# Populated in Task 3. Maps tool name -> async (db, merchant, args) -> dict.
TOOL_HANDLERS: dict[str, Callable[[AsyncSession, User, dict], Awaitable[dict]]] = {}
TOOL_DEFS: list[dict] = []  # filled in Task 3

_llm_override: LLMTurn | None = None
_client = None


def _get_client():  # pragma: no cover - needs anthropic + network
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic

        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def _anthropic_turn(messages, tools):  # pragma: no cover - needs anthropic + network
    from anthropic import APIConnectionError, APIStatusError, RateLimitError

    client = _get_client()
    try:
        return await client.messages.create(
            model=settings.COPILOT_MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=tools,
            tool_choice={"type": "auto"},
            thinking={"type": "adaptive"},
            output_config={"effort": settings.COPILOT_EFFORT},
            messages=messages,
        )
    except RateLimitError as e:
        raise CopilotError("The assistant is rate-limited; please retry shortly.", 503) from e
    except (APIStatusError, APIConnectionError) as e:
        raise CopilotError("The assistant is temporarily unavailable.", 502) from e


async def _fake_turn(messages, tools):
    """Default no-network turn — a plain text answer. Tests override via set_llm."""
    return LLMResponse("end_turn", [LLMBlock(type="text", text="(fake copilot) No live model configured.")])


def set_llm(fn: LLMTurn | None) -> None:
    """Test hook — swap in a scripted turn fn, or None to restore the default."""
    global _llm_override
    _llm_override = fn


def _current_llm() -> LLMTurn:
    if _llm_override is not None:
        return _llm_override
    if os.getenv("SHOPFLOW_FAKE_COPILOT") == "1":
        return _fake_turn
    return _anthropic_turn


async def _dispatch(db, merchant, name: str, args: dict) -> dict:
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return {"error": f"unknown tool: {name}"}
    try:
        return await handler(db, merchant, args or {})
    except Exception as e:  # surfaced back to the model as a tool error
        return {"error": str(e)}


async def answer_question(db: AsyncSession, merchant: User, question: str) -> CopilotAnswer:
    turn = _current_llm()
    messages: list = [{"role": "user", "content": question}]
    trace: list[ToolCall] = []
    answer_text = ""

    for _ in range(settings.COPILOT_MAX_ITERATIONS):
        response = await turn(messages, TOOL_DEFS)

        if response.stop_reason == "refusal":
            answer_text = "I'm sorry, I can't help with that request."
            break

        text_parts = [b.text for b in response.content if b.type == "text" and b.text]

        if response.stop_reason != "tool_use":
            answer_text = "\n".join(text_parts).strip()
            break

        messages.append({"role": "assistant", "content": response.content})
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        results = await asyncio.gather(
            *[_dispatch(db, merchant, b.name, b.input or {}) for b in tool_uses]
        )

        tool_results = []
        for block, result in zip(tool_uses, results):
            trace.append(ToolCall(tool=block.name, input=block.input or {}, result=result))
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result, default=str),
                "is_error": "error" in result,
            })
        messages.append({"role": "user", "content": tool_results})
    else:
        answer_text = answer_text or (
            "I wasn't able to finish answering that. Please try a more specific question."
        )

    return CopilotAnswer(answer=answer_text, tool_calls=trace)
