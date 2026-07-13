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
from datetime import timedelta
from decimal import Decimal
from typing import AsyncIterator, Awaitable, Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus, Product, User
from app.ml.forecast import forecast_product_demand
from app.services.restock import get_restock_alerts as _restock_alerts

SYSTEM_PROMPT = (
    "You are ShopFlow Merchant Copilot, a read-only analytics assistant for a "
    "single merchant's store. Answer questions using ONLY the provided tools and "
    "the data they return — never invent numbers. If a tool returns no data, say "
    "so plainly. You cannot change any data. Politely decline requests unrelated "
    "to this merchant's store analytics. Keep answers concise."
)

# Shared by the blocking and streaming loops so they can't drift apart.
REFUSAL_MESSAGE = "I'm sorry, I can't help with that request."
EXHAUSTED_MESSAGE = (
    "I wasn't able to finish answering that. Please try a more specific question."
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
        if not settings.ANTHROPIC_API_KEY:
            # Without this guard the SDK raises TypeError at request-build time,
            # which bypasses the APIStatusError handlers and surfaces as a 500.
            raise CopilotError("The copilot is not configured on this deployment.", 503)
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
            # cache_control on the last system block caches the tools + system
            # prefix across the loop's iterations (tools render before system).
            # Opus-tier models only cache prefixes >= 4096 tokens, so this is a
            # no-op until the prefix grows past that — harmless either way.
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            tools=tools,
            tool_choice={"type": "auto"},
            thinking={"type": "adaptive"},
            # output_config is not a named kwarg in anthropic==0.69.0 — pass it via
            # extra_body so it reaches the wire regardless of SDK build. (Verified:
            # 0.69.0 accepts `thinking` natively but rejects `output_config`.)
            extra_body={"output_config": {"effort": settings.COPILOT_EFFORT}},
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


async def _dispatch_tool_uses(db, merchant, tool_uses, trace: list[ToolCall]) -> list[dict]:
    """Run every tool_use block (merchant-scoped, in parallel), record the trace,
    and return the tool_result blocks to append as the next user turn. Shared by
    the blocking and streaming loops."""
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
    return tool_results


async def answer_question(db: AsyncSession, merchant: User, question: str) -> CopilotAnswer:
    turn = _current_llm()
    messages: list = [{"role": "user", "content": question}]
    trace: list[ToolCall] = []
    answer_text = ""

    for _ in range(settings.COPILOT_MAX_ITERATIONS):
        response = await turn(messages, TOOL_DEFS)

        if response.stop_reason == "refusal":
            answer_text = REFUSAL_MESSAGE
            break

        text_parts = [b.text for b in response.content if b.type == "text" and b.text]

        if response.stop_reason != "tool_use":
            answer_text = "\n".join(text_parts).strip()
            break

        messages.append({"role": "assistant", "content": response.content})
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        tool_results = await _dispatch_tool_uses(db, merchant, tool_uses, trace)
        messages.append({"role": "user", "content": tool_results})
    else:
        answer_text = answer_text or EXHAUSTED_MESSAGE

    return CopilotAnswer(answer=answer_text, tool_calls=trace)


# ── Streaming variant ───────────────────────────────────────────────────────
# A streaming turn is an async generator yielding ("delta", <text chunk>) as the
# model produces text, then exactly one ("final", <LLMResponse-like>) carrying
# the completed message (stop_reason + content blocks). Same swap-hook shape as
# the blocking turn so tests never touch the network.
LLMStreamTurn = Callable[[list, list], "AsyncIterator[tuple[str, object]]"]

_llm_stream_override: LLMStreamTurn | None = None


def set_llm_stream(fn: LLMStreamTurn | None) -> None:
    """Test hook — swap in a scripted streaming turn fn, or None to restore."""
    global _llm_stream_override
    _llm_stream_override = fn


async def _fake_stream_turn(messages, tools):
    text = "(fake copilot) No live model configured."
    for chunk in (text[:15], text[15:]):
        yield ("delta", chunk)
    yield ("final", LLMResponse("end_turn", [LLMBlock(type="text", text=text)]))


async def _anthropic_stream_turn(messages, tools):  # pragma: no cover - needs anthropic + network
    from anthropic import APIConnectionError, APIStatusError, RateLimitError

    client = _get_client()
    try:
        async with client.messages.stream(
            model=settings.COPILOT_MODEL,
            max_tokens=2048,
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            tools=tools,
            tool_choice={"type": "auto"},
            thinking={"type": "adaptive"},
            extra_body={"output_config": {"effort": settings.COPILOT_EFFORT}},
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield ("delta", text)
            yield ("final", await stream.get_final_message())
    except RateLimitError as e:
        raise CopilotError("The assistant is rate-limited; please retry shortly.", 503) from e
    except (APIStatusError, APIConnectionError) as e:
        raise CopilotError("The assistant is temporarily unavailable.", 502) from e


def _current_llm_stream() -> LLMStreamTurn:
    if _llm_stream_override is not None:
        return _llm_stream_override
    if os.getenv("SHOPFLOW_FAKE_COPILOT") == "1":
        return _fake_stream_turn
    return _anthropic_stream_turn


def available() -> bool:
    """Whether the copilot can serve a request (real key, fake toggle, or a test
    override). Lets the streaming endpoint return a proper 503 *before* it starts
    the SSE body, rather than only as an in-stream error event."""
    return (
        _llm_override is not None
        or _llm_stream_override is not None
        or os.getenv("SHOPFLOW_FAKE_COPILOT") == "1"
        or bool(settings.ANTHROPIC_API_KEY)
    )


async def answer_question_stream(db: AsyncSession, merchant: User, question: str):
    """Async generator of SSE-ready event dicts:
      {"type": "delta", "text": ...}   incremental answer text
      {"type": "tool",  "tool": name}  a tool was invoked this turn
      {"type": "done",  "tool_calls": [names...]}   terminal success
      {"type": "error", "detail": ...}             terminal failure
    """
    stream_turn = _current_llm_stream()
    messages: list = [{"role": "user", "content": question}]
    trace: list[ToolCall] = []

    try:
        for _ in range(settings.COPILOT_MAX_ITERATIONS):
            final: LLMResponse | None = None
            turn_text = ""
            async for kind, payload in stream_turn(messages, TOOL_DEFS):
                if kind == "delta" and payload:
                    turn_text += payload
                    yield {"type": "delta", "text": payload}
                elif kind == "final":
                    final = payload

            if final is None:  # a turn that yielded no terminal message
                yield {"type": "error", "detail": "The assistant returned no response."}
                return

            if final.stop_reason == "refusal":
                yield {"type": "delta", "text": REFUSAL_MESSAGE}
                break

            if final.stop_reason != "tool_use":
                # Reconcile: if this terminal turn produced no streamed text (e.g.
                # the model returned text only in the final message), fall back to
                # the final message's text blocks — matching the blocking path.
                if not turn_text.strip():
                    text = "\n".join(
                        b.text for b in final.content if b.type == "text" and b.text
                    ).strip()
                    if text:
                        yield {"type": "delta", "text": text}
                break

            messages.append({"role": "assistant", "content": final.content})
            tool_uses = [b for b in final.content if b.type == "tool_use"]
            for b in tool_uses:
                yield {"type": "tool", "tool": b.name}
            tool_results = await _dispatch_tool_uses(db, merchant, tool_uses, trace)
            messages.append({"role": "user", "content": tool_results})
        else:
            # Loop exhausted without a terminal answer — always tell the user,
            # even if partial preamble text streamed on an earlier turn (parity
            # with the blocking path, which always returns this on exhaustion).
            yield {"type": "delta", "text": EXHAUSTED_MESSAGE}

        yield {"type": "done", "tool_calls": [c.tool for c in trace]}
    except CopilotError as e:
        yield {"type": "error", "detail": e.detail}


REVENUE_STATUSES = (OrderStatus.confirmed, OrderStatus.shipped, OrderStatus.delivered)


async def _get_revenue_summary(db, merchant, args) -> dict:
    period_days = int(args.get("period_days", 30))
    cutoff = func.now() - timedelta(days=period_days)
    stmt = (
        select(func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Product.merchant_id == merchant.id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= cutoff,
        )
    )
    amount = (await db.execute(stmt)).scalar() or 0
    return {"period_days": period_days, "revenue": str(Decimal(amount))}


async def _get_top_products(db, merchant, args) -> dict:
    limit = int(args.get("limit", 5))
    period_days = int(args.get("period_days", 30))
    cutoff = func.now() - timedelta(days=period_days)
    rows = (await db.execute(
        select(
            Product.id,
            Product.title,
            func.sum(OrderItem.quantity).label("units"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("rev"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Product.merchant_id == merchant.id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= cutoff,
        )
        .group_by(Product.id, Product.title)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        .limit(limit)
    )).all()
    return {"products": [
        {"title": t, "units_sold": int(u), "revenue": str(Decimal(r))} for _id, t, u, r in rows
    ]}


async def _get_order_stats(db, merchant, args) -> dict:
    rows = (await db.execute(
        select(Order.status, func.count(func.distinct(Order.id)))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == merchant.id)
        .group_by(Order.status)
    )).all()
    return {"by_status": {s.value: c for s, c in rows}}


async def _find_products(db, merchant, args) -> dict:
    query = str(args.get("query", ""))
    rows = (await db.execute(
        select(Product.id, Product.title, Product.stock_qty, Product.price)
        .where(
            Product.merchant_id == merchant.id,
            Product.deleted_at.is_(None),
            Product.title.ilike(f"%{query}%"),
        )
        .limit(10)
    )).all()
    return {"products": [
        {"id": i, "title": t, "stock_qty": int(s), "price": str(Decimal(p))} for i, t, s, p in rows
    ]}


async def _get_product_forecast(db, merchant, args) -> dict:
    product_id = str(args.get("product_id", ""))
    horizon = int(args.get("horizon_days", 14))
    owned = (await db.execute(
        select(Product.id).where(
            Product.id == product_id,
            Product.merchant_id == merchant.id,
            Product.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if not owned:
        return {"error": "product not found or not owned by you"}
    points = await forecast_product_demand(db, product_id, horizon)
    return {
        "product_id": product_id,
        "horizon_days": horizon,
        "points": [{"ds": p.ds.isoformat(), "yhat": round(p.yhat, 2)} for p in points],
    }


async def _get_restock_alerts(db, merchant, args) -> dict:
    lead = int(args.get("lead_time_days", 7))
    alerts = await _restock_alerts(db, merchant.id, lead_time_days=lead)
    return {"lead_time_days": lead, "alerts": [a.to_dict() for a in alerts]}


TOOL_HANDLERS.update({
    "get_revenue_summary": _get_revenue_summary,
    "get_top_products": _get_top_products,
    "get_order_stats": _get_order_stats,
    "find_products": _find_products,
    "get_product_forecast": _get_product_forecast,
    "get_restock_alerts": _get_restock_alerts,
})


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "name": name,
        "description": description,
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
    }


TOOL_DEFS.extend([
    _tool("get_revenue_summary", "Total revenue for this store over the last N days.",
          {"period_days": {"type": "integer", "description": "Look-back window in days."}},
          ["period_days"]),
    _tool("get_top_products", "This store's top products by revenue over the last N days.",
          {"limit": {"type": "integer", "description": "How many products to return."},
           "period_days": {"type": "integer", "description": "Look-back window in days."}},
          ["limit", "period_days"]),
    _tool("get_order_stats", "Count of this store's orders grouped by status (includes pending_review/fraud).",
          {}, []),
    _tool("find_products", "Search this store's catalog by title substring; use to resolve a product reference to an id.",
          {"query": {"type": "string", "description": "Case-insensitive title substring."}},
          ["query"]),
    _tool("get_product_forecast", "Prophet demand forecast for one of this store's products.",
          {"product_id": {"type": "string", "description": "Product id from find_products."},
           "horizon_days": {"type": "integer", "description": "Days to forecast forward."}},
          ["product_id", "horizon_days"]),
    _tool("get_restock_alerts", "Products whose forecast demand over a lead time exceeds current stock.",
          {"lead_time_days": {"type": "integer", "description": "Restock lead time in days."}},
          ["lead_time_days"]),
])
