// Which people to draw. Large families are shown as a neighbourhood around a focus person.
import type { GenealogyGraph } from '@/domain/genealogy/graph';

/** People within `depth` steps (parent, child or partner links) of `focusId`. */
export function neighbourhood(graph: GenealogyGraph, focusId: string, depth: number): Set<string> {
  const seen = new Set([focusId]);
  let frontier = [focusId];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const linked = [
        ...graph.parentEdges(id).map((e) => e.parentId),
        ...graph.childEdges(id).map((e) => e.childId),
        ...graph.partners(id),
      ];
      for (const n of linked) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}
