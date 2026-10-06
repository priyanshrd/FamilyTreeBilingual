#!/usr/bin/env bash
# Local stand-in for the Supabase API used by browser end-to-end checks:
#   Postgres (shim + all migrations, fresh database) + PostgREST on :3000 with the same RLS.
# Auth (GoTrue) is not run: the browser test signs its own JWT with E2E_JWT_SECRET.
# Requires: Postgres 15+ server reachable at PGTEST_URL and a postgrest binary (POSTGREST_BIN).
set -euo pipefail
base="${PGTEST_URL:-postgres://postgres@localhost:54329}"
db=familytree_e2e
secret="${E2E_JWT_SECRET:-local-e2e-secret-local-e2e-secret-0123456789}"
bin="${POSTGREST_BIN:-/opt/postgrest/postgrest}"

PGTEST_URL="$base" "$(dirname "$0")/../db-local-reset.sh" "$db"
psql "$base/$db" -qX -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001', 'family@example.com')
  on conflict do nothing;
SQL

pidfile=/tmp/postgrest-e2e.pid
if [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null; then
  for _ in $(seq 1 40); do curl -s localhost:3000 >/dev/null || break; sleep 0.25; done
fi
host_port="${base#postgres://postgres@}"
PGRST_DB_URI="postgres://authenticator:authenticator@${host_port}/$db" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$secret" \
PGRST_SERVER_PORT=3000 PGRST_DB_AGGREGATES_ENABLED=false \
  nohup "$bin" > /tmp/postgrest-e2e.log 2>&1 &
echo $! > "$pidfile"
for _ in $(seq 1 40); do curl -s localhost:3000 >/dev/null && { echo "postgrest up on :3000"; exit 0; }; sleep 0.25; done
echo "postgrest failed to start"; cat /tmp/postgrest-e2e.log; exit 1
