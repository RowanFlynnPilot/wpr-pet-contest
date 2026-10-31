-- Run with: supabase test db
--
-- The free daily vote (0019). One free vote per verified address per Central
-- day, written only by free_vote_record: by emailed code, emailed link, or a
-- browser remembered after one. Deadlines follow the paid side, the snapshot
-- freezes free votes with paid ones, a disqualified pet's free votes go back
-- to their voters, and it all erases with the rest of the personal data.
--
-- now() is fixed for the whole transaction, so "before" and "after" a
-- deadline are made by moving the deadline, not the clock.

create extension if not exists pgtap with schema extensions;

begin;
select plan(60);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours, free_vote_enabled)
values ('fc000000-0000-0000-0000-0000000000fc', 2095, 'Free votes', 30,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24, true),
       ('fd000000-0000-0000-0000-0000000000fd', 2096, 'Draft', 30,
        now() + interval '10 days', now() + interval '17 days', 'draft', 2, 24, false);

insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select id::uuid, 'fc000000-0000-0000-0000-0000000000fc', name, 'dog', 'Owner', lower(name) || '@example.com',
       'Wausau', 'f/' || name || '.jpg', status::entry_status, now(), now(), now() - (mins || ' minutes')::interval
from (values ('fa000000-0000-0000-0000-00000000000a', 'Ace',  'approved', 5),
             ('fb000000-0000-0000-0000-00000000000b', 'Bea',  'approved', 4),
             ('fe000000-0000-0000-0000-00000000000c', 'Cy',   'approved', 3),
             ('ff000000-0000-0000-0000-00000000000e', 'Eli',  'approved', 2),
             ('f9000000-0000-0000-0000-00000000000d', 'Dot',  'pending',  1)) as t(id, name, status, mins);
update entries set moderated_at = null where pet_name = 'Dot' and contest_id = 'fc000000-0000-0000-0000-0000000000fc';

insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('f1000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-0000000000fc',
        1, 'open', 'open', now() - interval '1 day', now() + interval '1 day');

-- One paid vote for Bea, so seeding has paid and free to rank together.
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email, stripe_payment_intent_id, status, confirmed_at)
values ('f1000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-00000000000b', 1, 100,
        'buyer@example.com', 'pi_free_b', 'succeeded', now());

-- Shorthand: request a code for a pet, returning the challenge id.
create temp table ch (who text primary key, id uuid);
create function pg_temp.req(p_who text, p_email text, p_entry uuid, p_hmac bytea, p_link bytea,
                            p_news boolean default false, p_remind boolean default false) returns uuid
  language sql as $$
  insert into ch
  select p_who, c.challenge_id
  from free_vote_challenge(gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001', p_entry, p_email, p_hmac, p_link,
                           'ip1', p_news, p_remind) c
  returning id
$$;


-- ------------------------------------------------------------ the helpers --
select is(email_key('Jo.Smith+pets@Gmail.com'), 'josmith@gmail.com',
  'Gmail dots and +tags fold into one address');
select is(email_key(' jo.smith+x@Example.org '), 'jo.smith@example.org',
  'elsewhere +tags fold but dots stay: they can be different inboxes');
select is(email_key('a.b@googlemail.com'), 'ab@gmail.com', 'googlemail is gmail');
select is(email_key('J.o-e_y+x@PM.me'), 'joey@proton.me', 'Proton folds dots, hyphens, underscores and its domains');
select ok(free_vote_email('<ab@gmail.com>') is null and free_vote_email('x<ab@gmail.com>') is null
          and free_vote_email('"x" <ab@gmail.com>') is null and free_vote_email('ab@gmail.com,') is null
          and free_vote_email('a b@gmail.com') is null,
  'display names, brackets, quotes, commas and spaces are refused: one inbox, one key');
select is(free_vote_email(' A.B@Gmail.COM. '), 'a.b@gmail.com', 'a trailing dot and case are normalized away');
select ok(free_vote_day('2026-11-01 05:30+00') = '2026-11-01'
          and free_vote_day('2026-11-02 05:30+00') = '2026-11-01'
          and free_vote_day('2026-11-02 06:30+00') = '2026-11-02',
  'the Central day runs 25 hours when daylight time ends, and the next vote unlocks at local midnight');


-- --------------------------------------------------------------- the flag --
update contests set free_vote_enabled = false where id = 'fc000000-0000-0000-0000-0000000000fc';
select throws_ok(
  $$ select pg_temp.req('off', 'off@example.com', 'fa000000-0000-0000-0000-00000000000a', '\x01', '\xa0') $$,
  'WP400', 'Free voting isn''t part of this contest.', 'no free votes unless the contest has them');
update contests set free_vote_enabled = true where id = 'fc000000-0000-0000-0000-0000000000fc';

select throws_ok(
  $$ select set_free_vote_enabled('fc000000-0000-0000-0000-0000000000fc', false) $$,
  'WP400', 'The free daily vote is in the published rules, so it can only be changed while the contest is a draft.',
  'free voting freezes when submissions open');
select set_free_vote_enabled('fd000000-0000-0000-0000-0000000000fd', true);
select ok((select free_vote_enabled from contests where id = 'fd000000-0000-0000-0000-0000000000fd'),
  'a draft can turn free voting on');
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok($$ select set_free_vote_enabled('fd000000-0000-0000-0000-0000000000fd', false) $$,
  'not authorized', 'only an admin changes the setting');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';


-- ------------------------------------------------------- requests, refused --
select throws_ok(
  $$ select pg_temp.req('bad', 'not-an-address', 'fa000000-0000-0000-0000-00000000000a', '\x01', '\xa1') $$,
  'WP400', 'Enter a valid email address.', 'a code needs a real-looking address');
select throws_ok(
  $$ select pg_temp.req('dot', 'dot@example.com', 'f9000000-0000-0000-0000-00000000000d', '\x01', '\xa2') $$,
  'WP400', 'That pet is not in this contest.', 'no free votes for an unmoderated pet');


-- ---------------------------------------------------------- code, verified --
select pg_temp.req('jo', 'Jo@Example.com', 'fa000000-0000-0000-0000-00000000000a', '\x11', '\xb1');
select is((select masked_email from free_vote_challenge(gen_random_uuid(), 'f1000000-0000-0000-0000-000000000001',
            'fa000000-0000-0000-0000-00000000000a', 'jo@example.com', '\x12', '\xb2', 'ip1', false, false)),
  'j•••@example.com', 'the reader sees their address masked');
select is((select count(*)::int from free_voters where contest_id = 'fc000000-0000-0000-0000-0000000000fc'
           and email_key = 'jo@example.com'), 1, 'one voter per address, however it is typed');

select is((select outcome || ': ' || message from free_vote_verify('code', (select id from ch where who = 'jo'), '\xff', '\xd1', 'ip1')),
  'wrong: That code doesn''t match. 4 tries left.', 'a wrong code counts down');
select is((select outcome from free_vote_verify('code', (select id from ch where who = 'jo'), '\x11', '\xd1', 'ip1')),
  'cast', 'the right code verifies the address and casts the vote');
select is((select outcome from free_vote_verify('code', (select id from ch where who = 'jo'), '\x11', '\xd1', 'ip1')),
  'used', 'a code works once');
select results_eq(
  $$ select votes, free_votes from entry_round_totals
     where round_id = 'f1000000-0000-0000-0000-000000000001' and entry_id = 'fa000000-0000-0000-0000-00000000000a' $$,
  $$ values (1, 1) $$,
  'the free vote reaches the public totals, and the free share is shown');

select is((select outcome from free_vote_cast('\xd1', 'f1000000-0000-0000-0000-000000000001',
                                              'fb000000-0000-0000-0000-00000000000b', 'ip1')),
  'already_voted', 'one free vote a day, whichever pet');
select results_eq(
  $$ select voted_today, voted_entry_id from free_vote_device_status('\xd1') $$,
  $$ values (true, 'fa000000-0000-0000-0000-00000000000a'::uuid) $$,
  'the remembered browser knows today''s vote is spent, and for whom');
select ok((select next_vote_at from free_vote_device_status('\xd1'))
          = ((free_vote_day(now()) + 1)::timestamp at time zone 'America/Chicago'),
  'and that the next one unlocks at midnight Central');
select is((select outcome from free_vote_cast('\xee', 'f1000000-0000-0000-0000-000000000001',
                                              'fa000000-0000-0000-0000-00000000000a', 'ip1')),
  'unknown_device', 'an unknown browser is sent back to email');


-- ------------------------------------------------------ guessing and expiry --
select pg_temp.req('kay', 'kay@example.com', 'fe000000-0000-0000-0000-00000000000c', '\x21', '\xc1', true, false);
select free_vote_verify('code', (select id from ch where who = 'kay'), '\x00', null, 'ip1') from generate_series(1, 4);
select is((select outcome from free_vote_verify('code', (select id from ch where who = 'kay'), '\x00', null, 'ip1')),
  'locked', 'the fifth wrong code kills the challenge');
select is((select outcome from free_vote_verify('code', (select id from ch where who = 'kay'), '\x21', null, 'ip1')),
  'locked', 'and the right code no longer works on it');

select pg_temp.req('pat', 'pat@example.com', 'fe000000-0000-0000-0000-00000000000c', '\x31', '\xc2');
update free_vote_challenges set expires_at = now() - interval '1 minute' where id = (select id from ch where who = 'pat');
select is((select outcome from free_vote_verify('code', (select id from ch where who = 'pat'), '\x31', null, 'ip1')),
  'expired', 'an expired code does nothing');

select pg_temp.req('cap1', 'cap@example.com', 'fa000000-0000-0000-0000-00000000000a', '\x41', '\xc3');
select pg_temp.req('cap2', 'Cap+a@example.com', 'fa000000-0000-0000-0000-00000000000a', '\x42', '\xc4');
select pg_temp.req('cap3', 'cap+b@example.com', 'fa000000-0000-0000-0000-00000000000a', '\x43', '\xc5');
select throws_ok(
  $$ select pg_temp.req('cap4', 'CAP@example.com', 'fa000000-0000-0000-0000-00000000000a', '\x44', '\xc6') $$,
  'WP400', 'Too many codes requested for this address. Try again in a few minutes.',
  'codes per address are capped, +tags included, so the site cannot flood an inbox');


-- --------------------------------------------- link, opt-ins, newsletter --
select pg_temp.req('lee', 'lee@example.com', 'fe000000-0000-0000-0000-00000000000c', '\x51', '\xd5', true, true);
select is((select outcome from free_vote_verify('code', (select id from ch where who = 'lee'), '\x51', '\xd2', 'ip2')),
  'cast', 'a second reader votes for Cy');
select pg_temp.req('max', 'max@example.com', 'fe000000-0000-0000-0000-00000000000c', '\x61', '\xd6');
select is((select outcome from free_vote_verify('link', null, '\xd6', '\xd3', 'ip2')),
  'cast', 'the emailed link works too, for readers who open it on another device');
select results_eq(
  $$ select email::text, sources from newsletter_signups
     where contest_id = 'fc000000-0000-0000-0000-0000000000fc' and sources like '%free vote%' order by 1 $$,
  $$ values ('lee@example.com', 'free vote') $$,
  'the newsletter list takes free voters who ticked the box and confirmed the address, and no one else');
select ok((select reminders_opt_in from free_voters where email_key = 'lee@example.com'),
  'the reminder opt-in applies once the address is confirmed');
select pg_temp.req('vic', 'vic@example.com', 'fe000000-0000-0000-0000-00000000000c', '\x62', '\xd8', true, true);
select free_vote_verify('link', null, '\xd8', '\xd9', 'ip9');
select ok((select not newsletter_opt_in and not reminders_opt_in from free_voters where email_key = 'vic@example.com'),
  'a tapped link does not carry opt-ins someone else may have ticked when asking for the code');

-- An unproven request for a variant never rewrites a verified address.
select pg_temp.req('lee2', 'Lee+other@Example.com', 'fe000000-0000-0000-0000-00000000000c', '\x63', '\xda');
select is((select email::text from free_voters where email_key = 'lee@example.com'), 'lee@example.com',
  'asking for a code for a +tag variant leaves the verified address alone');


-- ---------------------------------------------------------- disqualification --
select pg_temp.req('ned', 'ned@example.com', 'ff000000-0000-0000-0000-00000000000e', '\x71', '\xd7');
select is((select outcome from free_vote_verify('code', (select id from ch where who = 'ned'), '\x71', '\xd4', 'ip3')),
  'cast', 'Ned votes for Eli');
select * from disqualify_entry('ff000000-0000-0000-0000-00000000000e', 'Stolen photo');
select is((select status::text from free_votes f join free_voters fv on fv.id = f.voter_id where fv.email_key = 'ned@example.com'),
  'returned', 'a disqualified pet''s free votes go back to their voters');
select is((select outcome from free_vote_cast('\xd4', 'f1000000-0000-0000-0000-000000000001',
                                              'fa000000-0000-0000-0000-00000000000a', 'ip3')),
  'cast', 'and the voter may vote again that day');


-- ------------------------------------------------------------------ pause --
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok($$ select set_free_vote_paused('fc000000-0000-0000-0000-0000000000fc', true, 'Abuse') $$,
  'not authorized', 'only an admin pauses free voting');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select throws_ok($$ select set_free_vote_paused('fc000000-0000-0000-0000-0000000000fc', true, ' ') $$,
  'WP400', 'A reason is required. It is kept in the log.', 'a pause needs a reason');
select set_free_vote_paused('fc000000-0000-0000-0000-0000000000fc', true, 'Bot traffic');
select is((select outcome || ': ' || message from free_vote_cast('\xd2', 'f1000000-0000-0000-0000-000000000001',
                                                                 'fa000000-0000-0000-0000-00000000000a', 'ip2')),
  'refused: Free voting is paused right now. Vote packs are still open.', 'paused means paused');
update contests set free_vote_paused_at = now() - interval '2 hours' where id = 'fc000000-0000-0000-0000-0000000000fc';
select ok(exists (select 1 from contest_health() where check_name = 'free_vote_paused'),
  'a pause left on for an hour raises a health warning');
select set_free_vote_paused('fc000000-0000-0000-0000-0000000000fc', false, 'Cleared');
select is((select count(*)::int from free_vote_staff_log
           where contest_id = 'fc000000-0000-0000-0000-0000000000fc' and action in ('pause', 'resume')), 2,
  'pauses and resumes are logged with who and why');


-- -------------------------------------------------------------- reminders --
insert into free_voters (id, contest_id, email, email_key, verified_at, reminders_opt_in)
values ('f7000000-0000-0000-0000-000000000007', 'fc000000-0000-0000-0000-0000000000fc', 'rae@example.com', 'rae@example.com', now(), true);
insert into free_vote_reminders (voter_id, reminder_day, link_hash, unsub_hash, status)
values ('f7000000-0000-0000-0000-000000000007', free_vote_day(now()) - 2, '\x71', '\x72', 'sent');
select is((select outcome from free_vote_verify('reminder', null, '\x72', '\xdb', 'ip7')), 'invalid',
  'the unsubscribe token proves nothing: it cannot sign a browser in');
select ok(free_vote_unsubscribe('\x72'), 'the unsubscribe token is accepted');
select ok(not (select reminders_opt_in from free_voters where email = 'rae@example.com'), 'and reminders are off');
update free_voters set reminders_opt_in = true where email = 'rae@example.com';
update free_vote_reminders set reminder_day = free_vote_day(now()) where link_hash = '\x71';
select is((select outcome from free_vote_verify('reminder', null, '\x71', '\xdc', 'ip7')), 'verified',
  'the reminder link signs this browser in');
select is((select outcome from free_vote_verify('reminder', null, '\x71', '\xdd', 'ip7')), 'used',
  'and works only once');
delete from free_vote_reminders where link_hash = '\x71';
select ok(extract(hour from now() at time zone 'America/Chicago') < free_vote_reminder_hour()
          or exists (select 1 from free_vote_reminder_queue(50) where email = 'rae@example.com'),
  'a reader who opted in and has not voted today is owed a reminder after the morning hour');
select ok(not exists (select 1 from free_vote_reminder_queue(50) where email = 'lee@example.com'),
  'a reader who already voted today gets no reminder');


-- -------------------------------------------------------------- deadlines --
update rounds set closes_at = now() - interval '1 minute' where id = 'f1000000-0000-0000-0000-000000000001';
select throws_ok(
  $$ select pg_temp.req('late', 'late@example.com', 'fa000000-0000-0000-0000-00000000000a', '\x81', '\xe1') $$,
  'WP400', 'Voting is closed for this round.', 'no codes after the deadline');
select is((select outcome from free_vote_cast('\xd2', 'f1000000-0000-0000-0000-000000000001',
                                              'fa000000-0000-0000-0000-00000000000a', 'ip2')),
  'refused', 'a remembered browser cannot vote after the deadline');

insert into free_voters (id, contest_id, email, email_key)
values ('f5000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-0000000000fc', 'sam@example.com', 'sam@example.com'),
       ('f6000000-0000-0000-0000-000000000006', 'fc000000-0000-0000-0000-0000000000fc', 'uma@example.com', 'uma@example.com');
insert into free_vote_challenges (id, voter_id, round_id, entry_id, email, code_hmac, link_hash, created_at, expires_at)
values ('f5c00000-0000-0000-0000-000000000005', 'f5000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000001',
        'fa000000-0000-0000-0000-00000000000a', 'sam@example.com', '\x91', '\xe5', now() - interval '2 minutes', now() + interval '10 minutes'),
       ('f6c00000-0000-0000-0000-000000000006', 'f6000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000001',
        'fa000000-0000-0000-0000-00000000000a', 'uma@example.com', '\x92', '\xe6', now(), now() + interval '10 minutes');
select is((select outcome from free_vote_verify('code', 'f5c00000-0000-0000-0000-000000000005', '\x91', null, 'ip5')),
  'cast', 'a code requested before the deadline may be confirmed within the grace');
select is((select outcome from free_vote_verify('code', 'f6c00000-0000-0000-0000-000000000006', '\x92', null, 'ip6')),
  'refused', 'a code requested after the deadline casts nothing');


-- ---------------------------------------------------- snapshot and seeding --
select is((select free_votes from contest_stats where contest_id = 'fc000000-0000-0000-0000-0000000000fc'), 6,
  'contest_stats counts the free votes that count, separately from votes sold');

update rounds set closes_at = now() - interval '11 minutes' where id = 'f1000000-0000-0000-0000-000000000001';
select close_round('f1000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select e.pet_name, rr.votes, rr.free_votes from round_results rr join entries e on e.id = rr.entry_id
     where rr.round_id = 'f1000000-0000-0000-0000-000000000001' order by 1 $$,
  $$ values ('Ace'::text, 3, 3), ('Bea', 1, 0), ('Cy', 3, 3) $$,
  'the snapshot freezes paid and free together; the returned vote is not in it');
select results_eq(
  $$ select pet_name, seed from entries where contest_id = 'fc000000-0000-0000-0000-0000000000fc' and seed is not null order by seed $$,
  $$ values ('Ace'::text, 1), ('Cy', 2) $$,
  'free votes count toward seeding like any vote');

select is(void_free_voters(array(select id from free_voters where email_key in ('lee@example.com', 'max@example.com')),
                           'Same household, two addresses'), 0,
  'voiding after results voids nothing: finished rounds keep their results');
select results_eq(
  $$ select votes, free_votes from entry_round_totals
     where round_id = 'f1000000-0000-0000-0000-000000000001' and entry_id = 'fe000000-0000-0000-0000-00000000000c' $$,
  $$ values (3, 3) $$,
  'a resolved round''s totals never move');
select ok((select bool_and(blocked_at is not null) from free_voters where email_key in ('lee@example.com', 'max@example.com'))
          and not exists (select 1 from free_voter_devices d join free_voters fv on fv.id = d.voter_id
                          where fv.email_key = 'lee@example.com' and d.revoked_at is null),
  'the voters are blocked and their browsers revoked');


-- ---------------------------------------------------------------- erasure --
update contests set status = 'complete' where id = 'fc000000-0000-0000-0000-0000000000fc';
update rounds set resolved_at = now() - interval '200 days' where contest_id = 'fc000000-0000-0000-0000-0000000000fc' and resolved_at is not null;
select is((select free_voters from erase_personal_data('fc000000-0000-0000-0000-0000000000fc')),
  (select count(*)::int from free_voters where contest_id = 'fc000000-0000-0000-0000-0000000000fc'),
  'erasure takes every free voter''s address');
select ok(not exists (select 1 from free_voters where contest_id = 'fc000000-0000-0000-0000-0000000000fc'
                      and (email <> 'erased@invalid' or email_key not like 'erased:%' or newsletter_opt_in or reminders_opt_in))
          and not exists (select 1 from free_vote_challenges ch join free_voters fv on fv.id = ch.voter_id
                          where fv.contest_id = 'fc000000-0000-0000-0000-0000000000fc')
          and not exists (select 1 from free_votes f join rounds r on r.id = f.round_id
                          where r.contest_id = 'fc000000-0000-0000-0000-0000000000fc' and f.ip_hash is not null),
  'addresses, normalized keys, codes and connection hashes are gone; the votes and results stay');

select * from finish();
rollback;
