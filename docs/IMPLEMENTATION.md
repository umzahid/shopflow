# ShopFlow — Implementation Reference: Features, Stack & Tools

**Date:** 2026-07-07 · **Branch:** `perf/api-latency`
**Scope:** what is implemented today, the technology stack per layer, and every tool used to build, test, secure, and operate the platform. Companion to `docs/stack-audit-2026-07-07.md` (which tracks what is *remaining*).

---

## 1. System overview

ShopFlow is an AI-powered e-commerce platform (customer storefront + merchant admin) built as the 6-week GenAI upskilling assignment. One Next.js frontend, one FastAPI backend, Postgres + Redis, four integrated ML/AI features, Dockerized with a full observability stack, deployable via Terraform/EKS (validated, not applied — free-tier constraint).

```
Browser ──▶ Next.js 14 (storefront + /merchant admin) ──▶ FastAPI (REST /api/v1)
                                                            ├─▶ PostgreSQL 16 + pgvector
                                                            ├─▶ Redis (refresh tokens, forecast cache)
                                                            ├─▶ sentence-transformers / Prophet / LightGBM (in-process)
                                                            └─▶ Claude API (copilot, descriptions, summaries)
Prometheus ◀── /metrics        Grafana ◀── Prometheus
```

---

## 2. Backend — implemented

### Stack

| Concern | Choice | Version |
|---|---|---|
| Language / framework | Python 3.11 + FastAPI | fastapi 0.111.0, uvicorn 0.29.0 (2 workers in the image) |
| ORM / DB driver | Async SQLAlchemy + asyncpg | sqlalchemy 2.0.30, asyncpg 0.29.0 |
| Database | PostgreSQL 16 + pgvector extension | pgvector client 0.3.2 |
| Migrations | Alembic (6 migrations, run in CI) | 1.13.1 |
| Cache / token store | Redis (aioredis client) | redis 5.0.4 |
| Validation | Pydantic v2 (+ pydantic-settings for config) | 2.7.1 |
| Auth | python-jose (HS256 JWT) + passlib/bcrypt | bcrypt **pinned 4.0.1** (5.x breaks passlib — see PROMPT_LOG Entry 1) |
| Rate limiting | slowapi, custom two-tier keying | 100/min per IP public, 1000/min per authenticated user |
| Metrics | prometheus-fastapi-instrumentator + custom collectors | http_requests_total, http_request_duration_seconds, db_query_duration_seconds, active_orders_total |

### API surface (all 8 PRD endpoint groups)

| Group | Endpoints | Notes |
|---|---|---|
| Auth | register, login, refresh, logout | 15-min JWT access + rotating opaque 7-day refresh token in httpOnly cookie; refresh hashes stored in Redis |
| Products | list, get, search, create, update, soft-delete | Merchant-guarded writes; lexical / semantic / hybrid search modes |
| Cart | get, add item, update item, remove item, clear | Customer-scoped |
| Orders | checkout, list, get, tracking timeline, status transition | Role-scoped; fraud scoring runs synchronously at checkout |
| Reviews | list (+histogram), create, update, delete | One review per customer per delivered order |
| Merchant | dashboard, products, orders, revenue-summary, forecast, restock-alerts, copilot, generate-description | |
| Admin | platform-stats, users, users/:id, orders, coupon management | |
| Webhooks | POST /webhooks/payment | HMAC-SHA256 signed, constant-time comparison |

### Conventions enforced everywhere
- **RFC 7807 Problem Details** on every error (global handlers in `app/main.py`).
- **Cursor pagination** `(created_at, id)` with opaque base64 `nextCursor` on every list endpoint (`app/core/pagination.py`).
- **Soft deletes** on users and products (`deleted_at` + partial indexes).
- **UUID string PKs**, `TimestampMixin` server defaults.
- **Structured JSON logging** with timestamp, level, service, traceId, message, durationMs (`app/core/logging.py`, per-request middleware).

### Performance work (this branch)
- MiniLM query encode + LightGBM fraud scoring offloaded off the event loop via `asyncio.to_thread`.
- LRU(1024) query-embedding cache — repeat search queries encode in <1 ms.
- DB pool raised 10+20 → 20+40.
- **Migration 006 (new):** `orders(status, created_at)` for revenue aggregations, `orders(ip_address, created_at)` for fraud IP-velocity (replaces the single-column ip index), partial `products(merchant_id) WHERE deleted_at IS NULL` for merchant catalog listing.
- Copilot now sets a prompt-cache breakpoint on the system block (caches tools+system prefix; engages once the prefix crosses the Opus-tier 4096-token cache minimum).
- Measured k6 results (dev laptop, PRD §6.4 profiles): listing p95 2.81s→1.25s, search 3.43s→1.36s (targets 200/400 ms still miss on single-node dev topology); checkout is row-lock-bound, not CPU-bound. Full analysis in `docs/performance.md`.

### Known deviations (documented, intentional)
- Fraud `pending_review` threshold is **0.6** (PRD says 0.7) — tuned so the committed model meets precision ≥0.85 / recall ≥0.70 (measured P=0.855 / R=0.724 at 0.6 on the synthetic holdout).
- Synthetic sales seeder defaults to **180 days** (PRD suggests 2 years); `--days 730` is supported — 180d keeps local seeding fast while still exercising weekly seasonality.
- bcrypt hashing (~330 ms) intentionally stays synchronous on the request path — it is a security control, not a perf bug.

---

## 3. ML / AI features — implemented

| Feature | Model / tech | Integration | Key files |
|---|---|---|---|
| Semantic product search | sentence-transformers MiniLM-L6-v2 (384-d) → pgvector, HNSW index (m=16, ef=64); hybrid score **0.7 semantic + 0.3 lexical** (BM25-ish tsvector) | Embedded at product create/update; "Did you mean?" + 3-tier confidence badges in UI | `services/embedding.py`, `api/products.py`, migrations 002–003 |
| Demand forecasting | Prophet per product, weekly seasonality, 24h Redis cache | 30-day forecast w/ confidence band chart in merchant drawer; restock-alerts endpoint + dashboard widget | `ml/forecast.py`, `services/restock.py` |
| Fraud detection | LightGBM binary classifier, **trained model committed** (`ml/artifacts/fraud_model.txt`, P=0.855/R=0.724); 12 features incl. orders-per-IP-24h and billing/shipping mismatch; TreeSHAP top-3 reasons; deterministic heuristic fallback | Synchronous at checkout; score >0.6 → `pending_review` | `services/fraud.py`, `ml/fraud.py`, `scripts/train_fraud_model.py` |
| Merchant Copilot | Claude API (`claude-opus-4-8`, adaptive thinking) manual async tool loop; 6 read-only merchant-scoped tools; strict tool schemas; prompt-cache breakpoint on system prefix | Floating chat panel, sessionStorage history, markdown rendering; merchant isolation proven by two-merchant tests | `services/copilot.py`, `components/MerchantCopilot.tsx` |
| AI product descriptions | Claude API structured outputs, 3 variants | One-click button in merchant product create form | `services/descriptions.py` |
| AI product summary | Claude API | Storefront product detail page | `api/products.py` summary endpoint |
| Evaluation harness | Hand-rolled NDCG@k / recall@k / confusion matrix / ROC-AUC | Search + fraud eval CLIs; fakes/swap-hooks keep CI network-free | `app/eval/`, `scripts/eval_{search,fraud}.py` |

---

## 4. Frontend — implemented

### Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 14.2 (App Router, `output: standalone`) + React 18 + TypeScript strict |
| Styling | Tailwind CSS, CSS-variable theming, full dark mode (no-flash script) |
| Server state | TanStack React Query v5 (tuned staleTime per resource, retry 1, no focus refetch) |
| Client state | Zustand v4 (+persist for cart/auth) |
| Forms | React Hook Form + Zod resolver |
| Animation | framer-motion 12 (reduced-motion safe) — uncommitted landing-page work |
| Icons / utils | lucide-react, clsx, tailwind-merge |
| Component workshop | Storybook 8 (nextjs-vite builder, a11y + docs addons), 14 story files |

### Surfaces
- **Storefront:** home (hero, featured grid, category tiles), listing (infinite scroll, price filter, semantic search + relevance badges), product detail (gallery, review histogram, AI summary), cart, checkout (Zod-validated, coupon field), order tracking timeline, full customer account (profile, orders, addresses, reviews).
- **Merchant admin:** dashboard (revenue chart 7/30/90d, status donut, top-5, low-stock alerts), product manager (status filter, inline price/stock quick-edit, AI description generation, forecast chart drawer), order manager (status filters, detail drawer, guarded status transitions), analytics (revenue chart, conversion funnel), floating Copilot chat.
- **Component library (all PRD-required + extras):** Button, Input, Textarea, Select, MultiSelect, Modal, Drawer, Toast, DataTable (sort/selection/pagination/CSV export), ProductCard, SkeletonLoader, RichTextEditor, SLATimer, StatusBadge, hand-rolled Charts (Donut/Bar/Forecast — no charting library).

---

## 5. Data layer

- **Entities:** users, addresses, products, orders, order_items, reviews, coupons, categories (hierarchical).
- **Migrations:** 001 initial schema → 002 pgvector + tsvector GIN → 003 HNSW → 004 order ip/billing → 005 addresses → **006 perf indexes**.
- **Indexes of note:** partial `users(email) WHERE deleted_at IS NULL`, partial `products(status|merchant_id) WHERE deleted_at IS NULL`, HNSW on `products.embedding`, composites `orders(status, created_at)` and `orders(ip_address, created_at)`.

---

## 6. DevOps / CI / Observability — implemented

### CI pipeline (GitHub Actions, `.github/workflows/test.yml`, 13 jobs / 8 PRD stages)
1. **Lint/format:** flake8 + black (advisory) · ESLint + prettier (advisory) · markdownlint
2. **Unit tests:** pytest w/ `--cov-fail-under=70` · Vitest
3. **Integration:** pgvector + Redis service containers, alembic migrations, API tests
4. **Security scan:** Trivy (images) · Semgrep (`p/ci`) · detect-secrets (report-only)
5. **Build & push:** GHCR, git-SHA + latest tags, buildx with GHA layer cache
6. **Staging deploy** (environment-gated)
7. **Smoke tests:** `scripts/smoke.sh` (16 checks)
8. **Prod deploy** behind GitHub Environment manual approval

### Docker
- Multi-stage Dockerfiles, non-root users, HEALTHCHECKs. Frontend image **199 MB**; backend **2.4 GB** (CPU-torch + sentence-transformers ML stack — documented deviation, remediation path is ONNX or an ML sidecar, `docs/devops.md`).
- One-command stack: `docker compose up` → postgres, redis, backend, frontend, prometheus, grafana (memory limits + healthchecks per service; secrets via gitignored `.env`).

### Observability
- **Prometheus:** all 4 required metrics; SQLAlchemy cursor-event timing for `db_query_duration_seconds`; 15s background refresher for `active_orders_total`.
- **Grafana:** `shopflow-overview.json`, 9 panels (rate, 5xx, p50/p95/p99, by-status, top handlers, DB p95, active orders), provisioned from JSON.
- **Alerts (prometheus/alerts.yml):** error rate >5%/2m, p99 >1s/5m, service down 1m.
- **Logging:** backend structured JSON w/ traceId (frontend server-side logging still open — see audit).

---

## 7. Cloud & infrastructure — implemented (validated, never applied)

| Layer | Terraform module | Contents |
|---|---|---|
| networking | `modules/networking` | VPC, 2-AZ public/private subnets, NAT (single by default, per-AZ toggle), VPC flow logs |
| compute | `modules/compute` | EKS 1.30, KMS envelope encryption, IRSA/OIDC, managed node group, spot toggle |
| database | `modules/database` | RDS Postgres 15 Multi-AZ (7d backups, encrypted, private), ElastiCache Redis, Secrets Manager |
| storage | `modules/storage` | Product-images S3: versioning, IA@30d → Glacier@90d lifecycle, public-access block |
| cdn | `modules/cdn` | CloudFront + private S3 origin (OAC), security headers, optional TLS/WAF |
| monitoring | `modules/monitoring` | CloudWatch log groups, SNS, billing alarm |

- `environments/staging.tfvars` + `production.tfvars` (prod: 3 AZ, per-AZ NAT, private endpoint, Multi-AZ). Five-key tagging (Project/Environment/ManagedBy/Owner/CostCenter). Remote-state template (`backend.tf.example`).
- **k8s (`k8s/`, kustomize, kubeconform-strict valid):** Deployments + Services + HPA + ALB Ingress + IRSA ServiceAccount + ConfigMap + default-deny NetworkPolicies. ALB is created by the AWS LB Controller from the Ingress (deliberate — not a Terraform module).
- **Posture:** free-tier-only constraint → `terraform validate` clean, never applied; $0 alternative documented in `docs/aws-free-tier.md`; hand-computed cost ≈ $153–165/mo in `docs/cost-optimization.md`; Well-Architected review in `docs/well-architected-review.md`.

---

## 8. Quality engineering — implemented

| Layer | Tooling | Current state |
|---|---|---|
| Backend unit + integration | pytest, pytest-asyncio, pytest-cov, factory-boy, faker — real Postgres (`shopflow_test`), truncate-between-tests, no mocking | **247 tests, 82% coverage** (gate 70%) |
| Frontend component | Vitest + React Testing Library + jsdom | 36 cases across DataTable, Modal, MultiSelect, RichTextEditor, StatusBadge, Textarea, checkout, lib utils |
| E2E | Playwright + page objects (locators discovered live via the `find-locators` skill / Playwright MCP) | 31 cases incl. PRD journeys 29/30/33 UI-driven |
| Accessibility | @axe-core/playwright, WCAG 2.1 A/AA | 5 pages, 0 serious/critical |
| Performance | k6 (Dockerized runner) — exact PRD §6.4 profiles in `perf/k6/prd-benchmarks.js` | Documented pass/fail + root cause in `docs/performance.md` |
| Security | OWASP ZAP (baseline, API, **active/full**), detect-secrets, Trivy, Semgrep; JWT tampering/expiry/replay + cross-role authz + rate-limit 429/Retry-After test suites | Active scan 0 alerts; findings triaged in `docs/zap-findings.md` |
| Docs | `docs/test-plan.md`, `docs/bug-reports.md` (4 real defects w/ root cause) | |

---

## 9. Complete tool inventory

**Languages/runtimes:** Python 3.11 · TypeScript 5 / Node 20 · Bash · HCL (Terraform) · YAML (kustomize, Actions)

**Backend:** FastAPI, uvicorn, SQLAlchemy (async), asyncpg, Alembic, Pydantic v2, python-jose, passlib+bcrypt 4.0.1, slowapi, redis-py, httpx, prometheus-fastapi-instrumentator

**ML/AI:** sentence-transformers (MiniLM-L6-v2), torch (CPU pin on Linux), pgvector, Prophet, pandas, LightGBM (native TreeSHAP), Anthropic Python SDK 0.69.0 (`claude-opus-4-8`, adaptive thinking, strict tool schemas, structured outputs, prompt caching)

**Frontend:** Next.js 14, React 18, Tailwind, TanStack Query v5, Zustand, React Hook Form, Zod, framer-motion, lucide-react, Storybook 8

**Testing/QA:** pytest (+asyncio/cov), factory-boy, faker, Vitest, React Testing Library, Playwright (+@axe-core), k6, OWASP ZAP, Postman/curl smoke scripts

**DevOps/Sec:** Docker + BuildKit, docker compose, GitHub Actions, GHCR, Trivy, Semgrep, detect-secrets, flake8, black, ESLint, prettier, markdownlint

**Cloud/Infra:** Terraform (6 modules), kustomize, kubeconform, AWS (VPC/EKS/RDS/ElastiCache/S3/CloudFront/Secrets Manager/CloudWatch — validated), infracost (documented, not run)

**Observability:** Prometheus, Grafana (JSON-provisioned dashboard), structured JSON logging w/ traceId

**GenAI workflow tooling:** Claude Code (+ custom skills: `ui-ux-pro-max`, `backend-architecture-pro`, `devops-pipeline-pro`, `find-locators`; superpowers process skills), Playwright MCP, PROMPT_LOG.md (36/36 entries)

---

## 10. Pointers

| What | Where |
|---|---|
| Remaining work / optimization audit | `docs/stack-audit-2026-07-07.md` |
| Perf before/after analysis | `docs/performance.md` |
| Security findings | `docs/zap-findings.md`, `security/` |
| Test plan / bug reports | `docs/test-plan.md`, `docs/bug-reports.md` |
| Cloud posture | `docs/well-architected-review.md`, `docs/cost-optimization.md`, `docs/aws-free-tier.md` |
| Graded prompt log | `PROMPT_LOG.md` |
