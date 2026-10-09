// Loads everything needed to draw and reason about one family, and performs relationship writes.
import type { FamilyRows } from '@/types/db';
import { supabase } from '@/services/supabase';

const PAGE = 1000; // Supabase caps responses at 1000 rows by default

async function fetchAll<T>(table: string, columns: string, familyId: string, opts: { live?: boolean } = { live: true }): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).eq('family_id', familyId);
    if (opts.live) q = q.is('deleted_at', null);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadFamilyRows(familyId: string): Promise<FamilyRows> {
  const [persons, names, nameForms, facts, unions, partners, parentChild, media, mediaLinks] = await Promise.all([
    fetchAll<FamilyRows['persons'][number]>('persons', 'id, family_id, gender, is_living, is_placeholder, notes, updated_at', familyId),
    fetchAll<FamilyRows['names'][number]>('person_names', 'id, person_id, name_type, is_primary, sort_order', familyId),
    fetchAll<FamilyRows['nameForms'][number]>(
      'person_name_forms',
      'name_id, lang, given_name, middle_name, surname, full_name, source, generated_from',
      familyId,
      { live: false },
    ),
    fetchAll<FamilyRows['facts'][number]>('person_facts', '*', familyId),
    fetchAll<FamilyRows['unions'][number]>('unions', 'id, union_type, status, sort_order', familyId),
    fetchAll<FamilyRows['partners'][number]>('union_partners', 'union_id, person_id, partner_order', familyId, { live: false }),
    fetchAll<FamilyRows['parentChild'][number]>('parent_child', 'id, parent_id, child_id, lineage, union_id, child_order', familyId),
    fetchAll<FamilyRows['media'][number]>('media', 'id, storage_path, thumb_path', familyId),
    fetchAll<FamilyRows['mediaLinks'][number]>('media_links', 'id, media_id, person_id, role', familyId, { live: false }),
  ]);
  return { persons, names, nameForms, facts, unions, partners, parentChild, media, mediaLinks };
}
