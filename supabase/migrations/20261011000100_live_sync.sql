-- Keeping several devices in step.
--
-- 1. Automatic names (transliterations marked source = 'auto') record which rules made them,
--    e.g. provider 'builtin-rules-v2'. A device running an older copy of the app must never replace
--    a name made by newer rules — otherwise two devices keep rewriting the same names back and forth
--    on every visit. Such an update is ignored (the row keeps its newer values).
-- 2. Live updates: the family tables are added to Supabase Realtime, so open copies of the tree
--    reload when someone else changes something. Row Level Security still decides who may see what.

create function private.rules_version(provider text) returns int
language sql immutable as $$
  select coalesce((regexp_match(provider, '^builtin-rules-v(\d+)$'))[1]::int, 0);
$$;

create function private.keep_newer_auto_name() returns trigger
language plpgsql as $$
begin
  if old.source = 'auto' and new.source = 'auto'
     and private.rules_version(new.provider) < private.rules_version(old.provider) then
    return old;  -- an out-of-date app: keep the newer automatic name
  end if;
  return new;
end;
$$;

create trigger keep_newer_auto_name before update on public.person_name_forms
  for each row execute function private.keep_newer_auto_name();

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;  -- not a Supabase database (local tests)
  end if;
  foreach t in array array[
    'persons', 'person_names', 'person_name_forms', 'person_facts', 'unions', 'union_partners',
    'parent_child', 'media', 'media_links', 'kinship_terms'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
