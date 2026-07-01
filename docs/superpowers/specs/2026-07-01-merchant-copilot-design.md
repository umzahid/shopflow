# Merchant Copilot — Design Spec

**Date:** 2026-07-01
**Assignment task:** Domain 5 — Entry 26 (Merchant Copilot with tool calling)
**Status:** Approved, pending implementation plan

## Purpose

A single-turn, read-only, natural-language analytics assistant for ShopFlow
merchants. A merchant asks a question in plain English ("what were my top
products last month?", "which items need restocking?"); Claude decides which
analytics tools to call, the backend executes them scoped to that merchant, and
Claude synthesizes a natural-language answer. The response also returns a trace
of the tool calls made, so the tool-use loop is demonstrable and auditable.

## Decisions (locked)

- **Interaction model:** single-turn / stateless. No conversation history. Claude
  still performs multi-*step* tool calling within the one turn.
- **Capability:** read-only. Tools only query; nothing mutates merchant data.
- **Response shape:** natural-language `answer` plus a `tool_calls` trace.
- **Approach:** manual async agentic loop (not the SDK tool-runner) — we need to
  inject the authenticated merchant's identity into every tool call and capture
  the trace.
- **Model:** `claude-opus-4-8` via the official async `anthropic` SDK
  (`AsyncAnthropic`). Adaptive thinking on, `effort: "medium"`,
  `tool_choice: auto`, `strict: true` tools, `max_tokens: 2048`, non-streaming.

## Security invariant

The model **never** supplies `merchant_id`. Every tool handler receives the
authenticated `merchant.id` injected by the backend, so Claude physically cannot
query another merchant's data. The system prompt reinforces this (defense in
depth), but the scoping is enforced in code, not by the prompt.

## Architecture & components

New pieces, following existing ShopFlow conventions (lazy client singleton,
`set_*()` swap-hook + `SHOPFLOW_FAKE_*` env toggle for tests, RFC 7807 errors,
merchant-role gating):

- **`app/services/copilot.py`** — orchestrator. Holds the system prompt,
  `TOOL_DEFS` (raw JSON-schema list), the tool dispatch table, the lazy
  `AsyncAnthropic` singleton, and `answer_question(db, merchant, question) ->
  CopilotAnswer`. Runs the manual async agentic loop. Exposes a `set_llm()` swap
  hook + `SHOPFLOW_FAKE_COPILOT=1` toggle for tests.
- **`app/schemas/copilot.py`** — `CopilotRequest {question}`,
  `ToolCallTrace {tool, input, result}`, `CopilotResponse {answer, tool_calls}`.
- **`app/api/merchant.py`** — new `POST /merchant/copilot`, gated by
  `require_role(UserRole.merchant)`, reuses the router's `_problem` helper.
- **`app/core/config.py`** — `COPILOT_MODEL="claude-opus-4-8"`,
  `COPILOT_MAX_ITERATIONS=5`, `COPILOT_EFFORT="medium"`. `ANTHROPIC_API_KEY`
  already exists.
- **`requirements.txt`** — add `anthropic`.

## Tool surface (read-only, all merchant-scoped)

All tools use `strict: true`. Handlers reuse existing service functions where
they exist. `merchant_id` is injected by the backend, never a tool parameter.

| Tool | Backs onto | Notes |
|---|---|---|
| `get_revenue_summary(period_days)` | scoped query (mirrors `merchant._revenue_since`) | total revenue over N days |
| `get_top_products(limit, period_days)` | dashboard query | top by revenue/units |
| `get_order_stats()` | order-status counts | includes `pending_review` (fraud) count |
| `find_products(query)` | catalog search | resolves a product name → id for conversational references |
| `get_product_forecast(product_id, horizon_days)` | `app.ml.forecast.forecast_product_demand` (Week 5) | Prophet forecast |
| `get_restock_alerts(lead_time_days)` | `app.services.restock.get_restock_alerts` (Week 5) | shortfall list |

**Known duplication (accepted this pass):** revenue/top-product SQL currently
lives in the `merchant.py` router. The Copilot handlers will issue their own
scoped queries rather than refactor the router. Extraction into a shared
`app/services/analytics.py` is noted as future work, out of scope here.

## Data flow (the loop)

1. `POST /merchant/copilot {question}` → role-gated handler →
   `copilot.answer_question(db, current_user, question)`.
2. Build `messages=[{role: user, content: question}]`; call
   `AsyncAnthropic.messages.create(model=COPILOT_MODEL, system=SYSTEM_PROMPT,
   tools=TOOL_DEFS, tool_choice={"type": "auto"},
   thinking={"type": "adaptive"}, output_config={"effort": COPILOT_EFFORT},
   max_tokens=2048)`.
3. If `stop_reason == "tool_use"`: execute each requested `tool_use` block
   concurrently (`asyncio.gather`) with the injected merchant scope; append the
   assistant turn (full `response.content`) and one user message containing all
   `tool_result` blocks (each keyed by `tool_use_id`); record each call in the
   trace; loop.
4. Stop on `stop_reason == "end_turn"` or when `COPILOT_MAX_ITERATIONS` is hit.
5. Return `CopilotAnswer{answer_text, tool_calls}`; handler maps to
   `CopilotResponse`.

## Response shape

```json
{
  "answer": "Your revenue over the last 30 days was $12,430...",
  "tool_calls": [
    {"tool": "get_revenue_summary", "input": {"period_days": 30}, "result": {"revenue": "12430.00"}}
  ]
}
```

## Error handling (RFC 7807)

- Anthropic `RateLimitError` → 503; other `APIStatusError` / `APIConnectionError`
  → 502. Both via the router's `_problem` helper.
- `stop_reason == "refusal"` → 200 with a graceful decline message.
- Tool execution error → `tool_result` with `is_error: true`; the loop continues
  so the model can recover.
- Iteration cap hit → 200 with the best answer so far plus a note.
- Endpoint-specific rate limit (Claude calls are costly) — e.g. `20/minute` via
  slowapi.

## Testing (real Postgres, no external API in CI)

Swap-hook pattern identical to `fraud` / `forecast` / `embedding`: a module-level
`_llm_override` set by a session-scoped conftest fixture (`SHOPFLOW_FAKE_COPILOT`
env toggle). The fake is a **scripted turn function** `(messages, tools) ->
assistant_blocks` — e.g. "first return a `get_revenue_summary` tool_use, then
return final text" — so the loop, tool dispatch, merchant-scoping, and trace
assembly are exercised **without calling Anthropic**.

Tests:
- role guard: non-merchant → 403
- empty question → 400
- happy path: scripted revenue tool call → answer + non-empty trace
- **isolation (security-critical):** seed merchants A and B; A's Copilot never
  returns B's data
- multi-tool round in a single turn
- iteration-cap termination
- tool-error recovery (`is_error` tool_result → loop continues)

CI gates unchanged: `flake8` (max-line-length 120, extend-ignore E501,W503,E203),
pytest `--cov=app --cov-fail-under=70`. `app/scripts/*` omitted from coverage;
the real-model / real-Anthropic code paths guarded with `# pragma: no cover`
where they can't be exercised without network (same as `forecast._prophet_*` and
`fraud._model_score`).

## Guardrails & scope

System prompt: read-only analytics assistant for *this* store only; report only
tool-returned numbers (never fabricate); decline off-topic requests. Backend
scoping is defense-in-depth behind the prompt.

**Out of scope (documented future extensions):**
- Multi-turn conversation memory
- Write / mutating actions
- Streaming responses
- Chart / structured-visualization rendering
- Prompt-cache tuning — the stable prefix (system + tools) is likely under Opus
  4.8's 4096-token cache minimum, so no `cache_control` is added speculatively.

## Follow-up after implementation

- Fill `PROMPT_LOG.md` Entry 26.
- Update memory (`shopflow_project.md`).
- Verify against the exact CI commands before committing.
