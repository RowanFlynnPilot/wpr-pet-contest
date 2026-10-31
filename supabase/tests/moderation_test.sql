-- Run with: supabase test db
--
-- Moderation is audited and one-way. Somebody will insist their entry was
-- never reviewed, and somebody else will want a rejected photo back after it
-- has been deleted. Both answers live here.

create extension if not exists pgtap with schema extensions;

begin;
select plan(15);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- seed.sql leaves three entries pending in a submissions_open contest.
create temp table queue as
  select id, pet_name, photo_path from entries
  where contest_id = '00000000-0000-0000-0000-0000000000c1' and status = 'pending'
  order by pet_name;


select is(moderate_entry((select id from queue where pet_name = 'Pending 1'), true),
          (select photo_path from queue where pet_name = 'Pending 1'),
  'approving returns the photo path');

select results_eq(
  $$ select status::text, moderated_by, moderated_at is not null
     from entries where id = (select id from queue where pet_name = 'Pending 1') $$,
  $$ values ('approved', '11111111-1111-1111-1111-111111111111'::uuid, true) $$,
  'the audit trail records who approved it and when');

select throws_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 2'), false) $$,
  'WP400', 'a rejection reason is required',
  'a rejection needs a reason');

select throws_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 2'), false, '   ') $$,
  'WP400', 'a rejection reason is required',
  'whitespace is not a reason');

select lives_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 2'), false, ' Photo is not a pet ') $$,
  'a rejection with a reason is recorded');

select is(
  (select rejection_reason from entries where id = (select id from queue where pet_name = 'Pending 2')),
  'Photo is not a pet',
  'the reason is stored trimmed');

select throws_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 2'), true) $$,
  'WP400', 'rejected entries cannot be restored; the photo is deleted',
  'a rejection is final');

select throws_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 1'), true) $$,
  'WP400', 'entry is already approved',
  'approving twice is refused');

select lives_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 1'), false, 'Not the entrant''s own photo') $$,
  'a bad approval can be reversed while submissions are open');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 3'), true) $$,
  'not authorized',
  'only an admin can moderate');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';


-- ------------------------------------------------ rejected photos audit --
-- Simulate a rejection whose storage delete failed: the object is still there.
insert into storage.objects (bucket_id, name)
select 'pets', photo_path from queue where pet_name = 'Pending 2';

set local role authenticated;
select results_eq(
  $$ select pet_name from rejected_photos_live $$,
  $$ values ('Pending 2'::text) $$,
  'rejected_photos_live finds a rejected photo still in the public bucket');
reset role;

select is(
  (select count(*)::int from rejected_photos_live where pet_name = 'Pending 1'),
  0,
  'a rejected entry whose object is gone is not listed');

-- Its thumbnail is a second public file, and a leak in its own right.
update entries set thumb_path = 'c1/pending-1.thumb.jpg' where id = (select id from queue where pet_name = 'Pending 1');
insert into storage.objects (bucket_id, name) values ('pets', 'c1/pending-1.thumb.jpg');

set local role authenticated;
select results_eq(
  $$ select object_name from rejected_photos_live where pet_name = 'Pending 1' $$,
  $$ values ('c1/pending-1.thumb.jpg'::text) $$,
  'a rejected entry''s leftover thumbnail is listed too, by name');
reset role;


-- ------------------------------------------------ after the field is set --
update contests set status = 'voting' where id = '00000000-0000-0000-0000-0000000000c1';

select throws_ok(
  $$ select moderate_entry((select id from queue where pet_name = 'Pending 3'), true) $$,
  'WP400', 'the field is set: voting has started',
  'nothing is moderated into or out of the field once voting starts');

select throws_ok(
  $$ update entries set moderated_at = null
     where id = (select id from queue where pet_name = 'Pending 1') $$,
  null,
  'the moderation_recorded constraint still guards the audit column');


select * from finish();
rollback;
