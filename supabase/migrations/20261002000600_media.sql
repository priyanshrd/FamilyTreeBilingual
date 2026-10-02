-- Media metadata (binaries live in Supabase Storage, never in Postgres) and the storage bucket.
--
-- Storage layout (bucket `family-media`, private):
--   {family_id}/people/{person_id}/{media_id}.{ext}
--   {family_id}/people/{person_id}/{media_id}_thumb.webp
--   {family_id}/documents/{media_id}.{ext}
--   {family_id}/family/{media_id}.{ext}
--   {family_id}/exports/{export_id}.{ext}

create table public.media (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  kind                public.media_kind not null,
  bucket              text not null default 'family-media',
  storage_path        text not null,
  thumb_path          text,
  mime_type           text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes          bigint not null check (size_bytes > 0 and size_bytes <= 15 * 1024 * 1024),
  width               int check (width > 0),
  height              int check (height > 0),
  title               jsonb check (private.is_localized_text(title)),
  description         jsonb check (private.is_localized_text(description)),
  date_qualifier      public.date_qualifier not null default 'unknown',
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
  unique (bucket, storage_path),
  -- objects must live under their family's folder, so storage RLS and row RLS agree
  check (storage_path like family_id::text || '/%' and storage_path not like '%..%'),
  check (thumb_path is null or (thumb_path like family_id::text || '/%' and thumb_path not like '%..%')),
  check ((kind = 'photo') = (mime_type like 'image/%')),
  check (private.is_valid_fuzzy_date(date_qualifier, date_from, date_from_precision, date_to, date_to_precision))
);

create index media_family_idx on public.media (family_id) where deleted_at is null;

create trigger touch before insert or update on public.media
  for each row execute function private.touch_entity();
create trigger guard_localized before update on public.media
  for each row execute function private.guard_localized('title', 'description');

create table public.media_links (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null,
  media_id   uuid not null,
  person_id  uuid,
  union_id   uuid,
  role       text not null default 'tagged' check (role in ('profile', 'tagged', 'attachment')),
  crop       jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  foreign key (family_id, media_id)  references public.media (family_id, id)   on delete cascade,
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade,
  foreign key (family_id, union_id)  references public.unions (family_id, id)  on delete cascade,
  check (num_nonnulls(person_id, union_id) = 1),
  check (role <> 'profile' or person_id is not null)
);

create unique index media_links_one_profile on public.media_links (person_id) where role = 'profile';
create unique index media_links_person_unique on public.media_links (media_id, person_id) where person_id is not null;
create unique index media_links_union_unique on public.media_links (media_id, union_id) where union_id is not null;
create index media_links_media_idx on public.media_links (media_id);

create trigger touch before insert or update on public.media_links
  for each row execute function private.touch_link();

-- ---------------------------------------------------------------------------
-- Storage bucket + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-media', 'family-media', false, 15 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- First path segment as a family id; null when it is not a valid uuid.
create function private.storage_family_id(object_name text) returns uuid
language plpgsql immutable as $$
declare
  first_segment text := (storage.foldername(object_name))[1];
begin
  if first_segment ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

grant execute on function private.storage_family_id(text) to authenticated;

create policy "family-media: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'family-media'
         and private.has_family_role(private.storage_family_id(name), 'viewer'));

create policy "family-media: editors upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'family-media'
              and private.has_family_role(private.storage_family_id(name), 'editor'));

create policy "family-media: editors update" on storage.objects
  for update to authenticated
  using (bucket_id = 'family-media'
         and private.has_family_role(private.storage_family_id(name), 'editor'))
  with check (bucket_id = 'family-media'
              and private.has_family_role(private.storage_family_id(name), 'editor'));

-- Media rows are soft-deleted; removing the binary is an owner-only purge.
create policy "family-media: owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'family-media'
         and private.has_family_role(private.storage_family_id(name), 'owner'));
