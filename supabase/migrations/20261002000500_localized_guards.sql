-- Invariant I9 for localized jsonb columns: an automatic value never replaces a manual / corrected one.
-- Usage: create trigger ... execute function private.guard_localized('col_a', 'col_b', ...)

create function private.guard_localized() returns trigger
language plpgsql as $$
declare
  col text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    perform private.assert_no_auto_overwrite(o -> col, n -> col, tg_table_name || '.' || col);
  end loop;
  return new;
end;
$$;

create trigger guard_localized before update on public.families
  for each row execute function private.guard_localized('name', 'description');
create trigger guard_localized before update on public.persons
  for each row execute function private.guard_localized('notes');
create trigger guard_localized before update on public.person_facts
  for each row execute function private.guard_localized('value', 'place', 'notes');
create trigger guard_localized before update on public.unions
  for each row execute function private.guard_localized('notes');
create trigger guard_localized before update on public.union_facts
  for each row execute function private.guard_localized('value', 'place', 'notes');
