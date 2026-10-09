// Assembles database rows into the in-memory family model used by every screen:
// people with their names and vital facts, plus the GenealogyGraph for relationships.
import { fromColumns, type FuzzyDate, approximateYear } from '@/domain/dates/fuzzyDate';
import { GenealogyGraph, type Gender } from '@/domain/genealogy/graph';
import type { LocalizedText } from '@/domain/localized/localized';
import { searchKey, toDevanagariDigits } from '@/domain/text/normalize';
import type { FamilyRows, NameFormRow, PersonFactRow, UnionRow } from '@/types/db';

export type VitalFact = { factId: string | null; date: FuzzyDate; place: LocalizedText | null };

export type PersonView = {
  id: string;
  gender: Gender;
  isLiving: boolean | null;
  isPlaceholder: boolean;
  notes: LocalizedText | null;
  primaryNameId: string | null;
  /** primary name forms by language */
  names: Record<string, NameFormRow>;
  /** secondary names by type (nickname = 'alias', name before marriage = 'birth') */
  otherNames: Partial<Record<'alias' | 'birth', { id: string; forms: Record<string, NameFormRow> }>>;
  /** all name strings (every name, every language) for search and duplicate checks */
  allNames: string[];
  birth: VitalFact;
  death: VitalFact;
  facts: PersonFactRow[];
};

export type FamilyModel = {
  persons: Map<string, PersonView>;
  unions: Map<string, UnionRow & { partnerIds: string[] }>;
  graph: GenealogyGraph;
};

const NO_FACT: VitalFact = { factId: null, date: { qualifier: 'unknown' }, place: null };

function vital(f: PersonFactRow | undefined): VitalFact {
  if (!f) return NO_FACT;
  return {
    factId: f.id,
    date: fromColumns({
      date_qualifier: f.date_qualifier,
      date_from: f.date_from,
      date_from_precision: f.date_from_precision,
      date_to: f.date_to,
      date_to_precision: f.date_to_precision,
      date_text: f.date_text,
    }),
    place: f.place,
  };
}

export function buildFamilyModel(rows: FamilyRows): FamilyModel {
  const formsByName = new Map<string, NameFormRow[]>();
  for (const f of rows.nameForms) {
    const list = formsByName.get(f.name_id) ?? [];
    list.push(f);
    formsByName.set(f.name_id, list);
  }
  const namesByPerson = new Map<string, typeof rows.names>();
  for (const n of rows.names) {
    const list = namesByPerson.get(n.person_id) ?? [];
    list.push(n);
    namesByPerson.set(n.person_id, list);
  }
  const factsByPerson = new Map<string, PersonFactRow[]>();
  for (const f of rows.facts) {
    const list = factsByPerson.get(f.person_id) ?? [];
    list.push(f);
    factsByPerson.set(f.person_id, list);
  }

  const persons = new Map<string, PersonView>();
  for (const p of rows.persons) {
    const names = (namesByPerson.get(p.id) ?? []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
    const primary = names[0];
    const primaryForms = Object.fromEntries((primary ? formsByName.get(primary.id) ?? [] : []).map((f) => [f.lang, f]));
    const facts = factsByPerson.get(p.id) ?? [];
    persons.set(p.id, {
      id: p.id,
      gender: p.gender,
      isLiving: p.is_living,
      isPlaceholder: p.is_placeholder,
      notes: p.notes,
      primaryNameId: primary?.id ?? null,
      names: primaryForms,
      otherNames: Object.fromEntries(
        (['alias', 'birth'] as const).flatMap((type) => {
          const n = names.find((x) => x !== primary && x.name_type === type);
          return n ? [[type, { id: n.id, forms: Object.fromEntries((formsByName.get(n.id) ?? []).map((f) => [f.lang, f])) }]] : [];
        }),
      ),
      allNames: names.flatMap((n) => (formsByName.get(n.id) ?? []).map((f) => f.full_name)),
      birth: vital(facts.find((f) => f.fact_type === 'birth')),
      death: vital(facts.find((f) => f.fact_type === 'death')),
      facts,
    });
  }

  const partnersByUnion = new Map<string, string[]>();
  for (const up of [...rows.partners].sort((a, b) => a.partner_order - b.partner_order)) {
    const list = partnersByUnion.get(up.union_id) ?? [];
    list.push(up.person_id);
    partnersByUnion.set(up.union_id, list);
  }
  const unions = new Map(rows.unions.map((u) => [u.id, { ...u, partnerIds: partnersByUnion.get(u.id) ?? [] }]));

  const graph = new GenealogyGraph({
    persons: [...persons.values()].map((p) => ({
      id: p.id,
      gender: p.gender,
      birth: p.birth.date,
      death: p.death.date,
      isPlaceholder: p.isPlaceholder,
    })),
    unions: [...unions.values()].map((u) => ({ id: u.id, partnerIds: u.partnerIds, status: u.status })),
    parentChild: rows.parentChild.map((e) => ({
      parentId: e.parent_id,
      childId: e.child_id,
      lineage: e.lineage,
      unionId: e.union_id,
      childOrder: e.child_order,
    })),
  });

  return { persons, unions, graph };
}

/** The person's current fact of a type: one without an end date first, else the latest. */
export function currentFact(p: PersonView, type: PersonFactRow['fact_type'] | string): PersonFactRow | undefined {
  const facts = p.facts.filter((f) => f.fact_type === type);
  return facts.find((f) => f.end_qualifier === 'unknown') ?? facts.at(-1);
}

/** Name in the requested language, falling back to any other; placeholders get a "?" label. */
export function displayName(p: PersonView | undefined, lang: string): { text: string; isFallback: boolean } {
  if (!p) return { text: '?', isFallback: true };
  const exact = p.names[lang]?.full_name;
  if (exact) return { text: exact, isFallback: false };
  const other = Object.values(p.names)[0]?.full_name;
  if (other) return { text: other, isFallback: true };
  return { text: p.isPlaceholder ? '?' : '—', isFallback: true };
}

/** "1958–2020" / "c. 1958" style lifespan using years only; Marathi uses सु. and Devanagari digits. */
export function lifespan(p: PersonView, lang = 'en'): string {
  const b = approximateYear(p.birth.date);
  const d = approximateYear(p.death.date);
  const about = lang === 'mr' ? 'सु. ' : 'c. ';
  const approx = (q: string) => (q === 'about' || q === 'estimated' ? about : q === 'before' ? '<' : q === 'after' ? '>' : '');
  const bs = b != null ? `${approx(p.birth.date.qualifier)}${b}` : '';
  const ds = d != null ? `${approx(p.death.date.qualifier)}${d}` : '';
  let out = '';
  if (bs || ds) out = !ds ? (p.isLiving === false ? `${bs}–?` : bs) : `${bs || '?'}–${ds}`;
  return lang === 'mr' ? toDevanagariDigits(out) : out;
}

/** Search people by any of their names (any script), best matches first. */
export function searchPeople(model: FamilyModel, query: string, limit = 12): PersonView[] {
  const q = searchKey(query);
  if (!q) return [];
  const scored: [PersonView, number][] = [];
  for (const p of model.persons.values()) {
    if (p.isPlaceholder) continue;
    let best = 0;
    for (const n of p.allNames) {
      const k = searchKey(n);
      if (k === q) best = Math.max(best, 3);
      else if (k.startsWith(q) || k.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 2);
      else if (k.includes(q)) best = Math.max(best, 1);
    }
    if (best > 0) scored.push([p, best]);
  }
  return scored
    .sort((a, b) => b[1] - a[1] || (a[0].allNames[0] ?? '').localeCompare(b[0].allNames[0] ?? ''))
    .slice(0, limit)
    .map(([p]) => p);
}

/** An "unknown parent" placeholder that has not been given any name yet. */
export function isUnknown(p: PersonView | undefined): boolean {
  return Boolean(p?.isPlaceholder) && !Object.values(p!.names).some((f) => f.full_name.trim());
}
