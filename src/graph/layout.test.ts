import { describe, expect, it } from 'vitest';
import { fixtureFamily } from '@/domain/testing/familyBuilder';
import { layoutTree, personNodeId } from './layout';
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
