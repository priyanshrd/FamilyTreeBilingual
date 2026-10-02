-- Editable relationship dictionary.
-- Built-in default terms ship with the app (src/domain/kinship/terms). This table holds each
-- family's overrides and additions, edited from the "Relationship dictionary" page.
-- Lookup order in the app: family override -> built-in default -> composed description.
--
-- term_key is a kinship path, e.g. 'M.B' (mother's brother), 'F.eB' (father's elder brother).
-- The app also derives a readable English identifier for each path (e.g. 'maternal_uncle');
-- English display labels are ordinary rows with lang = 'en' and can be customised too.

create table public.kinship_terms (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  term_key    text not null check (term_key ~ '^[A-Za-z]+(\.[A-Za-z]+)*$' and length(term_key) <= 64),
  lang        text not null references public.languages (code),
  label       text not null check (btrim(label) <> '' and length(label) <= 120),
  notes       text check (length(notes) <= 1000),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  deleted_by  uuid,
  unique (family_id, id)
);

create unique index kinship_terms_unique_live on public.kinship_terms (family_id, term_key, lang)
  where deleted_at is null;

create trigger touch before insert or update on public.kinship_terms
  for each row execute function private.touch_entity();
