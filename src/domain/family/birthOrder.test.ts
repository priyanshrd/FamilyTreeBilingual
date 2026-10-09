import { describe, expect, it } from 'vitest';
import { FamilyBuilder } from '@/domain/testing/familyBuilder';
import { areTwins, numberRows, placeNewSibling, rowsFromGroup, siblingGroup } from './birthOrder';

function family() {
  const b = new FamilyBuilder().person('f', 'male').person('m', 'female');
  for (const c of ['a', 'b', 'c']) b.person(c, 'male');
  b.children(b.union('f', 'm'), ['a', 'b', 'c']); // builder sets child_order 1, 2, 3
  return b;
}

describe('birth order', () => {
  it('groups full siblings eldest first', () => {
    const g = siblingGroup(family().build(), 'b')!;
    expect(g.childIds).toEqual(['a', 'b', 'c']);
    expect(g.parentIds.sort()).toEqual(['f', 'm']);
  });

  it('numbers rows, twins share a number', () => {
    const n = numberRows([
      { id: 'a', twinWithPrevious: false },
      { id: 'b', twinWithPrevious: false },
      { id: 'c', twinWithPrevious: true },
    ]);
    expect([...n]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
    ]);
  });

  it('places a new sibling elder, younger or as a twin of the anchor', () => {
    const rows = ['a', 'b', 'c'].map((id) => ({ id, twinWithPrevious: false }));
    expect(placeNewSibling(rows, 'b', 'n', 'elder').map((r) => r.id)).toEqual(['a', 'n', 'b', 'c']);
    expect(placeNewSibling(rows, 'b', 'n', 'younger').map((r) => r.id)).toEqual(['a', 'b', 'n', 'c']);
    const twin = placeNewSibling(rows, 'b', 'n', 'twin');
    expect(numberRows(twin).get('n')).toBe(numberRows(twin).get('b'));
  });

  it('recognises twins from equal numbers, and reads them back as twins', () => {
    const b = new FamilyBuilder().person('f', 'male').person('x', 'female').person('y', 'female');
    const u = b.union('f');
    b.parentChild.push({ parentId: 'f', childId: 'x', lineage: 'biological', unionId: u, childOrder: 1 });
    b.parentChild.push({ parentId: 'f', childId: 'y', lineage: 'biological', unionId: u, childOrder: 1 });
    const g = b.build();
    expect(areTwins(g, 'x', 'y')).toBe(true);
    expect(rowsFromGroup(siblingGroup(g, 'x')!)[1]!.twinWithPrevious).toBe(true);
    expect(areTwins(family().build(), 'a', 'b')).toBe(false);
  });

  it('prefers birth dates over stored order', () => {
    const b = new FamilyBuilder().person('f', 'male').person('old', 'male', '1950').person('young', 'male', '1960');
    b.children(b.union('f'), ['young', 'old']); // stored order says young first
    expect(siblingGroup(b.build(), 'old')!.childIds).toEqual(['old', 'young']);
  });
});
