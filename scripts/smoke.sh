#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ShopFlow API smoke tests
#
# Post-deploy sanity check — hits the critical paths (health, docs, auth
# register/login/refresh/logout, RFC 7807 error shapes, security headers) and
# exits non-zero on any failure. Runs locally against `docker compose up` and
# in the CI pipeline's "smoke" stage.
#
# Usage:
#   ./scripts/smoke.sh                       # defaults to http://localhost:8000
#   BASE_URL=http://staging.example.com \
#     ./scripts/smoke.sh                     # against another environment
#
# Requires: curl, bash 4+.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
API="$BASE_URL/api/v1"
COOK_DIR="$(mktemp -d)"
trap 'rm -rf "$COOK_DIR"' EXIT

PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -qE "$expected"; then
    printf "  \033[32m✅ PASS\033[0m | %s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  \033[31m❌ FAIL\033[0m | %s\n" "$name"
    printf "     expected: %s\n" "$expected"
    printf "     got:      %s\n" "$(echo "$actual" | cut -c1-200)"
    FAIL=$((FAIL+1))
  fi
}

# Randomize the email so re-runs on the same DB don't collide with the
# duplicate-email check further down.
EMAIL="smoke-$(date +%s)-$RANDOM@test.io"

echo "=== Infrastructure ==="
check "Health endpoint"          "ok"      "$(curl -sf "$BASE_URL/health")"
check "Swagger docs"              "200"     "$(curl -so /dev/null -w '%{http_code}' "$BASE_URL/docs")"
check "OpenAPI JSON"              "openapi" "$(curl -sf "$BASE_URL/openapi.json" | head -c 100)"
check "Prometheus /metrics"       "200"     "$(curl -so /dev/null -w '%{http_code}' "$BASE_URL/metrics")"

echo "=== Security Headers ==="
HDRS=$(curl -sI -X GET "$BASE_URL/health")
check "X-Content-Type-Options" "nosniff" "$HDRS"
check "X-Frame-Options"        "DENY"    "$HDRS"
check "X-XSS-Protection"       "1"       "$HDRS"

echo "=== Auth: Register ==="
R=$(curl -s -c "$COOK_DIR/c1.txt" -o "$COOK_DIR/r.json" -w "%{http_code}" \
  -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Password123\",\"role\":\"customer\"}")
BODY=$(cat "$COOK_DIR/r.json")
check "Register → 201"            "201"          "$R"
check "Returns access_token"      "access_token" "$BODY"
if echo "$BODY" | grep -q password_hash; then
  printf "  \033[31m❌ FAIL\033[0m | password_hash leaked in register response\n"
  FAIL=$((FAIL+1))
else
  printf "  \033[32m✅ PASS\033[0m | No password_hash in register response\n"
  PASS=$((PASS+1))
fi

echo "=== Auth: Login ==="
R=$(curl -s -c "$COOK_DIR/c2.txt" -o "$COOK_DIR/r.json" -w "%{http_code}" \
  -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Password123\"}")
check "Login → 200"               "200"          "$R"
check "Login returns token"       "access_token" "$(cat "$COOK_DIR/r.json")"

echo "=== Auth: Error Cases (RFC 7807) ==="
R=$(curl -s -o "$COOK_DIR/r.json" -w "%{http_code}" \
  -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Password123\"}")
check "Duplicate email → 409"     "409"  "$R"
check "409 body has 'type' field" "type" "$(cat "$COOK_DIR/r.json")"

R=$(curl -s -o "$COOK_DIR/r.json" -w "%{http_code}" \
  -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpass\"}")
check "Wrong password → 401"      "401"                "$R"
check "No user enumeration"       "Invalid credentials" "$(cat "$COOK_DIR/r.json")"

echo "=== Auth: Refresh & Logout ==="
R=$(curl -s -b "$COOK_DIR/c2.txt" -c "$COOK_DIR/c2.txt" -o "$COOK_DIR/r.json" \
  -w "%{http_code}" -X POST "$API/auth/refresh")
check "Refresh → 200"             "200"          "$R"
check "Refresh issues new token"  "access_token" "$(cat "$COOK_DIR/r.json")"

R=$(curl -s -b "$COOK_DIR/c2.txt" -o "$COOK_DIR/r.json" \
  -w "%{http_code}" -X DELETE "$API/auth/logout")
check "Logout → 204"                          "204" "$R"

R=$(curl -s -b "$COOK_DIR/c2.txt" -o "$COOK_DIR/r.json" \
  -w "%{http_code}" -X POST "$API/auth/refresh")
check "Refresh after logout → 401"            "401" "$R"

echo ""
echo "══════════════════════════════════════════════════════"
printf "TOTAL: %d  |  \033[32m✅ %d passed\033[0m  |  \033[31m❌ %d failed\033[0m\n" \
  $((PASS+FAIL)) "$PASS" "$FAIL"
echo "══════════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ]
