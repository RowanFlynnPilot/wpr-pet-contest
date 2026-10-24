-- Four ways to bring people back, from the campaign kit (docs/campaign):
--
--   1. Owner goals: "Biscuit's goal: 300 votes", set by the owner from a
--      tokenized link in the approval email. Public, like the pet's name.
--   2. Buyer notes: "tell me when Biscuit plays again", an unchecked box at
--      checkout; one email per bracket round, only to buyers who asked.
--   3. Entrant nurture emails: get ready, voting is open, halfway, last day,
--      each matchup's last day, thank you. Six more kinds on the existing
--      notification queue, each with an unsubscribe.
--   4. Sponsor matches: a business matches vote-pack sales 1:1 in a window,
--      up to a cap. New money for the shelters, passed through the payout;
--      vote counts are untouched (that is what bonus windows are for).
--
-- Nothing here changes who can read what: votes and the new buyer table
-- stay unreadable by anon, and the only public additions are a pet's goal
-- and the match windows themselves.

-- ------------------------------------------------------------ owner goals --
-- The token in the approval email proves the owner. It lets them set a goal
-- and stop the tips emails, nothing more, so a uuid is enough.
alter table entries
  add column owner_token        uuid not null default gen_random_uuid(),
  add column goal_votes         int check (goal_votes is null or goal_votes between 1 and 100000),
  add column nurture_opt_out_at timestamptz;

grant select (goal_votes) on entries to anon;

create function set_entry_goal(p_entry_id uuid, p_token uuid, p_goal int) returns int
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  e entries%rowtype;
  c contests%rowtype;
begin
  select * into e from entries where id = p_entry_id and owner_token = p_token for update;
  if not found then
    raise exception 'That link is not valid.' using errcode = 'WP400';
  end if;
  if e.status <> 'approved' then
    raise exception 'Only a pet in the contest can have a goal.' using errcode = 'WP400';
  end if;
  select * into strict c from contests where id = e.contest_id;
  if c.status = 'complete' then
    raise exception 'The contest is over.' using errcode = 'WP400';
  end if;
  update entries set goal_votes = p_goal where id = e.id;
  return p_goal;
end $$;

create function entrant_opt_out(p_entry_id uuid, p_token uuid) returns boolean
  language sql security definer set search_path = public, pg_temp
as $$
  with v as (
    update entries set nurture_opt_out_at = coalesce(nurture_opt_out_at, now())
    where id = p_entry_id and owner_token = p_token
    returning 1
  )
  select exists (select 1 from v)
$$;


-- ------------------------------------------------------------ buyer notes --
alter table votes add column plays_again_opt_in boolean not null default false;

-- Same function, one more box. Callers passing five or six arguments keep
-- working. Dropped and recreated because the signature changes; re-granted.
drop function create_pending_vote(uuid, uuid, text, text, text, boolean);
create function create_pending_vote(
  p_round_id            uuid,
  p_entry_id            uuid,
  p_pack_slug           text,
  p_buyer_email         text,
  p_payment_intent      text,
  p_newsletter_opt_in   boolean default false,
  p_plays_again_opt_in  boolean default false
) returns table (vote_id uuid, votes int, cents int, multiplier int)
  language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  q    record;
  v_id uuid;
begin
  select * into strict q from vote_quote(p_round_id, p_entry_id, p_pack_slug);

  insert into votes (round_id, entry_id, matchup_id, quantity, amount_cents,
                     buyer_email, stripe_payment_intent_id, pack_slug,
                     bonus_multiplier, newsletter_opt_in, plays_again_opt_in)
  values (p_round_id, p_entry_id, q.matchup_id, q.votes, q.cents,
          p_buyer_email, p_payment_intent, p_pack_slug,
          q.multiplier, coalesce(p_newsletter_opt_in, false), coalesce(p_plays_again_opt_in, false))
  returning id into v_id;

  return query select v_id, q.votes, q.cents, q.multiplier;
end $$;

-- One row per buyer per round: the send, and the unsubscribe token for it.
create table buyer_notices (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null,
  round_id    uuid not null references rounds(id) on delete cascade,
  kind        text not null check (kind in ('round', 'final')),   -- a round opening, or the final decided
  unsub_hash  bytea not null unique,
  status      text not null check (status in ('pending', 'sent', 'failed')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now(),
  unique (email, round_id, kind)
);
alter table buyer_notices enable row level security;
create policy buyer_notices_admin_read on buyer_notices for select to authenticated using ((select is_admin()));
grant select on buyer_notices to authenticated;
grant select, insert, update, delete on buyer_notices to service_role;

-- Who is owed a note, now that a bracket round has opened (or the final has
-- been decided): every buyer who ticked the box for a pet that plays again,
-- whose run just ended, or who is the champion. One row per buyer per round,
-- covering all their pets. A purchase enrolls only once credited, so a late,
-- refunded or disputed payment never does.
create function buyer_notice_queue(p_limit int default 50)
  returns table (email         citext,
                 contest_id    uuid,
                 contest_name  text,
                 round_id      uuid,
                 round_name    text,
                 closes_at     timestamptz,
                 is_final      boolean,
                 playing       jsonb,
                 ended         jsonb,
                 champion      jsonb,
                 raised_cents  bigint)
  language sql stable security definer set search_path = public, pg_temp
as $$
  with opted as (
    select distinct r.contest_id, v.buyer_email as email, v.entry_id
    from votes v
    join rounds r on r.id = v.round_id
    where v.status = 'succeeded' and v.plays_again_opt_in
  ),
  events as (
    -- A bracket round that opened in the last three days.
    select rb.contest_id, rb.id as round_id, rb.seq, false as is_final, rb.closes_at, c.bracket_size, c.name as contest_name
    from rounds rb
    join contests c on c.id = rb.contest_id
    where rb.kind = 'bracket' and rb.status = 'open' and now() >= rb.opens_at and rb.opens_at > now() - interval '3 days'
    union all
    -- The final, decided in the last three days.
    select rf.contest_id, rf.id, rf.seq, true, rf.closes_at, c.bracket_size, c.name
    from rounds rf
    join contests c on c.id = rf.contest_id
    where rf.kind = 'bracket' and rf.status = 'resolved' and c.status = 'complete'
      and rf.resolved_at > now() - interval '3 days'
      and not exists (select 1 from rounds n where n.contest_id = rf.contest_id and n.seq = rf.seq + 1)
  ),
  per as (
    select ev.*, o.email, e.id as entry_id, e.pet_name
    from events ev
    join opted o on o.contest_id = ev.contest_id
    join entries e on e.id = o.entry_id and e.status = 'approved'
  ),
  shaped as (
    select p.email, p.contest_id, p.contest_name, p.round_id, round_label(p.seq, p.bracket_size) as round_name,
           p.closes_at, p.is_final,
           -- Plays again: in a matchup of the round that just opened.
           jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'pet', p.pet_name, 'opponent', opp.pet_name) order by p.pet_name)
             filter (where not p.is_final and m.id is not null) as playing,
           -- The run ended: lost the previous round (or the final).
           jsonb_agg(jsonb_build_object('pet', p.pet_name, 'opponent', lopp.pet_name,
                                        'round', round_label(case when p.is_final then p.seq else p.seq - 1 end, p.bracket_size))
                     order by p.pet_name)
             filter (where lm.id is not null and lm.winner_entry_id <> p.entry_id) as ended,
           jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'pet', p.pet_name, 'opponent', lopp.pet_name) order by p.pet_name)
             filter (where p.is_final and lm.id is not null and lm.winner_entry_id = p.entry_id) as champion
    from per p
    left join matchups m on m.round_id = p.round_id and not p.is_final and p.entry_id in (m.entry_a_id, m.entry_b_id)
    left join entries opp on opp.id = case when m.entry_a_id = p.entry_id then m.entry_b_id else m.entry_a_id end
    left join rounds prev on prev.contest_id = p.contest_id and prev.seq = case when p.is_final then p.seq else p.seq - 1 end
    left join matchups lm on lm.round_id = prev.id and p.entry_id in (lm.entry_a_id, lm.entry_b_id) and lm.winner_entry_id is not null
    left join entries lopp on lopp.id = case when lm.entry_a_id = p.entry_id then lm.entry_b_id else lm.entry_a_id end
    group by p.email, p.contest_id, p.contest_name, p.round_id, p.seq, p.bracket_size, p.closes_at, p.is_final
  )
  select s.email, s.contest_id, s.contest_name, s.round_id, s.round_name, s.closes_at, s.is_final,
         coalesce(s.playing, '[]'::jsonb), coalesce(s.ended, '[]'::jsonb), coalesce(s.champion, '[]'::jsonb),
         coalesce(st.shelter_cents, 0)
  from shaped s
  left join contest_stats st on st.contest_id = s.contest_id
  where (s.playing is not null or s.ended is not null or s.champion is not null)
    and not exists (select 1 from buyer_notices bn
                    where bn.email = s.email and bn.round_id = s.round_id
                      and bn.kind = case when s.is_final then 'final' else 'round' end)
  order by s.closes_at, s.email
  limit p_limit
$$;

-- From the unsubscribe link in a buyer note: every box this address ticked
-- in that contest comes off.
create function buyer_notice_unsubscribe(p_unsub_hash bytea) returns boolean
  language sql security definer set search_path = public, pg_temp
as $$
  with target as (
    select bn.email, r.contest_id
    from buyer_notices bn join rounds r on r.id = bn.round_id
    where bn.unsub_hash = p_unsub_hash
  ), v as (
    update votes set plays_again_opt_in = false
    from rounds r, target t
    where r.id = votes.round_id and r.contest_id = t.contest_id and votes.buyer_email = t.email
    returning 1
  )
  select exists (select 1 from target)
$$;


-- -------------------------------------------------------- sponsor matches --
-- "Example Pet Supply matches every vote pack from 6 to 7 p.m., up to $500."
-- Matched money is the sponsor's own gift to the shelters, collected by WPR
-- and passed through the payout. It never changes a vote count.
create table sponsor_matches (
  id           uuid primary key default gen_random_uuid(),
  contest_id   uuid not null references contests(id) on delete cascade,
  sponsor_name text not null,
  sponsor_url  text,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  ratio        numeric(4, 2) not null default 1 check (ratio > 0 and ratio <= 3),
  cap_cents    bigint not null check (cap_cents > 0),
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint sponsor_matches_no_overlap
    exclude using gist (contest_id with =, tstzrange(starts_at, ends_at) with &&)
);
alter table sponsor_matches enable row level security;
create policy sponsor_matches_public_read on sponsor_matches for select to anon, authenticated using (true);
create policy sponsor_matches_admin on sponsor_matches for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));
grant select on sponsor_matches to anon, authenticated, service_role;
grant insert, update, delete on sponsor_matches to authenticated;

-- What each match has earned: the ratio times net sales whose checkout began
-- inside the window, up to the cap. A refund takes its sale out of the match.
create function sponsor_match_cents(p_contest_id uuid) returns bigint
  language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(sum(least(m.cap_cents, floor(m.ratio * s.net_cents)::bigint)), 0)::bigint
  from sponsor_matches m
  cross join lateral (
    select coalesce(sum(v.amount_cents - v.refunded_cents), 0)::bigint as net_cents
    from votes v
    join rounds r on r.id = v.round_id
    where r.contest_id = m.contest_id and v.status = 'succeeded'
      and v.created_at >= m.starts_at and v.created_at < m.ends_at
  ) s
  where m.contest_id = p_contest_id
$$;

-- match_cents appended. shelter_cents stays the share of sales, so every
-- reader of it keeps meaning what it meant; the counter adds the two.
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
          where fr.contest_id = c.id and f.status = 'counted')::int as free_votes,
         sponsor_match_cents(c.id) as match_cents
  from contests c
  left join rounds r on r.contest_id = c.id
  left join votes v  on v.round_id = r.id and v.status = 'succeeded'
  where c.status <> 'draft'
  group by c.id;

-- The statement gains the match as its own line; the shelters split the
-- pool plus the match.
create or replace view payout_statement with (security_invoker = true) as
  select c.id   as contest_id,
         c.year,
         c.name,
         c.status,
         c.beneficiary_split_pct,
         count(v.id) filter (where v.status = 'succeeded')::int as purchases,
         coalesce(sum(v.amount_cents) filter (where v.status in ('succeeded', 'refunded', 'late', 'disputed')), 0)::bigint as sales_cents,
         coalesce(sum(case when v.status in ('refunded', 'late') then v.amount_cents
                           when v.status = 'succeeded' then v.refunded_cents
                           else 0 end), 0)::bigint as refunded_cents,
         coalesce(sum(v.amount_cents) filter (where v.status = 'disputed'), 0)::bigint as disputed_cents,
         coalesce(sum(v.amount_cents - v.refunded_cents) filter (where v.status = 'succeeded'), 0)::bigint as net_cents,
         (coalesce(sum(v.amount_cents - v.refunded_cents) filter (where v.status = 'succeeded'), 0)
           * c.beneficiary_split_pct / 100)::bigint as shelter_pool_cents,
         sponsor_match_cents(c.id) as match_cents
  from contests c
  left join rounds r on r.contest_id = c.id
  left join votes v  on v.round_id = r.id
  group by c.id;

create or replace view shelter_payouts with (security_invoker = true) as
  with s as (
    select sh.*,
           sum(sh.payout_weight) over (partition by sh.contest_id) as total_weight,
           row_number() over (partition by sh.contest_id order by sh.payout_weight desc, sh.name, sh.id) as rank
    from shelters sh
  ),
  shares as (
    select s.contest_id, s.id as shelter_id, s.name, s.url, s.payout_weight, s.rank,
           floor((p.shelter_pool_cents + p.match_cents) * s.payout_weight::numeric / s.total_weight)::bigint as floor_cents,
           p.shelter_pool_cents + p.match_cents as pool_cents
    from s join payout_statement p on p.contest_id = s.contest_id
  )
  select contest_id, shelter_id, name, url, payout_weight,
         (floor_cents + case when rank = 1
                             then pool_cents - sum(floor_cents) over (partition by contest_id)
                             else 0 end)::bigint as amount_cents
  from shares;


-- ----------------------------------------------------- the nurture emails --
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('entry_received', 'entry_approved', 'entry_rejected', 'advanced', 'eliminated', 'champion',
                  'nurture_ready', 'nurture_open', 'nurture_halfway', 'nurture_last_day',
                  'nurture_matchup_last_day', 'nurture_thanks'));

-- 7 a.m. Central on the day a moment falls on: when the "last day" emails go.
create function chicago_morning(p_at timestamptz) returns timestamptz
  language sql stable set search_path = public, pg_temp
as $$
  select ((p_at at time zone 'America/Chicago')::date::timestamp + interval '7 hours') at time zone 'America/Chicago'
$$;

-- The queue, with the nurture kinds and the standings they quote. As 0017,
-- plus: nurture_ready (24 hours after approval while voting is still a day
-- or more off), nurture_open (the Open Round's first two days),
-- nurture_halfway (7 a.m. on day 4), nurture_last_day (7 a.m. on the closing
-- day), nurture_matchup_last_day (7 a.m. on each bracket round's closing day,
-- for the pets in it) and nurture_thanks (36 hours after the final, to
-- everyone but the champion). An owner who opted out gets none of them; the
-- transactional kinds still send.
drop function notification_queue(int);
create function notification_queue(p_limit int default 50)
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
                 opens_at         timestamptz)
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
  owed as (
    select 'entry_received' as kind, e.id as entry_id, null::uuid as round_id,
           null::text as round_name, null::text as opponent_name,
           c.submissions_close_at as closes_at, 1 as priority, e.created_at as since,
           null::int as my_votes, null::int as rank, null::int as field_size, null::int as cut_margin,
           null::int as opponent_votes, null::text as champion_name, null::timestamptz as opens_at
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'pending' and e.created_at > now() - interval '1 day'

    union all
    select 'entry_approved', e.id, null, null, null, null, 2, e.moderated_at,
           null, null, null, null, null, null, null
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'approved'
      and c.status in ('submissions_open', 'voting')
      and not exists (select 1 from rounds r1
                      where r1.contest_id = c.id and r1.seq = 1 and r1.status = 'resolved')

    union all
    select 'entry_rejected', e.id, null, null, null, null, 2, e.moderated_at,
           null, null, null, null, null, null, null
    from entries e
    where e.status = 'rejected' and e.moderated_at > now() - interval '7 days'

    union all
    select 'advanced', side.entry_id, n.id, round_label(n.seq, rs.bracket_size),
           opp.pet_name, n.closes_at, 3, rs.resolved_at,
           null, null, null, null, null, null, n.opens_at
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
           null, null, null, null, null, null, null
    from resolved rs
    join entries e on e.contest_id = rs.contest_id
    where rs.kind = 'open' and e.status = 'approved' and e.seed is null

    union all
    select 'eliminated',
           case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end,
           rs.id, round_label(rs.seq, rs.bracket_size),
           w.pet_name, null, 4, rs.resolved_at,
           null, null, null, null, null, null, null
    from resolved rs
    join matchups m on m.round_id = rs.id and m.winner_entry_id is not null
    join entries w on w.id = m.winner_entry_id
    where rs.kind = 'bracket'

    union all
    select 'champion', m.winner_entry_id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 3, rs.resolved_at,
           null, null, null, null, null, null, null
    from resolved rs
    join contests c on c.id = rs.contest_id and c.status = 'complete'
    join matchups m on m.round_id = rs.id
    where rs.kind = 'bracket'
      and not exists (select 1 from rounds n where n.contest_id = rs.contest_id and n.seq = rs.seq + 1)

    -- N1: a day after approval, while voting is still a day or more away.
    union all
    select 'nurture_ready', e.id, null, null, null, r1.opens_at, 5, e.moderated_at + interval '24 hours',
           null, null, null, null, null, null, r1.opens_at
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
           null, null, null, null, null, null, r1.opens_at
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
           null, null, r1.opens_at
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
           null, null, r1.opens_at
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
           coalesce(tm.votes, 0)::int, null, null, null, coalesce(topp.votes, 0)::int, null, rb.opens_at
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
           null, null, null, null, null, w.pet_name, null
    from entries e
    join contests c on c.id = e.contest_id and c.status = 'complete'
    join rounds rf on rf.contest_id = c.id and rf.kind = 'bracket' and rf.status = 'resolved'
                  and not exists (select 1 from rounds n where n.contest_id = c.id and n.seq = rf.seq + 1)
    join matchups fm on fm.round_id = rf.id and fm.winner_entry_id is not null
    join entries w on w.id = fm.winner_entry_id
    where e.status = 'approved' and e.nurture_opt_out_at is null and e.id <> fm.winner_entry_id
      and now() >= rf.resolved_at + interval '36 hours' and now() < rf.resolved_at + interval '10 days'
  )
  select o.kind, e.id, o.round_id, e.owner_email, e.owner_name, e.pet_name,
         c.name, o.round_name, o.opponent_name, o.closes_at, e.rejection_reason,
         coalesce(s.shelter_cents, 0) + coalesce(s.match_cents, 0),
         o.my_votes, o.rank, o.field_size, o.cut_margin, o.opponent_votes,
         e.goal_votes, e.owner_token, o.champion_name, o.opens_at
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


-- ------------------------------------------------------------ erasure --
-- Buyer notes carry addresses; they go with everything else.
create or replace function erase_personal_data(p_contest_id uuid)
  returns table (entries int, votes int, notifications int, free_voters int)
  language plpgsql security definer set search_path = public, pg_temp
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
  set owner_name = 'Erased', owner_email = 'erased@invalid', newsletter_opt_in = false,
      owner_token = gen_random_uuid(), nurture_opt_out_at = coalesce(nurture_opt_out_at, now())
  where e.contest_id = c.id and e.owner_email <> 'erased@invalid';
  get diagnostics v_e = row_count;

  update votes v
  set buyer_email = 'erased@invalid', newsletter_opt_in = false, plays_again_opt_in = false
  from rounds r
  where r.id = v.round_id and r.contest_id = c.id and v.buyer_email <> 'erased@invalid';
  get diagnostics v_v = row_count;

  update notifications n
  set to_email = 'erased@invalid'
  from entries e
  where e.id = n.entry_id and e.contest_id = c.id and n.to_email <> 'erased@invalid';
  get diagnostics v_n = row_count;

  delete from buyer_notices bn using rounds r where r.id = bn.round_id and r.contest_id = c.id;

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


-- ------------------------------------------------------------------ access --
revoke execute on function set_entry_goal(uuid, uuid, int), entrant_opt_out(uuid, uuid),
  create_pending_vote(uuid, uuid, text, text, text, boolean, boolean),
  buyer_notice_queue(int), buyer_notice_unsubscribe(bytea), sponsor_match_cents(uuid),
  chicago_morning(timestamptz), notification_queue(int)
  from public, anon, authenticated;
grant execute on function set_entry_goal(uuid, uuid, int), entrant_opt_out(uuid, uuid),
  create_pending_vote(uuid, uuid, text, text, text, boolean, boolean),
  buyer_notice_queue(int), buyer_notice_unsubscribe(bytea), notification_queue(int)
  to service_role;
-- The payout views are security_invoker, so their readers need the match sum.
grant execute on function sponsor_match_cents(uuid) to authenticated, service_role;
-- Replaced: restated.
revoke execute on function erase_personal_data(uuid) from public, anon, authenticated;
grant execute on function erase_personal_data(uuid) to authenticated;
grant select on contest_stats to anon, authenticated, service_role;
grant select on payout_statement, shelter_payouts to authenticated, service_role;
