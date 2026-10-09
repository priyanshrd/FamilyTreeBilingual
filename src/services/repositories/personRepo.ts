// Person and relationship writes. Multi-row operations go through database RPCs (atomic, validated).
import { toColumns, type FuzzyDate } from '@/domain/dates/fuzzyDate';
import { currentFact, type PersonView } from '@/domain/family/familyModel';
import {
  EMPTY_BI,
  effectiveLiving,
  isAuto,
  isBlank,
  TRANSLITERATION_PROVIDER,
  type Lang,
  parsedDate,
  SIMPLE_FACTS,
  splitName,
  toLocalized,
  toPersonPayload,
  type Bi,
  type FactType,
  type PersonInput,
} from '@/domain/family/personInput';
import type { LocalizedText } from '@/domain/localized/localized';
import type { PersonFactRow } from '@/types/db';
import { supabase } from '@/services/supabase';

export type Relation = 'parent' | 'adoptive_parent' | 'child' | 'spouse' | 'sibling' | 'step_parent';

export type RelationOptions = {
  union_id?: string;
  other_parent_id?: string;
  parent_ids?: string[];
  via_parent_id?: string;
  lineage?: string;
  children_lineage?: string;
  apply_to_siblings?: boolean;
};

export async function createPerson(familyId: string, input: PersonInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_person', { p_family_id: familyId, p_person: toPersonPayload(input) });
  if (error) throw error;
  return data as string;
}

export async function addRelative(anchorId: string, relation: Relation, input: PersonInput, options: RelationOptions = {}) {
  const { data, error } = await supabase.rpc('add_relative', {
    p_anchor_id: anchorId,
    p_relation: relation,
    p_person: toPersonPayload(input),
    p_options: options,
  });
  if (error) throw error;
  return data as { person_id: string; union_id: string | null };
}

export async function connectExisting(anchorId: string, otherId: string, relation: Relation, options: RelationOptions = {}) {
  const { data, error } = await supabase.rpc('connect_existing', {
    p_anchor_id: anchorId,
    p_other_id: otherId,
    p_relation: relation,
    p_options: options,
  });
  if (error) throw error;
  return data as { person_id: string; union_id: string | null };
}

/** Saves edits to an existing person: every field of the person form. */
export async function updatePerson(familyId: string, person: PersonView, input: PersonInput): Promise<void> {
  const upd = await supabase
    .from('persons')
    .update({ gender: input.gender, is_living: effectiveLiving(input), notes: toLocalized(input.notes, person.notes) })
    .eq('id', person.id);
  if (upd.error) throw upd.error;

  await saveName(familyId, person.id, 'primary', person.primaryNameId, person.names, input.name);
  await saveName(familyId, person.id, 'alias', person.otherNames.alias?.id ?? null, person.otherNames.alias?.forms ?? {}, input.nickname);
  await saveName(familyId, person.id, 'birth', person.otherNames.birth?.id ?? null, person.otherNames.birth?.forms ?? {}, input.maidenName);

  // An "unknown parent" that has been given a name is now a real, searchable person.
  if (person.isPlaceholder && !isBlank(input.name)) {
    const res = await supabase.from('persons').update({ is_placeholder: false }).eq('id', person.id);
    if (res.error) throw res.error;
  }

  const death = input.isLiving === true ? { date: '', place: EMPTY_BI } : { date: input.death, place: input.deathPlace };
  await saveFact(familyId, person.id, 'birth', currentFact(person, 'birth'), {
    date: parsedDate(input.birth),
    place: toLocalized(input.birthPlace, currentFact(person, 'birth')?.place ?? null),
  });
  await saveFact(familyId, person.id, 'death', currentFact(person, 'death'), {
    date: parsedDate(death.date),
    place: toLocalized(death.place, currentFact(person, 'death')?.place ?? null),
  });
  for (const f of SIMPLE_FACTS) {
    const existing = currentFact(person, f.type);
    await saveFact(familyId, person.id, f.type, existing, { [f.in]: toLocalized(input[f.field], existing?.[f.in] ?? null) });
  }
}

type NameForms = Record<string, { full_name: string; source: string; generated_from: string | null }>;

/** Writes one bilingual name (primary or secondary). New/changed forms first, so a name is never empty. */
async function saveName(familyId: string, personId: string, type: 'primary' | 'alias' | 'birth', nameId: string | null, existing: NameForms, value: Bi) {
  const wanted: Record<string, string> = { en: value.en.trim(), mr: value.mr.trim() };
  if (!nameId) {
    if (!wanted.en && !wanted.mr) return;
    const ins = await supabase
      .from('person_names')
      .insert({ family_id: familyId, person_id: personId, name_type: type, is_primary: type === 'primary', sort_order: type === 'primary' ? 0 : 1 })
      .select('id')
      .single();
    if (ins.error) throw ins.error;
    nameId = ins.data.id as string;
  }
  for (const [lang, text] of Object.entries(wanted)) {
    const prev = existing[lang];
    if (!text || prev?.full_name === text) continue;
    const generated = isAuto(value, lang as Lang) && (!prev || prev.source === 'auto');
    const corrected = !generated && prev && prev.source !== 'manual';
    const res = await supabase.from('person_name_forms').upsert(
      {
        name_id: nameId,
        family_id: familyId,
        lang,
        ...splitName(text),
        source: generated ? 'auto' : corrected ? 'corrected' : 'manual',
        generated_from: generated ? (lang === 'en' ? 'mr' : 'en') : corrected ? prev.generated_from : null,
        provider: generated ? TRANSLITERATION_PROVIDER : null,
      },
      { onConflict: 'name_id,lang' },
    );
    if (res.error) throw res.error;
  }
  if (type !== 'primary' && !wanted.en && !wanted.mr) {
    // a secondary name cleared completely: retire it
    const res = await supabase.from('person_names').update({ deleted_at: new Date().toISOString() }).eq('id', nameId);
    if (res.error) throw res.error;
    return;
  }
  for (const [lang, text] of Object.entries(wanted)) {
    if (text || !existing[lang]) continue;
    const res = await supabase.from('person_name_forms').delete().eq('name_id', nameId).eq('lang', lang);
    if (res.error) throw res.error;
  }
}

type FactPatch = { date?: FuzzyDate; place?: LocalizedText | null; value?: LocalizedText | null };

/** Inserts, updates or (when everything is empty) soft-deletes one person fact. */
async function saveFact(familyId: string, personId: string, type: FactType, existing: PersonFactRow | undefined, patch: FactPatch) {
  const empty = (patch.date?.qualifier ?? 'unknown') === 'unknown' && !patch.place && !patch.value;
  if (empty) {
    if (!existing) return;
    const res = await supabase.from('person_facts').update({ deleted_at: new Date().toISOString() }).eq('id', existing.id);
    if (res.error) throw res.error;
    return;
  }
  const row: Record<string, unknown> = {};
  if (patch.date) Object.assign(row, toColumns(patch.date));
  if ('place' in patch) row.place = patch.place;
  if ('value' in patch) row.value = patch.value;
  const res = existing
    ? await supabase.from('person_facts').update(row).eq('id', existing.id)
    : await supabase.from('person_facts').insert({ family_id: familyId, person_id: personId, fact_type: type, ...row });
  if (res.error) throw res.error;
}

export type DeleteImpact = { parents: number; children: number; partners: number; media: number };

export async function deleteImpact(personId: string): Promise<DeleteImpact> {
  const { data, error } = await supabase.rpc('person_delete_impact', { p_person_id: personId });
  if (error) throw error;
  return data as DeleteImpact;
}

export async function softDeletePerson(personId: string): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_person', { p_person_id: personId });
  if (error) throw error;
}

/**
 * Fills the missing language of every person's primary name by transliteration (marked "auto").
 * Never touches an existing form. Returns how many names were filled.
 */
export async function fillMissingNames(familyId: string, people: PersonView[], to: Lang, convert: (text: string, to: Lang) => string): Promise<number> {
  const from: Lang = to === 'mr' ? 'en' : 'mr';
  const rows = people
    .filter((p) => !p.isPlaceholder && p.primaryNameId && !p.names[to] && p.names[from])
    .map((p) => {
      const text = convert(p.names[from]!.full_name, to);
      return {
        name_id: p.primaryNameId!,
        family_id: familyId,
        lang: to,
        ...splitName(text),
        source: 'auto',
        generated_from: from,
        provider: TRANSLITERATION_PROVIDER,
      };
    });
  if (!rows.length) return 0;
  const res = await supabase.from('person_name_forms').insert(rows);
  if (res.error) throw res.error;
  return rows.length;
}

/** People still marked "unknown parent" although they have been given a name: make them real people. */
export async function repairNamedPlaceholders(people: PersonView[]): Promise<number> {
  const ids = people.filter((p) => p.isPlaceholder && Object.values(p.names).some((f) => f.full_name.trim())).map((p) => p.id);
  if (!ids.length) return 0;
  const res = await supabase.from('persons').update({ is_placeholder: false }).in('id', ids);
  if (res.error) throw res.error;
  return ids.length;
}

/**
 * Re-generates automatic names with the current transliteration rules (e.g. after the dictionary
 * improved). Only touches forms still marked "auto"; names typed or corrected by hand are never changed.
 */
export async function refreshAutoNames(people: PersonView[], convert: (text: string, to: Lang) => string): Promise<number> {
  let changed = 0;
  for (const p of people) {
    for (const lang of ['en', 'mr'] as const) {
      const form = p.names[lang];
      const from = form?.generated_from as Lang | null | undefined;
      const source = from ? p.names[from] : undefined;
      if (!form || form.source !== 'auto' || !source || source.source === 'auto') continue;
      const text = convert(source.full_name, lang);
      if (text === form.full_name) continue;
      const res = await supabase
        .from('person_name_forms')
        .update({ ...splitName(text), provider: TRANSLITERATION_PROVIDER })
        .eq('name_id', p.primaryNameId!)
        .eq('lang', lang)
        .eq('source', 'auto');
      if (res.error) throw res.error;
      changed++;
    }
  }
  return changed;
}
