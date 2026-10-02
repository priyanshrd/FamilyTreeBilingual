-- Families (tree workspaces) and membership.
-- The app currently uses one shared login, which is the owner of the families it creates.
-- Membership-based RLS still applies, so any other account (e.g. one created by mistake)
-- sees nothing, and per-person accounts can be added later without schema changes.

create table public.families (
  id               uuid primary key default gen_random_uuid(),
  name             jsonb not null check (private.is_localized_text(name) and name <> '{}'::jsonb),
  description      jsonb check (private.is_localized_text(description)),
  default_language text not null default 'mr' references public.languages (code),
  root_person_id   uuid,  -- FK added once persons exists
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  deleted_at       timestamptz,
  deleted_by       uuid
);

create trigger touch before insert or update on public.families
  for each row execute function private.touch_entity();

create table public.family_members (
  family_id  uuid not null references public.families (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.family_role not null default 'viewer',
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (family_id, user_id)
);

create index family_members_user_idx on public.family_members (user_id);

create trigger touch before insert or update on public.family_members
  for each row execute function private.touch_link();

-- A family must always keep at least one owner.
create function private.keep_one_owner() returns trigger
language plpgsql as $$
declare
  fid uuid := old.family_id;
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.families where id = fid)
     and not exists (
       select 1 from public.family_members
       where family_id = fid and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'A family must keep at least one owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger keep_one_owner before update or delete on public.family_members
  for each row execute function private.keep_one_owner();

-- ---------------------------------------------------------------------------
-- Access helpers used by every RLS policy. SECURITY DEFINER so the lookup itself
-- is not subject to family_members RLS (which would recurse).
-- ---------------------------------------------------------------------------
create function private.has_family_role(fid uuid, min_role public.family_role)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.family_members m
    where m.family_id = fid
      and m.user_id = (select auth.uid())
      and case min_role
            when 'viewer' then true
            when 'editor' then m.role in ('owner', 'editor')
            when 'owner'  then m.role = 'owner'
          end
  )
$$;

create function private.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_family_role(fid, 'viewer')
$$;

-- Raises unless the caller has at least `min_role` in the family (for RPCs).
create function private.require_family_role(fid uuid, min_role public.family_role) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_family_role(fid, min_role) then
    raise exception 'Not allowed: % access to this family is required', min_role
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.has_family_role(uuid, public.family_role) from public;
revoke all on function private.is_family_member(uuid) from public;
revoke all on function private.require_family_role(uuid, public.family_role) from public;
grant execute on function private.has_family_role(uuid, public.family_role) to authenticated, service_role;
grant execute on function private.is_family_member(uuid) to authenticated, service_role;
grant execute on function private.require_family_role(uuid, public.family_role) to authenticated, service_role;
