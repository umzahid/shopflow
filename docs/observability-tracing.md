# Distributed Tracing — OpenTelemetry → Jaeger

Claims the PRD Domain-3 **+10 bonus** ("OTel tracing exported to Jaeger or
Grafana Tempo"). The backend is instrumented with OpenTelemetry; spans are
exported over OTLP/HTTP to a Jaeger all-in-one container and viewable in the
Jaeger UI.

## What's instrumented

- **FastAPI** (`opentelemetry-instrumentation-fastapi`) — one server span per
  request. `/health` and `/metrics` are excluded (probe/scrape noise).
- **SQLAlchemy** (`opentelemetry-instrumentation-sqlalchemy`) — each DB query is
  a child span, so a trace shows the request *and* the SQL it ran.
- **Log ↔ trace correlation** — the request-logging middleware stamps the
  existing per-request id (`X-Request-ID`, also the JSON log `traceId`) onto the
  active span as `shopflow.request_id`, so you can pivot from a log line to its
  trace in Jaeger.

## Configuration

Opt-in, off by default so local/unit runs need no collector
(`backend/app/core/config.py`):

| Setting | Default | Notes |
|---|---|---|
| `OTEL_ENABLED` | `false` | docker-compose sets it `true` for the backend service |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://jaeger:4318` | OTLP/HTTP base (exporter appends `/v1/traces`) |
| `OTEL_SERVICE_NAME` | `shopflow-backend` | shown as the service in Jaeger |

Setup lives in `backend/app/core/tracing.py`, called once at import time from
`main.py` (FastAPI instrumentation must add its middleware before the app
starts). It is a no-op when `OTEL_ENABLED` is false or when running under pytest,
so the test suite never touches a collector.

## Run it

```bash
docker compose up            # brings up the jaeger service alongside the stack
curl http://localhost:8000/api/v1/products     # generate some traffic
open http://localhost:16686                    # Jaeger UI → Service: shopflow-backend
```

Ports: Jaeger UI `16686`, OTLP/HTTP receiver `4318`.

## Verification (2026-07-13)

Brought the stack up, sent a request with a known id
(`-H "x-request-id: gap12-demo-req-001"`), and queried the Jaeger API:

```
$ curl -s localhost:16686/api/services
{"data":["jaeger-all-in-one","shopflow-backend"], ...}

# The trace for our request (11 spans):
operations: GET /api/v1/products/search  (server span)
            SELECT shopflow  ×2           (SQLAlchemy child spans)
            connect                        (DB connect)
tag on the server span: shopflow.request_id = gap12-demo-req-001
```

So a single request produces a visible trace whose FastAPI span has the SQL
queries as children, tagged with the same id that appears in the JSON logs —
meeting the bonus acceptance (a request produces a visible trace in Jaeger).

> **Note (dev only):** Jaeger all-in-one uses in-memory storage (traces are lost
> on restart) — fine for dev/demo. A production deployment would point the OTLP
> exporter at a persistent backend (Jaeger + Elasticsearch/Cassandra, or Grafana
> Tempo).
