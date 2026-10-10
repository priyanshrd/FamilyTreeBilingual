import { describe, expect, it } from 'vitest';
import { FamilyBuilder, fixtureFamily } from '@/domain/testing/familyBuilder';
import { KinshipResolver } from './resolve';
import { labelRelationship } from './terms';

const g = fixtureFamily();
const resolver = new KinshipResolver(g);
const rel = (a: string, b: string) => resolver.find(a, b);

type Row = [from: string, to: string, key: string, english: string, kind: string, en: string, mr: string];

// prettier-ignore
const CASES: Row[] = [
  // parents, children, spouse
  ['me', 'f',      'F',  'father', 'blood', 'father', 'वडील'],
  ['me', 'm',      'M',  'mother', 'blood', 'mother', 'आई'],
  ['me', 'son',    'S',  'son', 'blood', 'son', 'मुलगा'],
  ['me', 'dau',    'D',  'daughter', 'blood', 'daughter', 'मुलगी'],
  ['me', 'wife',   'W',  'wife', 'affinal', 'wife', 'पत्नी'],
  ['wife', 'me',   'H',  'husband', 'affinal', 'husband', 'पती'],
  // siblings (elder / younger from birth years)
  ['me', 'ze',     'eZ', 'sister', 'blood', 'sister', 'ताई (मोठी बहीण)'],
  ['me', 'by',     'yB', 'brother', 'blood', 'brother', 'धाकटा भाऊ'],
  ['me', 'half',   'eB', 'half_brother', 'blood', 'half brother', 'सावत्र दादा (मोठा भाऊ)'],
  // grandparents and above, grandchildren and below
  ['me', 'gf',     'F.F', 'paternal_grandfather', 'blood', 'paternal grandfather', 'आजोबा'],
  ['me', 'mgm',    'M.M', 'maternal_grandmother', 'blood', 'maternal grandmother', 'आजी'],
  ['me', 'ggf',    'F.F.F', 'paternal_great_grandfather', 'blood', 'paternal great grandfather', 'पणजोबा'],
  ['gf', 'son',    'S.S.S', 'great_grandson', 'blood', 'great grandson', 'पणतू'],
  ['gf', 'ze',     'S.D', 'granddaughter', 'blood', 'granddaughter', 'नात'],
  // uncles and aunts, both sides
  ['me', 'fb',     'F.eB', 'paternal_uncle', 'blood', 'paternal uncle', 'मोठे काका'],
  ['me', 'fz',     'F.yZ', 'paternal_aunt', 'blood', 'paternal aunt', 'आत्या'],
  ['me', 'mb',     'M.yB', 'maternal_uncle', 'blood', 'maternal uncle', 'मामा'],
  ['me', 'mz',     'M.eZ', 'maternal_aunt', 'blood', 'maternal aunt', 'मावशी'],
  ['me', 'shankar','M.M.yB', 'maternal_grand_uncle', 'blood', 'maternal grand uncle', 'आईचे मामा'],
  // uncles and aunts by marriage
  ['me', 'fbw',    'F.eB.W', 'paternal_aunt_by_marriage', 'affinal', 'paternal aunt by marriage', 'काकू'],
  ['me', 'fzh',    'F.yZ.H', 'paternal_uncle_by_marriage', 'affinal', 'paternal uncle by marriage', 'आतोबा'],
  ['me', 'mbw',    'M.yB.W', 'maternal_aunt_by_marriage', 'affinal', 'maternal aunt by marriage', 'मामी'],
  ['me', 'mzh',    'M.eZ.H', 'maternal_uncle_by_marriage', 'affinal', 'maternal uncle by marriage', 'मावसा'],
  // nephews and nieces
  ['me', 'zs',     'eZ.S', 'nephew', 'blood', 'nephew', 'भाचा'],
  ['me', 'bys',    'yB.S', 'nephew', 'blood', 'nephew', 'पुतण्या'],
  ['me', 'zunk',   'eZ.C', 'siblings_child', 'blood', 'siblings child', 'ताईचे अपत्य'],
  ['me', 'adopt',  'yB.D', 'niece', 'blood', 'niece (adoptive)', 'पुतणी (दत्तक)'],
  // cousins
  ['me', 'fbs',    'F.eB.S', 'first_cousin', 'blood', 'cousin', 'चुलत भाऊ'],
  ['me', 'fbd',    'F.eB.D', 'first_cousin', 'blood', 'cousin', 'चुलत बहीण'],
  ['me', 'fzs',    'F.yZ.S', 'first_cousin', 'blood', 'cousin', 'आतेभाऊ'],
  ['me', 'mbs',    'M.yB.S', 'first_cousin', 'blood', 'cousin', 'मामेभाऊ'],
  ['me', 'mzs',    'M.eZ.S', 'first_cousin', 'blood', 'cousin', 'मावसभाऊ'],
  ['me', 'fbdd',   'F.eB.D.D', 'first_cousin_once_removed', 'blood', "cousin's daughter", 'चुलत बहिणीची मुलगी'],
  ['me', 'gfbss',  'F.F.yB.S.S', 'second_cousin', 'blood', 'second cousin', 'वडिलांच्या चुलत भावाचा मुलगा'],
  // in-laws
  ['me', 'wf',     'W.F', 'father_in_law', 'affinal', 'father in law', 'सासरे'],
  ['me', 'wm',     'W.M', 'mother_in_law', 'affinal', 'mother in law', 'सासू'],
  ['me', 'wb',     'W.yB', 'brother_in_law', 'affinal', 'brother in law', 'मेहुणा'],
  ['me', 'wz',     'W.yZ', 'sister_in_law', 'affinal', 'sister in law', 'मेहुणी'],
  ['wife', 'by',   'H.yB', 'brother_in_law', 'affinal', 'brother in law', 'दीर'],
  ['wife', 'ze',   'H.eZ', 'sister_in_law', 'affinal', 'sister in law', 'नणंद'],
  ['me', 'zeh',    'eZ.H', 'brother_in_law', 'affinal', 'brother in law', 'भाऊजी'],
  ['me', 'byw',    'yB.W', 'sister_in_law', 'affinal', 'sister in law', 'वहिनी'],
  ['me', 'sonw',   'S.W', 'daughter_in_law', 'affinal', 'daughter in law', 'सून'],
  ['me', 'dauh',   'D.H', 'son_in_law', 'affinal', 'son in law', 'जावई'],
  ['byw', 'wife',  'H.eB.W', 'sister_in_law', 'affinal', 'sister in law', 'जाऊ'],
  ['me', 'wzh',    'W.yZ.H', 'brother_in_law', 'affinal', 'brother in law', 'साडू'],
  ['me', 'swf',    'S.W.F', 'co_father_in_law', 'affinal', 'co father in law', 'व्याही'],
  ['me', 'swm',    'S.W.M', 'co_mother_in_law', 'affinal', 'co mother in law', 'विहीण'],
  // step relations (derived from marriages)
  ['me', 'wchild', 'W.S', 'stepson', 'step', 'stepson', 'सावत्र मुलगा'],
  ['wchild', 'me', 'M.H', 'stepfather', 'step', 'stepfather', 'सावत्र वडील'],
  ['me', 'f1w',    'F.W', 'stepmother', 'step', 'stepmother', 'सावत्र आई'],
  ['son', 'wchild','eB', 'half_brother', 'blood', 'half brother', 'सावत्र दादा (मोठा भाऊ)'],
];

describe('findRelationship', () => {
  it.each(CASES)('%s → %s is %s', (a, b, key, english, kind, en, mr) => {
    const r = rel(a, b);
    expect({ key: r.key, english: r.english, kind: r.kind }).toEqual({ key, english, kind });
    expect(labelRelationship(r, 'en').text).toBe(en);
    expect(labelRelationship(r, 'mr').text).toBe(mr);
  });

  it('returns a structured path through the family (the spec example)', () => {
    const r = rel('me', 'shankar');
    expect(r.personPath).toEqual(['me', 'm', 'mgm', 'shankar']);
    expect(r.steps.map((s) => [s.type, s.code])).toEqual([
      ['parent', 'M'],
      ['parent', 'M'],
      ['sibling', 'yB'],
    ]);
    expect(r.generations).toEqual({ up: 3, down: 1 });
    expect(r.side).toBe('maternal');
  });

  it('reports cousin degree and removal', () => {
    expect(rel('me', 'fbdd').cousin).toEqual({ degree: 1, removed: 1 });
    expect(rel('me', 'gfbss').cousin).toEqual({ degree: 2, removed: 0 });
    expect(rel('me', 'fb').cousin).toBeNull();
  });

  it('handles self, disconnected and unknown people', () => {
    expect(rel('me', 'me').kind).toBe('self');
    expect(rel('me', 'stranger')).toMatchObject({ kind: 'none', key: '' });
    expect(rel('me', 'nobody').kind).toBe('none');
    expect(labelRelationship(rel('me', 'stranger'), 'mr').text).toBe('नाते सापडले नाही');
  });

  it('is consistent in both directions', () => {
    expect(rel('f', 'me').key).toBe('S');
    expect(rel('fb', 'me').key).toBe('yB.S');
    expect(rel('fb', 'me').english).toBe('nephew');
    expect(rel('wf', 'me').english).toBe('son_in_law');
  });

  it('marks paths through adoption', () => {
    expect(rel('by', 'adopt')).toMatchObject({ key: 'D', adoptive: true });
    expect(rel('bys', 'adopt')).toMatchObject({ english: 'sister', adoptive: true });
  });

  it('derives step-siblings through a parent’s new marriage', () => {
    const b = new FamilyBuilder().person('a', 'male').person('mom', 'female').person('step', 'male').person('sc', 'female');
    b.children(b.union('mom'), ['a']);
    b.union('mom', 'step');
    b.children(b.union('step'), ['sc']);
    const r = new KinshipResolver(b.build()).find('a', 'sc');
    expect(r).toMatchObject({ key: 'M.H.D', english: 'step_sister', kind: 'step' });
    expect(labelRelationship(r, 'mr').text).toBe('सावत्र बहीण');
  });

  it('labels an asserted step-parent edge', () => {
    const b = new FamilyBuilder().person('a', 'male').person('mom', 'female').person('step', 'male');
    b.children(b.union('mom'), ['a']);
    b.edge('step', 'a', 'step');
    const r = new KinshipResolver(b.build()).find('a', 'step');
    expect(r).toMatchObject({ key: 'F', english: 'stepfather', kind: 'step' });
    expect(labelRelationship(r, 'mr').text).toBe('सावत्र वडील');
  });

  it('does not list detours through marriages as alternatives for blood relatives', () => {
    expect(rel('gf', 'son').alternatives).toEqual([]);
  });

  it('recognises twins (same birth-order number)', () => {
    const b = new FamilyBuilder().person('p', 'female').person('x', 'male').person('y', 'female').person('z', 'male');
    const u = b.union('p');
    for (const [c, order] of [['x', 1], ['y', 1], ['z', 2]] as const) {
      b.parentChild.push({ parentId: 'p', childId: c, lineage: 'biological', unionId: u, childOrder: order });
    }
    const r = new KinshipResolver(b.build());
    expect(r.find('x', 'y')).toMatchObject({ key: 'Z', english: 'twin_sister', twin: true });
    expect(labelRelationship(r.find('x', 'y'), 'mr').text).toBe('जुळी बहीण');
    expect(labelRelationship(r.find('y', 'x'), 'en').text).toBe('twin brother');
    expect(r.find('x', 'z')).toMatchObject({ key: 'yB', twin: false });
  });

  it('handles multiple spouses', () => {
    expect(rel('f', 'm').english).toBe('wife');
    expect(rel('f', 'f1w').english).toBe('wife');
  });

  it('offers alternatives when people are related in more than one way', () => {
    // a married their first cousin
    const b = new FamilyBuilder();
    for (const [id, gender] of [['gp', 'male'], ['p1', 'male'], ['p2', 'female'], ['a', 'male'], ['c', 'female']] as const) b.person(id, gender);
    b.children(b.union('gp'), ['p1', 'p2']);
    b.children(b.union('p1'), ['a']);
    b.children(b.union('p2'), ['c']);
    b.union('a', 'c');
    const r = new KinshipResolver(b.build()).find('a', 'c');
    expect(r.english).toBe('wife');
    expect(r.alternatives.map((x) => x.english)).toContain('first_cousin');
  });

  it('copes with missing parents and unknown dates', () => {
    const b = new FamilyBuilder().person('x', 'female').person('y', 'male').person('p', 'unknown');
    b.children(b.union('p'), ['x', 'y']);
    const r = new KinshipResolver(b.build()).find('x', 'y');
    // child_order from the builder makes y the younger sibling
    expect(r).toMatchObject({ key: 'yB', english: 'brother' });
  });
});

describe('dictionary overrides', () => {
  it('family terms win over defaults, and apply to generalised keys', () => {
    const r = rel('me', 'fzh');
    expect(labelRelationship(r, 'mr', { 'F.Z.H': 'मामा' })).toEqual({ text: 'मामा', matchedKey: 'F.Z.H', source: 'family' });
    expect(labelRelationship(r, 'mr')).toEqual({ text: 'आतोबा', matchedKey: 'F.Z.H', source: 'default' });
  });

  it('can add a term the defaults lack', () => {
    const r = rel('me', 'shankar');
    expect(labelRelationship(r, 'mr', { 'M.M.B': 'आजीचे भाऊ' }).text).toBe('आजीचे भाऊ');
    expect(labelRelationship(r, 'en', { 'M.M.B': 'great-uncle' }).text).toBe('great-uncle');
  });
});

describe('plain-language labels for distant cousins', () => {
  // Indumati's daughters: Suvarna and (my grandmother) Asha; Suvarna's son Rahul, his son Siddharth
  const b = new FamilyBuilder()
    .person('indu', 'female')
    .person('suvarna', 'female', '1940')
    .person('asha', 'female', '1945')
    .person('mom', 'female')
    .person('me', 'male')
    .person('rahul', 'male')
    .person('sid', 'male')
    .person('kid', 'female')
    .person('priya', 'female')
    .person('sidwife', 'female');
  b.children(b.union('indu'), ['suvarna', 'asha']);
  b.children(b.union('asha'), ['mom']);
  b.children(b.union('mom'), ['me']);
  b.children(b.union('suvarna'), ['rahul']);
  b.children(b.union('rahul', 'priya'), ['sid']);
  b.children(b.union('me'), ['kid']);
  b.union('sid', 'sidwife');
  const r = new KinshipResolver(b.build());

  it('says "mother\'s cousin" instead of "first cousin once removed"', () => {
    const rahul = r.find('me', 'rahul');
    expect(rahul.english).toBe('first_cousin_once_removed');
    expect(labelRelationship(rahul, 'en').text).toBe("mother's cousin");
    expect(labelRelationship(rahul, 'mr').text).toBe('आईचा मावसभाऊ');
  });

  it('says "cousin\'s son" the other way round, and "second cousin" one generation down', () => {
    expect(labelRelationship(r.find('rahul', 'me'), 'en').text).toBe("cousin's son");
    const sid = r.find('me', 'sid');
    expect(labelRelationship(sid, 'en').text).toBe('second cousin');
    expect(labelRelationship(sid, 'mr').text).toBe('आईच्या मावसभावाचा मुलगा');
  });

  it('keeps it plain through marriages ("first cousin twice removed\'s wife" → "grandmother\'s cousin\'s wife")', () => {
    const priya = r.find('kid', 'priya');
    expect(priya.english).toContain('removed');
    expect(labelRelationship(priya, 'en').text).toBe("grandmother's cousin's wife");
    expect(labelRelationship(r.find('kid', 'rahul'), 'en').text).toBe("grandmother's cousin");
    expect(labelRelationship(r.find('rahul', 'kid'), 'en').text).toBe("cousin's granddaughter");
    expect(labelRelationship(r.find('me', 'sidwife'), 'en').text).toBe("second cousin's wife");
    expect(labelRelationship(r.find('priya', 'me'), 'en').text).toBe("husband's cousin's son");
    for (const [a, b] of [['kid', 'priya'], ['me', 'sidwife'], ['priya', 'me']] as const) {
      expect(labelRelationship(r.find(a, b), 'en').text).not.toMatch(/removed|first cousin/);
    }
  });
});
