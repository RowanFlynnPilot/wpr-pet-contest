-- Last Chance: in a contest that switches it on, the pets that finish just
-- below the bracket line get 24 more hours. When the Open Round's clock runs
-- out, staff start Last Chance (start_last_chance, after the same 10-minute
-- settle close_round waits for). The pets in places 1 to bracket_size - 1 at
-- that moment are in, in that order. Places bracket_size to bracket_size + 4
-- (16 to 20 in a 16-pet bracket) keep voting; the one with the most Open
-- Round votes when Last Chance ends takes the last seed. Their Open Round
-- votes carry into it: this is overtime, not a new round.
--
-- Why overtime and not a round of its own: the Open Round's votes, totals,
-- results and tiebreaks are untouched, every bracket round keeps its number
-- and its name, and "totals reset every round" stays true.
--
-- The rules that keep it fair:
--   * A contest setting, on only while the contest is a draft
--     (set_last_chance_enabled): it is in the published rules.
--   * Only the pool can be voted for during Last Chance. Everyone's deadline
--     is round_deadline(round, pet): the Open Round's close, or Last Chance's
--     for a pet in its pool. vote_quote, confirm_vote (the payment's own
--     time, as always), free_vote_record and free_vote_challenge all use it.
--   * The standings at the start are snapshotted in last_chance_field, so
--     who is in, and who is in the pool, never moves.
--   * close_round refuses to close an Open Round around a Last Chance the
--     rules promised, and waits for Last Chance's end plus the settle time.
--   * If a pet above the line leaves during Last Chance, the pool's next best
--     fills that seed too.

alter table contests add column last_chance_enabled boolean not null default false;
alter table rounds add column overtime_closes_at timestamptz;
alter table rounds add constraint rounds_overtime_open_round_only
  check (overtime_closes_at is null or (seq = 1 and overtime_closes_at > closes_at));

-- The standings when Last Chance started: places 1 to bracket_size + 4.
create table last_chance_field (
  round_id  uuid not null references rounds(id) on delete cascade,
  entry_id  uuid not null references entries(id),
  place     int not null check (place > 0),
  pool      boolean not null,
  primary key (round_id, entry_id),
  unique (round_id, place)
);
alter table last_chance_field enable row level security;
create policy last_chance_field_public_read on last_chance_field for select to anon, authenticated using (true);

-- A pet's deadline in a round.
create function round_deadline(r rounds, p_entry_id uuid) returns timestamptz
  language sql stable set search_path = public, pg_temp
as $$
  select case
           when r.overtime_closes_at is not null
                and exists (select 1 from last_chance_field f
                            where f.round_id = r.id and f.entry_id = p_entry_id and f.pool)
             then r.overtime_closes_at
           else r.closes_at
         end
$$;


-- --------------------------------------------------------- staff actions --
-- On or off, while the contest is a draft: it is in the published rules.
create function set_last_chance_enabled(p_contest_id uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c contests%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  select * into strict c from contests where id = p_contest_id for update;
  if c.status <> 'draft' then
    raise exception 'Last Chance is in the published rules, so it can only be switched on or off while the contest is a draft.'
      using errcode = 'WP400';
  end if;
  update contests set last_chance_enabled = coalesce(p_enabled, false) where id = c.id;
end $$;

-- Starts Last Chance once the Open Round's clock has run out and payments
-- have settled. Returns how many pets are in the pool.
create function start_last_chance(p_round_id uuid, p_closes_at timestamptz default null) returns int
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r          rounds%rowtype;
  c          contests%rowtype;
  v_until    timestamptz;
  v_pool     int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  -- FOR UPDATE: no payment or free vote lands while the standings are taken.
  select * into strict r from rounds where id = p_round_id for update;
  select * into strict c from contests where id = r.contest_id;
  if not c.last_chance_enabled then
    raise exception 'Last Chance is off for this contest.' using errcode = 'WP400';
  end if;
  if r.kind <> 'open' or r.status <> 'open' then
    raise exception 'Last Chance follows the Open Round, while it is open.' using errcode = 'WP400';
  end if;
  if r.overtime_closes_at is not null then
    raise exception 'Last Chance has already started.' using errcode = 'WP400';
  end if;
  if now() < r.closes_at + settle_period() then
    raise exception 'The Open Round closes at %. Last Chance can start from % so payments made before the deadline can settle.',
      to_char(r.closes_at at time zone 'America/Chicago', 'FMHH12:MI a.m.'),
      to_char((r.closes_at + settle_period()) at time zone 'America/Chicago', 'FMHH12:MI a.m.')
      using errcode = 'WP400';
  end if;
  if (select count(*) from entries where contest_id = c.id and status = 'approved') <= c.bracket_size then
    raise exception 'Every approved pet already makes the bracket, so there is no Last Chance. Close the round instead.'
      using errcode = 'WP400';
  end if;
  v_until := coalesce(p_closes_at, now() + interval '24 hours');
  if v_until < now() + interval '1 hour' then
    raise exception 'Last Chance has to run at least an hour.' using errcode = 'WP400';
  end if;

  -- Exact standings, as close_round takes them: the tally rebuilt from the
  -- vote tables under the lock, ranked with the Open Round's tiebreak.
  delete from round_tally where round_id = r.id;
  insert into round_tally (round_id, entry_id, votes, amount_cents, free_votes)
  select round_id, entry_id, votes, amount_cents, free_votes from round_live_sums where round_id = r.id;

  insert into last_chance_field (round_id, entry_id, place, pool)
  select r.id, ranked.id, ranked.place, ranked.place >= c.bracket_size
  from (
    select e.id,
           row_number() over (order by coalesce(t.votes, 0) desc, e.created_at asc, e.id asc)::int as place
    from entries e
    left join entry_round_totals t on t.entry_id = e.id and t.round_id = r.id
    where e.contest_id = c.id and e.status = 'approved'
  ) ranked
  where ranked.place <= c.bracket_size + 4;
  select count(*) into v_pool from last_chance_field where round_id = r.id and pool;

  update rounds set overtime_closes_at = v_until where id = r.id;
  return v_pool;
end $$;


-- ------------------------------------------------------- replaced functions --
-- Each as its last migration defined it, with round_deadline where it read
-- closes_at (and close_round, seed_bracket as described above).

create or replace function close_round(p_round_id uuid) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r          rounds%rowtype;
  v_size     int;
  v_next_id  uuid;
  v_deadline timestamptz;
  v_lc       boolean;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict r from rounds where id = p_round_id for update;

  if r.status <> 'open' then
    raise exception 'round % is %, expected open', r.seq, r.status;
  end if;

  -- With Last Chance under way, the Open Round ends when it does.
  v_deadline := coalesce(r.overtime_closes_at, r.closes_at);
  if now() < v_deadline + settle_period() then
    raise exception 'round % closes at %. Results can be finalized from % so payments made before the deadline can settle.',
      r.seq, v_deadline, v_deadline + settle_period()
      using errcode = 'WP400';
  end if;

  -- Last Chance is in the published rules: the Open Round cannot close
  -- around it while there are pets below the line to give it to.
  if r.kind = 'open' and r.overtime_closes_at is null then
    select last_chance_enabled, bracket_size into v_lc, v_size from contests where id = r.contest_id;
    if v_lc and (select count(*) from entries where contest_id = r.contest_id and status = 'approved') > v_size then
      raise exception 'Last Chance is part of this contest''s rules. Start it from the Rounds tab, then close the round when it ends.'
        using errcode = 'WP400';
    end if;
  end if;

  update rounds set status = 'closed' where id = r.id;

  -- Nothing irreversible reads the cache: the round's tally is rebuilt from
  -- the vote tables here, under the lock that keeps any payment out.
  delete from round_tally where round_id = r.id;
  insert into round_tally (round_id, entry_id, votes, amount_cents, free_votes)
  select round_id, entry_id, votes, amount_cents, free_votes from round_live_sums where round_id = r.id;

  if r.kind = 'open' then
    select bracket_size into v_size from contests where id = r.contest_id;
    v_next_id := seed_bracket(r.id, v_size);
  else
    v_next_id := advance_bracket(r.id);
  end if;

  insert into round_results (round_id, entry_id, votes, amount_cents, free_votes)
  select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
  from entry_round_totals t
  where t.round_id = r.id;

  update rounds set status = 'resolved', resolved_at = clock_timestamp() where id = r.id;

  return v_next_id;
end $$;

create or replace function seed_bracket(p_round_id uuid, p_field_size int) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_contest_id uuid;
  v_seq        int;
  v_qualified  int;
  v_order      int[];
  v_next_id    uuid;
  v_overtime   timestamptz;
  w            record;
  i            int;
begin
  select contest_id, seq, overtime_closes_at into strict v_contest_id, v_seq, v_overtime from rounds where id = p_round_id;

  if v_overtime is null then
  with ranked as (
    select e.id,
           row_number() over (
             order by coalesce(t.votes, 0) desc, e.created_at asc, e.id asc
           ) as rank
    from entries e
    left join entry_round_totals t
      on t.entry_id = e.id and t.round_id = p_round_id
    where e.contest_id = v_contest_id and e.status = 'approved'
  )
  update entries e
  set seed = ranked.rank
  from ranked
  where e.id = ranked.id and ranked.rank <= p_field_size;
  get diagnostics v_qualified = row_count;

  else
    -- Last Chance: the pets above the line when it started keep their
    -- places, in order. The pool's best fill what is left (one seed, or more
    -- if a pet above the line has since left), by Open Round total, which
    -- includes their Last Chance votes; a tie goes to the better place at
    -- the start.
    with seeded as (
      select f.entry_id, f.place as ord
      from last_chance_field f
      join entries e on e.id = f.entry_id and e.status = 'approved'
      where f.round_id = p_round_id and not f.pool
    ),
    pool as (
      select f.entry_id,
             row_number() over (order by coalesce(t.votes, 0) desc, f.place asc) as ord
      from last_chance_field f
      join entries e on e.id = f.entry_id and e.status = 'approved'
      left join entry_round_totals t on t.entry_id = f.entry_id and t.round_id = p_round_id
      where f.round_id = p_round_id and f.pool
    ),
    qualified as (
      select entry_id, 0 as grp, ord from seeded
      union all
      select entry_id, 1, ord from pool
      where ord <= p_field_size - (select count(*) from seeded)
    ),
    ranked as (
      select entry_id as id, row_number() over (order by grp, ord) as rank from qualified
    )
    update entries e
    set seed = ranked.rank
    from ranked
    where e.id = ranked.id;
    get diagnostics v_qualified = row_count;
  end if;

  if v_qualified <> p_field_size then
    raise exception 'need % approved entries to seed the bracket, have %',
      p_field_size, v_qualified;
  end if;

  select * into w from next_round_window(p_round_id);

  insert into rounds (contest_id, seq, kind, status, opens_at, closes_at)
  values (v_contest_id, v_seq + 1, 'bracket', 'pending', w.opens_at, w.closes_at)
  returning id into v_next_id;

  v_order := bracket_seed_order(p_field_size);

  for i in 1 .. p_field_size / 2 loop
    insert into matchups (round_id, slot, entry_a_id, entry_b_id) values (
      v_next_id,
      i - 1,
      (select id from entries where contest_id = v_contest_id and seed = v_order[i * 2 - 1]),
      (select id from entries where contest_id = v_contest_id and seed = v_order[i * 2])
    );
  end loop;

  return v_next_id;
end $$;

create or replace function vote_quote(p_round_id uuid, p_entry_id uuid, p_pack_slug text)
  returns table (contest_id  uuid,
                 round_seq   int,
                 matchup_id  uuid,
                 pet_name    text,
                 pack_votes  int,
                 multiplier  int,
                 votes       int,
                 cents       int,
                 bonus_label text)
  language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  r   rounds%rowtype;
  p   vote_packs%rowtype;
  b   bonus_windows%rowtype;
  v_matchup uuid;
  v_pet     text;
begin
  select * into r from rounds where rounds.id = p_round_id;
  if not found then
    raise exception 'That round does not exist.' using errcode = 'WP400';
  end if;

  -- round_deadline: the Open Round's close, or Last Chance's for its pool.
  if r.status <> 'open' or now() < r.opens_at or now() > round_deadline(r, p_entry_id) then
    if r.status = 'open' and r.overtime_closes_at is not null and now() <= r.overtime_closes_at then
      raise exception 'Voting has closed for this pet. Only the Last Chance pets can still get votes.' using errcode = 'WP400';
    end if;
    raise exception 'Voting is closed for this round.' using errcode = 'WP400';
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

  select * into p
  from vote_packs vp
  where vp.contest_id = r.contest_id and vp.slug = p_pack_slug and vp.active;
  if not found then
    raise exception 'That vote pack is not available.' using errcode = 'WP400';
  end if;

  -- At most one row, by the no-overlap constraint.
  select * into b
  from bonus_windows bw
  where bw.contest_id = r.contest_id and now() >= bw.starts_at and now() < bw.ends_at;

  return query select r.contest_id, r.seq, v_matchup, v_pet, p.votes,
                      coalesce(b.multiplier, 1),
                      p.votes * coalesce(b.multiplier, 1),
                      p.cents,
                      b.label;
end $$;

create or replace function confirm_vote(p_payment_intent text, p_paid_at timestamptz default null)
  returns text
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v votes%rowtype;
  r rounds%rowtype;
  v_entry_status entry_status;
begin
  select * into v from votes
  where stripe_payment_intent_id = p_payment_intent
  for update;

  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;

  -- Reported late again on a redelivery, so the webhook retries a refund that
  -- failed the first time. The refund itself is idempotent.
  if v.status = 'late' then
    return 'late';
  end if;

  if v.status <> 'pending' then
    return 'duplicate';
  end if;

  -- FOR SHARE blocks while close_round holds the round FOR UPDATE, so no
  -- payment lands between the tally and the status change.
  select * into r from rounds where id = v.round_id for share;
  select status into v_entry_status from entries where id = v.entry_id for share;

  if r.status = 'open'
     and v_entry_status = 'approved'
     and coalesce(p_paid_at, clock_timestamp()) <= round_deadline(r, v.entry_id) + payment_grace() then
    update votes set status = 'succeeded', confirmed_at = clock_timestamp() where id = v.id;
    return 'confirmed';
  end if;

  update votes set status = 'late', confirmed_at = clock_timestamp() where id = v.id;
  return 'late';
end $$;

create or replace function free_vote_record(p_voter_id uuid, p_round_id uuid, p_entry_id uuid, p_via text,
                                 p_requested_at timestamptz, p_ip_hash text) returns text
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r         rounds%rowtype;
  fv        free_voters%rowtype;
  c         contests%rowtype;
  v_matchup  uuid;
  v_rows     int;
  v_deadline timestamptz;
begin
  select * into r from rounds where id = p_round_id for share;
  if not found then
    raise exception 'That round does not exist.' using errcode = 'WP400';
  end if;
  select * into strict c from contests where id = r.contest_id;

  -- The Open Round's close, or Last Chance's for a pet in its pool.
  v_deadline := round_deadline(r, p_entry_id);
  if r.status <> 'open' or now() < r.opens_at
     or (p_via = 'device' and now() > v_deadline)
     or (p_via <> 'device' and (p_requested_at > v_deadline or now() > v_deadline + payment_grace())) then
    raise exception 'The % closed at %.', round_label(r.seq, c.bracket_size),
      to_char(v_deadline at time zone 'America/Chicago', 'FMHH12:MI a.m. "on" FMMonth FMDD')
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

create or replace function free_vote_challenge(p_challenge_id uuid, p_round_id uuid, p_entry_id uuid, p_email text, p_code_hmac bytea,
                                    p_link_hash bytea, p_ip_hash text, p_newsletter boolean, p_reminders boolean)
  returns table (challenge_id uuid, expires_at timestamptz, masked_email text, pet_name text, contest_name text)
  language plpgsql security definer set search_path = public, pg_temp
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
  if r.status <> 'open' or now() < r.opens_at or now() > round_deadline(r, p_entry_id) then
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

create or replace function stale_pending_intents(p_limit int, p_entry_id uuid default null)
  returns table (payment_intent text)
  language sql stable security definer set search_path = public, pg_temp
as $$
  select v.stripe_payment_intent_id
  from votes v
  join rounds r on r.id = v.round_id
  join entries e on e.id = v.entry_id
  where v.status = 'pending' and v.canceled_at is null
    and (p_entry_id is null or v.entry_id = p_entry_id)
    and (r.status <> 'open' or now() > round_deadline(r, v.entry_id) + payment_grace() or e.status <> 'approved')
  order by v.created_at
  limit p_limit
$$;

create or replace function contest_health()
  returns table (check_name text, severity text, items int, detail text)
  language sql stable security definer set search_path = public, pg_temp
as $$
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
  select 'moderation_backlog', 'warn', count(*)::int,
         count(*) || ' entr' || case when count(*) = 1 then 'y has' else 'ies have' end
           || ' waited more than a day for moderation.'
  from entries e
  join contests c on c.id = e.contest_id
  where e.status = 'pending' and c.status = 'submissions_open'
    and e.created_at < now() - interval '24 hours'
  having count(*) > 0

  union all
  select 'round_not_finalized', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' ended '
           || to_char(coalesce(r.overtime_closes_at, r.closes_at) at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || case when c.last_chance_enabled and r.kind = 'open' and r.overtime_closes_at is null
                   then ' and Last Chance has not started. Start it in the admin desk.'
                   else ' and has not been finalized. Close it in the admin desk.' end
  from rounds r
  join contests c on c.id = r.contest_id
  -- During Last Chance the Open Round ends when Last Chance does.
  where r.status = 'open' and coalesce(r.overtime_closes_at, r.closes_at) < now() - interval '1 hour'

  union all
  select 'round_not_opened', 'warn', 1,
         'Submissions closed '
           || to_char(c.submissions_close_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' but the Open Round has not started. Finish moderation, then open it.'
  from rounds r
  join contests c on c.id = r.contest_id
  where r.seq = 1 and r.status = 'pending' and c.status = 'submissions_open'
    and c.submissions_close_at < now() - interval '1 hour'

  union all
  select 'round_not_opened', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' was due to start '
           || to_char(r.opens_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' and has not been opened.'
  from rounds r
  join contests c on c.id = r.contest_id
  join rounds prev on prev.contest_id = r.contest_id and prev.seq = r.seq - 1 and prev.status = 'resolved'
  where r.status = 'pending' and r.opens_at < now() - interval '1 hour'

  union all
  select 'disqualified_unrefunded', 'alert', count(*)::int,
         count(*) || ' vote pack(s) for disqualified pets still unrefunded after 15 minutes. Run Disqualify again on the pet to retry.'
  from votes v
  join entries e on e.id = v.entry_id
  where e.status = 'disqualified' and v.status = 'succeeded'
    and e.disqualified_at < now() - interval '15 minutes'
  having count(*) > 0

  union all
  select 'personal_data_due', 'warn', 1,
         c.year || ' contest ended over a year ago and its entrant and buyer emails are still stored. Erase them from the Wrap-up tab (export the newsletter list first).'
  from contests c
  where c.status = 'complete' and c.personal_data_erased_at is null
    and (select max(r.resolved_at) from rounds r where r.contest_id = c.id) < now() - interval '365 days'

  union all
  select 'free_vote_paused', 'warn', 1,
         'Free voting has been paused since '
           || to_char(c.free_vote_paused_at at time zone 'America/Chicago', 'FMHH12:MI AM')
           || '. Resume it from the Free votes tab when it is safe.'
  from contests c
  where c.free_vote_enabled and c.status = 'voting'
    and c.free_vote_paused_at < now() - interval '1 hour'

  union all
  select 'free_vote_spike', 'warn', count(*)::int,
         string_agg(w.pet_name || ' (' || w.free_last_hour || ')', ', ')
           || ' gained more than 200 free votes in the last hour. Check the Free votes tab.'
  from free_vote_pet_watch w
  where w.free_last_hour > 200
  having count(*) > 0

  union all
  select 'free_vote_shared_connection', 'warn', count(*)::int,
         count(*) || ' connection(s) cast free votes for more than 15 addresses in the last hour. Check the Free votes tab.'
  from free_vote_connection_watch w
  where w.voters > 15
  having count(*) > 0

  union all
  select 'free_vote_codes_failing', 'warn', count(*) filter (where ch.send_status = 'failed')::int,
         count(*) filter (where ch.send_status = 'failed') || ' of ' || count(*)
           || ' free-vote code emails failed in the last hour. Check the email provider.'
  from free_vote_challenges ch
  where ch.send_status is not null and ch.created_at > now() - interval '1 hour'
  having count(*) >= 10 and count(*) filter (where ch.send_status = 'failed') * 5 > count(*)

  union all
  -- The live tally cache must equal the vote tables. close_round rebuilds
  -- its round regardless; this says so sooner.
  select 'tally_drift', 'alert', count(*)::int,
         count(*) || ' live tally row(s) differ from the vote tables. Rebuild the round''s tally (rebuild_round_tally) and tell the developer.'
  from (
    select coalesce(c.round_id, l.round_id) as round_id
    from (select t.* from round_tally t join rounds r on r.id = t.round_id and r.status <> 'resolved') c
    full outer join (select s.* from round_live_sums s join rounds r on r.id = s.round_id and r.status <> 'resolved') l
      on l.round_id = c.round_id and l.entry_id = c.entry_id
    where coalesce(c.votes, 0) <> coalesce(l.votes, 0)
       or coalesce(c.free_votes, 0) <> coalesce(l.free_votes, 0)
       or coalesce(c.amount_cents, 0) <> coalesce(l.amount_cents, 0)
  ) d
  having count(*) > 0
$$;

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('entry_received', 'entry_approved', 'entry_rejected', 'advanced', 'eliminated', 'champion',
                  'nurture_ready', 'nurture_open', 'nurture_halfway', 'nurture_last_day',
                  'nurture_matchup_last_day', 'nurture_thanks',
                  'club_100', 'club_500', 'club_1000', 'club_5000', 'last_chance'));

-- notification_queue: as 0028's, plus the Last Chance note.
create or replace function notification_queue(p_limit int default 50)
  returns table (kind             text,
                 entry_id         uuid,
                 round_id         uuid,
                 to_email         citext,
                 owner_name       text,
                 pet_name         text,
                 contest_name     text,
                 round_name       text,
                 opponent_name    text,
                 closes_at        timestamptz,
                 rejection_reason text,
                 raised_cents     bigint,
                 my_votes         int,
                 rank             int,
                 field_size       int,
                 cut_margin       int,
                 opponent_votes   int,
                 goal_votes       int,
                 owner_token      uuid,
                 champion_name    text,
                 opens_at         timestamptz,
                 -- The matchup an advancement or matchup-day note is about,
                 -- for the two-pet share page.
                 matchup_id       uuid,
                 -- The pet's photo (its thumbnail when there is one), for the
                 -- approval and club emails. Public once the entry is approved.
                 photo_path       text)
  language sql stable security definer set search_path = public, pg_temp
as $$
  with resolved as (
    select r.*, c.bracket_size, c.name as contest_name
    from rounds r
    join contests c on c.id = r.contest_id
    where r.status = 'resolved' and r.resolved_at > now() - interval '3 days'
  ),
  -- Open Round standings, for the halfway and last-day emails.
  standings as (
    select e.id as entry_id, r.id as round_id, c.bracket_size,
           coalesce(t.votes, 0)::int as votes,
           row_number() over (partition by c.id order by coalesce(t.votes, 0) desc, e.created_at asc)::int as rank,
           count(*) over (partition by c.id)::int as field_size
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r on r.contest_id = c.id and r.seq = 1 and r.status = 'open'
    left join entry_round_totals t on t.round_id = r.id and t.entry_id = e.id
    where e.status = 'approved'
  ),
  cut as (
    select s.*,
           (select x.votes from standings x where x.round_id = s.round_id and x.rank = s.bracket_size) as last_in,
           (select x.votes from standings x where x.round_id = s.round_id and x.rank = s.bracket_size + 1) as first_out
    from standings s
  ),
  -- Each approved pet's votes over the whole contest, every round that
  -- has opened, for the club notes: the same sum the pet page shows.
  contest_totals as (
    select e.id as entry_id, sum(t.votes)::int as votes
    from entries e
    join rounds r on r.contest_id = e.contest_id and r.status <> 'pending'
    join entry_round_totals t on t.round_id = r.id and t.entry_id = e.id
    where e.status = 'approved'
    group by e.id
  ),
  owed as (
    select 'entry_received' as kind, e.id as entry_id, null::uuid as round_id,
           null::text as round_name, null::text as opponent_name,
           c.submissions_close_at as closes_at, 1 as priority, e.created_at as since,
           null::int as my_votes, null::int as rank, null::int as field_size, null::int as cut_margin,
           null::int as opponent_votes, null::text as champion_name, null::timestamptz as opens_at, null::uuid as matchup_id
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'pending' and e.created_at > now() - interval '1 day'

    union all
    select 'entry_approved', e.id, null, null, null, null, 2, e.moderated_at,
           null, null, null, null, null, null, null, null
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'approved'
      and c.status in ('submissions_open', 'voting')
      and not exists (select 1 from rounds r1
                      where r1.contest_id = c.id and r1.seq = 1 and r1.status = 'resolved')

    union all
    select 'entry_rejected', e.id, null, null, null, null, 2, e.moderated_at,
           null, null, null, null, null, null, null, null
    from entries e
    where e.status = 'rejected' and e.moderated_at > now() - interval '7 days'

    union all
    select 'advanced', side.entry_id, n.id, round_label(n.seq, rs.bracket_size),
           opp.pet_name, n.closes_at, 3, rs.resolved_at,
           null, null, null, null, null, null, n.opens_at, m.id
    from resolved rs
    join rounds n on n.contest_id = rs.contest_id and n.seq = rs.seq + 1
                 and n.status in ('pending', 'open')
    join matchups m on m.round_id = n.id
    cross join lateral (values (m.entry_a_id, m.entry_b_id),
                               (m.entry_b_id, m.entry_a_id)) as side(entry_id, opponent_id)
    join entries opp on opp.id = side.opponent_id

    union all
    select 'eliminated', e.id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 4, rs.resolved_at,
           null, null, null, null, null, null, null, null
    from resolved rs
    join entries e on e.contest_id = rs.contest_id
    where rs.kind = 'open' and e.status = 'approved' and e.seed is null

    union all
    select 'eliminated',
           case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end,
           rs.id, round_label(rs.seq, rs.bracket_size),
           w.pet_name, null, 4, rs.resolved_at,
           null, null, null, null, null, null, null, null
    from resolved rs
    join matchups m on m.round_id = rs.id and m.winner_entry_id is not null
    join entries w on w.id = m.winner_entry_id
    where rs.kind = 'bracket'

    union all
    select 'champion', m.winner_entry_id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 3, rs.resolved_at,
           null, null, null, null, null, null, null, null
    from resolved rs
    join contests c on c.id = rs.contest_id and c.status = 'complete'
    join matchups m on m.round_id = rs.id
    where rs.kind = 'bracket'
      and not exists (select 1 from rounds n where n.contest_id = rs.contest_id and n.seq = rs.seq + 1)

    -- N1: a day after approval, while voting is still a day or more away.
    union all
    select 'nurture_ready', e.id, null, null, null, r1.opens_at, 5, e.moderated_at + interval '24 hours',
           null, null, null, null, null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id and c.status = 'submissions_open'
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'pending'
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and r1.opens_at - e.moderated_at > interval '24 hours'
      and now() >= e.moderated_at + interval '24 hours'
      and now() < r1.opens_at

    -- N2: the Open Round's first two days.
    union all
    select 'nurture_open', e.id, r1.id, round_label(1, c.bracket_size), null, r1.closes_at, 5, r1.opens_at,
           null, null, null, null, null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'open'
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= r1.opens_at and now() < r1.opens_at + interval '2 days'

    -- N3: 7 a.m. on day 4 of the Open Round, with the standings.
    union all
    select 'nurture_halfway', e.id, r1.id, round_label(1, c.bracket_size), null, r1.closes_at, 5,
           chicago_morning(r1.opens_at + interval '3 days'),
           k.votes, k.rank, k.field_size,
           case when k.rank <= k.bracket_size then k.votes - coalesce(k.first_out, 0)
                else -(coalesce(k.last_in, 0) - k.votes + 1) end,
           null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'open'
    join cut k on k.entry_id = e.id and k.round_id = r1.id
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= chicago_morning(r1.opens_at + interval '3 days')
      and chicago_morning(r1.opens_at + interval '3 days') < r1.closes_at - interval '12 hours'
      and now() < r1.closes_at

    -- N4: 7 a.m. on the Open Round's closing day.
    union all
    select 'nurture_last_day', e.id, r1.id, round_label(1, c.bracket_size), null, r1.closes_at, 5,
           chicago_morning(r1.closes_at),
           k.votes, k.rank, k.field_size,
           case when k.rank <= k.bracket_size then k.votes - coalesce(k.first_out, 0)
                else -(coalesce(k.last_in, 0) - k.votes + 1) end,
           null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'open'
    join cut k on k.entry_id = e.id and k.round_id = r1.id
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= chicago_morning(r1.closes_at) and now() < r1.closes_at

    -- N5: 7 a.m. on a bracket round's closing day, for the pets in it.
    union all
    select 'nurture_matchup_last_day', e.id, rb.id, round_label(rb.seq, c.bracket_size), opp.pet_name, rb.closes_at, 5,
           chicago_morning(rb.closes_at),
           coalesce(tm.votes, 0)::int, null, null, null, coalesce(topp.votes, 0)::int, null, rb.opens_at, m.id
    from entries e
    join contests c on c.id = e.contest_id
    join rounds rb on rb.contest_id = c.id and rb.kind = 'bracket' and rb.status = 'open'
    join matchups m on m.round_id = rb.id and e.id in (m.entry_a_id, m.entry_b_id)
    join entries opp on opp.id = case when m.entry_a_id = e.id then m.entry_b_id else m.entry_a_id end
                    and opp.status = 'approved'
    left join entry_round_totals tm on tm.round_id = rb.id and tm.entry_id = e.id
    left join entry_round_totals topp on topp.round_id = rb.id and topp.entry_id = opp.id
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= chicago_morning(rb.closes_at) and now() < rb.closes_at

    -- N6: 36 hours after the final, to everyone but the champion.
    union all
    select 'nurture_thanks', e.id, null, null, null, null, 5, rf.resolved_at + interval '36 hours',
           null, null, null, null, null, w.pet_name, null, null
    from entries e
    join contests c on c.id = e.contest_id and c.status = 'complete'
    join rounds rf on rf.contest_id = c.id and rf.kind = 'bracket' and rf.status = 'resolved'
                  and not exists (select 1 from rounds n where n.contest_id = c.id and n.seq = rf.seq + 1)
    join matchups fm on fm.round_id = rf.id and fm.winner_entry_id is not null
    join entries w on w.id = fm.winner_entry_id
    where e.status = 'approved' and e.nurture_opt_out_at is null and e.id <> fm.winner_entry_id
      and now() >= rf.resolved_at + interval '36 hours' and now() < rf.resolved_at + interval '10 days'

    -- Last Chance (0032): to each pool pet's owner, once, as it starts. About
    -- the entry itself, like an advancement, so it goes whatever the tips
    -- opt-out says. rank is the place at the start, field_size the pool's
    -- size, cut_margin the votes behind the pool's leader (0 when leading).
    union all
    select 'last_chance', e.id, r1.id, 'Last Chance', null, r1.overtime_closes_at, 3, r1.closes_at,
           coalesce(t.votes, 0)::int, f.place,
           (select count(*)::int from last_chance_field p where p.round_id = r1.id and p.pool),
           greatest(0, (select max(coalesce(tl.votes, 0)) from last_chance_field p
                        left join entry_round_totals tl on tl.round_id = r1.id and tl.entry_id = p.entry_id
                        where p.round_id = r1.id and p.pool) - coalesce(t.votes, 0))::int,
           null, null, null, null
    from last_chance_field f
    join rounds r1 on r1.id = f.round_id and r1.status = 'open' and r1.overtime_closes_at > now()
    join entries e on e.id = f.entry_id
    left join entry_round_totals t on t.round_id = r1.id and t.entry_id = e.id
    where f.pool and e.status = 'approved'

    -- Milestone clubs (lib/milestones.js on the site): a note at 100, 500,
    -- 1,000 and 5,000 votes over the contest, while voting runs. Only the
    -- highest club reached is owed, and never a lower one after a higher
    -- one went (email switched on late, or a big night), so a pet hears
    -- at most four times. A tips-style note: an owner who stopped the tips
    -- gets none.
    union all
    select 'club_' || top.tier, e.id, null, null, null, null, 5, now(),
           ct.votes, null, null, null, null, null, null, null
    from entries e
    join contests c on c.id = e.contest_id and c.status = 'voting'
    join contest_totals ct on ct.entry_id = e.id
    cross join lateral (
      select max(x) as tier from unnest(array[100, 500, 1000, 5000]) as x where x <= ct.votes
    ) top
    where e.status = 'approved' and e.nurture_opt_out_at is null and top.tier is not null
      and not exists (select 1 from notifications n
                      where n.entry_id = e.id and n.kind like 'club\_%'
                        and substring(n.kind from 6)::int >= top.tier)
  )
  select o.kind, e.id, o.round_id, e.owner_email, e.owner_name, e.pet_name,
         c.name, o.round_name, o.opponent_name, o.closes_at, e.rejection_reason,
         coalesce(s.shelter_cents, 0) + coalesce(s.match_cents, 0),
         o.my_votes, o.rank, o.field_size, o.cut_margin, o.opponent_votes,
         e.goal_votes, e.owner_token, o.champion_name, o.opens_at, o.matchup_id,
         coalesce(e.thumb_path, e.photo_path)
  from owed o
  join entries e  on e.id = o.entry_id
  join contests c on c.id = e.contest_id
  left join contest_stats s on s.contest_id = c.id
  where not exists (
    select 1 from notifications x
    where x.kind = o.kind and x.entry_id = o.entry_id
      and x.round_id is not distinct from o.round_id
  )
    -- A pet no longer in the contest hears from a person, not a template.
    and (o.kind in ('entry_received', 'entry_rejected') or e.status = 'approved')
  order by o.priority, o.since
  limit p_limit
$$;


-- ------------------------------------------------------------------ access --
grant select on last_chance_field to anon, authenticated, service_role;
revoke execute on function round_deadline(rounds, uuid) from public, anon, authenticated;
revoke execute on function set_last_chance_enabled(uuid, boolean), start_last_chance(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function set_last_chance_enabled(uuid, boolean), start_last_chance(uuid, timestamptz) to authenticated;
-- Replaced: restated.
revoke execute on function close_round(uuid), seed_bracket(uuid, int), vote_quote(uuid, uuid, text),
  confirm_vote(text, timestamptz),
  free_vote_record(uuid, uuid, uuid, text, timestamptz, text),
  free_vote_challenge(uuid, uuid, uuid, text, bytea, bytea, text, boolean, boolean),
  stale_pending_intents(int, uuid), contest_health()
  from public, anon, authenticated;
grant execute on function close_round(uuid) to authenticated;
grant execute on function vote_quote(uuid, uuid, text), confirm_vote(text, timestamptz),
  free_vote_challenge(uuid, uuid, uuid, text, bytea, bytea, text, boolean, boolean)
  to service_role;
grant execute on function stale_pending_intents(int, uuid), contest_health() to service_role;
revoke execute on function notification_queue(int) from public, anon, authenticated;
grant execute on function notification_queue(int) to service_role;
