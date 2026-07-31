-- The bucket `submit-entry` writes to. Referenced by the edge function, so this
-- migration has to exist before that function will work at all.
--
-- Public bucket, UUID paths. Reads are open because the gallery needs them and
-- Storage image transformations (?width=1200) work directly on public objects.
-- Writes are closed to everyone: only the service role key held by
-- `submit-entry` can put an object here.
--
-- Consequence worth knowing: a rejected photo stays fetchable at its UUID URL
-- until the object is deleted. The moderation UI MUST delete the storage object
-- when it rejects an entry. That is the only thing standing between you and an
-- inappropriate submission living on your CDN forever.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pets',
  'pets',
  true,
  10485760,  -- 10 MB, matches MAX_BYTES in submit-entry
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy pets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'pets');

create policy pets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pets' and is_admin());
