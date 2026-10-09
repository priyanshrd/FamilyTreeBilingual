import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { listTerms, toTables } from '@/services/repositories/kinshipRepo';

export function useKinshipTerms(familyId: string | undefined) {
  const q = useQuery({ queryKey: ['kinshipTerms', familyId], queryFn: () => listTerms(familyId!), enabled: Boolean(familyId) });
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['kinshipTerms', familyId] }), [qc, familyId]);
  return { rows: q.data ?? [], tables: toTables(q.data ?? []), refresh, isPending: q.isPending };
}
