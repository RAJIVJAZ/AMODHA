#!/usr/bin/env bash
# Rebuilds local staging and runs every acceptance test file in order. Stops at the first failure.
set -euo pipefail
HOST="${PGSTAGE_HOST:-/var/lib/postgresql/mwstage}"
PORT="${PGSTAGE_PORT:-54329}"
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/reset-staging.sh"
for f in "$DIR"/01_test_helpers.sql "$DIR"/[2-9]*_*.sql; do
  echo "== $(basename "$f")"
  psql -h "$HOST" -p "$PORT" -U postgres -d mw_staging -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | sed -n 's/^psql:[^ ]* NOTICE:  //p; /ERROR/p; /FAIL/p'
  test "${PIPESTATUS[0]}" -eq 0 || { echo "TESTS FAILED in $(basename "$f")"; exit 1; }
done
echo "ALL TESTS PASSED"
