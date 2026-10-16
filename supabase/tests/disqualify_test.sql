-- Run with: supabase test db
--
-- Removing a pet after voting has started. The policy being tested: every pack
-- bought for it is refunded, in a matchup its opponent advances whatever the
-- count, finished rounds keep their results, and nothing about it is credited
-- or mailed afterward.

create extension if not exists pgtap with schema extensions;

begin;
select plan(19);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours)
values ('d0000000-0000-0000-0000-00000000000d', 2094, 'Disqualify', 30,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24);

insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, thumb_path, status, rights_accepted_at, moderated_at, created_at)
values ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d', 'Ace', 'dog',
        'A', 'a@example.com', 'Wausau', 'd/a.jpg', 'd/a.thumb.jpg', 'approved', now(), now(), now() - interval '3 minutes'),
       ('db000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d', 'Bea', 'dog',
        'B', 'b@example.com', 'Wausau', 'd/b.jpg', null, 'approved', now(), now(), now() - interval '2 minutes'),
       ('dc000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d', 'Cy', 'cat',
        'C', 'c@example.com', 'Wausau', 'd/c.jpg', null, 'approved', now(), now(), now() - interval '1 minute');

insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d',
        1, 'open', 'open', now() - interval '2 days', now() + interval '1 day');

insert into vote_packs (contest_id, slug, label, votes, cents)
values ('d0000000-0000-0000-0000-00000000000d', 'fan', 'Fan', 25, 2000);

insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email,
                   stripe_payment_intent_id, status, confirmed_at)
values ('d1000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-00000000000a', 50, 4000, 'x@example.com', 'pi_d_a', 'succeeded', now()),
       ('d1000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-00000000000b', 30, 2400, 'y@example.com', 'pi_d_b', 'succeeded', now()),
       ('d1000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-00000000000c', 10, 800,  'z@example.com', 'pi_d_c', 'succeeded', now());

-- A checkout for Cy that has not been paid yet.
select create_pending_vote('d1000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-00000000000c',
                           'fan', 'late@example.com', 'pi_d_c_pending');


-- ------------------------------------------------------------ the guards --
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok(
  $$ select * from disqualify_entry('dc000000-0000-0000-0000-00000000000c', 'Stolen photo') $$,
  'not authorized', 'only an admin can disqualify');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$ select * from disqualify_entry('dc000000-0000-0000-0000-00000000000c', '  ') $$,
  'WP400', 'A reason is required. It is kept with the entry.',
  'a disqualification needs a reason');


-- ------------------------------------------------------ in the Open Round --
select results_eq(
  $$ select payment_intent from disqualify_entry('dc000000-0000-0000-0000-00000000000c', 'Stolen photo') $$,
  $$ values ('pi_d_c'::text) $$,
  'disqualifying returns every confirmed payment for the pet, to refund');

select results_eq(
  $$ select status::text, disqualified_by, disqualification_reason, disqualified_at is not null
     from entries where id = 'dc000000-0000-0000-0000-00000000000c' $$,
  $$ values ('disqualified', '11111111-1111-1111-1111-111111111111'::uuid, 'Stolen photo'::text, true) $$,
  'the decision is recorded: who, why, when');

select throws_ok(
  $$ select * from disqualify_entry('db000000-0000-0000-0000-00000000000b', 'Ineligible') $$,
  'WP400', 'Disqualifying would leave 1 approved entries for a 2-pet bracket.',
  'the Open Round field cannot drop below the bracket size');

create temp table probe (n int);
grant all on probe to anon;
set local role anon;
insert into probe select count(id) from entries where contest_id = 'd0000000-0000-0000-0000-00000000000d';
reset role;
select is((select n from probe), 2, 'a disqualified pet leaves the public site');

select throws_ok(
  $$ select * from vote_quote('d1000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-00000000000c', 'fan') $$,
  'WP400', 'That pet is not in this contest.',
  'nobody can buy votes for it');

select is(confirm_vote('pi_d_c_pending'), 'late',
  'a payment for it that lands afterward is not credited, and the webhook refunds it');

select results_eq(
  $$ select payment_intent from disqualify_entry('dc000000-0000-0000-0000-00000000000c', null) $$,
  $$ values ('pi_d_c'::text) $$,
  'running it again returns what is still unrefunded, so failed refunds can be retried');

select refund_vote('pi_d_c');
select is_empty(
  $$ select * from disqualify_entry('dc000000-0000-0000-0000-00000000000c', null) $$,
  'once refunded there is nothing left to retry');

select throws_ok(
  $$ update entries set status = 'disqualified' where id = 'db000000-0000-0000-0000-00000000000b' $$,
  '23514', null,
  'an entry cannot be marked disqualified without the record that says why');

insert into storage.objects (bucket_id, name) values ('pets', 'd/c.jpg');
set local role authenticated;
select results_eq(
  $$ select object_name from rejected_photos_live where pet_name = 'Cy' $$,
  $$ values ('d/c.jpg'::text) $$,
  'its photo still in the bucket is flagged like a rejected one');
reset role;


-- ------------------------------------------------------------ in a matchup --
update rounds set closes_at = now() - interval '11 minutes' where id = 'd1000000-0000-0000-0000-000000000001';
select close_round('d1000000-0000-0000-0000-000000000001');

-- Ace leads the final by a mile, and is then disqualified.
update rounds set status = 'open', opens_at = now() - interval '2 hours', closes_at = now() - interval '11 minutes'
where contest_id = 'd0000000-0000-0000-0000-00000000000d' and seq = 2;
insert into votes (round_id, entry_id, matchup_id, quantity, amount_cents, buyer_email,
                   stripe_payment_intent_id, status, confirmed_at)
select r.id, 'da000000-0000-0000-0000-00000000000a', m.id, 100, 8000, 'x@example.com', 'pi_d_a2', 'succeeded', now()
from rounds r join matchups m on m.round_id = r.id
where r.contest_id = 'd0000000-0000-0000-0000-00000000000d' and r.seq = 2;

select results_eq(
  $$ select payment_intent from disqualify_entry('da000000-0000-0000-0000-00000000000a', 'Owner bought votes with a stolen card') order by 1 $$,
  $$ values ('pi_d_a'::text), ('pi_d_a2') $$,
  'every round''s packs are refunded, not just the current one');

select is(
  close_round((select id from rounds where contest_id = 'd0000000-0000-0000-0000-00000000000d' and seq = 2)),
  null, 'the final closes');

select is(
  (select w.pet_name from matchups m
   join rounds r on r.id = m.round_id and r.seq = 2
   join entries w on w.id = m.winner_entry_id
   where r.contest_id = 'd0000000-0000-0000-0000-00000000000d'),
  'Bea',
  'the opponent advances whatever the count');

select is(
  (select votes from entry_round_totals
   where round_id = 'd1000000-0000-0000-0000-000000000001' and entry_id = 'da000000-0000-0000-0000-00000000000a'),
  50,
  'the Open Round''s published result stands');

select results_eq(
  $$ select q.kind, q.pet_name from notification_queue(500) q
     join entries e on e.id = q.entry_id
     where e.contest_id = 'd0000000-0000-0000-0000-00000000000d'
     order by 1, 2 $$,
  $$ values ('champion'::text, 'Bea'::text) $$,
  'the disqualified owners get no templated email; the champion does');

select throws_ok(
  $$ select * from disqualify_entry('db000000-0000-0000-0000-00000000000b', 'Late discovery') $$,
  'WP400', null,
  'once the contest is complete its results are final');


-- ------------------------------------------------------------- the alert --
update entries set disqualified_at = now() - interval '20 minutes'
where id = 'da000000-0000-0000-0000-00000000000a';
select results_eq(
  $$ select severity, items from contest_health() where check_name = 'disqualified_unrefunded' $$,
  $$ values ('alert'::text, 2) $$,
  'refunds still outstanding 15 minutes after a disqualification raise an alert');


select * from finish();
rollback;
