import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createTestDb, personPayload, scalar, type Db } from './support/db';

let db: Db;
let owner: string;
let fid: string;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  owner = await db.createUser();
  fid = await db.as(owner, (c) => scalar<string>(c, `select public.create_family('{"en":{"v":"Dhotar","src":"manual"}}')`));
});

/** Runs fn as the owner, tagged with a new operation id (as the app does); returns the id. */
async function op(fn: (c: pg.ClientBase) => Promise<unknown>) {
  const id = randomUUID();
  await db.as(owner, fn, { 'x-operation-id': id });
  return id;
}
const undo = (id: string) => db.as(owner, (c) => c.query('select public.undo_operation($1)', [id]));
const live = (table: string, id: string) =>
  db.admin((c) => scalar<boolean>(c, `select deleted_at is null from public.${table} where id = $1`, [id]));
const nameOf = (person: string) =>
  db.admin((c) =>
    scalar<string>(
      c,
      `select f.full_name from person_names n join person_name_forms f on f.name_id = n.id
       where n.person_id = $1 and n.is_primary and n.deleted_at is null and f.lang = 'en'`,
      [person],
    ),
  );

async function createPerson(name: string) {
  let id = '';
  await op(async (c) => {
    id = await scalar<string>(c, 'select public.create_person($1, $2)', [fid, personPayload(name)]);
  });
  return id;
}

describe('undo_operation', () => {
  it('undoes adding a relative: the person, the link and the family unit go away', async () => {
    const rajiv = await createPerson('Rajiv');
    let res: { person_id: string; union_id: string } = { person_id: '', union_id: '' };
    const added = await op(async (c) => {
      res = await scalar(c, 'select public.add_relative($1, $2, $3, $4)', [rajiv, 'child', personPayload('Amit'), {}]);
    });
    expect(await live('persons', res.person_id)).toBe(true);
    await undo(added);
    expect(await live('persons', res.person_id)).toBe(false);
    expect(await live('unions', res.union_id)).toBe(false);
    const edges = await db.admin((c) =>
      scalar<number>(c, 'select count(*)::int from parent_child where child_id = $1 and deleted_at is null', [res.person_id]),
    );
    expect(edges).toBe(0);
    expect(await live('persons', rajiv)).toBe(true);
  });

  it('undoes an edit: the old name comes back', async () => {
    const p = await createPerson('Ujwala');
    const edit = await op((c) =>
      c.query(
        `update person_name_forms f set full_name = 'Ujjwala', given_name = 'Ujjwala'
         from person_names n where n.id = f.name_id and n.person_id = $1 and f.lang = 'en'`,
        [p],
      ),
    );
    expect(await nameOf(p)).toBe('Ujjwala');
    await undo(edit);
    expect(await nameOf(p)).toBe('Ujwala');
  });

  it('undoes a delete: the person and their relationships are back', async () => {
    const rajiv = await createPerson('Rajiv');
    let amit = '';
    await op(async (c) => {
      amit = (await scalar<{ person_id: string }>(c, 'select public.add_relative($1, $2, $3, $4)', [rajiv, 'child', personPayload('Amit'), {}])).person_id;
    });
    const del = await op((c) => c.query('select public.soft_delete_person($1)', [amit]));
    expect(await live('persons', amit)).toBe(false);
    await undo(del);
    expect(await live('persons', amit)).toBe(true);
    const edges = await db.admin((c) =>
      scalar<number>(c, 'select count(*)::int from parent_child where child_id = $1 and parent_id = $2 and deleted_at is null', [amit, rajiv]),
    );
    expect(edges).toBe(1);
  });

  it('undoes a photo change: the earlier profile photo is linked again', async () => {
    const p = await createPerson('Ujwala');
    const photo = async (c: pg.ClientBase) => {
      const m = await scalar<string>(
        c,
        `insert into media (family_id, kind, storage_path, mime_type, size_bytes)
         values ($1::uuid, 'photo', $1::text || '/people/' || gen_random_uuid() || '.webp', 'image/webp', 100) returning id`,
        [fid],
      );
      return m;
    };
    let first = '';
    await op(async (c) => {
      first = await photo(c);
      await c.query(`insert into media_links (family_id, media_id, person_id, role) values ($1, $2, $3, 'profile')`, [fid, first, p]);
    });
    let second = '';
    const change = await op(async (c) => {
      await c.query(`delete from media_links where person_id = $1 and role = 'profile'`, [p]);
      await c.query(`update media set deleted_at = now() where id = $1`, [first]);
      second = await photo(c);
      await c.query(`insert into media_links (family_id, media_id, person_id, role) values ($1, $2, $3, 'profile')`, [fid, second, p]);
    });
    await undo(change);
    const profile = await db.admin((c) => scalar<string>(c, `select media_id from media_links where person_id = $1 and role = 'profile'`, [p]));
    expect(profile).toBe(first);
    expect(await live('media', first)).toBe(true);
    expect(await live('media', second)).toBe(false);
  });

  it('refuses when the same rows were changed again later, and changes nothing', async () => {
    const p = await createPerson('Ujwala');
    const rename = (to: string) =>
      op((c) =>
        c.query(
          `update person_name_forms f set full_name = $2 from person_names n where n.id = f.name_id and n.person_id = $1 and f.lang = 'en'`,
          [p, to],
        ),
      );
    const first = await rename('Ujjwala');
    await rename('Ujjwala Patil');
    await expect(undo(first)).rejects.toThrow(/changed again/);
    expect(await nameOf(p)).toBe('Ujjwala Patil');
  });

  it('cannot undo the same change twice', async () => {
    const p = await createPerson('Ujwala');
    const del = await op((c) => c.query('select public.soft_delete_person($1)', [p]));
    await undo(del);
    await expect(undo(del)).rejects.toThrow(/changed again/);
    expect(await live('persons', p)).toBe(true);
  });

  it('only members who can edit may undo', async () => {
    const p = await createPerson('Ujwala');
    const del = await op((c) => c.query('select public.soft_delete_person($1)', [p]));
    const stranger = await db.createUser();
    await expect(db.as(stranger, (c) => c.query('select public.undo_operation($1)', [del]))).rejects.toThrow();
    expect(await live('persons', p)).toBe(false);
  });
});
