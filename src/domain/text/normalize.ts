// Text helpers shared by search, duplicate detection and language bookkeeping.

/**
 * Search key: lower-case, Latin diacritics and Devanagari nukta removed, whitespace collapsed.
 * Must match private.search_key() in the database.
 */
export function searchKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[̀-़ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

export function toLatinDigits(value: string): string {
  return value.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

export function toDevanagariDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[Number(d)]!);
}

export type Script = 'Latn' | 'Deva' | 'other';

/** Dominant script of a string, by counting letters. Local and instant: no network call. */
export function detectScript(value: string): Script {
  let latin = 0;
  let deva = 0;
  for (const ch of value) {
    if (/[A-Za-zÀ-ɏ]/.test(ch)) latin++;
    else if (/[ऀ-ॿ]/.test(ch)) deva++;
  }
  if (latin === 0 && deva === 0) return 'other';
  return deva > latin ? 'Deva' : 'Latn';
}

/** Stable, non-cryptographic hash (FNV-1a, 32-bit) used to detect that a source text changed. */
export function textHash(value: string): string {
  let h = 0x811c9dc5;
  for (const ch of value.normalize('NFC')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
