-- Run with: supabase test db
--
-- The live-contest checks, and the bookkeeping that keeps a ten-minute
-- schedule from emailing staff the same problem six times an hour.

create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

-- A quiet contest: nothing to report.
select is_empty($$ select * from contest_health() $$, 'a healthy contest reports nothing');


-- ---------------------------------------------------------------- checks --
-- An entry waiting two days for moderation.
update entries set created_at = now() - interval '2 days'
where pet_name = 'Pending 1' and contest_id = '00000000-0000-0000-0000-0000000000c1';

select results_eq(
  $$ select check_name, severity, items from contest_health() where check_name = 'moderation_backlog' $$,
  $$ values ('moderation_backlog'::text, 'warn'::text, 1) $$,
  'a family waiting more than a day for moderation is flagged');

-- Submissions ended two hours ago and round 1 has not been opened.
update contests set submissions_open_at = now() - interval '9 days',
                    submissions_close_at = now() - interval '2 hours'
where id = '00000000-0000-0000-0000-0000000000c1';

select ok(
  exists (select 1 from contest_health() where check_name = 'round_not_opened' and detail like 'Submissions closed%'),
  'an Open Round left unopened after submissions close is flagged');

-- A voting contest whose round ended long ago and was never finalized.
insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status)
values ('99999999-9999-9999-9999-999999999999', 2095, 'Overdue', 30,
        now() - interval '20 days', now() - interval '13 days', 'voting');
insert into rounds (contest_id, seq, kind, status, opens_at, closes_at)
values ('99999999-9999-9999-9999-999999999999', 1, 'open', 'open',
        now() - interval '9 days', now() - interval '3 hours');

select ok(
  exists (select 1 from contest_health() where check_name = 'round_not_finalized' and detail like 'Open Round ended%'),
  'a round past its deadline and not finalized is flagged');

-- A late payment the automatic refund never caught up with.
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at)
values ('9e000000-0000-0000-0000-00000000000e', '99999999-9999-9999-9999-999999999999',
        'Stuck', 'dog', 'S', 's@example.com', 'Wausau', 'h/s.jpg', 'approved', now(), now());
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email,
                   stripe_payment_intent_id, status, confirmed_at)
select id, '9e000000-0000-0000-0000-00000000000e', 25, 2000, 'late@example.com',
       'pi_health_late', 'late', now() - interval '20 minutes'
from rounds where contest_id = '99999999-9999-9999-9999-999999999999';

select results_eq(
  $$ select severity, items from contest_health() where check_name = 'late_refund_stuck' $$,
  $$ values ('alert'::text, 1) $$,
  'a late payment still unrefunded after 15 minutes is an alert');

update votes set confirmed_at = now() - interval '2 minutes' where stripe_payment_intent_id = 'pi_health_late';
select is_empty(
  $$ select * from contest_health() where check_name = 'late_refund_stuck' $$,
  'a late payment only minutes old is given time for its automatic refund');


-- ---------------------------------------------------------- bookkeeping --
select results_eq(
  $$ select check_name, change from record_health(
       '[{"check_name":"a","severity":"alert","detail":"A broke"},
         {"check_name":"b","severity":"warn","detail":"B is slow"}]') order by 1 $$,
  $$ values ('a'::text, 'opened'::text), ('b', 'opened') $$,
  'new problems are reported as opened');

select is_empty(
  $$ select * from record_health(
       '[{"check_name":"a","severity":"alert","detail":"A broke"},
         {"check_name":"b","severity":"warn","detail":"B is slow"}]') $$,
  'ten minutes later the same problems are not reported again');

update health_incidents set last_notified_at = now() - interval '3 hours' where check_name = 'a';
select results_eq(
  $$ select check_name, change from record_health(
       '[{"check_name":"a","severity":"alert","detail":"A broke"},
         {"check_name":"b","severity":"warn","detail":"B is slow"}]') $$,
  $$ values ('a'::text, 'reminder'::text) $$,
  'a problem lasting more than two hours gets a reminder');

select results_eq(
  $$ select check_name, change from record_health('[{"check_name":"a","severity":"alert","detail":"A broke"}]') $$,
  $$ values ('b'::text, 'resolved'::text) $$,
  'a problem that clears is reported as resolved');

select is(
  (select count(*)::int from health_incidents), 1,
  'only open problems are kept');

select results_eq(
  $$ select check_name, change from record_health('[]') $$,
  $$ values ('a'::text, 'resolved'::text) $$,
  'an all-clear resolves everything left');

-- A problem that appears and clears between sweeps, never reported, is not
-- announced as resolved either.
insert into health_incidents (check_name, severity, detail) values ('blip', 'warn', 'briefly odd');
select is_empty(
  $$ select * from record_health('[]') where change <> 'silent' $$,
  'a problem nobody was told about clears silently');


select * from finish();
rollback;
