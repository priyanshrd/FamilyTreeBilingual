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

  const found = lookupTerm(result.key, lang, overrides);
  let label: RelationshipLabel;
  if (found) label = found;
  else if (lang === 'mr') {
    const text = result.steps.map((s) => MARATHI_STEP_WORDS[s.code.replace(/^[ey]/, '')] ?? s.code).join(' → ');
    label = { text, matchedKey: null, source: 'generated' };
  } else {
    label = { text: humanizeEnglishId(result.english), matchedKey: null, source: 'generated' };
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
