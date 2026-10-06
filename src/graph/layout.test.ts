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

  it('lays out only the neighbourhood when focused', () => {
    const near = neighbourhood(g, 'me', 1);
    expect([...near].sort()).toEqual(['by', 'dau', 'f', 'm', 'me', 'son', 'wife'].filter((x) => x !== 'by').sort());
    const small = layoutTree(g, near);
    expect(small.nodes.filter((n) => n.kind === 'person')).toHaveLength(near.size);
  });
});
