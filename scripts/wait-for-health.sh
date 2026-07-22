#!/usr/bin/env bash
# Poll an HTTP endpoint until it returns success, or exit non-zero after a
# timeout. Shared by the CI workflows and the ZAP / LocalStack scripts so the
# "wait for the stack to come up" logic lives in one place.
#
#   scripts/wait-for-health.sh <url> [timeout_seconds] [label]
set -euo pipefail

URL="${1:?usage: wait-for-health.sh <url> [timeout_seconds] [label]}"
TIMEOUT="${2:-90}"
LABEL="${3:-$URL}"

echo ">> waiting for ${LABEL} (up to ${TIMEOUT}s)"
deadline=$(( $(date +%s) + TIMEOUT ))
until curl -sf "$URL" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "!! ${LABEL} not healthy after ${TIMEOUT}s" >&2
    exit 1
  fi
  sleep 2
done
echo ">> ${LABEL} healthy"
