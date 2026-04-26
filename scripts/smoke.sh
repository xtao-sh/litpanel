#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8050}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3050}"
BACKEND_URL="http://$BACKEND_HOST:$BACKEND_PORT"
FRONTEND_URL="http://$FRONTEND_HOST:$FRONTEND_PORT"
CHECK_FRONTEND=1

if [[ "${1:-}" == "--backend-only" ]]; then
  CHECK_FRONTEND=0
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

require_command curl
require_command python3

health_response="$(curl -fsS "$BACKEND_URL/api/health")" || fail "Backend health check failed at $BACKEND_URL/api/health"

python3 - "$health_response" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("status") != "ok":
    raise SystemExit("backend status is not ok")
if not payload.get("db_exists"):
    raise SystemExit("database is missing")
print(payload.get("app_name", "backend"))
PY
pass "Backend health endpoint responded"

graphql_payload='{"query":"query Smoke { stats { totalPapers totalCards totalAtoms totalIdeas } yearDistribution { year count } gapAnalysis(limit: 3) { bridgeAtoms { slug title type fieldCount paperCount } weakConnections { fieldA fieldB sharedAtomCount } totalOrphanAtoms } trendingTopics(window: 3, limit: 3) { name category recentCount historicalAvg growthRate trend } }"}'
graphql_response="$(curl -fsS -X POST "$BACKEND_URL/graphql" -H 'Content-Type: application/json' --data "$graphql_payload")" \
  || fail "GraphQL smoke query failed at $BACKEND_URL/graphql"

python3 - "$graphql_response" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
errors = payload.get("errors")
if errors:
    raise SystemExit(f"graphql returned errors: {errors}")

data = payload.get("data") or {}
stats = data.get("stats") or {}
years = data.get("yearDistribution") or []
gaps = (data.get("gapAnalysis") or {}).get("bridgeAtoms") or []
trending = data.get("trendingTopics") or []

required_stats = ["totalPapers", "totalCards", "totalAtoms", "totalIdeas"]
missing = [field for field in required_stats if stats.get(field) is None]
if missing:
    raise SystemExit(f"stats missing fields: {missing}")
if not years:
    raise SystemExit("yearDistribution is empty")
if not trending:
    raise SystemExit("trendingTopics is empty")

print(json.dumps({
    "totalPapers": stats["totalPapers"],
    "latestYear": max(item["year"] for item in years),
    "gapCount": len(gaps),
    "trendingCount": len(trending),
}, ensure_ascii=True))
PY
pass "GraphQL smoke query returned dashboard data"

if [[ "$CHECK_FRONTEND" -eq 1 ]]; then
  frontend_status="$(curl -sS -o /dev/null -w '%{http_code}' "$FRONTEND_URL")" \
    || fail "Frontend request failed at $FRONTEND_URL"
  if [[ "$frontend_status" != "200" ]]; then
    fail "Frontend returned HTTP $frontend_status at $FRONTEND_URL"
  fi
  pass "Frontend responded with HTTP 200"
fi

printf '\nSmoke check complete.\n'
printf 'Backend:  %s\n' "$BACKEND_URL"
if [[ "$CHECK_FRONTEND" -eq 1 ]]; then
  printf 'Frontend: %s\n' "$FRONTEND_URL"
fi
