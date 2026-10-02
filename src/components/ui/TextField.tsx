import { useId, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null };

export function TextField({ label, hint, error, className = '', ...rest }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint || error ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        className="block min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-amber-700 focus:ring-2 focus:ring-amber-700/30 focus:outline-none"
        {...rest}
      />
      {(error || hint) && (
        <p id={hintId} className={`mt-1 text-sm ${error ? 'text-red-700' : 'text-stone-500'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
