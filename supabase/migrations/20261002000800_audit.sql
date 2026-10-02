-- Append-only audit log: who changed what, when. Populated by triggers; nobody can write it
-- through the API. Because the app uses one shared login, the client also sends an optional
-- "x-editor-name" header (the name typed on that device), recorded as actor_label.

create table public.audit_log (
  id          bigint generated always as identity primary key,
  family_id   uuid not null,
  table_name  text not null,
  row_key     jsonb not null,
  action      text not null check (action in ('insert', 'update', 'delete', 'soft_delete', 'restore')),
  actor_id    uuid,
  actor_label text,
  at          timestamptz not null default now(),
  old_values  jsonb,   -- changed columns only (for updates)
  new_values  jsonb
);

create index audit_log_family_at_idx on public.audit_log (family_id, at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_key);

create function private.request_editor_label() returns text
language plpgsql stable as $$
declare
  label text;
begin
  label := nullif(btrim(current_setting('request.headers', true)::json ->> 'x-editor-name'), '');
  return left(label, 80);
exception when others then
  return null;
end;
$$;

-- tg_argv: primary-key column names of the audited table.
create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  k jsonb := '{}'::jsonb;
  col text;
  old_diff jsonb := '{}'::jsonb;
  new_diff jsonb := '{}'::jsonb;
  act text := lower(tg_op);
  fid uuid;
begin
  foreach col in array tg_argv loop
    k := k || jsonb_build_object(col, r -> col);
  end loop;
  fid := coalesce((r ->> 'family_id')::uuid, case when tg_table_name = 'families' then (r ->> 'id')::uuid end);

  if tg_op = 'UPDATE' then
    for col in select jsonb_object_keys(n) loop
      if col not in ('updated_at', 'updated_by', 'search_key') and (n -> col) is distinct from (o -> col) then
        old_diff := old_diff || jsonb_build_object(col, o -> col);
        new_diff := new_diff || jsonb_build_object(col, n -> col);
      end if;
    end loop;
    if new_diff = '{}'::jsonb then
      return null;
    end if;
    if new_diff ? 'deleted_at' then
      act := case when n ->> 'deleted_at' is null then 'restore' else 'soft_delete' end;
    end if;
    o := old_diff;
    n := new_diff;
  end if;

  insert into public.audit_log (family_id, table_name, row_key, action, actor_id, actor_label, old_values, new_values)
  values (fid, tg_table_name, k, act, auth.uid(), private.request_editor_label(), o, n);
  return null;
end;
$$;

create trigger audit after insert or update or delete on public.families
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.family_members
  for each row execute function private.audit_row('family_id', 'user_id');
create trigger audit after insert or update or delete on public.persons
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.person_names
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.person_name_forms
  for each row execute function private.audit_row('name_id', 'lang');
create trigger audit after insert or update or delete on public.person_facts
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.unions
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.union_partners
  for each row execute function private.audit_row('union_id', 'person_id');
create trigger audit after insert or update or delete on public.union_facts
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.parent_child
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.media
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.media_links
  for each row execute function private.audit_row('id');
create trigger audit after insert or update or delete on public.kinship_terms
  for each row execute function private.audit_row('id');
