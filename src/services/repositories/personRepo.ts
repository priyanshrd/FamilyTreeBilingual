// Person and relationship writes. Multi-row operations go through database RPCs (atomic, validated).
import { toColumns } from '@/domain/dates/fuzzyDate';
import { parsedDate, splitName, toPersonPayload, type PersonInput } from '@/domain/family/personInput';
import type { PersonView } from '@/domain/family/familyModel';
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

/** Saves edits to an existing person: gender, living flag, primary name forms, birth and death. */
export async function updatePerson(familyId: string, person: PersonView, input: PersonInput): Promise<void> {
  const death = parsedDate(input.death);
  const upd = await supabase
    .from('persons')
    .update({ gender: input.gender, is_living: death.qualifier !== 'unknown' ? false : input.isLiving })
    .eq('id', person.id);
  if (upd.error) throw upd.error;

  let nameId = person.primaryNameId;
  if (!nameId) {
    const ins = await supabase
      .from('person_names')
      .insert({ family_id: familyId, person_id: person.id, name_type: 'primary', is_primary: true })
      .select('id')
      .single();
    if (ins.error) throw ins.error;
    nameId = ins.data.id as string;
  }

  // Write new/changed forms before removing cleared ones, so the person always keeps a name.
  const wanted: Record<string, string> = { en: input.nameEn.trim(), mr: input.nameMr.trim() };
  for (const [lang, value] of Object.entries(wanted)) {
    const existing = person.names[lang];
    if (!value || existing?.full_name === value) continue;
    const res = await supabase.from('person_name_forms').upsert(
      {
        name_id: nameId,
        family_id: familyId,
        lang,
        ...splitName(value),
        // typing over a generated value marks it corrected; otherwise it is manual
        source: existing && existing.source !== 'manual' ? 'corrected' : 'manual',
        generated_from: existing && existing.source !== 'manual' ? existing.generated_from : null,
      },
      { onConflict: 'name_id,lang' },
    );
    if (res.error) throw res.error;
  }
  for (const [lang, value] of Object.entries(wanted)) {
    if (value || !person.names[lang]) continue;
    const res = await supabase.from('person_name_forms').delete().eq('name_id', nameId).eq('lang', lang);
    if (res.error) throw res.error;
  }

  await saveVital(familyId, person.id, 'birth', person.birth.factId, input.birth);
  await saveVital(familyId, person.id, 'death', person.death.factId, input.death);
}

async function saveVital(familyId: string, personId: string, type: 'birth' | 'death', factId: string | null, text: string) {
  const fd = parsedDate(text);
  if (fd.qualifier === 'unknown') {
    if (!factId) return;
    const res = await supabase.from('person_facts').update({ deleted_at: new Date().toISOString() }).eq('id', factId);
    if (res.error) throw res.error;
    return;
  }
  const cols = toColumns(fd);
  const res = factId
    ? await supabase.from('person_facts').update(cols).eq('id', factId)
    : await supabase.from('person_facts').insert({ family_id: familyId, person_id: personId, fact_type: type, ...cols });
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
