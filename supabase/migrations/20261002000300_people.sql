-- People, their names (one form per language) and dated facts (birth, death, occupation, residence...).

create table public.persons (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  gender         public.gender not null default 'unknown',
  is_living      boolean,                          -- null = unknown
  is_placeholder boolean not null default false,   -- "unknown parent" stand-in
  notes          jsonb check (private.is_localized_text(notes)),
  privacy        text not null default 'family' check (privacy in ('family', 'private')),
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  deleted_at     timestamptz,
  deleted_by     uuid,
  unique (family_id, id)   -- target of composite FKs: relationships cannot cross families
);

create index persons_family_idx on public.persons (family_id) where deleted_at is null;

create trigger touch before insert or update on public.persons
  for each row execute function private.touch_entity();

alter table public.families
  add constraint families_root_person_fk
  foreign key (id, root_person_id) references public.persons (family_id, id)
  on delete set null (root_person_id);

-- ---------------------------------------------------------------------------
-- Names. A person may have several (birth name, married name, alias...).
-- Each name has one form per language; names are transliterated, not translated.
-- ---------------------------------------------------------------------------
create table public.person_names (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null,
  person_id  uuid not null,
  name_type  public.name_type not null default 'primary',
  is_primary boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (family_id, id),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);

create unique index person_names_one_primary on public.person_names (person_id)
  where is_primary and deleted_at is null;
create index person_names_person_idx on public.person_names (person_id);

create trigger touch before insert or update on public.person_names
  for each row execute function private.touch_entity();

create table public.person_name_forms (
  name_id        uuid not null,
  family_id      uuid not null,
  lang           text not null references public.languages (code),
  given_name     text,
  middle_name    text,   -- Marathi convention: father's / husband's given name
  surname        text,
  full_name      text not null check (btrim(full_name) <> ''),
  source         public.text_source not null default 'manual',
  generated_from text references public.languages (code),
  provider       text,
  source_hash    text,   -- hash of the source text when auto-generated, to detect staleness
  search_key     text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  primary key (name_id, lang),
  foreign key (family_id, name_id) references public.person_names (family_id, id) on delete cascade,
  check (source = 'manual' or generated_from is not null),
  check (generated_from is null or generated_from <> lang)
);

create index person_name_forms_family_idx on public.person_name_forms (family_id);
create index person_name_forms_search_idx on public.person_name_forms
  using gin (search_key extensions.gin_trgm_ops);

create function private.person_name_forms_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    perform private.assert_identity_unchanged(
      jsonb_build_object('id', old.name_id, 'family_id', old.family_id),
      jsonb_build_object('id', new.name_id, 'family_id', new.family_id));
    if new.lang <> old.lang then
      raise exception 'lang cannot be changed' using errcode = 'P0001';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    -- Invariant I9: automatic output never replaces a manual / corrected name.
    if new.source = 'auto' and old.source in ('manual', 'corrected')
       and new.full_name is distinct from old.full_name then
      raise exception 'Refusing to overwrite manually entered name (%) with an automatic value', new.lang
        using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.search_key := private.search_key(new.full_name);
  return new;
end;
$$;

create trigger before_write before insert or update on public.person_name_forms
  for each row execute function private.person_name_forms_before_write();

-- ---------------------------------------------------------------------------
-- Person facts: birth, death, burial, occupation (many, time-bounded), residence (many), ...
-- ---------------------------------------------------------------------------
create table public.person_facts (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null,
  person_id           uuid not null,
  fact_type           public.fact_type not null,
  value               jsonb check (private.is_localized_text(value)),  -- occupation title, custom label...
  place               jsonb check (private.is_localized_text(place)),
  date_qualifier      public.date_qualifier not null default 'unknown',
  date_from           date,
  date_from_precision public.date_precision,
  date_to             date,
  date_to_precision   public.date_precision,
  date_text           text,
  end_qualifier       public.date_qualifier not null default 'unknown',
  end_from            date,
  end_from_precision  public.date_precision,
  end_to              date,
  end_to_precision    public.date_precision,
  end_text            text,
  date_sort           date generated always as (coalesce(date_from, date_to)) stored,
  notes               jsonb check (private.is_localized_text(notes)),
  sort_order          smallint not null default 0,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  deleted_by          uuid,
  unique (family_id, id),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade,
  check (private.is_valid_fuzzy_date(date_qualifier, date_from, date_from_precision, date_to, date_to_precision)),
  check (private.is_valid_fuzzy_date(end_qualifier, end_from, end_from_precision, end_to, end_to_precision)),
  -- point-in-time facts have no end date
  check (fact_type not in ('birth', 'death', 'burial') or end_qualifier = 'unknown')
);

create unique index person_facts_one_vital on public.person_facts (person_id, fact_type)
  where fact_type in ('birth', 'death', 'burial') and deleted_at is null;
create index person_facts_person_idx on public.person_facts (person_id);
create index person_facts_family_type_idx on public.person_facts (family_id, fact_type) where deleted_at is null;

create trigger touch before insert or update on public.person_facts
  for each row execute function private.touch_entity();
