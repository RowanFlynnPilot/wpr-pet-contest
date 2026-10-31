#!/usr/bin/env bash
# The live tally (0025) under load: setup, then a minute of concurrent
# checkouts with their webhooks, refunds, free votes and page polls, then the
# check. Fails on any pgbench error (a deadlock included) or any drift.
#
#   bash supabase/loadtest/run.sh                      # the local stack
#   DB_URL=postgresql://... CLIENTS=24 DURATION=60 bash supabase/loadtest/run.sh
#
# Writes votes: a scratch database only, never production.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CLIENTS="${CLIENTS:-24}"
DURATION="${DURATION:-60}"
PGBENCH="$(command -v pgbench || ls /usr/lib/postgresql/*/bin/pgbench 2>/dev/null | sort -V | tail -1)"
OUT="$(mktemp)"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/setup.sql"

# Weights: paid packs 6, refunds 1, free votes 2, page polls 11.
set +e
"$PGBENCH" "$DB_URL" -n -c "$CLIENTS" -j 4 -T "$DURATION" -P 10 -r \
  -f "$HERE/write.sql@6" -f "$HERE/refund.sql@1" -f "$HERE/free.sql@2" -f "$HERE/read.sql@11" 2>&1 | tee "$OUT"
status=${PIPESTATUS[0]}
set -e

failed=0
if [ "$status" -ne 0 ] || grep -Eqi 'number of failed transactions: [1-9]|aborted|deadlock|error' "$OUT"; then
  echo "pgbench reported errors (exit $status)" >&2
  failed=1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$HERE/check.sql" | tee -a "$OUT" || failed=1

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Live tally under load"
    echo
    echo "$CLIENTS clients for $DURATION seconds: paid packs with their webhooks, refunds, free votes and page polls."
    echo
    echo '```'
    grep -E 'tps =|latency average|number of (transactions|failed)|paid_packs|free_votes|drifted_rows|Execution Time|^ +[0-9]' "$OUT" | head -40
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

rm -f "$OUT"
exit "$failed"
