-- Row Level Security. Every family-owned row is visible only to members of its family.
--   viewer: read
--   editor: read + insert + update (soft delete is an update)
--   owner:  editor + family settings
-- No client can hard-delete people, relationships, facts or media. The only hard deletes allowed
-- are on pure link/value tables (name forms, union partners, media links).
--
-- Grants are tightened too: `anon` gets nothing, and TRUNCATE (which bypasses RLS) is revoked.

do $$
declare
  t text;
begin
  foreach t in array array[
    'families', 'family_members', 'persons', 'person_names', 'person_name_forms', 'person_facts',
    'unions', 'union_partners', 'union_facts', 'parent_child', 'media', 'media_links',
    'kinship_terms', 'audit_log', 'languages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
grant select on public.languages to authenticated;
create policy "languages: readable" on public.languages for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Families & membership (created through create_family(); membership managed by owners via RPC later)
-- ---------------------------------------------------------------------------
grant select, update on public.families to authenticated;
create policy "families: members read" on public.families
  for select to authenticated using (private.has_family_role(id, 'viewer'));
create policy "families: owners update" on public.families
  for update to authenticated
  using (private.has_family_role(id, 'owner'))
  with check (private.has_family_role(id, 'owner'));

grant select on public.family_members to authenticated;
create policy "family_members: members read" on public.family_members
  for select to authenticated using (private.has_family_role(family_id, 'viewer'));

-- ---------------------------------------------------------------------------
-- Genealogy data: read for members, write for editors, no hard delete.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'persons', 'person_names', 'person_name_forms', 'person_facts',
    'unions', 'union_partners', 'union_facts', 'parent_child',
    'media', 'media_links', 'kinship_terms'
  ] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format($p$create policy "%s: members read" on public.%I
      for select to authenticated using (private.has_family_role(family_id, 'viewer'))$p$, t, t);
    execute format($p$create policy "%s: editors insert" on public.%I
      for insert to authenticated with check (private.has_family_role(family_id, 'editor'))$p$, t, t);
    execute format($p$create policy "%s: editors update" on public.%I
      for update to authenticated
      using (private.has_family_role(family_id, 'editor'))
      with check (private.has_family_role(family_id, 'editor'))$p$, t, t);
  end loop;

  foreach t in array array['person_name_forms', 'union_partners', 'media_links'] loop
    execute format('grant delete on public.%I to authenticated', t);
    execute format($p$create policy "%s: editors delete" on public.%I
      for delete to authenticated using (private.has_family_role(family_id, 'editor'))$p$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Audit log: members read; written only by the security-definer trigger.
-- ---------------------------------------------------------------------------
grant select on public.audit_log to authenticated;
create policy "audit_log: members read" on public.audit_log
  for select to authenticated using (private.has_family_role(family_id, 'viewer'));
