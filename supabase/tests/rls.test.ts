import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, personPayload, scalar, type Db } from './support/db';

let db: Db;
let owner: string;
let viewer: string;
let editor: string;
let outsider: string;
let fid: string;
let personId: string;

beforeAll(async () => {
  db = await createTestDb();
  owner = await db.createUser();
  viewer = await db.createUser();
  editor = await db.createUser();
  outsider = await db.createUser();
  fid = await db.as(owner, (c) => scalar<string>(c, `select public.create_family('{"en":{"v":"Dhotar","src":"manual"}}')`));
  await db.admin(async (c) => {
    await c.query(`insert into family_members (family_id, user_id, role) values ($1, $2, 'viewer'), ($1, $3, 'editor')`, [
      fid,
      viewer,
      editor,
    ]);
  });
  personId = await db.as(owner, (c) => scalar<string>(c, 'select public.create_person($1, $2)', [fid, personPayload('Rajiv')]));
});
afterAll(async () => {
  await db?.close();
});

const count = (userId: string | null, table: string) =>
  db.as(userId, (c) => scalar<number>(c, `select count(*)::int from public.${table}`));

describe('row visibility', () => {
  it('members see their family; outsiders see nothing', async () => {
    for (const table of ['families', 'persons', 'person_names', 'person_name_forms', 'family_members', 'audit_log']) {
      expect(await count(viewer, table), table).toBeGreaterThan(0);
      expect(await count(outsider, table), table).toBe(0);
    }
  });

  it('anon has no access at all', async () => {
    await expect(count(null, 'persons')).rejects.toThrow(/permission denied/);
    await expect(count(null, 'families')).rejects.toThrow(/permission denied/);
  });

  it('languages are readable by any signed-in user', async () => {
    expect(await count(outsider, 'languages')).toBe(2);
  });
});

describe('write permissions', () => {
  it('viewers cannot write', async () => {
    await expect(db.as(viewer, (c) => c.query('select public.create_person($1, $2)', [fid, personPayload('X')]))).rejects.toThrow(
      /editor access/,
    );
    await expect(db.as(viewer, (c) => c.query(`insert into persons (family_id) values ($1)`, [fid]))).rejects.toThrow(
      /row-level security/,
    );
    const updated = await db.as(viewer, async (c) => (await c.query(`update persons set gender = 'male' where id = $1`, [personId])).rowCount);
    expect(updated).toBe(0);
  });

  it('editors can write', async () => {
    const id = await db.as(editor, (c) => scalar<string>(c, 'select public.create_person($1, $2)', [fid, personPayload('Editor-made')]));
    expect(id).toBeTruthy();
    const updated = await db.as(editor, async (c) => (await c.query(`update persons set gender = 'male' where id = $1`, [id])).rowCount);
    expect(updated).toBe(1);
  });

  it('outsiders cannot write into a family', async () => {
    await expect(db.as(outsider, (c) => c.query('select public.create_person($1, $2)', [fid, personPayload('X')]))).rejects.toThrow(
      /editor access/,
    );
    await expect(
      db.as(outsider, (c) => c.query(`select public.add_relative($1, 'child', $2)`, [personId, personPayload('X')])),
    ).rejects.toThrow(/not found/);
  });

  it('nobody can hard-delete people, or truncate', async () => {
    await expect(db.as(owner, (c) => c.query('delete from persons where id = $1', [personId]))).rejects.toThrow(/permission denied/);
    await expect(db.as(owner, (c) => c.query('truncate persons cascade'))).rejects.toThrow(/permission denied/);
  });

  it('only the security-definer trigger writes the audit log', async () => {
    await expect(
      db.as(owner, (c) =>
        c.query(`insert into audit_log (family_id, table_name, row_key, action) values ($1, 'x', '{}', 'insert')`, [fid]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('membership cannot be changed through the API', async () => {
    await expect(
      db.as(outsider, (c) => c.query(`insert into family_members (family_id, user_id, role) values ($1, $2, 'owner')`, [fid, outsider])),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as(editor, (c) => c.query(`update family_members set role = 'owner' where user_id = $1`, [editor]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('only owners can rename the family', async () => {
    const rename = (u: string) =>
      db.as(u, async (c) => (await c.query(`update families set name = '{"en":{"v":"New","src":"manual"}}' where id = $1`, [fid])).rowCount);
    expect(await rename(editor)).toBe(0);
    expect(await rename(owner)).toBe(1);
  });

  it('internal helpers are not reachable by anon', async () => {
    await expect(db.as(null, (c) => c.query(`select private.has_family_role($1, 'viewer')`, [fid]))).rejects.toThrow(/permission denied/);
  });
});

describe('storage policies', () => {
  const path = () => `${fid}/people/${personId}/photo.jpg`;

  it('editors upload to their family folder; viewers cannot', async () => {
    await db.as(editor, (c) => c.query(`insert into storage.objects (bucket_id, name) values ('family-media', $1)`, [path()]));
    await expect(
      db.as(viewer, (c) => c.query(`insert into storage.objects (bucket_id, name) values ('family-media', $1)`, [`${fid}/x.jpg`])),
    ).rejects.toThrow(/row-level security/);
  });

  it('members read, outsiders do not', async () => {
    const read = (u: string) => db.as(u, (c) => scalar<number>(c, `select count(*)::int from storage.objects where name = $1`, [path()]));
    expect(await read(viewer)).toBe(1);
    expect(await read(outsider)).toBe(0);
  });

  it('rejects uploads outside a family folder or into another family', async () => {
    const otherFamily = await db.as(outsider, (c) => scalar<string>(c, `select public.create_family('{"en":{"v":"O","src":"manual"}}')`));
    for (const name of ['not-a-uuid/x.jpg', 'x.jpg', `${otherFamily}/x.jpg`]) {
      await expect(
        db.as(editor, (c) => c.query(`insert into storage.objects (bucket_id, name) values ('family-media', $1)`, [name])),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it('only owners can delete binaries', async () => {
    const del = (u: string) =>
      db.as(u, async (c) => (await c.query(`delete from storage.objects where name = $1`, [path()])).rowCount);
    expect(await del(editor)).toBe(0);
    expect(await del(owner)).toBe(1);
  });
});
