#!/usr/bin/env bash
# Run a k6 scenario from Docker (no host k6/node needed — same pattern as e2e).
#
#   perf/run.sh smoke              # safe against the stock stack
#   perf/run.sh load               # REQUIRES the perf overlay first, see below
#   perf/run.sh load --vus 5 ...   # extra args pass through to `k6 run`
#
# Load runs need the rate-limit overlay (100/min per IP otherwise):
#   docker compose -f docker-compose.yml -f docker-compose.override.yml \
#     -f perf/docker-compose.perf.yml up -d backend
# and afterwards restore:  docker compose up -d backend
set -euo pipefail

cd "$(dirname "$0")/.."

SCENARIO="${1:?usage: perf/run.sh <smoke|load> [k6 args...]}"
shift

[ -f "perf/k6/${SCENARIO}.js" ] || { echo "unknown scenario: ${SCENARIO}" >&2; exit 1; }

mkdir -p perf/results
RUN_NAME="${SCENARIO}-$(date +%Y%m%d-%H%M%S)"

# --network host: k6 must reach the compose ports on the host's localhost,
# same reason the Playwright image runs this way (see e2e/README.md).
docker run --rm --network host \
  -v "$PWD/perf/k6:/scripts:ro" \
  -v "$PWD/perf/results:/results" \
  -e K6_RESULTS_DIR=/results \
  -e K6_RUN_NAME="$RUN_NAME" \
  grafana/k6:latest run "/scripts/${SCENARIO}.js" "$@"

echo "JSON summary: perf/results/${RUN_NAME}.json"
