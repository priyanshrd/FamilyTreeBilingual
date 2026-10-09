// The family's own relationship words (overrides / additions to the built-in dictionary).
import type { TermTable } from '@/domain/kinship/terms';
import { supabase } from '@/services/supabase';

export type KinshipTermRow = { id: string; term_key: string; lang: string; label: string; notes: string | null };

export async function listTerms(familyId: string): Promise<KinshipTermRow[]> {
  const { data, error } = await supabase
    .from('kinship_terms')
    .select('id, term_key, lang, label, notes')
    .eq('family_id', familyId)
    .is('deleted_at', null);
  if (error) throw error;
  return data as KinshipTermRow[];
}

export function toTables(rows: KinshipTermRow[]): Record<string, TermTable> {
  const out: Record<string, TermTable> = { en: {}, mr: {} };
  for (const r of rows) (out[r.lang] ??= {})[r.term_key] = r.label;
  return out;
}

/** Sets the family's word for a relationship in one language (empty label = back to default). */
export async function saveTerm(familyId: string, rows: KinshipTermRow[], key: string, lang: string, label: string): Promise<void> {
  const existing = rows.find((r) => r.term_key === key && r.lang === lang);
  const text = label.trim();
  if (!text) {
    if (!existing) return;
    const res = await supabase.from('kinship_terms').update({ deleted_at: new Date().toISOString() }).eq('id', existing.id);
    if (res.error) throw res.error;
    return;
  }
  if (existing?.label === text) return;
  const res = existing
    ? await supabase.from('kinship_terms').update({ label: text }).eq('id', existing.id)
    : await supabase.from('kinship_terms').insert({ family_id: familyId, term_key: key, lang, label: text });
  if (res.error) throw res.error;
}
