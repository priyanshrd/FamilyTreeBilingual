// In-memory genealogy graph built from database rows. Pure: no React, no Supabase.
// Only primitives are stored (unions, parent→child edges); everything else is derived here.
import { compareFuzzyDates, type FuzzyDate } from '@/domain/dates/fuzzyDate';

export type Gender = 'male' | 'female' | 'other' | 'unknown';
export type Lineage = 'biological' | 'adoptive' | 'step' | 'foster' | 'guardian' | 'unknown';

export type GPerson = {
  id: string;
  gender: Gender;
  birth?: FuzzyDate;
  death?: FuzzyDate;
  isPlaceholder?: boolean;
  deleted?: boolean;
};

export type GUnion = {
  id: string;
  partnerIds: string[];
  status?: 'ongoing' | 'divorced' | 'separated' | 'widowed' | 'annulled' | 'unknown';
  deleted?: boolean;
};

export type GParentChild = {
  parentId: string;
  childId: string;
  lineage: Lineage;
  unionId?: string | null;
  childOrder?: number | null;
  deleted?: boolean;
};

export type GraphInput = { persons: GPerson[]; unions: GUnion[]; parentChild: GParentChild[] };

/** Lineages that make someone a parent for kinship purposes (adoption counts, annotated). */
export const KIN_LINEAGES: ReadonlySet<Lineage> = new Set(['biological', 'adoptive', 'unknown']);

export type SiblingKind = 'full' | 'half' | 'adoptive' | 'step';
export type Sibling = { id: string; kind: SiblingKind; sharedParentIds: string[] };

export class GenealogyGraph {
  private readonly people = new Map<string, GPerson>();
  private readonly unionsById = new Map<string, GUnion>();
  private readonly unionsByPerson = new Map<string, GUnion[]>();
  private readonly up = new Map<string, GParentChild[]>(); // child -> edges to parents
  private readonly down = new Map<string, GParentChild[]>(); // parent -> edges to children

  constructor(input: GraphInput) {
    for (const p of input.persons) if (!p.deleted) this.people.set(p.id, p);

    for (const u of input.unions) {
      if (u.deleted) continue;
      const partners = u.partnerIds.filter((id) => this.people.has(id));
      if (partners.length === 0) continue;
      const union = { ...u, partnerIds: partners };
      this.unionsById.set(u.id, union);
      for (const id of partners) push(this.unionsByPerson, id, union);
    }

    for (const e of input.parentChild) {
      if (e.deleted || !this.people.has(e.parentId) || !this.people.has(e.childId)) continue;
      push(this.up, e.childId, e);
      push(this.down, e.parentId, e);
    }
  }

  get size(): number {
    return this.people.size;
  }

  has(id: string): boolean {
    return this.people.has(id);
  }

  person(id: string): GPerson | undefined {
    return this.people.get(id);
  }

  allPeople(): GPerson[] {
    return [...this.people.values()];
  }

  allUnions(): GUnion[] {
    return [...this.unionsById.values()];
  }

  union(id: string): GUnion | undefined {
    return this.unionsById.get(id);
  }

  parentEdges(childId: string, lineages?: ReadonlySet<Lineage>): GParentChild[] {
    const edges = this.up.get(childId) ?? [];
    return lineages ? edges.filter((e) => lineages.has(e.lineage)) : edges;
  }

  childEdges(parentId: string, lineages?: ReadonlySet<Lineage>): GParentChild[] {
    const edges = this.down.get(parentId) ?? [];
    return lineages ? edges.filter((e) => lineages.has(e.lineage)) : edges;
  }

  parents(childId: string, lineages: ReadonlySet<Lineage> = KIN_LINEAGES): string[] {
    return this.parentEdges(childId, lineages).map((e) => e.parentId);
  }

  children(parentId: string, lineages: ReadonlySet<Lineage> = KIN_LINEAGES): string[] {
    return this.childEdges(parentId, lineages).map((e) => e.childId);
  }

  unionsOf(personId: string): GUnion[] {
    return this.unionsByPerson.get(personId) ?? [];
  }

  /** Partners across all of a person's live unions. */
  partners(personId: string): string[] {
    const out = new Set<string>();
    for (const u of this.unionsOf(personId)) for (const p of u.partnerIds) if (p !== personId) out.add(p);
    return [...out];
  }

  edge(parentId: string, childId: string): GParentChild | undefined {
    return (this.up.get(childId) ?? []).find((e) => e.parentId === parentId);
  }

  /**
   * Derived siblings:
   *  full     — both have two recorded parents and share both, biologically
   *  half     — both have two recorded parents and share exactly one, biologically
   *  adoptive — share a parent where at least one link is adoptive
   *  step     — no shared parent, but one's parent is partnered with the other's parent
   * When parents are only partly recorded, sharing a parent counts as "full" (we cannot know better).
   */
  siblings(personId: string): Sibling[] {
    const myEdges = this.parentEdges(personId, KIN_LINEAGES);
    const myParents = new Set(myEdges.map((e) => e.parentId));
    const result = new Map<string, Sibling>();

    for (const pe of myEdges) {
      for (const ce of this.childEdges(pe.parentId, KIN_LINEAGES)) {
        if (ce.childId === personId || result.has(ce.childId)) continue;
        const theirEdges = this.parentEdges(ce.childId, KIN_LINEAGES);
        const shared = theirEdges.filter((e) => myParents.has(e.parentId)).map((e) => e.parentId);
        const adoptive = shared.some(
          (p) => this.edge(p, personId)?.lineage === 'adoptive' || this.edge(p, ce.childId)?.lineage === 'adoptive',
        );
        const kind: SiblingKind = adoptive
          ? 'adoptive'
          : shared.length === 1 && myParents.size === 2 && theirEdges.length === 2
            ? 'half'
            : 'full';
        result.set(ce.childId, { id: ce.childId, kind, sharedParentIds: shared });
      }
    }

    for (const parent of myParents) {
      for (const stepParent of this.partners(parent)) {
        if (myParents.has(stepParent)) continue;
        for (const child of this.children(stepParent)) {
          if (child === personId || result.has(child)) continue;
          result.set(child, { id: child, kind: 'step', sharedParentIds: [] });
        }
      }
    }
    return [...result.values()];
  }

  /** Partners of a person's parents who are not themselves the person's parents. */
  stepParents(personId: string): string[] {
    const parents = new Set(this.parents(personId));
    const out = new Set<string>();
    for (const p of parents) for (const partner of this.partners(p)) if (!parents.has(partner)) out.add(partner);
    for (const e of this.parentEdges(personId)) if (e.lineage === 'step') out.add(e.parentId);
    return [...out];
  }

  /** Ancestors with their generation distance (1 = parent), up to `maxDepth`. */
  ancestors(personId: string, maxDepth = Infinity, lineages: ReadonlySet<Lineage> = KIN_LINEAGES): Map<string, number> {
    return this.walk(personId, maxDepth, (id) => this.parents(id, lineages));
  }

  descendants(personId: string, maxDepth = Infinity, lineages: ReadonlySet<Lineage> = KIN_LINEAGES): Map<string, number> {
    return this.walk(personId, maxDepth, (id) => this.children(id, lineages));
  }

  /** Would adding parent → child create an ancestor cycle? Mirrors the database rule. */
  wouldCreateCycle(parentId: string, childId: string): boolean {
    if (parentId === childId) return true;
    return this.walk(parentId, Infinity, (id) => (this.up.get(id) ?? []).map((e) => e.parentId)).has(childId);
  }

  /**
   * Relative age of `b` compared with `a` among siblings: 'elder' if b is older, 'younger' if b is younger.
   * Uses birth dates when certain, else child_order under a shared parent, else null.
   */
  relativeAge(a: string, b: string): 'elder' | 'younger' | null {
    const da = this.person(a)?.birth;
    const db = this.person(b)?.birth;
    if (da && db) {
      const c = compareFuzzyDates(db, da);
      if (c === -1) return 'elder';
      if (c === 1) return 'younger';
    }
    for (const ea of this.parentEdges(a)) {
      const eb = this.edge(ea.parentId, b);
      if (eb && ea.childOrder != null && eb.childOrder != null && ea.childOrder !== eb.childOrder) {
        return eb.childOrder < ea.childOrder ? 'elder' : 'younger';
      }
    }
    return null;
  }

  private walk(start: string, maxDepth: number, next: (id: string) => string[]): Map<string, number> {
    const seen = new Map<string, number>();
    let frontier = [start];
    for (let depth = 1; frontier.length && depth <= maxDepth; depth++) {
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        for (const n of next(id)) {
          if (n === start || seen.has(n)) continue;
          seen.set(n, depth);
          nextFrontier.push(n);
        }
      }
      frontier = nextFrontier;
    }
    return seen;
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
