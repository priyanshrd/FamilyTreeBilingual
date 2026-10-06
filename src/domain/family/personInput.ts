// Turns what a person typed into the payload the database RPCs expect.
import { parseFuzzyDate, toColumns, type FuzzyDate } from '@/domain/dates/fuzzyDate';
import type { Gender } from '@/domain/genealogy/graph';

export type PersonInput = {
  nameEn: string;
  nameMr: string;
  gender: Gender;
  /** free text, e.g. "1958", "c. 1958", "१९५८" */
  birth: string;
  death: string;
  isLiving: boolean | null;
};

export const EMPTY_PERSON: PersonInput = { nameEn: '', nameMr: '', gender: 'unknown', birth: '', death: '', isLiving: null };

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
  if (!input.nameEn.trim() && !input.nameMr.trim()) errors.name = 'required';
  if (input.birth.trim() && !parseFuzzyDate(input.birth)) errors.birth = 'invalid';
  if (input.death.trim() && !parseFuzzyDate(input.death)) errors.death = 'invalid';
  return errors;
}

export function parsedDate(text: string): FuzzyDate {
  return parseFuzzyDate(text) ?? { qualifier: 'unknown' };
}

function dateJson(fd: FuzzyDate) {
  const c = toColumns(fd);
  return {
    qualifier: c.date_qualifier,
    from: c.date_from,
    from_precision: c.date_from_precision,
    to: c.date_to,
    to_precision: c.date_to_precision,
    text: c.date_text,
  };
}

/** Payload for create_person / add_relative. */
export function toPersonPayload(input: PersonInput) {
  const forms: Record<string, unknown> = {};
  if (input.nameEn.trim()) forms.en = { ...splitName(input.nameEn), source: 'manual' };
  if (input.nameMr.trim()) forms.mr = { ...splitName(input.nameMr), source: 'manual' };
  const facts: unknown[] = [];
  const birth = parsedDate(input.birth);
  const death = parsedDate(input.death);
  if (birth.qualifier !== 'unknown') facts.push({ fact_type: 'birth', date: dateJson(birth) });
  if (death.qualifier !== 'unknown') facts.push({ fact_type: 'death', date: dateJson(death) });
  return {
    gender: input.gender,
    is_living: death.qualifier !== 'unknown' ? false : input.isLiving,
    names: [{ name_type: 'primary', is_primary: true, forms }],
    facts,
  };
}
