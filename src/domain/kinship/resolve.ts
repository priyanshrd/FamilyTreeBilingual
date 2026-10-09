// Relationship resolver: how is person B related to person A?
// Everything is calculated from the stored primitives (unions + parent→child edges); nothing is
// read from or written to the database here.
//
//  1. Blood: lowest common ancestors → (up, down) generations → parent / sibling / cousin …
//  2. Direct non-kin parentage: step / foster / guardian edges
//  3. Marriage: blood · spouse · blood (in-laws, step-relations, co-parents-in-law),
//     and spouse · blood · spouse (e.g. husband's brother's wife)
import type { Gender, GenealogyGraph, Lineage } from '@/domain/genealogy/graph';
import { KIN_LINEAGES } from '@/domain/genealogy/graph';
import { stepCode, type RelativeAge, type StepType } from './codes';
import { bloodEnglishId, spouseWord, type Side } from './english';

export type KinStep = {
  from: string;
  to: string;
  type: StepType;
  code: string;
  lineage?: Lineage;
  half?: boolean;
  relativeAge?: RelativeAge;
  twin?: boolean;
};

export type RelationshipKind = 'self' | 'blood' | 'affinal' | 'step' | 'none';

export type KinshipResult = {
  kind: RelationshipKind;
  /** Canonical kinship path, e.g. 'M.M.eB'. Empty for self / none. */
  key: string;
  /** Readable English identifier, e.g. 'maternal_grand_uncle'. */
  english: string;
  steps: KinStep[];
  /** People along the path, A first and B last (siblings link directly, the shared parent is skipped). */
  personPath: string[];
  /** For blood relations: generations up to the common ancestor and down from it. */
  generations: { up: number; down: number } | null;
  cousin: { degree: number; removed: number } | null;
  side: Side;
  half: boolean;
  /** A and B are twins (only for a direct sibling relationship). */
  twin: boolean;
  /** The path goes through an adoption. */
  adoptive: boolean;
  alternatives: KinshipResult[];
};

type Segment = {
  steps: KinStep[];
  personPath: string[];
  up: number;
  down: number;
  side: Side;
  half: boolean;
  adoptive: boolean;
  english: string;
};

type Candidate = Omit<KinshipResult, 'alternatives'> & { distance: number; hops: number };

const MAX_AFFINAL_DISTANCE = 7;
const LINEAGE_RANK: Record<Lineage, number> = { biological: 0, unknown: 1, adoptive: 2, step: 3, foster: 3, guardian: 3 };

export class KinshipResolver {
  private readonly ancestorCache = new Map<string, Map<string, { depth: number; prev: string | null }>>();
  private readonly bloodCache = new Map<string, Segment[]>();

  constructor(private readonly g: GenealogyGraph) {}

  find(a: string, b: string): KinshipResult {
    if (!this.g.has(a) || !this.g.has(b)) return none();
    if (a === b) return { ...none(), kind: 'self', english: 'self', personPath: [a] };

    const candidates: Candidate[] = [];

    for (const seg of this.blood(a, b)) {
      const cousin = seg.up >= 2 && seg.down >= 2 ? { degree: Math.min(seg.up, seg.down) - 1, removed: Math.abs(seg.up - seg.down) } : null;
      const base = fromSegment(seg);
      candidates.push({
        ...base,
        english: base.twin ? `twin_${base.english}` : base.english,
        kind: 'blood',
        generations: { up: seg.up, down: seg.down },
        cousin,
        distance: seg.up + seg.down,
        hops: 0,
      });
    }

    candidates.push(...this.directNonKin(a, b));
    candidates.push(...this.affinal(a, b));

    if (candidates.length === 0) return { ...none(), personPath: [] };

    const byKey = new Map<string, Candidate>();
    for (const c of candidates.sort(compareCandidates)) if (!byKey.has(c.key)) byKey.set(c.key, c);
    const [primary, ...rest] = [...byKey.values()];
    const alternatives = rest
      .filter((c) => c.distance <= primary!.distance + 3)
      // for a blood relative, routes through marriages are just detours (e.g. "son's wife's son")
      .filter((c) => primary!.kind !== 'blood' || c.kind === 'blood')
      .slice(0, 5)
      .map((c) => ({ ...strip(c), alternatives: [] }));
    return { ...strip(primary!), alternatives };
  }

  // -------------------------------------------------------------------------
  // Blood
  // -------------------------------------------------------------------------

  /** Ancestors (including self at depth 0) with a back-pointer for path reconstruction. */
  private ancestors(id: string) {
    let map = this.ancestorCache.get(id);
    if (map) return map;
    map = new Map([[id, { depth: 0, prev: null as string | null }]]);
    let frontier = [id];
    for (let depth = 1; frontier.length; depth++) {
      const next: string[] = [];
      for (const child of frontier) {
        const edges = [...this.g.parentEdges(child, KIN_LINEAGES)].sort(
          (x, y) => LINEAGE_RANK[x.lineage] - LINEAGE_RANK[y.lineage] || x.parentId.localeCompare(y.parentId),
        );
        for (const e of edges) {
          if (map.has(e.parentId)) continue;
          map.set(e.parentId, { depth, prev: child });
          next.push(e.parentId);
        }
      }
      frontier = next;
    }
    this.ancestorCache.set(id, map);
    return map;
  }

  /** Blood paths from a to b through each lowest common ancestor, best first. */
  blood(a: string, b: string): Segment[] {
    const cacheKey = `${a}|${b}`;
    const cached = this.bloodCache.get(cacheKey);
    if (cached) return cached;

    const ancA = this.ancestors(a);
    const ancB = this.ancestors(b);
    const common = [...ancA.keys()].filter((id) => ancB.has(id));
    // lowest: not an ancestor of another common ancestor
    const lowest = common.filter((c) => !common.some((d) => d !== c && this.ancestors(d).has(c)));
    const segments = lowest
      .map((c) => this.segmentVia(b, c, ancA, ancB))
      .sort((x, y) => x.up + x.down - (y.up + y.down) || Number(x.adoptive) - Number(y.adoptive));
    this.bloodCache.set(cacheKey, segments);
    return segments;
  }

  bestBlood(a: string, b: string): Segment | null {
    if (a === b) return emptySegment(a);
    return this.blood(a, b)[0] ?? null;
  }

  private segmentVia(
    b: string,
    lca: string,
    ancA: Map<string, { depth: number; prev: string | null }>,
    ancB: Map<string, { depth: number; prev: string | null }>,
  ): Segment {
    const trace = (anc: typeof ancA, from: string) => {
      const path = [from];
      for (let cur = anc.get(from)!.prev; cur; cur = anc.get(cur)!.prev) path.push(cur);
      return path; // lca … start
    };
    const upPath = trace(ancA, lca).reverse(); // a … lca
    const downPath = trace(ancB, lca); // lca … b
    const up = upPath.length - 1;
    const down = downPath.length - 1;

    const steps: KinStep[] = [];
    const parentStep = (child: string, parent: string): KinStep => ({
      from: child,
      to: parent,
      type: 'parent',
      code: stepCode('parent', this.gender(parent)),
      lineage: this.g.edge(parent, child)?.lineage,
    });
    const childStep = (parent: string, child: string): KinStep => ({
      from: parent,
      to: child,
      type: 'child',
      code: stepCode('child', this.gender(child)),
      lineage: this.g.edge(parent, child)?.lineage,
    });

    let personPath: string[];
    let half = false;
    if (up === 0) {
      for (let i = 0; i < down; i++) steps.push(childStep(downPath[i]!, downPath[i + 1]!));
      personPath = downPath;
    } else if (down === 0) {
      for (let i = 0; i < up; i++) steps.push(parentStep(upPath[i]!, upPath[i + 1]!));
      personPath = upPath;
    } else {
      for (let i = 0; i < up - 1; i++) steps.push(parentStep(upPath[i]!, upPath[i + 1]!));
      const x = upPath[up - 1]!;
      const y = downPath[1]!;
      half = this.isHalf(x, y);
      const age = this.g.relativeAge(x, y);
      const ex = this.g.edge(lca, x)?.lineage;
      const ey = this.g.edge(lca, y)?.lineage;
      steps.push({
        from: x,
        to: y,
        type: 'sibling',
        code: stepCode('sibling', this.gender(y), age),
        lineage: ex === 'adoptive' || ey === 'adoptive' ? 'adoptive' : ex,
        half,
        relativeAge: age,
        twin: this.g.isTwin(x, y),
      });
      for (let i = 1; i < down; i++) steps.push(childStep(downPath[i]!, downPath[i + 1]!));
      personPath = [...upPath.slice(0, up), ...downPath.slice(1)];
    }

    const first = steps[0]?.code;
    const side: Side = up >= 2 ? (first === 'F' ? 'paternal' : first === 'M' ? 'maternal' : null) : null;
    return {
      steps,
      personPath,
      up,
      down,
      side,
      half,
      adoptive: steps.some((s) => s.lineage === 'adoptive'),
      english: bloodEnglishId(up, down, this.gender(b), side, half),
    };
  }

  private isHalf(x: string, y: string): boolean {
    const px = this.g.parents(x);
    const py = this.g.parents(y);
    const shared = px.filter((p) => py.includes(p));
    return px.length === 2 && py.length === 2 && shared.length === 1;
  }

  // -------------------------------------------------------------------------
  // Direct step / foster / guardian parentage
  // -------------------------------------------------------------------------
  private directNonKin(a: string, b: string): Candidate[] {
    const out: Candidate[] = [];
    const nonKin = (e: { lineage: Lineage } | undefined) => e && !KIN_LINEAGES.has(e.lineage) ? e.lineage : null;
    const asParent = nonKin(this.g.edge(b, a));
    if (asParent) {
      const g = this.gender(b);
      out.push(this.simple(a, b, 'parent', asParent, nonKinParentEnglish(asParent, g)));
    }
    const asChild = nonKin(this.g.edge(a, b));
    if (asChild) {
      const g = this.gender(b);
      out.push(this.simple(a, b, 'child', asChild, nonKinChildEnglish(asChild, g)));
    }
    return out;
  }

  private simple(a: string, b: string, type: StepType, lineage: Lineage, english: string): Candidate {
    const code = stepCode(type, this.gender(b));
    return {
      kind: 'step',
      key: code,
      english,
      steps: [{ from: a, to: b, type, code, lineage }],
      personPath: [a, b],
      generations: null,
      cousin: null,
      side: null,
      half: false,
      twin: false,
      adoptive: false,
      distance: 1,
      hops: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Marriage
  // -------------------------------------------------------------------------
  private affinal(a: string, b: string): Candidate[] {
    const out: Candidate[] = [];
    const kinParents = new Set(this.g.parents(a));
    const kinChildren = new Set(this.g.children(a));
    const kinSiblings = new Set(this.g.siblings(a).filter((s) => s.kind !== 'step').map((s) => s.id));

    // blood · spouse · blood
    for (const u of this.g.allUnions()) {
      for (const r of u.partnerIds) {
        for (const x of u.partnerIds) {
          if (r === x || x === a || r === b) continue;
          const segA = this.bestBlood(a, r);
          if (!segA) continue;
          const segB = this.bestBlood(x, b);
          if (!segB) continue;
          const distance = len(segA) + 1 + len(segB);
          if (distance > MAX_AFFINAL_DISTANCE) continue;

          const pa = shape(segA);
          const pb = shape(segB);
          // Skip step readings of people who are actually our own parents / children / siblings.
          if (pa === '1,0' && pb === '0,0' && kinParents.has(b)) continue;
          if (pa === '0,0' && pb === '0,1' && kinChildren.has(b)) continue;
          if (pa === '1,0' && pb === '0,1' && (kinSiblings.has(b) || b === a)) continue;

          const spouse: KinStep = { from: r, to: x, type: 'spouse', code: stepCode('spouse', this.gender(x)) };
          const { english, kind } = this.affinalEnglish(segA, x, segB, b);
          out.push(
            this.combine([segA, spouse, segB], { english, kind, side: segA.side, distance, hops: 1 }),
          );
        }
      }
    }

    // spouse · blood · spouse (and co-spouses)
    for (const s of this.g.partners(a)) {
      for (const t of this.g.partners(b)) {
        if (s === b || t === a) continue;
        const seg = this.bestBlood(s, t);
        if (!seg) continue;
        const distance = 2 + len(seg);
        if (distance > MAX_AFFINAL_DISTANCE) continue;
        const first: KinStep = { from: a, to: s, type: 'spouse', code: stepCode('spouse', this.gender(s)) };
        const last: KinStep = { from: t, to: b, type: 'spouse', code: stepCode('spouse', this.gender(b)) };
        const sw1 = spouseWord(this.gender(s));
        const sw2 = spouseWord(this.gender(b));
        const english =
          s === t
            ? `${sw1}_s_${sw2}`
            : shape(seg) === '1,1'
              ? word(this.gender(b), 'brother_in_law', 'sister_in_law', 'sibling_in_law')
              : `${sw1}_s_${seg.english}_s_${sw2}`;
        out.push(this.combine([first, seg, last], { english, kind: 'affinal', side: null, distance, hops: 2 }));
      }
    }
    return out;
  }

  private affinalEnglish(segA: Segment, x: string, segB: Segment, b: string): { english: string; kind: RelationshipKind } {
    const gb = this.gender(b);
    const sw = spouseWord(this.gender(x));
    const pa = shape(segA);
    const pb = shape(segB);
    const w = (m: string, f: string, n: string) => word(gb, m, f, n);

    if (pa === '0,0' && pb === '0,0') return { english: sw, kind: 'affinal' };
    if (pa === '0,0') {
      const special: Record<string, [string, RelationshipKind]> = {
        '1,0': [w('father_in_law', 'mother_in_law', 'parent_in_law'), 'affinal'],
        '1,1': [w('brother_in_law', 'sister_in_law', 'sibling_in_law'), 'affinal'],
        '2,0': [w('grandfather_in_law', 'grandmother_in_law', 'grandparent_in_law'), 'affinal'],
        '0,1': [w('stepson', 'stepdaughter', 'stepchild'), 'step'],
        '0,2': [w('step_grandson', 'step_granddaughter', 'step_grandchild'), 'step'],
      };
      const hit = special[pb];
      return hit ? { english: hit[0], kind: hit[1] } : { english: `${sw}_s_${segB.english}`, kind: 'affinal' };
    }
    if (pb === '0,0') {
      const special: Record<string, [string, RelationshipKind]> = {
        '0,1': [w('son_in_law', 'daughter_in_law', 'child_in_law'), 'affinal'],
        '1,1': [w('brother_in_law', 'sister_in_law', 'sibling_in_law'), 'affinal'],
        '1,0': [w('stepfather', 'stepmother', 'stepparent'), 'step'],
        '1,2': [w('nephew_in_law', 'niece_in_law', 'siblings_child_in_law'), 'affinal'],
        '0,2': [w('grandson_in_law', 'granddaughter_in_law', 'grandchild_in_law'), 'affinal'],
        '2,1': [
          `${segA.side ? `${segA.side}_` : ''}${w('uncle_by_marriage', 'aunt_by_marriage', 'parents_siblings_spouse')}`,
          'affinal',
        ],
      };
      const hit = special[pa];
      return hit ? { english: hit[0], kind: hit[1] } : { english: `${segA.english}_s_${sw}`, kind: 'affinal' };
    }
    if (pa === '1,0' && pb === '0,1') return { english: w('step_brother', 'step_sister', 'step_sibling'), kind: 'step' };
    if (pa === '0,1' && pb === '1,0') {
      return { english: w('co_father_in_law', 'co_mother_in_law', 'co_parent_in_law'), kind: 'affinal' };
    }
    return { english: `${segA.english}_s_${sw}_s_${segB.english}`, kind: 'affinal' };
  }

  private combine(
    parts: (Segment | KinStep)[],
    meta: { english: string; kind: RelationshipKind; side: Side; distance: number; hops: number },
  ): Candidate {
    const steps: KinStep[] = [];
    const personPath: string[] = [];
    let half = false;
    let adoptive = false;
    for (const p of parts) {
      if ('type' in p) {
        if (personPath.length === 0) personPath.push(p.from);
        steps.push(p);
        personPath.push(p.to);
      } else {
        steps.push(...p.steps);
        for (const id of p.personPath) if (personPath[personPath.length - 1] !== id) personPath.push(id);
        half ||= p.half;
        adoptive ||= p.adoptive;
      }
    }
    return {
      kind: meta.kind,
      key: steps.map((s) => s.code).join('.'),
      english: meta.english,
      steps,
      personPath,
      generations: null,
      cousin: null,
      side: meta.side,
      half,
      twin: false,
      adoptive,
      distance: meta.distance,
      hops: meta.hops,
    };
  }

  private gender(id: string): Gender {
    return this.g.person(id)?.gender ?? 'unknown';
  }
}

/** Convenience wrapper. For many lookups on one graph, reuse a KinshipResolver. */
export function findRelationship(g: GenealogyGraph, a: string, b: string): KinshipResult {
  return new KinshipResolver(g).find(a, b);
}

// ---------------------------------------------------------------------------
function none(): KinshipResult {
  return {
    kind: 'none',
    key: '',
    english: 'not_related',
    steps: [],
    personPath: [],
    generations: null,
    cousin: null,
    side: null,
    half: false,
    twin: false,
    adoptive: false,
    alternatives: [],
  };
}

function emptySegment(id: string): Segment {
  return { steps: [], personPath: [id], up: 0, down: 0, side: null, half: false, adoptive: false, english: 'self' };
}

function fromSegment(seg: Segment) {
  return {
    key: seg.steps.map((s) => s.code).join('.'),
    english: seg.english,
    steps: seg.steps,
    personPath: seg.personPath,
    side: seg.side,
    half: seg.half,
    twin: seg.steps.length === 1 && Boolean(seg.steps[0]!.twin),
    adoptive: seg.adoptive,
  };
}

const len = (s: Segment) => s.up + s.down;
const shape = (s: Segment) => `${s.up},${s.down}`;

function strip(c: Candidate): Omit<KinshipResult, 'alternatives'> {
  const { distance, hops, ...rest } = c;
  return rest;
}

const KIND_RANK: Record<RelationshipKind, number> = { self: 0, blood: 0, step: 1, affinal: 2, none: 3 };

function compareCandidates(x: Candidate, y: Candidate): number {
  return x.distance - y.distance || KIND_RANK[x.kind] - KIND_RANK[y.kind] || x.hops - y.hops || Number(x.adoptive) - Number(y.adoptive);
}

function word(g: Gender, m: string, f: string, n: string) {
  return g === 'male' ? m : g === 'female' ? f : n;
}

function nonKinParentEnglish(l: Lineage, g: Gender): string {
  if (l === 'guardian') return 'guardian';
  const base = word(g, 'father', 'mother', 'parent');
  return l === 'step' ? `step${base}` : `${l}_${base}`;
}

function nonKinChildEnglish(l: Lineage, g: Gender): string {
  if (l === 'guardian') return 'ward';
  const base = word(g, 'son', 'daughter', 'child');
  return l === 'step' ? `step${base}` : `${l}_${base}`;
}
