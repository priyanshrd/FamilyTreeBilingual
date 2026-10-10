import { describe, expect, it } from 'vitest';
import { FamilyBuilder, fixtureFamily } from '@/domain/testing/familyBuilder';
import { layoutTree, personNodeId, spreadOut } from './layout';
import { neighbourhood } from './projection';

const g = fixtureFamily();

describe('tree layout', () => {
  const all = new Set(g.allPeople().map((p) => p.id));
  const layout = layoutTree(g, all);
  const pos = (id: string) => layout.nodes.find((n) => n.kind === 'person' && n.id === id)!;

  it('places every visible person once', () => {
    expect(layout.nodes.filter((n) => n.kind === 'person')).toHaveLength(all.size);
  });

  it('puts generations in order, and partners on the same row', () => {
    expect(pos('gf').y).toBeLessThan(pos('f').y);
    expect(pos('f').y).toBeLessThan(pos('me').y);
    expect(pos('me').y).toBeLessThan(pos('son').y);
    expect(pos('f').y).toBe(pos('m').y);
    expect(pos('me').y).toBe(pos('wife').y);
  });

  it('draws children from the family unit, styled by lineage', () => {
    const adopt = layout.edges.find((e) => e.target === personNodeId('adopt'))!;
    expect(adopt.lineage).toBe('adoptive');
    expect(layout.edges.find((e) => e.target === personNodeId('me'))!.source.startsWith('u:')).toBe(true);
  });

  it('marks divorced partnerships', () => {
    expect(layout.edges.filter((e) => e.kind === 'partner' && e.ended).length).toBeGreaterThan(0);
  });

  it('stands spouses side by side with the family dot on the line between them', () => {
    const [me, wife] = [pos('me'), pos('wife')];
    expect(Math.abs(me.x - wife.x)).toBe(me.width + 44);
    const dot = layout.nodes.find((n) => n.kind === 'union' && layout.edges.some((e) => e.target === `u:${n.id}` && e.source === personNodeId('me')) && layout.edges.some((e) => e.target === `u:${n.id}` && e.source === personNodeId('wife')))!;
    expect(dot.x).toBeGreaterThan(Math.min(me.x, wife.x) + me.width);
    expect(dot.x + dot.width).toBeLessThan(Math.max(me.x, wife.x));
    expect(dot.y + dot.height / 2).toBe(me.y + me.height / 2);
  });

  it('puts someone married twice between both spouses (husband left in a couple)', () => {
    const [f1w, f, m] = [pos('f1w'), pos('f'), pos('m')];
    expect(f.y).toBe(m.y);
    expect([f1w.x, m.x].some((x) => x < f.x) && [f1w.x, m.x].some((x) => x > f.x)).toBe(true);
    expect(pos('gf').x).toBeLessThan(pos('gm').x);
  });

  it('never overlaps boxes', () => {
    const people = layout.nodes.filter((n) => n.kind === 'person');
    for (const a of people)
      for (const b of people) {
        if (a === b) continue;
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
  });

  it('lays out only the neighbourhood when focused', () => {
    const near = neighbourhood(g, 'me', 1);
    expect([...near].sort()).toEqual(['by', 'dau', 'f', 'm', 'me', 'son', 'wife'].filter((x) => x !== 'by').sort());
    const small = layoutTree(g, near);
    expect(small.nodes.filter((n) => n.kind === 'person')).toHaveLength(near.size);
  });
});

describe('order within a generation, and lines that never lie on top of each other', () => {
  // the reported family: Rajashree (Rajiv's sister) was drawn between Deepali and Deepali's brother
  const b = new FamilyBuilder();
  for (const [id, g] of [
    ['balgonda', 'male'], ['indumati', 'female'], ['tatya', 'male'], ['ratnabai', 'female'], ['tavanappa', 'male'],
    ['pushpakala', 'female'], ['dadgonda', 'male'], ['ellappa', 'male'], ['kamala', 'female'],
    ['rupali', 'female'], ['rajendra', 'male'], ['deepali', 'female'], ['rajashree', 'female'], ['rajiv', 'male'], ['sanjeev', 'male'],
    ['priyansh', 'male'],
  ] as const) b.person(id, g);
  b.children(b.union('balgonda', 'indumati'), ['pushpakala']);
  b.children(b.union('tatya', 'ratnabai'), ['dadgonda']);
  b.children(b.union('tavanappa'), ['ellappa']);
  b.children(b.union('dadgonda', 'pushpakala'), ['rupali', 'rajendra', 'deepali']);
  b.children(b.union('ellappa', 'kamala'), ['rajashree', 'rajiv', 'sanjeev']);
  b.children(b.union('rajiv', 'deepali'), ['priyansh']);
  const tree = b.build();
  const l = layoutTree(tree, new Set(tree.allPeople().map((p) => p.id)));
  const x = (id: string) => l.nodes.find((n) => n.kind === 'person' && n.id === id)!.x;

  it("keeps brothers and sisters together, the couple between the two families (reported case)", () => {
    // whichever way round the families are drawn: each spouse's brothers and sisters on their side
    const side = Math.sign(x('rajiv') - x('deepali'));
    for (const sib of ['rajashree', 'sanjeev']) expect(Math.sign(x(sib) - x('rajiv'))).toBe(side);
    for (const sib of ['rupali', 'rajendra']) expect(Math.sign(x(sib) - x('deepali'))).toBe(-side);
  });

  it('never lets two families\' bars over their children lie on top of each other', () => {
    for (const layout of [l, layoutTree(g, new Set(g.allPeople().map((p) => p.id)))]) {
      const nodeAt = new Map(layout.nodes.map((n) => [n.kind === 'union' ? `u:${n.id}` : `p:${n.id}`, n] as const));
      const bars = new Map<string, { y: number; left: number; right: number }>();
      for (const e of layout.edges.filter((x) => x.kind === 'child')) {
        const s = nodeAt.get(e.source)!;
        const t = nodeAt.get(e.target)!;
        expect(e.bus, `${e.id} has a bar height`).toBeGreaterThan(0);
        const y = s.y + s.height + e.bus!;
        expect(y, `${e.id}: bar above the child`).toBeLessThan(t.y);
        const xs = [s.x + s.width / 2, t.x + t.width / 2];
        const bar = bars.get(e.source) ?? { y, left: Infinity, right: -Infinity };
        bars.set(e.source, { y, left: Math.min(bar.left, ...xs), right: Math.max(bar.right, ...xs) });
      }
      const list = [...bars.entries()];
      for (const [i, [ida, a]] of list.entries())
        for (const [idb, bb] of list.slice(i + 1)) {
          const shareStretch = a.left < bb.right - 1 && bb.left < a.right - 1;
          if (shareStretch) expect(Math.abs(a.y - bb.y), `${ida} and ${idb} overlap`).toBeGreaterThan(4);
        }
    }
  });
});

describe('spreadOut', () => {
  it('keeps boxes where they want to be when there is room, and pushes overlapping ones apart evenly', () => {
    expect(spreadOut([0, 500], [100, 100], 20)).toEqual([0, 500]);
    expect(spreadOut([100, 100], [100, 100], 20)).toEqual([40, 160]);
  });
});
