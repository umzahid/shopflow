# ShopFlow — Prompt Log
> MANDATORY submission artifact. Worth 50 points.
> Document every meaningful AI prompt used across all 6 domains.

---

## How to Fill This In

For every AI interaction, add an entry using the template below.
Target: **30+ entries** covering all 6 domains for full marks (45–50 pts).

```
### Entry [N]
- **Task Reference:** Domain [X] – Task [Y] ([description])
- **Tool Used:** Claude / ChatGPT / Copilot / Cursor / v0.dev / other
- **Prompt (verbatim):** [paste the exact prompt you submitted]
- **Output Quality (1–5):** [1=unusable, 3=used with edits, 5=shipped as-is]
- **What You Changed:** [describe edits, or write "Nothing"]
- **What You Learned:** [one sentence — what this taught you about prompting or AI]
```

---

## Domain 1 — Backend Engineering

### Entry 1
- **Task Reference:** Domain 1 – Task 1 (PostgreSQL schema DDL + project architecture)
- **Tool Used:** Claude Code (Claude Sonnet 4.6)
- **Prompt (verbatim):**
  > You are a senior backend architect. I am building ShopFlow, an AI-powered e-commerce platform using FastAPI (Python), PostgreSQL, Redis, and Alembic for migrations.
  >
  > Design the complete database schema and project architecture for Week 1. My entities are:
  >
  > - users: id, email, password_hash, role (customer/merchant/admin), created_at, deleted_at
  > - products: id, merchant_id, title, description, price, stock_qty, category, images[], status (draft/active/archived), deleted_at
  > - orders: id, customer_id, status (pending/confirmed/shipped/delivered/cancelled), total_amount, shipping_address, created_at
  > - order_items: id, order_id, product_id, quantity, unit_price (snapshot price — NOT current product price)
  > - reviews: id, product_id, customer_id, rating (1-5), body, created_at — one per customer per product
  > - coupons: id, code, discount_type (% or flat), value, expires_at, usage_limit
  > - categories: id, name, slug, parent_id (nullable, for subcategories)
  >
  > Requirements:
  > - All constraints, indexes, and foreign keys
  > - Soft deletes via deleted_at on users and products
  > - JWT auth: access tokens (15min), refresh tokens (7 days) in httpOnly cookies with rotation strategy
  > - RFC 7807 Problem Details error format: { type, title, status, detail, instance }
  > - Cursor-based pagination (not offset) on all list endpoints
  > - Rate limiting: 100 req/min per IP (public), 1000 req/min per authenticated user
  >
  > Provide:
  > 1. Complete PostgreSQL DDL with all constraints and indexes
  > 2. Project folder structure for FastAPI backend
  > 3. JWT refresh token rotation strategy (explain the approach)
  > 4. Alembic migration file structure
  > 5. List of all environment variables needed
- **Output Quality (1–5):** 4
- **What You Changed:** Three bugs required fixing after implementation: (1) `bcrypt 5.0.0` breaks `passlib 1.7.4` because passlib's internal wrap-bug test uses a 200-byte password that bcrypt 5.x now rejects — fixed by pinning `bcrypt==4.0.1`; (2) `MutableHeaders` in FastAPI does not have a `.pop()` method — changed to `del response.headers["server"]`; (3) cookie path set to `/auth` but the actual endpoint path is `/api/v1/auth` — changed to `/api/v1/auth`.
- **What You Learned:** Always pin third-party dependency versions explicitly. AI generates code against its training data cutoff version; a newer installed package can silently break internal library tests that the AI has no knowledge of.

---

### Entry 2
- **Task Reference:** Domain 1 – Task 2 (Pydantic v2 schemas for all request/response bodies)
- **Tool Used:** Claude Code (Claude Sonnet 4.6)
- **Prompt (verbatim):**
  > You are a senior FastAPI engineer. Build the complete authentication system for ShopFlow.
  >
  > Tech stack: FastAPI, SQLAlchemy (async), Alembic, Pydantic v2, PostgreSQL, Redis, python-jose for JWT, passlib for password hashing.
  >
  > Implement ALL of the following — complete, production-ready code, no placeholders:
  >
  > 3. Pydantic v2 schemas for:
  >    - UserCreate (email, password), UserResponse (no password_hash), Token, TokenRefresh
  >
  > [full prompt in Entry 4]
- **Output Quality (1–5):** 5
- **What You Changed:** Nothing — schemas were correct Pydantic v2 syntax on first output, including `field_validator`, `model_config = {"from_attributes": True}`, and `EmailStr` validation.
- **What You Learned:** Pydantic v2 replaced `orm_mode = True` with `model_config = {"from_attributes": True}` and `@validator` with `@field_validator`. Claude naturally produced v2 syntax without being asked — specifying the library version in the prompt ("Pydantic v2") was key.

---

### Entry 3
- **Task Reference:** Domain 1 – Task 4 (JWT refresh token rotation strategy design and implementation)
- **Tool Used:** Claude Code (Claude Sonnet 4.6)
- **Prompt (verbatim):**
  > [From Entry 1 PLAN prompt, JWT section] — JWT auth: access tokens (15min), refresh tokens (7 days) in httpOnly cookies with rotation strategy.
  >
  > [From Entry 4 BUILD prompt, JWT section]:
  > 5. JWT implementation:
  >    - Access token: HS256, 15min expiry, payload: {sub: user_id, role: user.role}
  >    - Refresh token: stored in Redis with key refresh:{token_hash}, value: user_id, TTL 7 days
  >    - On refresh: delete old Redis key, create new token, set new cookie
- **Output Quality (1–5):** 4
- **What You Changed:** The cookie path was set to `path="/auth"` but the FastAPI router is mounted at `/api/v1`, making the actual endpoint `/api/v1/auth/refresh`. Browsers and curl only send cookies to matching paths, so the refresh endpoint never received the cookie — changed path to `/api/v1/auth`. Also added SHA-256 hashing of the refresh token before using it as a Redis key so the raw token value is never stored as a key.
- **What You Learned:** When setting httpOnly cookies with a path restriction in FastAPI, the path must match the full mounted URL path, not just the router prefix. Generating a specific prompt about the full URL structure would have caught this.

---

### Entry 4
- **Task Reference:** Domain 1 – Task 3 (Full backend implementation: models, auth endpoints, main.py)
- **Tool Used:** Claude Code (Claude Sonnet 4.6)
- **Prompt (verbatim):**
  > You are a senior FastAPI engineer. Build the complete authentication system for ShopFlow.
  >
  > Tech stack: FastAPI, SQLAlchemy (async), Alembic, Pydantic v2, PostgreSQL, Redis, python-jose for JWT, passlib for password hashing.
  >
  > Implement ALL of the following — complete, production-ready code, no placeholders:
  >
  > 1. SQLAlchemy async models for: User, Product, Order, OrderItem, Review, Coupon, Category
  >    - Include soft delete (deleted_at), created_at, updated_at on all models
  >    - Correct relationships and back-populates
  >
  > 2. Alembic initial migration that creates all tables with:
  >    - Primary keys (UUID), foreign keys with ON DELETE behavior
  >    - Indexes on: user.email, product.merchant_id, product.status, order.customer_id, order.status
  >    - Unique constraint: one review per customer per product
  >
  > 3. Pydantic v2 schemas for:
  >    - UserCreate (email, password), UserResponse (no password_hash), Token, TokenRefresh
  >
  > 4. Auth endpoints in /app/api/auth.py:
  >    - POST /auth/register — hash password with bcrypt, create user, return access token
  >    - POST /auth/login — verify credentials, return JWT access token (15min) + set refresh token in httpOnly cookie
  >    - POST /auth/refresh — validate refresh token from cookie, rotate it (invalidate old, issue new), return new access token
  >    - DELETE /auth/logout — delete refresh token from Redis, clear cookie
  >
  > 5. JWT implementation:
  >    - Access token: HS256, 15min expiry, payload: {sub: user_id, role: user.role}
  >    - Refresh token: stored in Redis with key refresh:{token_hash}, value: user_id, TTL 7 days
  >    - On refresh: delete old Redis key, create new token, set new cookie
  >
  > 6. Dependencies in /app/core/deps.py:
  >    - get_current_user — decodes JWT, fetches user from DB
  >    - require_role(role) — raises 403 if user.role != required role
  >
  > 7. Error handling: all errors return RFC 7807 format: {"type": "...", "title": "...", "status": 400, "detail": "...", "instance": "/auth/login"}
  >
  > 8. Rate limiting middleware: slowapi, 100 req/min per IP for public routes
  >
  > Write complete, runnable code for all files. Include the main.py with FastAPI app initialization, CORS, and middleware.
- **Output Quality (1–5):** 4
- **What You Changed:** Three issues fixed post-generation (see Entry 1 for bcrypt and cookie path). Additionally, FastAPI's default `HTTPException` handler wraps `exc.detail` in `{"detail": ...}` — the generated code expected bare RFC 7807 responses but FastAPI returned `{"detail": {"status": 409, ...}}` instead. Fixed by adding a custom `@app.exception_handler(HTTPException)` that returns the dict directly.
- **What You Learned:** FastAPI has separate exception handler registrations for `HTTPException` vs generic `Exception`. Registering only `@app.exception_handler(Exception)` does NOT intercept `HTTPException` — you must register both if you want a unified error format.

---

### Entry 5
- **Task Reference:** Domain 1 – Task 5 (Unit and integration test generation — pytest suite)
- **Tool Used:** Claude Code (Claude Sonnet 4.6)
- **Prompt (verbatim):**
  > You are a senior QA engineer. Generate a complete pytest test suite for the ShopFlow FastAPI backend.
  >
  > Context:
  > - Framework: FastAPI with async SQLAlchemy
  > - Test client: httpx AsyncClient with pytest-asyncio
  > - Database: real PostgreSQL test database (not mocks)
  > - Auth: JWT tokens (generate test tokens directly in fixtures)
  >
  > UNIT TESTS:
  > 1. Auth service: password hashing, JWT creation/validation, token expiry
  > 2. Security functions: refresh token uniqueness, hash determinism, Redis key format
  >
  > INTEGRATION TESTS (real DB):
  > 1. Auth flow: register → login → access protected route → refresh → logout
  > 2. Duplicate email → 409, weak password → 422, invalid email → 422
  > 3. Wrong password and wrong email return identical error (no user enumeration)
  >
  > Use pytest fixtures for DB setup/teardown. Use factory functions to create test data. Assert status codes, response body fields, and side effects.
- **Output Quality (1–5):** 3
- **What You Changed:** Four bugs required fixing: (1) `TEST_DATABASE_URL = settings.DATABASE_URL.replace("/shopflow", "/shopflow_test")` also replaced the username `shopflow` in the URL, changing the DB user to `shopflow_test` which doesn't exist — fixed with `.rsplit("/", 1)[0] + "/shopflow_test"`; (2) `conftest.py` didn't import `app.models.models`, so `Base.metadata` was empty and `create_all` created no tables; (3) global Redis client bound to first test's event loop caused `Future attached to different loop` errors in subsequent tests — fixed with async `reset_redis` fixture that closes the client on the same loop; (4) FastAPI's `HTTPException` wrapper meant test assertions on `res.json()["detail"]` got a dict instead of a string.
- **What You Learned:** AI-generated test infrastructure assumes a clean environment. The `.replace()` approach for DB name substitution is fragile when the same string appears in multiple URL segments. Always use `rsplit("/", 1)` or URL parsing for DB URL manipulation.

---

### Entry 6
- **Task Reference:** Domain 1 – Task 6 (Auth middleware security review)
- **Tool Used:** Claude Code (Claude Sonnet 4.6)
- **Prompt (verbatim):**
  > You are a senior security engineer. Review this FastAPI authentication implementation for ShopFlow and identify all security vulnerabilities, bugs, and missing edge cases.
  >
  > [Auth code pasted: security.py, auth.py, deps.py, main.py]
  >
  > Check specifically:
  > 1. JWT security: Are tokens properly validated? Is the algorithm pinned? Is the secret strong enough?
  > 2. Refresh token rotation: Can an attacker reuse a stolen refresh token after it has been rotated?
  > 3. Password security: Is bcrypt used correctly? Is the work factor adequate?
  > 4. Cookie security: Are httpOnly, Secure, SameSite flags set correctly?
  > 5. Rate limiting: Can it be bypassed? Are limits correct?
  > 6. Input validation: Can email injection or excessively long inputs cause issues?
  > 7. Error messages: Do they leak information (e.g., "user not found" vs "password incorrect")?
  > 8. Redis token storage: What happens if Redis is down during refresh?
  > 9. SQL injection: Are all queries parameterized?
  > 10. Missing: logout-all-devices endpoint? Token revocation list?
  >
  > For each issue found: describe the vulnerability, show the fix as a code diff, and rate severity (CRITICAL/HIGH/MEDIUM/LOW).
- **Output Quality (1–5):** 4
- **What You Changed:** The review correctly flagged that same-error responses for wrong email vs wrong password prevents user enumeration (already implemented). It missed that FastAPI's built-in `HTTPException` handler overwrites the custom RFC 7807 format — this was discovered through testing, not the security review. Added the explicit `@app.exception_handler(HTTPException)` fix based on test failures, not the AI review.
- **What You Learned:** AI security reviews are strong on known patterns (JWT algorithm pinning, bcrypt work factor, cookie flags) but miss framework-specific gotchas. Running actual tests alongside AI review catches what the review misses.

---

### Entry 6b — Week 2 Day 3–5 (Reviews + Dashboards + Test Suite)
- **Task Reference:** Domain 1 – Tasks 4–5 (Reviews API, Merchant/Admin dashboards, scale test suite to 80+ at ≥70% coverage)
- **Tool Used:** Claude Code (Claude Opus 4.7, 1M context)
- **Prompt (verbatim):**
  > recall last session where you left
  >
  > yes please do that and continue with building
- **Output Quality (1–5):** 4
- **What You Changed:**
  - **Verified pause-point fix.** Re-ran the coupon checkout end-to-end against the dev stack: empty-cart 400, invalid coupon 400 (`Coupon code not found`), `SAVE10` happy 201 ($100→$90), 2nd use 201, 3rd use 400 (`usage limit reached`). The UUID cast in `app/services/coupon.py:60` holds.
  - **Built reviews module.** Added `app/schemas/review.py` (ReviewCreate/Update/Response + RatingHistogram + PaginatedReviews) and `app/api/reviews.py` with: public `GET /products/{id}/reviews` (cursor-paginated + rating histogram), `POST /products/{id}/reviews` (customer only, requires a `delivered` order containing the product, one-per-customer via `uq_review_product_customer` translated from `IntegrityError` → 409), `PATCH /reviews/{id}` (owner only), `DELETE /reviews/{id}` (owner or admin).
  - **Built dashboards.** Added `app/schemas/dashboard.py` and two new routers: `app/api/merchant.py` (`GET /merchant/dashboard` — 7d/30d/90d revenue windows, order counts by status, top-5 products by revenue) and `GET /merchant/revenue-summary?start=&end=` (daily series, ≤365 days). `app/api/admin.py` exposes `GET /admin/platform-stats` (users, orders, revenue, status histogram). Revenue is recognized for orders in `(confirmed, shipped, delivered)`.
  - **Bug fixed mid-build.** First `revenue-summary` call hit Postgres `GroupingError: column "orders.created_at" must appear in the GROUP BY clause`. SQLAlchemy parameterized `date_trunc('day', ...)` separately in SELECT vs GROUP BY, so Postgres saw two distinct expressions. Fixed by binding the expression once (`day_expr = func.date_trunc("day", Order.created_at)`) and reusing it in `.label()`, `.group_by()`, and `.order_by()`.
  - **Scaled test suite from 14 → 121.** Added 7 unit files (pagination, order state machine, schema validation, config, problem-helper, cart helpers) and 5 integration files (products, cart, orders, reviews, dashboards), plus a shared `tests/integration/helpers.py` for register/login/create-product/checkout fixtures. Final count: 68 unit + 53 integration. Coverage: **77%** (target ≥70%), measured with `COVERAGE_FILE=/tmp/.coverage pytest --cov=app` since `/app` is read-only under the non-root `appuser` in the Dockerfile.
  - **Wired routes in `app/main.py`.** Registered `reviews.router`, `merchant.router`, `admin.router` under the `/api/v1` prefix.
- **What You Learned:**
  - SQLAlchemy + asyncpg parameterize string literals like `'day'` independently per `func.date_trunc(...)` call. To Postgres these become distinct positional parameters and fail GROUP-BY equivalence — always bind such expressions to a Python variable when they appear in both `SELECT` and `GROUP BY`.
  - `IntegrityError` from a Postgres unique constraint is the right RFC 7807 → 409 conversion point; cleaner than pre-checking with a SELECT (which would have a TOCTOU race anyway).
  - This Docker setup has no volume mount on `backend/`, so every code change needs `docker compose up -d --build backend`. The `--reload` dev workflow would have saved several rebuild cycles — worth adding a `docker-compose.override.yml` later.
  - Pytest-cov fails silently when `.coverage` can't be written. Setting `COVERAGE_FILE=/tmp/.coverage` is enough; no Dockerfile change needed.

---

## Domain 2 — Frontend Engineering

### Entry 7
- **Task Reference:** Domain 2 – Task 7 (Component library scaffold)
- **Tool Used:** v0.dev
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 8
- **Task Reference:** Domain 2 – Task 8 (TypeScript API types from OpenAPI spec)
- **Tool Used:** Claude / openapi-typescript
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 9
- **Task Reference:** Domain 2 – Task 9 (Storefront home + product listing pages)
- **Tool Used:** Copilot / Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 10
- **Task Reference:** Domain 2 – Task 10 (Accessibility audit and fixes)
- **Tool Used:** Claude / axe AI
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 11
- **Task Reference:** Domain 2 – Task 11 (Storybook stories for all components)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 12
- **Task Reference:** Domain 2 – Task 12 (Checkout flow React Testing Library tests)
- **Tool Used:** Copilot
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

---

## Domain 3 — DevOps & CI/CD

### Entry 13
- **Task Reference:** Domain 3 – Task 13 (GitHub Actions 8-stage pipeline YAML)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 14
- **Task Reference:** Domain 3 – Task 14 (Multi-stage Dockerfiles)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 15
- **Task Reference:** Domain 3 – Task 15 (Grafana dashboard JSON)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 16
- **Task Reference:** Domain 3 – Task 16 (docker-compose.yml security review)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 17
- **Task Reference:** Domain 3 – Task 17 (Smoke test scripts)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

---

## Domain 4 — Cloud & Infrastructure

### Entry 18
- **Task Reference:** Domain 4 – Task 18 (Terraform VPC + EKS modules)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 19
- **Task Reference:** Domain 4 – Task 19 (Well-Architected Review on Terraform)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 20
- **Task Reference:** Domain 4 – Task 20 (CloudFront distribution config)
- **Tool Used:** Claude / Terraform Copilot
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 21
- **Task Reference:** Domain 4 – Task 21 (Kubernetes manifests for EKS)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 22
- **Task Reference:** Domain 4 – Task 22 (Cost optimization analysis from infracost)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

---

## Domain 5 — ML / AI Features

### Entry 23
- **Task Reference:** Domain 5 – Task 23 (Synthetic sales data generation)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 24
- **Task Reference:** Domain 5 – Task 24 (Semantic search pipeline)
- **Tool Used:** Copilot / Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 25
- **Task Reference:** Domain 5 – Task 25 (Fraud detection feature set and model design)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 26
- **Task Reference:** Domain 5 – Task 26 (Merchant Copilot with tool calling)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 27
- **Task Reference:** Domain 5 – Task 27 (AI product description generator)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 28
- **Task Reference:** Domain 5 – Task 28 (Evaluation harness — search NDCG + fraud confusion matrix)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

---

## Domain 6 — Quality Engineering

### Entry 29
- **Task Reference:** Domain 6 – Task 34 (Backend unit test suite)
- **Tool Used:** Copilot
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 30
- **Task Reference:** Domain 6 – Task 35 (Playwright E2E test scripts)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 31
- **Task Reference:** Domain 6 – Task 36 (k6 performance test scripts)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 32
- **Task Reference:** Domain 6 – Task 37 (OWASP ZAP findings analysis)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 33
- **Task Reference:** Domain 6 – Task 38 (Test Plan document)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**

### Entry 34
- **Task Reference:** Domain 6 – Task 39 (Bug report writing)
- **Tool Used:** Claude
- **Prompt (verbatim):**
- **Output Quality (1–5):**
- **What You Changed:**
- **What You Learned:**
