// Relationship terminology. Built-in defaults live here; each family can override or add terms
// in the in-site dictionary (kinship_terms table). Lookup order:
//   family override → built-in default → (English) readable id / (other languages) composed path.
// Keys are kinship paths (see codes.ts). Lookup tries the exact key first, then generalisations.
import { describeKey, keyVariants } from './codes';
import { humanizeEnglishId } from './english';
import type { KinshipResult } from './resolve';

export type TermTable = Record<string, string>;

/**
 * Default Marathi terms. Regional usage varies — families can change any of these in the app.
 * Neutral letters (P, C, Sib, Sp) in non-final positions match either gender.
 */
export const MARATHI_DEFAULTS: TermTable = {
  // parents, children, siblings, spouse
  F: 'वडील',
  M: 'आई',
  P: 'पालक',
  S: 'मुलगा',
  D: 'मुलगी',
  C: 'अपत्य',
  B: 'भाऊ',
  eB: 'दादा (मोठा भाऊ)',
  yB: 'धाकटा भाऊ',
  Z: 'बहीण',
  eZ: 'ताई (मोठी बहीण)',
  yZ: 'धाकटी बहीण',
  Sib: 'भावंड',
  H: 'पती',
  W: 'पत्नी',
  Sp: 'जोडीदार',
  // grandparents and above
  'P.F': 'आजोबा',
  'P.M': 'आजी',
  'P.P.F': 'पणजोबा',
  'P.P.M': 'पणजी',
  'P.P.P.F': 'खापरपणजोबा',
  'P.P.P.M': 'खापरपणजी',
  // grandchildren and below
  'C.S': 'नातू',
  'C.D': 'नात',
  'C.C.S': 'पणतू',
  'C.C.D': 'पणती',
  // father's side
  'F.B': 'काका',
  'F.eB': 'मोठे काका',
  'F.yB': 'धाकटे काका',
  'F.B.W': 'काकू',
  'F.Z': 'आत्या',
  'F.Z.H': 'आतोबा',
  'F.B.S': 'चुलत भाऊ',
  'F.B.D': 'चुलत बहीण',
  'F.Z.S': 'आतेभाऊ',
  'F.Z.D': 'आतेबहीण',
  // mother's side
  'M.B': 'मामा',
  'M.B.W': 'मामी',
  'M.Z': 'मावशी',
  'M.Z.H': 'मावसा',
  'M.B.S': 'मामेभाऊ',
  'M.B.D': 'मामेबहीण',
  'M.Z.S': 'मावसभाऊ',
  'M.Z.D': 'मावसबहीण',
  // nephews and nieces
  'B.S': 'पुतण्या',
  'B.D': 'पुतणी',
  'Z.S': 'भाचा',
  'Z.D': 'भाची',
  // in-laws
  'Sp.F': 'सासरे',
  'Sp.M': 'सासू',
  'S.W': 'सून',
  'D.H': 'जावई',
  'H.B': 'दीर',
  'H.Z': 'नणंद',
  'W.B': 'मेहुणा',
  'W.Z': 'मेहुणी',
  'B.W': 'वहिनी',
  'Z.H': 'भाऊजी',
  'H.B.W': 'जाऊ',
  'W.Z.H': 'साडू',
  'C.Sp.F': 'व्याही',
  'C.Sp.M': 'विहीण',
  // step
  'F.W': 'सावत्र आई',
  'M.H': 'सावत्र वडील',
  'Sp.S': 'सावत्र मुलगा',
  'Sp.D': 'सावत्र मुलगी',
  'P.Sp.S': 'सावत्र भाऊ',
  'P.Sp.D': 'सावत्र बहीण',
};

export const DEFAULT_TERMS: Record<string, TermTable> = { mr: MARATHI_DEFAULTS, en: {} };

const MARATHI_STEP_WORDS: Record<string, string> = {
  F: 'वडील', M: 'आई', P: 'पालक', S: 'मुलगा', D: 'मुलगी', C: 'अपत्य',
  B: 'भाऊ', Z: 'बहीण', Sib: 'भावंड', H: 'पती', W: 'पत्नी', Sp: 'जोडीदार',
};

export type RelationshipLabel = {
  text: string;
  /** dictionary key that matched, if any */
  matchedKey: string | null;
  source: 'family' | 'default' | 'generated';
};

/** Looks up a term for a key in the family's overrides, then the defaults. */
export function lookupTerm(key: string, lang: string, overrides: TermTable = {}): RelationshipLabel | null {
  const defaults = DEFAULT_TERMS[lang] ?? {};
  for (const variant of keyVariants(key)) {
    if (overrides[variant]) return { text: overrides[variant], matchedKey: variant, source: 'family' };
    if (defaults[variant]) return { text: defaults[variant], matchedKey: variant, source: 'default' };
  }
  return null;
}

/** Display label for a relationship in a language, applying half / adoptive qualifiers. */
export function labelRelationship(result: KinshipResult, lang: string, overrides: TermTable = {}): RelationshipLabel {
  if (result.kind === 'self') return { text: lang === 'mr' ? 'स्वतः' : 'self', matchedKey: null, source: 'generated' };
  if (result.kind === 'none') {
    return { text: lang === 'mr' ? 'नाते सापडले नाही' : 'no relationship found', matchedKey: null, source: 'generated' };
  }

  // Direct step / foster / guardian parentage shares its key with real parents (F, M, S, ...),
  // so it is qualified here rather than looked up on its own.
  const only = result.steps.length === 1 ? result.steps[0] : undefined;
  if (only?.lineage && ['step', 'foster', 'guardian'].includes(only.lineage)) {
    const base = lookupTerm(result.key, lang, overrides)?.text ?? result.key;
    const text =
      lang === 'mr'
        ? { step: `सावत्र ${base}`, foster: `${base} (पालनपोषण)`, guardian: 'संरक्षक' }[only.lineage as 'step']
        : humanizeEnglishId(result.english);
    return { text, matchedKey: null, source: 'generated' };
  }

  if (result.twin && lang === 'mr') {
    const code = result.steps[0]?.code ?? 'Sib';
    const text = overrides[`twin${code}`] ?? (code === 'B' ? 'जुळा भाऊ' : code === 'Z' ? 'जुळी बहीण' : 'जुळे भावंड');
    return { text, matchedKey: null, source: 'default' };
  }

  const found = lookupTerm(result.key, lang, overrides);
  let label: RelationshipLabel;
  if (found) label = found;
  else if (lang === 'mr') {
    label = { text: composeMarathi(result.steps.map((s) => s.code), overrides), matchedKey: null, source: 'generated' };
  } else {
    label = { text: plainEnglish(result), matchedKey: null, source: 'generated' };
  }

  // Qualifiers only when the matched term does not already encode them.
  if (result.half && result.kind === 'blood' && label.source !== 'generated') {
    label = { ...label, text: lang === 'mr' ? `सावत्र ${label.text}` : `half-${label.text}` };
  }
  if (result.adoptive) label = { ...label, text: `${label.text} ${lang === 'mr' ? '(दत्तक)' : '(adoptive)'}` };
  return label;
}

/** Rows for the dictionary page: every default key with its literal English reading. */
export function dictionaryRows(overridesByLang: Record<string, TermTable> = {}) {
  const keys = new Set([...Object.keys(MARATHI_DEFAULTS), ...Object.values(overridesByLang).flatMap((t) => Object.keys(t))]);
  return [...keys].sort().map((key) => ({
    key,
    meaning: describeKey(key),
    terms: Object.fromEntries(
      ['en', 'mr'].map((lang) => [
        lang,
        { default: DEFAULT_TERMS[lang]?.[key] ?? null, override: overridesByLang[lang]?.[key] ?? null },
      ]),
    ),
  }));
}

/** Word for one step of a path ("M" → "आई" / "mother", "eB" → "दादा (मोठा भाऊ)" / "elder brother"). */
export function stepWord(code: string, lang: string, overrides: TermTable = {}): string {
  if (lang === 'mr') return lookupTerm(code, 'mr', overrides)?.text ?? MARATHI_STEP_WORDS[code.replace(/^[ey]/, '')] ?? code;
  return overrides[code] ?? describeKey(code);
}

// ---------------------------------------------------------------------------
// Plain-language labels for relationships that have no single word
// ---------------------------------------------------------------------------

const GEN: Record<string, number> = { F: 1, M: 1, P: 1, S: -1, D: -1, C: -1 };
const genOf = (codes: string[]) => codes.reduce((g, c) => g + (GEN[stripAgeLetter(c)] ?? 0), 0);
const stripAgeLetter = (c: string) => c.replace(/^[ey](?=B|Z|Sib)/, '');
const genderOf = (code: string): 'm' | 'f' | 'n' => {
  const c = stripAgeLetter(code);
  return ['F', 'B', 'S', 'H'].includes(c) ? 'm' : ['M', 'Z', 'D', 'W'].includes(c) ? 'f' : 'n';
};

/**
 * English without genealogists' jargon: "first cousin once removed" becomes "mother's cousin" or
 * "cousin's daughter"; "first cousin" is just "cousin".
 */
function plainEnglish(result: KinshipResult): string {
  const c = result.cousin;
  if (!c || result.kind !== 'blood' || !result.generations) return humanizeEnglishId(result.english);
  const ordinal = result.english.split('_cousin')[0]!;
  const cousin = `${result.half ? 'half-' : ''}${c.degree === 1 ? 'cousin' : `${ordinal} cousin`}`;
  if (c.removed === 0) return cousin;
  const codes = result.steps.map((s) => s.code);
  if (result.generations.up > result.generations.down) {
    // they are older: "mother's cousin", "father's mother's cousin"
    const chain = codes.slice(0, c.removed).map((code) => ({ F: 'father', M: 'mother' })[code] ?? 'parent');
    return `${chain.join("'s ")}'s ${cousin}`;
  }
  // they are younger: "cousin's daughter", "cousin's grandson"
  const g = genderOf(codes[codes.length - 1]!);
  const child = g === 'm' ? 'son' : g === 'f' ? 'daughter' : 'child';
  const word = c.removed === 1 ? child : `${'great-'.repeat(c.removed - 2)}grand${child}`;
  return `${cousin}'s ${word}`;
}

/** Marathi oblique (possessor) form of a term: भाऊ → भावा, बहीण → बहिणी, काका → काकां. */
function marathiOblique(term: string, elder: boolean): string {
  const words = term.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/\s+/);
  const last = words.pop()!;
  const adjectives = words.map((w) => (w.endsWith('े') ? `${w.slice(0, -1)}्या` : w));
  const special: [string, string][] = [
    ['भाऊ', 'भावा'],
    ['बहीण', 'बहिणी'],
    ['मुलगा', 'मुला'],
    ['मुलगी', 'मुली'],
    ['नातू', 'नातवा'],
    ['नात', 'नाती'],
    ['वडील', 'वडिलां'],
    ['सासरे', 'सासऱ्यां'],
    ['जावई', 'जावया'],
    ['सून', 'सुने'],
    ['दीर', 'दिरा'],
    ['नणंद', 'नणंदे'],
    ['भावंड', 'भावंडा'],
    ['अपत्य', 'अपत्या'],
  ];
  let out = last;
  const hit = special.find(([from]) => last.endsWith(from));
  if (hit) out = last.slice(0, -hit[0].length) + hit[1];
  else if (last.endsWith('ा') && elder) out = `${last}ं`;
  else if (last.endsWith('ा') && !last.endsWith('्या') && !last.endsWith('या') && !elder) out = `${last.slice(0, -1)}्या`;
  return [...adjectives, out].join(' ');
}

/**
 * Marathi phrase for a path with no single term, built from dictionary words through the closest
 * relatives: "आईचा मावसभाऊ", "चुलत बहिणीची मुलगी", "वडिलांच्या चुलत भावाचा मुलगा".
 */
export function composeMarathi(codes: string[], overrides: TermTable = {}): string {
  const term = (part: string[]) => lookupTerm(part.join('.'), 'mr', overrides)?.text ?? (part.length === 1 ? MARATHI_STEP_WORDS[stripAgeLetter(part[0]!)] : undefined);
  // fewest pieces first; then the people in between as close to "me" in generation as possible
  type Plan = { pieces: string[][]; cost: [number, number] };
  const memo = new Map<number, Plan | null>();
  const plan = (from: number): Plan | null => {
    if (from === codes.length) return { pieces: [], cost: [0, 0] };
    if (memo.has(from)) return memo.get(from)!;
    let best: Plan | null = null;
    for (let to = codes.length; to > from; to--) {
      const piece = codes.slice(from, to);
      if (!term(piece)) continue;
      const rest = plan(to);
      if (!rest) continue;
      const junction = to < codes.length ? Math.abs(genOf(codes.slice(0, to))) : 0;
      const cost: [number, number] = [rest.cost[0] + 1, rest.cost[1] + junction];
      if (!best || cost[0] < best.cost[0] || (cost[0] === best.cost[0] && cost[1] < best.cost[1])) best = { pieces: [piece, ...rest.pieces], cost };
    }
    memo.set(from, best);
    return best;
  };
  const p = plan(0);
  if (!p) return codes.map((c) => MARATHI_STEP_WORDS[stripAgeLetter(c)] ?? c).join(' → ');
  const words = p.pieces.map((piece) => term(piece)!);
  if (words.length === 1) return words[0]!;
  const parts: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const elder = genOf(p.pieces[i]!) > 0;
    const next = p.pieces[i + 1]!;
    const suffix =
      i < words.length - 2 ? 'च्या' : genderOf(next[next.length - 1]!) === 'f' ? 'ची' : genderOf(next[next.length - 1]!) === 'm' && genOf(next) <= 0 ? 'चा' : 'चे';
    parts.push(`${marathiOblique(words[i]!, elder)}${suffix}`);
  }
  const last = words[words.length - 1]!.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return `${parts.join(' ')} ${last}`;
}
