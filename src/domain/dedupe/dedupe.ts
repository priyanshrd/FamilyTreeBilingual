// Duplicate detection: "Possible existing person found". Suggests only; never merges.
import { detectScript, searchKey } from '@/domain/text/normalize';

export type DedupeCandidate = {
  id: string;
  /** names in any language / script */
  names: string[];
  birthYear?: number | null;
  birthPlace?: string | null;
  /** ids of this person's parents, partners and children */
  relativeIds?: string[];
  isPlaceholder?: boolean;
};

export type DedupeInput = {
  names: string[];
  birthYear?: number | null;
  birthPlace?: string | null;
  /** people the new person is about to be connected to (e.g. the anchor and its relatives) */
  nearbyIds?: string[];
};

export type DedupeReason = 'name' | 'surname' | 'birth_year' | 'birth_year_conflict' | 'place' | 'relatives';
export type DedupeMatch = { id: string; score: number; reasons: DedupeReason[] };

/** Loose phonetic key for Latin-script Indian names: Rajeev ~ Rajiv, Sachin ~ Sacheen. */
export function phoneticKey(name: string): string {
  let s = searchKey(name);
  if (detectScript(s) !== 'Latn') return s;
  s = s
    .replace(/ee|ii/g, 'i')
    .replace(/oo|uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/w/g, 'v')
    .replace(/ph/g, 'f')
    .replace(/([bcdgjkpt])h/g, '$1')
    .replace(/(.)\1+/g, '$1');
  return s.replace(/(\S)a\b/g, '$1'); // trailing schwa: Rama ~ Ram
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.split(' ').filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm-style similarity, 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** Best similarity between two sets of names, comparing only names in the same script. */
export function nameSimilarity(as: string[], bs: string[]): { score: number; surname: boolean } {
  let best = 0;
  let surname = false;
  for (const a of as) {
    for (const b of bs) {
      const sa = detectScript(a);
      if (sa !== detectScript(b)) continue;
      const ka = phoneticKey(a);
      const kb = phoneticKey(b);
      if (!ka || !kb) continue;
      best = Math.max(best, ka === kb ? 1 : trigramSimilarity(ka, kb));
      const la = ka.split(' ').at(-1);
      const lb = kb.split(' ').at(-1);
      if (ka.includes(' ') && kb.includes(' ') && la === lb) surname = true;
    }
  }
  return { score: best, surname };
}

export const DUPLICATE_THRESHOLD = 0.55;

export function findPossibleDuplicates(input: DedupeInput, people: DedupeCandidate[], limit = 5): DedupeMatch[] {
  const nearby = new Set(input.nearbyIds ?? []);
  const matches: DedupeMatch[] = [];

  for (const p of people) {
    if (p.isPlaceholder) continue;
    const { score: nameScore, surname } = nameSimilarity(input.names, p.names);
    if (nameScore < 0.3) continue;

    const reasons: DedupeReason[] = [];
    let score = nameScore * 0.7;
    if (nameScore >= 0.6) reasons.push('name');
    if (surname) {
      score += 0.05;
      reasons.push('surname');
    }
    if (input.birthYear != null && p.birthYear != null) {
      const diff = Math.abs(input.birthYear - p.birthYear);
      if (diff === 0) {
        score += 0.2;
        reasons.push('birth_year');
      } else if (diff <= 2) {
        score += 0.1;
        reasons.push('birth_year');
      } else if (diff > 5) {
        score -= 0.3;
        reasons.push('birth_year_conflict');
      }
    }
    if (input.birthPlace && p.birthPlace && searchKey(input.birthPlace) === searchKey(p.birthPlace)) {
      score += 0.1;
      reasons.push('place');
    }
    if (nearby.size && (nearby.has(p.id) || p.relativeIds?.some((r) => nearby.has(r)))) {
      score += 0.15;
      reasons.push('relatives');
    }

    score = Math.max(0, Math.min(1, score));
    if (score >= DUPLICATE_THRESHOLD) matches.push({ id: p.id, score: Math.round(score * 100) / 100, reasons });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
