-- Connecting a mother or father to children the other parent already has.
--
-- Reported: children were added to the father with "other parent not known" (a one-parent family
-- unit), and the mother was added as his wife (a second unit). Connecting her to a child then failed
-- with "This parent-child relationship already exists", because the father's link was inserted again.
-- Now an existing link of the other parent is moved into the couple's unit (and an emptied one-parent
-- unit is retired); adding a parent to a child whose single parent is already their partner moves
-- the child (and, by default, the brothers and sisters) into the couple's unit.

create function private.retire_union_if_empty(uid uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.parent_child where union_id = uid and deleted_at is null)
     and cardinality(private.union_partner_ids(uid)) < 2 then
    update public.unions set deleted_at = now() where id = uid and deleted_at is null;
  end if;
end;
$$;

create or replace function private.link_relative(anchor uuid, other uuid, relation text, opts jsonb)
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
           and private.are_partners(q, other) then
          -- already a couple in another family unit (e.g. married after the children were added
          -- with "other parent not known"): the children move into the couple's unit
          u := private.find_or_create_union(fid, q, other);
          if coalesce((opts ->> 'apply_to_siblings')::boolean, true) then
            for rec in
              select child_id, lineage from public.parent_child
              where union_id = q_union and parent_id = q and child_id <> anchor and deleted_at is null
            loop
              update public.parent_child set union_id = u where union_id = q_union and parent_id = q and child_id = rec.child_id and deleted_at is null;
              if not exists (select 1 from public.parent_child x where x.parent_id = other and x.child_id = rec.child_id and x.deleted_at is null) then
                edges := edges || private.insert_edge(fid, other, rec.child_id, rec.lineage, u);
              end if;
            end loop;
          end if;
          update public.parent_child set union_id = u where parent_id = q and child_id = anchor and deleted_at is null;
          perform private.retire_union_if_empty(q_union);
        elsif q_union is not null and cardinality(private.union_partner_ids(q_union)) = 1
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
      if partner <> anchor and exists (select 1 from public.parent_child
                                       where parent_id = partner and child_id = other and deleted_at is null) then
        -- the other parent already has this child (e.g. in a one-parent family unit): move that
        -- link into this couple's unit instead of adding it twice
        select union_id into q_union from public.parent_child
        where parent_id = partner and child_id = other and deleted_at is null;
        update public.parent_child set union_id = u where parent_id = partner and child_id = other and deleted_at is null;
        if q_union is not null and q_union <> u then
          perform private.retire_union_if_empty(q_union);
        end if;
      else
        edges := edges || private.insert_edge(
          fid, partner, other,
          case when partner = anchor then lin
               else coalesce((opts ->> 'other_parent_lineage')::public.lineage, lin) end,
          u);
      end if;
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
