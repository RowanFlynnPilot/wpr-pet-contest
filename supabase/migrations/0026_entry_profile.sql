-- Get to know the pet: three optional prompts on the entry form (what the pet
-- also answers to, a favorite thing, a trick or a quirk), shown on the pet
-- page once the entry is approved. Reader-written, so moderated with the
-- photo and the caption: public like the caption, and about the pet, never
-- the owner. Moderators may correct or clear an answer instead of rejecting
-- the whole entry over it.

alter table entries
  add column profile_nickname text,
  add column profile_favorite text,
  add column profile_trick    text,
  add constraint profile_lengths check (
    coalesce(char_length(profile_nickname), 0) <= 40
    and coalesce(char_length(profile_favorite), 0) <= 60
    and coalesce(char_length(profile_trick), 0) <= 80
  );

grant select (profile_nickname, profile_favorite, profile_trick) on entries to anon;
grant update (profile_nickname, profile_favorite, profile_trick) on entries to authenticated;

-- insert_entry takes the three answers. A new signature, so the old one is
-- dropped and the new one granted afresh: service_role only, as before.
drop function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int, text);

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
  p_thumb_path        text default null,
  p_profile_nickname  text default null,
  p_profile_favorite  text default null,
  p_profile_trick     text default null
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
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
                       caption, photo_path, thumb_path, newsletter_opt_in, rights_accepted_at,
                       profile_nickname, profile_favorite, profile_trick)
  values (c.id, p_pet_name, p_species, p_owner_name, p_owner_email, p_town,
          p_caption, p_photo_path, p_thumb_path, coalesce(p_newsletter_opt_in, false), now(),
          nullif(btrim(p_profile_nickname), ''), nullif(btrim(p_profile_favorite), ''),
          nullif(btrim(p_profile_trick), ''))
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int, text, text, text, text)
  from public, anon, authenticated;
grant execute on function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int, text, text, text, text)
  to service_role;
