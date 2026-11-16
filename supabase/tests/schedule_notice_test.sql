-- Run with: supabase test db
--
-- The correction email when the Open Round's start moves (0038): staff only,
-- once per round, to the owners approved before the notice, never after the
-- round opens.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');

-- seed.sql: contest c1 takes entries, 20 pets approved, round 1 pending.
-- Approved an hour ago; voting two days away.
update entries set moderated_at = now() - interval '1 hour'
where contest_id = '00000000-0000-0000-0000-0000000000c1' and status = 'approved';
update rounds set opens_at = now() + interval '2 days', closes_at = now() + interval '9 days'
where id = '00000000-0000-0000-0000-00000000d001';

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok(
  $$ select announce_schedule_change('00000000-0000-0000-0000-00000000d001') $$,
  'not authorized', 'only an admin can email the owners');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select is(
  announce_schedule_change('00000000-0000-0000-0000-00000000d001'), 20,
  'it reports how many owners will hear');

select isnt(
  (select schedule_notice_at from rounds where id = '00000000-0000-0000-0000-00000000d001'), null,
  'the notice is recorded on the round');

select throws_like(
  $$ select announce_schedule_change('00000000-0000-0000-0000-00000000d001') $$,
  'owners were already emailed%', 'and only once');

select is(
  (select count(*)::int from notification_queue(1000) q where q.kind = 'schedule_update'), 20,
  'every owner approved before the notice is owed one note');

select is(
  (select count(distinct q.opens_at)::int from notification_queue(1000) q
   where q.kind = 'schedule_update' and q.opens_at = now() + interval '2 days'), 1,
  'and it carries the new start');

-- A note already sent is not owed again.
insert into notifications (kind, entry_id, round_id, to_email, status)
select 'schedule_update', e.id, '00000000-0000-0000-0000-00000000d001', e.owner_email, 'sent'
from entries e where e.contest_id = '00000000-0000-0000-0000-0000000000c1' and e.status = 'approved'
order by e.pet_name limit 1;
select is(
  (select count(*)::int from notification_queue(1000) q where q.kind = 'schedule_update'), 19,
  'a sent note is never owed twice');

-- Once the round opens, the correction is moot.
update rounds set opens_at = now() - interval '1 minute' where id = '00000000-0000-0000-0000-00000000d001';
select is(
  (select count(*)::int from notification_queue(1000) q where q.kind = 'schedule_update'), 0,
  'nothing is owed once voting has started');

select ok(
  not has_function_privilege('anon', 'public.announce_schedule_change(uuid)', 'EXECUTE'),
  'no anonymous session can send it');

select * from finish();
rollback;
