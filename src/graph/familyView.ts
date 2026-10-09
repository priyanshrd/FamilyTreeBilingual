// "Family view": an hourglass chart around one person, like an org-chart explorer.
//
//            great-grandparents
//               grandparents          (father's side left, mother's side right)
//                 parents
//   siblings …   [ PERSON ] — spouse(s)
//                 children            (grouped under the right partnership)
//
// Tapping someone only selects them; their "+ family" badge (or a double-click, or "Show family"
// in their panel) re-centres the view on them. People with more family beyond the view are
// flagged `more` for that badge.
import type { GenealogyGraph, Lineage } from '@/domain/genealogy/graph';
import { KIN_LINEAGES } from '@/domain/genealogy/graph';
import { PERSON_H, PERSON_W, personNodeId, unionNodeId, type LaidOutEdge, type LaidOutNode, type TreeLayout } from './layout';

const GAP_X = 28;
const STEP_X = PERSON_W + GAP_X;
const ROW = PERSON_H + 76; // vertical distance between generations
const DOT = 10;

export type FamilyViewOptions = { ancestorLevels?: number };

export type FamilyViewLayout = TreeLayout & { more: Set<string> };

export function familyViewLayout(graph: GenealogyGraph, focusId: string, opts: FamilyViewOptions = {}): FamilyViewLayout {
  const levels = Math.max(1, Math.min(opts.ancestorLevels ?? 3, 4));
  const nodes = new Map<string, LaidOutNode>();
  const edges: LaidOutEdge[] = [];
  const person = (id: string, x: number, y: number) => {
    if (!nodes.has(personNodeId(id))) nodes.set(personNodeId(id), { kind: 'person', id, x, y, width: PERSON_W, height: PERSON_H });
  };
  const dot = (key: string, x: number, y: number, divorced = false) => {
    const id = unionNodeId(key);
    if (!nodes.has(id)) nodes.set(id, { kind: 'union', id: key, x: x - DOT / 2, y: y - DOT / 2, width: DOT, height: DOT, divorced });
    return id;
  };
  const centerX = (id: string) => {
    const n = nodes.get(personNodeId(id));
    return n ? n.x + n.width / 2 : 0;
  };
  const lineageBetween = (parents: string[], child: string): Lineage | 'mixed' => {
    const l = new Set(parents.map((p) => graph.edge(p, child)?.lineage ?? 'unknown'));
    return l.size === 1 ? [...l][0]! : 'mixed';
  };

  /** Parents for display: biological first, father (male) on the left. */
  const parentsOf = (id: string): string[] => {
    const edges = [...graph.parentEdges(id, KIN_LINEAGES)].sort(
      (a, b) => Number(a.lineage !== 'biological') - Number(b.lineage !== 'biological'),
    );
    const ids = edges.map((e) => e.parentId).slice(0, 2);
    return ids.sort((a, b) => genderRank(graph.person(a)?.gender) - genderRank(graph.person(b)?.gender));
  };

  // --- focus row -------------------------------------------------------------
  person(focusId, -PERSON_W / 2, 0);

  // --- ancestors: binary slots, so each couple sits centred above their child -------
  const unionDivorced = (a: string, b: string) =>
    graph.unionsOf(a).some((u) => u.partnerIds.includes(b) && (u.status === 'divorced' || u.status === 'separated'));
  const placeAncestors = (childId: string, level: number, slotX: number) => {
    if (level > levels) return;
    const parents = parentsOf(childId);
    if (!parents.length) return;
    const spread = (STEP_X * 2 ** (levels - level)) / 2;
    const y = -level * ROW;
    if (parents.length === 2) {
      const [a, b] = parents as [string, string];
      person(a, slotX - spread - PERSON_W / 2, y);
      person(b, slotX + spread - PERSON_W / 2, y);
      const d = dot(`anc:${childId}`, slotX, y + PERSON_H + 24, unionDivorced(a, b));
      edges.push(partnerEdge(a, d), partnerEdge(b, d));
      edges.push({ id: `${d}>${childId}`, source: d, target: personNodeId(childId), kind: 'child', lineage: lineageBetween(parents, childId) });
      placeAncestors(a, level + 1, slotX - spread);
      placeAncestors(b, level + 1, slotX + spread);
    } else {
      const [a] = parents as [string];
      person(a, slotX - PERSON_W / 2, y);
      edges.push({ id: `${a}>${childId}`, source: personNodeId(a), target: personNodeId(childId), kind: 'child', lineage: lineageBetween([a], childId) });
      placeAncestors(a, level + 1, slotX);
    }
  };
  placeAncestors(focusId, 1, 0);

  // --- siblings, to the left, oldest furthest left -----------------------------
  const focusParents = parentsOf(focusId);
  const parentDot = focusParents.length === 2 ? unionNodeId(`anc:${focusId}`) : null;
  const siblings = graph
    .siblings(focusId)
    .filter((s) => s.kind !== 'step')
    .sort((a, b) => (graph.relativeAge(a.id, b.id) === 'elder' ? 1 : graph.relativeAge(a.id, b.id) === 'younger' ? -1 : 0));
  siblings.forEach((s, i) => {
    person(s.id, -PERSON_W / 2 - (siblings.length - i) * STEP_X, 0);
    const shared = s.sharedParentIds.filter((p) => nodes.has(personNodeId(p)));
    if (parentDot && shared.length === 2) {
      edges.push({ id: `${parentDot}>${s.id}`, source: parentDot, target: personNodeId(s.id), kind: 'child', lineage: lineageBetween(shared, s.id) });
    } else {
      for (const p of shared) {
        edges.push({ id: `${p}>${s.id}`, source: personNodeId(p), target: personNodeId(s.id), kind: 'child', lineage: lineageBetween([p], s.id) });
      }
    }
  });

  // --- partnerships to the right, children grouped below each ----------------------
  const unions = graph.unionsOf(focusId);
  const groups: { dotId: string; dotX: number; children: string[]; parents: string[] }[] = [];
  let partnerIndex = 0;
  unions.forEach((u, ui) => {
    const partners = u.partnerIds.filter((p) => p !== focusId);
    const children = [
      ...new Set(
        graph
          .childEdges(focusId)
          .filter((e) => e.unionId === u.id)
          .map((e) => e.childId),
      ),
    ];
    if (!partners.length && !children.length) return;
    const dotY = PERSON_H + 20 + ui * 10;
    let dotX = 0;
    if (partners.length) {
      const partner = partners[0]!;
      partnerIndex++;
      person(partner, -PERSON_W / 2 + partnerIndex * STEP_X, 0);
      dotX = centerX(partner) - STEP_X / 2;
    }
    const d = dot(u.id, dotX, dotY, u.status === 'divorced' || u.status === 'separated');
    edges.push(partnerEdge(focusId, d));
    if (partners.length) edges.push(partnerEdge(partners[0]!, d));
    groups.push({ dotId: d, dotX, children, parents: u.partnerIds });
  });
  // children whose parent link is not under any partnership
  const loose = graph
    .childEdges(focusId)
    .filter((e) => !e.unionId || !unions.some((u) => u.id === e.unionId))
    .map((e) => e.childId);
  if (loose.length) groups.push({ dotId: personNodeId(focusId), dotX: 0, children: [...new Set(loose)], parents: [focusId] });

  // lay children out left to right, each group centred under its dot where there is room
  let cursor = -Infinity;
  for (const g of groups) {
    if (!g.children.length) continue;
    const sorted = g.children.sort((a, b) => (graph.relativeAge(a, b) === 'elder' ? 1 : graph.relativeAge(a, b) === 'younger' ? -1 : 0));
    const width = sorted.length * STEP_X - GAP_X;
    const start = Math.max(g.dotX - width / 2, cursor);
    sorted.forEach((c, i) => {
      person(c, start + i * STEP_X, ROW);
      edges.push({ id: `${g.dotId}>${c}`, source: g.dotId, target: personNodeId(c), kind: 'child', lineage: lineageBetween(g.parents.filter((p) => graph.edge(p, c)), c) });
    });
    cursor = start + width + GAP_X;
  }

  // --- who has family beyond the view --------------------------------------------
  const shown = new Set([...nodes.values()].filter((n) => n.kind === 'person').map((n) => n.id));
  const more = new Set<string>();
  for (const id of shown) {
    const relatives = [...graph.parents(id), ...graph.children(id), ...graph.partners(id)];
    if (relatives.some((r) => !shown.has(r))) more.add(id);
  }

  const all = [...nodes.values()];
  const minX = Math.min(...all.map((n) => n.x));
  const maxX = Math.max(...all.map((n) => n.x + n.width));
  const minY = Math.min(...all.map((n) => n.y));
  const maxY = Math.max(...all.map((n) => n.y + n.height));
  return { nodes: all, edges, width: maxX - minX, height: maxY - minY, more };
}

function partnerEdge(personId: string, dotId: string): LaidOutEdge {
  return { id: `${dotId}<${personId}`, source: personNodeId(personId), target: dotId, kind: 'partner', lineage: 'biological' };
}

function genderRank(g: string | undefined) {
  return g === 'male' ? 0 : g === 'female' ? 2 : 1;
}
