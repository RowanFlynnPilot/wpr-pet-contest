-- Run with: supabase test db
--
-- An owner withdraws a pet. The policy being tested: nobody is refunded and the
-- shelters' share stands; otherwise it leaves as a disqualified pet does (its
-- opponent advances, its free votes go back, a later payment is refunded as
-- late, its photo is flagged until deleted), and no template email follows.

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours, free_vote_enabled)
values ('bc000000-0000-0000-0000-0000000000bc', 2098, 'Withdrawal', 30,
        now() - interval '20 days', now() - interval '13 days', 'voting', 2, 24, true);

insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, thumb_path, status, rights_accepted_at, moderated_at, created_at, seed)
values ('ba000000-0000-0000-0000-00000000000a', 'bc000000-0000-0000-0000-0000000000bc', 'Ash', 'dog', 'A', 'a@example.com',
        'Wausau', 'w/a.jpg', 'w/a.thumb.jpg', 'approved', now(), now(), now() - interval '9 minutes', 1),
       ('bb000000-0000-0000-0000-00000000000b', 'bc000000-0000-0000-0000-0000000000bc', 'Bix', 'cat', 'B', 'b@example.com',
        'Wausau', 'w/b.jpg', null, 'approved', now(), now(), now() - interval '8 minutes', 2),
       ('bd000000-0000-0000-0000-00000000000d', 'bc000000-0000-0000-0000-0000000000bc', 'Dee', 'dog', 'D', 'd@example.com',
        'Wausau', 'w/d.jpg', null, 'approved', now(), now(), now() - interval '7 minutes', null);

insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at, resolved_at)
values ('b1000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-0000000000bc', 1, 'open', 'resolved',
        now() - interval '12 days', now() - interval '5 days', now() - interval '5 days'),
       ('b2000000-0000-0000-0000-000000000002', 'bc000000-0000-0000-0000-0000000000bc', 2, 'bracket', 'open',
        now() - interval '1 day', now() + interval '1 day', null);
insert into matchups (id, round_id, slot, entry_a_id, entry_b_id)
values ('bf000000-0000-0000-0000-00000000000f', 'b2000000-0000-0000-0000-000000000002', 0,
        'ba000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-00000000000b');

insert into vote_packs (contest_id, slug, label, votes, cents)
values ('bc000000-0000-0000-0000-0000000000bc', 'fan', 'Fan', 25, 2000);

-- Ash leads comfortably; one checkout for Ash is still unpaid.
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email, stripe_payment_intent_id, status, confirmed_at)
values ('b2000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-00000000000a', 100, 8000, 'x@example.com', 'pi_w_a', 'succeeded', now()),
       ('b2000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-00000000000b', 10, 800, 'y@example.com', 'pi_w_b', 'succeeded', now());
select create_pending_vote('b2000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-00000000000a',
                           'fan', 'late@example.com', 'pi_w_a_pending');

-- A free voter who chose Ash today.
insert into free_voters (id, contest_id, email, email_key, verified_at)
values ('b9000000-0000-0000-0000-000000000009', 'bc000000-0000-0000-0000-0000000000bc', 'fv@example.com', 'fv@example.com', now());
insert into free_votes (round_id, entry_id, matchup_id, voter_id, vote_day, via)
values ('b2000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-00000000000a', 'bf000000-0000-0000-0000-00000000000f',
        'b9000000-0000-0000-0000-000000000009', free_vote_day(now()), 'code');
insert into storage.objects (bucket_id, name) values ('pets', 'w/a.jpg'), ('pets', 'w/a.thumb.jpg');

select is((select shelter_cents from contest_stats where contest_id = 'bc000000-0000-0000-0000-0000000000bc'), 2640::bigint,
  'before: the shelters'' share counts both pets'' packs');


-- ------------------------------------------------------------- the guards --
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok($$ select withdraw_entry('ba000000-0000-0000-0000-00000000000a', 'Owner asked') $$,
  'not authorized', 'only an admin withdraws a pet');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select throws_ok($$ select withdraw_entry('ba000000-0000-0000-0000-00000000000a', ' ') $$,
  'WP400', 'A reason is required. It is kept with the entry.', 'a withdrawal needs a reason');


-- ------------------------------------------------------------ withdrawing --
select withdraw_entry('ba000000-0000-0000-0000-00000000000a', 'The family''s dog passed away');
select results_eq(
  $$ select status::text, withdrawal_reason, withdrawn_by from entries where id = 'ba000000-0000-0000-0000-00000000000a' $$,
  $$ values ('withdrawn'::text, 'The family''s dog passed away'::text, '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'the pet is withdrawn, with who and why');
select is((select count(*)::int from votes where entry_id = 'ba000000-0000-0000-0000-00000000000a' and status = 'succeeded'), 1,
  'its vote packs are not refunded');
select is((select shelter_cents from contest_stats where contest_id = 'bc000000-0000-0000-0000-0000000000bc'), 2640::bigint,
  'and the shelters'' share stands');
select ok(not exists (select 1 from contest_health() where check_name = 'disqualified_unrefunded'),
  'no refund alert: a withdrawal owes no one a refund');
select is((select status::text from free_votes where voter_id = 'b9000000-0000-0000-0000-000000000009'), 'returned',
  'its free votes go back to their voters');
select results_eq(
  $$ select payment_intent from stale_pending_intents(10, 'ba000000-0000-0000-0000-00000000000a') $$,
  $$ values ('pi_w_a_pending'::text) $$,
  'an unpaid checkout for it is flagged for cancelling');
select is(confirm_vote('pi_w_a_pending', now()), 'late',
  'a payment that lands for it afterward is refunded as late, never credited');
select is((select count(*)::int from rejected_photos_live where entry_id = 'ba000000-0000-0000-0000-00000000000a'), 2,
  'its photo files are flagged until deleted');
select lives_ok($$ select withdraw_entry('ba000000-0000-0000-0000-00000000000a', 'again') $$,
  'running it again changes nothing');


-- --------------------------------------------------------- the matchup --
update rounds set closes_at = now() - interval '11 minutes' where id = 'b2000000-0000-0000-0000-000000000002';
select close_round('b2000000-0000-0000-0000-000000000002');
select is((select winner_entry_id from matchups where id = 'bf000000-0000-0000-0000-00000000000f'),
  'bb000000-0000-0000-0000-00000000000b'::uuid,
  'its opponent advances, though the withdrawn pet had ten times the votes');
select ok(not exists (select 1 from notification_queue(100) where entry_id = 'ba000000-0000-0000-0000-00000000000a'),
  'its owner gets no template email saying it advanced or lost');

select * from finish();
rollback;
