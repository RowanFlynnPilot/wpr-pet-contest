-- Vote packs and bonus windows move into the database, and the vote lifecycle
-- is rebuilt around them.
--
-- Prices still never come from the browser. The client names a pack; the
-- database says what it costs and how many votes it buys. Moving packs here
-- (from a constant in create-checkout) means a price change or a new tier is a
-- row edit, not a redeploy, and the front end reads the same list checkout
-- charges against.


-- ------------------------------------------------------------------ packs --
create table vote_packs (
  id         uuid primary key default gen_random_uuid(),
  contest_id uuid not null references contests(id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9-]{1,32}$'),
  label      text not null,
  votes      int  not null check (votes > 0),
  -- Below $1, Stripe's 30c fixed fee takes a third or more of the sale.
  cents      int  not null check (cents >= 100),
  sort       int  not null default 0,
  -- Rendered as "Most popular". Anchors buyers on a mid-to-large pack.
  featured   boolean not null default false,
  -- Retire a pack by deactivating it. Deleting would orphan votes.pack_slug.
  active     boolean not null default true,
  unique (contest_id, slug)
);


-- ---------------------------------------------------------- bonus windows --
-- A sponsor underwrites a window in which every pack counts N times over:
-- "Double Vote Hour, presented by X". The sponsor pays WPR for the promotion;
-- buyers get more votes for the same price; the urgency sells packs.
--
-- The multiplier is locked when checkout BEGINS (create_pending_vote), not when
-- the webhook lands. The buyer is shown a vote count before paying, and that
-- count is a promise. The published rules say the same thing.
create extension if not exists btree_gist with schema extensions;

create table bonus_windows (
  id           uuid primary key default gen_random_uuid(),
  contest_id   uuid not null references contests(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  multiplier   int  not null check (multiplier between 2 and 5),
  label        text not null default 'Double Votes',
  sponsor_name text,
  sponsor_url  text,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Overlapping windows would make the multiplier ambiguous. Refuse them.
  constraint bonus_windows_no_overlap
    exclude using gist (contest_id with =, tstzrange(starts_at, ends_at) with &&)
);


-- ------------------------------------------------------- column additions --
alter table contests
  -- Qualifiers from the open round. A power of two; close_round seeds this many.
  add column bracket_size int not null default 16
    check (bracket_size >= 2 and (bracket_size & (bracket_size - 1)) = 0),
  -- Scheduled length of each bracket round. open_round can override per round.
  add column bracket_round_hours int not null default 48
    check (bracket_round_hours between 12 and 168);

alter table votes
  add column pack_slug text,
  -- 1 outside a bonus window. quantity already includes it.
  add column bonus_multiplier int not null default 1 check (bonus_multiplier between 1 and 5),
  -- Opt-in, never pre-checked. WPR's newsletter list is worth more over the
  -- years than any single contest.
  add column newsletter_opt_in boolean not null default false;

-- The live activity ticker reads the newest confirmations for one round.
create index votes_recent_idx on votes (round_id, confirmed_at desc) where status = 'succeeded';


-- ------------------------------------------------------------------ quote --
-- The one place that decides whether a vote is legal and what it costs.
-- create-checkout calls it before touching Stripe, so a bad request never
-- creates a payment intent. create_pending_vote calls it again at insert time.
--
-- Errors raised with SQLSTATE WP400 are meant for the reader; the edge
-- functions pass their message through verbatim. Anything else is a 500.
create function vote_quote(p_round_id uuid, p_entry_id uuid, p_pack_slug text)
  returns table (contest_id  uuid,
                 round_seq   int,
                 matchup_id  uuid,
                 pet_name    text,
                 pack_votes  int,
                 multiplier  int,
                 votes       int,
                 cents       int,
                 bonus_label text)
  language plpgsql stable security definer set search_path = public
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

  if r.status <> 'open' or now() not between r.opens_at and r.closes_at then
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


-- ---------------------------------------------------------- pending votes --
-- Replaces the 0003 version, which trusted the caller for quantity and price.
drop function create_pending_vote(uuid, uuid, int, int, text, text);

create function create_pending_vote(
  p_round_id          uuid,
  p_entry_id          uuid,
  p_pack_slug         text,
  p_buyer_email       text,
  p_payment_intent    text,
  p_newsletter_opt_in boolean default false
) returns table (vote_id uuid, votes int, cents int, multiplier int)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  q    record;
  v_id uuid;
begin
  select * into strict q from vote_quote(p_round_id, p_entry_id, p_pack_slug);

  insert into votes (round_id, entry_id, matchup_id, quantity, amount_cents,
                     buyer_email, stripe_payment_intent_id, pack_slug,
                     bonus_multiplier, newsletter_opt_in)
  values (p_round_id, p_entry_id, q.matchup_id, q.votes, q.cents,
          p_buyer_email, p_payment_intent, p_pack_slug,
          q.multiplier, coalesce(p_newsletter_opt_in, false))
  returning id into v_id;

  return query select v_id, q.votes, q.cents, q.multiplier;
end $$;


-- ----------------------------------------------------------- confirmation --
-- Replaces the 0003 version, which returned nothing and marked a payment
-- 'succeeded' even when its round had already been resolved. That silently
-- changed a finished round's published totals after the winner was decided.
--
-- Returns 'confirmed', 'duplicate' (a Stripe retry, or a vote already refunded
-- or disputed), or 'late'. The webhook refunds 'late' votes automatically.
--
-- Locking: FOR SHARE on the round blocks while close_round holds it FOR UPDATE.
-- A confirmation racing a close therefore either commits before the tally (and
-- counts) or waits and sees the round resolved (and is late). There is no
-- window where money lands in a round after its tally but before its status
-- changes.
drop function confirm_vote(text);

create function confirm_vote(p_payment_intent text) returns text
  language plpgsql security definer set search_path = public
as $$
declare
  v votes%rowtype;
  v_round_status round_status;
begin
  select * into v from votes
  where stripe_payment_intent_id = p_payment_intent
  for update;

  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;

  if v.status <> 'pending' then
    return 'duplicate';
  end if;

  select status into v_round_status from rounds where id = v.round_id for share;

  -- clock_timestamp, not now(): now() is the transaction start, which can
  -- predate a lock wait and make a late vote look early.
  if v_round_status = 'open' then
    update votes set status = 'succeeded', confirmed_at = clock_timestamp() where id = v.id;
    return 'confirmed';
  end if;

  update votes set status = 'late', confirmed_at = clock_timestamp() where id = v.id;
  return 'late';
end $$;


-- Webhook: charge.dispute.created. The votes come out of every total. A
-- refunded vote stays refunded.
create function mark_vote_disputed(p_payment_intent text) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  perform 1 from votes where stripe_payment_intent_id = p_payment_intent;
  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;

  update votes set status = 'disputed'
  where stripe_payment_intent_id = p_payment_intent and status <> 'refunded';
end $$;


-- Now also lists status 'late'. The legacy condition stays so a row confirmed
-- before this migration still surfaces. After an automatic refund lands the
-- row flips to 'refunded' and drops out, so zero rows is still the answer.
create or replace view late_confirmations with (security_invoker = true) as
  select v.stripe_payment_intent_id,
         v.buyer_email,
         v.quantity,
         v.amount_cents,
         v.confirmed_at,
         r.seq        as round_seq,
         r.resolved_at,
         e.pet_name,
         v.status
  from votes v
  join rounds r  on r.id = v.round_id
  join entries e on e.id = v.entry_id
  where v.status = 'late'
     or (v.status = 'succeeded' and r.resolved_at is not null and v.confirmed_at > r.resolved_at);


-- -------------------------------------------------------------------- RLS --
alter table vote_packs    enable row level security;
alter table bonus_windows enable row level security;

create policy vote_packs_public_read on vote_packs
  for select to anon, authenticated using (active);
create policy vote_packs_admin on vote_packs
  for all to authenticated using (is_admin()) with check (is_admin());

create policy bonus_windows_public_read on bonus_windows
  for select to anon, authenticated using (true);
create policy bonus_windows_admin on bonus_windows
  for all to authenticated using (is_admin()) with check (is_admin());


-- ----------------------------------------------------------------- grants --
grant select on vote_packs, bonus_windows to anon;
grant select, insert, update, delete on vote_packs, bonus_windows to authenticated;
grant select, insert, update, delete on vote_packs, bonus_windows to service_role;
grant select on late_confirmations to authenticated, service_role;

revoke execute on function vote_quote(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function create_pending_vote(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function confirm_vote(text) from public, anon, authenticated;
revoke execute on function mark_vote_disputed(text) from public, anon, authenticated;

grant execute on function vote_quote(uuid, uuid, text) to service_role;
grant execute on function create_pending_vote(uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function confirm_vote(text) to service_role;
grant execute on function mark_vote_disputed(text) to service_role;
