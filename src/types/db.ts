// Hand-written row types for the tables used so far. Replace with generated types
// (`pnpm db:types`) once the schema is applied to the hosted project.
import type { LocalizedText } from '@/domain/localized/localized';

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
