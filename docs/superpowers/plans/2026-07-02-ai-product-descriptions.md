# AI Product Description Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stateless, merchant-facing endpoint that turns product attributes into 3 Claude-generated marketing description variants.

**Architecture:** `POST /merchant/generate-description` hands the request to `app/services/descriptions.py`, which makes one non-agentic `claude-opus-4-8` call using structured outputs (`output_config.format`) and returns up to 3 variants. The Anthropic call is behind a `set_generator()` swap hook + `SHOPFLOW_FAKE_DESCRIPTIONS` toggle so CI never hits the network. Non-destructive — no product row is created or mutated.

**Tech Stack:** FastAPI (async), Pydantic v2, `anthropic` SDK (`AsyncAnthropic`), pytest against a real `shopflow_test` Postgres.

## Global Constraints

- Model id is exactly `claude-opus-4-8` (the `DESCRIPTION_MODEL` default) — never date-suffixed.
- **`anthropic==0.69.0` has no named `output_config` kwarg** — pass structured-output config via `extra_body={"output_config": {...}}` so it reaches the wire. (Verified in Entry 26.)
- **Never import `anthropic` at module top level** — only lazily inside the real-generate function, and guard real-network paths with `# pragma: no cover` (the package is not installed in the running container).
- RFC 7807 for HTTP errors — use the existing `_problem()` helper in `app/api/merchant.py`.
- The endpoint is stateless: it must not create or mutate any DB row.
- flake8 (exact CI flags): `--max-line-length=120 --extend-ignore=E501,W503,E203`. F401 (unused import) is NOT ignored and fails CI.
- Coverage gate: `pytest --cov=app --cov-fail-under=70` (in-container with `COVERAGE_FILE=/tmp/.coverage`).
- Tests run inside `shopflow-backend-1` (app/ and tests/ are volume-mounted).

---

### Task 1: Config + schemas

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/app/schemas/descriptions.py`
- Test: `backend/tests/unit/test_descriptions_schemas.py`

**Interfaces:**
- Produces: `settings.DESCRIPTION_MODEL: str`, `settings.DESCRIPTION_MAX_VARIANTS: int`.
- Produces: `ToneEnum` {professional, playful, luxury, minimal}, `LengthEnum` {short, medium, long}, `DescriptionRequest{title: str, category: str|None, key_features: list[str], tone: ToneEnum, length: LengthEnum}`, `DescriptionResponse{variants: list[str]}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_descriptions_schemas.py`:

```python
"""Config + schema wiring for the AI product description generator."""
import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.descriptions import (
    DescriptionRequest,
    DescriptionResponse,
    LengthEnum,
    ToneEnum,
)


def test_description_config_defaults():
    assert settings.DESCRIPTION_MODEL == "claude-opus-4-8"
    assert settings.DESCRIPTION_MAX_VARIANTS == 3


def test_request_defaults_applied():
    req = DescriptionRequest(title="Wireless Earbuds")
    assert req.tone == ToneEnum.professional
    assert req.length == LengthEnum.medium
    assert req.key_features == []
    assert req.category is None


def test_request_rejects_unknown_tone():
    with pytest.raises(ValidationError):
        DescriptionRequest(title="X", tone="sarcastic")


def test_response_shape():
    resp = DescriptionResponse(variants=["a", "b", "c"])
    assert resp.variants == ["a", "b", "c"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_descriptions_schemas.py -q`
Expected: FAIL — `ModuleNotFoundError: app.schemas.descriptions` / missing config attrs.

- [ ] **Step 3: Add config fields**

In `backend/app/core/config.py`, add immediately after the three `COPILOT_*` lines:

```python
    # AI product description generator (Week 6)
    DESCRIPTION_MODEL: str = "claude-opus-4-8"
    DESCRIPTION_MAX_VARIANTS: int = 3
```

- [ ] **Step 4: Create the schemas**

Create `backend/app/schemas/descriptions.py`:

```python
from enum import Enum

from pydantic import BaseModel, Field


class ToneEnum(str, Enum):
    professional = "professional"
    playful = "playful"
    luxury = "luxury"
    minimal = "minimal"


class LengthEnum(str, Enum):
    short = "short"
    medium = "medium"
    long = "long"


class DescriptionRequest(BaseModel):
    title: str = Field(max_length=255)
    category: str | None = Field(default=None, max_length=100)
    key_features: list[str] = Field(default_factory=list, max_length=20)
    tone: ToneEnum = ToneEnum.professional
    length: LengthEnum = LengthEnum.medium


class DescriptionResponse(BaseModel):
    variants: list[str]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_descriptions_schemas.py -q`
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/core/config.py backend/app/schemas/descriptions.py backend/tests/unit/test_descriptions_schemas.py
git commit -m "feat(descriptions): config + request/response schemas"
```

---

### Task 2: Generator service

**Files:**
- Create: `backend/app/services/descriptions.py`
- Test: `backend/tests/unit/test_descriptions_service.py`

**Interfaces:**
- Consumes: `settings.DESCRIPTION_MODEL`, `settings.DESCRIPTION_MAX_VARIANTS`; `DescriptionRequest`, `ToneEnum`, `LengthEnum`.
- Produces:
  - `async generate_descriptions(req: DescriptionRequest) -> list[str]` (clamps to `DESCRIPTION_MAX_VARIANTS`).
  - `set_generator(fn | None)` swap hook; `fn` is `async (DescriptionRequest) -> list[str]`.
  - `_fake_generate(req)` deterministic 3-variant fake.
  - `DescriptionError(detail: str, status_code: int)`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_descriptions_service.py`:

```python
"""Generator service — swap hook, clamp, fake output. No network."""
import pytest

from app.schemas.descriptions import DescriptionRequest, LengthEnum, ToneEnum
from app.services import descriptions
from app.services.descriptions import generate_descriptions, set_generator


@pytest.fixture(autouse=True)
def _reset():
    yield
    set_generator(None)


@pytest.mark.asyncio
async def test_fake_generate_returns_three():
    req = DescriptionRequest(title="Trail Runner", tone=ToneEnum.playful, length=LengthEnum.short)
    variants = await descriptions._fake_generate(req)
    assert len(variants) == 3
    assert all(isinstance(v, str) and v for v in variants)


@pytest.mark.asyncio
async def test_generate_uses_fake_by_default_env(monkeypatch):
    monkeypatch.setenv("SHOPFLOW_FAKE_DESCRIPTIONS", "1")
    result = await generate_descriptions(DescriptionRequest(title="Kettle"))
    assert len(result) == 3


@pytest.mark.asyncio
async def test_clamp_to_max_variants():
    async def _five(req):
        return ["a", "b", "c", "d", "e"]

    set_generator(_five)
    result = await generate_descriptions(DescriptionRequest(title="X"))
    assert len(result) == 3  # DESCRIPTION_MAX_VARIANTS


@pytest.mark.asyncio
async def test_swap_hook_overrides_generator():
    async def _custom(req):
        return [f"custom:{req.title}"]

    set_generator(_custom)
    result = await generate_descriptions(DescriptionRequest(title="Mug"))
    assert result == ["custom:Mug"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_descriptions_service.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.descriptions`.

- [ ] **Step 3: Write the service**

Create `backend/app/services/descriptions.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec shopflow-backend-1 python -m pytest tests/unit/test_descriptions_service.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/services/descriptions.py backend/tests/unit/test_descriptions_service.py
git commit -m "feat(descriptions): generator service with swap hook, clamp, structured-output path"
```

---

### Task 3: Endpoint + conftest fixture + integration tests

**Files:**
- Modify: `backend/app/api/merchant.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/integration/test_descriptions_endpoint.py`

**Interfaces:**
- Consumes: `generate_descriptions`, `DescriptionError`, `set_generator` from `app.services.descriptions`; `DescriptionRequest`/`DescriptionResponse`.
- Produces: `POST /api/v1/merchant/generate-description` (merchant-role gated) → `DescriptionResponse`.

- [ ] **Step 1: Add a conftest reset fixture**

In `backend/tests/conftest.py`, add after the `_reset_copilot_llm` fixture:

```python
@pytest.fixture(autouse=True)
def _reset_description_generator():
    """Reset the description generator swap hook after each test."""
    yield
    from app.services.descriptions import set_generator

    set_generator(None)
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/integration/test_descriptions_endpoint.py`:

```python
"""POST /merchant/generate-description — end-to-end with a fake generator."""
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.models import Product
from app.services.descriptions import set_generator

from tests.integration.helpers import bearer, register_customer, register_merchant

TEST_DB_URL = settings.DATABASE_URL.rsplit("/", 1)[0] + "/shopflow_test"


async def _product_count() -> int:
    engine = create_async_engine(TEST_DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            return (await db.execute(select(func.count(Product.id)))).scalar() or 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_generate_requires_merchant_role(client):
    ctoken, _ = await register_customer(client, "c-desc-role@e.com")
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "Widget"},
        headers=bearer(ctoken),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_generate_rejects_empty_title(client):
    mtoken, _ = await register_merchant(client, "m-desc-empty@e.com")
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "   "},
        headers=bearer(mtoken),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_generate_happy_path_returns_variants(client):
    mtoken, _ = await register_merchant(client, "m-desc-happy@e.com")

    async def _three(req):
        return [f"desc-1 {req.title}", "desc-2", "desc-3"]

    set_generator(_three)
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "Aluminum Bottle", "tone": "luxury", "length": "long",
              "key_features": ["1L", "insulated"]},
        headers=bearer(mtoken),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["variants"]) == 3
    assert body["variants"][0] == "desc-1 Aluminum Bottle"


@pytest.mark.asyncio
async def test_generate_is_stateless_no_product_created(client):
    mtoken, _ = await register_merchant(client, "m-desc-stateless@e.com")

    async def _three(req):
        return ["a", "b", "c"]

    set_generator(_three)
    before = await _product_count()
    res = await client.post(
        "/api/v1/merchant/generate-description",
        json={"title": "Nothing Persisted"},
        headers=bearer(mtoken),
    )
    assert res.status_code == 200
    after = await _product_count()
    assert after == before  # endpoint never creates a product row
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_descriptions_endpoint.py -q`
Expected: FAIL — 404 on `/merchant/generate-description` (route not defined).

- [ ] **Step 4: Wire the endpoint**

In `backend/app/api/merchant.py`, add to the imports:

```python
from app.schemas.descriptions import DescriptionRequest, DescriptionResponse
from app.services import descriptions as descriptions_svc
```

Append this route at the end of the file:

```python
@router.post("/generate-description", response_model=DescriptionResponse)
async def generate_description(
    body: DescriptionRequest,
    request: Request,
    current_user: User = Depends(require_role(UserRole.merchant)),
):
    """Generate up to 3 marketing description variants from product attributes.

    Stateless: returns text only — the merchant saves a chosen variant through the
    normal product create/update flow.
    """
    if not body.title.strip():
        raise _problem(
            status.HTTP_400_BAD_REQUEST, "Bad Request",
            "title must not be empty", request.url.path,
        )
    try:
        variants = await descriptions_svc.generate_descriptions(body)
    except descriptions_svc.DescriptionError as e:
        title = "Service Unavailable" if e.status_code == status.HTTP_503_SERVICE_UNAVAILABLE else "Bad Gateway"
        raise _problem(e.status_code, title, e.detail, request.url.path)
    return DescriptionResponse(variants=variants)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/integration/test_descriptions_endpoint.py -q`
Expected: PASS (4 passed).

- [ ] **Step 6: Run flake8 on changed files**

Run: `docker exec shopflow-backend-1 python -m flake8 app/api/merchant.py tests/conftest.py tests/integration/test_descriptions_endpoint.py --max-line-length=120 --extend-ignore=E501,W503,E203`
Expected: no output (clean). Fix any F401 (unused imports) before committing.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/shopflow
git add backend/app/api/merchant.py backend/tests/conftest.py backend/tests/integration/test_descriptions_endpoint.py
git commit -m "feat(descriptions): POST /merchant/generate-description endpoint + tests"
```

---

### Task 4: Full-suite verification, lint, PROMPT_LOG, memory

**Files:**
- Modify: `PROMPT_LOG.md`
- (memory files under `~/.claude/.../memory/`)

- [ ] **Step 1: Run the full suite with the coverage gate**

Run: `docker exec -e COVERAGE_FILE=/tmp/.coverage shopflow-backend-1 python -m pytest tests/ -q --cov=app --cov-fail-under=70`
Expected: PASS, coverage ≥ 70%. `app/services/descriptions.py` should be well-covered by the unit + integration tests (the `# pragma: no cover` network paths are excluded).

- [ ] **Step 2: Run flake8 with the exact CI flags**

Run: `docker exec shopflow-backend-1 python -m flake8 app/ tests/ --max-line-length=120 --extend-ignore=E501,W503,E203`
Expected: no output (clean).

- [ ] **Step 3: Fill PROMPT_LOG Entry 27**

In `PROMPT_LOG.md`, replace the Entry 27 stub with a filled entry: Tool Used (Claude Code, Opus 4.8; superpowers pipeline), the verbatim prompt, Output Quality, What You Changed (config, schemas, service, endpoint, conftest, tests + spec/plan under `docs/superpowers/`), and What You Learned (structured outputs via `extra_body` for reliable variant parsing; stateless non-destructive design; deterministic fake keeps Anthropic out of CI).

- [ ] **Step 4: Update memory**

Update `shopflow_project.md`: Week 6 now also includes the AI product description generator (Entry 27) — stateless endpoint, 3 variants, structured outputs via extra_body, swap-hook test pattern. Update the `MEMORY.md` index line.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/shopflow
git add PROMPT_LOG.md
git commit -m "docs(descriptions): fill PROMPT_LOG Entry 27"
```

---

## Self-Review

**1. Spec coverage:**
- Stateless generate-from-attributes → Task 3 endpoint (no `db` param, statelessness test). ✓
- 3 variants + clamp → Task 2 `generate_descriptions` + `DESCRIPTION_MAX_VARIANTS`; clamp test. ✓
- tone/length controls, enums, defaults → Task 1 schemas + tests. ✓
- Single `claude-opus-4-8` call, structured outputs via `extra_body` → Task 2 `_anthropic_generate`. ✓
- Lazy `AsyncAnthropic`, `# pragma: no cover`, no top-level anthropic import → Task 2. ✓
- `set_generator` swap hook + `SHOPFLOW_FAKE_DESCRIPTIONS` + conftest reset → Tasks 2 & 3. ✓
- RFC 7807 mapping (503/502, empty-title 400) → Task 3. ✓
- Refusal → empty variants; malformed JSON → `DescriptionError` → Task 2. ✓
- Tests: role guard, empty title, happy path, statelessness, fake/clamp/validation → Tasks 2 & 3. ✓
- Config (`DESCRIPTION_MODEL`, `DESCRIPTION_MAX_VARIANTS`) → Task 1. ✓
- Out-of-scope items (persist, images, streaming, rate-limit): correctly absent. ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N"; every code step carries full code. ✓

**3. Type consistency:** `DescriptionRequest`/`DescriptionResponse`, `ToneEnum`/`LengthEnum`, `generate_descriptions`, `set_generator`, `_fake_generate`, `DescriptionError{detail, status_code}`, `DESCRIPTION_MAX_VARIANTS` used consistently across Tasks 1–3. Endpoint returns `DescriptionResponse(variants=...)`. ✓

**Note:** `anthropic` is already in `requirements.txt` (added in Entry 26) — no dependency task needed.
