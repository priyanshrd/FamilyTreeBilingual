import { describe, expect, it } from 'vitest';
import { FamilyBuilder, fixtureFamily } from '@/domain/testing/familyBuilder';
import { familyViewLayout } from './familyView';

const g = fixtureFamily();
const pos = (l: ReturnType<typeof familyViewLayout>, id: string) => l.nodes.find((n) => n.kind === 'person' && n.id === id);

function noOverlaps(l: ReturnType<typeof familyViewLayout>) {
  const people = l.nodes.filter((n) => n.kind === 'person');
  for (const a of people)
    for (const b of people) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
}

describe('family view (hourglass)', () => {
  const l = familyViewLayout(g, 'me');

  it('puts the person in the middle, parents above (father left), grandparents above them', () => {
    const me = pos(l, 'me')!;
    expect(pos(l, 'f')!.y).toBeLessThan(me.y);
    expect(pos(l, 'f')!.x).toBeLessThan(me.x);
    expect(pos(l, 'm')!.x).toBeGreaterThan(me.x);
    expect(pos(l, 'gf')!.y).toBeLessThan(pos(l, 'f')!.y);
    // paternal grandparents above the father's side, maternal above the mother's side
    expect(pos(l, 'gf')!.x).toBeLessThan(pos(l, 'mgf')!.x);
    expect(pos(l, 'ggf')).toBeDefined();
  });

  it('puts siblings to the left, the spouse to the right, children below', () => {
    const me = pos(l, 'me')!;
    for (const s of ['ze', 'by', 'half']) {
      expect(pos(l, s)!.y).toBe(me.y);
      expect(pos(l, s)!.x).toBeLessThan(me.x);
    }
    expect(pos(l, 'wife')!.x).toBeGreaterThan(me.x);
    expect(pos(l, 'wife')!.y).toBe(me.y);
    expect(pos(l, 'son')!.y).toBeGreaterThan(me.y);
    expect(pos(l, 'dau')!.y).toBe(pos(l, 'son')!.y);
  });

  it('leaves uncles, cousins and in-laws for their own view, flagged as "more"', () => {
    expect(pos(l, 'fb')).toBeUndefined();
    expect(pos(l, 'wf')).toBeUndefined();
    expect(l.more.has('wife')).toBe(true); // her parents are not shown
    expect(l.more.has('f')).toBe(true); // first marriage
  });

  it('never overlaps boxes', () => {
    noOverlaps(l);
    noOverlaps(familyViewLayout(g, 'gf'));
    noOverlaps(familyViewLayout(g, 'f'));
  });

  it('keeps a brother beside his sister, not beside her husband (reported case)', () => {
    const b = new FamilyBuilder()
      .person('dadgonda', 'male').person('pushpakala', 'female').person('ellappa', 'male').person('kamala', 'female')
      .person('deepali', 'female', '1977').person('rajendra', 'male').person('rajiv', 'male', '1972').person('priyansh', 'male', '2004');
    b.children(b.union('dadgonda', 'pushpakala'), ['deepali', 'rajendra']);
    b.children(b.union('ellappa', 'kamala'), ['rajiv']);
    b.children(b.union('rajiv', 'deepali'), ['priyansh']);
    const tree = b.build();

    const v = familyViewLayout(tree, 'deepali');
    const deepali = pos(v, 'deepali')!;
    expect(pos(v, 'rajendra')!.x).toBeLessThan(deepali.x); // sibling side
    expect(pos(v, 'rajiv')!.x).toBeGreaterThan(deepali.x); // spouse side
    noOverlaps(v);

    // from Priyansh: father's parents on the left, mother's parents on the right
    const p = familyViewLayout(tree, 'priyansh');
    expect(pos(p, 'ellappa')!.x).toBeLessThan(pos(p, 'dadgonda')!.x);
    expect(pos(p, 'rajendra')).toBeUndefined();
    noOverlaps(p);
  });
});
