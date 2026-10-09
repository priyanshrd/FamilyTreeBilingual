import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, scalar, type Db } from './support/db';

let db: Db;
let owner: string;
let fid: string;
let nameId: string;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  owner = await db.createUser();
  fid = await db.as(owner, (c) => scalar<string>(c, `select public.create_family('{"en":{"v":"Dhotar","src":"manual"}}')`));
  const forms = {
    en: { full_name: 'Ratnabai Patil', source: 'manual' },
    mr: { full_name: 'रत्नाबाई पाटील', source: 'auto', generated_from: 'en', provider: 'builtin-rules-v2' },
  };
  const person = await db.as(owner, (c) =>
    scalar<string>(c, 'select public.create_person($1, $2)', [fid, { names: [{ name_type: 'primary', is_primary: true, forms }] }]),
  );
  nameId = await db.admin((c) => scalar<string>(c, 'select id from person_names where person_id = $1', [person]));
});

const setMarathi = (fullName: string, source: string, provider: string | null) =>
  db.as(owner, (c) =>
    c.query(`update person_name_forms set full_name = $2, source = $3, provider = $4 where name_id = $1 and lang = 'mr'`, [nameId, fullName, source, provider]),
  );
const marathi = () => db.admin((c) => scalar<string>(c, `select full_name from person_name_forms where name_id = $1 and lang = 'mr'`, [nameId]));

describe('automatic names from different app versions', () => {
  it('ignores an older app rewriting a newer automatic name', async () => {
    await setMarathi('रत्नबै पाटील', 'auto', 'builtin-rules-v1');
    expect(await marathi()).toBe('रत्नाबाई पाटील');
  });

  it('accepts newer rules', async () => {
    await setMarathi('रत्नाबाई पाटिल', 'auto', 'builtin-rules-v3');
    expect(await marathi()).toBe('रत्नाबाई पाटिल');
  });

  it('always accepts a name typed or corrected by a person', async () => {
    await setMarathi('रत्नाबाई पाटील (आजी)', 'corrected', null);
    expect(await marathi()).toBe('रत्नाबाई पाटील (आजी)');
  });
});
