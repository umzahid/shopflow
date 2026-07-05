# Performance tests (k6)

k6 scenarios against the compose stack (`http://localhost:8000`). Runs from
the official `grafana/k6` Docker image — no host k6/node needed, same pattern
as the Playwright suite in `e2e/`.

## Layout

```
perf/
  k6/
    smoke.js                 # 1 VU / 60s — hot-path correctness + relaxed SLOs
    load.js                  # ~4.5 min mixed browse+shop load (needs overlay)
    lib/api.js               # API-arrange helpers, seeded catalog, search terms
    lib/summary.js           # shared end-of-test summary (stdout + JSON export)
  docker-compose.perf.yml    # rate-limit override overlay for load runs ONLY
  run.sh                     # Dockerized runner; writes perf/results/<run>.json
  results/                   # gitignored run outputs
```

## The rate-limit constraint (read first)

The API rate-limits at `RATE_LIMIT_PUBLIC=100/minute` **per client IP**
(slowapi, keyed by `get_remote_address`). Every k6 VU makes requests from the
same host IP, so any real load profile blows through the limit in seconds and
everything after is a 429 — measuring the rate limiter, not the app.

- **`smoke.js` respects the stock limit**: 1 VU, 8 requests/iteration, 5s
  pacing sleep ≈ 75 req/min. Run it against the untouched stack.
- **`load.js` requires the overlay** that raises the limit for the run:

```bash
# before the load run
docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f perf/docker-compose.perf.yml up -d backend

./perf/run.sh load

# after — restore the real limit
docker compose up -d backend
```

Never deploy with the overlay values; the 429 wall under stock settings is the
rate limiter working as designed.

## Running

```bash
docker compose up -d          # stack must be up and healthy
./perf/run.sh smoke           # safe anytime
./perf/run.sh load            # only with the overlay (above)
./perf/run.sh load --vus 5    # extra args pass through to `k6 run`
```

Each run prints the summary table and writes the full JSON to
`perf/results/<scenario>-<timestamp>.json`.

## Scenarios

### smoke — is every hot path healthy?

1 VU, 60s. Per iteration: `/health`, product list, product detail, all three
search modes, login, cart read. Thresholds: 100% checks, <1% errors, per-path
p95 budgets (health 200ms, list/detail 400ms, lexical 500ms,
semantic/hybrid 1500ms, login 1000ms).

### load — mixed traffic, ~4.5 min

| Scenario | Who | VUs | Behavior |
|---|---|---|---|
| `browse` | anonymous | 0→15, hold, push to 25, down | list → detail → search (rotating mode/term) |
| `shop` | 10 pre-registered shoppers | 0→5, hold, down | cart add → 30% proceed to checkout |

`setup()` seeds a merchant, a 12-product catalog (deep stock so checkout never
exhausts it), and the shopper pool through the API — arrange via API, measure
only the traffic under test. Every checkout exercises live LightGBM fraud
scoring; `orders_placed` / `orders_flagged_for_review` counters track it.

Thresholds are **draft SLOs for a dev laptop** (single uvicorn worker under
compose), not production numbers: <1% errors, list p95<600ms, detail <500ms,
lexical <800ms, semantic/hybrid <2500ms, cart add <800ms, checkout <3000ms.

## Interpreting results

- **Semantic/hybrid search degrade first** under load: each request encodes
  the query with MiniLM in-process (CPU-bound), so latency scales with core
  contention, not I/O. Lexical stays flat (Postgres tsvector).
- **First encode after boot is a cold load**: the initial product create /
  semantic query pulls the sentence-transformers model into memory (~10s
  observed). Warm up before measuring, or the outlier lands in your p-values.
- **Login cost is intentional**: bcrypt's work factor (~330ms observed) is a
  security control, not a perf bug. Don't "fix" it; capacity-plan around it.
- **429s in a load run** mean the overlay isn't active — see above.
