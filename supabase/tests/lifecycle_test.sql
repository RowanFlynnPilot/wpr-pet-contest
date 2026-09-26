-- Run with: supabase test db
--
-- One small contest, played end to end through the functions production uses:
-- pricing, bonus windows, confirmation, disputes, late payments, the round
-- window rules, side awards, and who is owed an email afterward.
--
-- A two-pet bracket keeps it short: three entries, two qualify, one final.

create extension if not exists pgtap with schema extensions;

begin;
select plan(55);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours)
values ('77777777-7777-7777-7777-777777777777', 2097, 'Lifecycle', 30,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24);

insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
values ('7a000000-0000-0000-0000-00000000000a', '77777777-7777-7777-7777-777777777777', 'Alpha', 'dog',
        'A', 'a@example.com', 'Wausau', 'l/a.jpg', 'approved', now(), now(), now() - interval '3 minutes'),
       ('7b000000-0000-0000-0000-00000000000b', '77777777-7777-7777-7777-777777777777', 'Bravo', 'dog',
        'B', 'b@example.com', 'Wausau', 'l/b.jpg', 'approved', now(), now(), now() - interval '2 minutes'),
       ('7c000000-0000-0000-0000-00000000000c', '77777777-7777-7777-7777-777777777777', 'Charlie', 'cat',
        'C', 'c@example.com', 'Wausau', 'l/c.jpg', 'approved', now(), now(), now() - interval '1 minute');

insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('71000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777',
        1, 'open', 'open', now() - interval '1 hour', now() + interval '1 day');

insert into vote_packs (contest_id, slug, label, votes, cents, active)
values ('77777777-7777-7777-7777-777777777777', 'fan',  'Fan',  25, 2000, true),
       ('77777777-7777-7777-7777-777777777777', 'gone', 'Gone', 10,  800, false);


-- ------------------------------------------------------------------ quote --
select results_eq(
  $$ select votes, cents, multiplier from vote_quote(
       '71000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a', 'fan') $$,
  $$ values (25, 2000, 1) $$,
  'a pack is priced by the database, not the caller');

select throws_ok(
  $$ select * from vote_quote('71000000-0000-0000-0000-000000000001',
                              '7a000000-0000-0000-0000-00000000000a', 'gone') $$,
  'WP400', 'That vote pack is not available.',
  'a retired pack cannot be bought');

select throws_ok(
  $$ select * from vote_quote('71000000-0000-0000-0000-000000000001',
       (select id from entries where contest_id = '00000000-0000-0000-0000-0000000000c1' limit 1), 'fan') $$,
  'WP400', 'That pet is not in this contest.',
  'votes cannot be bought for a pet in a different contest');


-- ---------------------------------------------------------- bonus windows --
insert into bonus_windows (id, contest_id, starts_at, ends_at, multiplier, label, sponsor_name)
values ('7d000000-0000-0000-0000-00000000000d', '77777777-7777-7777-7777-777777777777',
        now() - interval '10 minutes', now() + interval '50 minutes', 2, 'Double Vote Hour', 'Sponsor Co');

select results_eq(
  $$ select votes, cents, multiplier, bonus_label from vote_quote(
       '71000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a', 'fan') $$,
  $$ values (50, 2000, 2, 'Double Vote Hour'::text) $$,
  'inside a bonus window the same price buys double');

select throws_ok(
  $$ insert into bonus_windows (contest_id, starts_at, ends_at, multiplier)
     values ('77777777-7777-7777-7777-777777777777', now(), now() + interval '2 hours', 3) $$,
  '23P01', null,
  'overlapping bonus windows are refused, so the multiplier is never ambiguous');

select results_eq(
  $$ select votes, cents, multiplier from create_pending_vote(
       '71000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a',
       'fan', 'buyer1@example.com', 'pi_l_1', true) $$,
  $$ values (50, 2000, 2) $$,
  'the multiplier is locked in when checkout begins');

select results_eq(
  $$ select quantity, bonus_multiplier, pack_slug, newsletter_opt_in
     from votes where stripe_payment_intent_id = 'pi_l_1' $$,
  $$ values (50, 2, 'fan'::text, true) $$,
  'the pending vote records pack, multiplier and opt-in');

delete from bonus_windows where id = '7d000000-0000-0000-0000-00000000000d';

select results_eq(
  $$ select votes from create_pending_vote(
       '71000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000000b',
       'fan', 'buyer2@example.com', 'pi_l_2') $$,
  $$ values (25) $$,
  'outside a window a pack buys its face value');


-- ----------------------------------------------------------- confirmation --
select is(confirm_vote('pi_l_1'), 'confirmed', 'the webhook confirms a pending vote');
select is(confirm_vote('pi_l_1'), 'duplicate', 'a webhook retry changes nothing');
select is(confirm_vote('pi_l_2'), 'confirmed', 'a second buyer is confirmed');

select results_eq(
  $$ select entry_id, votes from entry_round_totals
     where round_id = '71000000-0000-0000-0000-000000000001' order by votes desc $$,
  $$ values ('7a000000-0000-0000-0000-00000000000a'::uuid, 50),
            ('7b000000-0000-0000-0000-00000000000b'::uuid, 25) $$,
  'confirmed votes appear on the leaderboard, bonus included');


-- --------------------------------------------------------------- disputes --
select create_pending_vote('71000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000000b',
                           'fan', 'chargeback@example.com', 'pi_l_3');
select confirm_vote('pi_l_3');
select is((select votes from entry_round_totals
           where entry_id = '7b000000-0000-0000-0000-00000000000b'), 50,
  'before the chargeback the votes count');

select mark_vote_disputed('pi_l_3');
select is((select votes from entry_round_totals
           where entry_id = '7b000000-0000-0000-0000-00000000000b'), 25,
  'a chargeback takes its votes back out');

select results_eq(
  $$ select gross_cents, shelter_cents from contest_stats
     where contest_id = '77777777-7777-7777-7777-777777777777' $$,
  $$ values (4000::bigint, 1200::bigint) $$,
  'the public raised-for-shelters number excludes disputed money');

select is(
  (select count(*)::int from recent_activity where round_id = '71000000-0000-0000-0000-000000000001'),
  2,
  'the activity ticker shows confirmed purchases only');


-- ------------------------------------------------------------ late votes --
-- Three more buyers start checkout while round 1 is open. Charlie's pays after
-- the results are final. Bravo's two pay after the deadline has passed: one had
-- paid in time and its webhook is merely slow; the other is sniping.
select create_pending_vote('71000000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-00000000000c', 'fan', 'late@example.com',   'pi_l_late');
select create_pending_vote('71000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000000b', 'fan', 'ontime@example.com', 'pi_l_ontime');
select create_pending_vote('71000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000000b', 'fan', 'sniper@example.com', 'pi_l_snipe');


-- -------------------------------------------------------- partial refunds --
select record_partial_refund('pi_l_2', 500);

select results_eq(
  $$ select gross_cents, shelter_cents from contest_stats
     where contest_id = '77777777-7777-7777-7777-777777777777' $$,
  $$ values (3500::bigint, 1050::bigint) $$,
  'a partial refund comes off the money raised, and so off the shelters'' share');

select is((select votes from entry_round_totals where entry_id = '7b000000-0000-0000-0000-00000000000b'), 25,
  'the votes a partially refunded pack bought still stand');


-- ------------------------------------------------------------ the deadline --
select throws_ok(
  $$ select close_round('71000000-0000-0000-0000-000000000001') $$,
  'WP400', null,
  'a round cannot be finalized before its deadline plus the settle period');

-- The deadline passes: moved into the past rather than waited for.
update rounds set closes_at = now() - interval '11 minutes' where id = '71000000-0000-0000-0000-000000000001';

select is(confirm_vote('pi_l_snipe', now()), 'late',
  'a payment made after the deadline does not count, even while the round is still open');

select is(confirm_vote('pi_l_ontime', now() - interval '12 minutes'), 'confirmed',
  'a payment made before the deadline counts even when its webhook arrives late');


-- ----------------------------------------------------------- round 1 close --
-- The contest's own bracket_size (2) is used; there is no override to get wrong.
select isnt(close_round('71000000-0000-0000-0000-000000000001'), null,
  'closing round 1 seeds the contest''s own bracket size and builds the next round');

select results_eq(
  $$ select pet_name, seed from entries
     where contest_id = '77777777-7777-7777-7777-777777777777' order by pet_name $$,
  $$ values ('Alpha'::text, 1), ('Bravo', 2), ('Charlie', null) $$,
  'seeds follow round 1 votes, a tie going to the earlier entry; late payments did not count');

select is(confirm_vote('pi_l_late'), 'late',
  'a payment settling after its round resolved is reported late');

select is(confirm_vote('pi_l_late'), 'late',
  'a redelivery still reports it late, so a refund that failed is attempted again');

select is(
  (select votes from entry_round_totals where entry_id = '7c000000-0000-0000-0000-00000000000c'),
  null,
  'a late vote never changes a resolved round''s published total');

select is(
  (select count(*)::int from late_confirmations where stripe_payment_intent_id = 'pi_l_late'),
  1,
  'late_confirmations lists it until the refund lands');

select refund_vote('pi_l_late');
select is(
  (select count(*)::int from late_confirmations
   where stripe_payment_intent_id in ('pi_l_late')),
  0,
  'once refunded it drops out, and the check is back to zero rows');

-- Alpha's round 1 buyer charges back after the results are out.
select mark_vote_disputed('pi_l_1');
select is(
  (select votes from entry_round_totals where round_id = '71000000-0000-0000-0000-000000000001' and entry_id = '7a000000-0000-0000-0000-00000000000a'),
  50,
  'a chargeback after results are final does not rewrite them');


-- -------------------------------------------------------- round 2 window --
select is(
  (select closes_at - opens_at from rounds
   where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2),
  interval '24 hours',
  'the next round is scheduled for the contest''s bracket_round_hours');

select throws_ok(
  $$ select * from vote_quote(
       (select id from rounds where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2),
       '7a000000-0000-0000-0000-00000000000a', 'fan') $$,
  'WP400', 'Voting is closed for this round.',
  'a pending round sells no votes');

select throws_ok(
  $$ select open_round(
       (select id from rounds where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2),
       now() + interval '10 minutes') $$,
  null,
  'a round cannot be opened with under an hour left to vote');

-- As if round 1 had closed early: round 2 is scheduled to start tomorrow.
-- Opening it now must open checkout now, not tomorrow.
update rounds set opens_at = now() + interval '1 day', closes_at = now() + interval '2 days'
where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2;

select lives_ok(
  $$ select open_round(
       (select id from rounds where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2)) $$,
  'round 2 opens ahead of its scheduled start');

select ok(
  (select opens_at <= now() from rounds
   where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2),
  'opening a round moves opens_at to now, so checkout works immediately');

select lives_ok(
  $$ select * from vote_quote(
       (select id from rounds where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2),
       '7a000000-0000-0000-0000-00000000000a', 'fan') $$,
  'votes can be bought the moment a round opens');

select results_eq(
  $$ select q.pet_name, q.opponent_name, q.round_name from notification_queue(500) q
     join entries e on e.id = q.entry_id
     where e.contest_id = '77777777-7777-7777-7777-777777777777' and q.kind = 'advanced'
     order by q.pet_name $$,
  $$ values ('Alpha'::text, 'Bravo'::text, 'Championship'::text), ('Bravo', 'Alpha', 'Championship') $$,
  'while the final is ahead, both finalists are owed an advancement email naming their opponent');

select throws_ok(
  $$ select * from vote_quote(
       (select id from rounds where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2),
       '7c000000-0000-0000-0000-00000000000c', 'fan') $$,
  'WP400', 'Charlie is not in this round.',
  'an eliminated pet cannot receive votes');


-- ------------------------------------------------------------- the final --
-- Alpha won round 1 by a mile. Bravo wins the final: totals reset.
select create_pending_vote(r.id, '7a000000-0000-0000-0000-00000000000a', 'fan', 'x@example.com', 'pi_f_a'),
       create_pending_vote(r.id, '7b000000-0000-0000-0000-00000000000b', 'fan', 'y@example.com', 'pi_f_b1'),
       create_pending_vote(r.id, '7b000000-0000-0000-0000-00000000000b', 'fan', 'z@example.com', 'pi_f_b2')
from rounds r where r.contest_id = '77777777-7777-7777-7777-777777777777' and r.seq = 2;
select confirm_vote(pi) from unnest(array['pi_f_a', 'pi_f_b1', 'pi_f_b2']) pi;

update rounds set opens_at = now() - interval '1 day', closes_at = now() - interval '11 minutes'
where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2;

select is(
  close_round((select id from rounds where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2)),
  null,
  'closing the final returns null');

select results_eq(
  $$ select c.status::text, w.pet_name
     from contests c
     join rounds r on r.contest_id = c.id and r.seq = 2
     join matchups m on m.round_id = r.id
     join entries w on w.id = m.winner_entry_id
     where c.id = '77777777-7777-7777-7777-777777777777' $$,
  $$ values ('complete', 'Bravo'::text) $$,
  'the contest completes and the final is decided by final-round votes alone');


-- ------------------------------------------------------------ side awards --
select results_eq(
  $$ select species::text, pet_name from side_awards
     where contest_id = '77777777-7777-7777-7777-777777777777' order by species $$,
  $$ values ('cat', 'Charlie'::text), ('dog', 'Alpha') $$,
  'Best Dog and Best Cat come from round 1 totals');


-- -------------------------------------------------------------- the mail --
select results_eq(
  $$ select q.kind, q.pet_name from notification_queue(500) q
     join entries e on e.id = q.entry_id
     where e.contest_id = '77777777-7777-7777-7777-777777777777'
     order by q.kind, q.pet_name $$,
  $$ values ('champion', 'Bravo'::text),
            ('eliminated', 'Alpha'), ('eliminated', 'Charlie') $$,
  'after the final: the champion and the eliminated are owed mail, and nobody gets a stale "you advanced"');

select is(
  (select round_name from notification_queue(500)
   where kind = 'champion'),
  'Championship',
  'round names come from round_label');

insert into notifications (kind, entry_id, round_id, to_email, status)
select 'champion', m.winner_entry_id, r.id, 'b@example.com', 'sent'
from rounds r join matchups m on m.round_id = r.id
where r.contest_id = '77777777-7777-7777-7777-777777777777' and r.seq = 2;

select is(
  (select count(*)::int from notification_queue(500) where kind = 'champion'),
  0,
  'a recorded send is never sent again');

select throws_ok(
  $$ insert into notifications (kind, entry_id, round_id, to_email, status)
     values ('champion', '7b000000-0000-0000-0000-00000000000b',
             (select id from rounds where contest_id = '77777777-7777-7777-7777-777777777777' and seq = 2),
             'b@example.com', 'sent') $$,
  '23505', null,
  'two concurrent sweeps cannot both record the same email');


-- ------------------------------------------------------------ round names --
select results_eq(
  $$ select round_label(s, 16) from generate_series(1, 5) s $$,
  $$ values ('Open Round'), ('Sweet 16'), ('Elite Eight'), ('Final Four'), ('Championship') $$,
  'a 16 bracket is named Sweet 16 through Championship');

select is(round_label(2, 32), 'Round of 32', 'a larger bracket falls back to Round of N');


-- ------------------------------------------------------------ insert_entry --
select throws_ok(
  $$ select insert_entry('77777777-7777-7777-7777-777777777777', 'Latecomer', 'dog', 'L',
                         'l@example.com', 'Wausau', null, 'x/l.jpg', false, 5) $$,
  'WP400', 'Submissions are closed.',
  'no entry lands in a contest whose field is already set');

select isnt(
  insert_entry('00000000-0000-0000-0000-0000000000c1', 'Newcomer', 'cat', 'N',
               'n@example.com', 'Wausau', 'Hi', 'x/n.jpg', true, 1),
  null,
  'an entry lands in an open contest');

select results_eq(
  $$ select status::text, rights_accepted_at is not null, newsletter_opt_in
     from entries where pet_name = 'Newcomer' $$,
  $$ values ('pending', true, true) $$,
  'it lands pending, with the rights release timestamped');

select throws_ok(
  $$ select insert_entry('00000000-0000-0000-0000-0000000000c1', 'Second', 'cat', 'N',
                         'N@Example.com', 'Wausau', null, 'x/n2.jpg', false, 1) $$,
  'WP400', 'Each email address can enter up to 1 pets.',
  'the per-email cap holds, whatever the capitalization');


-- --------------------------------------------------------- open_submissions --
insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status)
values ('78888888-8888-8888-8888-888888888888', 2096, 'Draft', 25,
        now(), now() + interval '7 days', 'draft');

select throws_ok(
  $$ select open_submissions('78888888-8888-8888-8888-888888888888') $$,
  null,
  'a contest with no vote packs cannot open');

insert into vote_packs (contest_id, slug, label, votes, cents)
values ('78888888-8888-8888-8888-888888888888', 'fan', 'Fan', 25, 2000);

-- The seed contest holds the one submissions_open slot; free it.
update contests set status = 'complete' where id = '00000000-0000-0000-0000-0000000000c1';

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok(
  $$ select open_submissions('78888888-8888-8888-8888-888888888888') $$,
  'not authorized',
  'only an admin can open submissions');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$ select open_submissions('78888888-8888-8888-8888-888888888888') $$,
  'an admin opens submissions through the function, not an UPDATE');

select results_eq(
  $$ select r.seq, r.kind::text, r.status::text,
            r.opens_at = c.submissions_close_at,
            r.closes_at = c.submissions_close_at + interval '7 days'
     from rounds r join contests c on c.id = r.contest_id
     where c.id = '78888888-8888-8888-8888-888888888888' $$,
  $$ values (1, 'open', 'pending', true, true) $$,
  'opening submissions stages round 1: from the close of submissions, for a week');

insert into entries (contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at)
values ('78888888-8888-8888-8888-888888888888', 'Solo', 'dog', 'S', 's@example.com',
        'Wausau', 'd/s.jpg', 'approved', now(), now());

select throws_ok(
  $$ select open_round((select id from rounds
                        where contest_id = '78888888-8888-8888-8888-888888888888' and seq = 1)) $$,
  null,
  'round 1 will not open with fewer approved entries than the bracket needs');


select * from finish();
rollback;
