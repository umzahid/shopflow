# AI Weekly Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a button-triggered, Claude-generated "This week at a glance" summary card to the merchant analytics page.

**Architecture:** A single-shot Claude service (`narrative.py`) mirroring the existing `descriptions.py` (swap hook + fake toggle + structured output). A `POST /merchant/weekly-narrative` endpoint gathers week-over-week stats via merchant-scoped DB reads and caches the result in Redis for 24h. A React card on `/merchant/analytics` posts to it and renders narrative + highlights.

**Tech Stack:** FastAPI, async SQLAlchemy, Redis (aioredis), Anthropic SDK `0.69.0`, Next.js 14 + React Query + Vitest/RTL.

**Spec:** `docs/superpowers/specs/2026-07-08-weekly-narrative-design.md`

## Global Constraints

- Anthropic `output_config` is not a named kwarg in `anthropic==0.69.0` — pass structured-output config via `extra_body={"output_config": {...}}` (verbatim from the existing services).
- No `ANTHROPIC_API_KEY` must raise a service error mapped to RFC 7807 **503**, never a raw 500 (the SDK raises `TypeError` at request-build time otherwise).
- All HTTP errors use the existing `_problem()` helper in `merchant.py` (RFC 7807 shape).
- Every merchant-scoped query filters by the authenticated merchant's id; the model never receives another merchant's data.
- CI must never hit the network: gate the live Anthropic path behind `set_narrator()` / `SHOPFLOW_FAKE_NARRATIVE=1`, exactly like `descriptions.py`.
- Backend tests run against a real `shopflow_test` Postgres (no mocking DB). bcrypt stays pinned `4.0.1`.
- Redis TTL for the narrative cache: `86400` seconds (24h).

---

### Task 1: Narrative service + config + response schema

**Files:**
- Create: `backend/app/services/narrative.py`
- Create: `backend/app/schemas/narrative.py`
- Modify: `backend/app/core/config.py` (add `NARRATIVE_MODEL`)
- Test: `backend/tests/unit/test_narrative_service.py`

**Interfaces:**
- Produces: `narrate(stats: dict) -> tuple[str, list[str]]` (async); `set_narrator(fn | None)`; `NarrativeError(detail: str, status_code: int = 502)`; schema `WeeklyNarrativeResponse{narrative: str, highlights: list[str], generated_at: datetime, cached: bool}`; setting `settings.NARRATIVE_MODEL`.

- [ ] **Step 1: Add the config setting**

In `backend/app/core/config.py`, directly below the `DESCRIPTION_MAX_VARIANTS` line, add:

```python
    NARRATIVE_MODEL: str = "claude-opus-4-8"
```

- [ ] **Step 2: Write the response schema**

Create `backend/app/schemas/narrative.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class WeeklyNarrativeResponse(BaseModel):
    narrative: str
    highlights: list[str]
    generated_at: datetime
    cached: bool
```

- [ ] **Step 3: Write the failing unit test**

Create `backend/tests/unit/test_narrative_service.py`:

```python
import pytest

from app.services import narrative as nsvc


@pytest.fixture(autouse=True)
def _restore_narrator():
    yield
    nsvc.set_narrator(None)


def _stats(**over):
    base = {
        "revenue_this_week": "4320.00",
        "revenue_prior_week": "3857.00",
        "delta_pct": 12.0,
        "orders_this_week": 41,
        "orders_by_status": {"delivered": 30, "shipped": 8, "pending_review": 3},
        "top_products": [{"title": "Ceramic Mug", "units_sold": 48, "revenue": "888.00"}],
        "restock_alerts": [{"title": "Ceramic Mug", "stock_qty": 4}],
    }
    base.update(over)
    return base


@pytest.mark.asyncio
async def test_fake_narrate_uses_stats():
    narrative, highlights = await nsvc._fake_narrate(_stats())
    assert "4320.00" in narrative
    assert "Ceramic Mug" in narrative
    assert any("12" in h for h in highlights)
    assert any("stock" in h.lower() for h in highlights)


@pytest.mark.asyncio
async def test_fake_narrate_quiet_week():
    narrative, highlights = await nsvc._fake_narrate(
        _stats(revenue_this_week="0.00", delta_pct=None, top_products=[], restock_alerts=[], orders_this_week=0)
    )
    assert narrative  # non-empty, coherent quiet-week text
    assert isinstance(highlights, list)


@pytest.mark.asyncio
async def test_set_narrator_override_is_used():
    async def fake(stats):
        return "OVERRIDE", ["h1"]

    nsvc.set_narrator(fake)
    assert await nsvc.narrate(_stats()) == ("OVERRIDE", ["h1"])
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && pytest tests/unit/test_narrative_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.narrative'`

- [ ] **Step 5: Implement the service**

Create `backend/app/services/narrative.py`:

```python
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/unit/test_narrative_service.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/narrative.py backend/app/schemas/narrative.py backend/app/core/config.py backend/tests/unit/test_narrative_service.py
git commit -m "feat(narrative): single-shot Claude weekly-narrative service + schema + config"
```

---

### Task 2: Week-over-week stats gathering

**Files:**
- Modify: `backend/app/api/merchant.py` (generalize `_revenue_since`, add `_gather_week_stats`)
- Test: `backend/tests/integration/test_weekly_narrative.py` (stats portion)

**Interfaces:**
- Consumes: `REVENUE_STATUSES`, existing top-products query shape, `get_restock_alerts` from Task-0 codebase.
- Produces: `_revenue_between(db, merchant_id, start_days_ago, end_days_ago) -> Decimal`; `_gather_week_stats(db, merchant_id) -> dict` with keys `revenue_this_week, revenue_prior_week, delta_pct, orders_this_week, orders_by_status, top_products, restock_alerts`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/test_weekly_narrative.py` with a stats test. Reuse the delivered-order seeding style from `test_copilot_endpoint.py`:

```python
"""POST /merchant/weekly-narrative — stats gathering + endpoint, fake narrator."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Order, OrderItem, OrderStatus
from app.services import narrative as nsvc

from tests.integration.helpers import bearer, create_product, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


@pytest.fixture(autouse=True)
def _restore_narrator():
    yield
    nsvc.set_narrator(None)


async def _seed_order(product_id, customer_id, unit_price, qty, days_ago):
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            ts = datetime.now(timezone.utc) - timedelta(days=days_ago)
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
async def test_stats_split_this_vs_prior_week(client):
    mtoken, mid = await register_merchant(client, "m-narr-stats@e.com")
    ctoken, cid = await register_customer(client, "c-narr-stats@e.com")
    prod = await create_product(client, mtoken, title="Mug", price="10.00")
    await _seed_order(prod["id"], cid, "10.00", 5, days_ago=2)   # this week: 50
    await _seed_order(prod["id"], cid, "10.00", 3, days_ago=10)  # prior week: 30

    captured = {}

    async def spy(stats):
        captured.update(stats)
        return "ok", ["h"]

    nsvc.set_narrator(spy)
    res = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mtoken))
    assert res.status_code == 200, res.text
    assert Decimal(captured["revenue_this_week"]) == Decimal("50.00")
    assert Decimal(captured["revenue_prior_week"]) == Decimal("30.00")
    assert captured["top_products"][0]["title"] == "Mug"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && SHOPFLOW_FAKE_NARRATIVE=1 pytest tests/integration/test_weekly_narrative.py::test_stats_split_this_vs_prior_week -v`
Expected: FAIL with 404 (endpoint not yet added) — the stats helper and route come in this task and Task 3. (This test also exercises the Task 3 route; it passes only after Task 3. Keep it here; run it at the end of Task 3.)

> Note: Task 2 delivers the helpers; the assertion runs green after Task 3 mounts the route. If you prefer a Task-2-only gate, temporarily call `_gather_week_stats` directly in a throwaway REPL. The committed test is the endpoint test.

- [ ] **Step 3: Generalize `_revenue_since` → `_revenue_between`**

In `backend/app/api/merchant.py`, replace the `_revenue_since` helper (around line 74) with a window version and keep a thin back-compat alias so existing callers (`merchant_dashboard`) are untouched:

```python
async def _revenue_between(
    db: AsyncSession, merchant_id: str, start_days_ago: int, end_days_ago: int
) -> Decimal:
    """Recognized revenue for orders created in [now-start_days_ago, now-end_days_ago)."""
    lower = func.now() - timedelta(days=start_days_ago)
    upper = func.now() - timedelta(days=end_days_ago)
    stmt = (
        select(func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= lower,
            Order.created_at < upper,
        )
    )
    return Decimal((await db.execute(stmt)).scalar() or 0)


async def _revenue_since(db: AsyncSession, merchant_id: str, days: int) -> Decimal:
    return await _revenue_between(db, merchant_id, days, 0)
```

(If the original `_revenue_since` body differs, preserve its exact join/filter logic — this version matches the dashboard's recognized-revenue definition.)

- [ ] **Step 4: Add `_gather_week_stats`**

Add near the other merchant helpers in `merchant.py`:

```python
async def _gather_week_stats(db: AsyncSession, merchant_id: str) -> dict:
    """Week-over-week bundle fed to the narrative model. Merchant-scoped reads only."""
    this_week = await _revenue_between(db, merchant_id, 7, 0)
    prior_week = await _revenue_between(db, merchant_id, 14, 7)
    delta_pct = (
        round(float((this_week - prior_week) / prior_week) * 100, 1)
        if prior_week != 0 else None
    )

    cutoff = func.now() - timedelta(days=7)
    status_rows = (await db.execute(
        select(Order.status, func.count(func.distinct(Order.id)))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == merchant_id, Order.created_at >= cutoff)
        .group_by(Order.status)
    )).all()
    orders_by_status = {s.value: c for s, c in status_rows}

    top_rows = (await db.execute(
        select(
            Product.title,
            func.sum(OrderItem.quantity).label("units"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("rev"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.in_(REVENUE_STATUSES),
            Order.created_at >= cutoff,
        )
        .group_by(Product.title)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        .limit(3)
    )).all()
    top_products = [
        {"title": t, "units_sold": int(u), "revenue": str(Decimal(r))} for t, u, r in top_rows
    ]

    alerts = await get_restock_alerts(db, merchant_id)  # lead_time_days defaults to 7
    # RestockAlert exposes .title and .current_stock (verified in app/services/restock.py:21-34)
    restock_alerts = [{"title": a.title, "current_stock": a.current_stock} for a in alerts]

    return {
        "revenue_this_week": str(this_week),
        "revenue_prior_week": str(prior_week),
        "delta_pct": delta_pct,
        "orders_this_week": sum(orders_by_status.values()),
        "orders_by_status": orders_by_status,
        "top_products": top_products,
        "restock_alerts": restock_alerts,
    }
```

- [ ] **Step 5: Commit (helpers only)**

```bash
git add backend/app/api/merchant.py backend/tests/integration/test_weekly_narrative.py
git commit -m "feat(narrative): week-over-week stats gathering helpers"
```

---

### Task 3: Endpoint + 24h Redis cache

**Files:**
- Modify: `backend/app/api/merchant.py` (imports, route)
- Test: `backend/tests/integration/test_weekly_narrative.py` (add endpoint tests)

**Interfaces:**
- Consumes: `narrate`, `set_narrator`, `NarrativeError` (Task 1); `_gather_week_stats` (Task 2); `get_redis`.
- Produces: `POST /api/v1/merchant/weekly-narrative?refresh=<bool>` → `WeeklyNarrativeResponse`.

- [ ] **Step 1: Add the remaining endpoint tests**

Append to `backend/tests/integration/test_weekly_narrative.py`:

```python
@pytest.mark.asyncio
async def test_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-narr-role@e.com")
    res = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(ctoken))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_empty_store_returns_quiet_week(client):
    mtoken, _ = await register_merchant(client, "m-narr-empty@e.com")
    nsvc.set_narrator(None)  # use SHOPFLOW_FAKE_NARRATIVE fake
    res = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mtoken))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["narrative"]
    assert body["cached"] is False


@pytest.mark.asyncio
async def test_cache_hit_then_refresh(client):
    mtoken, _ = await register_merchant(client, "m-narr-cache@e.com")
    nsvc.set_narrator(None)
    first = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mtoken))
    assert first.json()["cached"] is False
    second = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mtoken))
    assert second.json()["cached"] is True
    assert second.json()["generated_at"] == first.json()["generated_at"]
    refreshed = await client.post(
        "/api/v1/merchant/weekly-narrative?refresh=true", headers=bearer(mtoken)
    )
    assert refreshed.json()["cached"] is False


@pytest.mark.asyncio
async def test_merchant_isolation(client):
    ma, mida = await register_merchant(client, "m-narr-a@e.com")
    mb, midb = await register_merchant(client, "m-narr-b@e.com")
    ca, cida = await register_customer(client, "c-narr-a@e.com")
    pa = await create_product(client, ma, title="AlphaOnly", price="10.00")
    await _seed_order(pa["id"], cida, "10.00", 2, days_ago=1)

    captured = {}

    async def spy(stats):
        captured.update(stats)
        return "ok", []

    nsvc.set_narrator(spy)
    res = await client.post("/api/v1/merchant/weekly-narrative", headers=bearer(mb))
    assert res.status_code == 200
    titles = [p["title"] for p in captured["top_products"]]
    assert "AlphaOnly" not in titles  # B never sees A's product
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && SHOPFLOW_FAKE_NARRATIVE=1 pytest tests/integration/test_weekly_narrative.py -v`
Expected: FAIL — 404 (route not mounted).

- [ ] **Step 3: Add imports + the route**

In `backend/app/api/merchant.py`, add to the imports:

```python
import json
from datetime import datetime, timezone

from app.core.redis import get_redis
from app.schemas.narrative import WeeklyNarrativeResponse
from app.services import narrative as narrative_svc
```

(Only add symbols not already imported — `date`/`timedelta`/`Decimal` are already present; add `datetime`, `timezone`, `json` if missing.)

Add the route after `generate_description`:

```python
_NARRATIVE_TTL_SECONDS = 86400  # 24h


@router.post("/weekly-narrative", response_model=WeeklyNarrativeResponse)
async def weekly_narrative(
    request: Request,
    refresh: bool = Query(default=False),
    current_user: User = Depends(require_role(UserRole.merchant)),
    db: AsyncSession = Depends(get_db),
):
    """Button-triggered AI summary of the merchant's week. Cached 24h per ISO week."""
    y, w, _ = date.today().isocalendar()
    cache_key = f"narrative:{current_user.id}:{y}-W{w}"
    redis = await get_redis()

    if not refresh:
        try:
            cached = await redis.get(cache_key)
        except Exception:
            cached = None
        if cached:
            payload = json.loads(cached)
            return WeeklyNarrativeResponse(**payload, cached=True)

    stats = await _gather_week_stats(db, current_user.id)
    try:
        narrative, highlights = await narrative_svc.narrate(stats)
    except narrative_svc.NarrativeError as e:
        title = "Service Unavailable" if e.status_code == status.HTTP_503_SERVICE_UNAVAILABLE else "Bad Gateway"
        raise _problem(e.status_code, title, e.detail, request.url.path)

    payload = {
        "narrative": narrative,
        "highlights": highlights,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await redis.setex(cache_key, _NARRATIVE_TTL_SECONDS, json.dumps(payload))
    except Exception:
        pass  # cache is best-effort; a Redis outage must not fail generation

    return WeeklyNarrativeResponse(**payload, cached=False)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && SHOPFLOW_FAKE_NARRATIVE=1 pytest tests/integration/test_weekly_narrative.py -v`
Expected: PASS (all 5 tests, including `test_stats_split_this_vs_prior_week` from Task 2).

- [ ] **Step 5: Run the full backend suite for regressions**

Run: `cd backend && SHOPFLOW_FAKE_NARRATIVE=1 SHOPFLOW_FAKE_COPILOT=1 SHOPFLOW_FAKE_DESCRIPTIONS=1 pytest -q`
Expected: all pass (previously 254+ tests, now +8).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/merchant.py backend/tests/integration/test_weekly_narrative.py
git commit -m "feat(narrative): POST /merchant/weekly-narrative endpoint + 24h Redis cache"
```

---

### Task 4: Frontend card, hook, types

**Files:**
- Modify: `frontend/src/types/api.ts` (add `WeeklyNarrative`)
- Modify: `frontend/src/lib/merchant.ts` (add `useWeeklyNarrative`)
- Create: `frontend/src/components/merchant/WeeklyNarrativeCard.tsx`
- Create: `frontend/src/components/merchant/WeeklyNarrativeCard.test.tsx`
- Modify: `frontend/src/app/merchant/analytics/page.tsx` (mount card, remove geo placeholder)

**Interfaces:**
- Consumes: `POST /merchant/weekly-narrative` (Task 3); `api` helper; `Button`, `Skeleton` components.
- Produces: `useWeeklyNarrative()` mutation hook; `<WeeklyNarrativeCard />`.

- [ ] **Step 1: Add the type**

In `frontend/src/types/api.ts`, add:

```typescript
export interface WeeklyNarrative {
  narrative: string;
  highlights: string[];
  generated_at: string;
  cached: boolean;
}
```

- [ ] **Step 2: Add the hook**

In `frontend/src/lib/merchant.ts`, add `WeeklyNarrative` to the type import from `@/types/api`, then append:

```typescript
/** POST /merchant/weekly-narrative — AI week-in-review. refresh bypasses the 24h cache. */
export function useWeeklyNarrative(): UseMutationResult<
  WeeklyNarrative,
  Error,
  { refresh?: boolean } | void
> {
  return useMutation({
    mutationFn: (vars) =>
      api<WeeklyNarrative>(
        `/merchant/weekly-narrative${vars && vars.refresh ? "?refresh=true" : ""}`,
        { method: "POST" },
      ),
  });
}
```

- [ ] **Step 3: Write the failing component test**

Create `frontend/src/components/merchant/WeeklyNarrativeCard.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WeeklyNarrativeCard } from "./WeeklyNarrativeCard";

const mutate = vi.fn();
let state: {
  mutate: typeof mutate;
  data?: unknown;
  isPending: boolean;
  error?: Error | null;
} = { mutate, isPending: false, data: undefined, error: null };

vi.mock("@/lib/merchant", () => ({
  useWeeklyNarrative: () => state,
}));

describe("WeeklyNarrativeCard", () => {
  it("shows the generate button when idle", () => {
    state = { mutate, isPending: false, data: undefined, error: null };
    render(<WeeklyNarrativeCard />);
    expect(screen.getByRole("button", { name: /generate weekly summary/i })).toBeInTheDocument();
  });

  it("shows a loading state while pending", () => {
    state = { mutate, isPending: true, data: undefined, error: null };
    render(<WeeklyNarrativeCard />);
    expect(screen.getByTestId("narrative-loading")).toBeInTheDocument();
  });

  it("renders narrative and highlights when loaded", () => {
    state = {
      mutate,
      isPending: false,
      error: null,
      data: {
        narrative: "Revenue rose 12%.",
        highlights: ["Revenue: $4320", "2 products low on stock"],
        generated_at: new Date().toISOString(),
        cached: false,
      },
    };
    render(<WeeklyNarrativeCard />);
    expect(screen.getByText("Revenue rose 12%.")).toBeInTheDocument();
    expect(screen.getByText("2 products low on stock")).toBeInTheDocument();
  });

  it("fires the mutation on click", async () => {
    state = { mutate, isPending: false, data: undefined, error: null };
    render(<WeeklyNarrativeCard />);
    await userEvent.click(screen.getByRole("button", { name: /generate weekly summary/i }));
    expect(mutate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/merchant/WeeklyNarrativeCard.test.tsx`
Expected: FAIL — cannot resolve `./WeeklyNarrativeCard`.

- [ ] **Step 5: Implement the card**

Create `frontend/src/components/merchant/WeeklyNarrativeCard.tsx`:

```typescript
"use client";

import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { useWeeklyNarrative } from "@/lib/merchant";

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function WeeklyNarrativeCard() {
  const { mutate, data, isPending, error } = useWeeklyNarrative();

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-token-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
          <Sparkles className="h-4 w-4 text-secondary" aria-hidden="true" />
          This week at a glance
        </h2>
        {data ? (
          <button
            type="button"
            onClick={() => mutate({ refresh: true })}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {agoLabel(data.generated_at)}
          </button>
        ) : null}
      </div>

      {isPending ? (
        <div data-testid="narrative-loading" className="flex flex-col gap-2">
          <Skeleton variant="text" className="h-4 w-full" />
          <Skeleton variant="text" className="h-4 w-5/6" />
          <Skeleton variant="text" className="h-4 w-2/3" />
        </div>
      ) : error ? (
        <p className="text-sm text-danger">{error.message}</p>
      ) : data ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-foreground">{data.narrative}</p>
          {data.highlights.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {data.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Generate an AI summary of this week&apos;s revenue, top products, and stock risks.
          </p>
          <Button variant="secondary" size="sm" onClick={() => mutate()} leftIcon={<Sparkles className="h-4 w-4" />}>
            Generate weekly summary
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/merchant/WeeklyNarrativeCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Mount the card, remove the geo placeholder**

In `frontend/src/app/merchant/analytics/page.tsx`:
- Add import: `import { WeeklyNarrativeCard } from "@/components/merchant/WeeklyNarrativeCard";`
- Insert `<WeeklyNarrativeCard />` as the first child inside the top-level `<div className="flex flex-col gap-8">`, before the header block (or immediately after the header — place it above "Revenue over time").
- Delete the trailing geo-heat-map `<p>` paragraph (lines ~124-127).

- [ ] **Step 8: Verify build + lint + full FE test run**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build succeeds; all tests pass (previous 23 component cases + 4 new).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/lib/merchant.ts frontend/src/components/merchant/WeeklyNarrativeCard.tsx frontend/src/components/merchant/WeeklyNarrativeCard.test.tsx frontend/src/app/merchant/analytics/page.tsx
git commit -m "feat(narrative): This-week-at-a-glance card on merchant analytics"
```

---

## Manual verification (after all tasks)

With the stack running (`docker compose up -d`, plus fresh frontend build):
1. Log in as a merchant with seeded sales → open `/merchant/analytics`.
2. Click "Generate weekly summary" → narrative + highlights render within ~2s (fake copilot path returns instantly; real path needs `ANTHROPIC_API_KEY` and `SHOPFLOW_FAKE_NARRATIVE` unset).
3. Reload → clicking again returns instantly with "Xm ago" (cache hit); the ⟳ refresh forces a new generation.
4. A merchant with no sales → coherent "quiet week" summary, no error.
