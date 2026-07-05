# DevOps & Observability

Status of the Domain-3 deliverables after the 2026-07-05 gap-closing pass.

## Structured logging

Backend emits **one JSON object per log line** (`app/core/logging.py`) with the
PRD-required fields: `timestamp`, `level`, `service`, `traceId`, `message`,
`durationMs` — plus `method`, `path`, `status`, `client_ip` on access lines.

- A per-request `traceId` is generated in the request-logging middleware
  (`main.py`), propagated through a `ContextVar` so every log emitted while
  handling a request carries it, and echoed back as the `X-Request-ID` header.
- uvicorn's own loggers are routed through the same JSON handler.

Example line:

```json
{"timestamp":"2026-07-05T13:18:42Z","level":"INFO","service":"ShopFlow",
 "traceId":"7e319025…","message":"request","durationMs":17.58,"method":"GET",
 "path":"/api/v1/products","status":200,"client_ip":"192.168.65.1"}
```

## Metrics (`/metrics`, Prometheus)

| Metric | Type | Source |
|---|---|---|
| `http_requests_total` | counter | prometheus-fastapi-instrumentator |
| `http_request_duration_seconds` | histogram | instrumentator |
| `db_query_duration_seconds` | histogram | SQLAlchemy cursor events (`app/core/metrics.py`) |
| `active_orders_total` | gauge | 15s background task counting pending/confirmed/shipped |

All four are live (verified via `curl /metrics`).

## Grafana

`grafana/dashboards/shopflow-overview.json` (9 panels): request rate, error
rate, p50/p95/p99 latency, requests-by-status, top handlers, **DB query time
(p95)**, and **active orders**.

## Alerting

`prometheus/alerts.yml` — 3 rules: error rate > 5% for 2m, p99 latency > 1s
for 5m, service down for 1m.

## CI/CD pipeline (`.github/workflows/test.yml`)

12 jobs mapping to the PRD's 8 stages:

1. **Lint** — backend flake8 + **black**; frontend ESLint + **prettier**
   (advisory); **markdownlint** on docs (advisory).
2. **Unit tests** — pytest (70% coverage gate) + Vitest.
3. **Integration** — Postgres + Redis services, migrations, API tests.
4. **Security scan** — Trivy (images) + **Semgrep** (SAST) + **detect-secrets**
   (report-only, matching the repo's non-blocking-scan convention).
5. **Build & push** — on `main`, images pushed to GHCR tagged with the git SHA
   (`build-push` job).
6. **Staging deploy** — `deploy-staging` job, `environment: staging`.
7. **Smoke tests** — `scripts/smoke.sh` against the running stack.
8. **Prod deploy** — `deploy-production` job gated on the `production` GitHub
   Environment; enabling **Required reviewers** on that environment provides
   the manual-approval gate.

> Deploy jobs are documented placeholders — the free-tier target is a single
> compose host, so the real step is `ssh + docker compose pull && up -d` the
> SHA-tagged images. No staging/prod infra is provisioned (see the free-tier
> constraint in `docs/aws-free-tier.md`).

## Image sizes (multi-stage, non-root, HEALTHCHECK)

| Image | Size | < 200 MB? |
|---|---|---|
| frontend | **199 MB** | ✅ meets target |
| backend | **2.4 GB** | ❌ — inherent to the ML stack |

The backend bundles the ML inference stack (CPU torch ≈ 800 MB+,
sentence-transformers, lightgbm) in-process, so it can't hit < 200 MB while
those run co-located. It's already multi-stage, non-root, CPU-only torch, and
has a HEALTHCHECK. The path to < 200 MB is to split ML inference into a separate
service (or a serverless endpoint) so the API image carries no ML deps —
documented as future work.
