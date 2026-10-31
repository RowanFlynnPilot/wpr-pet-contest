-- Run with: supabase test db
--
-- Sprints (0030): a sponsor's prize for the most votes in a window. What
-- counts (checkout began in the window, credited within 10 minutes of the
-- end, a free vote cast in it), the tiebreak, settling, the frozen snapshot,
-- and every refusal: a day's notice, inside the round, no overlap, a draft
-- setting, cancel only before the start, staff only.

create extension if not exists pgtap with schema extensions;

begin;
select plan(26);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours, free_vote_enabled, sprints_enabled)
values ('5c000000-0000-0000-0000-0000000000c5', 2106, 'Sprints', 50,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24, true, true),
       ('5d000000-0000-0000-0000-0000000000d5', 2107, 'No sprints', 50,
        now() + interval '10 days', now() + interval '17 days', 'draft', 2, 24, false, false);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select id::uuid, '5c000000-0000-0000-0000-0000000000c5', name, 'dog', 'O', lower(name) || '@example.com', 'Wausau',
       's/' || name || '.jpg', 'approved', now(), now(), now() - (mins || ' minutes')::interval
from (values ('5a000000-0000-0000-0000-0000000000a5', 'Ace', 300), ('5b000000-0000-0000-0000-0000000000b5', 'Bea', 200),
             ('5e000000-0000-0000-0000-0000000000e5', 'Cy', 100)) as t(id, name, mins);
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('51000000-0000-0000-0000-000000000015', '5c000000-0000-0000-0000-0000000000c5',
        1, 'open', 'open', now() - interval '3 days', now() + interval '2 days'),
       ('52000000-0000-0000-0000-000000000025', '5d000000-0000-0000-0000-0000000000d5',
        1, 'open', 'pending', now() + interval '17 days', now() + interval '24 days');
insert into vote_packs (contest_id, slug, label, votes, cents)
values ('5c000000-0000-0000-0000-0000000000c5', 'fan', 'Fan', 25, 2000);

-- A finished sprint (two hours ago to half an hour ago) and a live one.
insert into sprints (id, contest_id, round_id, prize, sponsor_name, starts_at, ends_at)
values ('5f000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-0000000000c5', '51000000-0000-0000-0000-000000000015',
        'A $50 gift card', 'Example Pet Supply', now() - interval '2 hours', now() - interval '30 minutes'),
       ('5f000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-0000000000c5', '51000000-0000-0000-0000-000000000015',
        'A bag of treats', 'Example Pet Supply', now() - interval '20 minutes', now() + interval '40 minutes');

select create_pending_vote('51000000-0000-0000-0000-000000000015', e::uuid, 'fan', pi || '@example.com', pi)
from (values ('5a000000-0000-0000-0000-0000000000a5', 'pi_s1'), ('5b000000-0000-0000-0000-0000000000b5', 'pi_s2'),
             ('5b000000-0000-0000-0000-0000000000b5', 'pi_s3'), ('5e000000-0000-0000-0000-0000000000e5', 'pi_s4'),
             ('5e000000-0000-0000-0000-0000000000e5', 'pi_s5'), ('5a000000-0000-0000-0000-0000000000a5', 'pi_s6'),
             ('5b000000-0000-0000-0000-0000000000b5', 'pi_s7')) as t(e, pi);
select confirm_vote(pi) from unnest(array['pi_s1', 'pi_s2', 'pi_s3', 'pi_s4', 'pi_s5', 'pi_s6', 'pi_s7']) pi;
-- When each checkout began and when its payment was credited.
update votes v set created_at = now() - t.began::interval, confirmed_at = now() - t.credited::interval
from (values ('pi_s1', '90 minutes', '89 minutes'),   -- Ace, in the finished sprint
             ('pi_s2', '60 minutes', '25 minutes'),   -- Bea, credited inside the 10 minutes
             ('pi_s3', '45 minutes', '5 minutes'),    -- Bea, credited too late for the sprint
             ('pi_s4', '3 hours', '100 minutes'),     -- Cy, checkout began before the sprint
             ('pi_s5', '80 minutes', '79 minutes'),   -- Cy, refunded below
             ('pi_s6', '10 minutes', '9 minutes'),    -- Ace, in the live sprint
             ('pi_s7', '15 minutes', '14 minutes'))   -- Bea, in the live sprint
     as t(pi, began, credited)
where v.stripe_payment_intent_id = t.pi;
select refund_vote('pi_s5');

-- Bea's free vote, cast in the finished sprint.
insert into free_voters (id, contest_id, email, email_key, verified_at)
values ('5f100000-0000-0000-0000-0000000000f5', '5c000000-0000-0000-0000-0000000000c5', 'v@example.com', 'v@example.com', now());
insert into free_votes (round_id, entry_id, voter_id, vote_day, via, cast_at)
values ('51000000-0000-0000-0000-000000000015', '5b000000-0000-0000-0000-0000000000b5', '5f100000-0000-0000-0000-0000000000f5',
        current_date, 'code', now() - interval '70 minutes');


-- -------------------------------------------------------------- what counts --
select results_eq(
  $$ select entry_id, votes, place from sprint_standings
     where sprint_id = '5f000000-0000-0000-0000-000000000001' order by place $$,
  $$ values ('5b000000-0000-0000-0000-0000000000b5'::uuid, 26, 1), ('5a000000-0000-0000-0000-0000000000a5'::uuid, 25, 2) $$,
  'a pack begun in the window and credited within 10 minutes counts, and so does a free vote; a late credit, an early checkout and a refund do not');

select results_eq(
  $$ select entry_id, place from sprint_standings
     where sprint_id = '5f000000-0000-0000-0000-000000000002' order by place $$,
  $$ values ('5a000000-0000-0000-0000-0000000000a5'::uuid, 1), ('5b000000-0000-0000-0000-0000000000b5'::uuid, 2) $$,
  'a tie in the Open Round goes to the earlier entry, as the round''s does');

select is(
  (select sum(votes)::int from entry_round_totals where round_id = '51000000-0000-0000-0000-000000000015'),
  (select sum(quantity)::int from votes where round_id = '51000000-0000-0000-0000-000000000015' and status = 'succeeded') + 1,
  'sprint votes are ordinary votes: the round''s totals are untouched');


-- ---------------------------------------------------------------- settling --
select throws_ok($$ select settle_sprint('5f000000-0000-0000-0000-000000000002') $$, 'WP400', null,
  'a sprint still running cannot be settled');
select is(settle_sprint('5f000000-0000-0000-0000-000000000001'), '5b000000-0000-0000-0000-0000000000b5'::uuid,
  'settling names the winner');
select results_eq(
  $$ select winner_entry_id, winner_votes, settled_by from sprints where id = '5f000000-0000-0000-0000-000000000001' $$,
  $$ values ('5b000000-0000-0000-0000-0000000000b5'::uuid, 26, '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'and records who settled it');
select is((select count(*)::int from sprint_results where sprint_id = '5f000000-0000-0000-0000-000000000001'), 2,
  'the standings are snapshotted');

select refund_vote('pi_s2');
select results_eq(
  $$ select entry_id, votes from sprint_standings where sprint_id = '5f000000-0000-0000-0000-000000000001' and place = 1 $$,
  $$ values ('5b000000-0000-0000-0000-0000000000b5'::uuid, 26) $$,
  'a refund after settling changes the money, never the sprint');
select is(settle_sprint('5f000000-0000-0000-0000-000000000001'), '5b000000-0000-0000-0000-0000000000b5'::uuid,
  'settling again changes nothing');


-- ------------------------------------------------------------ scheduling --
select throws_ok(
  $$ select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '2 hours', now() + interval '4 hours',
                       'A $50 gift card', 'Example Pet Supply') $$,
  'WP400', null, 'a sprint needs a day''s notice');
select throws_ok(
  $$ select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '47 hours', now() + interval '49 hours',
                       'A $50 gift card', 'Example Pet Supply') $$,
  'WP400', null, 'a sprint fits inside the round');
select throws_ok(
  $$ select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '25 hours', now() + interval '25 hours 10 minutes',
                       'A $50 gift card', 'Example Pet Supply') $$,
  'WP400', null, 'a sprint runs at least half an hour');
select throws_ok(
  $$ select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '25 hours', now() + interval '27 hours',
                       'A', 'Example Pet Supply') $$,
  'WP400', null, 'a sprint names its prize');
select throws_ok(
  $$ select add_sprint('52000000-0000-0000-0000-000000000025', now() + interval '25 hours', now() + interval '27 hours',
                       'A $50 gift card', 'Example Pet Supply') $$,
  'WP400', null, 'no sprints where the contest has them off');

create temp table later as
  select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '25 hours', now() + interval '27 hours',
                    'A $50 gift card', 'Example Pet Supply', 'https://example.org', 'Tuesday night sprint') as id;
select is((select label from sprints where id = (select id from later)), 'Tuesday night sprint',
  'a sprint a day out, inside the round, is scheduled');
select throws_ok(
  $$ select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '26 hours', now() + interval '28 hours',
                       'Another prize', 'Another Sponsor') $$,
  'WP400', null, 'sprints cannot overlap');


-- ------------------------------------------------------------- cancelling --
select throws_ok($$ select cancel_sprint('5f000000-0000-0000-0000-000000000002', 'Changed our minds') $$, 'WP400', null,
  'a sprint that has started runs to the end');
select throws_ok($$ select cancel_sprint((select id from later), ' ') $$, 'WP400', null,
  'cancelling needs a reason');
select lives_ok($$ select cancel_sprint((select id from later), 'Sponsor withdrew') $$,
  'a sprint not yet started can be cancelled');
select lives_ok(
  $$ select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '26 hours', now() + interval '28 hours',
                       'Another prize', 'Another Sponsor') $$,
  'a cancelled sprint frees its window');
select throws_ok($$ select settle_sprint((select id from later)) $$, 'WP400', null,
  'a cancelled sprint is never settled');


-- ------------------------------------------------------------------ access --
select throws_ok($$ select set_sprints_enabled('5c000000-0000-0000-0000-0000000000c5', false) $$, 'WP400', null,
  'sprints switch on or off only while the contest is a draft');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select throws_ok($$ select settle_sprint('5f000000-0000-0000-0000-000000000002') $$, 'P0001', 'not authorized',
  'a signed-in non-admin cannot settle a sprint');

set local role anon;
select cmp_ok((select count(*)::int from sprint_standings), '>', 0, 'anyone can read the standings');
select throws_ok($$ select count(*) from sprint_results $$, '42501', null, 'the snapshot table is staff-only');
select throws_ok(
  $$ select add_sprint('51000000-0000-0000-0000-000000000015', now() + interval '30 hours', now() + interval '31 hours',
                       'A prize', 'A Sponsor') $$,
  '42501', null, 'anon cannot schedule a sprint');
reset role;

select * from finish();
rollback;
