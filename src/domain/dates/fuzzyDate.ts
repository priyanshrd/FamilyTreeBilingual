// Genealogy dates: exact, approximate, year-only, before/after, between, unknown.
// Mirrors the column group used in the database (date_qualifier, date_from, date_from_precision, ...).
import { toDevanagariDigits, toLatinDigits } from '@/domain/text/normalize';

export type DateQualifier = 'exact' | 'about' | 'before' | 'after' | 'between' | 'estimated' | 'unknown';
export type DatePrecision = 'day' | 'month' | 'year';

export type PartialDate = { year: number; month?: number; day?: number };

export type FuzzyDate =
  | { qualifier: 'unknown'; text?: string }
  | { qualifier: 'exact' | 'about' | 'before' | 'after' | 'estimated'; from: PartialDate; text?: string }
  | { qualifier: 'between'; from: PartialDate; to: PartialDate; text?: string };

export const UNKNOWN_DATE: FuzzyDate = { qualifier: 'unknown' };

export function precisionOf(d: PartialDate): DatePrecision {
  return d.day != null ? 'day' : d.month != null ? 'month' : 'year';
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidPartialDate(d: PartialDate): boolean {
  if (!Number.isInteger(d.year) || d.year < 1 || d.year > 9999) return false;
  if (d.month == null) return d.day == null;
  if (!Number.isInteger(d.month) || d.month < 1 || d.month > 12) return false;
  if (d.day == null) return true;
  return Number.isInteger(d.day) && d.day >= 1 && d.day <= daysInMonth(d.year, d.month);
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** ISO date of the start of the period: 1958 -> 1958-01-01, Mar 1958 -> 1958-03-01. */
export function startIso(d: PartialDate): string {
  return `${pad(d.year, 4)}-${pad(d.month ?? 1)}-${pad(d.day ?? 1)}`;
}

/** ISO date of the end of the period: 1958 -> 1958-12-31. */
export function endIso(d: PartialDate): string {
  const month = d.month ?? 12;
  return `${pad(d.year, 4)}-${pad(month)}-${pad(d.day ?? daysInMonth(d.year, month))}`;
}

// ---------------------------------------------------------------------------
// Database mapping
// ---------------------------------------------------------------------------
export type FuzzyDateColumns = {
  date_qualifier: DateQualifier;
  date_from: string | null;
  date_from_precision: DatePrecision | null;
  date_to: string | null;
  date_to_precision: DatePrecision | null;
  date_text: string | null;
};

export function toColumns(fd: FuzzyDate): FuzzyDateColumns {
  const base = { date_text: fd.text?.trim() || null };
  switch (fd.qualifier) {
    case 'unknown':
      return { ...base, date_qualifier: 'unknown', date_from: null, date_from_precision: null, date_to: null, date_to_precision: null };
    case 'between':
      return {
        ...base,
        date_qualifier: 'between',
        date_from: startIso(fd.from),
        date_from_precision: precisionOf(fd.from),
        date_to: startIso(fd.to),
        date_to_precision: precisionOf(fd.to),
      };
    default:
      return {
        ...base,
        date_qualifier: fd.qualifier,
        date_from: startIso(fd.from),
        date_from_precision: precisionOf(fd.from),
        date_to: null,
        date_to_precision: null,
      };
  }
}

function fromIso(iso: string, precision: DatePrecision): PartialDate {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (precision === 'year') return { year: y };
  if (precision === 'month') return { year: y, month: m };
  return { year: y, month: m, day: d };
}

export function fromColumns(c: FuzzyDateColumns): FuzzyDate {
  const text = c.date_text ?? undefined;
  if (c.date_qualifier === 'unknown' || !c.date_from || !c.date_from_precision) return { qualifier: 'unknown', text };
  const from = fromIso(c.date_from, c.date_from_precision);
  if (c.date_qualifier === 'between' && c.date_to && c.date_to_precision) {
    return { qualifier: 'between', from, to: fromIso(c.date_to, c.date_to_precision), text };
  }
  return { qualifier: c.date_qualifier === 'between' ? 'exact' : c.date_qualifier, from, text };
}

// ---------------------------------------------------------------------------
// Parsing free text (English and Marathi)
// ---------------------------------------------------------------------------
const MONTHS: Record<string, number> = {};
[
  ['jan', 'january', 'जानेवारी'],
  ['feb', 'february', 'फेब्रुवारी'],
  ['mar', 'march', 'मार्च'],
  ['apr', 'april', 'एप्रिल'],
  ['may', 'मे'],
  ['jun', 'june', 'जून'],
  ['jul', 'july', 'जुलै'],
  ['aug', 'august', 'ऑगस्ट'],
  ['sep', 'sept', 'september', 'सप्टेंबर'],
  ['oct', 'october', 'ऑक्टोबर'],
  ['nov', 'november', 'नोव्हेंबर'],
  ['dec', 'december', 'डिसेंबर'],
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));

/** Parses a single (non-range) date: 1958, 1958-03, 1958-03-14, 14/03/1958, Mar 1958, 14 March 1958. */
function parsePoint(raw: string): PartialDate | null {
  const s = raw.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;
  let d: PartialDate | null = null;

  if ((m = s.match(/^(\d{3,4})$/))) d = { year: +m[1]! };
  else if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) d = { year: +m[1]!, month: +m[2]! };
  else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) d = { year: +m[1]!, month: +m[2]!, day: +m[3]! };
  // Indian convention: day first
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) d = { year: +m[3]!, month: +m[2]!, day: +m[1]! };
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) d = { year: +m[2]!, month: +m[1]! };
  else if ((m = s.match(/^(\S+) (\d{4})$/)) && MONTHS[m[1]!.toLowerCase().replace(/\.$/, '')]) {
    d = { year: +m[2]!, month: MONTHS[m[1]!.toLowerCase().replace(/\.$/, '')]! };
  } else if ((m = s.match(/^(\d{1,2}) (\S+) (\d{4})$/)) && MONTHS[m[2]!.toLowerCase().replace(/\.$/, '')]) {
    d = { year: +m[3]!, month: MONTHS[m[2]!.toLowerCase().replace(/\.$/, '')]!, day: +m[1]! };
  } else if ((m = s.match(/^(\S+) (\d{1,2}) (\d{4})$/)) && MONTHS[m[1]!.toLowerCase().replace(/\.$/, '')]) {
    d = { year: +m[3]!, month: MONTHS[m[1]!.toLowerCase().replace(/\.$/, '')]!, day: +m[2]! };
  }
  return d && isValidPartialDate(d) ? d : null;
}

const PREFIXES: [RegExp, DateQualifier][] = [
  [/^(?:c\.?|ca\.?|circa|about|abt\.?|approx\.?|around|~|सुमारे|सुमार|साधारण)\s*/i, 'about'],
  [/^(?:est\.?|estimated|अंदाजे)\s*/i, 'estimated'],
  [/^(?:before|bef\.?|<|पूर्वी)\s*/i, 'before'],
  [/^(?:after|aft\.?|>|नंतर)\s*/i, 'after'],
];
const SUFFIXES: [RegExp, DateQualifier][] = [
  [/\s*(?:पूर्वी|च्या आधी|आधी)$/, 'before'],
  [/\s*(?:नंतर|च्या नंतर)$/, 'after'],
  [/\s*(?:च्या सुमारास|सुमारास)$/, 'about'],
];

/**
 * Parses what a person types: "1958", "c. 1958", "before 1920", "1950-1955", "between 1950 and 1955",
 * "14 Mar 1958", "14/03/1958", "सुमारे १९५८", "१९२० पूर्वी". Returns null when it cannot be understood.
 * An empty string or "unknown" gives an unknown date.
 */
export function parseFuzzyDate(input: string): FuzzyDate | null {
  const text = input.trim();
  let s = toLatinDigits(text).replace(/\s+/g, ' ').trim();
  if (s === '' || /^(unknown|\?|अज्ञात|माहीत नाही)$/i.test(s)) return { qualifier: 'unknown' };

  let qualifier: DateQualifier = 'exact';
  for (const [re, q] of PREFIXES) {
    if (re.test(s)) {
      qualifier = q;
      s = s.replace(re, '');
      break;
    }
  }
  if (qualifier === 'exact') {
    for (const [re, q] of SUFFIXES) {
      if (re.test(s)) {
        qualifier = q;
        s = s.replace(re, '');
        break;
      }
    }
  }

  const range =
    s.match(/^(?:between|bet\.?)\s+(.+?)\s+(?:and|&)\s+(.+)$/i) ??
    s.match(/^(.+?)\s+(?:ते|to)\s+(.+?)(?:\s+(?:दरम्यान|च्या दरम्यान))?$/i) ??
    s.match(/^(\d{3,4})\s*[–—-]\s*(\d{3,4})$/);
  if (range && qualifier === 'exact') {
    const from = parsePoint(range[1]!);
    const to = parsePoint(range[2]!);
    if (!from || !to || startIso(from) > startIso(to)) return null;
    return { qualifier: 'between', from, to };
  }

  const from = parsePoint(s);
  return from ? { qualifier: qualifier as Exclude<DateQualifier, 'unknown' | 'between'>, from } : null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MR_MONTHS = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'];

export type FormatOptions = { digits?: 'latin' | 'devanagari' };

function formatPoint(d: PartialDate, lang: string): string {
  const months = lang === 'mr' ? MR_MONTHS : EN_MONTHS;
  const parts: string[] = [];
  if (d.day != null) parts.push(String(d.day));
  if (d.month != null) parts.push(months[d.month - 1]!);
  parts.push(String(d.year));
  return parts.join(' ');
}

/** Human-readable date. Unknown dates format as an empty string. */
export function formatFuzzyDate(fd: FuzzyDate, lang: string, opts: FormatOptions = {}): string {
  const digits = opts.digits ?? (lang === 'mr' ? 'devanagari' : 'latin');
  let out: string;
  if (fd.qualifier === 'unknown') return '';
  if (fd.qualifier === 'between') {
    out = `${formatPoint(fd.from, lang)}–${formatPoint(fd.to, lang)}`;
  } else {
    const p = formatPoint(fd.from, lang);
    if (lang === 'mr') {
      out = { exact: p, about: `सुमारे ${p}`, estimated: `अंदाजे ${p}`, before: `${p} पूर्वी`, after: `${p} नंतर` }[fd.qualifier];
    } else {
      out = { exact: p, about: `c. ${p}`, estimated: `est. ${p}`, before: `before ${p}`, after: `after ${p}` }[fd.qualifier];
    }
  }
  return digits === 'devanagari' ? toDevanagariDigits(out) : out;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
/** Years of slack for "about" / "estimated" dates when comparing. */
const APPROX_YEARS = 2;

function shiftYears(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years;
  return `${pad(Math.max(1, Math.min(9999, y)), 4)}${iso.slice(4)}`;
}

/** The period a fuzzy date could fall in, as inclusive ISO bounds; null = unbounded. */
export function dateRange(fd: FuzzyDate): { earliest: string | null; latest: string | null } | null {
  switch (fd.qualifier) {
    case 'unknown':
      return null;
    case 'exact':
      return { earliest: startIso(fd.from), latest: endIso(fd.from) };
    case 'about':
    case 'estimated':
      return { earliest: shiftYears(startIso(fd.from), -APPROX_YEARS), latest: shiftYears(endIso(fd.from), APPROX_YEARS) };
    case 'before':
      return { earliest: null, latest: startIso(fd.from) };
    case 'after':
      return { earliest: endIso(fd.from), latest: null };
    case 'between':
      return { earliest: startIso(fd.from), latest: endIso(fd.to) };
  }
}

/**
 * Definite ordering of two fuzzy dates: -1 if `a` is certainly earlier, 1 if certainly later,
 * null when unknown or the possible periods overlap.
 */
export function compareFuzzyDates(a: FuzzyDate, b: FuzzyDate): -1 | 1 | null {
  const ra = dateRange(a);
  const rb = dateRange(b);
  if (!ra || !rb) return null;
  if (ra.latest != null && rb.earliest != null && ra.latest < rb.earliest) return -1;
  if (rb.latest != null && ra.earliest != null && rb.latest < ra.earliest) return 1;
  return null;
}

/** A single date for sorting lists (start of the period), or null. */
export function sortKey(fd: FuzzyDate): string | null {
  return fd.qualifier === 'unknown' ? null : startIso(fd.from);
}

/** Year for display/matching, or null. */
export function approximateYear(fd: FuzzyDate): number | null {
  return fd.qualifier === 'unknown' ? null : fd.from.year;
}
