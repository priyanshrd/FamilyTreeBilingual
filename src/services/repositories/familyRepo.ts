// The only place that talks to Supabase about the family record itself.
import type { FamilyRow } from '@/types/db';
import { supabase } from '@/services/supabase';

const DEFAULT_NAME = { en: { v: 'Family Tree', src: 'manual' }, mr: { v: 'कुटुंबवृक्ष', src: 'manual' } };

/**
 * The app holds one family tree for the shared login. Returns it, creating it on first use.
 * (The schema supports several families; the UI simply uses the first.)
 */
export async function ensureFamily(): Promise<FamilyRow> {
  const existing = await supabase.from('families').select('*').is('deleted_at', null).order('created_at').limit(1);
  if (existing.error) throw existing.error;
  if (existing.data.length) return existing.data[0] as FamilyRow;

  const created = await supabase.rpc('create_family', { p_name: DEFAULT_NAME, p_default_language: 'mr' });
  if (created.error) throw created.error;
  const row = await supabase.from('families').select('*').eq('id', created.data as string).single();
  if (row.error) throw row.error;
  return row.data as FamilyRow;
}
