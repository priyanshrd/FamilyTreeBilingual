// Hand-written row types for the tables the app reads. Can be replaced with generated types
// (`pnpm db:types`) once the CLI can reach the project.
import type { DatePrecision, DateQualifier } from '@/domain/dates/fuzzyDate';
import type { Gender, Lineage } from '@/domain/genealogy/graph';
import type { LocalizedText, TextSource } from '@/domain/localized/localized';

export type FamilyRow = {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  default_language: string;
  root_person_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PersonRow = {
  id: string;
  family_id: string;
  gender: Gender;
  is_living: boolean | null;
  is_placeholder: boolean;
  notes: LocalizedText | null;
  updated_at: string;
};

export type PersonNameRow = {
  id: string;
  person_id: string;
  name_type: 'primary' | 'birth' | 'married' | 'alias' | 'nickname';
  is_primary: boolean;
  sort_order: number;
};

export type NameFormRow = {
  name_id: string;
  lang: string;
  given_name: string | null;
  middle_name: string | null;
  surname: string | null;
  full_name: string;
  source: TextSource;
  generated_from: string | null;
};

type DateCols<P extends string> = {
  [K in `${P}_qualifier`]: DateQualifier;
} & {
  [K in `${P}_from` | `${P}_to`]: string | null;
} & {
  [K in `${P}_from_precision` | `${P}_to_precision`]: DatePrecision | null;
} & {
  [K in `${P}_text`]: string | null;
};

export type PersonFactRow = {
  id: string;
  person_id: string;
  fact_type: 'birth' | 'death' | 'burial' | 'occupation' | 'residence' | 'education' | 'religion' | 'custom';
  value: LocalizedText | null;
  place: LocalizedText | null;
  notes: LocalizedText | null;
  sort_order: number;
} & DateCols<'date'> & {
  end_qualifier: DateQualifier;
  end_from: string | null;
  end_from_precision: DatePrecision | null;
  end_to: string | null;
  end_to_precision: DatePrecision | null;
  end_text: string | null;
};

export type UnionRow = {
  id: string;
  union_type: 'marriage' | 'partnership' | 'unknown';
  status: 'ongoing' | 'divorced' | 'separated' | 'widowed' | 'annulled' | 'unknown';
  sort_order: number;
};

export type UnionPartnerRow = { union_id: string; person_id: string; partner_order: number };

export type ParentChildRow = {
  id: string;
  parent_id: string;
  child_id: string;
  lineage: Lineage;
  union_id: string | null;
  child_order: number | null;
};

export type FamilyRows = {
  persons: PersonRow[];
  names: PersonNameRow[];
  nameForms: NameFormRow[];
  facts: PersonFactRow[];
  unions: UnionRow[];
  partners: UnionPartnerRow[];
  parentChild: ParentChildRow[];
};
