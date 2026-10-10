#!/usr/bin/env bash
# Rebuilds the local staging database from scratch: Supabase stub + every migration, in order.
# Usage: supabase/tests/reset-staging.sh   (needs a local Postgres listening on PGSTAGE_HOST:PGSTAGE_PORT)
set -euo pipefail
HOST="${PGSTAGE_HOST:-/var/lib/postgresql/mwstage}"
PORT="${PGSTAGE_PORT:-54329}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists mw_staging with (force)" -c "create database mw_staging"
"${PSQL[@]}" -d mw_staging -f "$DIR/tests/00_supabase_stub.sql"
for f in "$DIR"/migrations/*.sql; do
  "${PSQL[@]}" -d mw_staging -f "$f" || { echo "FAILED: $f"; exit 1; }
done
echo "staging rebuilt: $(ls "$DIR"/migrations/*.sql | wc -l) migrations applied"
