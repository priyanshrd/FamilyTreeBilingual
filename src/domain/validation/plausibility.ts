// Plausibility warnings. Unlike the hard invariants (enforced by the database), these never block
// saving: real genealogy data is messy and dates are often approximate.
import { compareFuzzyDates, dateRange, type FuzzyDate } from '@/domain/dates/fuzzyDate';
import type { GenealogyGraph } from '@/domain/genealogy/graph';
import { KinshipResolver } from '@/domain/kinship/resolve';

export type Warning =
  | { code: 'birth_after_death'; personId: string }
  | { code: 'parent_born_after_child'; parentId: string; childId: string }
  | { code: 'parent_too_young'; parentId: string; childId: string }
  | { code: 'born_after_parent_death'; parentId: string; childId: string }
  | { code: 'close_relative_partner'; a: string; b: string; english: string };

const MIN_PARENT_AGE = 12;

function yearsBetween(earlier: FuzzyDate, later: FuzzyDate): number | null {
  const a = dateRange(earlier);
  const b = dateRange(later);
  if (!a?.latest || !b?.earliest) return null;
  // Smallest possible gap, so warnings fire only when certain.
  return Number(b.earliest.slice(0, 4)) - Number(a.latest.slice(0, 4));
}

export function personWarnings(birth?: FuzzyDate, death?: FuzzyDate, personId = ''): Warning[] {
  if (birth && death && compareFuzzyDates(birth, death) === 1) return [{ code: 'birth_after_death', personId }];
  return [];
}

/** Warnings for a proposed (or existing) parent → child link. */
export function parentChildWarnings(
  parent: { id: string; birth?: FuzzyDate; death?: FuzzyDate },
  child: { id: string; birth?: FuzzyDate },
): Warning[] {
  const out: Warning[] = [];
  const ids = { parentId: parent.id, childId: child.id };
  if (parent.birth && child.birth) {
    if (compareFuzzyDates(parent.birth, child.birth) === 1) out.push({ code: 'parent_born_after_child', ...ids });
    else {
      // largest possible age gap; warn only if even that is too small
      const a = dateRange(parent.birth);
      const b = dateRange(child.birth);
      const maxGap = a?.earliest && b?.latest ? Number(b.latest.slice(0, 4)) - Number(a.earliest.slice(0, 4)) : null;
      if (maxGap != null && maxGap < MIN_PARENT_AGE) out.push({ code: 'parent_too_young', ...ids });
    }
  }
  if (parent.death && child.birth) {
    const gap = yearsBetween(parent.death, child.birth);
    if (gap != null && gap > 1) out.push({ code: 'born_after_parent_death', ...ids });
  }
  return out;
}

/**
 * Warn (do not block) when partnering close blood relatives: siblings, parent/child,
 * uncle/aunt with niece/nephew. Cousin marriage is customary in many families, so it is not flagged.
 */
export function partnerWarnings(g: GenealogyGraph, a: string, b: string): Warning[] {
  const r = new KinshipResolver(g).find(a, b);
  const blood = [r, ...r.alternatives].find((x) => x.kind === 'blood');
  if (blood?.generations && blood.generations.up + blood.generations.down <= 3) {
    return [{ code: 'close_relative_partner', a, b, english: blood.english }];
  }
  return [];
}
