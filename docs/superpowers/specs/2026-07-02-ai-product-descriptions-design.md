# AI Product Description Generator — Design Spec

**Date:** 2026-07-02
**Assignment task:** Domain 5 — Entry 27 (AI product description generator)
**Status:** Approved, pending implementation plan

## Purpose

A merchant-facing Claude API feature that generates marketing product
descriptions from a product's attributes (title, category, key features), with
tone and length controls. It returns **3 distinct variants** so the merchant can
pick a favorite. The endpoint is **stateless and non-destructive**: it returns
text only; the merchant reviews/edits and saves through the existing product
create/update flow (which already re-embeds on text change).

## Decisions (locked)

- **Endpoint shape:** stateless "generate from attributes" — no product id, no
  persistence. Works before a product exists.
- **Output:** 3 variants per call (`DESCRIPTION_MAX_VARIANTS = 3`).
- **Controls:** optional `tone` and `length`, constrained enums with defaults.
- **Generation:** a single (non-agentic) `messages.create` call to
  `claude-opus-4-8` via a lazy `AsyncAnthropic` singleton, using **structured
  outputs** (`output_config.format` = JSON schema `{variants: [string]}`).
- **SDK caveat (verified in Entry 26):** `anthropic==0.69.0` has no named
  `output_config` kwarg — pass it via `extra_body={"output_config": {...}}` so it
  reaches the wire regardless of SDK build. `thinking` is a valid named kwarg but
  is not needed for this call.

## Architecture & components

Mirrors the Merchant Copilot conventions (lazy client, `set_*()` swap hook +
`SHOPFLOW_FAKE_*` env toggle so CI never hits the network, RFC 7807 errors,
merchant-role gating, real-DB tests).

- **`app/services/descriptions.py`**
  - `async generate_descriptions(req: DescriptionRequest) -> list[str]` — builds
    the prompt, makes one Claude call, parses `{variants: [...]}`, clamps to
    `DESCRIPTION_MAX_VARIANTS`, returns the list.
  - `_anthropic_generate(req)` — lazy `import anthropic`, `# pragma: no cover`.
    Wraps API errors as `DescriptionError`. Passes `output_config` via
    `extra_body`.
  - `_fake_generate(req)` — deterministic 3-variant output for tests/CI.
  - `set_generator(fn | None)` swap hook; `SHOPFLOW_FAKE_DESCRIPTIONS=1` toggle;
    `_current_generator()` resolves override → env → real.
  - `DescriptionError(detail, status_code)`.
  - Lazy `AsyncAnthropic` singleton `_get_client()` (`# pragma: no cover`).
- **`app/schemas/descriptions.py`**
  - `DescriptionRequest { title: str, category: str | None, key_features:
    list[str] = [], tone: ToneEnum = professional, length: LengthEnum = medium }`.
  - `ToneEnum` ∈ {professional, playful, luxury, minimal};
    `LengthEnum` ∈ {short, medium, long}.
  - `DescriptionResponse { variants: list[str] }`.
- **`app/api/merchant.py`** — `POST /merchant/generate-description`, gated by
  `require_role(UserRole.merchant)`, reuses the router `_problem` helper.
- **`app/core/config.py`** — `DESCRIPTION_MODEL: str = "claude-opus-4-8"`,
  `DESCRIPTION_MAX_VARIANTS: int = 3`. (Kept independent from the Copilot config
  so the two features evolve separately.)

## Data flow

1. `POST /merchant/generate-description {title, category?, key_features?, tone?,
   length?}` → role-gated handler.
2. Validate: empty/whitespace `title` → RFC 7807 400.
3. `descriptions.generate_descriptions(req)`:
   - System prompt: "You are an e-commerce copywriter. Write `tone`, `length`
     marketing product descriptions from the given attributes. Return exactly 3
     distinct variants. Do not invent specifications, materials, or claims not
     implied by the inputs."
   - One `messages.create(model=DESCRIPTION_MODEL, max_tokens=1024, system=...,
     messages=[{user: attributes}], extra_body={"output_config": {"format":
     {"type": "json_schema", "schema": VARIANTS_SCHEMA}}})`.
   - `VARIANTS_SCHEMA = {"type": "object", "properties": {"variants": {"type":
     "array", "items": {"type": "string"}}}, "required": ["variants"],
     "additionalProperties": False}`. (JSON Schema can't enforce exact array
     length — the "exactly 3" instruction lives in the prompt; the service clamps
     to `DESCRIPTION_MAX_VARIANTS`.)
   - `json.loads` the first text block → `variants`; clamp to
     `DESCRIPTION_MAX_VARIANTS`.
4. Return `DescriptionResponse{variants}`. Non-destructive — no product row is
   created or mutated.

## Error handling (RFC 7807, via router `_problem`)

- Empty/whitespace title → 400.
- Anthropic `RateLimitError` → 503; other `APIStatusError` /
  `APIConnectionError` → 502. Wrapped as `DescriptionError` inside the service so
  the router never imports `anthropic`.
- `stop_reason == "refusal"` → 200 with an empty `variants` list (graceful; the
  caller sees no suggestions rather than an error).
- Malformed/empty model JSON (should not happen with structured outputs, but
  defensively) → `DescriptionError` 502.

## Testing (real Postgres, no external API in CI)

Swap-hook pattern identical to Copilot/fraud/forecast: a session-scoped conftest
fixture installs `_fake_generate` (via `SHOPFLOW_FAKE_DESCRIPTIONS` or
`set_generator`), plus an autouse reset that calls `set_generator(None)` after
each test.

- **Unit** (`tests/unit/test_descriptions.py`): fake returns 3 variants;
  clamp-to-3 when the generator yields >3; `DescriptionRequest` validation
  (tone/length enum rejection, defaults applied).
- **Integration** (`tests/integration/test_descriptions_endpoint.py`): role
  guard (non-merchant → 403), empty title → 400, happy path (scripted fake → 3
  variants in the response body), and statelessness (no product created/mutated —
  product count unchanged before/after).

CI gates unchanged: flake8 (`--max-line-length=120 --extend-ignore=E501,W503,E203`;
no F401), pytest `--cov=app --cov-fail-under=70`. The real-Anthropic path
(`_anthropic_generate`, `_get_client`) carries `# pragma: no cover`.

## Scope

**In:** stateless generation, 3 variants, tone + length controls, merchant-gated,
structured-output parsing, deterministic fake for CI.

**Out (documented future extensions):**
- Persisting / auto-saving a chosen variant to a product (merchant uses the
  existing create/update flow).
- Image-based or multi-language generation.
- Streaming responses.
- Prompt-cache tuning (single short call, below Opus 4.8's cache minimum).
- Per-endpoint rate-limit decorator (optional; note only).

## Follow-up after implementation

- Fill `PROMPT_LOG.md` Entry 27.
- Update memory (`shopflow_project.md`).
- Verify against the exact CI commands before committing.
