# Local end-to-end stack

`start-stack.sh` creates a fresh database (Supabase shim + all migrations) on a local Postgres and
starts PostgREST on :3000 with the same RLS as production. `jwt.mjs` signs the JWT that a browser
test hands to PostgREST in place of Supabase Auth. A browser test then routes
`https://<project>.supabase.co/rest/v1/*` to `http://localhost:3000/*` and stubs `/auth/v1/token`.

Requires a Postgres 15+ server (`PGTEST_URL`) and a PostgREST v12 binary (`POSTGREST_BIN`).
