-- Relationships. Only two kinds are stored:
--   * partnerships: a union with 0..2 partners (a person may be in many unions)
--   * parentage:    parent_child edges, each with its own lineage
-- Siblings, grandparents, cousins, in-laws and step-relations are DERIVED, never stored.

create table public.unions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families (id) on delete cascade,
  union_type public.union_type not null default 'marriage',
  status     public.union_status not null default 'unknown',
  sort_order smallint not null default 0,
  notes      jsonb check (private.is_localized_text(notes)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (family_id, id)
);

create index unions_family_idx on public.unions (family_id) where deleted_at is null;

create trigger touch before insert or update on public.unions
  for each row execute function private.touch_entity();

create table public.union_partners (
  union_id      uuid not null,
  person_id     uuid not null,
  family_id     uuid not null,
  partner_order smallint not null default 0,  -- drawing position (left / right)
  created_at    timestamptz not null default now(),
  created_by    uuid,
  primary key (union_id, person_id),
  foreign key (family_id, union_id)  references public.unions (family_id, id)  on delete cascade,
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);

create index union_partners_person_idx on public.union_partners (person_id);

create trigger touch before insert or update on public.union_partners
  for each row execute function private.touch_link();

create table public.union_facts (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null,
  union_id            uuid not null,
  fact_type           public.union_fact_type not null,
  value               jsonb check (private.is_localized_text(value)),
  place               jsonb check (private.is_localized_text(place)),
  date_qualifier      public.date_qualifier not null default 'unknown',
  date_from           date,
  date_from_precision public.date_precision,
  date_to             date,
  date_to_precision   public.date_precision,
  date_text           text,
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
  foreign key (family_id, union_id) references public.unions (family_id, id) on delete cascade,
  check (private.is_valid_fuzzy_date(date_qualifier, date_from, date_from_precision, date_to, date_to_precision))
);

create unique index union_facts_one_marriage_divorce on public.union_facts (union_id, fact_type)
  where fact_type in ('marriage', 'divorce') and deleted_at is null;
create index union_facts_union_idx on public.union_facts (union_id);

create trigger touch before insert or update on public.union_facts
  for each row execute function private.touch_entity();

create table public.parent_child (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null,
  parent_id           uuid not null,
  child_id            uuid not null,
  lineage             public.lineage not null default 'biological',
  union_id            uuid,       -- the family unit this child is drawn under
  child_order         smallint,   -- birth order among siblings when dates are unknown
  date_qualifier      public.date_qualifier not null default 'unknown',  -- e.g. adoption date
  date_from           date,
  date_from_precision public.date_precision,
  date_to             date,
  date_to_precision   public.date_precision,
  date_text           text,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  deleted_by          uuid,
  unique (family_id, id),
  foreign key (family_id, parent_id) references public.persons (family_id, id) on delete cascade,
  foreign key (family_id, child_id)  references public.persons (family_id, id) on delete cascade,
  foreign key (family_id, union_id)  references public.unions (family_id, id),
  check (parent_id <> child_id),                                                         -- I1
  check (private.is_valid_fuzzy_date(date_qualifier, date_from, date_from_precision, date_to, date_to_precision))
);

create unique index parent_child_unique_live on public.parent_child (parent_id, child_id)  -- I5
  where deleted_at is null;
create index parent_child_child_idx  on public.parent_child (family_id, child_id)  where deleted_at is null;
create index parent_child_parent_idx on public.parent_child (family_id, parent_id) where deleted_at is null;
create index parent_child_union_idx  on public.parent_child (union_id);

create trigger touch before insert or update on public.parent_child
  for each row execute function private.touch_entity();

-- ===========================================================================
-- Integrity triggers
-- ===========================================================================

-- Serialises relationship writes within one family so concurrent inserts cannot
-- jointly violate the cycle / parent-count / partner-count invariants.
create function private.lock_family_graph(fid uuid) returns void
language sql as $$
  select pg_advisory_xact_lock(hashtextextended('family-graph:' || fid::text, 0))
$$;

create function private.is_live_person(pid uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.persons where id = pid and deleted_at is null)
$$;

-- True when a and b are directly parent/child of each other (live edges).
create function private.are_parent_and_child(a uuid, b uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.parent_child
    where deleted_at is null
      and ((parent_id = a and child_id = b) or (parent_id = b and child_id = a))
  )
$$;

-- True when a and b are partners in a live union.
create function private.are_partners(a uuid, b uuid) returns boolean
language sql stable as $$
  select exists (
    select 1
    from public.union_partners p1
    join public.union_partners p2 on p2.union_id = p1.union_id and p2.person_id = b
    join public.unions u on u.id = p1.union_id and u.deleted_at is null
    where p1.person_id = a
  )
$$;

-- Is `ancestor` an ancestor of `person` through live parent_child edges?
create function private.is_ancestor(ancestor uuid, person uuid) returns boolean
language sql stable as $$
  with recursive up(id) as (
    select parent_id from public.parent_child where child_id = person and deleted_at is null
    union
    select pc.parent_id
    from public.parent_child pc
    join up on pc.child_id = up.id
    where pc.deleted_at is null
  )
  select exists (select 1 from up where id = ancestor)
$$;

-- --- parent_child: I2 (no cycles), I3 (<= 2 biological parents), I6 (union consistency)
create function private.check_parent_child() returns trigger
language plpgsql as $$
declare
  bio_count int;
begin
  if new.deleted_at is not null then
    return new;  -- soft-deleting an edge is always allowed
  end if;

  perform private.lock_family_graph(new.family_id);

  if tg_op = 'UPDATE' and (new.parent_id <> old.parent_id or new.child_id <> old.child_id) then
    raise exception 'parent_id and child_id cannot be changed; delete the relationship and create a new one'
      using errcode = 'P0001';
  end if;

  if not private.is_live_person(new.parent_id) or not private.is_live_person(new.child_id) then
    raise exception 'Cannot link a deleted person' using errcode = 'P0001';
  end if;

  if private.is_ancestor(new.child_id, new.parent_id) then
    raise exception 'This would make a person their own ancestor' using errcode = 'P0001';
  end if;

  if private.are_partners(new.parent_id, new.child_id) then
    raise exception 'A person cannot be both partner and parent of the same person' using errcode = 'P0001';
  end if;

  if new.lineage = 'biological' then
    select count(*) into bio_count
    from public.parent_child
    where child_id = new.child_id and lineage = 'biological' and deleted_at is null and id <> new.id;
    if bio_count >= 2 then
      raise exception 'A person cannot have more than two biological parents' using errcode = 'P0001';
    end if;
  end if;

  if new.union_id is not null and not exists (
    select 1 from public.union_partners where union_id = new.union_id and person_id = new.parent_id
  ) then
    raise exception 'The parent must be a partner of the union the child is placed under' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger check_integrity before insert or update on public.parent_child
  for each row execute function private.check_parent_child();

-- --- union_partners: I4 (<= 2 partners, no duplicate couple), no partnering with own parent/child
create function private.check_union_partner() returns trigger
language plpgsql as $$
declare
  other uuid;
begin
  perform private.lock_family_graph(new.family_id);

  if tg_op = 'UPDATE' and (new.union_id <> old.union_id or new.person_id <> old.person_id) then
    raise exception 'union_id and person_id cannot be changed' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;

  if not private.is_live_person(new.person_id) then
    raise exception 'Cannot link a deleted person' using errcode = 'P0001';
  end if;

  select person_id into other from public.union_partners
  where union_id = new.union_id and person_id <> new.person_id;

  if (select count(*) from public.union_partners where union_id = new.union_id) >= 2 then
    raise exception 'A union can have at most two partners' using errcode = 'P0001';
  end if;

  if other is not null then
    if private.are_parent_and_child(new.person_id, other) then
      raise exception 'A person cannot be partnered with their own parent or child' using errcode = 'P0001';
    end if;
    if exists (
      select 1
      from public.union_partners a
      join public.union_partners b on b.union_id = a.union_id and b.person_id = other
      join public.unions u on u.id = a.union_id and u.deleted_at is null
      where a.person_id = new.person_id and a.union_id <> new.union_id
    ) then
      raise exception 'These two people are already partners' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger check_integrity before insert or update on public.union_partners
  for each row execute function private.check_union_partner();

-- Restoring a soft-deleted union must not create a duplicate couple.
create function private.check_union_restore() returns trigger
language plpgsql as $$
begin
  if old.deleted_at is not null and new.deleted_at is null and exists (
    select 1
    from public.union_partners a
    join public.union_partners b on b.union_id = a.union_id and b.person_id <> a.person_id
    join public.union_partners a2 on a2.person_id = a.person_id and a2.union_id <> a.union_id
    join public.union_partners b2 on b2.union_id = a2.union_id and b2.person_id = b.person_id
    join public.unions u2 on u2.id = a2.union_id and u2.deleted_at is null
    where a.union_id = new.id
  ) then
    raise exception 'These two people are already partners in another union' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_restore before update on public.unions
  for each row execute function private.check_union_restore();

-- Every non-placeholder person must have a primary name by the end of the transaction.
create function private.check_person_has_primary_name() returns trigger
language plpgsql as $$
declare
  pid uuid;
begin
  if tg_table_name = 'persons' then
    pid := new.id;
  elsif tg_op = 'DELETE' then
    pid := old.person_id;
  else
    pid := new.person_id;
  end if;
  if exists (select 1 from public.persons where id = pid and not is_placeholder and deleted_at is null)
     and not exists (
       select 1 from public.person_names n
       join public.person_name_forms f on f.name_id = n.id
       where n.person_id = pid and n.is_primary and n.deleted_at is null
     ) then
    raise exception 'Every person needs a primary name in at least one language' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger require_primary_name
  after insert or update on public.persons
  deferrable initially deferred
  for each row execute function private.check_person_has_primary_name();

create constraint trigger require_primary_name
  after update or delete on public.person_names
  deferrable initially deferred
  for each row execute function private.check_person_has_primary_name();

create function private.check_name_form_owner_has_primary_name() returns trigger
language plpgsql as $$
declare
  pid uuid;
begin
  select person_id into pid from public.person_names where id = old.name_id;
  if pid is not null
     and exists (select 1 from public.persons where id = pid and not is_placeholder and deleted_at is null)
     and not exists (
       select 1 from public.person_names n
       join public.person_name_forms f on f.name_id = n.id
       where n.person_id = pid and n.is_primary and n.deleted_at is null
     ) then
    raise exception 'Every person needs a primary name in at least one language' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger require_primary_name
  after delete on public.person_name_forms
  deferrable initially deferred
  for each row execute function private.check_name_form_owner_has_primary_name();
