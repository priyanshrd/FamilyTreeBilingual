// Small DSL for building test families. Test-only.
import { parseFuzzyDate } from '@/domain/dates/fuzzyDate';
import { GenealogyGraph, type Gender, type GParentChild, type GPerson, type GUnion, type Lineage } from '@/domain/genealogy/graph';

export class FamilyBuilder {
  persons: GPerson[] = [];
  unions: GUnion[] = [];
  parentChild: GParentChild[] = [];
  private unionSeq = 0;

  person(id: string, gender: Gender, birth?: string): this {
    this.persons.push({ id, gender, birth: birth ? parseFuzzyDate(birth)! : undefined });
    return this;
  }

  /** Union of one or two partners; returns its id. */
  union(a: string, b?: string, status: GUnion['status'] = 'ongoing'): string {
    const id = `u${++this.unionSeq}`;
    this.unions.push({ id, partnerIds: b ? [a, b] : [a], status });
    return id;
  }

  /** Children of a union: an edge from every partner. */
  children(unionId: string, childIds: string[], lineage: Lineage = 'biological'): this {
    const u = this.unions.find((x) => x.id === unionId)!;
    childIds.forEach((c, i) => {
      for (const p of u.partnerIds) this.parentChild.push({ parentId: p, childId: c, lineage, unionId, childOrder: i + 1 });
    });
    return this;
  }

  edge(parentId: string, childId: string, lineage: Lineage = 'biological'): this {
    this.parentChild.push({ parentId, childId, lineage });
    return this;
  }

  build(): GenealogyGraph {
    return new GenealogyGraph({ persons: this.persons, unions: this.unions, parentChild: this.parentChild });
  }
}

/**
 * A three-sided fixture family centred on "me" (male, b. 1985).
 *
 *  Paternal: ggf+ggm → gf, gfb(→gfbs→gfbss) ; gf+gm → fb(1950), f(1955), fz(1960)
 *            fb+fbw → fbs, fbd(→fbdd) ; fz+fzh → fzs
 *            f also had an earlier marriage f1w → half (half-brother)
 *  Maternal: mggf+mggm → mgm, shankar ; mgf+mgm → mz(1956), m(1958), mb(1962)
 *            mb+mbw → mbs ; mz+mzh → mzs
 *  Core:     f+m → ze(f,1982), me(1985), by(1990)
 *            ze+zeh → zs, zunk(unknown gender) ; by+byw → bys, adopt (adopted)
 *            me+wife → son, dau ; wife+wex → wchild (wife's child from earlier union)
 *            wf+wm → wife, wb, wz ; wz+wzh
 *            son+sonw ; swf+swm → sonw ; dau+dauh
 *  Other:    stranger (no relations)
 */
export function fixtureFamily(): GenealogyGraph {
  const f = new FamilyBuilder();
  const people: [string, Gender, string?][] = [
    ['ggf', 'male'], ['ggm', 'female'], ['gf', 'male', '1925'], ['gm', 'female', '1930'], ['gfb', 'male', '1928'],
    ['gfbs', 'male'], ['gfbss', 'male'],
    ['fb', 'male', '1950'], ['f', 'male', '1955'], ['fz', 'female', '1960'], ['fbw', 'female'], ['fbs', 'male'], ['fbd', 'female'],
    ['fbdd', 'female'], ['fzh', 'male'], ['fzs', 'male'], ['f1w', 'female'], ['half', 'male', '1978'],
    ['mggf', 'male'], ['mggm', 'female'], ['mgm', 'female', '1932'], ['shankar', 'male', '1935'], ['mgf', 'male'],
    ['mz', 'female', '1956'], ['m', 'female', '1958'], ['mb', 'male', '1962'], ['mbw', 'female'], ['mbs', 'male'],
    ['mzh', 'male'], ['mzs', 'male'],
    ['ze', 'female', '1982'], ['me', 'male', '1985'], ['by', 'male', '1990'], ['zeh', 'male'], ['zs', 'male'], ['zunk', 'unknown'],
    ['byw', 'female'], ['bys', 'male'], ['adopt', 'female'],
    ['wife', 'female', '1987'], ['son', 'male', '2010'], ['dau', 'female', '2012'], ['wex', 'male'], ['wchild', 'male', '2005'],
    ['wf', 'male'], ['wm', 'female'], ['wb', 'male'], ['wz', 'female'], ['wzh', 'male'],
    ['sonw', 'female'], ['swf', 'male'], ['swm', 'female'], ['dauh', 'male'],
    ['stranger', 'male'],
  ];
  for (const [id, g, b] of people) f.person(id, g, b);

  f.children(f.union('ggf', 'ggm'), ['gfb', 'gf']);
  f.children(f.union('gfb'), ['gfbs']);
  f.children(f.union('gfbs'), ['gfbss']);
  f.children(f.union('gf', 'gm'), ['fb', 'f', 'fz']);
  f.children(f.union('fb', 'fbw'), ['fbs', 'fbd']);
  f.children(f.union('fbd'), ['fbdd']);
  f.children(f.union('fz', 'fzh'), ['fzs']);
  f.children(f.union('f', 'f1w', 'divorced'), ['half']);

  f.children(f.union('mggf', 'mggm'), ['mgm', 'shankar']);
  f.children(f.union('mgf', 'mgm'), ['mz', 'm', 'mb']);
  f.children(f.union('mb', 'mbw'), ['mbs']);
  f.children(f.union('mz', 'mzh'), ['mzs']);

  f.children(f.union('f', 'm'), ['ze', 'me', 'by']);
  f.children(f.union('ze', 'zeh'), ['zs', 'zunk']);
  const byU = f.union('by', 'byw');
  f.children(byU, ['bys']);
  f.children(byU, ['adopt'], 'adoptive');

  f.children(f.union('me', 'wife'), ['son', 'dau']);
  f.children(f.union('wife', 'wex', 'divorced'), ['wchild']);
  f.children(f.union('wf', 'wm'), ['wife', 'wb', 'wz']);
  f.union('wz', 'wzh');
  f.union('son', 'sonw');
  f.children(f.union('swf', 'swm'), ['sonw']);
  f.union('dau', 'dauh');
  return f.build();
}
