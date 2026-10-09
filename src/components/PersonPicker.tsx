import { useState } from 'react';
import { displayName, lifespan, searchPeople, type FamilyModel } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';
import { TextField } from '@/components/ui/TextField';

/** Search-and-pick a person from the family. */
export function PersonPicker({
  model,
  excludeId,
  value,
  onChange,
  label,
}: {
  model: FamilyModel;
  excludeId?: string | null;
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const results = searchPeople(model, q).filter((p) => p.id !== excludeId);
  const selected = value ? model.persons.get(value) : null;
  return (
    <div>
      <TextField label={label ?? t('relative.connectSearch')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} />
      {selected && (
        <p className="mt-2 rounded-lg border border-amber-800 bg-amber-50 p-2 font-medium text-amber-900">
          ✓ {displayName(selected, lang).text} <span className="text-sm font-normal text-stone-500">{lifespan(selected, lang)}</span>
        </p>
      )}
      {q.trim() && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-stone-200">
          {results.length === 0 && <li className="p-3 text-sm text-stone-500">{t('search.none')}</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setQ('');
                }}
                className="flex min-h-11 w-full items-center justify-between px-3 text-left hover:bg-stone-100"
              >
                <span>{displayName(p, lang).text}</span>
                <span className="text-sm text-stone-500">{lifespan(p, lang)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
