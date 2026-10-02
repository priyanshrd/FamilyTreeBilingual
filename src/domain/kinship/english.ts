// Readable English identifiers for relationships, e.g. 'maternal_uncle', 'first_cousin_once_removed'.
// Computed from the structure of the path; the canonical key remains the kinship path.
import type { Gender } from '@/domain/genealogy/graph';

export type Side = 'paternal' | 'maternal' | null;

const word = (g: Gender, male: string, female: string, neutral: string) =>
  g === 'male' ? male : g === 'female' ? female : neutral;

const greats = (n: number) => 'great_'.repeat(Math.max(0, n));
const sided = (side: Side, id: string) => (side ? `${side}_${id}` : id);

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const TIMES = ['', 'once', 'twice', 'thrice'];

/** English id of a blood relationship `up` generations to the common ancestor and `down` from it. */
export function bloodEnglishId(up: number, down: number, gender: Gender, side: Side, half: boolean): string {
  if (up === 0 && down === 0) return 'self';
  if (down === 0) {
    const base = word(gender, 'father', 'mother', 'parent');
    if (up === 1) return base;
    return sided(side, `${greats(up - 2)}grand${base}`);
  }
  if (up === 0) {
    const base = word(gender, 'son', 'daughter', 'child');
    if (down === 1) return base;
    return `${greats(down - 2)}grand${base}`;
  }
  if (up === 1 && down === 1) return `${half ? 'half_' : ''}${word(gender, 'brother', 'sister', 'sibling')}`;
  if (down === 1) {
    const base = word(gender, 'uncle', 'aunt', 'parents_sibling');
    return sided(side, up === 2 ? base : `${greats(up - 3)}grand_${base}`);
  }
  if (up === 1) {
    const base = word(gender, 'nephew', 'niece', 'siblings_child');
    return down === 2 ? base : `${greats(down - 3)}grand_${base}`;
  }
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const ord = ORDINALS[degree] ?? `${degree}th`;
  return `${ord}_cousin${removed ? `_${TIMES[removed] ?? `${removed}_times`}_removed` : ''}`;
}

export const spouseWord = (g: Gender) => word(g, 'husband', 'wife', 'spouse');

/** "maternal_uncle" → "maternal uncle", "husband_s_brother" → "husband's brother". */
export function humanizeEnglishId(id: string): string {
  return id.replace(/_s_/g, "'s ").replace(/_/g, ' ');
}
