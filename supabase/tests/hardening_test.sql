-- Run with: supabase test db
--
-- The 0020 audit fixes: locks and policies that run once, indexes on the
-- paths that need them, won disputes restoring votes, and checkouts that can
-- never count found for cancelling.

create extension if not exists pgtap with schema extensions;

begin;
select plan(16);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours)
values ('ac000000-0000-0000-0000-0000000000ac', 2097, 'Hardening', 30,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24);

insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select id::uuid, 'ac000000-0000-0000-0000-0000000000ac', name, 'dog', 'O', lower(name) || '@example.com', 'Wausau',
       'h/' || name || '.jpg', 'approved', now(), now(), now() - (mins || ' minutes')::interval
from (values ('aa000000-0000-0000-0000-00000000000a', 'Ada', 4), ('ab000000-0000-0000-0000-00000000000b', 'Bo', 3),
             ('ae000000-0000-0000-0000-00000000000c', 'Cid', 2)) as t(id, name, mins);

insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('a1000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac',
        1, 'open', 'open', now() - interval '1 day', now() + interval '1 day');

insert into vote_packs (contest_id, slug, label, votes, cents)
values ('ac000000-0000-0000-0000-0000000000ac', 'fan', 'Fan', 25, 2000);

select create_pending_vote('a1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000000a',
                           'fan', 'x@example.com', 'pi_h_open');
select create_pending_vote('a1000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000c',
                           'fan', 'y@example.com', 'pi_h_cid');
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email, stripe_payment_intent_id, status, confirmed_at)
values ('a1000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-00000000000b', 25, 2000, 'z@example.com', 'pi_h_disputed', 'disputed', now()),
       ('a1000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-00000000000b', 25, 2000, 'w@example.com', 'pi_h_refunded', 'refunded', now());


-- ------------------------------------------------------------------- locks --
select ok(pg_get_functiondef('confirm_vote(text, timestamptz)'::regprocedure) ~ 'from entries where id = v\.entry_id for share',
  'confirm_vote holds the pet, so a disqualification cannot slip between its read and its update');
select ok(pg_get_functiondef('disqualify_entry(uuid, text)'::regprocedure) ~* 'rounds where contest_id = v_contest and status = ''open'' for share',
  'disqualify_entry takes the open round before the pet, so it cannot commit mid-close');


-- ---------------------------------------------------------------- policies --
select is_empty(
  $$ select schemaname || '.' || tablename || '.' || policyname from pg_policies
     where schemaname in ('public', 'storage')
       and ((qual ~ 'is_admin\(\)' and qual !~* 'select is_admin\(\)')
         or (with_check ~ 'is_admin\(\)' and with_check !~* 'select is_admin\(\)')) $$,
  'every policy evaluates is_admin() once per statement, not once per row');
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and p.proconfig @> array['search_path=public'] $$,
  'every security definer function searches pg_temp last');


-- ----------------------------------------------------------------- indexes --
select has_index('public', 'free_votes', 'free_votes_voter_cast_idx', 'the reminder queue finds a voter''s last pet by index');
select has_index('public', 'free_voter_devices', 'free_voter_devices_voter_idx', 'a voter''s browsers are found by index');
select has_index('public', 'rate_limits', 'rate_limits_window_idx', 'rate-limit housekeeping deletes by index');
select ok(exists (select 1 from pg_constraint where conname = 'resolution_recorded')
          and exists (select 1 from pg_constraint where conname = 'refund_within_amount'),
  'a resolved round records when, and no refund exceeds its payment');


-- ---------------------------------------------------------- won disputes --
select mark_dispute_won('pi_h_disputed');
select is((select status::text from votes where stripe_payment_intent_id = 'pi_h_disputed'), 'succeeded',
  'a won dispute puts the votes back: the money stayed');
select mark_dispute_won('pi_h_refunded');
select is((select status::text from votes where stripe_payment_intent_id = 'pi_h_refunded'), 'refunded',
  'only a disputed vote is restored');
select throws_ok($$ select mark_dispute_won('pi_not_ours') $$, 'P0001', 'no vote for payment intent pi_not_ours',
  'a dispute on a charge that was never a vote pack is reported as foreign');


-- ------------------------------------------- checkouts that can never count --
select is((select count(*)::int from stale_pending_intents(50) s where s.payment_intent like 'pi_h_%'), 0,
  'an open checkout in a live round is left alone');
select * from disqualify_entry('ae000000-0000-0000-0000-00000000000c', 'Stolen photo');
select results_eq(
  $$ select payment_intent from stale_pending_intents(50, 'ae000000-0000-0000-0000-00000000000c') $$,
  $$ values ('pi_h_cid'::text) $$,
  'a checkout for a disqualified pet is stale at once, and can be found by pet');
update rounds set closes_at = now() - interval '3 minutes' where id = 'a1000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select payment_intent from stale_pending_intents(50) s where s.payment_intent like 'pi_h_%' order by 1 $$,
  $$ values ('pi_h_cid'::text), ('pi_h_open') $$,
  'past the deadline plus grace, every unpaid checkout for the round is stale');
select mark_intent_canceled('pi_h_open');
select results_eq(
  $$ select payment_intent from stale_pending_intents(50) s where s.payment_intent like 'pi_h_%' $$,
  $$ values ('pi_h_cid'::text) $$,
  'a checkout cancelled at Stripe drops out');
select ok(has_function_privilege('service_role', 'stale_pending_intents(int, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'mark_intent_canceled(text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'mark_dispute_won(text)', 'EXECUTE'),
  'only the edge functions reach the new money steps');

select * from finish();
rollback;
