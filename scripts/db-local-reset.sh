#!/usr/bin/env bash
# Recreates a scratch database on a local plain-Postgres server and applies the
# Supabase shim + all migrations. Used for fast feedback while writing SQL.
# Usage: PGTEST_URL=postgres://postgres@localhost:54329 scripts/db-local-reset.sh [dbname]
set -euo pipefail
base="${PGTEST_URL:-postgres://postgres@localhost:54329}"
db="${1:-familytree_dev}"
psql "$base/postgres" -qX -v ON_ERROR_STOP=1 -c "drop database if exists $db with (force)" -c "create database $db"
psql "$base/$db" -qX -v ON_ERROR_STOP=1 -f supabase/tests/support/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  psql "$base/$db" -qX -v ON_ERROR_STOP=1 -1 -f "$f" || { echo "FAILED: $f"; exit 1; }
done
echo "ok: $db"
