# Family Tree · कुटुंबवृक्ष

A bilingual (English / Marathi) family genealogy web app. The database is the source of truth.
The tree view is a projection of it. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Stack: Vite + React + TypeScript + Tailwind, React Flow, Supabase (Postgres, Auth, Storage, RLS).

## Local development

```bash
pnpm install
cp .env.example .env.local      # then set VITE_FAMILY_LOGIN_EMAIL
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app |
| `pnpm build` | Typecheck + production build |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | Unit tests (domain logic) |
| `pnpm test:db` | Database tests: migrations, integrity rules, RLS, storage policies, RPCs |

### Database tests

`pnpm test:db` creates a throwaway database on a local Postgres 15+ server, applies a small
Supabase shim (`supabase/tests/support/supabase-shim.sql`) plus every migration, runs the
tests, and drops the database. Point it at a server with `PGTEST_URL`
(default `postgres://postgres@localhost:54329`). One way to start one:

```bash
# Debian/Ubuntu with the postgresql package installed
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D /tmp/pgtest -U postgres --auth=trust
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgtest -o "-p 54329 -c listen_addresses=localhost" -l /tmp/pgtest.log start
```

`scripts/db-local-reset.sh` applies everything to a scratch database for quick manual poking.

## Supabase project setup (one time)

### 1. Apply migrations

**Easiest:** open [`supabase/dist/all-migrations.sql`](supabase/dist/all-migrations.sql), copy all of it,
and paste it into Dashboard → **SQL Editor → New query → Run**. It runs as one transaction and
records each migration, so the CLI won't re-apply them later. Run it once on an empty project.
(Regenerate it after changing migrations: `scripts/bundle-migrations.sh`.)

**Or with the CLI**, from a machine that can reach Supabase:

```bash
npx supabase login                                   # opens a browser, or set SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref hbpguqvcyebidnvjvxzy # asks for the database password
npx supabase db push                                 # applies supabase/migrations/*
pnpm db:types                                        # regenerates src/types/database.types.ts
```

### 2. Shared family login

The app has no per-person accounts. Everyone signs in to one shared account with a password.

1. Dashboard → **Authentication → Users → Add user → Create new user**. Use any email
   (e.g. `family@<your-domain>`), choose a strong password, and tick **Auto Confirm User**.
2. Dashboard → **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
3. Put that email in `VITE_FAMILY_LOGIN_EMAIL`. The email is not a secret; the password is.

Even if another account were created, membership-based RLS would give it access to nothing.

### 3. Hosting on Vercel

Import the GitHub repo in Vercel. `vercel.json` already sets the framework (Vite), the pnpm
build, SPA routing (all paths serve `index.html`) and long-term caching for hashed assets.
In **Project → Settings → Environment Variables**, add `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_FAMILY_LOGIN_EMAIL`. Then, in Supabase
**Authentication → URL Configuration**, set the Site URL to the Vercel domain.

### Keys

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public by design and ship in the
browser bundle. Never put the database password, the `service_role`/secret key, or an access
token in the repo or in `VITE_*` variables.
