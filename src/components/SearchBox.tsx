import { useId, useState } from 'react';
import { displayName, lifespan, searchPeople, type FamilyModel } from '@/domain/family/familyModel';
import { useI18n } from '@/i18n/I18nProvider';

/** Header search: type an English or Marathi name, pick a person to jump to them. */
export function SearchBox({ model, onPick }: { model: FamilyModel; onPick: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = q.trim() ? searchPeople(model, q, 8) : [];

  function pick(id: string) {
    onPick(id);
    setQ('');
    setActive(0);
    // done searching: let go of the keyboard, so keys like Delete act on the chosen person
    (document.activeElement as HTMLElement | null)?.blur();
  }

  return (
    <div className="relative w-full sm:w-72">
      <input
        type="search"
        role="combobox"
        aria-label={t('search.label')}
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
        placeholder={t('search.placeholder')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && results[active]) pick(results[active].id);
          else if (e.key === 'Escape') setQ('');
        }}
        className="block min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-base focus:border-amber-700 focus:ring-2 focus:ring-amber-700/30 focus:outline-none"
      />
      {q.trim() && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
          {results.length === 0 && <li className="p-3 text-sm text-stone-500">{t('search.none')}</li>}
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p.id);
              }}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 ${i === active ? 'bg-amber-50' : 'hover:bg-stone-50'}`}
            >
              <span className="py-1">
                <span className="block">{displayName(p, lang).text}</span>
                {p.names[lang === 'mr' ? 'en' : 'mr'] && p.names[lang] && (
                  <span className="block text-sm text-stone-500">{p.names[lang === 'mr' ? 'en' : 'mr']!.full_name}</span>
                )}
              </span>
              <span className="text-sm text-stone-600">{lifespan(p, lang)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
