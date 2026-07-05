#!/usr/bin/env bash
# OWASP ZAP scans against the local compose stack (Entry 32).
# Runs from the official ZAP Docker image — no host install, same pattern as
# the Playwright (e2e/) and k6 (perf/) suites. --network host so the container
# reaches the stack on the host's localhost.
#
#   security/zap-scan.sh api        # zap-api-scan.py against /openapi.json
#   security/zap-scan.sh frontend   # zap-baseline.py against localhost:3000
#
# Reports land in security/reports/ (gitignored). Triage lives in
# docs/zap-findings.md. Exit code is informational only (-I): findings are
# triaged in the doc, not used as a hard gate.
#
# AUTHORIZATION: local-only scanning of our own dev stack. Never point this
# at anything you don't own.
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:?usage: security/zap-scan.sh <api|frontend>}"
mkdir -p security/reports

IMAGE="ghcr.io/zaproxy/zaproxy:stable"
STAMP=$(date +%Y%m%d-%H%M%S)

case "$TARGET" in
  api)
    # API-aware scan: imports the OpenAPI spec so every route is exercised
    # (a plain spider sees only /docs). Unauthenticated by design — the
    # authenticated attack surface is future work, see docs/zap-findings.md.
    docker run --rm --network host \
      -v "$PWD/security/reports:/zap/wrk:rw" \
      "$IMAGE" zap-api-scan.py \
      -t http://localhost:8000/openapi.json -f openapi \
      -r "api-scan-${STAMP}.html" -J "api-scan-${STAMP}.json" -I
    ;;
  frontend)
    docker run --rm --network host \
      -v "$PWD/security/reports:/zap/wrk:rw" \
      "$IMAGE" zap-baseline.py \
      -t http://localhost:3000 \
      -r "frontend-baseline-${STAMP}.html" -J "frontend-baseline-${STAMP}.json" -I
    ;;
  *)
    echo "unknown target: $TARGET (expected api|frontend)" >&2
    exit 1
    ;;
esac

echo "reports: security/reports/*-${STAMP}.*"
