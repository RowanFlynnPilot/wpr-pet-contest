-- Run with: supabase test db
--
-- Moderator alerts (0035): one note when new entries reach the queue, never
-- a second for the same entries, and nothing for an empty queue.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- seed.sql leaves three entries pending in a submissions_open contest.
select results_eq(
  $$ select contest_id, new_count, pending from moderation_alert_claim() $$,
  $$ values ('00000000-0000-0000-0000-0000000000c1'::uuid, 3, 3) $$,
  'three entries waiting: one alert, for all three');

select is_empty(
  $$ select * from moderation_alert_claim() $$,
  'the same entries never alert twice');

select is((select count(*)::int from moderation_alerts), 1, 'the alert is recorded once');

-- A new entry arrives after the alert (now() is fixed inside this
-- transaction, so it is dated a minute on).
update entries set created_at = now() + interval '1 minute'
where id = (select id from entries
            where contest_id = '00000000-0000-0000-0000-0000000000c1' and status = 'pending'
            order by pet_name limit 1);

select results_eq(
  $$ select new_count, pending from moderation_alert_claim() $$,
  $$ values (1, 3) $$,
  'a newcomer alerts again, counting the one new and the three waiting');

select is_empty(
  $$ select * from moderation_alert_claim() $$,
  'and only once');

-- Privileges: only the service role (the sweep) claims; staff may read.
select ok(
  not has_function_privilege('anon', 'public.moderation_alert_claim()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.moderation_alert_claim()', 'EXECUTE'),
  'no browser session can claim an alert');

select ok(
  not has_table_privilege('anon', 'public.moderation_alerts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.moderation_alerts', 'INSERT, UPDATE, DELETE'),
  'alerts are written only by the sweep');

select ok(
  has_table_privilege('service_role', 'public.moderation_alerts', 'SELECT, INSERT, DELETE')
  and has_function_privilege('service_role', 'public.moderation_alert_claim()', 'EXECUTE'),
  'the sweep can claim, record and release an alert');

-- Nothing is owed once submissions close.
update contests set status = 'voting' where id = '00000000-0000-0000-0000-0000000000c1';
update entries set created_at = now() + interval '2 minutes'
where contest_id = '00000000-0000-0000-0000-0000000000c1' and status = 'pending';
select is_empty(
  $$ select * from moderation_alert_claim() $$,
  'no alert outside the entry window');

select * from finish();
rollback;
