-- Run with: supabase test db
--
-- The pet's profile answers (0026) and the 24-hour counts behind the
-- "climbing" marks (0027). The profile is the reader's words about the pet,
-- stored trimmed and moderated like the caption; the momentum view is a
-- count per pet for an open round, never a voter, never a finished round.

create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours, free_vote_enabled)
values ('9c000000-0000-0000-0000-0000000000c9', 2104, 'Momentum', 50,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24, true);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select id::uuid, '9c000000-0000-0000-0000-0000000000c9', name, 'dog', 'O', lower(name) || '@example.com', 'Wausau',
       'm/' || name || '.jpg', 'approved', now(), now(), now() - (mins || ' minutes')::interval
from (values ('9a000000-0000-0000-0000-0000000000a9', 'Ace', 3), ('9b000000-0000-0000-0000-0000000000b9', 'Bea', 2),
             ('9e000000-0000-0000-0000-0000000000e9', 'Cy', 1)) as t(id, name, mins);
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('91000000-0000-0000-0000-000000000019', '9c000000-0000-0000-0000-0000000000c9',
        1, 'open', 'open', now() - interval '3 days', now() + interval '1 day');
insert into vote_packs (contest_id, slug, label, votes, cents)
values ('9c000000-0000-0000-0000-0000000000c9', 'fan', 'Fan', 25, 2000);

select create_pending_vote('91000000-0000-0000-0000-000000000019', '9a000000-0000-0000-0000-0000000000a9', 'fan', 'a@example.com', 'pi_m_1'),
       create_pending_vote('91000000-0000-0000-0000-000000000019', '9a000000-0000-0000-0000-0000000000a9', 'fan', 'b@example.com', 'pi_m_2'),
       create_pending_vote('91000000-0000-0000-0000-000000000019', '9b000000-0000-0000-0000-0000000000b9', 'fan', 'c@example.com', 'pi_m_3'),
       create_pending_vote('91000000-0000-0000-0000-000000000019', '9b000000-0000-0000-0000-0000000000b9', 'fan', 'd@example.com', 'pi_m_4');
select confirm_vote(pi) from unnest(array['pi_m_1', 'pi_m_2', 'pi_m_3', 'pi_m_4']) pi;
-- Ace's first pack settled two days ago; Bea's second was refunded.
update votes set confirmed_at = now() - interval '2 days' where stripe_payment_intent_id = 'pi_m_1';
select refund_vote('pi_m_4');

insert into free_voters (id, contest_id, email, email_key, verified_at)
values ('9f000000-0000-0000-0000-0000000000f9', '9c000000-0000-0000-0000-0000000000c9', 'v@example.com', 'v@example.com', now()),
       ('9f000000-0000-0000-0000-0000000000fa', '9c000000-0000-0000-0000-0000000000c9', 'w@example.com', 'w@example.com', now());
insert into free_votes (round_id, entry_id, voter_id, vote_day, via)
values ('91000000-0000-0000-0000-000000000019', '9e000000-0000-0000-0000-0000000000e9', '9f000000-0000-0000-0000-0000000000f9', current_date, 'code'),
       ('91000000-0000-0000-0000-000000000019', '9e000000-0000-0000-0000-0000000000e9', '9f000000-0000-0000-0000-0000000000fa', current_date, 'code');
select void_free_voters(array['9f000000-0000-0000-0000-0000000000fa'::uuid], 'Test');


-- ---------------------------------------------------------------- momentum --
select results_eq(
  $$ select entry_id, votes_24h from entry_round_momentum
     where round_id = '91000000-0000-0000-0000-000000000019' order by entry_id $$,
  $$ values ('9a000000-0000-0000-0000-0000000000a9'::uuid, 25), ('9b000000-0000-0000-0000-0000000000b9'::uuid, 25),
            ('9e000000-0000-0000-0000-0000000000e9'::uuid, 1) $$,
  'the last 24 hours only: an older pack, a refund and a voided free vote drop out');

select is(
  (select votes from entry_round_totals where round_id = '91000000-0000-0000-0000-000000000019'
     and entry_id = '9a000000-0000-0000-0000-0000000000a9'),
  50,
  'the totals still count every settled pack; momentum is only the recent share');

set local role anon;
select is((select count(*)::int from entry_round_momentum where round_id = '91000000-0000-0000-0000-000000000019'), 3,
  'anon reads the counts: the board needs them');
select throws_ok($$ select buyer_email from votes limit 1 $$, '42501', null,
  'and still not the votes behind them');
reset role;

update rounds set status = 'resolved', resolved_at = now(), closes_at = now() - interval '1 hour'
where id = '91000000-0000-0000-0000-000000000019';
select is((select count(*)::int from entry_round_momentum where round_id = '91000000-0000-0000-0000-000000000019'), 0,
  'a finished round has no momentum: its results never move');


-- ----------------------------------------------------------------- profile --
-- seed.sql leaves contest c1 open for submissions.
select ok(
  insert_entry('00000000-0000-0000-0000-0000000000c1', 'Pickle', 'dog', 'Pat Doe', 'pat@example.com', 'Wausau',
               null, 'c1/pickle.jpg', false, 3, null, '  Pickle Rick  ', 'The squeaky hedgehog', '') is not null,
  'insert_entry takes the three answers');

select results_eq(
  $$ select profile_nickname, profile_favorite, profile_trick from entries where pet_name = 'Pickle' $$,
  $$ values ('Pickle Rick'::text, 'The squeaky hedgehog'::text, null::text) $$,
  'answers are stored trimmed, and an empty one is no answer');

select ok(
  insert_entry('00000000-0000-0000-0000-0000000000c1', 'Old Form', 'cat', 'Pat Doe', 'pat@example.com', 'Wausau',
               null, 'c1/old.jpg', false, 3, null) is not null,
  'a caller that sends no answers still works');

select throws_ok(
  $$ update entries set profile_nickname = repeat('x', 41) where pet_name = 'Pickle' $$,
  '23514', null,
  'a nickname past 40 characters is refused by the table, whoever writes it');

set local role authenticated;
select lives_ok(
  $$ update entries set profile_trick = 'Opens the fridge' where pet_name = 'Pickle' $$,
  'a moderator can correct an answer instead of rejecting the entry');
select throws_ok(
  $$ update entries set caption = 'changed' where pet_name = 'Pickle' $$,
  '42501', null,
  'but the caption stays the reader''s');
reset role;

select is((select profile_trick from entries where pet_name = 'Pickle'), 'Opens the fridge',
  'the correction is saved');

select * from finish();
rollback;
