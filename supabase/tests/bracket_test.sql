-- Run with: supabase test db
--
-- The bracket logic is the one thing that cannot quietly break between years.
-- These tests are the reason you can change close_round() with confidence.
--
-- pgTAP wraps everything in a transaction and rolls back, so the fixtures below
-- never touch real data.

-- pgTAP is not enabled by default in a new Supabase project. Without this,
-- `supabase test db` fails on the plan() call below with "function does not
-- exist", which reads like a broken test rather than a missing extension.
create extension if not exists pgtap with schema extensions;

begin;
select plan(26);

-- ---------------------------------------------------------------- fixtures --
-- Year 2099 and a dedicated contest id: `supabase test db` runs against a
-- database that already has seed.sql applied, so nothing here may collide.
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct,
                      submissions_open_at, submissions_close_at, status)
values ('22222222-2222-2222-2222-222222222222', 2099, 'Test Contest', 30,
        now() - interval '10 days', now() - interval '3 days', 'voting');

-- 20 approved entries, created_at ascending so the tiebreak is deterministic.
insert into entries (contest_id, pet_name, species, owner_name, owner_email,
                     town, photo_path, status, rights_accepted_at, moderated_at, created_at)
select '22222222-2222-2222-2222-222222222222', 'Pet ' || g, 'dog', 'Owner ' || g,
       'o' || g || '@example.com', 'Wausau', 'p/' || g || '.jpg', 'approved',
       now(), now(), now() + (g || ' seconds')::interval
from generate_series(1, 20) g;

-- Already past its deadline and the settle period, so close_round will run.
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('33333333-3333-3333-3333-333333333333',
        '22222222-2222-2222-2222-222222222222', 1, 'open', 'open',
        now() - interval '8 days', now() - interval '1 hour');

-- Pets 1..18 vote in descending order. Pets 19 and 20 get nothing.
-- Joined on generate_series rather than parsed out of pet_name: seed.sql has
-- entries whose names do not parse as integers, and a fixture that breaks on
-- unrelated data is a fixture you will stop trusting.
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email,
                   stripe_payment_intent_id, status)
select '33333333-3333-3333-3333-333333333333', e.id,
       100 - (g * 3), 500, 'buyer@example.com', 'pi_r1_' || g, 'succeeded'
from generate_series(1, 18) g
join entries e
  on e.pet_name = 'Pet ' || g
 and e.contest_id = '22222222-2222-2222-2222-222222222222';


-- ------------------------------------------------------- bracket ordering --
select is(bracket_seed_order(4), array[1,4,2,3],
  'a 4-field pairs 1v4 and 2v3');

select is(bracket_seed_order(8), array[1,8,4,5,2,7,3,6],
  'an 8-field puts seeds 1 and 2 in opposite halves');

select is(bracket_seed_order(16), array[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11],
  'a 16-field is the standard bracket order');

select throws_ok('select bracket_seed_order(12)', null,
  'a non-power-of-two field is rejected');

select throws_ok('select bracket_seed_order(1)', null,
  'a field smaller than 2 is rejected');


-- ------------------------------------------------------------ round 1 close --
select lives_ok(
  $$ select close_round('33333333-3333-3333-3333-333333333333') $$,
  'closing the open round seeds a bracket');

select is(
  (select status::text from rounds
   where seq = 1 and contest_id = '22222222-2222-2222-2222-222222222222'),
  'resolved',
  'the open round ends resolved');

select is(
  (select count(*)::int from entries
   where seed is not null and contest_id = '22222222-2222-2222-2222-222222222222'),
  16,
  'exactly 16 of 20 entries are seeded');

select is(
  (select e.pet_name from entries e
   where e.seed = 1 and e.contest_id = '22222222-2222-2222-2222-222222222222'),
  'Pet 1',
  'the round 1 vote leader takes the top seed');

select is(
  (select count(*)::int from matchups m join rounds r on r.id = m.round_id
   where r.seq = 2),
  8,
  'round 2 has 8 matchups');

select is(
  (select a.seed || 'v' || b.seed
   from matchups m
   join entries a on a.id = m.entry_a_id
   join entries b on b.id = m.entry_b_id
   join rounds r on r.id = m.round_id
   where r.seq = 2 and m.slot = 0
     and r.contest_id = '22222222-2222-2222-2222-222222222222'),
  '1v16',
  'the top seed draws the bottom seed');


-- ------------------------------------------------------------ guard rails --
select throws_ok(
  $$ select close_round('33333333-3333-3333-3333-333333333333') $$,
  null,
  'a resolved round cannot be closed twice');

select throws_ok(
  $$ select confirm_vote('pi_does_not_exist') $$,
  null,
  'confirming an unknown payment intent fails loudly');

-- Idempotency: Stripe retries the same webhook, votes must not double.
select is(confirm_vote('pi_r1_1'), 'duplicate',
  'a webhook retry is reported as a duplicate');
select is(
  (select quantity from votes where stripe_payment_intent_id = 'pi_r1_1'),
  97,
  'reconfirming a succeeded vote does not change it');


-- --------------------------------------------------- bracket playthrough --
-- Underdog rule: entry_b always wins. Every round is an upset, which proves
-- round N is decided by round N votes and not by round 1 totals carrying over.
do $$
declare r rounds%rowtype; m record; n int := 0;
begin
  loop
    -- Scoped to the test contest. Unscoped, this loop reaches into seed.sql's
    -- contest and plays that one too.
    select * into r from rounds
    where status = 'pending'
      and contest_id = '22222222-2222-2222-2222-222222222222'
    order by seq limit 1;
    exit when not found;

    update rounds set status = 'open',
                      opens_at = now() - interval '3 days',
                      closes_at = now() - interval '1 hour'
    where id = r.id;

    for m in select * from matchups where round_id = r.id loop
      n := n + 1;
      insert into votes (round_id, entry_id, matchup_id, quantity, amount_cents,
                         buyer_email, stripe_payment_intent_id, status)
      values (r.id, m.entry_b_id, m.id, 10, 1000, 'buyer@example.com',
              'pi_b_' || n, 'succeeded'),
             (r.id, m.entry_a_id, m.id,  9,  900, 'buyer@example.com',
              'pi_a_' || n, 'succeeded');
    end loop;

    perform close_round(r.id);
  end loop;
end $$;

select is(
  (select max(seq)::int from rounds
   where contest_id = '22222222-2222-2222-2222-222222222222'),
  5,
  '16 entries take four bracket rounds');

select is(
  (select status::text from contests
   where id = '22222222-2222-2222-2222-222222222222'),
  'complete',
  'resolving the final matchup completes the contest');

select is(
  (select w.pet_name from matchups m
   join rounds r on r.id = m.round_id
   join entries w on w.id = m.winner_entry_id
   where r.seq = 5
     and r.contest_id = '22222222-2222-2222-2222-222222222222'),
  'Pet 11',
  'the round 1 leader does not coast: totals really do reset each round');

select is(
  (select sum(t.votes)::int from entry_round_totals t
   join rounds r on r.id = t.round_id
   where r.seq = 5 and r.contest_id = '22222222-2222-2222-2222-222222222222'),
  19,
  'the final round tallies only its own votes');

-- ------------------------------------------------- newly added invariants --
select throws_ok(
  $$ update entries set status = 'approved', moderated_at = null
     where pet_name = 'Pet 1' $$,
  null,
  'an entry cannot leave pending without a moderation timestamp');

select throws_ok(
  $$ insert into contests (year, name, beneficiary_split_pct,
                           submissions_open_at, submissions_close_at, status)
     values (2098, 'Second', 30, now(), now() + interval '1 day',
             'submissions_open') $$,
  null,
  'only one contest may accept submissions at a time');


-- --------------------------------------------------------- open_round --
-- Runs last: this flips the seeded contest to 'voting', and the one-voting-
-- contest index only has room because the playthrough above finished 2099.
update rounds set status = 'pending'
where id = '00000000-0000-0000-0000-00000000d001';

select throws_ok(
  $$ select open_round('00000000-0000-0000-0000-00000000d001') $$,
  null,
  'round 1 will not open while entries are still awaiting moderation');

select lives_ok(
  $$ select moderate_entry(id, pet_name <> 'Pending 3', 'Duplicate entry')
     from entries
     where contest_id = '00000000-0000-0000-0000-0000000000c1' and status = 'pending' $$,
  'the moderation queue can be worked');

select lives_ok(
  $$ select open_round('00000000-0000-0000-0000-00000000d001') $$,
  'round 1 can be opened once the queue is empty');

select is(
  (select status::text from contests
   where id = '00000000-0000-0000-0000-0000000000c1'),
  'voting',
  'opening round 1 closes submissions: no entries after the field is set');

select throws_ok(
  $$ select open_round('00000000-0000-0000-0000-00000000d001') $$,
  null,
  'an already-open round cannot be opened again');


-- Access control lives in access_test.sql.

select * from finish();
rollback;
