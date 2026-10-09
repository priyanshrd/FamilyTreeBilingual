import { useId } from 'react';
import type { Bi } from '@/domain/family/personInput';

type Props = {
  label: string;
  value: Bi;
  onChange: (v: Bi) => void;
  placeholder?: Partial<Bi>;
  required?: boolean;
  requiredText?: string;
  error?: string | null;
  multiline?: boolean;
};

// Each box is tagged in its own language, whatever the UI language is.
const TAGS = { mr: 'मराठी', en: 'English' } as const;

/** One field, two languages: a Marathi box and an English box. Either may be left empty. */
export function BilingualField({ label, value, onChange, placeholder, required, requiredText, error, multiline }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 text-sm font-medium text-stone-700">
        {label}
        {required && <span className="ml-1 text-xs font-normal text-amber-800">({requiredText ?? 'required'})</span>}
      </legend>
      <div className="space-y-1.5">
        {(['mr', 'en'] as const).map((lang) => {
          const common = {
            id: `${id}-${lang}`,
            lang,
            value: value[lang],
            placeholder: placeholder?.[lang],
            'aria-label': `${label} — ${TAGS[lang]}`,
            'aria-invalid': error ? true : undefined,
            onChange: (e: { target: { value: string } }) => onChange({ ...value, [lang]: e.target.value }),
            className:
              'block w-full rounded-r-lg border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:ring-2 focus:ring-amber-700/30 focus:outline-none',
          };
          return (
            <div key={lang} className="flex">
              <label
                htmlFor={common.id}
                className="flex w-16 shrink-0 items-center justify-center rounded-l-lg border border-r-0 border-stone-300 bg-stone-100 text-xs text-stone-600"
              >
                {TAGS[lang]}
              </label>
              {multiline ? (
                <textarea {...common} rows={2} className={`${common.className} py-2`} />
              ) : (
                <input {...common} className={`${common.className} min-h-11`} />
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
