// Text size for this browser (Settings → Text size). The page scales through the root font size
// (all text is in rem); the tree, whose boxes have fixed sizes, scales through its zoom instead.
import { useSyncExternalStore } from 'react';

export const TEXT_SIZES = { normal: 1, large: 1.15, xlarge: 1.3 } as const;
export type TextSize = keyof typeof TEXT_SIZES;

const KEY = 'ft.textSize';
const listeners = new Set<() => void>();

function read(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    return v && v in TEXT_SIZES ? (v as TextSize) : 'normal';
  } catch {
    return 'normal';
  }
}

let current: TextSize = read();

/** Apply the saved size to the page (call once at start-up). */
export function applyTextSize(size: TextSize = current) {
  document.documentElement.style.fontSize = `${TEXT_SIZES[size] * 100}%`;
}

export function setTextSize(size: TextSize) {
  current = size;
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // not remembered; still applies now
  }
  applyTextSize(size);
  for (const l of listeners) l();
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export const textScale = () => TEXT_SIZES[current];
