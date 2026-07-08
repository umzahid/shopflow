# ShopFlow — Stack-by-Stack Optimization & Remaining-Work Report

**Date:** 2026-07-07 · **Branch:** `perf/api-latency` (in sync with origin)
**Reference:** `ShopFlow_GenAI_PRD.docx` (v1.0, 480 pts) · **Method:** six parallel evidence-cited audit passes (one per domain), findings verified against the working tree
**Supersedes:** the "Remaining" block in `docs/prd-gap-analysis.md` (2026-07-06)

---

## Executive summary

The gap-closing sprint (2026-07-06) held up under re-audit: **all six domains are substantially delivered**. What remains is a short tail — no domain has a missing pillar anymore. Overall completion by domain:

| Stack | Completion | Biggest remaining item |
|---|---|---|
| 1 — Backend | ✅ ~100% functional | k6 latency targets still missed on dev-laptop topology |
| 2 — Frontend | ✅ ~90% | Bulk actions, packing slip, geo heat map, AI weekly narrative |
| 3 — DevOps | ✅ ~95% | Frontend server-side JSON logging; backend image 2.4 GB (documented deviation) |
| 4 — Cloud | ✅ 9/10 components | Route53 module; remote state inactive; infracost never run; `apply` never exercised (LocalStack path unused) |
| 5 — ML/AI | ✅ ~93% | **Fraud score/reasons not shown in merchant order UI**; NDCG@3 never verified with the real encoder |
| 6 — QA | ✅ ~90% | Component tests 6/10 components; E2E scenario 32 (fraud flag via UI) missing; no authenticated ZAP scan |
| README/Demo/Log | 🟡 | 13 PROMPT_LOG entries still "(to rate)"; infracost placeholder in README; 5-min demo video (human) |

**Highest-leverage remaining item:** surfacing `fraud_score`/`fraud_reasons` in the merchant order detail drawer. It closes a PRD Domain-5 deliverable ("merchant sees flag in order manager"), unblocks E2E scenario 32 (Domain 6), and the data is already in the API response — frontend-only change.

---

## Domain 1 — Backend (FastAPI)

### Status vs PRD — COMPLETE
- All **8 endpoint groups** present and functional, incl. webhooks (HMAC constant-time), tracking, full merchant/admin sets (`app/api/*.py`).
- JWT 15 min + rotating 7-day refresh cookie ✓; Pydantic validation everywhere ✓; RFC 7807 on all errors ✓.
- Cursor pagination `(created_at, id)` on **every** list endpoint (`app/core/pagination.py`) ✓.
- **Both rate-limit tiers actually wired** (100/min IP, 1000/min authenticated; JWT-decoded bucket in `app/main.py:36-46`) with 429 + `Retry-After` ✓.
- 5 clean Alembic migrations; soft deletes + partial indexes; OpenAPI at `/openapi.json` ✓.

### Performance (PRD §6.4) — improved, targets still missed locally
Recent `perf/api-latency` work (commit `9187834`) offloaded MiniLM encode + fraud scoring to worker threads, added an LRU-1024 query-embedding cache, and doubled the DB pool (20+40):

| Scenario | Target p95 | Before | After | Verdict |
|---|---|---|---|---|
| GET /products @100 VU | <200 ms | 2.81 s | **1.25 s** | ❌ (−55%) |
| GET /products/search @50 VU | <400 ms | 3.43 s | **1.36 s** | ❌ (−60%) |
| POST /orders/checkout @20 VU | <800 ms | 2.06 s | 3.55 s | ❌ lock-contention bound, not CPU |

Root cause honestly documented in `docs/performance.md`: single uvicorn worker + single local Postgres is the ceiling; checkout is `SELECT FOR UPDATE` contention on a tiny seeded catalog.

### Remaining optimizations (cheap, migration `006`)
> ✅ **Update 2026-07-07:** items 1–3 shipped as `alembic/versions/006_perf_indexes.py` (+ matching model `__table_args__`); migration round-trip verified against Postgres, full suite 251 passed. Copilot prompt caching (system+tools prefix breakpoint) also added in `services/copilot.py`. Item 4 remains open.

1. **Composite index `orders(status, created_at)`** — merchant/admin revenue aggregations (~15–20% faster dashboards). Effort: minutes.
2. **Partial index `products(merchant_id) WHERE deleted_at IS NULL`** — merchant product listing (~10–15%).
3. **Composite index `orders(ip_address, created_at)`** — fraud IP-velocity lookup at checkout (~5–10%).
4. Optional: multi-worker k6 re-run (image already ships `--workers 2`) + larger seed catalog to give an honest checkout number.

Non-issues verified: no N+1 (orders use `selectinload`), pool sizing safe vs Postgres limit, payloads reasonable, bcrypt latency is an intentional security property.

---

## Domain 2 — Frontend (Next.js 14)

### Status vs PRD — ~90%
Done and verified: full storefront (home, listing with infinite scroll + semantic search badges, detail with gallery/histogram/AI summary, cart, checkout with coupon, order-tracking timeline, full customer account), merchant admin (dashboard with revenue/donut/top-5/low-stock, product manager **with inline price/stock quick-edit**, order manager with detail drawer + status state machine, analytics with revenue + funnel), **all 10+ library components with Storybook stories**, dark mode via CSS variables, TS strict, RHF+Zod, React Query tuned (staleTime/retry/refetchOnWindowFocus), 422 ARIA attributes.

### Remaining gaps
| Item | PRD ref | Notes |
|---|---|---|
| Recently-viewed (localStorage) | §2.2 home | Not implemented anywhere |
| Category + rating filters in sidebar | §2.2 listing | Price filter only |
| Variant selector | §2.2 detail | No variant system (also absent from backend model — arguably out of scope; document) |
| Multi-step checkout indicator | §2.2 | Single form; works, but no visual steps |
| **Bulk actions (activate/archive)** | §2.3 product manager | No row selection — verified absent |
| **Packing slip print** | §2.3 order manager | Verified absent |
| Geo heat map | §2.3 analytics | Explicitly stubbed "not yet available" (no buyer geo captured) |
| AI weekly narrative | §2.3 analytics | Not implemented |
| Lighthouse mobile ≥85 | §2.5 | Still no recorded run in repo — 10-pt deliverable unverified |

### Optimization opportunities
1. **Raw `<img>` in `cart/page.tsx:127` and `CartDrawer.tsx`** → `next/image` (everything else already uses it). Low effort.
2. **No `dynamic()` imports anywhere** — lazy-load merchant routes, Charts, RichTextEditor (~15–25% first-load JS for customers who never open admin).
3. **Run `@next/bundle-analyzer` once** — no bundle evidence exists; do this before further micro-optimizing.
4. Already good: hand-rolled charts (no chart-lib weight), `output: standalone`, next/font with swap, `prefers-reduced-motion` honored, IntersectionObserver infinite scroll.

### Uncommitted work in tree
`frontend/src/app/landing/` + `components/landing/` + globals.css additions: a new animated landing page (framer-motion added as a dependency, Reveal/Stagger/Counter/Aurora primitives, glass-morphism tokens, reduced-motion safe). Production-quality but **uncommitted and outside the PRD** — decide to commit or park it; note it adds framer-motion to the bundle.

---

## Domain 3 — DevOps & CI/CD

### Status vs PRD — ~95%
- **All 8 pipeline stages** in `.github/workflows/test.yml` (13 jobs): 3-tool lint, unit tests w/ 70% gate, integration w/ pgvector+redis, Trivy+Semgrep+detect-secrets, GHCR push with git-SHA tag, staging deploy job, 16-check smoke script, prod deploy behind GitHub Environment approval.
- Backend structured JSON logging with all 6 required fields incl. traceId + durationMs ✓; **all 4 required Prometheus metrics** ✓; Grafana dashboard 9/9 panels ✓; 3/3 alert rules ✓.
- Docker: multi-stage, non-root, HEALTHCHECK, one-command compose (6 services), no hardcoded secrets ✓. Frontend image 199 MB ✓.

### Remaining
1. **Frontend server-side JSON logging — the one real §3.4 gap.** Add `middleware.ts` (traceId) + pino-style JSON to stdout. ~2–3 h.
2. **Backend image 2.4 GB vs <200 MB** — documented deviation (`docs/devops.md:74-81`). If it ever needs fixing: ONNX Runtime instead of torch (~−800 MB) or split ML into a sidecar service (API image <300 MB).
3. OpenTelemetry → Jaeger/Tempo — unclaimed **+10 bonus**.

### Optimizations
- `RUN --mount=type=cache,target=/root/.cache/pip` in Dockerfiles (buildx already set up; ~30 s/rebuild).
- Marginal: run `build-frontend` parallel to `test-backend`; CI caching (pip/npm/GHA-docker) is otherwise already in place.

---

## Domain 4 — Cloud & Infrastructure (Terraform + k8s)

### Status vs PRD — 9/10 components, validated never applied
All six modules now contain real .tf files (database/storage/monitoring filled 2026-07-06): VPC + flow logs, EKS (KMS, IRSA), RDS Multi-AZ + Secrets Manager, ElastiCache, S3 with IA@30d/Glacier@90d tiering, CloudFront + OAC, CloudWatch + billing alarm. Staging/prod tfvars ✓, full 5-key tagging ✓, `terraform validate` clean, kubeconform strict passes 13 k8s resources.

### Remaining
| Item | Status | Fix effort |
|---|---|---|
| **Route53 module** | Missing entirely (10th component) | ~50-line module |
| ALB in Terraform | By design via k8s AWS LB Controller — **write the justification in README** (PRD requires deviations documented) | Doc only |
| Remote state | `backend.tf.example` only, local state | Rename + create bucket/lock table |
| `terraform apply` never run | LocalStack path documented but **never exercised** — the 20-pt "apply runs cleanly" deliverable is still unverified | Half-day LocalStack run |
| infracost | Command documented, never run; README cost section is a placeholder | Needs free API key |
| EKS access entries | [H] in well-architected review — must-do before any real apply | IAM roles |
| HPA max=3 vs PRD 2–10 | One line in `k8s/backend.yaml:105` | Trivial |
| Spot capacity | Toggle exists, unused (`ON_DEMAND` default) — ~70% node cost saving in staging tfvars | One tfvar |
| CDN-origin S3 lifecycle | Noncurrent versions expire instead of tiering — align with storage module | Small |

---

## Domain 5 — ML/AI Features

### Status vs PRD — ~93%
- **Semantic search:** 0.7/0.3 hybrid weights exact ✓, HNSW ✓, LRU query-embedding cache ✓, "Did you mean?" + 3-tier confidence badges in UI ✓.
- **Forecasting:** Prophet + 24h Redis cache ✓, restock alerts endpoint + dashboard widget ✓, forecast chart w/ confidence band in product drawer ✓.
- **Fraud:** trained LightGBM **committed** (`app/ml/artifacts/fraud_model.txt`), P=0.855/R=0.724 meets targets ✓; full PRD feature set incl. IP-velocity + billing mismatch ✓; TreeSHAP top-3 reasons ✓; heuristic fallback never blocks checkout ✓.
- **Copilot:** claude-opus-4-8 agentic loop, 6 SELECT-only merchant-scoped tools, floating panel, sessionStorage history, isolation tested ✓.
- **Descriptions:** structured-output endpoint + one-click button in product create form ✓.

### Remaining
1. **Fraud flag invisible to merchants (HIGH).** `fraud_score`/`fraud_reasons` are in the API response but `merchant/orders/page.tsx` OrderDetail doesn't render them. Frontend-only; also unblocks E2E scenario 32.
2. **NDCG@3 ≥0.7 never verified.** Harness + golden set exist; run once with the real MiniLM encoder and commit the result (`python -m app.scripts.eval_search --k 3`).
3. Threshold deviation: pending_review at **0.6**, PRD says 0.7 — tuned for P/R balance; document it.
4. Synthetic data seeder defaults to 180 days vs PRD's 2 years (flag exists) — document or change default.
5. Description button exists only in create flow, not edit.

### Optimizations
- **Anthropic prompt caching** on the copilot's static system prompt + tool definitions (`cache_control: ephemeral`) — cost/latency win, small change.
- **Streaming** copilot responses for perceived latency.
- Model loading, embedding caching, forecast caching already well-optimized.

---

## Domain 6 — QA / Testing

### Status vs PRD — ~90%
- Backend: **247 tests (95 unit + 152 integration), 82% coverage** — comfortably above every threshold.
- E2E: 31 Playwright cases; scenarios 29/30/33 fully UI-driven; a11y suite (axe WCAG 2.1 AA, 5 pages, 0 serious/critical) ✓.
- k6: all 3 exact PRD profiles implemented with documented pass/fail + root cause ✓.
- Security: **active** ZAP scan 0 alerts, JWT tampering/expiry/replay tests, cross-role authz tests, 429+Retry-After tests, detect-secrets in CI, .env gitignored ✓.
- Test plan + bug reports docs ✓.

### Remaining
1. **Component tests: 6 of 10 components** (36 cases). Untested: Button, Input, Select, Drawer, Toast, ProductCard, SLATimer, SkeletonLoader, Charts. Priority: ProductCard + Charts.
2. **E2E scenario 32** (fraud flag visible in merchant admin) — blocked on the Domain-5 fraud-UI gap above; add the spec once the badge renders.
3. **Scenario 31** partial — review display tested, but the "merchant sees review in dashboard" leg isn't clicked through.
4. **Authenticated ZAP scan** of `/merchant/*` + `/admin/*` with a session token (IDOR/priv-esc coverage).
5. detect-secrets is report-only (`continue-on-error`) — consider making it a gate.
6. Optional: promote E2E + k6 + ZAP to scheduled CI; Lighthouse CI for the unverified ≥85 deliverable.

---

## Cross-cutting (Prompt Log, README, Demo)

- `PROMPT_LOG.md`: 36/36 entries but **13 still marked "(to rate)"** — owner's 5-minute task; rubric requires verbatim prompts + ratings.
- README: Mermaid architecture diagram ✓; **infracost section is still a placeholder**; ALB-via-Ingress and free-tier/never-applied deviations should be stated explicitly (PRD requires justified deviations).
- **5-minute demo video** — human task, still outstanding.

---

## Prioritized remaining-work list (points-per-effort)

1. **Fraud badge + reasons in merchant order drawer** → then E2E scenario 32. Frontend-only; closes gaps in Domains 5 *and* 6. (~half day)
2. **Run the search eval with the real encoder** and commit NDCG@3 results. (~30 min)
3. **Component tests for the remaining UI components** (Button, Input, Select, Toast, ProductCard, Charts, Drawer, SLATimer, SkeletonLoader). (~1 day)
4. **Frontend server-side JSON logging** (middleware + traceId). (~2–3 h)
5. **Backend index migration 006** (orders status+created_at, products merchant partial, orders ip+created_at). (~30 min)
6. **Terraform quick wins:** HPA max 10, spot in staging tfvars, Route53 module, activate remote state; **exercise `terraform apply` against LocalStack** to finally bank the 20-pt deliverable. (~1 day)
7. **README/doc tail:** infracost run (needs API key) or explicit placeholder justification; ALB/free-tier deviation write-ups; rate the 13 PROMPT_LOG entries; record the demo video.
8. **Frontend polish tier:** bulk actions + packing slip, category/rating filters, recently-viewed, `next/image` in cart, lazy-load merchant routes, one Lighthouse run committed.
9. **Optional bonuses:** OpenTelemetry tracing (+10 pts), copilot prompt caching/streaming, authenticated ZAP scan.

*Report generated 2026-07-07 on branch `perf/api-latency`. Evidence file:line citations available in the per-domain sections above.*
