-- A late-entry pass: one staff-approved entry after submissions close
-- (Nov. 21, 2026).
--
-- The rules close entries at submissions_close_at, and open_round sets the
-- field. A pass is the one exception: a staff member issues it, with a reason,
-- for one person; it opens the ordinary entry form for one submission while
-- the Open Round is running, and nothing else. The owner still submits
-- through submit-entry, so the photo release is accepted at submission
-- (rights_accepted_at is never backfilled), the photo's metadata is stripped,
-- and the entry waits for moderation like any other. Voting, payments and the
-- contest's status are never touched.
--
-- Every pass is kept: who issued it, when, why, when it expires, and the
-- entry it became. The link carries a 256-bit token; only its SHA-256 is
-- stored.

create table late_entry_passes (
  id          uuid primary key default gen_random_uuid(),
  contest_id  uuid not null references contests(id) on delete cascade,
  token_hash  bytea not null unique,
  reason      text not null check (char_length(btrim(reason)) between 3 and 300),
  issued_by   uuid not null references auth.users(id),
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  used_at     timestamptz,
  entry_id    uuid unique references entries(id) on delete set null,
  check (expires_at > issued_at)
);

alter table late_entry_passes enable row level security;
create policy late_entry_passes_admin_read on late_entry_passes
  for select to authenticated using ((select is_admin()));
revoke all on late_entry_passes from public, anon, authenticated, service_role;
grant select on late_entry_passes to authenticated;

-- The Open Round, still running and before Last Chance: the only time a late
-- pet can join (a pet added after the bracket is seeded could never play).
create function late_entry_round_open(p_contest_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from contests c
    join rounds r on r.contest_id = c.id and r.seq = 1
    where c.id = p_contest_id and c.status = 'voting'
      and r.status = 'open' and r.overtime_closes_at is null and now() < r.closes_at
  )
$$;
revoke execute on function late_entry_round_open(uuid) from public, anon, authenticated;

-- Staff: issue a pass. Returns the token, shown once, for the link.
create function issue_late_entry_pass(p_contest_id uuid, p_reason text, p_hours int default 48)
  returns text
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_token  text;
  v_closes timestamptz;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Say why this pass is issued and who approved it.' using errcode = 'WP400';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then
    raise exception 'A pass lasts from 1 hour to 7 days.' using errcode = 'WP400';
  end if;

  perform 1 from contests where id = p_contest_id for share;
  if not late_entry_round_open(p_contest_id) then
    raise exception 'Late entries can join only while the Open Round is running, before Last Chance.'
      using errcode = 'WP400';
  end if;

  select closes_at into v_closes from rounds where contest_id = p_contest_id and seq = 1;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into late_entry_passes (contest_id, token_hash, reason, issued_by, expires_at)
  values (p_contest_id, sha256(convert_to(v_token, 'UTF8')), btrim(p_reason), auth.uid(),
          least(now() + make_interval(hours => p_hours), v_closes));

  return v_token;
end $$;
revoke execute on function issue_late_entry_pass(uuid, text, int) from public, anon, authenticated;
grant execute on function issue_late_entry_pass(uuid, text, int) to authenticated;

-- Staff: withdraw a pass nobody has used yet.
create function revoke_late_entry_pass(p_pass_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  update late_entry_passes set revoked_at = now()
  where id = p_pass_id and used_at is null and revoked_at is null;
  if not found then
    raise exception 'That pass was already used or withdrawn.' using errcode = 'WP400';
  end if;
end $$;
revoke execute on function revoke_late_entry_pass(uuid) from public, anon, authenticated;
grant execute on function revoke_late_entry_pass(uuid) to authenticated;

-- submit-entry: which contest a pass is for, if it is still good (to name the
-- storage folder). insert_late_entry decides again, under a lock.
create function late_entry_pass_contest(p_token text) returns uuid
  language sql stable security definer set search_path = public, pg_temp
as $$
  select p.contest_id from late_entry_passes p
  where p.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
    and p.used_at is null and p.revoked_at is null and now() < p.expires_at
    and late_entry_round_open(p.contest_id)
$$;
revoke execute on function late_entry_pass_contest(text) from public, anon, authenticated;
grant execute on function late_entry_pass_contest(text) to service_role;

-- submit-entry: the entry itself, as insert_entry makes it, on a good pass.
-- The pass is spent in the same transaction.
create function insert_late_entry(
  p_token             text,
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
  p       late_entry_passes%rowtype;
  v_count int;
  v_id    uuid;
begin
  select * into p from late_entry_passes
  where token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
  for update;

  if not found or p.used_at is not null or p.revoked_at is not null or now() >= p.expires_at then
    raise exception 'This late-entry link has expired or was already used.' using errcode = 'WP400';
  end if;

  perform 1 from contests where id = p.contest_id for share;
  if not late_entry_round_open(p.contest_id) then
    raise exception 'Late entries can join only while the Open Round is running.' using errcode = 'WP400';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p.contest_id::text || lower(p_owner_email), 0));
  select count(*) into v_count
  from entries
  where contest_id = p.contest_id and owner_email = p_owner_email::citext and status <> 'rejected';
  if v_count >= p_max_per_email then
    raise exception 'Each email address can enter up to % pets.', p_max_per_email using errcode = 'WP400';
  end if;

  insert into entries (contest_id, pet_name, species, owner_name, owner_email, town,
                       caption, photo_path, thumb_path, newsletter_opt_in, rights_accepted_at,
                       profile_nickname, profile_favorite, profile_trick)
  values (p.contest_id, p_pet_name, p_species, p_owner_name, p_owner_email, p_town,
          p_caption, p_photo_path, p_thumb_path, coalesce(p_newsletter_opt_in, false), now(),
          nullif(btrim(p_profile_nickname), ''), nullif(btrim(p_profile_favorite), ''),
          nullif(btrim(p_profile_trick), ''))
  returning id into v_id;

  update late_entry_passes set used_at = now(), entry_id = v_id where id = p.id;
  return v_id;
end $$;
revoke execute on function insert_late_entry(text, text, species, text, text, text, text, text, boolean, int, text, text, text, text)
  from public, anon, authenticated;
grant execute on function insert_late_entry(text, text, species, text, text, text, text, text, boolean, int, text, text, text, text)
  to service_role;

-- moderate_entry: as 0009's, except that while the Open Round runs a staff
-- member may decide an entry that came in on a late-entry pass. Every other
-- entry's field is still set the moment voting starts.
create or replace function moderate_entry(p_entry_id uuid, p_approve boolean, p_reason text default null)
  returns text
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  e entries%rowtype;
  v_contest_status contest_status;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict e from entries where id = p_entry_id for update;
  select status into v_contest_status from contests where id = e.contest_id for share;

  if v_contest_status not in ('draft', 'submissions_open')
     and not (e.status = 'pending'
              and exists (select 1 from late_entry_passes lp where lp.entry_id = e.id)
              and late_entry_round_open(e.contest_id)) then
    raise exception 'the field is set: voting has started' using errcode = 'WP400';
  end if;

  if e.status = 'rejected' then
    raise exception 'rejected entries cannot be restored; the photo is deleted' using errcode = 'WP400';
  end if;

  if e.status = 'approved' and p_approve then
    raise exception 'entry is already approved' using errcode = 'WP400';
  end if;

  if not p_approve and v_reason is null then
    raise exception 'a rejection reason is required' using errcode = 'WP400';
  end if;

  update entries
  set status           = case when p_approve then 'approved' else 'rejected' end::entry_status,
      rejection_reason = case when p_approve then null else v_reason end,
      moderated_by     = auth.uid(),
      moderated_at     = now()
  where id = e.id;

  return e.photo_path;
end $$;
revoke execute on function moderate_entry(uuid, boolean, text) from public, anon, authenticated;
grant execute on function moderate_entry(uuid, boolean, text) to authenticated;
