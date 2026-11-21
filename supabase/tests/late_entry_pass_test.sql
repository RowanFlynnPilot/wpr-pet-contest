-- Run with: supabase test db
--
-- The late-entry pass (0039): staff issue it with a reason, it lets one entry
-- in while the Open Round runs, it is spent on use, the entry it brings is the
-- only one staff can moderate during voting, and none can be issued once Last
-- Chance starts.

create extension if not exists pgtap with schema extensions;

begin;
select plan(16);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');

-- seed.sql's contest c1, moved on to voting: the Open Round is running.
update contests set status = 'voting' where id = '00000000-0000-0000-0000-0000000000c1';
update rounds set status = 'open', opens_at = now() - interval '1 day', closes_at = now() + interval '10 days'
where id = '00000000-0000-0000-0000-00000000d001';

create temp table t (token text, other text);
grant all on t to authenticated;

-- ---------------------------------------------------------------- issue --
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok(
  $$ select issue_late_entry_pass('00000000-0000-0000-0000-0000000000c1', 'Owner asked', 48) $$,
  'not authorized', 'only staff can issue a pass');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select throws_ok(
  $$ select issue_late_entry_pass('00000000-0000-0000-0000-0000000000c1', ' ', 48) $$,
  'WP400', 'Say why this pass is issued and who approved it.', 'a pass needs a reason');

insert into t (token) select issue_late_entry_pass('00000000-0000-0000-0000-0000000000c1', 'Owner emailed Nov. 21; approved by Rowan', 48);
select is((select char_length(token) from t), 64, 'the link carries a 64-character token');

select ok(
  (select issued_by = '11111111-1111-1111-1111-111111111111' and reason like 'Owner emailed%'
          and expires_at <= now() + interval '48 hours' and used_at is null
   from late_entry_passes),
  'the pass records who issued it, why and when it expires');

select is(
  late_entry_pass_contest((select token from t)), '00000000-0000-0000-0000-0000000000c1'::uuid,
  'a good link names its contest');
select is(late_entry_pass_contest('not-a-token'), null, 'a made-up link names nothing');

-- ---------------------------------------------------------------- enter --
select lives_ok(
  $$ select insert_late_entry((select token from t), 'Latecomer', 'dog', 'Owner L', 'late@example.com', 'Wausau',
                              null, 'c1/late.jpg', false, 5) $$,
  'the pass lets one entry in during the Open Round');

select ok(
  (select e.status = 'pending' and e.rights_accepted_at is not null
   from entries e where e.pet_name = 'Latecomer'),
  'it waits for moderation, with the release accepted at submission');

select ok(
  (select p.used_at is not null and p.entry_id = (select id from entries where pet_name = 'Latecomer')
   from late_entry_passes p),
  'the pass is spent and names its entry');

select throws_ok(
  $$ select insert_late_entry((select token from t), 'Second', 'cat', 'Owner L', 'late2@example.com', 'Wausau',
                              null, 'c1/late2.jpg', false, 5) $$,
  'WP400', 'This late-entry link has expired or was already used.', 'a link works once');

-- ------------------------------------------------------------- moderate --
select lives_ok(
  $$ select moderate_entry((select id from entries where pet_name = 'Latecomer'), true) $$,
  'staff can approve the late entry while voting runs');

select throws_ok(
  $$ select moderate_entry((select id from entries where contest_id = '00000000-0000-0000-0000-0000000000c1'
                            and status = 'pending' order by pet_name limit 1), true) $$,
  'WP400', 'the field is set: voting has started', 'any other pending entry stays shut out');

-- --------------------------------------------------------------- revoke --
update t set other = issue_late_entry_pass('00000000-0000-0000-0000-0000000000c1', 'Second request', 24);
select lives_ok(
  $$ select revoke_late_entry_pass((select id from late_entry_passes where reason = 'Second request')) $$,
  'staff can withdraw an unused pass');
select is(late_entry_pass_contest((select other from t)), null, 'a withdrawn link no longer works');

-- Once Last Chance starts, the field below the line is fixed.
update rounds set overtime_closes_at = now() + interval '1 day' where id = '00000000-0000-0000-0000-00000000d001';
select throws_like(
  $$ select issue_late_entry_pass('00000000-0000-0000-0000-0000000000c1', 'Too late', 24) $$,
  'Late entries can join only while the Open Round is running%', 'no pass once Last Chance starts');

-- ------------------------------------------------------------- privacy --
select ok(
  not has_table_privilege('anon', 'public.late_entry_passes', 'SELECT')
  and not has_table_privilege('authenticated', 'public.late_entry_passes', 'INSERT, UPDATE, DELETE')
  and not has_function_privilege('anon', 'public.insert_late_entry(text, text, species, text, text, text, text, text, boolean, int, text, text, text, text)', 'EXECUTE'),
  'passes are written only through the staff functions and submit-entry');

select * from finish();
rollback;
