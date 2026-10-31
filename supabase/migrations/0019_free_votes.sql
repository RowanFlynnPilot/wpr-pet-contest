-- The free daily vote: one free vote per verified email address per Central
-- calendar day, alongside the vote packs. Design: docs/FREE-DAILY-VOTE.md.
--
-- Free votes never touch money. They live in their own table so no money
-- view, refund path, payout or Stripe check has to learn to skip them, and
-- they reach the public only as a column of entry_round_totals.
--
-- Off by default. A contest turns it on while it is a draft
-- (set_free_vote_enabled), and the setting freezes when submissions open,
-- because it is in the published rules. Staff may pause it mid-contest.
--
-- The one write path is free_vote_record(), reached only through the
-- free-vote edge function once the voter has proved the address: a code, an
-- emailed link, or a device token issued after one. No API role holds INSERT,
-- UPDATE or DELETE on free_votes, not even service_role.

-- ------------------------------------------------------------------ schema --
alter table contests
  add column free_vote_enabled   boolean not null default false,
  add column free_vote_paused_at timestamptz;

create type free_vote_status as enum ('counted', 'voided', 'returned');

-- One row per address per contest. Erased with the rest of the personal data.
create table free_voters (
  id                uuid primary key default gen_random_uuid(),
  contest_id        uuid not null references contests(id) on delete cascade,
  email             citext not null,   -- as typed: where codes and reminders go
  email_key         text not null,     -- email_key(email): the identity the limits use
  verified_at       timestamptz,
  newsletter_opt_in boolean not null default false,
  reminders_opt_in  boolean not null default false,   -- this contest only
  undeliverable_at  timestamptz,
  blocked_at        timestamptz,
  blocked_by        uuid references auth.users(id) on delete set null,
  blocked_reason    text,
  created_at        timestamptz not null default now(),
  unique (contest_id, email_key),
  constraint block_recorded check (blocked_at is null or blocked_reason is not null)
);

-- A code request, holding the vote it casts when confirmed. The code itself is
-- never stored: only an HMAC keyed by FREE_VOTE_HASH_KEY, which lives in the
-- edge function and never reaches the database.
create table free_vote_challenges (
  id          uuid primary key default gen_random_uuid(),
  voter_id    uuid not null references free_voters(id) on delete cascade,
  round_id    uuid not null references rounds(id) on delete cascade,
  entry_id    uuid not null references entries(id) on delete cascade,
  email       text not null,           -- the normalized address the code went to
  code_hmac   bytea not null,
  link_hash   bytea not null unique,   -- sha256 of the emailed link token
  newsletter  boolean not null default false,   -- opt-ins, applied once verified
  reminders   boolean not null default false,
  attempts    int not null default 0,
  send_status text check (send_status in ('sent', 'failed')),
  ip_hash     text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  outcome     text
);
create index free_vote_challenges_voter_idx on free_vote_challenges (voter_id, created_at);
create index free_vote_challenges_sent_idx on free_vote_challenges (created_at) where send_status is not null;

-- Browsers that have proved the address, so later days need no email.
create table free_voter_devices (
  id           uuid primary key default gen_random_uuid(),
  voter_id     uuid not null references free_voters(id) on delete cascade,
  token_hash   bytea not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create table free_votes (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds(id),
  entry_id      uuid not null references entries(id),
  matchup_id    uuid references matchups(id),   -- as on votes: null in the open round
  voter_id      uuid not null references free_voters(id),
  vote_day      date not null,
  via           text not null check (via in ('code', 'link', 'device')),
  status        free_vote_status not null default 'counted',
  voided_at     timestamptz,
  voided_by     uuid references auth.users(id) on delete set null,
  voided_reason text,
  ip_hash       text,                           -- keyed hash, never the address
  cast_at       timestamptz not null default clock_timestamp(),
  constraint void_recorded
    check (status = 'counted' or (voided_at is not null and voided_reason is not null))
);

-- The daily limit is a constraint, not application logic, so two taps at once
-- cannot both count. A 'returned' vote (its pet was disqualified) frees the day.
create unique index free_votes_one_per_day on free_votes (voter_id, vote_day)
  where status <> 'returned';
create index free_votes_tally_idx on free_votes (round_id, entry_id) where status = 'counted';
create index free_votes_cast_idx on free_votes (cast_at);

create table free_vote_reminders (
  voter_id     uuid not null references free_voters(id) on delete cascade,
  reminder_day date not null,
  link_hash    bytea not null unique,   -- the vote link; works once
  unsub_hash   bytea not null unique,   -- a different token: unsubscribing never proves an address
  used_at      timestamptz,
  status       text not null check (status in ('pending', 'sent', 'failed')),
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  primary key (voter_id, reminder_day)
);

-- Pauses and voids, with who and why. Moderation is audited; so is this.
-- Reasons are staff prose and must never include an address.
create table free_vote_staff_log (
  id           uuid primary key default gen_random_uuid(),
  contest_id   uuid not null references contests(id) on delete cascade,
  action       text not null check (action in ('enable', 'disable', 'pause', 'resume', 'void')),
  voter_ids    uuid[],
  votes_voided int,
  reason       text not null,
  actor        uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table round_results add column free_votes int not null default 0;


-- --------------------------------------------------------------- constants --
-- In the style of payment_grace() and settle_period(): one place to tune.
create function free_vote_code_ttl() returns interval
  language sql immutable as $$ select interval '15 minutes' $$;
create function free_vote_max_attempts() returns int
  language sql immutable as $$ select 5 $$;
-- Reminders go out from this hour, Central time, while a round is open.
create function free_vote_reminder_hour() returns int
  language sql immutable as $$ select 7 $$;

-- The Central calendar day a moment falls on. Midnight Central is when the
-- next free vote unlocks, and the date handles the 25-hour day when daylight
-- time ends with no special case.
create function free_vote_day(p_at timestamptz) returns date
  language sql immutable as $$ select (p_at at time zone 'America/Chicago')::date $$;

-- An address as the free vote stores and mails it: lowercased, trimmed, one
-- trailing dot dropped from the domain. Null unless it is a plain addr-spec:
-- no display names, brackets, quotes, commas or spaces, which a mail service
-- might still deliver to an inbox the key below would not recognize.
create function free_vote_email(p_email text) returns text
  language sql immutable as $$
  select case when e ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
              and length(e) <= 254 then e end
  from (select regexp_replace(lower(trim(coalesce(p_email, ''))), '\.$', '') as e) x
$$;

-- The one definition of "the same address": any +tag dropped from the local
-- part; dots dropped for Gmail, and dots, hyphens and underscores for Proton,
-- which ignore them; each provider's domains folded into one.
create function email_key(p_email text) returns text
  language sql immutable as $$
  with parts as (
    select split_part(lower(trim(p_email)), '@', 1) as local,
           regexp_replace(split_part(lower(trim(p_email)), '@', 2), '\.$', '') as domain
  ), folded as (
    select split_part(local, '+', 1) as local,
           case when domain = 'googlemail.com' then 'gmail.com'
                when domain in ('protonmail.com', 'protonmail.ch', 'pm.me') then 'proton.me'
                else domain end as domain
    from parts
  )
  select case when domain = 'gmail.com' then replace(local, '.', '')
              when domain = 'proton.me' then regexp_replace(local, '[._-]', '', 'g')
              else local end || '@' || domain
  from folded
$$;

-- j•••@gmail.com: enough for a reader to recognize their own address.
create function mask_email(p_email text) returns text
  language sql immutable as $$
  select left(split_part(p_email, '@', 1), 1) || '•••@' || split_part(p_email, '@', 2)
$$;


-- --------------------------------------------------------------- the rules --
-- Where a free vote may go right now, or a reader-facing refusal. Shared by
-- the code request (before any email is sent) and every cast.
create function free_vote_target(r rounds, p_entry_id uuid) returns uuid
  language plpgsql stable security definer set search_path = public
as $$
declare
  c         contests%rowtype;
  v_pet     text;
  v_matchup uuid;
begin
  select * into strict c from contests where id = r.contest_id;
  if not c.free_vote_enabled then
    raise exception 'Free voting isn''t part of this contest.' using errcode = 'WP400';
  end if;
  if c.free_vote_paused_at is not null then
    raise exception 'Free voting is paused right now. Vote packs are still open.' using errcode = 'WP400';
  end if;

  select e.pet_name into v_pet
  from entries e
  where e.id = p_entry_id and e.contest_id = r.contest_id and e.status = 'approved';
  if v_pet is null then
    raise exception 'That pet is not in this contest.' using errcode = 'WP400';
  end if;

  if r.kind = 'bracket' then
    select m.id into v_matchup
    from matchups m
    where m.round_id = r.id and p_entry_id in (m.entry_a_id, m.entry_b_id);
    if v_matchup is null then
      raise exception '% is not in this round.', v_pet using errcode = 'WP400';
    end if;
  end if;
  return v_matchup;
end $$;

-- THE ONE PLACE A FREE VOTE IS WRITTEN.
--
-- The deadline follows the paid side. A one-step vote (a remembered browser)
-- counts if cast by closes_at. A two-step vote (emailed code or link) counts
-- if the code was requested by closes_at and confirmed by closes_at plus the
-- same grace a payment gets. The round is taken FOR SHARE, like confirm_vote,
-- so no free vote lands between close_round's tally and its status change.
--
-- Returns 'cast' or 'already_voted'. Anything else is a WP400 refusal with a
-- message for the reader; nothing is recorded, so there is nothing to undo.
create function free_vote_record(p_voter_id uuid, p_round_id uuid, p_entry_id uuid, p_via text,
                                 p_requested_at timestamptz, p_ip_hash text) returns text
  language plpgsql security definer set search_path = public
as $$
declare
  r         rounds%rowtype;
  fv        free_voters%rowtype;
  c         contests%rowtype;
  v_matchup uuid;
  v_rows    int;
begin
  select * into r from rounds where id = p_round_id for share;
  if not found then
    raise exception 'That round does not exist.' using errcode = 'WP400';
  end if;
  select * into strict c from contests where id = r.contest_id;

  if r.status <> 'open' or now() < r.opens_at
     or (p_via = 'device' and now() > r.closes_at)
     or (p_via <> 'device' and (p_requested_at > r.closes_at or now() > r.closes_at + payment_grace())) then
    raise exception 'The % closed at %.', round_label(r.seq, c.bracket_size),
      to_char(r.closes_at at time zone 'America/Chicago', 'FMHH12:MI a.m. "on" FMMonth FMDD')
      using errcode = 'WP400';
  end if;

  -- FOR SHARE: a void_free_voters running now either commits first (and this
  -- sees the block) or waits for this vote, which it then voids.
  select * into fv from free_voters where id = p_voter_id for share;
  if not found or fv.contest_id <> r.contest_id or fv.verified_at is null then
    raise exception 'Confirm your email address to vote free.' using errcode = 'WP400';
  end if;
  if fv.blocked_at is not null then
    raise exception 'Free voting isn''t available for this address.' using errcode = 'WP400';
  end if;

  -- The pet is held FOR SHARE so a vote cannot slip in beside a concurrent
  -- disqualification.
  perform 1 from entries where id = p_entry_id for share;
  v_matchup := free_vote_target(r, p_entry_id);

  insert into free_votes (round_id, entry_id, matchup_id, voter_id, vote_day, via, ip_hash)
  values (r.id, p_entry_id, v_matchup, fv.id, free_vote_day(now()), p_via, p_ip_hash)
  on conflict (voter_id, vote_day) where status <> 'returned' do nothing;
  get diagnostics v_rows = row_count;

  return case when v_rows = 1 then 'cast' else 'already_voted' end;
end $$;


-- --------------------------------------------- what the edge function calls --
-- A code request. Records a challenge holding the round, pet and opt-ins, and
-- returns its id for the code email. Answers the same way whether or not the
-- address has voted today, so it reveals nothing about anyone's votes.
create function free_vote_challenge(p_challenge_id uuid, p_round_id uuid, p_entry_id uuid, p_email text, p_code_hmac bytea,
                                    p_link_hash bytea, p_ip_hash text, p_newsletter boolean, p_reminders boolean)
  returns table (challenge_id uuid, expires_at timestamptz, masked_email text, pet_name text, contest_name text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  r       rounds%rowtype;
  fv      free_voters%rowtype;
  v_email text := free_vote_email(p_email);
  v_exp   timestamptz := now() + free_vote_code_ttl();
begin
  select * into r from rounds where id = p_round_id;
  if not found then
    raise exception 'That round does not exist.' using errcode = 'WP400';
  end if;
  if r.status <> 'open' or now() not between r.opens_at and r.closes_at then
    raise exception 'Voting is closed for this round.' using errcode = 'WP400';
  end if;
  perform free_vote_target(r, p_entry_id);

  if v_email is null then
    raise exception 'Enter a valid email address.' using errcode = 'WP400';
  end if;

  -- An existing voter keeps the address they proved; this one is copied over
  -- only if its code is confirmed.
  insert into free_voters (contest_id, email, email_key)
  values (r.contest_id, v_email, email_key(v_email))
  on conflict (contest_id, email_key) do update set email = free_voters.email
  returning * into fv;

  if fv.blocked_at is not null then
    raise exception 'Free voting isn''t available for this address.' using errcode = 'WP400';
  end if;

  -- Per-address caps, so the site cannot be used to flood someone's inbox.
  if (select count(*) from free_vote_challenges ch
      where ch.voter_id = fv.id and ch.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Too many codes requested for this address. Try again in a few minutes.' using errcode = 'WP400';
  end if;
  if (select count(*) from free_vote_challenges ch
      where ch.voter_id = fv.id and ch.created_at > now() - interval '1 day') >= 8 then
    raise exception 'Too many codes requested for this address today.' using errcode = 'WP400';
  end if;

  insert into free_vote_challenges (id, voter_id, round_id, entry_id, email, code_hmac, link_hash, newsletter, reminders,
                                    ip_hash, expires_at)
  values (p_challenge_id, fv.id, r.id, p_entry_id, v_email, p_code_hmac, p_link_hash, coalesce(p_newsletter, false),
          coalesce(p_reminders, false), p_ip_hash, v_exp);

  return query select p_challenge_id, v_exp, mask_email(v_email),
                      (select e.pet_name from entries e where e.id = p_entry_id),
                      (select c.name from contests c where c.id = r.contest_id);
end $$;

-- The edge function records whether the code email went out.
create function free_vote_challenge_sent(p_challenge_id uuid, p_sent boolean) returns void
  language sql security definer set search_path = public
as $$
  update free_vote_challenges set send_status = case when p_sent then 'sent' else 'failed' end
  where id = p_challenge_id;
$$;

-- Proves the address and, for a code or emailed link, casts the vote the
-- challenge holds. A reminder link proves the address only; the reader then
-- casts with the browser it registered.
--
-- outcome: cast | already_voted | verified | refused (message says why) |
--          wrong (message says how many tries are left) | expired | locked | used | invalid
create function free_vote_verify(p_kind text, p_challenge_id uuid, p_secret_hash bytea, p_device_hash bytea,
                                 p_ip_hash text)
  returns table (outcome text, message text, entry_id uuid, round_id uuid, masked_email text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  ch       free_vote_challenges%rowtype;
  rm       free_vote_reminders%rowtype;
  fv       free_voters%rowtype;
  v_out    text;
  v_msg    text;
  v_left   int;
begin
  if p_kind = 'reminder' then
    select * into rm from free_vote_reminders where link_hash = p_secret_hash;
    if not found then
      return query select 'invalid', 'That link is not valid.', null::uuid, null::uuid, null::text;
      return;
    end if;
    if rm.used_at is not null then
      return query select 'used', 'That reminder link was already used. Vote with a code instead.', null::uuid, null::uuid, null::text;
      return;
    end if;
    if rm.reminder_day < free_vote_day(now()) - 1 then
      return query select 'expired', 'That reminder has expired. Vote with a code instead.', null::uuid, null::uuid, null::text;
      return;
    end if;
    select * into strict fv from free_voters where id = rm.voter_id;
    if fv.blocked_at is not null then
      return query select 'refused', 'Free voting isn''t available for this address.', null::uuid, null::uuid, null::text;
      return;
    end if;
    update free_vote_reminders set used_at = now() where voter_id = rm.voter_id and reminder_day = rm.reminder_day;
    insert into free_voter_devices (voter_id, token_hash) values (fv.id, p_device_hash)
    on conflict (token_hash) do nothing;
    return query select 'verified', null::text, null::uuid, null::uuid, mask_email(fv.email::text);
    return;
  end if;

  if p_kind = 'code' then
    select * into ch from free_vote_challenges where id = p_challenge_id for update;
  elsif p_kind = 'link' then
    select * into ch from free_vote_challenges where link_hash = p_secret_hash for update;
  else
    raise exception 'unknown verification kind %', p_kind;
  end if;

  if not found then
    return query select 'invalid', 'That code is not valid. Request a new one.', null::uuid, null::uuid, null::text;
    return;
  end if;
  if ch.used_at is not null then
    return query select 'used', 'That code was already used.', ch.entry_id, ch.round_id, null::text;
    return;
  end if;
  if ch.attempts >= free_vote_max_attempts() then
    return query select 'locked', 'Too many wrong codes. Request a new one.', ch.entry_id, ch.round_id, null::text;
    return;
  end if;
  if now() > ch.expires_at then
    return query select 'expired', 'That code has expired. Request a new one.', ch.entry_id, ch.round_id, null::text;
    return;
  end if;
  if p_kind = 'code' and ch.code_hmac <> p_secret_hash then
    update free_vote_challenges set attempts = attempts + 1 where id = ch.id;
    v_left := free_vote_max_attempts() - ch.attempts - 1;
    if v_left <= 0 then
      return query select 'locked', 'Too many wrong codes. Request a new one.', ch.entry_id, ch.round_id, null::text;
    else
      return query select 'wrong',
        'That code doesn''t match. ' || v_left || case when v_left = 1 then ' try' else ' tries' end || ' left.',
        ch.entry_id, ch.round_id, null::text;
    end if;
    return;
  end if;

  -- Proved: the address the code went to is the voter's now. The opt-ins
  -- apply only from a typed code, where the person who ticked them is the
  -- person reading the inbox. Anyone can request a code for any address, so a
  -- tapped link must not carry a stranger's ticks.
  update free_voters
  set email = ch.email,
      verified_at = coalesce(verified_at, now()),
      newsletter_opt_in = newsletter_opt_in or (p_kind = 'code' and ch.newsletter),
      reminders_opt_in = reminders_opt_in or (p_kind = 'code' and ch.reminders)
  where id = ch.voter_id
  returning * into fv;

  if p_device_hash is not null then
    insert into free_voter_devices (voter_id, token_hash) values (fv.id, p_device_hash)
    on conflict (token_hash) do nothing;
  end if;

  begin
    v_out := free_vote_record(fv.id, ch.round_id, ch.entry_id, p_kind, ch.created_at, coalesce(p_ip_hash, ch.ip_hash));
  exception when sqlstate 'WP400' then
    v_out := 'refused';
    v_msg := sqlerrm;
  end;

  update free_vote_challenges set used_at = now(), outcome = v_out where id = ch.id;
  return query select v_out, v_msg, ch.entry_id, ch.round_id, mask_email(fv.email::text);
end $$;

-- A remembered browser: two taps, no email.
-- outcome: cast | already_voted | refused | unknown_device
create function free_vote_cast(p_device_hash bytea, p_round_id uuid, p_entry_id uuid, p_ip_hash text)
  returns table (outcome text, message text, masked_email text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  d     free_voter_devices%rowtype;
  fv    free_voters%rowtype;
  v_out text;
  v_msg text;
begin
  select * into d from free_voter_devices where token_hash = p_device_hash and revoked_at is null;
  if not found then
    return query select 'unknown_device', 'Confirm your email address to vote free.', null::text;
    return;
  end if;
  update free_voter_devices set last_used_at = now() where id = d.id;
  select * into strict fv from free_voters where id = d.voter_id;

  begin
    v_out := free_vote_record(fv.id, p_round_id, p_entry_id, 'device', now(), p_ip_hash);
  exception when sqlstate 'WP400' then
    v_out := 'refused';
    v_msg := sqlerrm;
  end;
  return query select v_out, v_msg, mask_email(fv.email::text);
end $$;

-- What a remembered browser should show: whose it is, whether today's vote is
-- spent, and when the next unlocks (midnight Central).
create function free_vote_device_status(p_device_hash bytea)
  returns table (masked_email text, voted_today boolean, voted_entry_id uuid, next_vote_at timestamptz,
                 reminders boolean, newsletter boolean)
  language sql stable security definer set search_path = public
as $$
  select mask_email(fv.email::text),
         t.id is not null,
         t.entry_id,
         ((free_vote_day(now()) + 1)::timestamp at time zone 'America/Chicago'),
         fv.reminders_opt_in,
         fv.newsletter_opt_in
  from free_voter_devices d
  join free_voters fv on fv.id = d.voter_id
  left join free_votes t on t.voter_id = fv.id and t.vote_day = free_vote_day(now()) and t.status <> 'returned'
  where d.token_hash = p_device_hash and d.revoked_at is null and fv.blocked_at is null
$$;

-- Opt-ins changed from the done screen. Null leaves a setting as it is.
create function free_vote_preferences(p_device_hash bytea, p_reminders boolean, p_newsletter boolean) returns boolean
  language sql security definer set search_path = public
as $$
  with v as (
    update free_voters fv
    set reminders_opt_in = coalesce(p_reminders, fv.reminders_opt_in),
        newsletter_opt_in = coalesce(p_newsletter, fv.newsletter_opt_in)
    from free_voter_devices d
    where d.token_hash = p_device_hash and d.revoked_at is null and d.voter_id = fv.id
    returning 1
  )
  select exists (select 1 from v)
$$;

-- Turns reminders off from the unsubscribe link in a reminder email. That
-- link carries its own token, which proves nothing about the address.
create function free_vote_unsubscribe(p_unsub_hash bytea) returns boolean
  language sql security definer set search_path = public
as $$
  with v as (
    update free_voters fv set reminders_opt_in = false
    from free_vote_reminders rm
    where rm.unsub_hash = p_unsub_hash and rm.voter_id = fv.id
    returning 1
  )
  select exists (select 1 from v)
$$;

-- Who is owed this morning's reminder: opted in, verified, reachable, not
-- voted today and not reminded today, while a round is open and it is past
-- the reminder hour in Chicago. The database decides the hour, so the UTC
-- cron needs no daylight-time adjustment. pet_id is the reader's last pet if
-- it is still in the running round, so the link can open it ready to cast.
create function free_vote_reminder_queue(p_limit int)
  returns table (voter_id uuid, email text, pet_id uuid, pet_name text, round_kind text, round_label text,
                 closes_at timestamptz, contest_name text)
  language sql stable security definer set search_path = public
as $$
  select fv.id, fv.email::text, last.entry_id, last.pet_name, r.kind::text, round_label(r.seq, c.bracket_size),
         r.closes_at, c.name
  from free_voters fv
  join contests c on c.id = fv.contest_id
  join rounds r on r.contest_id = c.id and r.status = 'open' and now() between r.opens_at and r.closes_at
  left join lateral (
    select f.entry_id, e.pet_name
    from free_votes f
    join entries e on e.id = f.entry_id and e.status = 'approved'
    where f.voter_id = fv.id
      and (r.kind = 'open' or exists (select 1 from matchups m
                                      where m.round_id = r.id and f.entry_id in (m.entry_a_id, m.entry_b_id)))
    order by f.cast_at desc
    limit 1
  ) last on true
  where c.free_vote_enabled and c.free_vote_paused_at is null and c.status = 'voting'
    and fv.reminders_opt_in and fv.verified_at is not null
    and fv.blocked_at is null and fv.undeliverable_at is null
    and extract(hour from now() at time zone 'America/Chicago') >= free_vote_reminder_hour()
    and not exists (select 1 from free_votes t
                    where t.voter_id = fv.id and t.vote_day = free_vote_day(now()) and t.status <> 'returned')
    and not exists (select 1 from free_vote_reminders rm
                    where rm.voter_id = fv.id and rm.reminder_day = free_vote_day(now()))
  order by fv.verified_at
  limit p_limit
$$;


-- --------------------------------------------------------- staff actions --
-- On or off, while the contest is a draft. It is in the published rules, so it
-- freezes when submissions open, exactly like the split.
create function set_free_vote_enabled(p_contest_id uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c contests%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  select * into strict c from contests where id = p_contest_id for update;
  if c.status <> 'draft' then
    raise exception 'The free daily vote is in the published rules, so it can only be changed while the contest is a draft.'
      using errcode = 'WP400';
  end if;
  update contests set free_vote_enabled = coalesce(p_enabled, false) where id = c.id;
  insert into free_vote_staff_log (contest_id, action, reason, actor)
  values (c.id, case when p_enabled then 'enable' else 'disable' end, 'Draft setting', auth.uid());
end $$;

-- Pause or resume, with a reason, logged. For abuse that outruns the controls.
create function set_free_vote_paused(p_contest_id uuid, p_paused boolean, p_reason text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c        contests%rowtype;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if v_reason is null then
    raise exception 'A reason is required. It is kept in the log.' using errcode = 'WP400';
  end if;
  select * into strict c from contests where id = p_contest_id for update;
  if not c.free_vote_enabled then
    raise exception 'Free voting is not part of this contest.' using errcode = 'WP400';
  end if;
  update contests set free_vote_paused_at = case when p_paused then coalesce(free_vote_paused_at, now()) end
  where id = c.id;
  insert into free_vote_staff_log (contest_id, action, reason, actor)
  values (c.id, case when p_paused then 'pause' else 'resume' end, v_reason, auth.uid());
end $$;

-- Blocks the voters, voids their counted votes in unfinished rounds, revokes
-- their browsers, and logs it. Run as the staff member, so voided_by is a real
-- person. Finished rounds keep their results.
create function void_free_voters(p_voter_ids uuid[], p_reason text) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_reason  text := nullif(trim(p_reason), '');
  v_voided  int;
  v_contest uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if v_reason is null then
    raise exception 'A reason is required. It is kept in the log.' using errcode = 'WP400';
  end if;
  select min(contest_id::text)::uuid into v_contest from free_voters where id = any (p_voter_ids);
  if v_contest is null then
    raise exception 'No such voters.' using errcode = 'WP400';
  end if;
  if (select count(distinct contest_id) from free_voters where id = any (p_voter_ids)) > 1 then
    raise exception 'Void one contest''s voters at a time.' using errcode = 'WP400';
  end if;

  update free_voters
  set blocked_at = coalesce(blocked_at, now()), blocked_by = coalesce(blocked_by, auth.uid()),
      blocked_reason = coalesce(blocked_reason, v_reason)
  where id = any (p_voter_ids);

  update free_votes f
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), voided_reason = v_reason
  from rounds r
  where r.id = f.round_id and r.status <> 'resolved'
    and f.voter_id = any (p_voter_ids) and f.status = 'counted';
  get diagnostics v_voided = row_count;

  update free_voter_devices set revoked_at = now() where voter_id = any (p_voter_ids) and revoked_at is null;

  insert into free_vote_staff_log (contest_id, action, voter_ids, votes_voided, reason, actor)
  values (v_contest, 'void', p_voter_ids, v_voided, v_reason, auth.uid());
  return v_voided;
end $$;


-- ------------------------------------------------------------- admin views --
-- security_invoker, so RLS on the tables keeps every one of them admin-only.

-- Per contest and Central day: votes, voters, new verifications, code sends.
create view free_vote_daily with (security_invoker = true) as
  select fv.contest_id,
         f.vote_day,
         count(*) filter (where f.status = 'counted')::int  as votes,
         count(*) filter (where f.status = 'voided')::int   as voided,
         count(distinct f.voter_id)::int                     as voters
  from free_votes f
  join free_voters fv on fv.id = f.voter_id
  group by fv.contest_id, f.vote_day;

-- Pets by free votes in the last hour, with the free share of the hour's gains.
create view free_vote_pet_watch with (security_invoker = true) as
  select r.contest_id, f.round_id, f.entry_id, e.pet_name,
         count(*)::int as free_last_hour,
         (select coalesce(sum(v.quantity), 0)::int from votes v
          where v.round_id = f.round_id and v.entry_id = f.entry_id and v.status = 'succeeded'
            and v.confirmed_at > now() - interval '1 hour') as paid_last_hour
  from free_votes f
  join rounds r on r.id = f.round_id
  join entries e on e.id = f.entry_id
  where f.status = 'counted' and f.cast_at > now() - interval '1 hour'
  group by r.contest_id, f.round_id, f.entry_id, e.pet_name;

-- Connections casting for several addresses in the last hour. The hash is
-- keyed and never the address; carrier networks put many phones behind one,
-- so this is a signal for a human, not a verdict.
create view free_vote_connection_watch with (security_invoker = true) as
  select fv.contest_id, left(f.ip_hash, 10) as connection,
         count(distinct f.voter_id)::int as voters,
         count(*)::int as votes,
         array_agg(distinct f.voter_id) as voter_ids
  from free_votes f
  join free_voters fv on fv.id = f.voter_id
  where f.ip_hash is not null and f.cast_at > now() - interval '1 hour' and f.status = 'counted'
  group by fv.contest_id, left(f.ip_hash, 10)
  having count(distinct f.voter_id) > 1;


-- -------------------------------------------- existing objects, extended --
-- Paid plus free. The new column is appended, so every reader keeps working.
-- Still security definer, for the reason in 0001: anon cannot read the vote
-- tables, so a security_invoker version would silently show zero.
create or replace view entry_round_totals as
  select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
  from round_results t
  union all
  select live.round_id, live.entry_id,
         sum(live.votes)::int, sum(live.amount_cents)::bigint, sum(live.free_votes)::int
  from (
    select v.round_id, v.entry_id, v.quantity as votes, v.amount_cents::bigint as amount_cents, 0 as free_votes
    from votes v join rounds r on r.id = v.round_id
    where v.status = 'succeeded' and r.status <> 'resolved'
    union all
    select f.round_id, f.entry_id, 1, 0::bigint, 1
    from free_votes f join rounds r on r.id = f.round_id
    where f.status = 'counted' and r.status <> 'resolved'
  ) live
  group by live.round_id, live.entry_id;

-- Snapshots free votes with everything else. Lock, settle check and order are
-- untouched.
create or replace function close_round(p_round_id uuid) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  r         rounds%rowtype;
  v_size    int;
  v_next_id uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict r from rounds where id = p_round_id for update;

  if r.status <> 'open' then
    raise exception 'round % is %, expected open', r.seq, r.status;
  end if;

  if now() < r.closes_at + settle_period() then
    raise exception 'round % closes at %. Results can be finalized from % so payments made before the deadline can settle.',
      r.seq, r.closes_at, r.closes_at + settle_period()
      using errcode = 'WP400';
  end if;

  update rounds set status = 'closed' where id = r.id;

  if r.kind = 'open' then
    select bracket_size into v_size from contests where id = r.contest_id;
    v_next_id := seed_bracket(r.id, v_size);
  else
    v_next_id := advance_bracket(r.id);
  end if;

  -- Status is 'closed' here, so this reads the live sums the builders just
  -- used. The round lock keeps any payment or free vote from landing between.
  insert into round_results (round_id, entry_id, votes, amount_cents, free_votes)
  select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
  from entry_round_totals t
  where t.round_id = r.id;

  update rounds set status = 'resolved', resolved_at = clock_timestamp() where id = r.id;

  return v_next_id;
end $$;

-- `votes` stays paid only, so "Votes sold" stays right. free_votes appended.
create or replace view contest_stats as
  select c.id as contest_id,
         c.year,
         c.beneficiary_split_pct,
         (select count(*) from entries e
          where e.contest_id = c.id and e.status = 'approved')::int as entries,
         coalesce(sum(v.quantity), 0)::int                          as votes,
         coalesce(sum(v.amount_cents - v.refunded_cents), 0)::bigint as gross_cents,
         (coalesce(sum(v.amount_cents - v.refunded_cents), 0) * c.beneficiary_split_pct / 100)::bigint as shelter_cents,
         (select count(*) from free_votes f join rounds fr on fr.id = f.round_id
          where fr.contest_id = c.id and f.status = 'counted')::int as free_votes
  from contests c
  left join rounds r on r.contest_id = c.id
  left join votes v  on v.round_id = r.id and v.status = 'succeeded'
  where c.status <> 'draft'
  group by c.id;

-- A third source: free voters who ticked the box and confirmed the address.
create or replace view newsletter_signups with (security_invoker = true) as
  select s.contest_id,
         s.email,
         min(s.first_seen)                                  as first_seen,
         string_agg(distinct s.source, ', ' order by s.source) as sources
  from (
    select e.contest_id, e.owner_email as email, e.created_at as first_seen, 'entry' as source
    from entries e
    where e.newsletter_opt_in
    union all
    select r.contest_id, v.buyer_email, v.created_at, 'vote pack'
    from votes v
    join rounds r on r.id = v.round_id
    where v.newsletter_opt_in and v.status = 'succeeded'
    union all
    select fv.contest_id, fv.email, fv.verified_at, 'free vote'
    from free_voters fv
    where fv.newsletter_opt_in and fv.verified_at is not null
  ) s
  group by s.contest_id, s.email;

-- Its free votes in unfinished rounds go back to their voters, who may vote
-- again that day. Same signature; the refunds are unchanged.
create or replace function disqualify_entry(p_entry_id uuid, p_reason text)
  returns table (payment_intent text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  e        entries%rowtype;
  c        contests%rowtype;
  r1       rounds%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_left   int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict e from entries where id = p_entry_id for update;
  select * into strict c from contests where id = e.contest_id for share;

  if c.status <> 'voting' then
    raise exception 'Disqualification is for a contest in voting. Before voting, reject the entry instead; once the contest is over, its results are final.'
      using errcode = 'WP400';
  end if;

  if e.status not in ('approved', 'disqualified') then
    raise exception 'Only an approved entry can be disqualified.' using errcode = 'WP400';
  end if;

  if e.status = 'approved' then
    if v_reason is null then
      raise exception 'A reason is required. It is kept with the entry.' using errcode = 'WP400';
    end if;

    -- During the Open Round the field must still fill the bracket, or
    -- close_round could not seed it a week from now.
    select * into r1 from rounds where contest_id = c.id and seq = 1;
    if r1.status in ('open', 'closed') then
      select count(*) - 1 into v_left from entries where contest_id = c.id and status = 'approved';
      if v_left < c.bracket_size then
        raise exception 'Disqualifying would leave % approved entries for a %-pet bracket.', v_left, c.bracket_size
          using errcode = 'WP400';
      end if;
    end if;

    update entries
    set status = 'disqualified',
        disqualified_at = now(),
        disqualified_by = auth.uid(),
        disqualification_reason = v_reason
    where id = e.id;
  end if;

  -- Re-runs are harmless: only counted votes change.
  update free_votes f
  set status = 'returned', voided_at = now(), voided_by = auth.uid(), voided_reason = 'pet disqualified'
  from rounds r
  where r.id = f.round_id and r.status <> 'resolved'
    and f.entry_id = e.id and f.status = 'counted';

  return query
  select v.stripe_payment_intent_id
  from votes v
  where v.entry_id = e.id and v.status = 'succeeded'
  order by v.created_at;
end $$;

-- Free voters' addresses and their normalized keys, browsers, codes and
-- reminder logs go with everything else. The votes and results stay. The
-- return type gains a count, so the function is dropped and recreated.
drop function erase_personal_data(uuid);
create function erase_personal_data(p_contest_id uuid)
  returns table (entries int, votes int, notifications int, free_voters int)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  c        contests%rowtype;
  v_ended  timestamptz;
  v_e      int;
  v_v      int;
  v_n      int;
  v_f      int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict c from contests where id = p_contest_id for update;
  if c.status <> 'complete' then
    raise exception 'Personal data can be erased once the contest is complete.' using errcode = 'WP400';
  end if;

  select max(r.resolved_at) into v_ended from rounds r where r.contest_id = c.id;
  if v_ended > now() - interval '120 days' then
    raise exception 'Personal data can be erased from %, after the 120-day chargeback window closes.',
      to_char((v_ended + interval '120 days') at time zone 'America/Chicago', 'FMMonth FMDD, YYYY')
      using errcode = 'WP400';
  end if;

  update entries e
  set owner_name = 'Erased', owner_email = 'erased@invalid', newsletter_opt_in = false
  where e.contest_id = c.id and e.owner_email <> 'erased@invalid';
  get diagnostics v_e = row_count;

  update votes v
  set buyer_email = 'erased@invalid', newsletter_opt_in = false
  from rounds r
  where r.id = v.round_id and r.contest_id = c.id and v.buyer_email <> 'erased@invalid';
  get diagnostics v_v = row_count;

  update notifications n
  set to_email = 'erased@invalid'
  from entries e
  where e.id = n.entry_id and e.contest_id = c.id and n.to_email <> 'erased@invalid';
  get diagnostics v_n = row_count;

  delete from free_voter_devices d using free_voters fv where fv.id = d.voter_id and fv.contest_id = c.id;
  delete from free_vote_challenges ch using free_voters fv where fv.id = ch.voter_id and fv.contest_id = c.id;
  delete from free_vote_reminders rm using free_voters fv where fv.id = rm.voter_id and fv.contest_id = c.id;
  update free_votes f set ip_hash = null from rounds r
  where r.id = f.round_id and r.contest_id = c.id and f.ip_hash is not null;
  update free_voters fv
  set email = 'erased@invalid', email_key = 'erased:' || fv.id,
      newsletter_opt_in = false, reminders_opt_in = false
  where fv.contest_id = c.id and fv.email <> 'erased@invalid';
  get diagnostics v_f = row_count;

  update contests set personal_data_erased_at = now() where id = c.id;

  return query select v_e, v_v, v_n, v_f;
end $$;

-- The free-vote checks. All warn: each is a judgment call for a human. The
-- thresholds are starting values to tune in the dry run, not derived from data.
create or replace function contest_health()
  returns table (check_name text, severity text, items int, detail text)
  language sql stable security definer set search_path = public
as $$
  -- Money taken for votes that do not count, and the automatic refund has not
  -- landed. Fifteen minutes is far longer than a refund normally takes.
  select 'late_refund_stuck', 'alert', count(*)::int,
         count(*) || ' late payment(s) still unrefunded after 15 minutes. Refund them in Stripe; the Health tab lists them.'
  from late_confirmations
  where confirmed_at < now() - interval '15 minutes'
  having count(*) > 0

  union all
  select 'rejected_photo_public', 'alert', count(*)::int,
         count(*) || ' rejected photo file(s) are still public. Delete them from the Health tab.'
  from rejected_photos_live
  having count(*) > 0

  union all
  -- Entrants waiting on a human. Each one is a family not yet sharing.
  select 'moderation_backlog', 'warn', count(*)::int,
         count(*) || ' entr' || case when count(*) = 1 then 'y has' else 'ies have' end
           || ' waited more than a day for moderation.'
  from entries e
  join contests c on c.id = e.contest_id
  where e.status = 'pending' and c.status = 'submissions_open'
    and e.created_at < now() - interval '24 hours'
  having count(*) > 0

  union all
  -- Past its deadline (and the settle period) but nobody has finalized it.
  select 'round_not_finalized', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' ended '
           || to_char(r.closes_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' and has not been finalized. Close it in the admin desk.'
  from rounds r
  join contests c on c.id = r.contest_id
  where r.status = 'open' and r.closes_at < now() - interval '1 hour'

  union all
  -- Submissions ended but round 1 never opened.
  select 'round_not_opened', 'warn', 1,
         'Submissions closed '
           || to_char(c.submissions_close_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' but the Open Round has not started. Finish moderation, then open it.'
  from rounds r
  join contests c on c.id = r.contest_id
  where r.seq = 1 and r.status = 'pending' and c.status = 'submissions_open'
    and c.submissions_close_at < now() - interval '1 hour'

  union all
  -- A bracket round sitting pending well after the previous one resolved.
  select 'round_not_opened', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' was due to start '
           || to_char(r.opens_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' and has not been opened.'
  from rounds r
  join contests c on c.id = r.contest_id
  join rounds prev on prev.contest_id = r.contest_id and prev.seq = r.seq - 1 and prev.status = 'resolved'
  where r.status = 'pending' and r.opens_at < now() - interval '1 hour'

  union all
  -- Buyers of a disqualified pet are owed their money. The disqualify function
  -- asks Stripe for every refund; anything still standing after 15 minutes did
  -- not go through. Re-run Disqualify on the pet to retry.
  select 'disqualified_unrefunded', 'alert', count(*)::int,
         count(*) || ' vote pack(s) for disqualified pets still unrefunded after 15 minutes. Run Disqualify again on the pet to retry.'
  from votes v
  join entries e on e.id = v.entry_id
  where e.status = 'disqualified' and v.status = 'succeeded'
    and e.disqualified_at < now() - interval '15 minutes'
  having count(*) > 0

  union all
  -- The published privacy promise: entrant and buyer emails are erased a year
  -- after the contest ends.
  select 'personal_data_due', 'warn', 1,
         c.year || ' contest ended over a year ago and its entrant and buyer emails are still stored. Erase them from the Wrap-up tab (export the newsletter list first).'
  from contests c
  where c.status = 'complete' and c.personal_data_erased_at is null
    and (select max(r.resolved_at) from rounds r where r.contest_id = c.id) < now() - interval '365 days'

  union all
  -- So nobody forgets to resume it.
  select 'free_vote_paused', 'warn', 1,
         'Free voting has been paused since '
           || to_char(c.free_vote_paused_at at time zone 'America/Chicago', 'FMHH12:MI AM')
           || '. Resume it from the Free votes tab when it is safe.'
  from contests c
  where c.free_vote_enabled and c.status = 'voting'
    and c.free_vote_paused_at < now() - interval '1 hour'

  union all
  -- One pet gaining free votes far faster than usual.
  select 'free_vote_spike', 'warn', count(*)::int,
         string_agg(w.pet_name || ' (' || w.free_last_hour || ')', ', ')
           || ' gained more than 200 free votes in the last hour. Check the Free votes tab.'
  from free_vote_pet_watch w
  where w.free_last_hour > 200
  having count(*) > 0

  union all
  -- One connection casting for many addresses. Carrier networks share
  -- connections, so this is a signal, not a verdict.
  select 'free_vote_shared_connection', 'warn', count(*)::int,
         count(*) || ' connection(s) cast free votes for more than 15 addresses in the last hour. Check the Free votes tab.'
  from free_vote_connection_watch w
  where w.voters > 15
  having count(*) > 0

  union all
  -- Code emails failing: Resend or DNS trouble, and readers cannot vote free.
  select 'free_vote_codes_failing', 'warn', count(*) filter (where ch.send_status = 'failed')::int,
         count(*) filter (where ch.send_status = 'failed') || ' of ' || count(*)
           || ' free-vote code emails failed in the last hour. Check the email provider.'
  from free_vote_challenges ch
  where ch.send_status is not null and ch.created_at > now() - interval '1 hour'
  having count(*) >= 10 and count(*) filter (where ch.send_status = 'failed') * 5 > count(*)
$$;


-- ----------------------------------------------------------------- access --
alter table free_voters          enable row level security;
alter table free_vote_challenges enable row level security;
alter table free_voter_devices   enable row level security;
alter table free_votes           enable row level security;
alter table free_vote_reminders  enable row level security;
alter table free_vote_staff_log  enable row level security;

create policy free_voters_admin_read on free_voters for select to authenticated using (is_admin());
create policy free_votes_admin_read on free_votes for select to authenticated using (is_admin());
create policy free_vote_reminders_admin_read on free_vote_reminders for select to authenticated using (is_admin());
create policy free_vote_staff_log_admin_read on free_vote_staff_log for select to authenticated using (is_admin());
-- free_vote_challenges and free_voter_devices: no policies. Not even admins
-- read codes or tokens.

revoke all on free_voters, free_vote_challenges, free_voter_devices, free_votes,
              free_vote_reminders, free_vote_staff_log from anon, authenticated;
grant select on free_voters, free_votes, free_vote_reminders, free_vote_staff_log to authenticated;

-- 0005's default privileges hand service_role full DML on new tables. The
-- definer functions write these; the reminder sweep claims and settles its
-- rows itself. free_votes is the one table no API role may write.
revoke insert, update, delete, truncate, references, trigger
  on free_votes, free_voters, free_voter_devices, free_vote_challenges, free_vote_staff_log from service_role;
revoke truncate, references, trigger on free_vote_reminders from service_role;
grant select, insert, update on free_vote_reminders to service_role;
grant select on free_voters, free_votes, free_vote_staff_log to service_role;

grant select on free_vote_daily, free_vote_pet_watch, free_vote_connection_watch to authenticated, service_role;

revoke execute on function free_vote_code_ttl(), free_vote_max_attempts(), free_vote_reminder_hour(),
  free_vote_day(timestamptz), free_vote_email(text), email_key(text), mask_email(text), free_vote_target(rounds, uuid),
  free_vote_record(uuid, uuid, uuid, text, timestamptz, text),
  free_vote_challenge(uuid, uuid, uuid, text, bytea, bytea, text, boolean, boolean),
  free_vote_challenge_sent(uuid, boolean),
  free_vote_verify(text, uuid, bytea, bytea, text),
  free_vote_cast(bytea, uuid, uuid, text),
  free_vote_device_status(bytea),
  free_vote_preferences(bytea, boolean, boolean),
  free_vote_unsubscribe(bytea),
  free_vote_reminder_queue(int),
  set_free_vote_enabled(uuid, boolean),
  set_free_vote_paused(uuid, boolean, text),
  void_free_voters(uuid[], text)
  from public, anon, authenticated;

grant execute on function
  free_vote_challenge(uuid, uuid, uuid, text, bytea, bytea, text, boolean, boolean),
  free_vote_challenge_sent(uuid, boolean),
  free_vote_verify(text, uuid, bytea, bytea, text),
  free_vote_cast(bytea, uuid, uuid, text),
  free_vote_device_status(bytea),
  free_vote_preferences(bytea, boolean, boolean),
  free_vote_unsubscribe(bytea),
  free_vote_reminder_queue(int)
  to service_role;

grant execute on function
  set_free_vote_enabled(uuid, boolean),
  set_free_vote_paused(uuid, boolean, text),
  void_free_voters(uuid[], text)
  to authenticated;

-- Recreated: restate. The replaced objects keep their grants; restated so a
-- reader of this migration sees the whole surface.
revoke execute on function erase_personal_data(uuid) from public, anon, authenticated;
grant execute on function erase_personal_data(uuid) to authenticated;
grant select on entry_round_totals to anon, authenticated, service_role;
grant execute on function close_round(uuid) to authenticated;
grant execute on function disqualify_entry(uuid, text) to authenticated;
