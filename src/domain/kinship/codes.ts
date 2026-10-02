// Kinship path codes. A relationship key is a dot-separated path of steps from person A to B:
//   parent F / M / P      child S / D / C      sibling B / Z / Sib (optionally e = elder, y = younger)
//   spouse H / W / Sp
// e.g. 'M.B' = mother's brother, 'F.eB' = father's elder brother, 'Sp.F' = spouse's father.
import type { Gender } from '@/domain/genealogy/graph';

export type StepType = 'parent' | 'child' | 'sibling' | 'spouse';
export type RelativeAge = 'elder' | 'younger' | null;

const LETTERS: Record<StepType, [male: string, female: string, neutral: string]> = {
  parent: ['F', 'M', 'P'],
  child: ['S', 'D', 'C'],
  sibling: ['B', 'Z', 'Sib'],
  spouse: ['H', 'W', 'Sp'],
};

export function stepCode(type: StepType, gender: Gender, age: RelativeAge = null): string {
  const [m, f, n] = LETTERS[type];
  const letter = gender === 'male' ? m : gender === 'female' ? f : n;
  return type === 'sibling' && age ? `${age === 'elder' ? 'e' : 'y'}${letter}` : letter;
}

const GENERALIZE: Record<string, string> = { F: 'P', M: 'P', S: 'C', D: 'C', B: 'Sib', Z: 'Sib', H: 'Sp', W: 'Sp' };

export function stripAge(code: string): string {
  return /^[ey](B|Z|Sib)$/.test(code) ? code.slice(1) : code;
}

export function generalize(code: string): string {
  const c = stripAge(code);
  return GENERALIZE[c] ?? c;
}

/**
 * Lookup variants for a key, most specific first: exact, then elder/younger dropped,
 * then the genders of intermediate people generalised (the last person's gender is kept).
 */
export function keyVariants(key: string): string[] {
  if (!key) return [];
  const segs = key.split('.');
  const options = segs.map((s, i) => {
    const opts: [string, number][] = [[s, 0]];
    const stripped = stripAge(s);
    if (stripped !== s) opts.push([stripped, 1]);
    if (i < segs.length - 1) {
      const gen = generalize(s);
      if (gen !== stripped) opts.push([gen, 2]);
    }
    return opts;
  });
  let combos: [string[], number][] = [[[], 0]];
  for (const opts of options) {
    combos = combos.flatMap(([parts, cost]) => opts.map(([o, c]) => [[...parts, o], cost + c] as [string[], number]));
    if (combos.length > 4096) break;
  }
  const sorted = combos.sort((a, b) => a[1] - b[1]).map(([parts]) => parts.join('.'));
  return [...new Set(sorted)];
}

const DESCRIBE: Record<string, string> = {
  F: 'father', M: 'mother', P: 'parent', S: 'son', D: 'daughter', C: 'child',
  B: 'brother', Z: 'sister', Sib: 'sibling', eB: 'elder brother', yB: 'younger brother',
  eZ: 'elder sister', yZ: 'younger sister', eSib: 'elder sibling', ySib: 'younger sibling',
  H: 'husband', W: 'wife', Sp: 'spouse',
};

/** Literal English reading of a key, e.g. 'M.B.W' → "mother's brother's wife". */
export function describeKey(key: string): string {
  if (!key) return 'self';
  return key
    .split('.')
    .map((c) => DESCRIBE[c] ?? c)
    .join("'s ");
}

export function isValidKey(key: string): boolean {
  return key.split('.').every((c) => c in DESCRIBE);
}
