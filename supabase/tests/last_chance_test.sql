-- Run with: supabase test db
--
-- Last Chance (0032): in a contest that switches it on, places bracket_size
-- to bracket_size + 4 get more time after the Open Round's clock runs out,
-- and the best of them takes the last seed. Here the bracket is 4, so the
-- top 3 are in and places 4 to 8 race; the 9th is out.
--
-- Pinned: it cannot be skipped or started early, who is in and who races is
-- snapshotted, only the pool can be voted for (packs and free votes), every
-- deadline follows the pet, the stale-checkout sweep and the health check
-- agree, and the seeding fills a seed vacated during Last Chance from the
-- pool, ties to the better starting place, with round numbers unchanged.

create extension if not exists pgtap with schema extensions;

begin;
select plan(31);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at, submissions_close_at,
                      status, bracket_size, bracket_round_hours, free_vote_enabled, last_chance_enabled)
values ('1c000000-0000-0000-0000-0000000000c1', 2109, 'Last Chance', 50,
        now() - interval '10 days', now() - interval '3 days', 'voting', 4, 24, true, true);

-- Nine pets, A entered first. Their names say their Open Round place.
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select ('1e000000-0000-0000-0000-00000000000' || n)::uuid, '1c000000-0000-0000-0000-0000000000c1',
       name, 'dog', 'O', lower(name) || '@example.com', 'Wausau', 'l/' || name || '.jpg',
       'approved', now(), now(), now() - ((10 - n) || ' hours')::interval
from (values (1, 'A'), (2, 'B'), (3, 'C'), (4, 'D'), (5, 'E'), (6, 'F'), (7, 'G'), (8, 'H'), (9, 'I')) as t(n, name);

-- Open while the votes go in; the clock is wound back below.
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('11000000-0000-0000-0000-000000000011', '1c000000-0000-0000-0000-0000000000c1',
        1, 'open', 'open', now() - interval '3 days', now() + interval '1 day');
insert into vote_packs (contest_id, slug, label, votes, cents)
select '1c000000-0000-0000-0000-0000000000c1', 'p' || v, 'P' || v, v, v * 10
from unnest(array[10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) v;

-- A 100, B 90 ... I 20.
select create_pending_vote('11000000-0000-0000-0000-000000000011', ('1e000000-0000-0000-0000-00000000000' || n)::uuid,
                           'p' || (110 - n * 10), 'b' || n || '@example.com', 'pi_lc_' || n)
from generate_series(1, 9) n;
select confirm_vote('pi_lc_' || n, now() - interval '2 hours') from generate_series(1, 9) n;

-- Checkouts opened before the close, paid (or not) later.
select create_pending_vote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000001', 'p10', 'late@example.com', 'pi_lc_late_a'),
       create_pending_vote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000005', 'p10', 'hold@example.com', 'pi_lc_hold_e'),
       create_pending_vote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000002', 'p10', 'stale@example.com', 'pi_lc_stale_b'),
       create_pending_vote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000006', 'p10', 'open@example.com', 'pi_lc_open_f');

-- The Open Round's clock ran out half an hour ago.
update rounds set closes_at = now() - interval '30 minutes' where id = '11000000-0000-0000-0000-000000000011';

insert into free_voters (id, contest_id, email, email_key, verified_at)
values ('1f000000-0000-0000-0000-0000000000f1', '1c000000-0000-0000-0000-0000000000c1', 'v1@example.com', 'v1@example.com', now()),
       ('1f000000-0000-0000-0000-0000000000f2', '1c000000-0000-0000-0000-0000000000c1', 'v2@example.com', 'v2@example.com', now());


-- ------------------------------------------------------- before it starts --
select throws_ok(
  $$ select vote_quote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000004', 'p10') $$,
  'WP400', null, 'between the clock and the start, nobody can be voted for');
select throws_like(
  $$ select close_round('11000000-0000-0000-0000-000000000011') $$,
  '%Last Chance is part of this contest%', 'the Open Round cannot close around the Last Chance the rules promise');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select throws_ok($$ select start_last_chance('11000000-0000-0000-0000-000000000011') $$, 'P0001', 'not authorized',
  'staff only');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

update contests set last_chance_enabled = false where id = '1c000000-0000-0000-0000-0000000000c1';
select throws_ok($$ select start_last_chance('11000000-0000-0000-0000-000000000011') $$, 'WP400', null,
  'not where the contest has it off');
update contests set last_chance_enabled = true where id = '1c000000-0000-0000-0000-0000000000c1';

select throws_ok($$ select start_last_chance('11000000-0000-0000-0000-000000000011', now() + interval '20 minutes') $$,
  'WP400', null, 'it runs at least an hour');
select throws_ok($$ select set_last_chance_enabled('1c000000-0000-0000-0000-0000000000c1', false) $$, 'WP400', null,
  'the switch moves only while the contest is a draft');


-- --------------------------------------------------------------- the start --
select is(start_last_chance('11000000-0000-0000-0000-000000000011'), 5, 'places 4 to 8 race: five pets');
select results_eq(
  $$ select e.pet_name::text, f.place, f.pool from last_chance_field f join entries e on e.id = f.entry_id
     where f.round_id = '11000000-0000-0000-0000-000000000011' order by f.place $$,
  $$ values ('A', 1, false), ('B', 2, false), ('C', 3, false), ('D', 4, true), ('E', 5, true),
            ('F', 6, true), ('G', 7, true), ('H', 8, true) $$,
  'the standings at the start are snapshotted; the ninth is out');
select ok((select overtime_closes_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
           from rounds where id = '11000000-0000-0000-0000-000000000011'),
  'it runs 24 hours by default');
select is((select status::text from rounds where id = '11000000-0000-0000-0000-000000000011'), 'open',
  'the Open Round stays open: Last Chance is overtime, not a round');
select throws_ok($$ select start_last_chance('11000000-0000-0000-0000-000000000011') $$, 'WP400', null,
  'it starts once');
select results_eq(
  $$ select pet_name, rank, field_size, cut_margin from notification_queue(50) where kind = 'last_chance' order by rank $$,
  $$ values ('D'::text, 4, 5, 0), ('E', 5, 5, 10), ('F', 6, 5, 20), ('G', 7, 5, 30), ('H', 8, 5, 40) $$,
  'each pool pet''s owner hears, with the place and the votes behind the leader; nobody else does');


-- ---------------------------------------------------------- during it --
select lives_ok(
  $$ select vote_quote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000004', 'p10') $$,
  'a pet in the pool can be voted for');
select throws_like(
  $$ select vote_quote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000001', 'p10') $$,
  '%Only the Last Chance pets%', 'a pet already in cannot');
select throws_ok(
  $$ select vote_quote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000009', 'p10') $$,
  'WP400', null, 'nor can the ninth');

select create_pending_vote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000008', 'p100', 'h@example.com', 'pi_lc_h');
select is(confirm_vote('pi_lc_h', now()), 'confirmed', 'a pack for the pool, paid now, counts');
select is(confirm_vote('pi_lc_late_a', now()), 'late', 'a checkout for a pet already in, paid after the clock, is late');
select is(confirm_vote('pi_lc_hold_e', now()), 'confirmed', 'a checkout for a pool pet, opened before the clock and paid now, counts');

select ok(
  exists (select 1 from stale_pending_intents(50) s where s.payment_intent = 'pi_lc_stale_b')
  and not exists (select 1 from stale_pending_intents(50) s where s.payment_intent = 'pi_lc_open_f'),
  'the stale-checkout sweep cancels a dead checkout, not a pool pet''s live one');

select is(free_vote_record('1f000000-0000-0000-0000-0000000000f1', '11000000-0000-0000-0000-000000000011',
                           '1e000000-0000-0000-0000-000000000007', 'device', now(), null), 'cast',
  'a free vote for a pool pet counts');
select throws_ok(
  $$ select free_vote_record('1f000000-0000-0000-0000-0000000000f2', '11000000-0000-0000-0000-000000000011',
                             '1e000000-0000-0000-0000-000000000002', 'device', now(), null) $$,
  'WP400', null, 'a free vote for a pet already in is refused');

select is_empty(
  $$ select 1 from contest_health() where check_name = 'round_not_finalized' $$,
  'the health check does not call a Last Chance an unfinished round');
select throws_ok($$ select close_round('11000000-0000-0000-0000-000000000011') $$, 'WP400', null,
  'the Open Round waits for Last Chance to end');

-- B leaves during Last Chance: the pool fills two seeds.
select withdraw_entry('1e000000-0000-0000-0000-000000000002', 'Rehomed');


-- ----------------------------------------------------------------- the end --
update rounds set overtime_closes_at = now() - interval '15 minutes' where id = '11000000-0000-0000-0000-000000000011';
select throws_ok(
  $$ select vote_quote('11000000-0000-0000-0000-000000000011', '1e000000-0000-0000-0000-000000000004', 'p10') $$,
  'WP400', null, 'when Last Chance ends, nobody can be voted for');

create temp table nxt as select close_round('11000000-0000-0000-0000-000000000011') as id;
select results_eq(
  $$ select pet_name::text, seed from entries where contest_id = '1c000000-0000-0000-0000-0000000000c1' and seed is not null order by seed $$,
  $$ values ('A', 1), ('C', 2), ('H', 3), ('D', 4) $$,
  'above-the-line pets keep their order; the pool''s best fill the rest (H on 130; D over E on a 70-70 tie, the better start)');
select results_eq(
  $$ select seq, kind::text from rounds where id = (select id from nxt) $$,
  $$ values (2, 'bracket') $$,
  'the bracket starts at round 2, as always: no round numbers move');
select results_eq(
  $$ select a.pet_name::text, b.pet_name::text from matchups m
     join entries a on a.id = m.entry_a_id join entries b on b.id = m.entry_b_id
     where m.round_id = (select id from nxt) order by m.slot $$,
  $$ values ('A', 'D'), ('C', 'H') $$,
  'the bracket is built from those seeds');
select is(
  (select votes from round_results where round_id = '11000000-0000-0000-0000-000000000011'
     and entry_id = '1e000000-0000-0000-0000-000000000008'),
  130, 'the Open Round''s results include Last Chance votes');
select is((select status::text from rounds where id = '11000000-0000-0000-0000-000000000011'), 'resolved',
  'and the round resolves as any does');

set local role anon;
select cmp_ok((select count(*)::int from last_chance_field), '>', 0, 'anyone can read the snapshot');
select throws_ok($$ select start_last_chance('11000000-0000-0000-0000-000000000011') $$, '42501', null,
  'anon cannot start one');
reset role;

select * from finish();
rollback;
