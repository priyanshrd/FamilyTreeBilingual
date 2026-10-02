import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createTestDb, one, personPayload, scalar, type Db } from './support/db';

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

const asOwner = <T>(fn: (c: pg.ClientBase) => Promise<T>) => db.as(owner, fn);

async function createPerson(name: string, extra: Record<string, unknown> = {}) {
  return asOwner((c) => scalar<string>(c, 'select public.create_person($1, $2)', [fid, personPayload(name, extra)]));
}

async function addRelative(anchor: string, relation: string, name: string, options: Record<string, unknown> = {}) {
  return asOwner((c) =>
    scalar<{ person_id: string; union_id: string; edge_ids: string[]; placeholder_id: string | null }>(
      c,
      'select public.add_relative($1, $2, $3, $4)',
      [anchor, relation, personPayload(name), options],
    ),
  );
}

async function connect(anchor: string, other: string, relation: string, options: Record<string, unknown> = {}) {
  return asOwner((c) =>
    scalar<{ union_id: string }>(c, 'select public.connect_existing($1, $2, $3, $4)', [anchor, other, relation, options]),
  );
}

async function parentsOf(child: string) {
  return db.admin(async (c) =>
    (
      await c.query(
        `select parent_id, lineage, union_id from parent_child where child_id = $1 and deleted_at is null order by created_at`,
        [child],
      )
    ).rows as { parent_id: string; lineage: string; union_id: string | null }[],
  );
}

async function partnersOf(unionId: string) {
  return db.admin(async (c) =>
    (await c.query('select person_id from union_partners where union_id = $1 order by partner_order', [unionId])).rows.map(
      (r) => r.person_id as string,
    ),
  );
}

describe('create_family', () => {
  it('makes the caller the owner', async () => {
    const role = await asOwner((c) => scalar(c, 'select role from family_members where family_id = $1', [fid]));
    expect(role).toBe('owner');
  });

  it('requires a signed-in user', async () => {
    await expect(db.as(null, (c) => c.query(`select public.create_family('{"en":{"v":"x","src":"manual"}}')`))).rejects.toThrow();
  });
});

describe('create_person', () => {
  it('stores names in several languages and dated facts', async () => {
    const pid = await asOwner((c) =>
      scalar<string>(c, 'select public.create_person($1, $2)', [
        fid,
        {
          gender: 'male',
          names: [
            {
              forms: {
                en: { given_name: 'Rajiv', surname: 'Dhotar', full_name: 'Rajiv Dhotar', source: 'manual' },
                mr: { given_name: 'राजीव', surname: 'धोतर', full_name: 'राजीव धोतर', source: 'auto', generated_from: 'en', provider: 'test' },
              },
            },
          ],
          facts: [
            { fact_type: 'birth', date: { qualifier: 'about', from: '1958-01-01', from_precision: 'year' }, place: { en: { v: 'Pune', src: 'manual' } } },
            { fact_type: 'occupation', value: { en: { v: 'Engineer', src: 'manual' } }, date: { qualifier: 'exact', from: '1980-01-01', from_precision: 'year' }, end_date: { qualifier: 'exact', from: '1995-01-01', from_precision: 'year' } },
            { fact_type: 'occupation', value: { en: { v: 'Manager', src: 'manual' } } },
          ],
        },
      ]),
    );
    const forms = await db.admin(async (c) =>
      (await c.query(`select f.lang, f.full_name, f.source, f.search_key from person_name_forms f join person_names n on n.id = f.name_id where n.person_id = $1 order by lang`, [pid])).rows,
    );
    expect(forms).toEqual([
      { lang: 'en', full_name: 'Rajiv Dhotar', source: 'manual', search_key: 'rajiv dhotar' },
      { lang: 'mr', full_name: 'राजीव धोतर', source: 'auto', search_key: 'राजीव धोतर' },
    ]);
    const facts = await db.admin((c) => scalar<number>(c, `select count(*)::int from person_facts where person_id = $1`, [pid]));
    expect(facts).toBe(3);
  });

  it('rejects a person without any name', async () => {
    await expect(asOwner((c) => c.query('select public.create_person($1, $2)', [fid, { gender: 'male' }]))).rejects.toThrow(
      /primary name/,
    );
  });
});

describe('add_relative: parents', () => {
  it('puts the second biological parent in the same union as the first', async () => {
    const rajiv = await createPerson('Rajiv');
    const father = await addRelative(rajiv, 'parent', 'Shankar');
    const mother = await addRelative(rajiv, 'parent', 'Sushila');
    expect(mother.union_id).toBe(father.union_id);
    expect(await partnersOf(father.union_id)).toEqual([father.person_id, mother.person_id]);
    const parents = await parentsOf(rajiv);
    expect(parents.map((p) => p.parent_id)).toEqual([father.person_id, mother.person_id]);
    expect(new Set(parents.map((p) => p.union_id))).toEqual(new Set([father.union_id]));
  });

  it('makes the new parent a parent of the existing siblings too (default)', async () => {
    const a = await createPerson('A');
    const father = await addRelative(a, 'parent', 'Father');
    const b = await addRelative(a, 'sibling', 'B');
    const mother = await addRelative(a, 'parent', 'Mother');
    expect((await parentsOf(b.person_id)).map((p) => p.parent_id)).toEqual([father.person_id, mother.person_id]);
  });

  it('with apply_to_siblings=false, groups the anchor under a new couple and leaves siblings alone', async () => {
    const a = await createPerson('A');
    const father = await addRelative(a, 'parent', 'Father');
    const b = await addRelative(a, 'sibling', 'B');
    const mother = await addRelative(a, 'parent', 'Mother', { apply_to_siblings: false });
    expect((await parentsOf(b.person_id)).map((p) => p.parent_id)).toEqual([father.person_id]);
    const aParents = await parentsOf(a);
    expect(aParents).toHaveLength(2);
    expect(aParents[0]!.union_id).toBe(mother.union_id);
    expect(await partnersOf(mother.union_id)).toEqual([father.person_id, mother.person_id]);
  });

  it('rejects a third biological parent', async () => {
    const a = await createPerson('A');
    await addRelative(a, 'parent', 'P1');
    await addRelative(a, 'parent', 'P2');
    await expect(addRelative(a, 'parent', 'P3')).rejects.toThrow(/two biological parents/);
  });

  it('keeps adoptive parents in their own family unit, alongside biological ones', async () => {
    const a = await createPerson('A');
    const bio = await addRelative(a, 'parent', 'Bio');
    const adoptive1 = await addRelative(a, 'adoptive_parent', 'Adoptive 1');
    const adoptive2 = await addRelative(a, 'adoptive_parent', 'Adoptive 2');
    expect(adoptive1.union_id).not.toBe(bio.union_id);
    expect(adoptive2.union_id).toBe(adoptive1.union_id);
    const lineages = (await parentsOf(a)).map((p) => p.lineage);
    expect(lineages).toEqual(['biological', 'adoptive', 'adoptive']);
  });
});

describe('add_relative: children and spouses', () => {
  it('adds a child of a couple to both partners', async () => {
    const rajiv = await createPerson('Rajiv');
    const madhuri = await addRelative(rajiv, 'spouse', 'Madhuri');
    const child = await addRelative(rajiv, 'child', 'Child', { union_id: madhuri.union_id });
    expect((await parentsOf(child.person_id)).map((p) => p.parent_id).sort()).toEqual([rajiv, madhuri.person_id].sort());
  });

  it('adds a child with an explicit other parent', async () => {
    const rajiv = await createPerson('Rajiv');
    const sunita = await createPerson('Sunita');
    const child = await addRelative(rajiv, 'child', 'Child', { other_parent_id: sunita });
    expect(await partnersOf(child.union_id)).toEqual([rajiv, sunita]);
  });

  it('adds a child with unknown other parent under a single-partner union', async () => {
    const rajiv = await createPerson('Rajiv');
    const c1 = await addRelative(rajiv, 'child', 'C1');
    const c2 = await addRelative(rajiv, 'child', 'C2');
    expect(c2.union_id).toBe(c1.union_id);
    expect(await partnersOf(c1.union_id)).toEqual([rajiv]);
  });

  it('supports multiple marriages with children from each', async () => {
    const rajiv = await createPerson('Rajiv');
    const first = await addRelative(rajiv, 'spouse', 'First', { status: 'divorced' });
    const second = await addRelative(rajiv, 'spouse', 'Second');
    expect(first.union_id).not.toBe(second.union_id);
    const c1 = await addRelative(rajiv, 'child', 'C1', { union_id: first.union_id });
    const c2 = await addRelative(rajiv, 'child', 'C2', { union_id: second.union_id });
    expect((await parentsOf(c1.person_id)).map((p) => p.parent_id).sort()).toEqual([rajiv, first.person_id].sort());
    expect((await parentsOf(c2.person_id)).map((p) => p.parent_id).sort()).toEqual([rajiv, second.person_id].sort());
  });

  it('rejects connecting the same couple twice', async () => {
    const a = await createPerson('A');
    const b = await addRelative(a, 'spouse', 'B');
    await expect(connect(a, b.person_id, 'spouse')).rejects.toThrow(/already partners/);
  });

  it('lets a spouse join a single-parent family unit and become parent of its children', async () => {
    const rajiv = await createPerson('Rajiv');
    const c1 = await addRelative(rajiv, 'child', 'C1');
    const wife = await addRelative(rajiv, 'spouse', 'Wife', { union_id: c1.union_id, children_lineage: 'biological' });
    expect(wife.union_id).toBe(c1.union_id);
    expect((await parentsOf(c1.person_id)).map((p) => p.parent_id)).toEqual([rajiv, wife.person_id]);
  });
});

describe('add_relative: siblings', () => {
  it('creates an unknown-parent placeholder when no parents are recorded', async () => {
    const a = await createPerson('A');
    const b = await addRelative(a, 'sibling', 'B');
    expect(b.placeholder_id).toBeTruthy();
    expect((await parentsOf(a))[0]!.parent_id).toBe(b.placeholder_id);
    expect((await parentsOf(b.person_id))[0]!.parent_id).toBe(b.placeholder_id);
    const isPlaceholder = await db.admin((c) => scalar(c, 'select is_placeholder from persons where id = $1', [b.placeholder_id]));
    expect(isPlaceholder).toBe(true);
  });

  it('gives a full sibling both parents in the same union', async () => {
    const a = await createPerson('A');
    const f = await addRelative(a, 'parent', 'F');
    const m = await addRelative(a, 'parent', 'M');
    const b = await addRelative(a, 'sibling', 'B');
    expect(b.union_id).toBe(f.union_id);
    expect((await parentsOf(b.person_id)).map((p) => p.parent_id)).toEqual([f.person_id, m.person_id]);
  });

  it('gives a half sibling only the shared parent', async () => {
    const a = await createPerson('A');
    const f = await addRelative(a, 'parent', 'F');
    await addRelative(a, 'parent', 'M');
    const half = await addRelative(a, 'sibling', 'Half', { parent_ids: [f.person_id] });
    expect((await parentsOf(half.person_id)).map((p) => p.parent_id)).toEqual([f.person_id]);
    expect(await partnersOf(half.union_id)).toEqual([f.person_id]);
  });

  it('rejects shared parents that are not parents of the anchor', async () => {
    const a = await createPerson('A');
    const stranger = await createPerson('Stranger');
    await expect(addRelative(a, 'sibling', 'B', { parent_ids: [stranger] })).rejects.toThrow(/Shared parents/);
  });
});

describe('add_relative: step-parents', () => {
  it('creates a union with the chosen parent and no parent edge (step is derived)', async () => {
    const a = await createPerson('A');
    const mother = await addRelative(a, 'parent', 'Mother');
    const step = await addRelative(a, 'step_parent', 'Step', { via_parent_id: mother.person_id });
    expect(await partnersOf(step.union_id)).toEqual([mother.person_id, step.person_id]);
    expect((await parentsOf(a)).map((p) => p.parent_id)).toEqual([mother.person_id]);
  });

  it('can record an asserted step edge', async () => {
    const a = await createPerson('A');
    const mother = await addRelative(a, 'parent', 'Mother');
    await addRelative(a, 'step_parent', 'Step', { via_parent_id: mother.person_id, assert_edge: true });
    expect((await parentsOf(a)).map((p) => p.lineage)).toEqual(['biological', 'step']);
  });

  it('requires choosing which parent they married', async () => {
    const a = await createPerson('A');
    await expect(addRelative(a, 'step_parent', 'Step')).rejects.toThrow(/which parent/);
  });
});

describe('connect_existing', () => {
  it('links existing people without creating anyone', async () => {
    const rajiv = await createPerson('Rajiv');
    const madhuri = await createPerson('Madhuri');
    const before = await db.admin((c) => scalar<number>(c, 'select count(*)::int from persons'));
    await connect(rajiv, madhuri, 'spouse');
    const after = await db.admin((c) => scalar<number>(c, 'select count(*)::int from persons'));
    expect(after).toBe(before);
  });

  it('rejects a link that would create an ancestor cycle', async () => {
    const a = await createPerson('A');
    const parent = await addRelative(a, 'parent', 'Parent');
    const grandparent = await addRelative(parent.person_id, 'parent', 'Grandparent');
    await expect(connect(grandparent.person_id, a, 'parent')).rejects.toThrow(/own ancestor/);
  });

  it('rejects duplicate parent-child links', async () => {
    const a = await createPerson('A');
    const p = await addRelative(a, 'parent', 'P');
    await expect(connect(a, p.person_id, 'parent', { lineage: 'adoptive' })).rejects.toThrow(/already exists/);
  });

  it('rejects relating a person to themselves', async () => {
    const a = await createPerson('A');
    await expect(connect(a, a, 'spouse')).rejects.toThrow(/themselves/);
  });

  it('rejects people from another family', async () => {
    const a = await createPerson('A');
    const otherFamily = await asOwner((c) => scalar<string>(c, `select public.create_family('{"en":{"v":"Other","src":"manual"}}')`));
    const outsider = await asOwner((c) => scalar<string>(c, 'select public.create_person($1, $2)', [otherFamily, personPayload('Outsider')]));
    await expect(connect(a, outsider, 'spouse')).rejects.toThrow(/different families/);
  });

  it('rejects unknown relations', async () => {
    const a = await createPerson('A');
    const b = await createPerson('B');
    await expect(connect(a, b, 'cousin')).rejects.toThrow(/Unknown relation/);
  });
});

describe('soft delete', () => {
  it('reports impact, hides nothing destructively, and restores', async () => {
    const rajiv = await createPerson('Rajiv');
    await addRelative(rajiv, 'parent', 'F');
    await addRelative(rajiv, 'parent', 'M');
    const wife = await addRelative(rajiv, 'spouse', 'W');
    await addRelative(rajiv, 'child', 'C1', { union_id: wife.union_id });
    await addRelative(rajiv, 'child', 'C2', { union_id: wife.union_id });

    const impact = await asOwner((c) => scalar(c, 'select public.person_delete_impact($1)', [rajiv]));
    expect(impact).toEqual({ parents: 2, children: 2, partners: 1, media: 0 });

    await asOwner((c) => c.query('select public.soft_delete_person($1)', [rajiv]));
    const deleted = await db.admin((c) => one(c, 'select deleted_at, deleted_by from persons where id = $1', [rajiv]));
    expect(deleted.deleted_at).not.toBeNull();
    expect(deleted.deleted_by).toBe(owner);
    const edges = await db.admin((c) => scalar<number>(c, 'select count(*)::int from parent_child where (parent_id = $1 or child_id = $1) and deleted_at is null', [rajiv]));
    expect(edges).toBe(4);

    await asOwner((c) => c.query('select public.restore_person($1)', [rajiv]));
    const restored = await db.admin((c) => scalar(c, 'select deleted_at from persons where id = $1', [rajiv]));
    expect(restored).toBeNull();
  });

  it('cannot link to a deleted person', async () => {
    const a = await createPerson('A');
    const b = await createPerson('B');
    await asOwner((c) => c.query('select public.soft_delete_person($1)', [b]));
    await expect(connect(a, b, 'spouse')).rejects.toThrow(/not found/);
  });
});
