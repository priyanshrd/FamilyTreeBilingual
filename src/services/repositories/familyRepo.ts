// The only place that talks to Supabase about families.
import type { LocalizedText } from '@/domain/localized/localized';
import type { FamilyRow } from '@/types/db';
import { supabase } from '@/services/supabase';

export type FamilySummary = FamilyRow & { peopleCount: number };

export async function listFamilies(): Promise<FamilySummary[]> {
  const { data, error } = await supabase
    .from('families')
    .select('*, persons(count)')
    .is('deleted_at', null)
    .is('persons.deleted_at', null)
    .eq('persons.is_placeholder', false)
    .order('created_at');
  if (error) throw error;
  return (data as (FamilyRow & { persons: { count: number }[] })[]).map(({ persons, ...f }) => ({
    ...f,
    peopleCount: persons[0]?.count ?? 0,
  }));
}

export async function getFamily(id: string): Promise<FamilyRow | null> {
  const { data, error } = await supabase.from('families').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data as FamilyRow | null;
}

export async function createFamily(name: LocalizedText, defaultLanguage = 'mr'): Promise<string> {
  const { data, error } = await supabase.rpc('create_family', { p_name: name, p_default_language: defaultLanguage });
  if (error) throw error;
  return data as string;
}
