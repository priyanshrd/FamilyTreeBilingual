// Bilingual values: { en: { v, src }, mr: { v, src, from, provider, at, src_hash } }.
// Rule (invariant I9): automatic output never replaces a value the user typed or corrected.
// The database enforces the same rule; this module lets the UI explain it before saving.
import { textHash } from '@/domain/text/normalize';

export type TextSource = 'manual' | 'auto' | 'corrected';

export type LocalizedEntry = {
  v: string;
  src: TextSource;
  /** source language when generated */
  from?: string;
  provider?: string;
  /** ISO timestamp of generation */
  at?: string;
  /** hash of the source text at generation time, to detect staleness */
  src_hash?: string;
};

export type LocalizedText = Record<string, LocalizedEntry>;

export type ResolvedText = { text: string; lang: string; isFallback: boolean } | null;

/** Value in `lang`, else the first available fallback language. */
export function getText(lt: LocalizedText | null | undefined, lang: string, fallbacks: string[] = ['en', 'mr']): ResolvedText {
  if (!lt) return null;
  const order = [lang, ...fallbacks.filter((l) => l !== lang), ...Object.keys(lt)];
  for (const l of order) {
    const v = lt[l]?.v?.trim();
    if (v) return { text: v, lang: l, isFallback: l !== lang };
  }
  return null;
}

/** A user typed a value. Editing an automatic value marks it "corrected". Empty removes it. */
export function setManual(lt: LocalizedText | null | undefined, lang: string, value: string): LocalizedText {
  const next: LocalizedText = { ...(lt ?? {}) };
  const v = value.trim();
  if (!v) {
    delete next[lang];
    return next;
  }
  const prev = next[lang];
  if (prev && prev.v === v) return next;
  next[lang] = prev && prev.src !== 'manual' ? { ...prev, v, src: 'corrected' } : { v, src: 'manual' };
  return next;
}

export type AutoResult =
  | { applied: true; value: LocalizedText }
  | { applied: false; value: LocalizedText; reason: 'protected' | 'unchanged' };

/** Store a generated value unless a manual / corrected value is already there. */
export function applyAuto(
  lt: LocalizedText | null | undefined,
  lang: string,
  value: string,
  meta: { from: string; provider: string; at?: string },
): AutoResult {
  const current: LocalizedText = { ...(lt ?? {}) };
  const prev = current[lang];
  if (prev && prev.src !== 'auto' && prev.v.trim()) return { applied: false, value: current, reason: 'protected' };
  const source = current[meta.from]?.v ?? '';
  const entry: LocalizedEntry = {
    v: value.trim(),
    src: 'auto',
    from: meta.from,
    provider: meta.provider,
    at: meta.at ?? new Date().toISOString(),
    src_hash: textHash(source),
  };
  if (prev && prev.v === entry.v && prev.src_hash === entry.src_hash) return { applied: false, value: current, reason: 'unchanged' };
  return { applied: true, value: { ...current, [lang]: entry } };
}

/** True when an automatic value was generated from a source text that has since changed. */
export function isStale(lt: LocalizedText | null | undefined, lang: string): boolean {
  const e = lt?.[lang];
  if (!e || e.src !== 'auto' || !e.from || !e.src_hash) return false;
  const source = lt?.[e.from]?.v;
  return source != null && textHash(source) !== e.src_hash;
}

/** Can the "Generate <lang>" button write without asking? */
export function canAutoFill(lt: LocalizedText | null | undefined, lang: string): boolean {
  const e = lt?.[lang];
  return !e || !e.v.trim() || e.src === 'auto';
}
