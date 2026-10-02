-- Server-side operations (Postgres RPCs). Multi-row writes happen here, atomically, instead of
-- as several client round-trips. All run as SECURITY INVOKER (RLS applies) except create_family,
-- which has to bootstrap the caller's owner membership.
--
-- Relationship vocabulary for add_relative / connect_existing — "other is anchor's <relation>":
--   parent, adoptive_parent, child, spouse, sibling, step_parent

-- ===========================================================================
-- Families
-- ===========================================================================
create function public.create_family(p_name jsonb, p_default_language text default 'mr')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.families (name, default_language)
  values (p_name, coalesce(p_default_language, 'mr'))
  returning id into fid;
  insert into public.family_members (family_id, user_id, role) values (fid, uid, 'owner');
  return fid;
end;
$$;

-- ===========================================================================
-- Internal helpers
-- ===========================================================================
create function private.fuzzy_date_cols(d jsonb)
returns table (q public.date_qualifier, d_from date, p_from public.date_precision,
               d_to date, p_to public.date_precision, d_text text)
language sql immutable as $$
  select coalesce((d ->> 'qualifier')::public.date_qualifier, 'unknown'),
         (d ->> 'from')::date, (d ->> 'from_precision')::public.date_precision,
         (d ->> 'to')::date,   (d ->> 'to_precision')::public.date_precision,
         nullif(d ->> 'text', '')
$$;

-- Payload:
-- { "gender": "male", "is_living": null, "is_placeholder": false, "notes": {localized},
--   "names": [ { "name_type": "primary", "is_primary": true,
--                "forms": { "en": { "given_name": "Rajiv", "surname": "Dhotar", "full_name": "Rajiv Dhotar",
--                                   "source": "manual" },
--                           "mr": { ..., "source": "auto", "generated_from": "en", "provider": "..." } } } ],
--   "facts": [ { "fact_type": "birth", "place": {localized}, "value": {localized}, "notes": {localized},
--                "date": { "qualifier": "about", "from": "1958-01-01", "from_precision": "year" },
--                "end_date": { ... } } ] }
create function private.insert_person(fid uuid, p jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  pid uuid;
  nid uuid;
  nm jsonb;
  nm_ord bigint;
  form record;
  fact jsonb;
  d record;
  e record;
begin
  insert into public.persons (family_id, gender, is_living, is_placeholder, notes)
  values (fid,
          coalesce((p ->> 'gender')::public.gender, 'unknown'),
          (p ->> 'is_living')::boolean,
          coalesce((p ->> 'is_placeholder')::boolean, false),
          p -> 'notes')
  returning id into pid;

  for nm, nm_ord in select value, ordinality from jsonb_array_elements(coalesce(p -> 'names', '[]')) with ordinality loop
    insert into public.person_names (family_id, person_id, name_type, is_primary, sort_order)
    values (fid, pid,
            coalesce((nm ->> 'name_type')::public.name_type, 'primary'),
            coalesce((nm ->> 'is_primary')::boolean, nm_ord = 1),
            nm_ord - 1)
    returning id into nid;

    for form in select key as lang, value as f from jsonb_each(coalesce(nm -> 'forms', '{}')) loop
      continue when nullif(btrim(form.f ->> 'full_name'), '') is null;
      insert into public.person_name_forms
        (name_id, family_id, lang, given_name, middle_name, surname, full_name,
         source, generated_from, provider, source_hash)
      values (nid, fid, form.lang,
              nullif(btrim(form.f ->> 'given_name'), ''),
              nullif(btrim(form.f ->> 'middle_name'), ''),
              nullif(btrim(form.f ->> 'surname'), ''),
              btrim(form.f ->> 'full_name'),
              coalesce((form.f ->> 'source')::public.text_source, 'manual'),
              form.f ->> 'generated_from',
              form.f ->> 'provider',
              form.f ->> 'source_hash');
    end loop;
  end loop;

  for fact in select value from jsonb_array_elements(coalesce(p -> 'facts', '[]')) loop
    select * into d from private.fuzzy_date_cols(fact -> 'date');
    select * into e from private.fuzzy_date_cols(fact -> 'end_date');
    insert into public.person_facts
      (family_id, person_id, fact_type, value, place, notes,
       date_qualifier, date_from, date_from_precision, date_to, date_to_precision, date_text,
       end_qualifier, end_from, end_from_precision, end_to, end_to_precision, end_text)
    values (fid, pid, (fact ->> 'fact_type')::public.fact_type, fact -> 'value', fact -> 'place', fact -> 'notes',
            d.q, d.d_from, d.p_from, d.d_to, d.p_to, d.d_text,
            e.q, e.d_from, e.p_from, e.d_to, e.p_to, e.d_text);
  end loop;

  return pid;
end;
$$;

-- Live person in a family visible to the caller, or an error.
create function private.person_family(pid uuid) returns uuid
language plpgsql stable set search_path = '' as $$
declare
  fid uuid;
begin
  select family_id into fid from public.persons where id = pid and deleted_at is null;
  if fid is null then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  return fid;
end;
$$;

create function private.union_partner_ids(uid uuid) returns uuid[]
language sql stable set search_path = '' as $$
  select coalesce(array_agg(person_id order by partner_order, created_at), '{}')
  from public.union_partners where union_id = uid
$$;

create function private.add_union_partner(fid uuid, uid uuid, pid uuid) returns void
language sql set search_path = '' as $$
  insert into public.union_partners (union_id, person_id, family_id, partner_order)
  values (uid, pid, fid, (select count(*) from public.union_partners where union_id = uid))
$$;

-- Live union whose partners are exactly {a} (b null) or {a, b}; created if missing.
create function private.find_or_create_union(fid uuid, a uuid, b uuid, kind public.union_type default null)
returns uuid
language plpgsql set search_path = '' as $$
declare
  uid uuid;
begin
  select u.id into uid
  from public.unions u
  where u.family_id = fid and u.deleted_at is null
    and private.union_partner_ids(u.id) @> case when b is null then array[a] else array[a, b] end
    and cardinality(private.union_partner_ids(u.id)) = case when b is null then 1 else 2 end
  order by u.created_at
  limit 1;

  if uid is null then
    insert into public.unions (family_id, union_type)
    values (fid, coalesce(kind, (case when b is null then 'unknown' else 'marriage' end)::public.union_type))
    returning id into uid;
    perform private.add_union_partner(fid, uid, a);
    if b is not null then
      perform private.add_union_partner(fid, uid, b);
    end if;
  end if;
  return uid;
end;
$$;

create function private.insert_edge(fid uuid, parent uuid, child uuid, lin public.lineage, uid uuid)
returns uuid
language plpgsql set search_path = '' as $$
declare
  eid uuid;
begin
  if exists (select 1 from public.parent_child
             where parent_id = parent and child_id = child and deleted_at is null) then
    raise exception 'This parent-child relationship already exists' using errcode = 'P0001';
  end if;
  insert into public.parent_child (family_id, parent_id, child_id, lineage, union_id)
  values (fid, parent, child, lin, uid)
  returning id into eid;
  return eid;
end;
$$;

-- Live union the caller can see, belonging to fid.
create function private.require_union(fid uuid, uid uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.unions where id = uid and family_id = fid and deleted_at is null) then
    raise exception 'Union not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ===========================================================================
-- The relationship linker: makes `other` the anchor's <relation>.
-- Returns { "union_id": ..., "edge_ids": [...], "placeholder_id": ... }
-- ===========================================================================
create function private.link_relative(anchor uuid, other uuid, relation text, opts jsonb)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  fid uuid := private.person_family(anchor);
  lin public.lineage := coalesce((opts ->> 'lineage')::public.lineage, 'biological');
  u uuid := (opts ->> 'union_id')::uuid;
  edges uuid[] := '{}';
  placeholder uuid;
  q uuid;
  q_union uuid;
  joined boolean := false;
  partner uuid;
  parent_ids uuid[];
  rec record;
begin
  perform private.require_family_role(fid, 'editor');
  if private.person_family(other) <> fid then
    raise exception 'People belong to different families' using errcode = 'P0001';
  end if;
  if anchor = other then
    raise exception 'A person cannot be related to themselves' using errcode = 'P0001';
  end if;
  perform private.lock_family_graph(fid);

  if relation = 'adoptive_parent' then
    relation := 'parent';
    lin := 'adoptive';
  end if;

  case relation
  -- -------------------------------------------------------------------------
  when 'parent' then
    if u is not null then
      perform private.require_union(fid, u);
      if not (other = any (private.union_partner_ids(u))) then
        perform private.add_union_partner(fid, u, other);
        joined := true;
      end if;
    else
      -- existing parents of the same kind (biological with biological, adoptive with adoptive, ...)
      select array_agg(parent_id) into parent_ids
      from public.parent_child
      where child_id = anchor and lineage = lin and deleted_at is null;

      if parent_ids is null then
        u := private.find_or_create_union(fid, other, null);
      elsif cardinality(parent_ids) = 1 then
        q := parent_ids[1];
        select union_id into q_union from public.parent_child
        where parent_id = q and child_id = anchor and deleted_at is null;

        if q_union is not null and cardinality(private.union_partner_ids(q_union)) = 1
           and (coalesce((opts ->> 'apply_to_siblings')::boolean, true)
                or not exists (select 1 from public.parent_child
                               where union_id = q_union and child_id <> anchor and deleted_at is null)) then
          u := q_union;
          perform private.add_union_partner(fid, u, other);
          joined := true;
        else
          u := private.find_or_create_union(fid, q, other);
          update public.parent_child set union_id = u
          where parent_id = q and child_id = anchor and deleted_at is null;
        end if;
      else
        raise exception 'This person already has two % parents', lin using errcode = 'P0001';
      end if;
    end if;

    edges := edges || private.insert_edge(fid, other, anchor, lin, u);

    -- The new partner of an existing family unit also becomes parent of its other children.
    if joined and coalesce((opts ->> 'apply_to_siblings')::boolean, true) then
      for rec in
        select distinct child_id, lineage from public.parent_child
        where union_id = u and child_id not in (anchor, other) and deleted_at is null
          and not exists (select 1 from public.parent_child x
                          where x.parent_id = other and x.child_id = parent_child.child_id and x.deleted_at is null)
      loop
        edges := edges || private.insert_edge(fid, other, rec.child_id, rec.lineage, u);
      end loop;
    end if;

  -- -------------------------------------------------------------------------
  when 'child' then
    if u is not null then
      perform private.require_union(fid, u);
      if not (anchor = any (private.union_partner_ids(u))) then
        raise exception 'The person must be a partner of the chosen union' using errcode = 'P0001';
      end if;
    elsif opts ? 'other_parent_id' and (opts ->> 'other_parent_id') is not null then
      if private.person_family((opts ->> 'other_parent_id')::uuid) <> fid then
        raise exception 'People belong to different families' using errcode = 'P0001';
      end if;
      u := private.find_or_create_union(fid, anchor, (opts ->> 'other_parent_id')::uuid);
    else
      u := private.find_or_create_union(fid, anchor, null);
    end if;

    foreach partner in array private.union_partner_ids(u) loop
      edges := edges || private.insert_edge(
        fid, partner, other,
        case when partner = anchor then lin
             else coalesce((opts ->> 'other_parent_lineage')::public.lineage, lin) end,
        u);
    end loop;

  -- -------------------------------------------------------------------------
  when 'spouse' then
    if private.are_partners(anchor, other) then
      raise exception 'These two people are already partners' using errcode = 'P0001';
    end if;
    if u is not null then
      -- join an existing single-partner family unit of the anchor (e.g. adding the other parent)
      perform private.require_union(fid, u);
      if private.union_partner_ids(u) <> array[anchor] then
        raise exception 'Only a union with the person as its sole partner can be joined' using errcode = 'P0001';
      end if;
      perform private.add_union_partner(fid, u, other);
      if (opts ->> 'children_lineage') is not null then
        for rec in
          select distinct child_id from public.parent_child
          where union_id = u and parent_id = anchor and deleted_at is null and child_id <> other
        loop
          edges := edges || private.insert_edge(fid, other, rec.child_id,
                                                (opts ->> 'children_lineage')::public.lineage, u);
        end loop;
      end if;
    else
      insert into public.unions (family_id, union_type, status)
      values (fid,
              coalesce((opts ->> 'union_type')::public.union_type, 'marriage'),
              coalesce((opts ->> 'status')::public.union_status, 'unknown'))
      returning id into u;
      perform private.add_union_partner(fid, u, anchor);
      perform private.add_union_partner(fid, u, other);
    end if;

  -- -------------------------------------------------------------------------
  when 'sibling' then
    if u is not null then
      perform private.require_union(fid, u);
    else
      if opts ? 'parent_ids' then
        select array_agg(value::uuid) into parent_ids from jsonb_array_elements_text(opts -> 'parent_ids');
        if exists (select 1 from unnest(parent_ids) p
                   where not exists (select 1 from public.parent_child
                                     where parent_id = p and child_id = anchor and deleted_at is null)) then
          raise exception 'Shared parents must be parents of the person' using errcode = 'P0001';
        end if;
      else
        select array_agg(parent_id order by created_at) into parent_ids
        from public.parent_child
        where child_id = anchor and lineage = 'biological' and deleted_at is null;
      end if;

      if parent_ids is null or cardinality(parent_ids) = 0 then
        -- Siblings are linked through parents: create an "unknown parent" placeholder.
        placeholder := private.insert_person(fid, jsonb_build_object('is_placeholder', true));
        u := private.find_or_create_union(fid, placeholder, null);
        edges := edges || private.insert_edge(fid, placeholder, anchor, 'biological', u);
      elsif cardinality(parent_ids) > 2 then
        raise exception 'At most two shared parents can be given' using errcode = 'P0001';
      else
        u := private.find_or_create_union(fid, parent_ids[1], parent_ids[2]);
        -- place the anchor under the same family unit when it had none
        update public.parent_child set union_id = u
        where child_id = anchor and parent_id = any (parent_ids) and union_id is null and deleted_at is null;
      end if;
    end if;

    foreach partner in array private.union_partner_ids(u) loop
      edges := edges || private.insert_edge(fid, partner, other, lin, u);
    end loop;

  -- -------------------------------------------------------------------------
  when 'step_parent' then
    q := (opts ->> 'via_parent_id')::uuid;
    if q is null or not exists (select 1 from public.parent_child
                                where parent_id = q and child_id = anchor and deleted_at is null) then
      raise exception 'Choose which parent the step-parent is partnered with' using errcode = 'P0001';
    end if;
    if private.is_ancestor(other, anchor) or exists (select 1 from public.parent_child
                                                      where parent_id = other and child_id = anchor and deleted_at is null) then
      raise exception 'This person is already a parent or ancestor' using errcode = 'P0001';
    end if;
    u := private.find_or_create_union(fid, q, other, 'marriage');
    if coalesce((opts ->> 'assert_edge')::boolean, false) then
      edges := edges || private.insert_edge(fid, other, anchor, 'step', u);
    end if;

  else
    raise exception 'Unknown relation "%"', relation using errcode = '22023';
  end case;

  return jsonb_build_object('union_id', u, 'edge_ids', to_jsonb(edges), 'placeholder_id', placeholder);
end;
$$;

-- ===========================================================================
-- Public API
-- ===========================================================================

-- Add a person with no relationships (e.g. the first person in a family).
create function public.create_person(p_family_id uuid, p_person jsonb)
returns uuid
language plpgsql set search_path = '' as $$
begin
  perform private.require_family_role(p_family_id, 'editor');
  return private.insert_person(p_family_id, p_person);
end;
$$;

-- Create a new person as the anchor's <relation>, in one transaction.
create function public.add_relative(p_anchor_id uuid, p_relation text, p_person jsonb, p_options jsonb default '{}')
returns jsonb
language plpgsql set search_path = '' as $$
declare
  fid uuid := private.person_family(p_anchor_id);
  pid uuid;
begin
  perform private.require_family_role(fid, 'editor');
  pid := private.insert_person(fid, p_person);
  return jsonb_build_object('person_id', pid)
         || private.link_relative(p_anchor_id, pid, p_relation, coalesce(p_options, '{}'));
end;
$$;

-- Link two existing people. Never creates a person (except an "unknown parent" placeholder for siblings).
create function public.connect_existing(p_anchor_id uuid, p_other_id uuid, p_relation text, p_options jsonb default '{}')
returns jsonb
language plpgsql set search_path = '' as $$
begin
  return jsonb_build_object('person_id', p_other_id)
         || private.link_relative(p_anchor_id, p_other_id, p_relation, coalesce(p_options, '{}'));
end;
$$;

-- What a soft delete would affect, for the confirmation dialog.
create function public.person_delete_impact(p_person_id uuid)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'parents',  (select count(*) from public.parent_child pc join public.persons p on p.id = pc.parent_id
                 where pc.child_id = p_person_id and pc.deleted_at is null and p.deleted_at is null),
    'children', (select count(*) from public.parent_child pc join public.persons p on p.id = pc.child_id
                 where pc.parent_id = p_person_id and pc.deleted_at is null and p.deleted_at is null),
    'partners', (select count(distinct o.person_id)
                 from public.union_partners me
                 join public.unions u on u.id = me.union_id and u.deleted_at is null
                 join public.union_partners o on o.union_id = me.union_id and o.person_id <> me.person_id
                 join public.persons p on p.id = o.person_id and p.deleted_at is null
                 where me.person_id = p_person_id),
    'media',    (select count(*) from public.media_links l join public.media m on m.id = l.media_id
                 where l.person_id = p_person_id and m.deleted_at is null)
  )
$$;

-- Soft delete: only the person row is marked. Relationships stay recorded (hidden in the UI
-- because an endpoint is deleted), so restore_person brings everything back exactly.
create function public.soft_delete_person(p_person_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  fid uuid := private.person_family(p_person_id);
begin
  perform private.require_family_role(fid, 'editor');
  update public.persons set deleted_at = now() where id = p_person_id;
end;
$$;

create function public.restore_person(p_person_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  fid uuid;
begin
  select family_id into fid from public.persons where id = p_person_id and deleted_at is not null;
  if fid is null then
    raise exception 'Deleted person not found' using errcode = 'P0002';
  end if;
  perform private.require_family_role(fid, 'editor');
  update public.persons set deleted_at = null where id = p_person_id;
end;
$$;

-- Only signed-in users may call the API functions; internal helpers are never exposed.
do $$
declare
  f text;
begin
  foreach f in array array[
    'create_family(jsonb, text)',
    'create_person(uuid, jsonb)',
    'add_relative(uuid, text, jsonb, jsonb)',
    'connect_existing(uuid, uuid, text, jsonb)',
    'person_delete_impact(uuid)',
    'soft_delete_person(uuid)',
    'restore_person(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Internal helpers are called from invoker RPCs, triggers and policies, so `authenticated` needs
-- execute on them. The `private` schema is not exposed through the Data API, so they cannot be
-- called directly by clients.
grant execute on all functions in schema private to authenticated;
