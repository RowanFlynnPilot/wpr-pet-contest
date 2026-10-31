-- Run with: supabase test db
--
-- Cheers and checkout reminders (0033).
--
-- A cheer is one of six codes with an optional first name. Anything else is
-- dropped, never refused; it shows only once paid, never for a pet no longer
-- in the contest, and staff can hide one. A checkout reminder goes once per
-- address per round, an hour after an opted-in checkout stalls, never close
-- to the deadline, and not to someone who has since bought.

create extension if not exists pgtap with schema extensions;

begin;
select plan(24);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours)
values ('c3000000-0000-0000-0000-0000000000c3', 2110, 'Cheers', 50,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select id::uuid, 'c3000000-0000-0000-0000-0000000000c3', name, 'dog', 'O', lower(name) || '@example.com', 'Wausau',
       'c/' || name || '.jpg', 'approved', now(), now(), now() - (mins || ' minutes')::interval
from (values ('ca000000-0000-0000-0000-0000000000ca', 'Ace', 3), ('cb000000-0000-0000-0000-0000000000cb', 'Bea', 2),
             ('cc000000-0000-0000-0000-0000000000cc', 'Cy', 1)) as t(id, name, mins);
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('c1000000-0000-0000-0000-0000000000c1', 'c3000000-0000-0000-0000-0000000000c3',
        1, 'open', 'open', now() - interval '3 days', now() + interval '2 days');
insert into vote_packs (contest_id, slug, label, votes, cents)
values ('c3000000-0000-0000-0000-0000000000c3', 'fan', 'Fan', 25, 2000);

-- Parks a pack for the round: pet, buyer, intent, and the new checkout options.
create function pg_temp.park(p_entry uuid, p_email text, p_pi text, p_cheer text default null,
                                        p_name text default null, p_remind boolean default false) returns void
  language sql as $$
    select create_pending_vote('c1000000-0000-0000-0000-0000000000c1'::uuid, p_entry, 'fan', p_email, p_pi,
                               false, false, null, p_cheer, p_name, p_remind)
  $$;

select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'jo@example.com',  'pi_c_1', 'go', ' Jo ');
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'kim@example.com', 'pi_c_2', 'boo', 'Kim');
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'lu@example.com',  'pi_c_3', 'paws', 'lu@example.com');
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'max@example.com', 'pi_c_4', null, 'Max');
select pg_temp.park('cb000000-0000-0000-0000-0000000000cb', 'ned@example.com', 'pi_c_5', 'love', 'Ned');
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'ola@example.com', 'pi_c_6', 'cutest', null);
select pg_temp.park('cc000000-0000-0000-0000-0000000000cc', 'pat@example.com', 'pi_c_7', 'champion', 'Pat');
select confirm_vote(pi) from unnest(array['pi_c_1', 'pi_c_2', 'pi_c_3', 'pi_c_4', 'pi_c_5', 'pi_c_7']) pi;


-- ------------------------------------------------------------------ cheers --
select results_eq(
  $$ select cheer, cheer_name from votes where stripe_payment_intent_id = 'pi_c_1' $$,
  $$ values ('go'::text, 'Jo'::text) $$,
  'a cheer and a trimmed first name are kept');
select results_eq(
  $$ select cheer, cheer_name from votes where stripe_payment_intent_id = 'pi_c_2' $$,
  $$ values (null::text, null::text) $$,
  'a cheer the site never offered is dropped, with its name, and the checkout still parks');
select results_eq(
  $$ select cheer, cheer_name from votes where stripe_payment_intent_id = 'pi_c_3' $$,
  $$ values ('paws'::text, null::text) $$,
  'a "name" that looks like an address is dropped; the cheer stays');
select is((select cheer_name from votes where stripe_payment_intent_id = 'pi_c_4'), null,
  'a name without a cheer is dropped');
select throws_ok(
  $$ update votes set cheer_name = 'Zed' where stripe_payment_intent_id = 'pi_c_4' $$,
  '23514', null, 'and the table refuses a name without a cheer');

select results_eq(
  $$ select cheer, cheer_name from entry_cheers where entry_id = 'ca000000-0000-0000-0000-0000000000ca' order by cheer $$,
  $$ values ('go'::text, 'Jo'::text), ('paws', null) $$,
  'the pet page lists paid cheers only (the unpaid one is not there)');
select results_eq(
  $$ select cheer, cheer_name from recent_activity where entry_id = 'cb000000-0000-0000-0000-0000000000cb' $$,
  $$ values ('love'::text, 'Ned'::text) $$,
  'the live feed carries the cheer');

select hide_cheer((select id from votes where stripe_payment_intent_id = 'pi_c_5'));
select is_empty($$ select 1 from entry_cheers where entry_id = 'cb000000-0000-0000-0000-0000000000cb' $$,
  'a hidden cheer leaves the pet page');
select results_eq(
  $$ select votes, cheer, cheer_name from recent_activity where entry_id = 'cb000000-0000-0000-0000-0000000000cb' $$,
  $$ values (25, null::text, null::text) $$,
  'and shows in the feed as a plain purchase');
select is((select cheer_hidden_by from votes where stripe_payment_intent_id = 'pi_c_5'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'staff are recorded on the hide');

select refund_vote('pi_c_7');
select is_empty($$ select 1 from entry_cheers where entry_id = 'cc000000-0000-0000-0000-0000000000cc' $$,
  'a refunded pack''s cheer comes down');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select throws_ok($$ select hide_cheer((select id from votes where stripe_payment_intent_id = 'pi_c_1')) $$,
  'P0001', 'not authorized', 'only staff hide a cheer');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

set local role anon;
select results_eq($$ select count(*)::int from entry_cheers where entry_id = 'ca000000-0000-0000-0000-0000000000ca' $$,
  $$ values (2) $$, 'anyone can read the cheers');
select throws_ok($$ select buyer_email from votes limit 1 $$, '42501', null, 'the votes behind them stay private');
reset role;


-- -------------------------------------------------------------- reminders --
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'rae@example.com', 'pi_r_rae1', null, null, true);
select pg_temp.park('cb000000-0000-0000-0000-0000000000cb', 'rae@example.com', 'pi_r_rae2', null, null, true);
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'sam@example.com', 'pi_r_sam',  null, null, false);
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'tia@example.com', 'pi_r_tia',  null, null, true);
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'uma@example.com', 'pi_r_uma',  null, null, true);
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'uma@example.com', 'pi_r_uma2', null, null, false);
select pg_temp.park('ca000000-0000-0000-0000-0000000000ca', 'val@example.com', 'pi_r_val',  null, null, true);
-- Rae stalled twice (Bea's the later), Sam never asked, Tia only just
-- stalled, Uma bought on her second try, Val's was cancelled at Stripe.
update votes set created_at = now() - t.ago::interval
from (values ('pi_r_rae1', '3 hours'), ('pi_r_rae2', '2 hours'), ('pi_r_sam', '2 hours'), ('pi_r_tia', '20 minutes'),
             ('pi_r_uma', '2 hours'), ('pi_r_uma2', '90 minutes'), ('pi_r_val', '2 hours')) as t(pi, ago)
where stripe_payment_intent_id = t.pi;
select confirm_vote('pi_r_uma2');
update votes set canceled_at = now() where stripe_payment_intent_id = 'pi_r_val';

select results_eq(
  $$ select email::text, pet_name, votes, pack_slug from checkout_reminder_queue(50) order by email $$,
  $$ values ('rae@example.com'::text, 'Bea'::text, 25, 'fan'::text) $$,
  'one reminder: the opted-in address, for its latest stalled checkout; nobody who did not ask, stalled minutes ago, bought since, or was cancelled');
select is((select round_name from checkout_reminder_queue(50)), 'Open Round', 'it names the round');

insert into checkout_reminders (email, round_id, vote_id, status)
select email, round_id, vote_id, 'sent' from checkout_reminder_queue(50);
select is_empty($$ select 1 from checkout_reminder_queue(50) $$, 'once sent, never again that round');
select throws_ok(
  $$ insert into checkout_reminders (email, round_id, vote_id, status)
     values ('RAE@example.com', 'c1000000-0000-0000-0000-0000000000c1',
             (select id from votes where stripe_payment_intent_id = 'pi_r_rae1'), 'pending') $$,
  '23505', null, 'one per address per round, whatever the case');

delete from checkout_reminders;
update rounds set closes_at = now() + interval '10 minutes' where id = 'c1000000-0000-0000-0000-0000000000c1';
select is_empty($$ select 1 from checkout_reminder_queue(50) $$, 'never with under 15 minutes left to act');
update rounds set closes_at = now() + interval '2 days' where id = 'c1000000-0000-0000-0000-0000000000c1';
select cmp_ok((select count(*)::int from checkout_reminder_queue(50)), '=', 1, 'and back when there is time');

set local role anon;
select throws_ok($$ select * from checkout_reminder_queue(50) $$, '42501', null, 'anon cannot read the queue');
reset role;
select ok(not has_table_privilege('authenticated', 'public.checkout_reminders', 'INSERT'),
  'only the sweep records a reminder');


-- ---------------------------------------------------------------- erasure --
-- A finished contest past the chargeback window: the first name goes, the
-- cheer stays, the reminder record goes.
update contests set status = 'complete' where id = 'c3000000-0000-0000-0000-0000000000c3';
update rounds set status = 'resolved', resolved_at = now() - interval '200 days'
where id = 'c1000000-0000-0000-0000-0000000000c1';
insert into checkout_reminders (email, round_id, vote_id, status)
values ('rae@example.com', 'c1000000-0000-0000-0000-0000000000c1',
        (select id from votes where stripe_payment_intent_id = 'pi_r_rae2'), 'sent');
select erase_personal_data('c3000000-0000-0000-0000-0000000000c3');
select results_eq(
  $$ select cheer, cheer_name, buyer_email::text from votes where stripe_payment_intent_id = 'pi_c_1' $$,
  $$ values ('go'::text, null::text, 'erased@invalid'::text) $$,
  'erasure takes the first name with the address and leaves the cheer');
select is_empty($$ select 1 from checkout_reminders $$, 'and the reminder records');

select * from finish();
rollback;
