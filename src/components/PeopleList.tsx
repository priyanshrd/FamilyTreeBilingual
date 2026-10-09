import { useMemo, useState } from 'react';
import { currentFact, displayName, lifespan, type FamilyModel } from '@/domain/family/familyModel';
import { getText } from '@/domain/localized/localized';
import { searchKey } from '@/domain/text/normalize';
import { useI18n } from '@/i18n/I18nProvider';

/** Everyone in the family as a searchable list (like a directory). Clicking opens them in family view. */
export function PeopleList({ model, onPick }: { model: FamilyModel; onPick: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const placeOf = (id: string) => {
      const p = model.persons.get(id)!;
      return getText(currentFact(p, 'residence')?.place ?? currentFact(p, 'native_place')?.place ?? currentFact(p, 'birth')?.place, lang)?.text ?? '';
    };
    return [...model.persons.values()]
      .filter((p) => !p.isPlaceholder)
      .map((p) => ({
        id: p.id,
        name: displayName(p, lang).text,
        other: Object.entries(p.names).find(([l]) => l !== lang)?.[1]?.full_name ?? '',
        years: lifespan(p, lang),
        place: placeOf(p.id),
        parents: model.graph
          .parents(p.id)
          .map((id) => displayName(model.persons.get(id), lang).text)
          .join(', '),
        // every name and every place/value in either language, so "pune" or "पुणे" both match
        keys: [
          ...p.allNames,
          ...p.facts.flatMap((f) => [f.place, f.value].flatMap((lt) => Object.values(lt ?? {}).map((e) => e.v))),
        ]
          .map(searchKey)
          .join(' | '),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, lang === 'mr' ? 'mr' : 'en'));
  }, [model, lang]);

  const k = searchKey(q);
  const shown = k ? rows.filter((r) => r.keys.includes(k)) : rows;

  return (
    <div className="absolute inset-0 overflow-y-auto px-3 pt-16 pb-6">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('list.filter')}
        aria-label={t('list.filter')}
        className="mb-3 block min-h-11 w-full max-w-md rounded-lg border border-stone-300 bg-white px-3 focus:border-amber-700 focus:ring-2 focus:ring-amber-700/30 focus:outline-none"
      />
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {shown.length === 0 && <li className="p-4 text-stone-500">{t('search.none')}</li>}
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onPick(r.id)} className="grid w-full gap-x-4 px-4 py-3 text-left hover:bg-amber-50 sm:grid-cols-[2fr_1fr_1fr_2fr]">
              <span>
                <span className="font-medium">{r.name}</span>
                {r.other && <span className="block text-sm text-stone-500">{r.other}</span>}
              </span>
              <span className="text-sm text-stone-600">{r.years}</span>
              <span className="text-sm text-stone-600">{r.place}</span>
              <span className="text-sm text-stone-500">{r.parents && `${t('list.parents')}: ${r.parents}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
