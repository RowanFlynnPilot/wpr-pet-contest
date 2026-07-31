-- The Wausau Pilot & Review pet contest: core schema.
--
-- Model: one contest per year. Round 1 ("open") is the whole approved field
-- competing at once. Closing it seeds the top N into a bracket. Every
-- subsequent round is a set of head-to-head matchups.
--
-- Votes carry a round_id. That single column is what makes "totals reset each
-- round" a WHERE clause instead of a state migration.

create extension if not exists pgcrypto;
create extension if not exists citext;

create type contest_status as enum ('draft', 'submissions_open', 'voting', 'complete');
create type entry_status   as enum ('pending', 'approved', 'rejected');
create type round_kind     as enum ('open', 'bracket');
create type round_status   as enum ('pending', 'open', 'closed', 'resolved');
create type vote_status    as enum ('pending', 'succeeded', 'refunded');
create type species        as enum ('dog', 'cat', 'other');


create table contests (
  id                    uuid primary key default gen_random_uuid(),
  year                  int not null unique,
  name                  text not null,
  status                contest_status not null default 'draft',
  -- Published on the rules page pre-launch. Percentage of gross to shelters.
  beneficiary_split_pct int not null check (beneficiary_split_pct between 0 and 100),
  submissions_open_at   timestamptz not null,
  submissions_close_at  timestamptz not null,
  created_at            timestamptz not null default now(),
  check (submissions_close_at > submissions_open_at)
);


create table shelters (
  id         uuid primary key default gen_random_uuid(),
  contest_id uuid not null references contests(id) on delete cascade,
  name       text not null,
  url        text,
  logo_path  text
);


create table entries (
  id                 uuid primary key default gen_random_uuid(),
  contest_id         uuid not null references contests(id) on delete cascade,
  pet_name           text not null,
  species            species not null,
  owner_name         text not null,
  owner_email        citext not null,
  town               text not null,
  photo_path         text not null,
  status             entry_status not null default 'pending',
  rejection_reason   text,
  -- Audit trail. Somebody will insist their entry was never reviewed, and the
  -- check below makes it impossible to move an entry out of 'pending' without
  -- recording when. An optional audit trail is an empty one.
  moderated_by       uuid references auth.users(id) on delete set null,
  moderated_at       timestamptz,
  -- Non-null marks an adoptable shelter animal running as a wildcard.
  shelter_id         uuid references shelters(id),
  -- Assigned once, when the bracket is generated. Null = did not qualify.
  seed               int,
  -- Legal artifact: timestamp the entrant accepted the photo rights release.
  rights_accepted_at timestamptz not null,
  created_at         timestamptz not null default now(),
  constraint rejection_reason_required
    check (status <> 'rejected' or rejection_reason is not null),
  constraint moderation_recorded
    check (status = 'pending' or moderated_at is not null),
  unique (contest_id, seed)
);

create index entries_contest_status_idx on entries (contest_id, status);

-- At most one contest accepting submissions, and at most one in voting.
-- submit-entry resolves the active contest with .single() and depends on the
-- answer being unambiguous. Year two is when this would otherwise bite.
create unique index contests_one_submissions_open_idx
  on contests (status) where status = 'submissions_open';

create unique index contests_one_voting_idx
  on contests (status) where status = 'voting';


create table rounds (
  id         uuid primary key default gen_random_uuid(),
  contest_id uuid not null references contests(id) on delete cascade,
  seq        int not null,
  kind       round_kind not null,
  status     round_status not null default 'pending',
  opens_at   timestamptz not null,
  closes_at  timestamptz not null,
  -- When close_round actually ran, which is not the same as closes_at. Used to
  -- catch payments that settled after results were computed.
  resolved_at timestamptz,
  unique (contest_id, seq),
  check (closes_at > opens_at),
  -- Round 1 is always the open field; every later round is a bracket.
  check ((seq = 1) = (kind = 'open'))
);

-- Two rounds open at once would split the vote and is never intended.
create unique index rounds_one_open_per_contest_idx
  on rounds (contest_id) where status = 'open';


create table matchups (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references rounds(id) on delete cascade,
  -- 0-indexed. Slots 2i and 2i+1 feed slot i of the next round.
  slot            int not null,
  entry_a_id      uuid not null references entries(id),
  entry_b_id      uuid not null references entries(id),
  winner_entry_id uuid references entries(id),
  unique (round_id, slot),
  check (entry_a_id <> entry_b_id),
  check (winner_entry_id is null or winner_entry_id in (entry_a_id, entry_b_id))
);


-- A vote row is a Stripe purchase. Purchases and votes are the same thing here:
-- you buy votes for one pet in one round. Splitting a pack across pets would
-- double the checkout surface for no fundraising gain.
create table votes (
  id                       uuid primary key default gen_random_uuid(),
  round_id                 uuid not null references rounds(id),
  entry_id                 uuid not null references entries(id),
  -- Null in the open round, required in bracket rounds (enforced on insert).
  matchup_id               uuid references matchups(id),
  quantity                 int not null check (quantity > 0),
  amount_cents             int not null check (amount_cents > 0),
  buyer_email              citext not null,
  -- Idempotency key for webhook retries.
  stripe_payment_intent_id text not null unique,
  status                   vote_status not null default 'pending',
  confirmed_at             timestamptz,
  created_at               timestamptz not null default now()
);

create index votes_tally_idx on votes (round_id, entry_id) where status = 'succeeded';


-- Security definer (the default) ON PURPOSE. The public leaderboard reads this
-- view, while `votes` itself is never exposed to anon because it holds buyer
-- emails. Bypassing RLS is the entire point.
--
-- Supabase's security advisor flags definer views generically. Do NOT "fix" it
-- by adding security_invoker here: anon cannot read `votes`, so the leaderboard
-- would silently return zero votes for every pet with nothing erroring anywhere.
-- The test suite asserts anon can still read this view, which is what would
-- catch that change.
create view entry_round_totals as
  select round_id,
         entry_id,
         sum(quantity)::int      as votes,
         sum(amount_cents)::bigint as amount_cents
  from votes
  where status = 'succeeded'
  group by round_id, entry_id;


-- Payments that settled AFTER their round was already resolved. Stripe webhooks
-- can lag; close_round only counts votes that were succeeded at the time it ran.
-- Anything listed here is money taken for votes the buyer never received.
--
-- Check this after every close_round. The answer should be zero rows. When it
-- is not, refund those payment intents in Stripe — the webhook will flip them
-- to 'refunded' on its own.
create view late_confirmations with (security_invoker = true) as
  select v.stripe_payment_intent_id,
         v.buyer_email,
         v.quantity,
         v.amount_cents,
         v.confirmed_at,
         r.seq        as round_seq,
         r.resolved_at,
         e.pet_name
  from votes v
  join rounds r  on r.id = v.round_id
  join entries e on e.id = v.entry_id
  where v.status = 'succeeded'
    and r.resolved_at is not null
    and v.confirmed_at > r.resolved_at;
