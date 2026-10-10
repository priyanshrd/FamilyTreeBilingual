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
  fid = await db.as(owner, (c) => scalar<string>(c, `select public.create_family('{"en":{"v":"Patil","src":"manual"}}')`));
});

const asOwner = <T>(fn: (c: pg.ClientBase) => Promise<T>) => db.as(owner, fn);
const create = (name: string, gender = 'unknown') =>
  asOwner((c) => scalar<string>(c, 'select public.create_person($1, $2)', [fid, personPayload(name, { gender })]));
const addRelative = (anchor: string, relation: string, name: string, options: Record<string, unknown> = {}) =>
  asOwner((c) => scalar<{ person_id: string }>(c, 'select public.add_relative($1, $2, $3, $4)', [anchor, relation, personPayload(name), options])).then(
    (r) => r.person_id,
  );
const connect = (anchor: string, other: string, relation: string, options: Record<string, unknown> = {}) =>
  asOwner((c) => c.query('select public.connect_existing($1, $2, $3, $4)', [anchor, other, relation, options]));
const parentsOf = (child: string) =>
  db.admin(async (c) => (await c.query('select parent_id, union_id from parent_child where child_id = $1 and deleted_at is null', [child])).rows as { parent_id: string; union_id: string }[]);
const liveUnion = (id: string) => db.admin((c) => scalar<boolean>(c, 'select deleted_at is null from unions where id = $1', [id]));

/** Ashish's children added with "other parent not known"; later Varsha added as his wife. */
async function reportedFamily() {
  const ashish = await create('Ashish Patil', 'male');
  const siya = await addRelative(ashish, 'child', 'Siya');
  const newborn = await addRelative(ashish, 'child', 'Newborn');
  const varsha = await addRelative(ashish, 'spouse', 'Varsha Ashish Patil');
  const oneParentUnit = (await parentsOf(siya))[0]!.union_id;
  return { ashish, siya, newborn, varsha, oneParentUnit };
}

describe('connecting a mother to children her husband already has (reported case)', () => {
  it('from the mother: "Siya is my child, other parent Ashish" — moves Siya into the couple\'s family', async () => {
    const f = await reportedFamily();
    await connect(f.varsha, f.siya, 'child', { other_parent_id: f.ashish });
    const parents = await parentsOf(f.siya);
    expect(parents.map((p) => p.parent_id).sort()).toEqual([f.ashish, f.varsha].sort());
    expect(new Set(parents.map((p) => p.union_id)).size).toBe(1); // one family unit: Ashish + Varsha
    expect(parents[0]!.union_id).not.toBe(f.oneParentUnit);
    // Newborn is still Ashish's only (connect them too), so the one-parent unit stays for now
    expect(await liveUnion(f.oneParentUnit)).toBe(true);
    await connect(f.varsha, f.newborn, 'child', { other_parent_id: f.ashish });
    expect(await liveUnion(f.oneParentUnit)).toBe(false); // emptied → retired
  });

  it('from the child: "Varsha is Siya\'s mother" — Siya and her brother move into the couple\'s family', async () => {
    const f = await reportedFamily();
    await connect(f.siya, f.varsha, 'parent');
    for (const child of [f.siya, f.newborn]) {
      const parents = await parentsOf(child);
      expect(parents.map((p) => p.parent_id).sort()).toEqual([f.ashish, f.varsha].sort());
      expect(new Set(parents.map((p) => p.union_id)).size).toBe(1);
    }
    expect(await liveUnion(f.oneParentUnit)).toBe(false);
  });

  it('still refuses a true duplicate', async () => {
    const f = await reportedFamily();
    await connect(f.varsha, f.siya, 'child', { other_parent_id: f.ashish });
    await expect(connect(f.varsha, f.siya, 'child', { other_parent_id: f.ashish })).rejects.toThrow(/already exists/);
  });
});
