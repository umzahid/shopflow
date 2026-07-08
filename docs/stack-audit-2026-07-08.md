# ShopFlow — Stack-by-Stack Audit: Optimizations & Remaining Work

**Date:** 2026-07-08 · **Branch:** `feat/frontend-prd-tail` at `3e3295e`
**Reference:** `ShopFlow_GenAI_PRD.docx` (v1.0, 480 pts) · **Method:** six parallel evidence-cited audit passes (one per domain), every claim verified against the working tree with file:line evidence
**Supersedes:** `docs/stack-audit-2026-07-07.md`

---

## Executive summary

The `feat/frontend-prd-tail` session closed most of the 07-07 audit's frontend/ML tail. Verified newly closed since the last audit: **fraud panel in the order drawer (+ E2E scenario 32), bulk actions, packing slip, category/rating filters, recently-viewed strip, multi-step checkout indicator, migration-006 indexes, copilot prompt caching, `--workers 2` k6 rerun**. The remaining work now concentrates in three places: **Domain 4 (Terraform apply/Route53/infracost — least moved), component test coverage, and documentation of deviations**.

| Stack | Completion | Biggest remaining item |
|---|---|---|
| 1 — Backend | ✅ ~100% | Nothing functional; checkout p95 is lock-contention-bound (documented) |
| 2 — Frontend | ✅ ~95% | Lighthouse run never committed (10-pt deliverable); geo heat map + AI weekly narrative |
| 3 — DevOps | ✅ ~95% | Frontend server-side JSON logging; detect-secrets is report-only |
| 4 — Cloud | 🟡 ~85% | `terraform apply` never exercised (LocalStack path unused, 20 pts); Route53; infracost |
| 5 — ML/AI | ✅ ~95% | NDCG@3 eval never run with real encoder; two undocumented deviations |
| 6 — QA | 🟡 ~90% | Component tests 6/14; authenticated ZAP; a11y gaps (detail/merchant/checkout) |
| Cross-cutting | 🟡 | 13 PROMPT_LOG entries unrated; demo video; landing page uncommitted |

---

## Domain 1 — Backend (FastAPI) — COMPLETE

All items from the 07-07 list verified shipped:

- **Migration 006 indexes** ✓ — `orders(status, created_at)`, partial `products(merchant_id) WHERE deleted_at IS NULL`, `orders(ip_address, created_at)` (`alembic/versions/006_perf_indexes.py:18-28`, matching `models.py` `__table_args__`).
- **CPU offload + caches** ✓ — MiniLM encode and fraud scoring via `asyncio.to_thread` (`api/products.py:95,112`, `services/fraud.py:143`); LRU-1024 query-embedding cache (`services/embedding.py:50-52`); DB pool 20+40 (`core/config.py:16-17`).
- **Multi-worker k6 rerun** ✓ — Dockerfile `--workers 2` (`backend/Dockerfile:32`); post-optimization run committed (`docs/performance.md:21-99`): listing p95 −55%, search −60%.
- **No N+1s** ✓ — `selectinload(Order.items)` on all order list/detail routes; middleware ordering clean (rate-limit gate first).

### Remaining (all minor)
1. **Checkout p95 (3.55 s vs 800 ms target)** — `SELECT FOR UPDATE` contention on the small seeded catalog; re-run with a larger seed if an honest number is wanted. Not a code defect.
2. Copilot **tools block lacks its own `cache_control`** (`services/copilot.py:114`) — the system-prompt breakpoint covers the prefix per the SDK comment; verify or add explicitly. Cosmetic.

---

## Domain 2 — Frontend (Next.js 14) — ~95%

### Newly verified DONE (closed since 07-07)
| Item | Evidence |
|---|---|
| Recently-viewed (localStorage) | `lib/recentlyViewed.ts`, rendered on home `app/page.tsx:246` |
| Category + rating + price filters | `app/products/page.tsx:309-365` (URL-driven, desktop sidebar + mobile drawer) |
| Multi-step checkout indicator | `app/checkout/page.tsx:56-94` |
| Bulk actions (activate/archive) | `merchant/products/page.tsx:119-149` (row selection + select-all) |
| Packing slip print | `merchant/orders/page.tsx:55-87,280-289` |
| Fraud panel in order drawer | `merchant/orders/page.tsx:208-242` (`data-testid="fraud-panel"`) |
| `next/image` everywhere | 0 raw `<img>` in `src/` |
| Lazy loading | `next/dynamic` on MerchantCopilot (merchant layout) + ForecastChart |
| TS strict, zero `any` | `tsconfig.json:6`; grep clean |

### Remaining
| Item | PRD ref | Notes |
|---|---|---|
| **Lighthouse mobile ≥ 85 run** | §2.5 | Still zero evidence in repo — unverified **10-pt deliverable**. One LHCI or manual run, commit the result. |
| Variant selector | §2.2 | No variant system in backend model either — document as out-of-scope deviation rather than build. |
| Geo heat map | §2.3 | Stubbed "not yet available" (`merchant/analytics/page.tsx:124-127`); PRD allows mock data — a mock-data map would satisfy it. |
| AI weekly narrative | §2.3 | Not implemented; backend copilot could serve this with one endpoint + a card on analytics. |
| Bundle analyzer run | opt | Never run; do once before any further perf work. |

### ⚠️ Uncommitted work
`app/landing/` + `components/landing/` + `globals.css`/`package.json` changes are **untracked but live** — the landing page is linked from the nav (`href="/landing"`) and footer, and `framer-motion@12` is in `package.json`. Outside PRD scope. **Decide: commit explicitly or park on a branch before submission** — right now a `git stash`/clean would break the committed nav link.

---

## Domain 3 — DevOps & CI/CD — ~95%

### Verified in place
12-job pipeline covering all 8 PRD stages (incl. GHCR push with SHA tag, staging deploy, prod deploy behind approval); Grafana 9/9 panels incl. DB-query-time + active-orders; 3/3 alert rules; compose has resource limits + healthchecks + env-var-only secrets; backend image deviation documented (`docs/devops.md:74-81`).

### Remaining
1. **Frontend server-side JSON logging** — no `middleware.ts`, no pino, no traceId anywhere in `frontend/`. The one real §3.4 gap. (~2–3 h)
2. **detect-secrets is `continue-on-error: true`** (`test.yml:362`) — PRD stage 4 says secrets should fail the build; make it a gate (allowlist the test fixtures first).
3. **OpenTelemetry → Jaeger/Tempo** — unclaimed **+10 bonus**; `@opentelemetry/api` is already in the frontend lockfile as a transitive dep, but nothing is instrumented.
4. Optimization: `RUN --mount=type=cache` for pip/npm in both Dockerfiles — absent, cheap win (~30 s/rebuild).
5. No CI jobs for `terraform fmt/validate` / kubeconform — commands exist locally, absent in CI.

---

## Domain 4 — Cloud & Infrastructure — ~85% (least moved since 07-07)

### Verified in place
Staging/prod tfvars with real differences (2-AZ/single-NAT/t3.small vs 3-AZ/per-AZ-NAT/t3.large/private API); Owner + CostCenter in `default_tags` (`main.tf:4-12`); storage module tiers IA@30d → Glacier@90d correctly.

### Remaining — unchanged from 07-07
| Item | Status | Effort |
|---|---|---|
| **`terraform apply` via LocalStack** | Never exercised — the **20-pt "apply runs cleanly" deliverable is still unbanked** | half day |
| **Route53 module** | Zero route53 references in any .tf — 10th component missing | 1–2 h |
| **infracost** | README cost section is literally *"(Add infracost output here in Week 5)"* (`README.md:117-118`) | needs free API key |
| Remote state | `backend.tf.example` only; local state | 30 min + bucket |
| HPA `maxReplicas: 3` vs PRD 2–10 | `k8s/backend.yaml:105` | one line |
| Spot capacity | `node_capacity_type` var exists in the compute module but is **never passed from `main.tf` nor set in staging.tfvars** — dead toggle | wire it through |
| ALB deviation doc | Explained in `docs/IMPLEMENTATION.md:154` but **not in README** — PRD requires deviations in README | doc move |
| EKS access entries | No `aws_eks_access_entry` anywhere — [H] item from the well-architected review | before any real apply |
| CDN-module S3 lifecycle | Still expires noncurrent versions instead of tiering (mismatch with storage module) | small |

---

## Domain 5 — ML/AI — ~95%

### Verified in place
Fraud model artifact committed (776 KB, P=0.88/R=0.74 noted inline); hybrid 0.7/0.3 exact (`api/products.py:57-61`); "Did you mean?" + 3-tier confidence badges (`products/page.tsx:529-573`); forecast chart with confidence band (`components/ui/Charts.tsx:122-176`); copilot prompt caching (`services/copilot.py:105-112`).

### Remaining
1. **NDCG@3 eval never run/committed.** Harness + golden set exist (`app/scripts/eval_search.py`, `app/eval/data/search_golden.json`); one run with the real MiniLM encoder, commit the output. The PRD's "NDCG@3 ≥ 0.7" claim is currently unsubstantiated. (~30 min)
2. **Two undocumented deviations** (PRD requires deviations justified):
   - fraud `REVIEW_THRESHOLD = 0.6` (`ml/fraud.py:76`) vs PRD's 0.7 — tuned for the P/R balance; write 2 lines.
   - synthetic seeder default 180 days (`seed_synthetic_sales.py:234`) vs PRD's 2 years — flag exists; document or flip the default.
3. AI description button exists only in the **create** form (`merchant/products/page.tsx:489-498`), not the row-edit flow. (~2 h)
4. Optional: copilot **streaming** (endpoint is plain request/response) — perceived-latency win only.

---

## Domain 6 — QA / Testing — ~90%

### Verified in place
254 backend test functions across 42 files, 70% CI gate; **E2E scenario 32 now DONE** — `e2e/tests/fraud.spec.ts` TC-27 asserts the pending-review status and the fraud panel's score + reasons (new since 07-07); k6 PRD benchmark table current with honest pass/fail + root cause; a11y suite on 5 pages, 0 serious/critical.

### Remaining
1. **Component tests: 6/14 components, 23 cases.** Covered: DataTable, Textarea, Modal, MultiSelect, RichTextEditor, StatusBadge. **Untested: Button, Input, Select, Drawer, Toast, ProductCard, SLATimer, SkeletonLoader.** Largest single QA gap vs the PRD's 40-test target. (~1 day)
2. **E2E scenario 31 incomplete** — review published on the product page is tested, but no spec clicks through "merchant sees the review in the dashboard."
3. **Authenticated ZAP scan** — explicitly deferred (`security/zap-scan.sh:29-30`); `/merchant/*` + `/admin/*` IDOR/priv-esc surface uncovered.
4. **Lighthouse CI** — nothing anywhere (same finding as Domain 2's 10-pt deliverable).
5. **a11y gaps** — product detail, merchant pages, and checkout aren't in `a11y.spec.ts` (5 pages covered).
6. detect-secrets non-blocking (see Domain 3); no scheduled (cron) CI runs for E2E/k6/ZAP.

---

## Cross-cutting

- **PROMPT_LOG.md** — 13 entries still "(to rate)": owner's 5-minute task, rubric requires it.
- **README** — infracost placeholder; ALB-via-Ingress + free-tier/never-applied + fraud-threshold + seeder-horizon deviations should all be stated there (PRD: deviations must be justified in README).
- **5-minute demo video** — human task, outstanding.
- **Uncommitted tree** — landing page (linked from committed nav!), `.claude/settings.json`, `skills/`. Resolve before the final push.

---

## Prioritized remaining-work list (points-per-effort)

1. **LocalStack `terraform apply`** — banks the last untouched 20-pt deliverable. (half day)
2. **One Lighthouse run, committed** — verifies a 10-pt deliverable that currently has zero evidence. (~1 h)
3. **Run search eval with the real encoder + commit NDCG@3.** (~30 min)
4. **Deviation write-ups in README** — ALB, free-tier, fraud 0.6, seeder 180d, backend image size. Pure documentation, protects multiple graded claims. (~1 h)
5. **Component tests for the 8 uncovered components.** (~1 day)
6. **Frontend JSON logging middleware** — last Domain-3 gap. (~2–3 h)
7. **Terraform quick wins** — Route53 module, HPA max 10, wire spot toggle, activate remote state, align CDN lifecycle. (~half day total)
8. **E2E scenario-31 merchant leg + a11y specs for detail/merchant/checkout + authenticated ZAP.** (~1 day)
9. **Make detect-secrets a gate; add terraform/kubeconform CI jobs; Docker cache mounts.** (~2 h)
10. **Owner tasks:** rate 13 PROMPT_LOG entries, infracost API key, demo video, decide the landing page's fate.
11. **Optional bonuses:** OpenTelemetry (+10 pts), copilot streaming, AI weekly narrative + mock geo map, description button in edit flow.

*Report generated 2026-07-08 on `feat/frontend-prd-tail` (3e3295e). Six parallel audit passes; file:line evidence cited per section.*
