-- Foundation: extensions, private helper schema, enums, languages, shared validation helpers.

create extension if not exists pg_trgm with schema extensions;

-- Helpers that must never be exposed through the Data API live in `private`.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.family_role     as enum ('owner', 'editor', 'viewer');
create type public.gender          as enum ('male', 'female', 'other', 'unknown');
create type public.text_source     as enum ('manual', 'auto', 'corrected');
create type public.date_qualifier  as enum ('exact', 'about', 'before', 'after', 'between', 'estimated', 'unknown');
create type public.date_precision  as enum ('day', 'month', 'year');
create type public.lineage         as enum ('biological', 'adoptive', 'step', 'foster', 'guardian', 'unknown');
create type public.union_type      as enum ('marriage', 'partnership', 'unknown');
create type public.union_status    as enum ('ongoing', 'divorced', 'separated', 'widowed', 'annulled', 'unknown');
create type public.name_type       as enum ('primary', 'birth', 'married', 'alias', 'nickname');
create type public.fact_type       as enum ('birth', 'death', 'burial', 'occupation', 'residence', 'education', 'religion', 'custom');
create type public.union_fact_type as enum ('engagement', 'marriage', 'divorce', 'separation', 'custom');
create type public.media_kind      as enum ('photo', 'document');

-- ---------------------------------------------------------------------------
-- Languages (reference data). Adding Hindi, Gujarati, ... is an insert, not a migration.
-- ---------------------------------------------------------------------------
create table public.languages (
  code        text primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  name        text not null,
  native_name text not null,
  script      text not null check (script ~ '^[A-Z][a-z]{3}$'), -- ISO 15924
  enabled     boolean not null default true,
  sort_order  smallint not null default 0
);

insert into public.languages (code, name, native_name, script, sort_order) values
  ('en', 'English', 'English', 'Latn', 1),
  ('mr', 'Marathi', 'मराठी',   'Deva', 2);

-- ---------------------------------------------------------------------------
-- Fuzzy genealogy dates.
-- Each dated record stores: qualifier, from (+precision), to (+precision), free text.
-- A year-only date 1958 is stored as from = 1958-01-01, precision = 'year'.
-- ---------------------------------------------------------------------------
create function private.is_valid_fuzzy_date(
  q public.date_qualifier,
  d_from date, p_from public.date_precision,
  d_to date,   p_to public.date_precision
) returns boolean
language sql immutable as $$
  select
    -- precision present exactly when the date is present
    (d_from is null) = (p_from is null)
    and (d_to is null) = (p_to is null)
    -- dates are normalised to the start of their precision period
    and (d_from is null or p_from = 'day'
         or (p_from = 'month' and extract(day from d_from) = 1)
         or (p_from = 'year'  and extract(day from d_from) = 1 and extract(month from d_from) = 1))
    and (d_to is null or p_to = 'day'
         or (p_to = 'month' and extract(day from d_to) = 1)
         or (p_to = 'year'  and extract(day from d_to) = 1 and extract(month from d_to) = 1))
    and case q
      when 'unknown' then d_from is null and d_to is null
      when 'between' then d_from is not null and d_to is not null and d_from <= d_to
      else d_from is not null and d_to is null
    end
$$;

-- ---------------------------------------------------------------------------
-- Localized text values (jsonb), e.g.
--   {"en": {"v": "Engineer", "src": "manual"},
--    "mr": {"v": "अभियंता", "src": "auto", "from": "en", "provider": "...", "at": "...", "src_hash": "..."}}
-- ---------------------------------------------------------------------------
create function private.is_localized_text(val jsonb) returns boolean
language sql immutable as $$
  select val is null or (
    jsonb_typeof(val) = 'object'
    and not exists (
      select 1
      from jsonb_each(val) as e(lang, entry)
      where not (
        e.lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
        and jsonb_typeof(e.entry) = 'object'
        and jsonb_typeof(e.entry -> 'v') = 'string'
        and (e.entry ->> 'src') in ('manual', 'auto', 'corrected')
      )
    )
  )
$$;

-- Raises if an automatic value would replace a manually entered / corrected one (invariant I9).
create function private.assert_no_auto_overwrite(old_val jsonb, new_val jsonb, label text)
returns void
language plpgsql immutable as $$
declare
  lang text;
begin
  if jsonb_typeof(old_val) is distinct from 'object' or jsonb_typeof(new_val) is distinct from 'object' then
    return;
  end if;
  for lang in select jsonb_object_keys(new_val) loop
    if (new_val -> lang ->> 'src') = 'auto'
       and (old_val -> lang ->> 'src') in ('manual', 'corrected')
       and (new_val -> lang ->> 'v') is distinct from (old_val -> lang ->> 'v') then
      raise exception 'Refusing to overwrite manually entered % (%) with an automatic value', label, lang
        using errcode = 'P0001', hint = 'Edit the value manually, or clear it first.';
    end if;
  end loop;
end;
$$;

-- Normalised search key: lower-case, Latin diacritics and Devanagari nukta removed, whitespace collapsed.
create function private.search_key(val text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(lower(normalize(coalesce(val, ''), NFKD)), '[̀-़ͯ]', '', 'g'),
    '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Row bookkeeping triggers.
-- touch_entity: tables with created_*/updated_*/deleted_* columns.
-- touch_link:   link tables with created_* only.
-- Both make id and family_id immutable so a row can never move between families.
-- ---------------------------------------------------------------------------
create function private.assert_identity_unchanged(old_row jsonb, new_row jsonb) returns void
language plpgsql immutable as $$
begin
  if (new_row -> 'id') is distinct from (old_row -> 'id')
     or (new_row -> 'family_id') is distinct from (old_row -> 'family_id') then
    raise exception 'id and family_id cannot be changed' using errcode = 'P0001';
  end if;
end;
$$;

create function private.touch_entity() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := new.created_at;
    new.updated_by := new.created_by;
    if new.deleted_at is not null then
      new.deleted_by := auth.uid();
    end if;
    return new;
  end if;

  perform private.assert_identity_unchanged(to_jsonb(old), to_jsonb(new));
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_by := auth.uid();
  elsif new.deleted_at is null then
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

create function private.touch_link() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    return new;
  end if;
  perform private.assert_identity_unchanged(to_jsonb(old), to_jsonb(new));
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  return new;
end;
$$;
