#!/usr/bin/env bash
# qa-smoke.sh — end-to-end smoke test of the Kontakti API in production.
#
# Reads QA credentials from .qa-token (gitignored). Hits every endpoint a
# real user touches when they: log in, open the People list, open a contact
# detail, open the Today inbox, run a duplicate scan, and load Companies /
# Discussions / Tasks / Notes / Activity.
#
# Exit code 0 = all green; non-zero = at least one endpoint regressed.
# Prints a green ✓ or red ✗ per endpoint with HTTP status. On a failure,
# prints the first 200 chars of the response body so you can diagnose.

set -u
cd "$(dirname "$0")"

if [ ! -f .qa-token ]; then
  echo "ERROR: .qa-token not found in $(pwd). Run the QA-token-mint flow first." >&2
  exit 2
fi

# shellcheck disable=SC1091
set -a; source .qa-token; set +a

if [ -z "${QA_TOKEN:-}" ] || [ -z "${QA_BASE_URL:-}" ]; then
  echo "ERROR: QA_TOKEN or QA_BASE_URL missing from .qa-token" >&2
  exit 2
fi

PASS=0
FAIL=0
FAILED_PATHS=()

# Pretty colors when stdout is a tty.
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; DIM='\033[2m'; CLR='\033[0m'
else
  GREEN=''; RED=''; DIM=''; CLR=''
fi

# Hit one endpoint, expect a 2xx (or one of the alt codes passed as arg 3).
# Usage: check METHOD PATH [expect_codes_regex]
check() {
  local method="$1"
  local path="$2"
  local expect="${3:-^(200|201|204)$}"

  local body_file status
  body_file=$(mktemp)
  status=$(curl -sS -o "$body_file" -w "%{http_code}" -X "$method" \
    "$QA_BASE_URL$path" \
    -H "Authorization: Bearer $QA_TOKEN" \
    -H "Accept: application/json")

  if [[ "$status" =~ $expect ]]; then
    printf "${GREEN}✓${CLR} %-5s %-55s ${DIM}%s${CLR}\n" "$method" "$path" "$status"
    PASS=$((PASS + 1))
  else
    printf "${RED}✗${CLR} %-5s %-55s ${RED}%s${CLR}\n" "$method" "$path" "$status"
    printf "  ${DIM}body: %s${CLR}\n" "$(head -c 200 "$body_file" | tr -d '\n')"
    FAIL=$((FAIL + 1))
    FAILED_PATHS+=("$method $path → $status")
  fi
  rm -f "$body_file"
}

echo "QA smoke against $QA_BASE_URL"
echo "────────────────────────────────────────────────────────────────────"

# ── Auth ────────────────────────────────────────────────────────────────
check GET  /api/v1/auth/me

# ── People list + one contact's full detail tree ────────────────────────
check GET  /api/v1/people
PERSON_ID=$(curl -sS "$QA_BASE_URL/api/v1/people" \
  -H "Authorization: Bearer $QA_TOKEN" -H "Accept: application/json" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); d=r.get('data',[]); print(d[0]['id'] if d else '')" 2>/dev/null)

if [ -n "$PERSON_ID" ]; then
  echo "  (sampling contact $PERSON_ID)"
  check GET  "/api/v1/people/$PERSON_ID"
  check GET  "/api/v1/people/$PERSON_ID/timeline"
  check GET  "/api/v1/people/$PERSON_ID/discussions"
  check GET  "/api/v1/people/$PERSON_ID/deals"
  check GET  "/api/v1/people/$PERSON_ID/notes"
  check GET  "/api/v1/people/$PERSON_ID/tasks"
  check GET  "/api/v1/people/$PERSON_ID/activity"
fi

# ── Today / Duplicates / Companies / Discussions / Notes / Tasks / Quiz
check GET  /api/v1/today
check GET  /api/v1/today?limit=20
check GET  /api/v1/duplicates
check GET  "/api/v1/duplicates?status=pending&page=1&per_page=50"
check GET  /api/v1/companies
check GET  /api/v1/discussions
check GET  /api/v1/notes
check GET  /api/v1/tasks
check GET  /api/v1/quiz/today
check GET  /api/v1/quiz/history
check GET  "/api/v1/quiz/history?person_id=$PERSON_ID"

# ── Search + activity feed
check GET  "/api/v1/search?q=ja"
check GET  /api/v1/feed

echo "────────────────────────────────────────────────────────────────────"
echo "PASS: $PASS    FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failed endpoints:"
  for p in "${FAILED_PATHS[@]}"; do echo "  $p"; done
  exit 1
fi
exit 0
