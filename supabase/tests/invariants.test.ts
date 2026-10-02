import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createTestDb, one, personPayload, scalar, type Db } from './support/db';

let db: Db;
let owner: string;
let fid: string;

beforeAll(async () => {
  db = await createTestDb();
  owner = await db.createUser();
  fid = await db.as(owner, (c) => scalar<string>(c, `select public.create_family('{"en":{"v":"Dhotar","src":"manual"}}')`));
});
afterAll(async () => {
  await db?.close();
});

const asOwner = <T>(fn: (c: pg.ClientBase) => Promise<T>, headers?: Record<string, string>) => db.as(owner, fn, headers);
const newPerson = (name = 'P', family = fid) =>
  asOwner((c) => scalar<string>(c, 'select public.create_person($1, $2)', [family, personPayload(name)]));

async function newUnion(...partners: string[]) {
  return asOwner(async (c) => {
    const u = await scalar<string>(c, 'insert into unions (family_id) values ($1) returning id', [fid]);
    for (const p of partners) {
      await c.query('insert into union_partners (union_id, person_id, family_id) values ($1, $2, $3)', [u, p, fid]);
    }
    return u;
  });
}

const edge = (parent: string, child: string, lineage = 'biological') =>
  asOwner((c) =>
    c.query('insert into parent_child (family_id, parent_id, child_id, lineage) values ($1, $2, $3, $4)', [fid, parent, child, lineage]),
  );

describe('relationship invariants (enforced by the database, not just the RPCs)', () => {
  it('I1: nobody is their own parent', async () => {
    const a = await newPerson();
    await expect(edge(a, a)).rejects.toThrow(/check constraint/);
  });

  it('I2: no ancestor cycles, even through raw inserts', async () => {
    const [a, b, c] = [await newPerson('a'), await newPerson('b'), await newPerson('c')];
    await edge(a, b);
    await edge(b, c);
    await expect(edge(c, a)).rejects.toThrow(/own ancestor/);
  });

  it('I3: at most two biological parents; adoptive parents are extra', async () => {
    const child = await newPerson();
    await edge(await newPerson(), child);
    await edge(await newPerson(), child);
    await expect(edge(await newPerson(), child)).rejects.toThrow(/two biological parents/);
    await edge(await newPerson(), child, 'adoptive');
  });

  it('I4: at most two partners per union, and no duplicate couples', async () => {
    const [a, b, c] = [await newPerson(), await newPerson(), await newPerson()];
    const u = await newUnion(a, b);
    await expect(
      asOwner((x) => x.query('insert into union_partners (union_id, person_id, family_id) values ($1, $2, $3)', [u, c, fid])),
    ).rejects.toThrow(/at most two partners/);
    await expect(newUnion(b, a)).rejects.toThrow(/already partners/);
  });

  it('a soft-deleted union can be replaced, but not restored into a duplicate', async () => {
    const [a, b] = [await newPerson(), await newPerson()];
    const u1 = await newUnion(a, b);
    await asOwner((c) => c.query('update unions set deleted_at = now() where id = $1', [u1]));
    await newUnion(a, b);
    await expect(asOwner((c) => c.query('update unions set deleted_at = null where id = $1', [u1]))).rejects.toThrow(/already partners/);
  });

  it('I5: no duplicate live parent-child edge', async () => {
    const [p, c] = [await newPerson(), await newPerson()];
    await edge(p, c);
    await expect(edge(p, c, 'adoptive')).rejects.toThrow(/duplicate key/);
  });

  it('I6: a child placed under a union must have the parent as a partner of it', async () => {
    const [p, other, c] = [await newPerson(), await newPerson(), await newPerson()];
    const u = await newUnion(other);
    await expect(
      asOwner((x) =>
        x.query('insert into parent_child (family_id, parent_id, child_id, union_id) values ($1, $2, $3, $4)', [fid, p, c, u]),
      ),
    ).rejects.toThrow(/must be a partner/);
  });

  it('I7: relationships cannot cross families', async () => {
    const otherFamily = await asOwner((c) => scalar<string>(c, `select public.create_family('{"en":{"v":"O","src":"manual"}}')`));
    const outsider = await newPerson('o', otherFamily);
    const local = await newPerson();
    await expect(edge(local, outsider)).rejects.toThrow(/foreign key/);
  });

  it('no partnering with your own parent or child', async () => {
    const [p, c] = [await newPerson(), await newPerson()];
    await edge(p, c);
    await expect(newUnion(p, c)).rejects.toThrow(/own parent or child/);
  });

  it('id and family_id are immutable', async () => {
    const otherFamily = await asOwner((c) => scalar<string>(c, `select public.create_family('{"en":{"v":"O2","src":"manual"}}')`));
    const p = await newPerson();
    await expect(asOwner((c) => c.query('update persons set family_id = $1 where id = $2', [otherFamily, p]))).rejects.toThrow(
      /cannot be changed/,
    );
  });

  it('I8: every person keeps a primary name', async () => {
    const p = await newPerson();
    await expect(
      asOwner((c) => c.query('delete from person_name_forms where name_id in (select id from person_names where person_id = $1)', [p])),
    ).rejects.toThrow(/primary name/);
    await expect(asOwner((c) => c.query('update person_names set deleted_at = now() where person_id = $1', [p]))).rejects.toThrow(
      /primary name/,
    );
  });

  it('placeholders need no name', async () => {
    const id = await asOwner((c) => scalar(c, 'select public.create_person($1, $2)', [fid, { is_placeholder: true }]));
    expect(id).toBeTruthy();
  });

  it('a family always keeps an owner', async () => {
    await expect(db.admin((c) => c.query('delete from family_members where family_id = $1', [fid]))).rejects.toThrow(/at least one owner/);
  });
});

describe('fuzzy dates', () => {
  const fact = (date: Record<string, unknown>) =>
    asOwner(async (c) => {
      const p = await scalar<string>(c, 'select public.create_person($1, $2)', [fid, { ...personPayload('D'), facts: [{ fact_type: 'birth', date }] }]);
      return one<{ date_sort: Date | null }>(c, `select date_sort from person_facts where person_id = $1`, [p]);
    });

  it.each([
    [{ qualifier: 'unknown' }],
    [{ qualifier: 'exact', from: '1958-03-14', from_precision: 'day' }],
    [{ qualifier: 'about', from: '1958-01-01', from_precision: 'year' }],
    [{ qualifier: 'before', from: '1920-01-01', from_precision: 'year' }],
    [{ qualifier: 'after', from: '1950-06-01', from_precision: 'month' }],
    [{ qualifier: 'between', from: '1950-01-01', from_precision: 'year', to: '1955-01-01', to_precision: 'year' }],
  ])('accepts %j', async (date) => {
    await expect(fact(date)).resolves.toBeTruthy();
  });

  it.each([
    [{ qualifier: 'unknown', from: '1958-01-01', from_precision: 'year' }],
    [{ qualifier: 'exact' }],
    [{ qualifier: 'about', from: '1958-03-14', from_precision: 'year' }],
    [{ qualifier: 'exact', from: '1958-03-14' }],
    [{ qualifier: 'between', from: '1950-01-01', from_precision: 'year' }],
    [{ qualifier: 'between', from: '1960-01-01', from_precision: 'year', to: '1955-01-01', to_precision: 'year' }],
    [{ qualifier: 'before', from: '1920-01-01', from_precision: 'year', to: '1921-01-01', to_precision: 'year' }],
  ])('rejects %j', async (date) => {
    await expect(fact(date)).rejects.toThrow(/check constraint/);
  });

  it('allows only one birth per person', async () => {
    await expect(
      asOwner((c) =>
        c.query('select public.create_person($1, $2)', [fid, { ...personPayload('B'), facts: [{ fact_type: 'birth' }, { fact_type: 'birth' }] }]),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('localized values (I9)', () => {
  it('rejects malformed localized json', async () => {
    for (const notes of [{ en: 'plain string' }, { en: { v: 'x', src: 'guess' } }, { English: { v: 'x', src: 'manual' } }, ['x']]) {
      await expect(
        asOwner((c) => c.query('select public.create_person($1, $2)', [fid, { ...personPayload('L'), notes }])),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('never lets an automatic value overwrite a manual one', async () => {
    const p = await newPerson();
    await asOwner((c) => c.query(`update persons set notes = '{"mr":{"v":"हाताने","src":"manual"}}' where id = $1`, [p]));
    await expect(
      asOwner((c) => c.query(`update persons set notes = '{"mr":{"v":"यंत्र","src":"auto","from":"en"}}' where id = $1`, [p])),
    ).rejects.toThrow(/Refusing to overwrite/);
    // auto over auto, and manual over anything, are fine
    await asOwner((c) => c.query(`update persons set notes = '{"mr":{"v":"दुरुस्त","src":"corrected"}}' where id = $1`, [p]));
  });

  it('applies the same rule to name forms', async () => {
    const p = await newPerson('Rajiv Dhotar');
    await expect(
      asOwner((c) =>
        c.query(
          `update person_name_forms set full_name = 'Rajeev', source = 'auto', generated_from = 'mr'
           where name_id in (select id from person_names where person_id = $1) and lang = 'en'`,
          [p],
        ),
      ),
    ).rejects.toThrow(/Refusing to overwrite/);
  });

  it('maintains a normalized search key', async () => {
    const p = await newPerson('  Rājīv   DHOTAR ');
    const key = await db.admin((c) =>
      scalar(c, `select search_key from person_name_forms f join person_names n on n.id = f.name_id where n.person_id = $1`, [p]),
    );
    expect(key).toBe('rajiv dhotar');
  });
});

describe('audit log', () => {
  it('records who changed what, with the device editor name', async () => {
    const p = await newPerson('Audited');
    await asOwner((c) => c.query(`update persons set gender = 'male' where id = $1`, [p]), { 'x-editor-name': 'Priyansh' });
    await asOwner((c) => c.query(`update persons set is_living = true where id = $1`, [p]), {
      'x-editor-name': encodeURIComponent('प्रियांश'),
    });
    await asOwner((c) => c.query('select public.soft_delete_person($1)', [p]));
    await asOwner((c) => c.query('select public.restore_person($1)', [p]));

    const rows = await db.admin(async (c) =>
      (
        await c.query(
          `select action, actor_id, actor_label, old_values, new_values from audit_log
           where table_name = 'persons' and row_key = jsonb_build_object('id', $1::uuid) order by id`,
          [p],
        )
      ).rows,
    );
    expect(rows.map((r) => r.action)).toEqual(['insert', 'update', 'update', 'soft_delete', 'restore']);
    expect(rows[2].actor_label).toBe('प्रियांश');
    expect(rows[1]).toMatchObject({
      actor_id: owner,
      actor_label: 'Priyansh',
      old_values: { gender: 'unknown' },
      new_values: { gender: 'male' },
    });
  });
});
