import { useEffect, useId, useRef, type ReactNode } from 'react';
import { LanguageToggle } from '@/components/LanguageToggle';

/**
 * Width of the right-hand sidebar; the workspace reserves the same space so the tree stays visible.
 * On larger screens the sidebar starts below the page header (--header-h), so the header never moves.
 */
export const SIDEBAR_WIDTH_CLASS = 'sm:w-[26rem]';
export const SIDEBAR_RESERVE_CLASS = 'sm:pr-[26rem]';
/** Save / Cancel row of a form: stays visible at the bottom while the form scrolls (long forms on phones). */
export const DIALOG_ACTIONS_CLASS = 'sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-white px-4 py-3';

type Props = { title: string; onClose: () => void; children: ReactNode; wide?: boolean };

/**
 * Forms open in the right-hand sidebar (full screen on phones), never over the tree.
 * Esc closes. It sits above the person panel, so closing a form returns to that person.
 */
export function Dialog({ title, onClose, children }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className={`fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white sm:top-[var(--header-h,0px)] sm:bottom-0 sm:right-0 sm:left-auto sm:border-l sm:border-stone-200 sm:shadow-xl ${SIDEBAR_WIDTH_CLASS}`}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white p-4">
        <h2 id={titleId} className="text-lg font-semibold text-stone-900">
          {title}
        </h2>
        <span className="ml-auto sm:hidden">
          <LanguageToggle compact />
        </span>
        <button
          type="button"
          data-close
          onClick={onClose}
          aria-label="Close"
          className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-stone-500 hover:bg-stone-100"
        >
          ×
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
