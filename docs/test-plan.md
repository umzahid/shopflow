# ShopFlow — Test Plan

| | |
|---|---|
| **System under test** | ShopFlow — AI-powered e-commerce platform (FastAPI + Postgres/pgvector + Redis backend, Next.js 14 frontend, ML features: hybrid search, demand forecasting, fraud scoring, Claude-powered copilot & description generation) |
| **Version** | 1.0 — written after all test layers exist (Entry 33), documenting what actually runs |
| **Date** | 2026-07-03 |
| **Author** | Umair Zahid (drafted with Claude) |
| **Related docs** | `docs/bug-reports.md`, `docs/zap-findings.md`, `perf/README.md`, `e2e/README.md`, `docs/PROJECT_STATUS.md` |

---

## 1. Objectives

1. Catch functional regressions in the API and storefront before merge (CI-gated).
2. Prove the critical user journeys work end-to-end in a real browser.
3. Establish performance baselines and SLO drafts for the hot paths.
4. Surface security misconfigurations early, with findings triaged rather than dumped.
5. Measure ML feature quality (search relevance, fraud discrimination) honestly — offline, with real models, not vanity metrics from fakes.

## 2. Scope

**In scope**

- Backend API: auth, products, search (3 modes), cart, orders/checkout, reviews, coupons, merchant & admin endpoints.
- Frontend storefront: register/login, browse/search, cart, checkout, order confirmation, review display.
- ML paths: embedding search, forecast/restock, fraud scoring at checkout, copilot, description generation (deterministic fakes in CI; real models evaluated offline).
- Non-functional: performance (k6), security posture (ZAP, Trivy), observability smoke (Prometheus/Grafana up).

**Out of scope (deliberate, with reasons)**

- Cloud infrastructure runtime behavior — the Terraform/EKS stack is validated offline (`terraform validate`, `kubeconform`) and **never applied** (free-tier constraint; see `docs/aws-free-tier.md`).
- Merchant/admin *frontend* — no UI exists yet; the API surface is covered by the backend suite.
- Review-writing UI and coupon-creation API — same reason; covered at API level where the surface exists.
- Email flows, payments — not implemented in the assignment scope.

## 3. Test levels — what runs, where, and what it proves

### 3.1 Unit & integration (pytest) — the regression gate

- **205 tests, 82% coverage** (CI gate: 70%), flake8/black clean.
- **Real-database policy: no mocking.** Tests run against a live `shopflow_test` Postgres; conftest truncates between tests and swaps the engine under FastAPI's `get_db()`. SQL, constraints, migrations, and cursor pagination are exercised for real.
- **Determinism at the ML/LLM boundary, not below it:** every external model has a swap hook (`set_encoder` / `set_forecaster` / `set_scorer` / `set_llm` / `set_generator`) with a deterministic fake, so CI never needs model weights or an API key — while the code path from route to response stays real.
- Run: `pytest tests/` (see CLAUDE.md for variants).

### 3.2 End-to-end (Playwright) — the user's view

- **22 step-structured cases (TC-01…TC-22), 22/22 passing ≈ 18.5s**, covering auth (incl. session persistence and the auth-guard `next=` redirect), browse/search, cart (localStorage persistence, stock caps), the full checkout journey through live fraud scoring, and review display.
- **API-arrange / UI-act:** test data is seeded through the API so the browser only exercises the behavior under test — this is what keeps 22 cases under 20 seconds.
- Page objects derive locators from the **rendered DOM** (parameterized aria-labels — the app has no test IDs); the `find-locators` skill documents the workflow via Playwright MCP.
- Runs from the official Playwright Docker image, `--network host`, no host Node.
- Run: see `e2e/README.md`.

### 3.3 Performance (k6) — baselines and SLO drafts

- **`smoke`** (1 VU, 60s, paced *under* the stock 100/min-per-IP rate limit): every hot path answers correctly within relaxed budgets. Latest: 102/102 checks, 0 failures.
- **`load`** (~4.5 min, browse 0→25 VUs + authenticated shoppers with 30% checkout): latest run **6,092 requests, 0 failures, ~21 req/s sustained**; p95 — list 34ms, semantic/hybrid search 69ms, cart add 40ms, checkout (incl. live LightGBM fraud scoring) 58ms.
- Load runs require the documented rate-limit overlay (`perf/docker-compose.perf.yml`) — single-IP load testing otherwise measures the rate limiter, not the app.
- Thresholds are **dev-laptop SLO drafts**, not production numbers. Known warm-up: first embedding encode after boot cold-loads MiniLM (~10–20s).
- Run: `perf/run.sh smoke|load` (see `perf/README.md`).

### 3.4 Security — posture checks, triaged

- **OWASP ZAP**: API scan driven by the OpenAPI spec (every route exercised, unauthenticated) + frontend baseline scan. Findings triaged in `docs/zap-findings.md` into real / dev-environment-expected / false positive — the report is the analysis, not the alert dump.
- **Trivy** image scanning in CI (fails on critical vulns).
- **Design-level controls tested elsewhere:** merchant isolation in the copilot is enforced in code and proven with two-merchant tests (backend suite); review purchase-gating, role guards, and refresh-token rotation are covered by API tests.
- Authenticated/active scanning of merchant+admin surfaces is documented future work.

### 3.5 ML evaluation (offline) — honest numbers

- `app/eval/` harness: hand-rolled NDCG/recall for search, confusion matrix/P-R-F1/ROC-AUC for fraud; run-once CLIs write JSON reports.
- **Deliberately not a CI gate:** meaningful semantic-search metrics require the real MiniLM encoder, so evaluation is an offline report; CI asserts report *shape* only with the fake encoder.
- Known result worth repeating: the heuristic fraud *fallback* (no trained booster) has recall ≈ 0.01 — the trained LightGBM artifact is required for usable detection.

### 3.6 CI pipeline — where the gates live

8-stage GitHub Actions: backend lint → frontend lint → pytest (+70% coverage gate) → Vitest → Next build → Docker builds → API smoke → Trivy. Green as of the current branch. E2E/k6/ZAP run on demand from Docker (documented above); promoting them to scheduled CI jobs is future work.

## 4. Test environments

| Layer | Environment | Data |
|---|---|---|
| pytest | Host or CI; real Postgres `shopflow_test` + Redis | Truncated per test |
| Playwright | Docker (`mcr.microsoft.com/playwright`), `--network host` → compose stack | API-seeded per test, unique emails |
| k6 | Docker (`grafana/k6`), `--network host` → compose stack | API-seeded catalog + shopper pool per run |
| ZAP | Docker (`ghcr.io/zaproxy/zaproxy`), `--network host` → compose stack | Unauthenticated |
| ML eval | Host, real models (MiniLM / trained booster) | Deterministic seeded corpus/holdout |

All Dockerized layers share the same reasoning for `--network host`: the frontend bundle bakes `localhost:8000` as its API base, so the container's network view must match the host's.

## 5. Entry & exit criteria

**Entry (per test session):** compose stack healthy (`/health` 200, frontend 200); for pytest, `shopflow_test` DB reachable; for load runs, perf overlay applied.

**Exit (release-readiness for the assignment):**
- pytest 100% pass, coverage ≥ 70% (currently 82%).
- E2E 22/22 pass.
- k6 smoke: all thresholds green against stock config.
- ZAP: no untriaged High/Critical findings (see `docs/zap-findings.md`).
- No open Critical/High bugs (`docs/bug-reports.md` — all four written up are fixed).

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Silent dependency breakage (bcrypt/passlib class — BUG-002) | Pins documented in CLAUDE.md; auth round-trip tested in CI |
| Fake-model drift: fakes pass while real models fail | Offline eval harness with real models; live endpoint sweeps before milestones |
| Config-time errors bypassing error handling (BUG-001 class) | Boundary guards (`_get_client` 503 pattern) + live sweep with unset keys |
| Schema-valid but semantically wrong infra (BUG-003/004 class) | Adversarial review pass on every infra change; probe/URL existence checked live |
| Perf numbers flattered by warm caches / small data | Documented warm-up behavior; seeded catalogs; thresholds framed as dev-laptop drafts |
| Single-maintainer blind spots | Superpowers pipeline: independent reviewer subagent per feature + whole-feature review before merge |

## 7. Traceability — Domain 6 tasks → artifacts

| Task | Artifact | Evidence |
|---|---|---|
| Backend test suite (E29) | `backend/tests/` | 205 tests, 82% cov, CI |
| E2E scripts (E30) | `e2e/` | 22/22, `e2e/README.md` matrix |
| k6 perf (E31) | `perf/` | PROMPT_LOG Entry 31 results |
| ZAP analysis (E32) | `security/zap-scan.sh`, `docs/zap-findings.md` | triaged findings |
| Test plan (E33) | this document | — |
| Bug reports (E34) | `docs/bug-reports.md` | 4 fixed defects, commits cited |

## 8. Future work

Promote E2E + k6 smoke + ZAP baseline to scheduled CI jobs; authenticated ZAP scanning of merchant/admin surfaces; frontend component-test depth beyond checkout; load testing against production-shaped infrastructure (currently forbidden by the free-tier constraint); re-run cost/perf analyses if the infra is ever applied.
