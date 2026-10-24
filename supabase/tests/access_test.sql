-- Run with: supabase test db
--
-- The complete access surface, pinned. Two of the worst bugs this project has
-- had were privilege bugs that no functional test noticed:
--
-- * every security definer function was executable by anon through PUBLIC,
--   which made free votes one curl away;
-- * the platform stopped granting table privileges by default, so the public
--   policies silently guarded nothing and the whole front end would 403.
--
-- So these tests assert whole sets, not samples. A new table, view or function
-- that becomes reachable by the public fails here until it is added to the
-- expected list on purpose.

create extension if not exists pgtap with schema extensions;

begin;
select plan(29);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),   -- admin
  ('44444444-4444-4444-4444-444444444444');   -- signed in, not an admin
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');

-- A confirmed vote on the seed contest, so the leaderboard has something to show.
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email,
                   stripe_payment_intent_id, status, confirmed_at)
select '00000000-0000-0000-0000-00000000d001', id, 5, 500, 'secret@example.com',
       'pi_access_1', 'succeeded', now()
from entries where pet_name = 'Biscuit' and contest_id = '00000000-0000-0000-0000-0000000000c1';

insert into vote_packs (contest_id, slug, label, votes, cents, active)
values ('00000000-0000-0000-0000-0000000000c1', 'retired', 'Retired', 1, 100, false);

-- A verified free voter and their free vote: personal data the public must
-- never reach, and that only admins read.
insert into free_voters (id, contest_id, email, email_key, verified_at)
values ('f0000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1',
        'voter@example.com', 'voter@example.com', now());
insert into free_votes (round_id, entry_id, voter_id, vote_day, via)
select '00000000-0000-0000-0000-00000000d001', id, 'f0000000-0000-0000-0000-0000000000f1', current_date, 'code'
from entries where pet_name = 'Biscuit' and contest_id = '00000000-0000-0000-0000-0000000000c1';

-- An unmoderated upload sitting in the bucket.
insert into storage.objects (bucket_id, name)
values ('pets', '00000000-0000-0000-0000-0000000000c1/pending-upload.jpg');

-- Functions installed by extensions (citext lives in public) are not ours.
create temp view our_functions as
  select p.oid, p.proname::text collate "default" as name
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

create temp view our_relations as
  select c.oid, c.relname::text collate "default" as name
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm');

grant select on our_functions, our_relations to anon, authenticated;


-- ------------------------------------------------------------- privileges --
select results_eq(
  $$ select name from our_relations where has_table_privilege('anon', oid, 'SELECT') order by 1 $$,
  $$ values ('bonus_windows'), ('contest_stats'), ('contests'), ('entry_round_totals'),
            ('matchups'), ('recent_activity'), ('rounds'), ('shelters'), ('side_awards'),
            ('vote_packs') $$,
  'anon can read exactly the public tables and views');

select results_eq(
  $$ select a.attname::text collate "default" from pg_attribute a
     where a.attrelid = 'public.entries'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
     order by 1 $$,
  $$ values ('caption'), ('contest_id'), ('created_at'), ('id'), ('pet_name'), ('photo_path'),
            ('seed'), ('shelter_id'), ('species'), ('status'), ('thumb_path'), ('town') $$,
  'anon sees the pet on an entry, never the owner');

select is_empty(
  $$ select r.name || '.' || a.attname
     from our_relations r
     join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
     where has_column_privilege('anon', r.oid, a.attnum, 'SELECT')
       and (a.attname ~ '(email|owner|moderated_by|rejection)') $$,
  'no column anon can read holds an email, an owner, or moderation notes');

select is_empty(
  $$ select name from our_relations
     where has_table_privilege('anon', oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        or has_any_column_privilege('anon', oid, 'INSERT, UPDATE') $$,
  'anon can write nothing, anywhere (TRUNCATE included: it ignores RLS)');

select is_empty(
  $$ select name from our_relations
     where has_table_privilege('authenticated', oid, 'TRUNCATE, REFERENCES, TRIGGER') $$,
  'signed-in sessions cannot truncate anything either');

select ok(
  not has_column_privilege('authenticated', 'public.rounds', 'status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.contests', 'status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.entries', 'status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.contests', 'beneficiary_split_pct', 'UPDATE'),
  'no session can hand-edit round, contest or entry status, or the published split');

select ok(
  not has_table_privilege('authenticated', 'public.votes', 'INSERT, UPDATE, DELETE'),
  'votes are read-only to staff: only the webhook credits them');

select is_empty(
  $$ select t from unnest(array['free_voters', 'free_vote_challenges', 'free_voter_devices', 'free_votes',
                                'free_vote_reminders', 'free_vote_staff_log']) t
     where has_table_privilege('authenticated', 'public.' || t, 'INSERT, UPDATE, DELETE')
     union all
     select t from unnest(array['free_votes', 'free_voters', 'free_voter_devices', 'free_vote_challenges',
                                'free_vote_staff_log']) t
     where has_table_privilege('service_role', 'public.' || t, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') $$,
  'no session writes free votes or voters: only free_vote_record and the staff functions do');

select ok(
  not has_column_privilege('authenticated', 'public.contests', 'free_vote_enabled', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.contests', 'free_vote_paused_at', 'UPDATE'),
  'no session can hand-flip free voting on, off or paused');

select results_eq(
  $$ select a.attname::text collate "default" from pg_attribute a
     where a.attrelid = 'public.entry_round_totals'::regclass and a.attnum > 0 and not a.attisdropped
     order by a.attnum $$,
  $$ values ('round_id'), ('entry_id'), ('votes'), ('amount_cents'), ('free_votes') $$,
  'the public totals carry sums and counts, never a voter');

select results_eq(
  $$ select name from our_functions where has_function_privilege('anon', oid, 'EXECUTE') order by 1 $$,
  $$ values ('is_admin'), ('round_label') $$,
  'anon can execute only pure, cheap helpers');

select results_eq(
  $$ select name from our_functions where has_function_privilege('authenticated', oid, 'EXECUTE') order by 1 $$,
  $$ values ('close_round'), ('create_contest'), ('delete_draft_contest'), ('disqualify_entry'),
            ('erase_personal_data'), ('is_admin'), ('moderate_entry'), ('open_round'),
            ('open_submissions'), ('round_label'), ('set_free_vote_enabled'), ('set_free_vote_paused'),
            ('update_draft_contest'), ('void_free_voters') $$,
  'signed-in sessions reach only the admin actions, each of which checks is_admin()');

select results_eq(
  $$ select name from our_functions where has_function_privilege('service_role', oid, 'EXECUTE') order by 1 $$,
  $$ values ('confirm_vote'), ('contest_health'), ('create_pending_vote'), ('free_vote_cast'),
            ('free_vote_challenge'), ('free_vote_challenge_sent'), ('free_vote_device_status'),
            ('free_vote_preferences'), ('free_vote_reminder_queue'), ('free_vote_unsubscribe'),
            ('free_vote_verify'), ('hit_rate_limit'), ('insert_entry'), ('is_admin'), ('mark_vote_disputed'),
            ('notification_queue'), ('record_health'), ('record_partial_refund'), ('refund_vote'),
            ('round_label'), ('vote_quote') $$,
  'the edge functions reach exactly the vote lifecycle, free-vote steps, entry insert, rate limiter, mail queue and health checks');


-- ------------------------------------------------------------ anon probes --
create temp table probe (label text, n int);
grant all on probe to anon, authenticated;

set local role anon;
insert into probe values
  ('pending_entries', (select count(id) from entries where status = 'pending')),
  ('approved_entries', (select count(id) from entries where status = 'approved')),
  ('leaderboard',     (select count(*) from entry_round_totals)),
  ('inactive_packs',  (select count(*) from vote_packs where not active)),
  ('stats',           (select count(*) from contest_stats)),
  ('bucket_list',     (select count(*) from storage.objects where bucket_id = 'pets'));
reset role;

select is((select n from probe where label = 'pending_entries'), 0,
  'anon cannot read unmoderated entries');
select cmp_ok((select n from probe where label = 'approved_entries'), '>', 0,
  'anon CAN read approved entries: the gallery works');
select cmp_ok((select n from probe where label = 'leaderboard'), '>', 0,
  'anon CAN read the leaderboard: the public totals view still works');
select is((select n from probe where label = 'inactive_packs'), 0,
  'retired vote packs are not offered');
select is((select n from probe where label = 'bucket_list'), 0,
  'anon cannot list the photo bucket, so unmoderated uploads cannot be found');

set local role anon;
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('pets', 'anon-upload.jpg') $$,
  null,
  'anon cannot write to the photo bucket directly');
select throws_ok(
  $$ select count(*) from free_voters $$,
  '42501', null,
  'anon cannot read free voters at all');
reset role;


-- ---------------------------------------------- signed in, but not admin --
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
insert into probe values
  ('na_votes',   (select count(*) from votes)),
  ('na_pending', (select count(*) from entries where status = 'pending')),
  ('na_late',    (select count(*) from late_confirmations)),
  ('na_owners',  (select count(owner_email) from entries)),
  ('na_list',    (select count(*) from newsletter_signups)),
  ('na_free',    (select count(*) from free_voters) + (select count(*) from free_votes)
                 + (select count(*) from free_vote_staff_log)),
  ('na_bucket',  (select count(*) from storage.objects where bucket_id = 'pets'));
reset role;

select is((select n from probe where label = 'na_votes') + (select n from probe where label = 'na_late'), 0,
  'a signed-in non-admin sees no votes and no buyer emails');
select is((select n from probe where label = 'na_pending'), 0,
  'a signed-in non-admin sees no unmoderated entries');
select is((select n from probe where label = 'na_owners') + (select n from probe where label = 'na_list'), 0,
  'a signed-in non-admin (a moderator since removed, say) reads no owner emails or opt-in list');
select is((select n from probe where label = 'na_bucket'), 0,
  'a signed-in non-admin cannot list the photo bucket either');
select is((select n from probe where label = 'na_free'), 0,
  'a signed-in non-admin reads no free voters, free votes or staff log');

set local role authenticated;
select throws_ok(
  $$ select close_round('00000000-0000-0000-0000-00000000d001') $$,
  'not authorized',
  'a signed-in non-admin cannot close a round');
reset role;


-- ------------------------------------------------------------------ admin --
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into probe values
  ('admin_votes',   (select count(*) from votes)),
  ('admin_free',    (select count(*) from free_voters)),
  ('admin_pending', (select count(*) from entries where status = 'pending'));
reset role;

select cmp_ok((select n from probe where label = 'admin_votes'), '>', 0,
  'an admin can read votes');
select is((select n from probe where label = 'admin_pending'), 3,
  'an admin sees the moderation queue');
select is((select n from probe where label = 'admin_free'), 1,
  'an admin can read free voters, for the Free votes tab');


select * from finish();
rollback;
