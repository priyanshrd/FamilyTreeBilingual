import { describe, expect, it } from 'vitest';
import { FamilyBuilder, fixtureFamily } from '@/domain/testing/familyBuilder';
import { GenealogyGraph } from './graph';

const g = fixtureFamily();
const sibs = (id: string) =>
  Object.fromEntries(
    g
      .siblings(id)
      .map((s) => [s.id, s.kind])
      .sort(),
  );

describe('GenealogyGraph', () => {
  it('derives parents, children and partners from stored primitives', () => {
    expect(g.parents('me').sort()).toEqual(['f', 'm']);
    expect(g.children('me').sort()).toEqual(['dau', 'son']);
    expect(g.partners('me')).toEqual(['wife']);
  });

  it('supports multiple partners', () => {
    expect(g.partners('f').sort()).toEqual(['f1w', 'm']);
  });

  it('derives full, half and step siblings', () => {
    expect(sibs('me')).toEqual({ by: 'full', half: 'half', ze: 'full' });
    expect(sibs('son')).toEqual({ dau: 'full', wchild: 'half' });
  });

  it('derives adoptive siblings', () => {
    expect(sibs('bys')).toEqual({ adopt: 'adoptive' });
  });

  it('derives step siblings through a parent’s other union', () => {
    // half is f's son with f1w; f1w has no other children → no step siblings for half
    const b = new FamilyBuilder().person('a', 'male').person('mom', 'female').person('step', 'male').person('sc', 'female');
    b.children(b.union('mom'), ['a']);
    b.union('mom', 'step');
    b.children(b.union('step'), ['sc']);
    expect(b.build().siblings('a')).toEqual([{ id: 'sc', kind: 'step', sharedParentIds: [] }]);
  });

  it('derives step-parents', () => {
    expect(g.stepParents('me')).toEqual(['f1w']);
    expect(g.stepParents('wchild')).toEqual(['me']);
  });

  it('walks ancestors and descendants with generation depth', () => {
    const anc = g.ancestors('me');
    expect(anc.get('f')).toBe(1);
    expect(anc.get('gf')).toBe(2);
    expect(anc.get('ggf')).toBe(3);
    expect(anc.get('mggm')).toBe(3);
    expect(g.ancestors('me', 1).size).toBe(2);
    expect([...g.descendants('gf', 2).keys()].sort()).toEqual(['by', 'fb', 'fbd', 'fbs', 'f', 'fz', 'fzs', 'half', 'me', 'ze'].sort());
  });

  it('detects cycles like the database does', () => {
    expect(g.wouldCreateCycle('me', 'gf')).toBe(true);
    expect(g.wouldCreateCycle('me', 'me')).toBe(true);
    expect(g.wouldCreateCycle('gf', 'stranger')).toBe(false);
  });

  it('works out elder/younger from dates, then birth order', () => {
    expect(g.relativeAge('f', 'fb')).toBe('elder');
    expect(g.relativeAge('m', 'mb')).toBe('younger');
    expect(g.relativeAge('fbs', 'fbd')).toBe('younger'); // no dates: child_order
  });

  it('ignores deleted people and edges to them', () => {
    const graph = new GenealogyGraph({
      persons: [
        { id: 'a', gender: 'male' },
        { id: 'b', gender: 'male', deleted: true },
      ],
      unions: [{ id: 'u', partnerIds: ['a', 'b'] }],
      parentChild: [{ parentId: 'b', childId: 'a', lineage: 'biological' }],
    });
    expect(graph.has('b')).toBe(false);
    expect(graph.parents('a')).toEqual([]);
    expect(graph.partners('a')).toEqual([]);
  });

  it('handles people with missing parents and disconnected people', () => {
    expect(g.parents('stranger')).toEqual([]);
    expect(g.siblings('stranger')).toEqual([]);
    expect(g.ancestors('ggf').size).toBe(0);
  });
});
