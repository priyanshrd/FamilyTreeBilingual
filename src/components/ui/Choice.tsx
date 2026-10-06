import { useId } from 'react';

type Option<T extends string> = { value: T; label: string };

/** Segmented single choice (radio group) — big touch targets, no dropdown hunting. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-stone-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm ${
              value === o.value ? 'border-amber-800 bg-amber-50 text-amber-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <input type="radio" className="sr-only" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
