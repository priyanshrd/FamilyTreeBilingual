import { useI18n } from '@/i18n/I18nProvider';

const LABELS = { en: 'English', mr: 'मराठी' } as const;

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t('settings.language')} className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5">
      {(['mr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-9 rounded-md px-3 text-sm ${lang === l ? 'bg-amber-800 text-white' : 'text-stone-700 hover:bg-stone-100'}`}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
