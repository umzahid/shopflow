# Merchant Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-turn, read-only, natural-language analytics assistant for ShopFlow merchants, powered by Claude tool-calling over the merchant's own data.

**Architecture:** A `POST /merchant/copilot` endpoint hands the question to `app/services/copilot.py`, which runs a manual async agentic loop against `claude-opus-4-8`: Claude requests read-only tools, the backend executes them scoped to the authenticated merchant, and Claude synthesizes an answer. The response returns the answer plus a trace of tool calls. The Anthropic turn is behind a swap hook so CI never calls the network.

**Tech Stack:** FastAPI (async), SQLAlchemy 2.0 async, `anthropic` Python SDK (`AsyncAnthropic`), pytest against a real `shopflow_test` Postgres.

## Global Constraints

- **Model id is exactly `claude-opus-4-8`** — never a date-suffixed variant.
- **Security invariant:** the model never supplies `merchant_id`; every tool handler receives the authenticated merchant injected by the backend.
- **RFC 7807** for all HTTP errors — use the `_problem()` helper already in `app/api/merchant.py`. Never raise a plain-string `HTTPException`.
- **Real Postgres tests, no mocking of the DB.** conftest truncates between tests and resets the Redis singleton.
- **Never import `anthropic` at module top level** — import it lazily inside the real-turn function only, so the package (added to requirements but not yet in the running image) can't break merchant tests. Guard real-network code paths with `# pragma: no cover`.
- **flake8 (exact CI flags):** `--max-line-length=120 --extend-ignore=E501,W503,E203`. Verify via `docker exec shopflow-backend-1 python -m flake8 app/ tests/ ...`.
- **Coverage gate:** `pytest --cov=app --cov-fail-under=70`. Run in-container with `COVERAGE_FILE=/tmp/.coverage`.
- Tests run inside `shopflow-backend-1` (app/ and tests/ are volume-mounted).

---

### Task 1: Dependencies, config, and schemas

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`
- Create: `backend/app/schemas/copilot.py`
- Test: `backend/tests/unit/test_copilot_schemas.py`

**Interfaces:**
- Produces: `settings.COPILOT_MODEL: str`, `settings.COPILOT_MAX_ITERATIONS: int`, `settings.COPILOT_EFFORT: str`.
- Produces: `CopilotRequest{question: str}`, `ToolCallTrace{tool: str, input: dict, result: dict}`, `CopilotResponse{answer: str, tool_calls: list[ToolCallTrace]}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_copilot_schemas.py`:

```python
"""Config + schema wiring for the Merchant Copilot."""
from app.core.config import settings
from app.schemas.copilot import CopilotRequest, CopilotResponse, ToolCallTrace


def test_copilot_config_defaults():
    assert settings.COPILOT_MODEL == "claude-opus-4-8"
    assert settings.COPILOT_MAX_ITERATIONS == 5
    assert settings.COPILOT_EFFORT == "medium"


def test_copilot_request_accepts_question():
    req = CopilotRequest(question="What was my revenue last month?")
    assert req.question == "What was my revenue last month?"


def test_copilot_response_shape():
    resp = CopilotResponse(
        answer="You made $100.",
        tool_calls=[ToolCallTrace(tool="get_revenue_summary", input={"period_days": 30}, result={"revenue": "100.00"})],
    )
    assert resp.answer == "You made $100."
    assert resp.tool_calls[0].tool == "get_revenue_summary"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_copilot_schemas.py -q`
Expected: FAIL — `ModuleNotFoundError: app.schemas.copilot` / missing config attrs.

- [ ] **Step 3: Add the dependency**

Append to `backend/requirements.txt` (after the `lightgbm==4.3.0` block):

```
# Merchant Copilot (Week 6) — Claude API tool-calling analytics assistant.
anthropic==0.69.0
```

- [ ] **Step 4: Add config fields**

In `backend/app/core/config.py`, add these lines immediately after the existing `ANTHROPIC_API_KEY: str = ""` line:

```python
    # Merchant Copilot (Week 6)
    COPILOT_MODEL: str = "claude-opus-4-8"
    COPILOT_MAX_ITERATIONS: int = 5
    COPILOT_EFFORT: str = "medium"
```

- [ ] **Step 5: Create the schemas**

Create `backend/app/schemas/copilot.py`:

```python
from pydantic import BaseModel, Field


class CopilotRequest(BaseModel):
    question: str = Field(max_length=1000)


class ToolCallTrace(BaseModel):
    tool: str
    input: dict
    result: dict


class CopilotResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCallTrace]
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_copilot_schemas.py -q`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
cd ~/projects/shopflow
git add backend/requirements.txt backend/app/core/config.py backend/app/schemas/copilot.py backend/tests/unit/test_copilot_schemas.py
git commit -m "feat(copilot): config, schemas, and anthropic dependency"
```

---

### Task 2: Copilot service — agentic loop, LLM abstraction, swap hook

**Files:**
- Create: `backend/app/services/copilot.py`
- Test: `backend/tests/unit/test_copilot_loop.py`

**Interfaces:**
- Consumes: `settings.COPILOT_MAX_ITERATIONS`.
- Produces:
  - `LLMBlock(type, text=None, id=None, name=None, input=None)` and `LLMResponse(stop_reason, content)` dataclasses (a duck-typed stand-in for SDK message blocks; used by tests to script turns).
  - `CopilotAnswer(answer: str, tool_calls: list[ToolCall])`, `ToolCall(tool: str, input: dict, result: dict)`.
  - `set_llm(fn | None)` — swap hook; `fn` is `async (messages: list, tools: list) -> LLMResponse-like`.
  - `TOOL_HANDLERS: dict[str, async (db, merchant, args) -> dict]` (populated in Task 3; empty-safe here).
  - `CopilotError(detail: str, status_code: int)`.
  - `async answer_question(db, merchant, question: str) -> CopilotAnswer`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_copilot_loop.py`:

```python
"""Agentic loop behaviour — scripted fake LLM, monkeypatched handlers, no DB."""
import pytest

from app.services import copilot
from app.services.copilot import LLMBlock, LLMResponse, set_llm


@pytest.fixture(autouse=True)
def _reset():
    yield
    set_llm(None)


def _scripted(*responses):
    """Return an async llm-turn fn that yields the given responses in order."""
    calls = {"i": 0}

    async def _turn(messages, tools):
        r = responses[calls["i"]]
        calls["i"] += 1
        return r

    return _turn


@pytest.mark.asyncio
async def test_text_only_answer_terminates():
    set_llm(_scripted(LLMResponse("end_turn", [LLMBlock(type="text", text="Hello merchant.")])))
    result = await copilot.answer_question(None, None, "hi")
    assert result.answer == "Hello merchant."
    assert result.tool_calls == []


@pytest.mark.asyncio
async def test_tool_call_round_then_answer(monkeypatch):
    async def _echo(db, merchant, args):
        return {"echoed": args}

    monkeypatch.setitem(copilot.TOOL_HANDLERS, "echo", _echo)
    set_llm(_scripted(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="echo", input={"x": 1})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="Done.")]),
    ))
    result = await copilot.answer_question(None, None, "call echo")
    assert result.answer == "Done."
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].tool == "echo"
    assert result.tool_calls[0].result == {"echoed": {"x": 1}}


@pytest.mark.asyncio
async def test_unknown_tool_returns_error_result_and_recovers(monkeypatch):
    set_llm(_scripted(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="does_not_exist", input={})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="Recovered.")]),
    ))
    result = await copilot.answer_question(None, None, "call missing")
    assert result.answer == "Recovered."
    assert "error" in result.tool_calls[0].result


@pytest.mark.asyncio
async def test_refusal_is_handled_gracefully():
    set_llm(_scripted(LLMResponse("refusal", [])))
    result = await copilot.answer_question(None, None, "bad")
    assert result.answer  # non-empty graceful message
    assert result.tool_calls == []


@pytest.mark.asyncio
async def test_iteration_cap_terminates(monkeypatch):
    async def _echo(db, merchant, args):
        return {"ok": True}

    monkeypatch.setitem(copilot.TOOL_HANDLERS, "echo", _echo)
    # Always ask for a tool → loop must stop at COPILOT_MAX_ITERATIONS.
    always_tool = LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t", name="echo", input={})])

    async def _turn(messages, tools):
        return always_tool

    set_llm(_turn)
    result = await copilot.answer_question(None, None, "loop forever")
    assert result.answer  # fallback message, no hang
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_copilot_loop.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.copilot`.

- [ ] **Step 3: Write the service (loop + abstraction only; handlers filled in Task 3)**

Create `backend/app/services/copilot.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_copilot_loop.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/services/copilot.py backend/tests/unit/test_copilot_loop.py
git commit -m "feat(copilot): agentic loop, LLM swap hook, tool dispatch"
```

---

### Task 3: Merchant-scoped tool handlers + tool definitions

**Files:**
- Modify: `backend/app/services/copilot.py`
- Test: `backend/tests/integration/test_copilot_tools.py`

**Interfaces:**
- Consumes: `TOOL_HANDLERS`, `TOOL_DEFS` from Task 2; `forecast_product_demand` (`app.ml.forecast`), `get_restock_alerts` (`app.services.restock`).
- Produces: registered handlers `get_revenue_summary`, `get_top_products`, `get_order_stats`, `find_products`, `get_product_forecast`, `get_restock_alerts`, each `async (db, merchant, args) -> dict`, all filtered by `merchant.id`. `TOOL_DEFS` describing them with `strict: true`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/test_copilot_tools.py`:

```python
"""Merchant-scoped Copilot tool handlers (real DB)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus, Product, User
from app.services import copilot

from tests.integration.helpers import create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _seed_delivered_order(product_id: str, customer_id: str, unit_price: str, qty: int) -> None:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            ts = datetime.now(timezone.utc)
            order = Order(
                customer_id=customer_id,
                status=OrderStatus.delivered,
                total_amount=Decimal(unit_price) * qty,
                shipping_address={"line1": "1 X", "city": "K", "postal_code": "0", "country": "PK"},
                created_at=ts,
                updated_at=ts,
            )
            db.add(order)
            await db.flush()
            db.add(OrderItem(order_id=order.id, product_id=product_id, quantity=qty, unit_price=Decimal(unit_price)))
            await db.commit()
    finally:
        await engine.dispose()


async def _run(handler_name, mid, args):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            merchant = (await db.execute(select(User).where(User.id == mid))).scalar_one()
            return await copilot.TOOL_HANDLERS[handler_name](db, merchant, args)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_all_tools_registered():
    for name in ["get_revenue_summary", "get_top_products", "get_order_stats",
                 "find_products", "get_product_forecast", "get_restock_alerts"]:
        assert name in copilot.TOOL_HANDLERS
    names = {t["name"] for t in copilot.TOOL_DEFS}
    assert names == set(copilot.TOOL_HANDLERS)


@pytest.mark.asyncio
async def test_revenue_summary_scoped_to_merchant(client):
    mtoken, mid = await register_merchant(client, "m-cp-rev@e.com")
    _, cid = await register_customer(client, "c-cp-rev@e.com")
    p = await create_product(client, mtoken, title="Rev Widget", price="10.00")
    await _seed_delivered_order(p["id"], cid, "10.00", 3)

    result = await _run("get_revenue_summary", mid, {"period_days": 30})
    assert Decimal(result["revenue"]) == Decimal("30.00")


@pytest.mark.asyncio
async def test_find_products_returns_only_own_catalog(client):
    m1, mid1 = await register_merchant(client, "m-cp-find-a@e.com")
    m2, _ = await register_merchant(client, "m-cp-find-b@e.com")
    await create_product(client, m1, title="Alpha Gadget")
    await create_product(client, m2, title="Alpha Gizmo")  # other merchant

    result = await _run("find_products", mid1, {"query": "Alpha"})
    titles = [p["title"] for p in result["products"]]
    assert titles == ["Alpha Gadget"]


@pytest.mark.asyncio
async def test_forecast_rejects_foreign_product(client):
    m1, _ = await register_merchant(client, "m-cp-fc-a@e.com")
    m2, mid2 = await register_merchant(client, "m-cp-fc-b@e.com")
    p = await create_product(client, m1, title="Not Yours")

    result = await _run("get_product_forecast", mid2, {"product_id": p["id"], "horizon_days": 14})
    assert "error" in result


@pytest.mark.asyncio
async def test_restock_alerts_runs(client):
    mtoken, mid = await register_merchant(client, "m-cp-ra@e.com")
    await create_product(client, mtoken, title="Stocked", stock=1000)
    result = await _run("get_restock_alerts", mid, {"lead_time_days": 7})
    assert "alerts" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_copilot_tools.py -q`
Expected: FAIL — `KeyError`/empty `TOOL_HANDLERS`, empty `TOOL_DEFS`.

- [ ] **Step 3: Add handlers and tool definitions**

In `backend/app/services/copilot.py`, add these imports to the existing import block:

```python
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.models.models import Order, OrderItem, OrderStatus, Product
from app.ml.forecast import forecast_product_demand
from app.services.restock import get_restock_alerts as _restock_alerts
```

Then append to the end of the file:

```python
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
        .group_by(Product.title)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        .limit(limit)
    )).all()
    return {"products": [
        {"title": t, "units_sold": int(u), "revenue": str(Decimal(r))} for t, u, r in rows
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_copilot_tools.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/services/copilot.py backend/tests/integration/test_copilot_tools.py
git commit -m "feat(copilot): merchant-scoped read-only tool handlers + definitions"
```

---

### Task 4: Endpoint wiring + conftest fixture + end-to-end tests

**Files:**
- Modify: `backend/app/api/merchant.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/integration/test_copilot_endpoint.py`

**Interfaces:**
- Consumes: `copilot.answer_question`, `copilot.CopilotError`, `copilot.set_llm`, `copilot.LLMBlock`, `copilot.LLMResponse`; `CopilotRequest`/`CopilotResponse`/`ToolCallTrace`.
- Produces: `POST /api/v1/merchant/copilot` (merchant-role gated) returning `CopilotResponse`.

- [ ] **Step 1: Add a conftest reset fixture**

In `backend/tests/conftest.py`, add after the `_use_fake_fraud_scorer` fixture:

```python
@pytest.fixture(autouse=True)
def _reset_copilot_llm():
    """Reset the Copilot LLM swap hook after each test so a stray test can't
    leave a scripted turn set for the next one."""
    yield
    from app.services.copilot import set_llm

    set_llm(None)
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/integration/test_copilot_endpoint.py`:

```python
"""POST /merchant/copilot — end-to-end with a scripted fake LLM."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus
from app.services.copilot import LLMBlock, LLMResponse, set_llm

from tests.integration.helpers import bearer, create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


def _script(*responses):
    calls = {"i": 0}

    async def _turn(messages, tools):
        r = responses[calls["i"]]
        calls["i"] += 1
        return r

    return _turn


async def _seed_delivered_order(product_id, customer_id, unit_price, qty):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            ts = datetime.now(timezone.utc)
            order = Order(
                customer_id=customer_id, status=OrderStatus.delivered,
                total_amount=Decimal(unit_price) * qty,
                shipping_address={"line1": "1 X", "city": "K", "postal_code": "0", "country": "PK"},
                created_at=ts, updated_at=ts,
            )
            db.add(order)
            await db.flush()
            db.add(OrderItem(order_id=order.id, product_id=product_id, quantity=qty, unit_price=Decimal(unit_price)))
            await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_copilot_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-cp-role@e.com")
    res = await client.post("/api/v1/merchant/copilot", json={"question": "hi"}, headers=bearer(ctoken))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_copilot_rejects_empty_question(client):
    mtoken, _ = await register_merchant(client, "m-cp-empty@e.com")
    res = await client.post("/api/v1/merchant/copilot", json={"question": "   "}, headers=bearer(mtoken))
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_copilot_happy_path_with_tool_call(client):
    mtoken, _ = await register_merchant(client, "m-cp-happy@e.com")
    _, cid = await register_customer(client, "c-cp-happy@e.com")
    p = await create_product(client, mtoken, title="HappyWidget", price="10.00")
    await _seed_delivered_order(p["id"], cid, "10.00", 4)

    set_llm(_script(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="get_revenue_summary", input={"period_days": 30})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="Your 30-day revenue was $40.00.")]),
    ))
    res = await client.post("/api/v1/merchant/copilot", json={"question": "revenue last 30 days?"}, headers=bearer(mtoken))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["answer"] == "Your 30-day revenue was $40.00."
    assert body["tool_calls"][0]["tool"] == "get_revenue_summary"
    assert Decimal(body["tool_calls"][0]["result"]["revenue"]) == Decimal("40.00")


@pytest.mark.asyncio
async def test_copilot_isolation_between_merchants(client):
    m1, _ = await register_merchant(client, "m-cp-iso-a@e.com")
    m2, _ = await register_merchant(client, "m-cp-iso-b@e.com")
    _, cid = await register_customer(client, "c-cp-iso@e.com")
    # Only merchant 1 has revenue.
    p1 = await create_product(client, m1, title="IsoA", price="50.00")
    await _seed_delivered_order(p1["id"], cid, "50.00", 2)

    # Merchant 2 asks the same revenue question; the tool runs scoped to m2.
    set_llm(_script(
        LLMResponse("tool_use", [LLMBlock(type="tool_use", id="t1", name="get_revenue_summary", input={"period_days": 30})]),
        LLMResponse("end_turn", [LLMBlock(type="text", text="done")]),
    ))
    res = await client.post("/api/v1/merchant/copilot", json={"question": "my revenue?"}, headers=bearer(m2))
    assert res.status_code == 200
    # Merchant 2 sees zero — never merchant 1's $100.
    assert Decimal(res.json()["tool_calls"][0]["result"]["revenue"]) == Decimal("0")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_copilot_endpoint.py -q`
Expected: FAIL — 404 on `/merchant/copilot` (route not defined).

- [ ] **Step 4: Wire the endpoint**

In `backend/app/api/merchant.py`, add to the imports:

```python
from app.schemas.copilot import CopilotRequest, CopilotResponse, ToolCallTrace
from app.services import copilot as copilot_svc
```

Append this route at the end of the file:

```python
@router.post("/copilot", response_model=CopilotResponse)
async def merchant_copilot(
    body: CopilotRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    """Single-turn, read-only natural-language analytics for the merchant's store."""
    question = body.question.strip()
    if not question:
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request",
            "question must not be empty", request.url.path,
        )
    try:
        result = await copilot_svc.answer_question(db, current_user, question)
    except copilot_svc.CopilotError as e:
        title = "Service Unavailable" if e.status_code == status.HTTP_503_SERVICE_UNAVAILABLE else "Bad Gateway"
        raise _problem(e.status_code, title, e.detail, request.url.path)

    return CopilotResponse(
        answer=result.answer,
        tool_calls=[
            ToolCallTrace(tool=c.tool, input=c.input, result=c.result) for c in result.tool_calls
        ],
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_copilot_endpoint.py -q`
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/api/merchant.py backend/tests/conftest.py backend/tests/integration/test_copilot_endpoint.py
git commit -m "feat(copilot): POST /merchant/copilot endpoint + isolation tests"
```

---

### Task 5: Full-suite verification, lint, PROMPT_LOG, memory

**Files:**
- Modify: `PROMPT_LOG.md`
- (memory files under `~/.claude/.../memory/`)

- [ ] **Step 1: Run the full suite with the coverage gate**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/ -q --cov=app --cov-fail-under=70`
Expected: PASS, coverage ≥ 70%. Confirm the new `app/services/copilot.py` line count is covered by the loop + handler tests (the `# pragma: no cover` network paths are excluded).

- [ ] **Step 2: Run flake8 with the exact CI flags**

Run: `docker exec shopflow-backend-1 python -m flake8 app/ tests/ --max-line-length=120 --extend-ignore=E501,W503,E203`
Expected: no output (clean). Fix any findings and re-run.

- [ ] **Step 3: Fill PROMPT_LOG Entry 26**

In `PROMPT_LOG.md`, replace the Entry 26 stub with a filled entry: Tool Used (Claude Code, Opus 4.8), the verbatim prompt, Output Quality, What You Changed (the four new/modified files + spec/plan under `docs/superpowers/`), and What You Learned (manual agentic loop for auth-scoped tools; `set_llm` swap hook keeps Anthropic out of CI; `merchant_id` injection as the isolation boundary; SHAP-style transparency via the `tool_calls` trace).

- [ ] **Step 4: Update memory**

Update `shopflow_project.md`: Week 6 now also includes the Merchant Copilot (Entry 26) — endpoint, tools, swap-hook test pattern, model `claude-opus-4-8`. Update the `MEMORY.md` index line.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/shopflow
git add PROMPT_LOG.md
git commit -m "docs(copilot): fill PROMPT_LOG Entry 26"
```

---

## Self-Review

**1. Spec coverage:**
- Single-turn / stateless → Task 2 loop (one `answer_question` call, no history). ✓
- Read-only tools → Task 3 (all handlers are queries). ✓
- Answer + tool_calls trace → Task 2 `CopilotAnswer`, Task 4 `CopilotResponse`. ✓
- Manual async loop, `claude-opus-4-8`, adaptive+medium+strict → Task 2 `_anthropic_turn`. ✓
- Security invariant (merchant_id injected) → Task 3 handlers + Task 4 isolation test. ✓
- Lazy `AsyncAnthropic`, config, `anthropic` dep → Tasks 1–2. ✓
- Six tools → Task 3. ✓
- RFC 7807 error mapping (503/502, empty-question 400) → Task 4. ✓
- Swap hook + `SHOPFLOW_FAKE_COPILOT` + conftest reset → Tasks 2 & 4. ✓
- Tests: role guard, empty, happy, isolation, multi-tool/iteration cap, tool-error recovery → Tasks 2 & 4. ✓
- Rate limit (`20/minute`): spec calls it "e.g." — deferred as optional; not a separate task. Noted here as a known omission (slowapi decorator can be added later; no test depends on it).
- pragma no cover on network paths → Task 2. ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". All code steps carry full code. ✓

**3. Type consistency:** `answer_question(db, merchant, question)`, `CopilotAnswer{answer, tool_calls}`, `ToolCall{tool, input, result}`, `set_llm`, `LLMBlock`/`LLMResponse`, `CopilotError{detail, status_code}`, `TOOL_HANDLERS`/`TOOL_DEFS` used consistently across Tasks 2–4. Endpoint maps `ToolCall` → `ToolCallTrace` (Task 4). ✓

**Known deviation from spec:** the per-endpoint `20/minute` rate limit is omitted (spec marked it "e.g."). Flagged above; add later if desired.
