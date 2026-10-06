import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { buildFamilyModel } from '@/domain/family/familyModel';
import { ensureFamily } from '@/services/repositories/familyRepo';
import { loadFamilyRows } from '@/services/repositories/treeRepo';

export function useFamily() {
  return useQuery({ queryKey: ['family'], queryFn: ensureFamily, staleTime: Infinity });
}

/** The whole family (people, names, facts, relationships) as one model, rebuilt after each change. */
export function useFamilyModel(familyId: string | undefined) {
  return useQuery({
    queryKey: ['familyModel', familyId],
    queryFn: async () => buildFamilyModel(await loadFamilyRows(familyId!)),
    enabled: Boolean(familyId),
  });
}

export function useRefreshFamily(familyId: string | undefined) {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['familyModel', familyId] }), [qc, familyId]);
}
