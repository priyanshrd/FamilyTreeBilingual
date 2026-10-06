import { useMemo } from 'react';
import { approximateYear } from '@/domain/dates/fuzzyDate';
import { findPossibleDuplicates } from '@/domain/dedupe/dedupe';
import { displayName, lifespan, type FamilyModel } from '@/domain/family/familyModel';
import { parsedDate, type PersonInput } from '@/domain/family/personInput';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';

/** "Possible existing person found" — suggests, never merges. */
export function useDuplicates(model: FamilyModel, input: PersonInput, nearbyIds: string[]) {
  return useMemo(() => {
    const names = [input.nameEn, input.nameMr].filter((n) => n.trim().length >= 2);
    if (!names.length) return [];
    const people = [...model.persons.values()].map((p) => ({
      id: p.id,
      names: p.allNames,
      birthYear: approximateYear(p.birth.date),
      isPlaceholder: p.isPlaceholder,
      relativeIds: [...model.graph.parents(p.id), ...model.graph.children(p.id), ...model.graph.partners(p.id)],
    }));
    return findPossibleDuplicates({ names, birthYear: approximateYear(parsedDate(input.birth)), nearbyIds }, people, 3);
  }, [model, input.nameEn, input.nameMr, input.birth, nearbyIds]);
}

export function DuplicateWarning({
  model,
  matches,
  onUse,
}: {
  model: FamilyModel;
  matches: { id: string }[];
  onUse: (personId: string) => void;
}) {
  const { t, lang } = useI18n();
  if (!matches.length) return null;
  return (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="font-medium text-amber-900">{t('dup.title')}</p>
      <p className="text-sm text-amber-900/80">{t('dup.body')}</p>
      <ul className="mt-2 space-y-2">
        {matches.map((m) => {
          const p = model.persons.get(m.id)!;
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2">
              <span>
                <span className="font-medium">{displayName(p, lang).text}</span>
                <span className="ml-2 text-sm text-stone-500">{lifespan(p, lang)}</span>
              </span>
              <Button variant="secondary" onClick={() => onUse(m.id)}>
                {t('dup.use')}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
