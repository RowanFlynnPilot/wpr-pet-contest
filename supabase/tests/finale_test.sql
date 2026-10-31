-- Run with: supabase test db
--
-- The finale (0031): when the live reveal starts and where to watch it.
-- Presentation only: staff set it through set_contest_finale, the link must
-- be https, and anyone can read it.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at, submissions_close_at, status, bracket_size, bracket_round_hours)
values ('fc000000-0000-0000-0000-0000000000fc', 2108, 'Finale', 50, now() + interval '10 days', now() + interval '17 days', 'draft', 16, 48);

select lives_ok(
  $$ select set_contest_finale('fc000000-0000-0000-0000-0000000000fc', '2026-11-30T01:00:00Z', ' https://www.facebook.com/wausaupilot/live ') $$,
  'staff set the finale');
select results_eq(
  $$ select finale_at, finale_url from contests where id = 'fc000000-0000-0000-0000-0000000000fc' $$,
  $$ values ('2026-11-30T01:00:00Z'::timestamptz, 'https://www.facebook.com/wausaupilot/live') $$,
  'the time and the trimmed link are stored');
select throws_ok(
  $$ select set_contest_finale('fc000000-0000-0000-0000-0000000000fc', now(), 'http://example.com') $$,
  'WP400', null, 'the link must be https');
select lives_ok(
  $$ select set_contest_finale('fc000000-0000-0000-0000-0000000000fc', null, '') $$,
  'both can be cleared');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$ select set_contest_finale('fc000000-0000-0000-0000-0000000000fc', now(), null) $$,
  'P0001', 'not authorized', 'a signed-in non-admin cannot set it');

set local role anon;
select lives_ok($$ select finale_at, finale_url from contests limit 1 $$, 'anyone can read the finale');
select throws_ok(
  $$ select set_contest_finale('fc000000-0000-0000-0000-0000000000fc', now(), null) $$,
  '42501', null, 'anon cannot set it');
reset role;

select * from finish();
rollback;
