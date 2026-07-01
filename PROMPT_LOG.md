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
- **Tool Used:** Claude Code (Claude Opus 4.7, 1M context)
- **Prompt (verbatim):**
  > continue building
  >
  > (during the running `/ui-ux-pro-max` skill session — invoked the skill's `search.py --design-system --persist -p "ShopFlow"` to retrieve a marketplace/directory pattern + vibrant block-based style spec, then implemented the resulting tokens + 10 components incrementally over multiple turns.)
- **Output Quality (1–5):** 4
- **What You Changed:**
  - Replaced the placeholder `frontend/Dockerfile` with a real multi-stage prod build and added a separate `frontend/Dockerfile.dev` for `next dev` hot reload via bind mount + named volumes for `node_modules` and `.next`.
  - Scaffolded Next.js 14 (App Router, TS strict, Tailwind, ESLint, `--src-dir`, `@/*` alias) inside the container via `npx create-next-app@14`. Installed `@tanstack/react-query`, `zustand`, `react-hook-form` + `@hookform/resolvers` + `zod`, `lucide-react`, `clsx`, `tailwind-merge`.
  - Built 7 of the 10 UI components in `src/components/ui/`: `Button`, `Input`, `Select`, `Drawer`, `Toast` + `ToastProvider`, `ProductCard`, `SkeletonLoader` (+ `ProductCardSkeletonGrid`). Plus narrow client components in `src/components/`: `Header`, `ThemeToggle`, `SearchBar`, `PopularTags`, `TrustStrip`, `MerchantCTA`, `CartButton`, `CartDrawer`, `RatingHistogramBar`, `AuthBoot`, `AuthCard`, `AuthGuard`, `AuthMenu`.
  - 3 components deliberately deferred to Week 4: `Modal` (we have `Drawer`, which is sufficient for current flows), `DataTable` (merchant admin), `SLATimer` + `StatusBadge` (order ops), `RichTextEditor` (product editor) — all are merchant-side per the plan.
- **What You Learned:**
  - `lucide-react` icons take a `strokeWidth` prop. Default is 2; bumping to 2.5 makes small icons (h-3.5) read clearly without enlarging them. Keeping a consistent stroke across a hierarchy level matters for perceived polish.
  - Native `<select>` styled with Tailwind is the right call for the sort dropdown — free keyboard nav, mobile system picker, screen-reader semantics. Only style the wrapper + chevron. Combobox primitives (Headless UI, Radix) buy nothing for plain enums and add bundle weight + a11y complexity.

### Entry 8
- **Task Reference:** Domain 2 – Task 8 (TypeScript API types from OpenAPI spec)
- **Tool Used:** Claude Code (hand-typed mirror of backend Pydantic schemas)
- **Prompt (verbatim):**
  > Generated as part of "continue building" — the agent decided to hand-author `src/types/api.ts` rather than wire `openapi-typescript` because the backend already publishes Pydantic schemas under one file and the type surface is small.
- **Output Quality (1–5):** 4
- **What You Changed:**
  - Wrote `src/types/api.ts` covering `Product`, `PaginatedProducts`, `CartItem`, `Cart`, `User`, `Token`, `RatingHistogram`, `Review`, `PaginatedReviews`, `ProblemDetail`, plus later additions `ShippingAddress`, `CheckoutRequest`, `OrderItemResponse`, `Order`, and the `ProductStatus` / `OrderStatus` / `UserRole` string-literal unions.
  - All money fields typed as `string` (matching Pydantic `Decimal` → JSON string) so React-Query callers don't lose precision through `JSON.parse`.
- **What You Learned:**
  - Hand-mirroring works for ≤20 types but is fragile across schema drift. Plan for Week 5+ to add an `openapi-typescript` codegen step against `/openapi.json` so changes to backend schemas surface as TS errors in PRs. The current contract surface is small enough that the maintenance cost of codegen tooling outweighs its benefits today.

### Entry 9
- **Task Reference:** Domain 2 – Task 9 (Storefront home + product listing + product detail + cart + checkout + order pages)
- **Tool Used:** Claude Code (Claude Opus 4.7, 1M context)
- **Prompt (verbatim):**
  > complete /product and follow the sequence
  >
  > (later in the same session)
  >
  > continue building /project listing page
- **Output Quality (1–5):** 4
- **What You Changed:**
  - `app/page.tsx` — marketplace-pattern home with hero search, popular-search chips, featured-products grid (`useProducts` hook), trust strip, "Apply to sell" merchant CTA, footer.
  - `app/products/page.tsx` — listing with `useInfiniteQuery` cursor pagination + IntersectionObserver-driven auto-fetch, sidebar `FilterPanel` (price range), `Drawer` on mobile, native `<Select>` for sort, active-filter chips. URL params (`q`, `price_min`, `price_max`) are the single source of truth — readable, shareable, and survive reloads.
  - `app/products/[id]/page.tsx` — detail with image gallery, qty stepper, stock badge driven by `(stock_qty<=0 | <=5 | >5)`, reviews section that pulls `useProductReviews` and renders a `RatingHistogramBar`.
  - `app/cart/page.tsx` — two-column desktop layout (lines + sticky summary card), promo-code input, totals, "Proceed to checkout".
  - `app/checkout/page.tsx` — RH Form + Zod shipping form (line1/2, city, state, postal_code, country ISO-2 with regex), optional coupon. Calls `syncCartToServer(lines)` to push local Zustand cart into the backend's Redis cart, then `POST /orders/checkout`. 400 with "coupon" in detail maps to a field error; 409 maps to a warning toast.
  - `app/orders/[id]/page.tsx` — success hero, line items, shipping address, status pill driven by an exhaustive `Record<OrderStatus, …>` map (TS catches missing keys if the backend adds a status).
  - `app/login/page.tsx` + `app/register/page.tsx` — RH Form + Zod, redirect to `?next=…`. RFC 7807 errors mapped to field-level messages: 401 → password field on login, 409 → email field on register.
  - Auth infrastructure: `store/auth.ts` (memory-only access token; refresh cookie is httpOnly), `lib/api.ts` (rewritten to read from store, coalesce parallel 401s into one `/auth/refresh` via shared in-flight promise, retry once), `lib/auth.ts` (login/register/logout TanStack mutations), `components/AuthBoot.tsx` (silent refresh once on app boot), `components/AuthGuard.tsx` (client-side wrapper redirecting to `/login?next=…`).
- **What You Learned:**
  - Frontend's local Zustand cart is the source of truth, but the backend's `/orders/checkout` reads from Redis. The cleanest sync is `DELETE /cart` then `POST /cart/items` per line before `POST /orders/checkout`. Tried to push a single-call refactor and decided against it — the existing per-line endpoint already handles stock validation. Sequential is slower but acceptable for ≤50 items.
  - `useSearchParams()` on a static page is a hard error in `next build` (Next 14): the entire page becomes CSR-only and breaks static export. The fix is to split the page into a small pre-renderable shell and a `<Suspense>`-wrapped inner component that consumes the params. Caught only at production build time, not in `next dev`.

### Entry 10
- **Task Reference:** Domain 2 – Task 10 (Accessibility audit and fixes via `/ui-ux-pro-max`)
- **Tool Used:** Claude Code + `ui-ux-pro-max` skill (`scripts/search.py`)
- **Prompt (verbatim):**
  > use /ui-ux-pro-max skill and redesign the page accordingly
- **Output Quality (1–5):** 4
- **What You Changed:**
  - Ran `python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "ecommerce storefront marketplace modern minimal multi-merchant" --design-system --persist -p "ShopFlow"` to generate `frontend/design-system/shopflow/MASTER.md` — pattern: Marketplace/Directory; style: Vibrant & Block-based; palette: trust purple `#7c3aed` + transaction green `#16a34a`; fonts: Rubik + Nunito Sans; spacing/shadow scale; anti-patterns.
  - Repainted tokens: `globals.css` :root + .dark CSS variables; `tailwind.config.ts` exposes them as utility classes; `next/font/google` Rubik + Nunito Sans loaded with `adjustFontFallback: false`.
  - Deviated from spec on the green and purple values to meet WCAG AA 4.5:1 for button labels (spec defaults hit ~3:1 and ~4.27:1). `#16a34a` → `#15803d` (5:1 with white text), `#7c3aed` → `#6d28d9` (~6.9:1). Documented the deviation in code comments.
  - Marketplace pattern compositional changes: hero now centered on the search bar as the primary CTA (was a passive headline), with a chips row of popular searches under it. Trust strip and "Apply to sell" merchant CTA replaced the previous count badge. Inverted the merchant CTA button to white surface (green on purple panel was only ~1.4:1 — invisible).
  - Touch-target audit lifted Button sm from 40px → 44px, md → 48px, lg → 56px; bumped header link from 40px → 44px; left chips at 36px on purpose with comments explaining adjacent-gap mitigation.
  - A11y wiring: skip link, role=search/status/alert, aria-labelledby per landmark, aria-busy on loading buttons, motion-reduce on every transform, focus-visible rings everywhere, aria-live polite for cart counts and toast queue, breadcrumbs with aria-current="page".
- **What You Learned:**
  - The skill's CSV-driven design system is opinionated but treats accessibility as advisory — the spec acknowledges `#16a34a` only meets WCAG 3:1, intended for large text. Anything used for body text needs to be tightened manually. Worth running a contrast pass on every primary color before committing to it.
  - `--persist -p "ShopFlow"` writes `design-system/shopflow/MASTER.md` and a `pages/` folder for per-page overrides. Read MASTER first when adding new pages so brand/spacing/elevation tokens stay consistent. Avoids the slow drift toward "every page invents its own scale."
  - Layout-shifting hovers (e.g., `scale-105` on the card itself) are an anti-pattern flagged by the skill. Keeping the scale inside `overflow-hidden` (image-only) avoids reflowing siblings — a small detail that improves perceived quality on grid scrolls.

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
- **Tool Used:** Claude Code (Opus 4.7)
- **Prompt (verbatim):** "save baseline memory and start Week 4 pgvector search"
- **Output Quality (1–5):** 4
- **What You Changed:**
  - `backend/requirements.txt` — added `sentence-transformers==3.0.1`, `pgvector==0.3.2`.
  - `backend/app/models/models.py` — mapped `Product.embedding: Vector(384)` (previously the column existed in DB only, via migration 002).
  - `backend/app/services/embedding.py` — new module. Lazy singleton for `all-MiniLM-L6-v2`, `encode()` / `encode_batch()`, deterministic hash-based `_fake_encode()` for tests, `set_encoder()` swap hook, `SHOPFLOW_FAKE_EMBEDDINGS=1` env toggle.
  - `backend/app/api/products.py` — replaced the lexical-only `/products/search` with `?mode=lexical|semantic|hybrid` (default `hybrid`). Semantic uses `Product.embedding.cosine_distance(qvec)`. Hybrid = `0.4 * ts_rank + 0.6 * (1 - cosine_distance)` with a `sem_score > 0.3` OR `tsv @@ tsq` filter to avoid returning every embedded row on every query. POST/PATCH now populate `embedding` via `embed_product_text()`; PATCH only re-encodes when `title` or `description` changes.
  - `backend/alembic/versions/003_hnsw_index_on_product_embedding.py` — partial HNSW index (`m=16, ef_construction=64`, `WHERE embedding IS NOT NULL`) over `vector_cosine_ops`. Chose HNSW over IVFFlat because it needs no training and works on empty tables.
  - `backend/app/scripts/backfill_embeddings.py` — idempotent CLI (`python -m app.scripts.backfill_embeddings`) that batches rows with `embedding IS NULL` through the encoder.
  - `backend/tests/conftest.py` — installs `CREATE EXTENSION IF NOT EXISTS vector` before `create_all` (required now that Product has a `Vector(384)` column), and session-scopes `set_encoder(_fake_encode)` so CI never downloads the ~90MB model.
  - `backend/tests/integration/test_products_search.py` — 10 new tests covering lexical filter, active-only/soft-delete visibility, semantic self-match at score ≈ 1.0, hybrid default mode + lexical-only surfacing, mode/query validation, limit clamping, encode-on-create/PATCH invariance.
- **What You Learned:**
  - The migration comment said "semantic search arrives in Week 5", but the column, dim (384), and tsvector GIN index were already in place — Week 4 was almost entirely a matter of wiring the encoder + endpoint on top of existing scaffolding.
  - `pgvector.sqlalchemy.Vector` exposes `.cosine_distance()` directly on the ORM attribute, so no raw SQL is needed even for hybrid ranking.
  - `Base.metadata.create_all` can't emit `vector(N)` DDL unless the `vector` extension is present — the test bootstrap needs an explicit `CREATE EXTENSION` before table creation, since conftest bypasses Alembic entirely.
  - Real sentence-transformers in CI is a non-starter (~90MB download, cold-start latency); a deterministic hash-based encoder preserves the ability to unit-test ordering (`encode(q) == encode(product_text)` ⇒ similarity 1.0) without touching HuggingFace.

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
