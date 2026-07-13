#!/usr/bin/env bash
# OWASP ZAP scans against the local compose stack (Entry 32).
# Runs from the official ZAP Docker image — no host install, same pattern as
# the Playwright (e2e/) and k6 (perf/) suites. --network host so the container
# reaches the stack on the host's localhost.
#
#   security/zap-scan.sh api        # zap-api-scan.py against /openapi.json
#   security/zap-scan.sh frontend   # zap-baseline.py against localhost:3000
#   security/zap-scan.sh authed     # api-scan with a Bearer token per role,
#                                   #   exercising /merchant/* and /admin/*
#
# Reports land in security/reports/ (gitignored). Triage lives in
# docs/zap-findings.md. Exit code is informational only (-I): findings are
# triaged in the doc, not used as a hard gate.
#
# AUTHORIZATION: local-only scanning of our own dev stack. Never point this
# at anything you don't own.
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:?usage: security/zap-scan.sh <api|frontend|authed>}"
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
  authed)
    # Authenticated active scan of the merchant + admin surface. The API is
    # JWT-bearer auth, so we log in per role and inject the token via ZAP's
    # replacer rule (adds `Authorization: Bearer <token>` to every request).
    # require_role() is exact-match — admin is NOT a merchant superuser — so
    # each surface is scanned with the token that authorizes it.
    API="http://localhost:8000/api/v1"
    BACKEND="${ZAP_BACKEND_CONTAINER:-shopflow-backend-1}"
    export ZAP_ADMIN_EMAIL="zap-scan-admin@e.com"
    export ZAP_ADMIN_PASSWORD="Zap-Sc4n-Admin!123"  # pragma: allowlist secret — local scan-only dummy

    echo ">> bringing backend up with the scan overlay (rate-limit relief + long JWT TTL)"
    docker compose -f docker-compose.yml -f docker-compose.override.yml \
      -f security/docker-compose.scan.yml up -d backend
    # Wait for health before seeding/logging in (cwd is the repo root — see cd above).
    scripts/wait-for-health.sh http://localhost:8000/health 60 backend

    echo ">> provisioning the scan admin (out-of-band; admin is not self-registerable)"
    docker cp security/seed_scan_admin.py "$BACKEND:/app/security_seed_scan_admin.py"
    docker exec -e PYTHONPATH=/app \
      -e ZAP_ADMIN_EMAIL="$ZAP_ADMIN_EMAIL" -e ZAP_ADMIN_PASSWORD="$ZAP_ADMIN_PASSWORD" \
      "$BACKEND" python /app/security_seed_scan_admin.py

    jwt() { python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"; }

    echo ">> logging in (admin) + registering a merchant"
    ADMIN_TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$ZAP_ADMIN_EMAIL\",\"password\":\"$ZAP_ADMIN_PASSWORD\"}" | jwt)
    MERCH_EMAIL="zap-merch-${STAMP}@e.com"
    MERCH_TOKEN=$(curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$MERCH_EMAIL\",\"password\":\"Zap-Sc4n-Merch!123\",\"role\":\"merchant\"}" | jwt)
    [ -n "$ADMIN_TOKEN" ] && [ -n "$MERCH_TOKEN" ] || { echo "!! token acquisition failed" >&2; exit 1; }

    scan_as() {
      local role="$1" token="$2"
      # Auth is injected by a hook (security/zap_auth_hook.py) reading ZAP_BEARER,
      # not via -z: the -z string is space-delimited and mangles "Bearer <token>".
      echo ">> authenticated api-scan as ${role}"
      docker run --rm --network host \
        -e ZAP_BEARER="$token" \
        -v "$PWD/security/reports:/zap/wrk:rw" \
        -v "$PWD/security/zap_auth_hook.py:/zap/auth_hook.py:ro" \
        "$IMAGE" zap-api-scan.py \
        -t http://localhost:8000/openapi.json -f openapi \
        -r "authed-${role}-${STAMP}.html" -J "authed-${role}-${STAMP}.json" -I \
        --hook=/zap/auth_hook.py \
        || echo "   (${role} scan exited non-zero — findings still triaged from the report)"
    }

    scan_as merchant "$MERCH_TOKEN"
    scan_as admin "$ADMIN_TOKEN"

    echo ">> restoring stock backend (real rate limit + 15-min JWT)"
    docker compose up -d backend
    ;;
  *)
    echo "unknown target: $TARGET (expected api|frontend|authed)" >&2
    exit 1
    ;;
esac

echo "reports: security/reports/*-${STAMP}.*"
