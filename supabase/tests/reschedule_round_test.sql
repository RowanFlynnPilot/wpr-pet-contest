-- Run with: supabase test db
--
-- Moving a round's scheduled start before it opens (0036): staff only, only a
-- pending round, never before entries close, and never a status change.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');

-- seed.sql: contest c1 takes entries for another week; round 1 is pending.
-- Give round 1 a week of voting after entries close, as open_submissions does.
update rounds r set opens_at = c.submissions_close_at, closes_at = c.submissions_close_at + interval '7 days'
from contests c
where r.id = '00000000-0000-0000-0000-00000000d001' and c.id = r.contest_id;

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok(
  $$ select reschedule_round('00000000-0000-0000-0000-00000000d001', now() + interval '8 days') $$,
  'not authorized', 'only an admin can move a round');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_like(
  $$ select reschedule_round('00000000-0000-0000-0000-00000000d001', now() + interval '2 days') $$,
  'voting cannot open before entries close%', 'not before entries close');

select throws_like(
  $$ select reschedule_round('00000000-0000-0000-0000-00000000d001', now() - interval '1 hour') $$,
  'the new start must be in the future', 'not in the past');

select throws_like(
  $$ select reschedule_round('00000000-0000-0000-0000-00000000d001', now() + interval '13 days 12 hours') $$,
  '%must start at least a day before that', 'the round still runs at least a day');

-- The morning after entries close.
select lives_ok(
  $$ select reschedule_round('00000000-0000-0000-0000-00000000d001',
       (select submissions_close_at + interval '12 hours' from contests where id = '00000000-0000-0000-0000-0000000000c1')) $$,
  'the morning after entries close is fine');

select is(
  (select r.opens_at - c.submissions_close_at from rounds r join contests c on c.id = r.contest_id
   where r.id = '00000000-0000-0000-0000-00000000d001'),
  interval '12 hours', 'the schedule moved');

select is(
  (select status::text from rounds where id = '00000000-0000-0000-0000-00000000d001'),
  'pending', 'and the round did not open: only open_round does that');

-- An open round has a real start; it is not a schedule any more.
update rounds set status = 'open' where id = '00000000-0000-0000-0000-00000000d001';
select throws_like(
  $$ select reschedule_round('00000000-0000-0000-0000-00000000d001', now() + interval '8 days') $$,
  'round 1 is open;%', 'an open round cannot be rescheduled');

select ok(
  not has_function_privilege('anon', 'public.reschedule_round(uuid, timestamptz)', 'EXECUTE'),
  'no anonymous session can move a round');

select * from finish();
rollback;
