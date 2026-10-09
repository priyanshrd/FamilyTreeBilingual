// Generation-aware layout. Persons and family units ("unions") are laid out together with dagre:
//   partner → union → child
// so partners share a rank, the union sits between generations and children hang below it.
// Pure: produces positions and edge descriptions; React Flow / SVG export render them.
import dagre from '@dagrejs/dagre';
import type { GenealogyGraph, Lineage } from '@/domain/genealogy/graph';

export const PERSON_W = 192;
export const PERSON_H = 64;
const UNION_SIZE = 10;

export type LaidOutNode =
  | { kind: 'person'; id: string; x: number; y: number; width: number; height: number }
  | { kind: 'union'; id: string; x: number; y: number; width: number; height: number; divorced: boolean };

export type LaidOutEdge = {
  id: string;
  source: string;
  target: string;
  kind: 'partner' | 'child';
  /** for child edges: how the child is related to the parents of this unit */
  lineage: Lineage | 'mixed';
  ended?: boolean;
};

export type TreeLayout = { nodes: LaidOutNode[]; edges: LaidOutEdge[]; width: number; height: number };

export const personNodeId = (id: string) => `p:${id}`;
export const unionNodeId = (id: string) => `u:${id}`;

export function layoutTree(graph: GenealogyGraph, visible: Set<string>): TreeLayout {
  const g = new dagre.graphlib.Graph({ multigraph: false });
  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 36, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const edges: LaidOutEdge[] = [];
  for (const id of visible) g.setNode(personNodeId(id), { width: PERSON_W, height: PERSON_H });

  const unionsDrawn = new Set<string>();
  for (const u of graph.allUnions()) {
    const partners = u.partnerIds.filter((p) => visible.has(p));
    if (partners.length === 0) continue;
    const childIds = new Set<string>();
    for (const p of u.partnerIds) {
      for (const e of graph.childEdges(p)) if (e.unionId === u.id && visible.has(e.childId)) childIds.add(e.childId);
    }
    // a single partner with no children needs no unit node
    if (partners.length === 1 && childIds.size === 0) continue;

    const uid = unionNodeId(u.id);
    unionsDrawn.add(u.id);
    g.setNode(uid, { width: UNION_SIZE, height: UNION_SIZE });
    const ended = u.status === 'divorced' || u.status === 'separated' || u.status === 'annulled';
    for (const p of partners) {
      g.setEdge(personNodeId(p), uid, { weight: 4, minlen: 1 });
      edges.push({ id: `${uid}<${p}`, source: personNodeId(p), target: uid, kind: 'partner', lineage: 'biological', ended });
    }
    for (const c of childIds) {
      g.setEdge(uid, personNodeId(c), { weight: 2, minlen: 1 });
      const lineages = new Set(u.partnerIds.map((p) => graph.edge(p, c)?.lineage).filter(Boolean) as Lineage[]);
      const lineage = lineages.size === 1 ? [...lineages][0]! : 'mixed';
      edges.push({ id: `${uid}>${c}`, source: uid, target: personNodeId(c), kind: 'child', lineage });
    }
  }

  // parent → child links not placed under a drawn union
  for (const id of visible) {
    for (const e of graph.parentEdges(id)) {
      if (!visible.has(e.parentId)) continue;
      if (e.unionId && unionsDrawn.has(e.unionId)) continue;
      g.setEdge(personNodeId(e.parentId), personNodeId(id), { weight: 1, minlen: 2 });
      edges.push({ id: `${e.parentId}>${id}`, source: personNodeId(e.parentId), target: personNodeId(id), kind: 'child', lineage: e.lineage });
    }
  }

  dagre.layout(g);

  const nodes: LaidOutNode[] = g.nodes().map((nid) => {
    const n = g.node(nid);
    const [kind, id] = [nid.slice(0, 1), nid.slice(2)];
    const base = { id, x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height };
    if (kind === 'u') {
      const u = graph.union(id);
      return { ...base, kind: 'union', divorced: u?.status === 'divorced' || u?.status === 'separated' };
    }
    return { ...base, kind: 'person' };
  });
  const graphLabel = g.graph();
  return { nodes, edges, width: graphLabel.width ?? 0, height: graphLabel.height ?? 0 };
}
