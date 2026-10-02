import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' };

const styles = {
  primary: 'bg-amber-800 text-white hover:bg-amber-900 disabled:bg-amber-800/50',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 disabled:opacity-50',
  ghost: 'text-stone-700 hover:bg-stone-200/60 disabled:opacity-50',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
