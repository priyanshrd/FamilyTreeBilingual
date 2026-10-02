// Test harness: creates a disposable database on a local plain-Postgres server, applies a small
// Supabase shim and every migration, and lets tests run statements as a given signed-in user.
//
// Requires a Postgres 15+ server. Set PGTEST_URL (default postgres://postgres@localhost:54329).
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SERVER_URL = process.env.PGTEST_URL ?? 'postgres://postgres@localhost:54329';

export type Db = {
  /** Runs `fn` in a transaction as superuser (bypasses RLS). */
  admin<T>(fn: (c: pg.ClientBase) => Promise<T>): Promise<T>;
  /** Runs `fn` in a transaction as `authenticated` with the given user id (RLS applies). */
  as<T>(userId: string | null, fn: (c: pg.ClientBase) => Promise<T>, headers?: Record<string, string>): Promise<T>;
  /** Creates an auth user and returns its id. */
  createUser(email?: string): Promise<string>;
  close(): Promise<void>;
};

function migrationFiles(): string[] {
  const dir = join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

export async function createTestDb(): Promise<Db> {
  const name = `ft_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const server = new pg.Client({ connectionString: `${SERVER_URL}/postgres` });
  try {
    await server.connect();
  } catch (e) {
    throw new Error(
      `Cannot reach test Postgres at ${SERVER_URL}. Start one (see supabase/tests/README.md) or set PGTEST_URL.`,
      { cause: e },
    );
  }
  await server.query(`create database ${name}`);
  await server.end();

  const client = new pg.Client({ connectionString: `${SERVER_URL}/${name}` });
  await client.connect();
  await client.query(readFileSync(join(ROOT, 'supabase', 'tests', 'support', 'supabase-shim.sql'), 'utf8'));
  for (const file of migrationFiles()) {
    try {
      await client.query('begin');
      await client.query(readFileSync(file, 'utf8'));
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw new Error(`Migration failed: ${file}: ${String(e)}`, { cause: e });
    }
  }

  async function tx<T>(setup: string[], fn: (c: pg.ClientBase) => Promise<T>): Promise<T> {
    await client.query('begin');
    try {
      for (const s of setup) await client.query(s);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    }
  }

  return {
    admin: (fn) => tx([], fn),
    as: (userId, fn, headers = {}) => {
      const claims = JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' });
      return tx(
        [
          `set local role ${userId ? 'authenticated' : 'anon'}`,
          `select set_config('request.jwt.claims', ${pg.escapeLiteral(claims)}, true)`,
          `select set_config('request.headers', ${pg.escapeLiteral(JSON.stringify(headers))}, true)`,
        ],
        fn,
      );
    },
    async createUser(email) {
      const id = randomUUID();
      await client.query('insert into auth.users (id, email) values ($1, $2)', [id, email ?? `${id}@test.local`]);
      return id;
    },
    async close() {
      await client.end();
      const s = new pg.Client({ connectionString: `${SERVER_URL}/postgres` });
      await s.connect();
      await s.query(`drop database if exists ${name} with (force)`);
      await s.end();
    },
  };
}

// ---------------------------------------------------------------------------
// Payload builders shared by tests
// ---------------------------------------------------------------------------
export function personPayload(en: string, extra: Record<string, unknown> = {}, mr?: string) {
  const forms: Record<string, unknown> = { en: { full_name: en, source: 'manual' } };
  if (mr) forms.mr = { full_name: mr, source: 'manual' };
  return { names: [{ name_type: 'primary', is_primary: true, forms }], ...extra };
}

export async function one<T = Record<string, unknown>>(c: pg.ClientBase, sql: string, params: unknown[] = []) {
  const r = await c.query(sql, params);
  return r.rows[0] as T;
}

export async function scalar<T = unknown>(c: pg.ClientBase, sql: string, params: unknown[] = []) {
  const r = await c.query(sql, params);
  const row = r.rows[0] as Record<string, unknown> | undefined;
  return (row ? Object.values(row)[0] : undefined) as T;
}
