import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { buildFamilyModel, type FamilyModel } from '@/domain/family/familyModel';
import { ensureFamily } from '@/services/repositories/familyRepo';
import { loadFamilyRows } from '@/services/repositories/treeRepo';
import { supabase } from '@/services/supabase';

/** Quiet re-check while the page is open and visible, in case a live update was missed. */
const POLL_MS = 60_000;

export function useFamily() {
  return useQuery({ queryKey: ['family'], queryFn: ensureFamily, staleTime: Infinity });
}

type VersionedModel = FamilyModel & { version: string };

/** Short fingerprint of the loaded rows: a refresh that brings nothing new keeps the same model. */
function fingerprint(rows: unknown): string {
  const text = JSON.stringify(rows);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/**
 * The whole family (people, names, facts, relationships) as one model. Refreshed after each change
 * made here, live when someone else changes something (see useFamilySync), when the tab is shown
 * again, and every minute as a fallback.
 */
export function useFamilyModel(familyId: string | undefined) {
  return useQuery({
    queryKey: ['familyModel', familyId],
    queryFn: async (): Promise<VersionedModel> => {
      const rows = await loadFamilyRows(familyId!);
      return Object.assign(buildFamilyModel(rows), { version: fingerprint(rows) });
    },
    enabled: Boolean(familyId),
    // always re-check on coming back to the tab (an unchanged result costs no redraw, see below)
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: POLL_MS,
    // nothing changed: keep the same object, so the tree does not redraw
    structuralSharing: (old, next) => ((old as VersionedModel | undefined)?.version === (next as VersionedModel).version ? old : next) as VersionedModel,
  });
}

export function useRefreshFamily(familyId: string | undefined) {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['familyModel', familyId] }), [qc, familyId]);
}

const LIVE_TABLES = [
  'persons',
  'person_names',
  'person_name_forms',
  'person_facts',
  'unions',
  'union_partners',
  'parent_child',
  'media',
  'media_links',
  'kinship_terms',
] as const;

/**
 * Live updates: when anyone in the family changes something, every open copy of the tree reloads it
 * (bundled: a burst of changes from one save causes one reload).
 */
export function useFamilySync(familyId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!familyId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['familyModel', familyId] });
        void qc.invalidateQueries({ queryKey: ['kinshipTerms', familyId] });
      }, 800);
    };
    let channel = supabase.channel(`family:${familyId}`);
    for (const table of LIVE_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `family_id=eq.${familyId}` }, reload);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [familyId, qc]);
}
