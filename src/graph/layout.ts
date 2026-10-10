// "Whole tree" layout, drawn like a classic family tree:
//   - spouses stand side by side as one unit, joined by a short line with the family dot in the middle
//   - one line drops from that dot to a bar over the children, then down to each child
// dagre places the couple units (one node each) generation by generation; people are then placed
// inside their unit. Pure: produces positions and edge descriptions; React Flow / export render them.
import dagre from '@dagrejs/dagre';
import type { GenealogyGraph, Lineage } from '@/domain/genealogy/graph';
export const PERSON_W = 216;
export const PERSON_H = 88;
const UNION_SIZE = 10;
/** space between spouses in a couple unit (holds the family dot) */
const COUPLE_GAP = 44;
/** space between units side by side */
const UNIT_GAP = 56;
/** the bars over children: first one this far below the parents' row, others in lanes below it */
const BUS_FIRST = 34;
const BUS_LANE = 12;

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
  /** which side of the boxes the line attaches to (default: bottom of source → top of target) */
  sourceHandle?: 'b-s' | 'l-s' | 'r-s';
  targetHandle?: 't-t' | 'l-t' | 'r-t';
  /** child lines: how far below the line's start the bar over the children runs (its own lane) */
  bus?: number;
};

export type TreeLayout = { nodes: LaidOutNode[]; edges: LaidOutEdge[]; width: number; height: number };

export const personNodeId = (id: string) => `p:${id}`;
export const unionNodeId = (id: string) => `u:${id}`;

export function layoutTree(graph: GenealogyGraph, visible: Set<string>): TreeLayout {
  // 1. couple units: people joined by partnerships (both visible), in a left-to-right order
  const spouses = new Map<string, Set<string>>();
  for (const u of graph.allUnions()) {
    const ps = u.partnerIds.filter((p) => visible.has(p));
    for (const a of ps) for (const b of ps) if (a !== b) (spouses.get(a) ?? spouses.set(a, new Set()).get(a)!).add(b);
  }
  const unitOf = new Map<string, number>();
  const units: string[][] = [];
  for (const id of [...visible].sort()) {
    if (unitOf.has(id)) continue;
    const members: string[] = [];
    const stack = [id];
    while (stack.length) {
      const x = stack.pop()!;
      if (unitOf.has(x)) continue;
      unitOf.set(x, units.length);
      members.push(x);
      for (const s of spouses.get(x) ?? []) stack.push(s);
    }
    units.push(orderUnit(members, spouses, graph));
  }

  // 2. dagre places the units, parents' unit above each child's unit
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: UNIT_GAP, ranksep: 96, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  units.forEach((m, i) => g.setNode(`k${i}`, { width: m.length * PERSON_W + (m.length - 1) * COUPLE_GAP, height: PERSON_H }));
  for (const id of visible) {
    for (const parent of graph.parents(id)) {
      if (!visible.has(parent)) continue;
      const [from, to] = [unitOf.get(parent)!, unitOf.get(id)!];
      if (from !== to) g.setEdge(`k${from}`, `k${to}`, { weight: 2, minlen: 1 });
    }
  }
  dagre.layout(g);

  // Order and place each generation, top first. dagre only avoids crossings, so on its own it can put
  // someone between a married couple and that couple's brothers and sisters. Here every unit stands
  // under its own parents (a couple joining two families stands between them), overlaps are then
  // pushed apart as little as possible, and in a couple each spouse faces their own family.
  const nodes: LaidOutNode[] = [];
  const at = new Map<string, { x: number; y: number }>();
  const centreOf = (ids: string[]) => {
    const xs = ids.map((p) => at.get(p)).filter(Boolean).map((p) => p!.x + PERSON_W / 2);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const parentsCentre = (id: string) => centreOf(graph.parents(id).filter((x) => visible.has(x)));
  const ranks = new Map<number, number[]>();
  units.forEach((_, i) => {
    const y = Math.round(g.node(`k${i}`).y);
    ranks.set(y, [...(ranks.get(y) ?? []), i]);
  });
  for (const [, inRank] of [...ranks].sort((a, b) => a[0] - b[0])) {
    const items = inRank.map((i) => {
      const n = g.node(`k${i}`);
      const keys = units[i]!.map(parentsCentre).filter((k): k is number => k != null);
      const key = keys.length ? keys.reduce((a, b) => a + b, 0) / keys.length : n.x;
      return { i, key, dagreX: n.x, width: n.width, y: n.y - n.height / 2 };
    });
    items.sort((p, q) => p.key - q.key || p.dagreX - q.dagreX);
    const centres = spreadOut(
      items.map((it) => it.key),
      items.map((it) => it.width),
      UNIT_GAP,
    );
    items.forEach((it, k) => {
      let members = units[it.i]!;
      const leftEdge = centres[k]! - it.width / 2;
      if (members.length === 2) {
        const slot = (s: number) => leftEdge + PERSON_W / 2 + s * (PERSON_W + COUPLE_GAP);
        const cost = (ids: string[]) =>
          ids.reduce((sum, id, s) => {
            const p = parentsCentre(id);
            return sum + (p == null ? 0 : Math.abs(slot(s) - p));
          }, 0);
        const flipped = [members[1]!, members[0]!];
        if (cost(flipped) < cost(members) - 1) members = flipped;
      }
      let x = leftEdge;
      for (const id of members) {
        at.set(id, { x, y: it.y });
        nodes.push({ kind: 'person', id, x, y: it.y, width: PERSON_W, height: PERSON_H });
        x += PERSON_W + COUPLE_GAP;
      }
    });
  }

  // 3. family dots and lines
  const edges: LaidOutEdge[] = [];
  const unionsDrawn = new Set<string>();
  for (const u of graph.allUnions()) {
    const partners = u.partnerIds.filter((p) => visible.has(p));
    if (partners.length === 0) continue;
    const childIds = new Set<string>();
    for (const p of u.partnerIds) for (const e of graph.childEdges(p)) if (e.unionId === u.id && visible.has(e.childId)) childIds.add(e.childId);
    if (partners.length === 1 && childIds.size === 0) continue;

    const uid = unionNodeId(u.id);
    unionsDrawn.add(u.id);
    const ended = u.status === 'divorced' || u.status === 'separated' || u.status === 'annulled';
    const divorced = u.status === 'divorced' || u.status === 'separated';
    const [a, b] = partners.map((p) => at.get(p)!).sort((p, q) => p.x - q.x) as [{ x: number; y: number }, { x: number; y: number } | undefined];
    const left = partners.find((p) => at.get(p) === a)!;
    const right = b && partners.find((p) => at.get(p) === b)!;
    const adjacent = b && Math.abs(b.y - a.y) < 1 && Math.abs(b.x - a.x - PERSON_W - COUPLE_GAP) < 1;
    if (right && adjacent) {
      // on the line between the spouses
      nodes.push({ kind: 'union', id: u.id, x: a.x + PERSON_W + COUPLE_GAP / 2 - UNION_SIZE / 2, y: a.y + PERSON_H / 2 - UNION_SIZE / 2, width: UNION_SIZE, height: UNION_SIZE, divorced });
      edges.push({ id: `${uid}<${left}`, source: personNodeId(left), target: uid, kind: 'partner', lineage: 'biological', ended, sourceHandle: 'r-s', targetHandle: 'l-t' });
      edges.push({ id: `${uid}<${right}`, source: personNodeId(right), target: uid, kind: 'partner', lineage: 'biological', ended, sourceHandle: 'l-s', targetHandle: 'r-t' });
    } else {
      // one parent, or spouses not side by side: the dot sits just below them
      const xs = partners.map((p) => at.get(p)!.x + PERSON_W / 2);
      const y = Math.max(...partners.map((p) => at.get(p)!.y)) + PERSON_H + 12;
      nodes.push({ kind: 'union', id: u.id, x: (Math.min(...xs) + Math.max(...xs)) / 2 - UNION_SIZE / 2, y, width: UNION_SIZE, height: UNION_SIZE, divorced });
      for (const p of partners) edges.push({ id: `${uid}<${p}`, source: personNodeId(p), target: uid, kind: 'partner', lineage: 'biological', ended });
    }
    for (const c of childIds) {
      const lineages = new Set(u.partnerIds.map((p) => graph.edge(p, c)?.lineage).filter(Boolean) as Lineage[]);
      const lineage = lineages.size === 1 ? [...lineages][0]! : 'mixed';
      edges.push({ id: `${uid}>${c}`, source: uid, target: personNodeId(c), kind: 'child', lineage });
    }
  }

  // parent → child links not placed under a drawn family dot
  for (const id of visible) {
    for (const e of graph.parentEdges(id)) {
      if (!visible.has(e.parentId) || (e.unionId && unionsDrawn.has(e.unionId))) continue;
      edges.push({ id: `${e.parentId}>${id}`, source: personNodeId(e.parentId), target: personNodeId(id), kind: 'child', lineage: e.lineage });
    }
  }

  assignBusLanes(nodes, edges);
  const label = g.graph();
  return { nodes, edges, width: label.width ?? 0, height: label.height ?? 0 };
}

/**
 * Left-to-right order of the people in a couple unit: a chain of marriages stays a chain (each
 * spouse next to the person they married); in a plain couple the husband stands on the left.
 */
function orderUnit(members: string[], spouses: Map<string, Set<string>>, graph: GenealogyGraph): string[] {
  if (members.length === 1) return members;
  const inUnit = (x: string) => [...(spouses.get(x) ?? [])].filter((s) => members.includes(s));
  if (members.length === 2) {
    const [a, b] = members as [string, string];
    return graph.person(a)?.gender === 'female' && graph.person(b)?.gender === 'male' ? [b, a] : [a, b];
  }
  // someone married more than once stands in the middle, spouses on both sides
  const hub = [...members].sort((x, y) => inUnit(y).length - inUnit(x).length)[0]!;
  const leaves = members.filter((m) => m !== hub);
  const order = [...leaves.slice(0, Math.ceil(leaves.length / 2)), hub, ...leaves.slice(Math.ceil(leaves.length / 2))];
  // anyone not married to the hub goes next to their own spouse
  for (const m of leaves) {
    if (spouses.get(hub)?.has(m)) continue;
    const partner = inUnit(m)[0];
    if (!partner) continue;
    order.splice(order.indexOf(m), 1);
    order.splice(order.indexOf(partner) + 1, 0, m);
  }
  return order;
}

/**
 * Centres for boxes in one row: each as close as possible to where it wants to be (in this order),
 * without overlapping. Neighbours that would overlap are merged into a block centred on their wishes.
 */
export function spreadOut(wanted: number[], widths: number[], gap: number): number[] {
  type Block = { first: number; last: number; width: number; offsets: number[]; left: number };
  const blocks: Block[] = [];
  const bestLeft = (b: Block) => b.offsets.reduce((sum, o, k) => sum + (wanted[b.first + k]! - o), 0) / b.offsets.length;
  wanted.forEach((_, i) => {
    let b: Block = { first: i, last: i, width: widths[i]!, offsets: [widths[i]! / 2], left: 0 };
    b.left = bestLeft(b);
    while (blocks.length) {
      const prev = blocks[blocks.length - 1]!;
      if (prev.left + prev.width + gap <= b.left) break;
      blocks.pop();
      const shift = prev.width + gap;
      b = { first: prev.first, last: b.last, width: shift + b.width, offsets: [...prev.offsets, ...b.offsets.map((o) => o + shift)], left: 0 };
      b.left = bestLeft(b);
    }
    blocks.push(b);
  });
  return blocks.flatMap((b) => b.offsets.map((o) => b.left + o));
}

/**
 * Lines may cross, but must never lie on top of each other: every family's bar over its children
 * gets its own height ("lane") wherever it would share a stretch with another family's bar from the
 * same row of parents.
 */
function assignBusLanes(nodes: LaidOutNode[], edges: LaidOutEdge[]) {
  const byId = new Map(nodes.map((n) => [n.kind === 'union' ? unionNodeId(n.id) : personNodeId(n.id), n] as const));
  const families = new Map<string, LaidOutEdge[]>();
  for (const e of edges) if (e.kind === 'child') families.set(e.source, [...(families.get(e.source) ?? []), e]);
  type Bar = { source: string; startY: number; rowBottom: number; left: number; right: number };
  const bars: Bar[] = [];
  for (const [source, lines] of families) {
    const s = byId.get(source);
    if (!s) continue;
    const xs = [s.x + s.width / 2, ...lines.map((e) => byId.get(e.target)).filter(Boolean).map((t) => t!.x + t!.width / 2)];
    // the row of parents this family hangs from: its partners' row (a dot sits on or just below it)
    const rowTop = s.kind === 'person' ? s.y : nodes.find((n) => n.kind === 'person' && n.y <= s.y && s.y <= n.y + PERSON_H + 20)?.y ?? s.y;
    bars.push({ source, startY: s.y + s.height, rowBottom: rowTop + PERSON_H, left: Math.min(...xs), right: Math.max(...xs) });
  }
  const rows = new Map<number, Bar[]>();
  for (const b of bars) rows.set(Math.round(b.rowBottom), [...(rows.get(Math.round(b.rowBottom)) ?? []), b]);
  for (const [, row] of rows) {
    row.sort((a, b) => a.left - b.left || a.right - b.right);
    const laneEnds: number[] = [];
    for (const b of row) {
      let lane = laneEnds.findIndex((end) => end + 10 < b.left);
      if (lane === -1) lane = laneEnds.push(b.right) - 1;
      else laneEnds[lane] = b.right;
      const busY = b.rowBottom + BUS_FIRST + lane * BUS_LANE;
      for (const e of families.get(b.source)!) e.bus = Math.max(8, busY - b.startY);
    }
  }
}
