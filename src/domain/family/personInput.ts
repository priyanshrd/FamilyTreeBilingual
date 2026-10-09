// What a person types in the person form, and how it maps to database rows.
// Every free-text field is bilingual ({ en, mr }); only the name is required.
import { parseFuzzyDate, toColumns, type FuzzyDate } from '@/domain/dates/fuzzyDate';
import type { Gender } from '@/domain/genealogy/graph';
import { setManual, type LocalizedText } from '@/domain/localized/localized';

export type Bi = { en: string; mr: string };
export const EMPTY_BI: Bi = { en: '', mr: '' };

/** Simple facts shown as one bilingual field each. `in` = which column holds the text. */
export const SIMPLE_FACTS = [
  { field: 'nativePlace', type: 'native_place', in: 'place' },
  { field: 'residence', type: 'residence', in: 'place' },
  { field: 'occupation', type: 'occupation', in: 'value' },
  { field: 'education', type: 'education', in: 'value' },
  { field: 'gotra', type: 'gotra', in: 'value' },
  { field: 'kuldaivat', type: 'kuldaivat', in: 'value' },
] as const;

export type SimpleFactField = (typeof SIMPLE_FACTS)[number]['field'];
export type FactType = (typeof SIMPLE_FACTS)[number]['type'] | 'birth' | 'death';

export type PersonInput = {
  name: Bi;
  nickname: Bi;
  maidenName: Bi;
  gender: Gender;
  isLiving: boolean | null;
  /** free text, e.g. "1958", "c. 1958", "१९५८" */
  birth: string;
  birthPlace: Bi;
  death: string;
  deathPlace: Bi;
  notes: Bi;
} & Record<SimpleFactField, Bi>;

export const EMPTY_PERSON: PersonInput = {
  name: EMPTY_BI,
  nickname: EMPTY_BI,
  maidenName: EMPTY_BI,
  gender: 'unknown',
  isLiving: null,
  birth: '',
  birthPlace: EMPTY_BI,
  death: '',
  deathPlace: EMPTY_BI,
  notes: EMPTY_BI,
  nativePlace: EMPTY_BI,
  residence: EMPTY_BI,
  occupation: EMPTY_BI,
  education: EMPTY_BI,
  gotra: EMPTY_BI,
  kuldaivat: EMPTY_BI,
};

export const isBlank = (b: Bi) => !b.en.trim() && !b.mr.trim();

/** Bilingual text → localized jsonb, keeping auto/corrected bookkeeping of the previous value. */
export function toLocalized(b: Bi, prev: LocalizedText | null = null): LocalizedText | null {
  const lt = setManual(setManual(prev, 'en', b.en), 'mr', b.mr);
  return Object.keys(lt).length ? lt : null;
}

export function fromLocalized(lt: LocalizedText | null | undefined): Bi {
  return { en: lt?.en?.v ?? '', mr: lt?.mr?.v ?? '' };
}

/** Splits "Rajiv Shankar Dhotar" into given / middle / surname. One word = given name only. */
export function splitName(full: string): { given_name: string | null; middle_name: string | null; surname: string | null; full_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const full_name = parts.join(' ');
  if (parts.length <= 1) return { given_name: parts[0] ?? null, middle_name: null, surname: null, full_name };
  return {
    given_name: parts[0]!,
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(' ') : null,
    surname: parts[parts.length - 1]!,
    full_name,
  };
}

export type InputErrors = Partial<Record<'name' | 'birth' | 'death', 'required' | 'invalid'>>;

export function validatePersonInput(input: PersonInput): InputErrors {
  const errors: InputErrors = {};
  if (isBlank(input.name)) errors.name = 'required';
  if (input.birth.trim() && !parseFuzzyDate(input.birth)) errors.birth = 'invalid';
  if (input.death.trim() && !parseFuzzyDate(input.death)) errors.death = 'invalid';
  return errors;
}

export function parsedDate(text: string): FuzzyDate {
  return parseFuzzyDate(text) ?? { qualifier: 'unknown' };
}

/** Recorded as dead if a death date or place is given, or the form says so. */
export function effectiveLiving(input: PersonInput): boolean | null {
  if (parsedDate(input.death).qualifier !== 'unknown' || !isBlank(input.deathPlace)) return false;
  return input.isLiving;
}

export function dateJson(fd: FuzzyDate) {
  const c = toColumns(fd);
  return { qualifier: c.date_qualifier, from: c.date_from, from_precision: c.date_from_precision, to: c.date_to, to_precision: c.date_to_precision, text: c.date_text };
}

function formsOf(b: Bi) {
  const forms: Record<string, unknown> = {};
  if (b.en.trim()) forms.en = { ...splitName(b.en), source: 'manual' };
  if (b.mr.trim()) forms.mr = { ...splitName(b.mr), source: 'manual' };
  return forms;
}

/** Drops null/undefined keys: the RPC reads JSON null as a value, which the DB checks reject. */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as T;
}

/** Payload for the create_person / add_relative RPCs. */
export function toPersonPayload(input: PersonInput) {
  const names: unknown[] = [{ name_type: 'primary', is_primary: true, forms: formsOf(input.name) }];
  if (!isBlank(input.nickname)) names.push({ name_type: 'alias', is_primary: false, forms: formsOf(input.nickname) });
  if (!isBlank(input.maidenName)) names.push({ name_type: 'birth', is_primary: false, forms: formsOf(input.maidenName) });

  const facts: unknown[] = [];
  const birth = parsedDate(input.birth);
  const death = parsedDate(input.death);
  if (birth.qualifier !== 'unknown' || !isBlank(input.birthPlace)) {
    facts.push(compact({ fact_type: 'birth', date: dateJson(birth), place: toLocalized(input.birthPlace) }));
  }
  if (input.isLiving !== true && (death.qualifier !== 'unknown' || !isBlank(input.deathPlace))) {
    facts.push(compact({ fact_type: 'death', date: dateJson(death), place: toLocalized(input.deathPlace) }));
  }
  for (const f of SIMPLE_FACTS) {
    if (isBlank(input[f.field])) continue;
    facts.push({ fact_type: f.type, [f.in]: toLocalized(input[f.field]) });
  }

  return compact({
    gender: input.gender,
    is_living: effectiveLiving(input),
    notes: toLocalized(input.notes),
    names,
    facts,
  });
}
