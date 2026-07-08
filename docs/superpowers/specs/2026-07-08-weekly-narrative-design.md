# AI Weekly Narrative — Design Spec

**Date:** 2026-07-08 · **Branch:** `feat/frontend-prd-tail`
**PRD refs:** Domain 2 §2.3 (merchant analytics: "AI-generated weekly narrative"), Domain 5 (AI features surface in the real frontend)
**Status:** approved design, pending implementation plan

## Goal

A merchant-facing "This week at a glance" card on `/merchant/analytics` that generates a short, Claude-written summary of the store's week — revenue movement, standout products, and stock risks — from the merchant's own data. Button-triggered, 24h-cached.

## Non-goals (YAGNI)

- No scheduled or emailed digests.
- No archive/history of past weeks' narratives.
- No per-day drill-down or charts inside the card (the page already has revenue + funnel charts).
- No cross-merchant or platform-wide narrative.

## Architecture

Three layers, each mirroring the existing AI-description-generator feature so it stays consistent with the codebase.

### 1. Service — `backend/app/services/narrative.py`

Template: `backend/app/services/descriptions.py` (single-shot, non-agentic Claude call).

- **`SYSTEM_PROMPT`** — a retail analyst that writes a concise week-in-review (2–4 sentences) from the supplied JSON stats **only**; never invents numbers; names the biggest mover and any stock risk; plain, non-hyperbolic tone.
- **Structured output** via `extra_body={"output_config": {"format": {"type": "json_schema", "schema": NARRATIVE_SCHEMA}}}` (same wire mechanism descriptions uses on `anthropic==0.69.0`).
  - `NARRATIVE_SCHEMA`: `{ narrative: string, highlights: string[] }`, `additionalProperties: false`, both required.
  - `narrative` = one headline paragraph. `highlights` = 2–3 short bullet callouts.
- **Swap hook + fake toggle** — `set_narrator(fn | None)` test hook; `SHOPFLOW_FAKE_NARRATIVE=1` env toggle; deterministic `_fake_narrate(stats)` returning a canned narrative + highlights derived from the stats dict (no network). `_current_narrator()` resolves override → env fake → `_anthropic_narrate`.
- **`_anthropic_narrate(stats)`** — behind `# pragma: no cover`; builds the user prompt from the stats bundle; wraps `RateLimitError` → 503, `APIStatusError`/`APIConnectionError` → 502; parses the JSON, raising `NarrativeError` on unreadable/empty output.
- **`NarrativeError(detail, status_code=502)`** — same shape as `DescriptionError`/`CopilotError`.
- **Client guard** — no `ANTHROPIC_API_KEY` → `NarrativeError("… not configured on this deployment.", 503)` (avoids the SDK TypeError→500 trap, same guard as the other two services).
- **Model** — new setting `NARRATIVE_MODEL: str = "claude-opus-4-8"` in `app/core/config.py` (alongside `COPILOT_MODEL`/`DESCRIPTION_MODEL`).

The service takes an already-assembled `stats: dict` and returns `(narrative: str, highlights: list[str])`. It does **not** touch the DB — stats gathering lives in the endpoint layer, keeping the LLM unit independently testable.

### 2. Stats gathering + endpoint — `backend/app/api/merchant.py`

- **`_gather_week_stats(db, merchant_id) -> dict`** — pure merchant-scoped DB reads:
  - Add `_revenue_between(db, mid, start_days_ago, end_days_ago)` (generalizes the existing `_revenue_since`, which becomes `_revenue_between(db, mid, N, 0)`). Both windows use the existing `REVENUE_STATUSES` + join.
  - `revenue_this_week` = `_revenue_between(db, mid, 7, 0)`; `revenue_prior_week` = `_revenue_between(db, mid, 14, 7)`.
  - `delta_pct` — computed from the two; if `revenue_prior_week == 0`, `delta_pct = null` (the narrative describes it in words instead of a percentage).
  - `orders_this_week` — count of distinct orders (with ≥1 of this merchant's items) created in the last 7d, plus a by-status breakdown.
  - `top_products` — top 3 products this week by revenue (reuse the dashboard's top-products query with a 7-day cutoff).
  - `restock_alerts` — `get_restock_alerts(db, mid)` summarized to `{title, stock_qty}` for low-stock SKUs.
  - Returns a JSON-serializable dict (Decimals → str) — the exact bundle the model sees.
- **`POST /merchant/weekly-narrative`** — `require_role(UserRole.merchant)`, `Request` for the problem `instance`.
  - Query param `refresh: bool = False`.
  - **Cache:** key `narrative:{merchant_id}:{iso_year}-W{iso_week}` (from `date.today().isocalendar()`). On hit (and not `refresh`) → return cached payload with `cached: true`. On miss → gather stats → `narrate` → `redis.setex(key, 86400, payload)` → return `cached: false`.
  - Maps `NarrativeError` → RFC 7807 via the existing `_problem()` (503 → "Service Unavailable", else 502 → "Bad Gateway"), same as `/copilot` and `/generate-description`.
  - Empty store (no sales, no products) → stats bundle reflects zeros; the fake and the real prompt both produce a "quiet week" narrative — no special-case error.
- **Response schema** — `app/schemas/narrative.py`: `WeeklyNarrativeResponse { narrative: str, highlights: list[str], generated_at: datetime, cached: bool }`. `generated_at` is stored in the cached payload so "generated Xh ago" survives cache hits.

### 3. Frontend — `/merchant/analytics`

- **Types** (`frontend/src/types/api.ts`): `WeeklyNarrative { narrative: string; highlights: string[]; generated_at: string; cached: boolean }`.
- **Hook** (`frontend/src/lib/merchant.ts`): `useWeeklyNarrative()` — `useMutation` posting to `/merchant/weekly-narrative` (optionally `?refresh=true`), matching the `useCopilot`/`useGenerateDescription` shape. No react-query cache needed (backend owns the 24h cache); the component holds the last result in local state.
- **Card** — a new "This week at a glance" section placed at the **top** of `AnalyticsPage`, above "Revenue over time". Replaces the current geo-heat-map placeholder paragraph (that paragraph is removed; the geo deviation is already documented in the README).
  - **Idle:** heading + subtext + `[ Generate weekly summary ]` button.
  - **Loading:** `Skeleton` block (matches the page's other loading states — no spinner).
  - **Loaded:** narrative paragraph, highlights as a bulleted list, and a footer line "generated Xh ago" with a refresh control (⟳) that re-posts with `refresh=true`.
  - **Error:** inline friendly message from the RFC 7807 `detail` (e.g. "Weekly summary isn't available on this deployment.").
  - Styling: same `rounded-xl border border-border bg-surface p-5 shadow-token-sm` section shell as the existing cards; dark-mode via the existing tokens; button reuses the shared `Button` component.

## Data flow

```
[Generate] click
  → useWeeklyNarrative mutation
  → POST /merchant/weekly-narrative[?refresh]
  → cache check (narrative:{mid}:{iso-week})
      hit  → return payload {cached:true}
      miss → _gather_week_stats(db, mid)
           → narrative.narrate(stats)  (Claude single-shot, or fake)
           → redis.setex 24h
           → return payload {cached:false}
  → card renders narrative + highlights + "generated Xh ago"
```

## Error handling

| Condition | Backend | Frontend |
|---|---|---|
| No `ANTHROPIC_API_KEY` | `NarrativeError(503)` → RFC 7807 503 | inline "not available on this deployment" |
| Anthropic rate-limited | `NarrativeError(503)` | inline "rate-limited, retry shortly" |
| Anthropic down / unreadable output | `NarrativeError(502)` | inline "temporarily unavailable" |
| Empty store | normal 200, "quiet week" narrative | renders normally |
| Redis unavailable | cache read/write best-effort; fall through to a live generate | renders normally |

## Testing

**Backend (integration, real DB, `SHOPFLOW_FAKE_NARRATIVE=1` or `set_narrator` fake):**
1. Happy path — merchant with seeded sales → 200, non-empty `narrative`, ≥1 highlight, `cached:false`.
2. Cache hit — second call same week → `cached:true`, identical `generated_at`.
3. `refresh=true` — bypasses cache → `cached:false`, new `generated_at`.
4. Merchant isolation — merchant A's stats bundle never includes merchant B's orders/products (assert via a scripted narrator that echoes the stats it received).
5. Empty store — merchant with no sales → 200, coherent "quiet week" narrative, no error.
6. Role guard — non-merchant → 403.

**Frontend (Vitest + RTL):**
- Card renders the three states (idle button / loading skeleton / loaded narrative+highlights) against a mocked hook.

## Config additions

- `app/core/config.py`: `NARRATIVE_MODEL: str = "claude-opus-4-8"`.
- Env toggle `SHOPFLOW_FAKE_NARRATIVE` (documented next to the existing `SHOPFLOW_FAKE_COPILOT` / `SHOPFLOW_FAKE_DESCRIPTIONS`).
- Reuse `CACHE_TTL_SECONDS = 86400` convention from `forecast.py` (define locally in the endpoint/module).

## Files touched

- **New:** `backend/app/services/narrative.py`, `backend/app/schemas/narrative.py`, `backend/tests/integration/test_weekly_narrative.py`, `frontend/src/components/merchant/WeeklyNarrativeCard.tsx` (+ its test).
- **Edited:** `backend/app/api/merchant.py` (stats helper + endpoint), `backend/app/core/config.py` (model setting), `frontend/src/lib/merchant.ts` (hook), `frontend/src/types/api.ts` (types), `frontend/src/app/merchant/analytics/page.tsx` (mount card, remove geo placeholder).
