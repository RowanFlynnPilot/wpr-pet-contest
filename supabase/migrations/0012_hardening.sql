-- Fixes from an adversarial review of 0005-0011. Each section names the hole
-- it closes.


-- ------------------------------------------------ the bucket is not a list --
-- pets_public_read (0004) let anyone call the storage list API and enumerate
-- every object in the bucket, including pending uploads nobody has moderated
-- and rejected photos not yet deleted. Public buckets serve objects by URL
-- without any SELECT policy, so the gallery never needed it. Admins keep a
-- read policy so rejected_photos_live can still see the bucket.
drop policy pets_public_read on storage.objects;

create policy pets_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'pets' and is_admin());


-- ------------------------------------------- signed in is not an admin --
-- entries_public_read applied to authenticated too, and authenticated holds
-- every column. Any signed-in non-admin (a moderator removed from `admins`, or
-- anyone ever invited by mistake) could read every approved owner's name and
-- email, and through newsletter_signups the opt-in list.
alter policy entries_public_read on entries to anon;


-- ---------------------------------------------------- bracket_seed_order --
-- Anon could execute it, and it grows its array quadratically: one request for
-- a 2^18 field burned seconds of database CPU. Nothing outside the bracket
-- builders needs it.
create or replace function bracket_seed_order(field_size int) returns int[]
  language plpgsql immutable
as $$
declare
  cur int[] := array[1, 2];
  nxt int[];
  n   int := 2;
  s   int;
begin
  if field_size < 2 or field_size > 1024 or (field_size & (field_size - 1)) <> 0 then
    raise exception 'field_size must be a power of two from 2 to 1024, got %', field_size;
  end if;

  while n < field_size loop
    n := n * 2;
    nxt := array[]::int[];
    foreach s in array cur loop
      nxt := nxt || s || (n + 1 - s);
    end loop;
    cur := nxt;
  end loop;

  return cur;
end $$;

revoke execute on function bracket_seed_order(int) from public, anon, authenticated;


-- ------------------------------------------------------- the deadline --
-- confirm_vote checked only that the round was still open, never when the
-- buyer paid. Open several checkouts before the deadline, keep the pages open,
-- and after the deadline (when nobody else can start one) watch the
-- leaderboard and pay exactly as much as it takes. Those votes counted until
-- someone ran close_round.
--
-- Now a payment counts only if Stripe says it succeeded by the round's
-- closes_at, plus a short grace for a buyer who pressed Pay at 7:59:58. And
-- close_round waits out a settle period after closes_at, so a buyer who paid
-- on time is not refunded just because Stripe's webhook was slow.

create function payment_grace() returns interval
  language sql immutable as $$ select interval '2 minutes' $$;

create function settle_period() returns interval
  language sql immutable as $$ select interval '10 minutes' $$;

revoke execute on function payment_grace() from public, anon, authenticated;
revoke execute on function settle_period() from public, anon, authenticated;

drop function confirm_vote(text);

-- p_paid_at: when Stripe says the payment succeeded (the signed event's
-- created time). Null means now, for callers that are not a webhook.
create function confirm_vote(p_payment_intent text, p_paid_at timestamptz default null)
  returns text
  language plpgsql security definer set search_path = public
as $$
declare
  v votes%rowtype;
  r rounds%rowtype;
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

  if r.status = 'open'
     and coalesce(p_paid_at, clock_timestamp()) <= r.closes_at + payment_grace() then
    update votes set status = 'succeeded', confirmed_at = clock_timestamp() where id = v.id;
    return 'confirmed';
  end if;

  update votes set status = 'late', confirmed_at = clock_timestamp() where id = v.id;
  return 'late';
end $$;

revoke execute on function confirm_vote(text, timestamptz) from public, anon, authenticated;
grant execute on function confirm_vote(text, timestamptz) to service_role;


-- -------------------------------------------- published results are final --
-- A refund or chargeback after a round resolved used to change that round's
-- shown totals, and side_awards recomputed live, so Best Dog could change
-- after it was announced. close_round now writes the tally it decided on to
-- round_results; entry_round_totals serves that snapshot for resolved rounds
-- and live sums only for rounds still in play. Money is a separate question:
-- contest_stats still reflects every refund.
create table round_results (
  round_id     uuid   not null references rounds(id) on delete cascade,
  entry_id     uuid   not null references entries(id) on delete cascade,
  votes        int    not null,
  amount_cents bigint not null,
  primary key (round_id, entry_id)
);

alter table round_results enable row level security;
create policy round_results_admin_read on round_results
  for select to authenticated using (is_admin());
grant select on round_results to authenticated;

-- Anything resolved before this migration (nothing in production) keeps the
-- totals it had.
insert into round_results (round_id, entry_id, votes, amount_cents)
select v.round_id, v.entry_id, sum(v.quantity)::int, sum(v.amount_cents)::bigint
from votes v
join rounds r on r.id = v.round_id
where r.status = 'resolved' and v.status = 'succeeded'
group by v.round_id, v.entry_id;

-- Still security definer, still the only public window onto votes.
create or replace view entry_round_totals as
  select t.round_id, t.entry_id, t.votes, t.amount_cents
  from round_results t
  union all
  select v.round_id,
         v.entry_id,
         sum(v.quantity)::int      as votes,
         sum(v.amount_cents)::bigint as amount_cents
  from votes v
  join rounds r on r.id = v.round_id
  where v.status = 'succeeded' and r.status <> 'resolved'
  group by v.round_id, v.entry_id;


-- Replaces close_round(uuid, int). The field-size override is gone: it could
-- seed 16 into a contest configured for 8, and round_label would then name
-- every round wrong. A contest's bracket is its bracket_size.
drop function close_round(uuid, int);

create function close_round(p_round_id uuid) returns uuid
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
  -- used. The round lock keeps any payment from landing in between.
  insert into round_results (round_id, entry_id, votes, amount_cents)
  select t.round_id, t.entry_id, t.votes, t.amount_cents
  from entry_round_totals t
  where t.round_id = r.id;

  update rounds set status = 'resolved', resolved_at = clock_timestamp() where id = r.id;

  return v_next_id;
end $$;

revoke execute on function close_round(uuid) from public, anon, authenticated;
grant execute on function close_round(uuid) to authenticated;


-- Seeding tiebreak: two entries created in the same microsecond (a bulk
-- import) would otherwise seed in arbitrary order. id breaks it for good.
create or replace function seed_bracket(p_round_id uuid, p_field_size int) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_contest_id uuid;
  v_seq        int;
  v_qualified  int;
  v_order      int[];
  v_next_id    uuid;
  w            record;
  i            int;
begin
  select contest_id, seq into strict v_contest_id, v_seq from rounds where id = p_round_id;

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


-- ------------------------------------------------------ partial refunds --
-- A partial refund leaves the votes (it is a goodwill gesture, not a
-- reversal), but the money is gone, and the shelters' share is computed from
-- the money. Track it so contest_stats and the payout figure are net.
alter table votes
  add column refunded_cents int not null default 0 check (refunded_cents >= 0);

create function record_partial_refund(p_payment_intent text, p_refunded_cents int) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  update votes set refunded_cents = least(greatest(p_refunded_cents, 0), amount_cents)
  where stripe_payment_intent_id = p_payment_intent;

  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;
end $$;

create or replace function refund_vote(p_payment_intent text) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  update votes set status = 'refunded', refunded_cents = amount_cents
  where stripe_payment_intent_id = p_payment_intent;

  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;
end $$;

revoke execute on function record_partial_refund(text, int) from public, anon, authenticated;
grant execute on function record_partial_refund(text, int) to service_role;

create or replace view contest_stats as
  select c.id as contest_id,
         c.year,
         c.beneficiary_split_pct,
         (select count(*) from entries e
          where e.contest_id = c.id and e.status = 'approved')::int as entries,
         coalesce(sum(v.quantity), 0)::int                          as votes,
         coalesce(sum(v.amount_cents - v.refunded_cents), 0)::bigint as gross_cents,
         (coalesce(sum(v.amount_cents - v.refunded_cents), 0) * c.beneficiary_split_pct / 100)::bigint as shelter_cents
  from contests c
  left join rounds r on r.contest_id = c.id
  left join votes v  on v.round_id = r.id and v.status = 'succeeded'
  where c.status <> 'draft'
  group by c.id;

create or replace view round_revenue with (security_invoker = true) as
  select r.contest_id,
         r.id  as round_id,
         r.seq,
         r.status,
         count(v.id)             filter (where v.status = 'succeeded')::int as purchases,
         coalesce(sum(v.quantity)     filter (where v.status = 'succeeded'), 0)::int    as votes,
         coalesce(sum(v.amount_cents - v.refunded_cents) filter (where v.status = 'succeeded'), 0)::bigint as gross_cents,
         count(distinct v.buyer_email) filter (where v.status = 'succeeded')::int       as buyers,
         count(v.id)             filter (where v.status = 'pending')::int as pending,
         count(v.id)             filter (where v.status in ('refunded', 'late', 'disputed'))::int as reversed,
         coalesce(sum(v.amount_cents) filter (where v.status in ('refunded', 'late', 'disputed')), 0)::bigint
           + coalesce(sum(v.refunded_cents) filter (where v.status = 'succeeded'), 0)::bigint as reversed_cents
  from rounds r
  left join votes v on v.round_id = r.id
  group by r.id;

create or replace view pack_revenue with (security_invoker = true) as
  select r.contest_id,
         v.pack_slug,
         count(*)::int                                    as purchases,
         sum(v.quantity)::int                             as votes,
         sum(v.amount_cents - v.refunded_cents)::bigint   as gross_cents
  from votes v
  join rounds r on r.id = v.round_id
  where v.status = 'succeeded'
  group by r.contest_id, v.pack_slug;

create or replace view entry_revenue with (security_invoker = true) as
  select e.contest_id,
         e.id       as entry_id,
         e.pet_name,
         coalesce(sum(v.amount_cents - v.refunded_cents), 0)::bigint as gross_cents,
         coalesce(sum(v.quantity), 0)::int                           as votes
  from entries e
  left join votes v on v.entry_id = e.id and v.status = 'succeeded'
  where e.status = 'approved'
  group by e.id;


-- ------------------------------------------------ entries, race-free --
-- submit-entry checked the contest's status, then inserted seconds later. An
-- entry landing while open_round ran stayed pending forever in a contest whose
-- field was already set, and moderate_entry refuses to touch it. The
-- per-email cap had the same gap. This function holds the contest FOR SHARE,
-- which open_round's FOR UPDATE waits on, and serializes per address.
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
  p_max_per_email     int
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
                       caption, photo_path, newsletter_opt_in, rights_accepted_at)
  values (c.id, p_pet_name, p_species, p_owner_name, p_owner_email, p_town,
          p_caption, p_photo_path, coalesce(p_newsletter_opt_in, false), now())
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int)
  from public, anon, authenticated;
grant execute on function insert_entry(uuid, text, species, text, text, text, text, text, boolean, int)
  to service_role;


-- ------------------------------------------------------- rate limiting --
-- A per-client ceiling on checkouts and entries. Card testers love a page that
-- mints payment intents for anyone; Stripe Radar is the real defence, this
-- blunts a burst from one address. Keys are hashed by the edge function, so no
-- raw IP address is stored.
create table rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket, window_start)
);

alter table rate_limits enable row level security;
-- No policies: service role only.

create function hit_rate_limit(p_bucket text, p_limit int, p_window interval) returns boolean
  language plpgsql security definer set search_path = public
as $$
declare
  v_start timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
  v_hits  int;
begin
  insert into rate_limits (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1
  returning hits into v_hits;

  -- Cheap housekeeping, about one call in a hundred.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end $$;

revoke execute on function hit_rate_limit(text, int, interval) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, interval) to service_role;


-- ------------------------------------------------ stale advancement mail --
-- The freshness window (three days) outlasts a 48-hour round. With sweeps
-- stopped for two days, a pet could be told it advanced to a round it had
-- already lost. 'advanced' is now owed only while that round is still ahead
-- or in play.
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
                 raised_cents     bigint)
  language sql stable security definer set search_path = public
as $$
  with resolved as (
    select r.*, c.bracket_size, c.name as contest_name
    from rounds r
    join contests c on c.id = r.contest_id
    where r.status = 'resolved' and r.resolved_at > now() - interval '3 days'
  ),
  owed as (
    select 'entry_received' as kind, e.id as entry_id, null::uuid as round_id,
           null::text as round_name, null::text as opponent_name,
           c.submissions_close_at as closes_at, 1 as priority, e.created_at as since
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'pending' and e.created_at > now() - interval '1 day'

    union all
    select 'entry_approved', e.id, null, null, null, null, 2, e.moderated_at
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'approved'
      and c.status in ('submissions_open', 'voting')
      and not exists (select 1 from rounds r1
                      where r1.contest_id = c.id and r1.seq = 1 and r1.status = 'resolved')

    union all
    select 'entry_rejected', e.id, null, null, null, null, 2, e.moderated_at
    from entries e
    where e.status = 'rejected' and e.moderated_at > now() - interval '7 days'

    union all
    select 'advanced', side.entry_id, n.id, round_label(n.seq, rs.bracket_size),
           opp.pet_name, n.closes_at, 3, rs.resolved_at
    from resolved rs
    join rounds n on n.contest_id = rs.contest_id and n.seq = rs.seq + 1
                 and n.status in ('pending', 'open')
    join matchups m on m.round_id = n.id
    cross join lateral (values (m.entry_a_id, m.entry_b_id),
                               (m.entry_b_id, m.entry_a_id)) as side(entry_id, opponent_id)
    join entries opp on opp.id = side.opponent_id

    union all
    select 'eliminated', e.id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 4, rs.resolved_at
    from resolved rs
    join entries e on e.contest_id = rs.contest_id
    where rs.kind = 'open' and e.status = 'approved' and e.seed is null

    union all
    select 'eliminated',
           case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end,
           rs.id, round_label(rs.seq, rs.bracket_size),
           w.pet_name, null, 4, rs.resolved_at
    from resolved rs
    join matchups m on m.round_id = rs.id and m.winner_entry_id is not null
    join entries w on w.id = m.winner_entry_id
    where rs.kind = 'bracket'

    union all
    select 'champion', m.winner_entry_id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 3, rs.resolved_at
    from resolved rs
    join contests c on c.id = rs.contest_id and c.status = 'complete'
    join matchups m on m.round_id = rs.id
    where rs.kind = 'bracket'
      and not exists (select 1 from rounds n where n.contest_id = rs.contest_id and n.seq = rs.seq + 1)
  )
  select o.kind, e.id, o.round_id, e.owner_email, e.owner_name, e.pet_name,
         c.name, o.round_name, o.opponent_name, o.closes_at, e.rejection_reason,
         coalesce(s.shelter_cents, 0)
  from owed o
  join entries e  on e.id = o.entry_id
  join contests c on c.id = e.contest_id
  left join contest_stats s on s.contest_id = c.id
  where not exists (
    select 1 from notifications x
    where x.kind = o.kind and x.entry_id = o.entry_id
      and x.round_id is not distinct from o.round_id
  )
  order by o.priority, o.since
  limit p_limit
$$;
