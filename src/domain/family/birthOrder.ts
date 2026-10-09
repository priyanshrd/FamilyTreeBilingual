// Birth order among brothers and sisters, for when birth dates are missing.
// Stored as parent_child.child_order: 1 = eldest. Twins (and triplets) share the same number.
import type { GenealogyGraph } from '@/domain/genealogy/graph';
import { KIN_LINEAGES } from '@/domain/genealogy/graph';

export type SiblingGroup = {
  /** the family unit the children belong to (null when the parents are not in a union) */
  unionId: string | null;
  parentIds: string[];
  /** children, eldest first */
  childIds: string[];
  /** current stored order per child (null = not set) */
  orders: Map<string, number | null>;
};

/** The person together with their full brothers and sisters (children of the same parents), eldest first. */
export function siblingGroup(graph: GenealogyGraph, personId: string): SiblingGroup | null {
  const edges = graph.parentEdges(personId, KIN_LINEAGES);
  if (!edges.length) return null;
  const unionId = edges.find((e) => e.unionId)?.unionId ?? null;
  const parentIds = edges.filter((e) => (unionId ? e.unionId === unionId : true)).map((e) => e.parentId);

  const children = new Set<string>();
  for (const p of parentIds) {
    for (const e of graph.childEdges(p, KIN_LINEAGES)) {
      if (unionId ? e.unionId === unionId : true) children.add(e.childId);
    }
  }
  const orders = new Map<string, number | null>();
  for (const c of children) {
    const e = graph.parentEdges(c).find((x) => parentIds.includes(x.parentId));
    orders.set(c, e?.childOrder ?? null);
  }
  const childIds = [...children].sort((a, b) => {
    const age = graph.relativeAge(a, b); // b relative to a: 'elder' → b first
    if (age === 'elder') return 1;
    if (age === 'younger') return -1;
    return (orders.get(a) ?? Infinity) - (orders.get(b) ?? Infinity);
  });
  return { unionId, parentIds, childIds, orders };
}

export type OrderRow = { id: string; twinWithPrevious: boolean };

/** Rows in order (eldest first) → birth-order numbers; a twin gets the same number as the row above. */
export function numberRows(rows: OrderRow[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  rows.forEach((r, i) => {
    if (!(i > 0 && r.twinWithPrevious)) n++;
    out.set(r.id, n);
  });
  return out;
}

/** Rows for editing, from the current group: twins are consecutive children with the same stored number. */
export function rowsFromGroup(group: SiblingGroup): OrderRow[] {
  return group.childIds.map((id, i) => {
    const prev = group.childIds[i - 1];
    const o = group.orders.get(id);
    return { id, twinWithPrevious: Boolean(prev && o != null && o === group.orders.get(prev)) };
  });
}

export type RelativePosition = 'elder' | 'younger' | 'twin';

/** Places a newly added sibling relative to the person they were added from. */
export function placeNewSibling(rows: OrderRow[], anchorId: string, newId: string, position: RelativePosition): OrderRow[] {
  const out = rows.filter((r) => r.id !== newId);
  const i = out.findIndex((r) => r.id === anchorId);
  if (i < 0) return [...out, { id: newId, twinWithPrevious: false }];
  if (position === 'elder') out.splice(i, 0, { id: newId, twinWithPrevious: false });
  else out.splice(i + 1, 0, { id: newId, twinWithPrevious: position === 'twin' });
  // a sibling inserted before someone who was "twin of the previous" must not become their twin
  if (position === 'elder' && out[i + 1]) out[i + 1] = { ...out[i + 1]!, twinWithPrevious: false };
  return out;
}

/** Twins: share a parent and the same birth-order number. */
export function areTwins(graph: GenealogyGraph, a: string, b: string): boolean {
  return graph.isTwin(a, b);
}
