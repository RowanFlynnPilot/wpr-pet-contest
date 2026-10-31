-- A small copy of each photo, made by the browser at upload.
--
-- Without the paid plan's image transformations the gallery would serve every
-- phone a 2048px original: hundreds of them, to readers arriving from a
-- Facebook share on cellular data. The entry form already re-encodes the photo
-- through a canvas; it now also sends an 800px copy, which submit-entry checks
-- and strips exactly like the original. Optional: an entry without one (the
-- form's fallback path, or an older client) just shows the original.

alter table entries add column thumb_path text;

grant select (thumb_path) on entries to anon;


-- Replaces the 0012 version: one more argument, the thumbnail's path.
drop function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int);

create function insert_entry(
  p_contest_id        uuid,
  p_pet_name          text,
  p_species           species,
  p_owner_name        text,
  p_owner_email       text,
  p_town              text,
  p_caption           text,
  p_photo_path        text,
  p_newsletter_opt_in boolean,
  p_max_per_email     int,
  p_thumb_path        text default null
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  c       contests%rowtype;
  v_count int;
  v_id    uuid;
begin
  select * into c from contests where id = p_contest_id for share;

  if not found or c.status <> 'submissions_open'
     or now() not between c.submissions_open_at and c.submissions_close_at then
    raise exception 'Submissions are closed.' using errcode = 'WP400';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(c.id::text || lower(p_owner_email), 0));

  -- The cast matters: citext = text resolves to case-sensitive text equality,
  -- and Jo@Example.com would slip past the cap.
  select count(*) into v_count
  from entries
  where contest_id = c.id and owner_email = p_owner_email::citext and status <> 'rejected';

  if v_count >= p_max_per_email then
    raise exception 'Each email address can enter up to % pets.', p_max_per_email
      using errcode = 'WP400';
  end if;

  insert into entries (contest_id, pet_name, species, owner_name, owner_email, town,
                       caption, photo_path, thumb_path, newsletter_opt_in, rights_accepted_at)
  values (c.id, p_pet_name, p_species, p_owner_name, p_owner_email, p_town,
          p_caption, p_photo_path, p_thumb_path, coalesce(p_newsletter_opt_in, false), now())
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int, text)
  from public, anon, authenticated;
grant execute on function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int, text)
  to service_role;


-- A rejected entry now has up to two public files. Either one still in the
-- bucket is a leak; object_name says which.
create or replace view rejected_photos_live with (security_invoker = true) as
  select e.id as entry_id,
         e.contest_id,
         e.pet_name,
         e.photo_path,
         e.moderated_at,
         o.name as object_name
  from entries e
  join storage.objects o
    on o.bucket_id = 'pets' and o.name in (e.photo_path, e.thumb_path)
  where e.status = 'rejected';

grant select on rejected_photos_live to authenticated, service_role;
