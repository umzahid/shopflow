# ShopFlow — PRD Gap Analysis

**Date:** 2026-07-05
**Reviewed against:** `ShopFlow_GenAI_PRD.docx` (v1.0, 480 pts across 6 domains + Prompt Log + README/Demo)
**Repo state:** branch `week-3-task` (unpushed), all 36 PROMPT_LOG entries filled.
**Method:** PRD read in full; project audited by four parallel passes (backend/ML/README direct; frontend, DevOps, Cloud via exploration agents) with file-path evidence.

---

## Executive summary

**The distinction that matters:** the project tracks itself as "all 6 domains complete" because **all 36 PROMPT_LOG entries are filled**. The PRD, however, grades **working deliverables** — and against that bar several deliverables behind those entries are partial or missing. The prompt log is done; the product is not.

**The single highest-leverage gap — a cross-cutting cascade:**

> **There is no merchant admin frontend.** No dashboard, product manager, order manager, or analytics pages exist. Because the PRD requires every AI feature to "surface in the real frontend," and because three E2E scenarios click through merchant UI, this one omission drains points from **three domains at once** — Domain 2 (admin panel), Domain 5 (all four AI feature surfaces), and Domain 6 (E2E scenarios 30–32). The *backends* for these are built and solid; the merchant-facing UI layer is simply absent.

**Rough points-at-risk (author's estimate, not the grader's):**

| Domain | Pts | Est. at risk | Primary cause |
|---|---|---|---|
| 1 — Backend | 70 | ~15 | Webhooks group + most of Admin group missing; auth rate-limit tier unwired |
| 2 — Frontend | 70 | ~30 | Merchant admin absent; component library 7/10; account pages missing |
| 3 — DevOps | 60 | ~25 | No deploy stages; no structured logging; 2/4 metrics; no secrets scan |
| 4 — Cloud | 60 | ~30 | 3 empty modules; apply never run; many components missing |
| 5 — ML | 70 | ~25 | Fraud model not committed (target unmet by default); no frontend surfaces |
| 6 — QA | 70 | ~15 | Component tests 3/40; merchant-UI E2E scenarios can't run through UI |
| README & Demo | 30 | ~20 | Architecture diagram is a placeholder; no demo video |

Much of Domain 4's gap and Domain 3's deploy gap stem from the **free-tier-only constraint** (EKS is never applied) — a legitimate reason, but the PRD explicitly offers **LocalStack** as a $0 way to satisfy the "apply runs cleanly" deliverable, and requires deviations to be justified in the README.

---

## Domain 1 — Backend Engineering (70 pts)

Strong overall: auth, products, cart, orders, reviews, coupons all real; RFC 7807, soft deletes, cursor pagination, real-DB tests. Gaps are missing endpoints and one unwired requirement.

**Missing endpoints (PRD §1.3):**

| Endpoint | Group | Status |
|---|---|---|
| `POST /webhooks/payment` (Stripe or mock, signed secret) | Webhooks | **MISSING** — entire group absent, zero webhook/stripe references |
| `GET /orders/:id/tracking` | Orders | **MISSING** |
| `GET /merchant/products` | Merchant | **MISSING** (router has dashboard, revenue-summary, forecast, restock-alerts, copilot, generate-description) |
| `GET /merchant/orders` | Merchant | **MISSING** |
| `GET /admin/users` | Admin | **MISSING** |
| `PATCH /admin/users/:id` | Admin | **MISSING** |
| `GET /admin/orders` | Admin | **MISSING** |

Admin router has **only** `GET /admin/platform-stats` (1 of 4 required).

**Other deviations (PRD §1.4):**
- **Authenticated rate limit not applied.** `RATE_LIMIT_AUTHENTICATED = "1000/minute"` is defined in `app/core/config.py:37` but never referenced; only the public `100/minute` default is wired via `default_limits` in `app/main.py:17`. PRD requires both tiers.
- OpenAPI 3.1 spec: present (`/docs`, `/openapi.json`) ✓.

**Deliverable at risk:** "All 8 endpoint groups functional" (25 pts) — Webhooks empty, Admin 1/4.

---

## Domain 2 — Frontend Engineering (70 pts)

**Merchant admin panel (PRD §2.3): MISSING entirely (0/4).** No `merchant/`, `admin/`, or `dashboard/` routes.
- Dashboard (revenue chart, orders-by-status donut, top-5 products, low-stock widget) — MISSING
- Product manager (data table, bulk actions, inline quick-edit) — MISSING
- Order manager (status filters, detail drawer, status update, packing slip) — MISSING
- Analytics (revenue line, conversion funnel, geo heat map) — MISSING

**Storefront (PRD §2.2): 6 of ~10 present.**
- EXISTS: home, product listing (infinite scroll + filters), product detail (gallery/zoom, review histogram), cart, checkout (multi-step + Zod), order confirmation, login/register.
- PARTIAL: product detail is **missing the AI-generated product summary**; order page has a status badge but no timeline component.
- MISSING: customer account — profile settings, order history, saved addresses, review management.

**Component library (PRD §2.4): 7 of 10.**

| Component | Status |
|---|---|
| Button, Toast, ProductCard, SkeletonLoader | EXISTS |
| Input | PARTIAL — no Textarea |
| Select | PARTIAL — native only, no MultiSelect |
| Modal/Drawer | PARTIAL — Drawer only, no Modal/Dialog |
| SLATimer/StatusBadge | PARTIAL — StatusBadge inline, no SLATimer |
| **DataTable** | **MISSING** |
| **RichTextEditor** | **MISSING** |

**Present and good:** TypeScript, React Query, Zustand (+persist), React Hook Form + Zod, **dark mode fully implemented** (CSS variables, toggle, no-flash script), Storybook configured with 7 stories.

**Unverified:** Lighthouse mobile ≥ 85 (PRD §2.5, 10-pt deliverable) — no evidence of a run.

**Deliverables at risk:** "Merchant admin working" (15 pts); "all 10 components in Storybook" (15 pts, 7/10); Lighthouse (10 pts).

---

## Domain 3 — DevOps & CI/CD (60 pts)

**CI pipeline (PRD §3.2): 5 of 8 stages.** Single workflow `.github/workflows/test.yml`.

| Stage | Status |
|---|---|
| 1 Lint & Format | PARTIAL — Flake8 + ESLint present; **no Prettier, no Black, no Markdownlint** |
| 2 Unit Tests + coverage | EXISTS (70% gate) |
| 3 Integration (DB+Redis) | EXISTS (pgvector + redis services) |
| 4 Security Scan | PARTIAL — Trivy only; **no Snyk/Semgrep, no detect-secrets** |
| 5 Build & Push | PARTIAL — builds locally; **no registry push, no git-SHA tag** |
| 6 Staging Deploy | **MISSING** |
| 7 Smoke Tests | EXISTS (`scripts/smoke.sh`) |
| 8 Prod Deploy + manual approval | **MISSING** |

**Observability (PRD §3.4):**
- Structured JSON logging (timestamp, level, service, traceId, message, durationMs) — **MISSING** (bare stdout; no structlog/json-logger; no traceId propagation).
- Prometheus `/metrics` — EXISTS. Required metrics: `http_requests_total` ✓, `http_request_duration_seconds` ✓, **`db_query_duration_seconds` MISSING**, **`active_orders_total` MISSING** (2/4).
- Grafana dashboard — EXISTS, `grafana/dashboards/shopflow-overview.json`: request rate, error rate, p50/p95/p99 ✓; **DB query time and active users panels MISSING** (5/6-ish).
- **Alert rules — 3/3 EXIST** (`prometheus/alerts.yml`): error rate >5%/2m, p99 >1s/5m, service down/1m. ✓
- OpenTelemetry/Jaeger/Tempo (bonus +10) — MISSING.

**Docker (PRD §3.3):** multi-stage ✓, non-root ✓, HEALTHCHECK ✓ (both images), one-command compose with all 6 services ✓. **Image size < 200 MB — almost certainly EXCEEDED** (torch + sentence-transformers + lightgbm); unverified, no measurement in repo.

**Deliverable at risk:** "Pipeline runs end-to-end: lint → test → build → deploy" (25 pts) — no deploy stage.

---

## Domain 4 — Cloud & Infrastructure (60 pts)

**Modules (PRD §4.3): 3 of 6 real, 3 empty.**
- EXISTS & complete: `networking` (VPC, 2-AZ subnets, NAT, routing), `compute` (EKS, node group, IRSA/OIDC, KMS), `cdn` (CloudFront + private S3 + OAC + security headers).
- **EMPTY skeletons (zero .tf files): `database`, `storage`, `monitoring`.** Root composes only 3 modules.

**Missing components (PRD §4.2):** RDS PostgreSQL Multi-AZ, ElastiCache Redis, ALB + target groups, Route53, AWS Secrets Manager, CloudWatch log groups + billing alarm, **VPC flow logs**.

**Misconfigured / undersized:**
- S3 lifecycle **wrong**: expires noncurrent versions at 30d; PRD wants **tiering** to STANDARD_IA at 30d, Glacier at 90d.
- Node autoscaling 1–2; PRD wants 2–10 (deliberately downsized for free tier).
- S3 bucket lives in `cdn` module named `{name}-assets-*`, not a dedicated product-images bucket in `storage`.
- CloudFront fronts S3 only; **no ALB origin** (PRD wants it fronting API + frontend too).

**Cross-cutting:**
- Remote state: `backend.tf.example` only (local state in use); no active S3 + DynamoDB lock.
- **No staging/prod tfvars split** — only `terraform.tfvars.example`.
- Tags: `Project`, `Environment`, `ManagedBy` via default_tags ✓; **`Owner` and `CostCenter` MISSING**.
- **infracost: not run, no output committed** (needs API key; command documented).
- `terraform apply` **never run** (free-tier constraint — EKS control plane ~$73/mo + NAT).

**Deliverables at risk:** "apply runs cleanly (LocalStack OK)" (20 pts) — never done, though LocalStack is a $0 path; "all 10 components provisioned" (20 pts); staging/prod separation (5 pts); infracost in README (5 pts).

---

## Domain 5 — ML / AI Features (70 pts)

Backends are strong and well-engineered (swap-hooks + fakes for CI). Gaps are correctness-vs-spec and the missing frontend surfaces.

- **Semantic search:** hybrid weights are **0.6 semantic / 0.4 lexical** (`products.py:56-57`); PRD §5.2 specifies **0.7 / 0.3**. NDCG@3 ≥ 0.7 target: eval harness exists but is offline (needs real MiniLM) — not demonstrated against the target.
- **Demand forecasting:** backend + endpoints exist ✓. Chart on merchant dashboard — MISSING (no merchant UI).
- **Fraud detection:**
  - **Trained model not committed** — `app/ml/artifacts/` has only `.gitkeep`. Default path is the heuristic fallback (recall ~0.01), so the PRD target **precision ≥ 0.85 / recall ≥ 0.70 is not demonstrable** without training + committing/evaluating.
  - Feature set diverges from PRD §5.4: has order_total, account age, off-hours, item/price stats, prior orders/cancels, discount ratio; **missing orders-per-IP-in-24h and shipping-vs-billing address mismatch** (checkout captures neither client IP nor a billing address).
  - Scoring at checkout → `pending_review` works ✓; SHAP-style reasons via TreeSHAP ✓.
- **Merchant Copilot:** tool-calling backend on `claude-opus-4-8` with merchant isolation ✓. **Floating chat panel UI — MISSING.**
- **AI product descriptions:** stateless endpoint ✓. **One-click button in a product editor — MISSING** (no editor UI).
- "Did you mean?" suggestions / confidence badge (§5.2 frontend) — MISSING.

**Deliverables at risk:** forecasting charts in dashboard (15 pts), copilot answering via UI (15 pts), description generator in editor (5 pts) — all blocked on the merchant-UI cascade; fraud target (15 pts) needs the trained model.

---

## Domain 6 — Quality Engineering (70 pts)

Genuinely strong where it exists.
- Unit + integration: **205 tests, 82% coverage** ✓ (exceeds 50+30 minimum and 70% gate).
- E2E: **22 Playwright cases, 22/22 passing** ✓. But scenarios **30 (merchant product mgmt via UI), 31 (review lifecycle in merchant dashboard), 32 (fraud flag in merchant admin)** are currently **API-arranged**, not clicked through a merchant UI that doesn't exist.
- Performance: k6 smoke + load ✓ (Entry 31). PRD's exact profiles (100 VUs/60s listing @ p95<200ms; 20 VUs/120s checkout @ p95<800ms; 50 VUs/60s search @ p95<400ms) should be mapped 1:1 and reported per-scenario pass/fail.
- Security: OWASP ZAP baseline + API scans, triaged, 0 High/Critical ✓ (Entry 32). PRD wants an **active** scan on staging; current scans are passive+spider.
- **Component tests: 1 file / 3 tests** (checkout only) vs. PRD target **40 across all 10 components** — largest QA gap.
- Accessibility tests across all pages (axe/Lighthouse CI) — partial/unverified.

**Deliverable at risk:** "unit + integration + component tests passing in CI" (25 pts) — component tests are 3/40.

---

## Prompt Log (50 pts)

**36/36 entries filled** — exceeds the 30+ "Excellent" threshold, covers all 6 domains. Note: several Claude-authored entries still carry `(Umair to rate)` for Output Quality and need verbatim-prompt confirmation. Strong artifact; the main risk is that entries describe deliverables that are partial — keep the reflections honest about that.

---

## README & Demo (30 pts)

- Architecture diagram: **placeholder** ("add diagram in Week 8") — MISSING.
- Setup guide, tech stack, features, cost section: present.
- **5-minute demo video: MISSING** (human task).
- Any deviations from recommended stack must be justified in README (PRD §Tech Choices) — the free-tier / never-applied posture should be written up there explicitly.

---

## Prioritized remediation roadmap

Ordered by points-per-effort. Items 1–2 are the highest leverage.

1. **Merchant admin frontend** — unlocks Domain 2 (15 pts), most of Domain 5's surfaces (35 pts), and Domain 6 E2E scenarios 30–32. Backends already exist. Biggest single win.
2. **Backend endpoint gaps** — webhooks (mock, signed secret), order tracking, `merchant/products`, `merchant/orders`, `admin/users`, `admin/users/:id`, `admin/orders`; wire the authenticated rate-limit tier. Cheap, direct Domain 1 points.
3. **Fraud model** — train, commit the artifact (or a CI-run producing it), evaluate against precision ≥0.85 / recall ≥0.70; add IP-velocity + address-mismatch features (requires capturing client IP + billing address at checkout). Flip hybrid weights to 0.7/0.3 or document the deviation.
4. **Component library + tests** — add DataTable, RichTextEditor, Modal, Textarea, MultiSelect, SLATimer; Storybook stories + RTL tests (targets Domain 2 *and* Domain 6's 40-component-test gap together).
5. **Cloud** — either run via **LocalStack** to satisfy the apply deliverable at $0, or fill the 3 empty modules (RDS, S3-storage with correct IA/Glacier tiering, CloudWatch + billing alarm) and add Secrets Manager / Route53 / ALB / flow logs; add staging/prod tfvars, Owner/CostCenter tags, and run infracost. At minimum, **document the free-tier deviation in the README**.
6. **DevOps** — structured JSON logging with traceId; add `db_query_duration_seconds` + `active_orders_total` metrics (+ the two Grafana panels); `detect-secrets` in CI; a deploy stage (staging via compose is acceptable) + registry push with SHA tags; verify/trim image size or document why >200 MB.
7. **README** — real architecture diagram (Mermaid is fine), justify stack/free-tier deviations, record the 5-min demo.

---

*This is an assessment only — no code was changed to produce it. Evidence is cited to files above; re-run the audit after remediation.*
