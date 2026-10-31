-- Run with: supabase test db
--
-- Reader engagement (0024): owner goals set by a tokenized link, the buyer
-- "plays again" notes, the entrant nurture emails and their opt-out, and
-- sponsor matches reaching the shelters' payout.

create extension if not exists pgtap with schema extensions;

begin;
select plan(31);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours)
values ('ec000000-0000-0000-0000-0000000000ec', 2101, 'Engagement', 30,
        now() - interval '20 days', now() - interval '13 days', 'voting', 4, 48);
insert into shelters (id, contest_id, name, payout_weight)
values ('e5000000-0000-0000-0000-0000000000e5', 'ec000000-0000-0000-0000-0000000000ec', 'Moments Foster Care', 1);

insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at, seed, owner_token)
select id::uuid, 'ec000000-0000-0000-0000-0000000000ec', name, 'dog', 'O ' || name, lower(name) || '@example.com',
       'Wausau', 'g/' || name || '.jpg', 'approved', now(), now() - interval '12 days', now() - (mins || ' minutes')::interval,
       seed, tok::uuid
from (values ('ea000000-0000-0000-0000-00000000000a', 'Ada', 9, 1, 'aa000000-0000-0000-0000-0000000000aa'),
             ('eb000000-0000-0000-0000-00000000000b', 'Bo',  8, 2, 'bb000000-0000-0000-0000-0000000000bb'),
             ('ee000000-0000-0000-0000-00000000000c', 'Cid', 7, 3, 'cc000000-0000-0000-0000-0000000000cc'),
             ('ed000000-0000-0000-0000-00000000000d', 'Dee', 6, 4, 'dd000000-0000-0000-0000-0000000000dd'))
  as t(id, name, mins, seed, tok);

-- Round 1 resolved; the Sweet 16 (here a 4-pet "Final Four") opened an hour ago.
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at, resolved_at)
values ('e1000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-0000000000ec', 1, 'open', 'resolved',
        now() - interval '12 days', now() - interval '5 days', now() - interval '5 days'),
       ('e2000000-0000-0000-0000-000000000002', 'ec000000-0000-0000-0000-0000000000ec', 2, 'bracket', 'open',
        now() - interval '1 hour', now() + interval '47 hours', null);
insert into matchups (id, round_id, slot, entry_a_id, entry_b_id)
values ('ef000000-0000-0000-0000-00000000000f', 'e2000000-0000-0000-0000-000000000002', 0,
        'ea000000-0000-0000-0000-00000000000a', 'ed000000-0000-0000-0000-00000000000d'),
       ('ef000000-0000-0000-0000-000000000010', 'e2000000-0000-0000-0000-000000000002', 1,
        'eb000000-0000-0000-0000-00000000000b', 'ee000000-0000-0000-0000-00000000000c');
insert into vote_packs (contest_id, slug, label, votes, cents)
values ('ec000000-0000-0000-0000-0000000000ec', 'fan', 'Fan', 25, 2000);

-- The "plays again" box at checkout lands on the vote row (pending until
-- the webhook; the notes only ever count succeeded packs).
select create_pending_vote('e2000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-00000000000a', 'fan',
                           'box@example.com', 'pi_eng_box', false, true);
select is((select plays_again_opt_in from votes where stripe_payment_intent_id = 'pi_eng_box'), true,
  'the checkout box is recorded on the vote');


-- ------------------------------------------------------------ owner goals --
select is(set_entry_goal('ea000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-0000000000aa', 300), 300,
  'the owner''s link sets a goal');
select is((select goal_votes from entries where id = 'ea000000-0000-0000-0000-00000000000a'), 300, 'and it is stored');
select throws_ok($$ select set_entry_goal('ea000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-0000000000bb', 10) $$,
  'WP400', 'That link is not valid.', 'another pet''s token sets nothing');
select throws_ok($$ select set_entry_goal('ea000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-0000000000aa', 0) $$,
  '23514', null, 'a goal is at least one vote');
select ok(has_column_privilege('anon', 'public.entries', 'goal_votes', 'SELECT')
          and not has_column_privilege('anon', 'public.entries', 'owner_token', 'SELECT'),
  'the public sees the goal, never the token');


-- -------------------------------------------------------- buyer notes --
-- Round 1 buyers: two ticked the box; one did not; one payment was late.
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email, stripe_payment_intent_id, status, confirmed_at, plays_again_opt_in)
values ('e1000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000a', 25, 2000, 'fan@example.com', 'pi_e_1', 'succeeded', now(), true),
       ('e1000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-00000000000c', 25, 2000, 'fan@example.com', 'pi_e_2', 'succeeded', now(), true),
       ('e1000000-0000-0000-0000-000000000001', 'eb000000-0000-0000-0000-00000000000b', 25, 2000, 'quiet@example.com', 'pi_e_3', 'succeeded', now(), false),
       ('e1000000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-00000000000d', 25, 2000, 'late@example.com', 'pi_e_4', 'late', now(), true);
select lives_ok($$ select create_pending_vote('e2000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-00000000000a', 'fan', 'five@example.com', 'pi_e_5') $$,
  'the old five-argument call still works');
select is((select plays_again_opt_in from votes where stripe_payment_intent_id = 'pi_e_5'), false, 'and leaves the box unticked');
select create_pending_vote('e2000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-00000000000a', 'fan', 'seven@example.com', 'pi_e_7', false, true);
select is((select plays_again_opt_in from votes where stripe_payment_intent_id = 'pi_e_7'), true, 'the seventh argument ticks it');

select results_eq(
  $$ select email::text, round_name, is_final, playing, ended, champion from buyer_notice_queue(10) $$,
  $$ values ('fan@example.com', 'Final Four'::text, false,
             '[{"pet": "Ada", "opponent": "Dee", "entry_id": "ea000000-0000-0000-0000-00000000000a"}, {"pet": "Cid", "opponent": "Bo", "entry_id": "ee000000-0000-0000-0000-00000000000c"}]'::jsonb,
             '[]'::jsonb, '[]'::jsonb) $$,
  'when the round opens, the buyer who ticked the box gets one note covering both pets; the quiet buyer and the late payment get none');

insert into buyer_notices (email, round_id, kind, unsub_hash, status)
values ('fan@example.com', 'e2000000-0000-0000-0000-000000000002', 'round', '\xb1', 'sent');
select is((select count(*)::int from buyer_notice_queue(10)), 0, 'a recorded send is never sent again');
select ok(buyer_notice_unsubscribe('\xb1'), 'the note''s unsubscribe token is accepted');
select is((select count(*)::int from votes where buyer_email = 'fan@example.com' and plays_again_opt_in), 0,
  'and every box that address ticked in the contest comes off');
select ok(not buyer_notice_unsubscribe('\xb2'), 'an unknown token does nothing');
update votes set plays_again_opt_in = true where buyer_email = 'fan@example.com' and status = 'succeeded';

-- The final: Ada beats Dee, Cid beats Bo in the Final Four; then the final.
update rounds set closes_at = now() - interval '11 minutes' where id = 'e2000000-0000-0000-0000-000000000002';
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email, stripe_payment_intent_id, status, confirmed_at)
values ('e2000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-00000000000a', 25, 2000, 'x@example.com', 'pi_e_a', 'succeeded', now()),
       ('e2000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-00000000000c', 25, 2000, 'y@example.com', 'pi_e_c', 'succeeded', now());
select close_round('e2000000-0000-0000-0000-000000000002');
update rounds set opens_at = now() - interval '1 minute' where contest_id = 'ec000000-0000-0000-0000-0000000000ec' and seq = 3;
update rounds set status = 'open' where contest_id = 'ec000000-0000-0000-0000-0000000000ec' and seq = 3;
select results_eq(
  $$ select email::text, round_name, playing, ended from buyer_notice_queue(10) $$,
  $$ values ('fan@example.com', 'Championship'::text,
             '[{"pet": "Ada", "opponent": "Cid", "entry_id": "ea000000-0000-0000-0000-00000000000a"}, {"pet": "Cid", "opponent": "Ada", "entry_id": "ee000000-0000-0000-0000-00000000000c"}]'::jsonb,
             '[]'::jsonb) $$,
  'the next round opening brings the next note');
insert into buyer_notices (email, round_id, kind, unsub_hash, status)
select 'fan@example.com', id, 'round', '\xb3', 'sent' from rounds where contest_id = 'ec000000-0000-0000-0000-0000000000ec' and seq = 3;


-- --------------------------------------------------------- the nurture --
select is_empty(
  $$ select q.kind, q.pet_name from notification_queue(500) q
     join entries e on e.id = q.entry_id
     where e.contest_id = 'ec000000-0000-0000-0000-0000000000ec' and q.kind like 'nurture_%' $$,
  'a bracket round with two days left owes no nurture email yet');

update rounds set closes_at = now() + interval '30 hours' where contest_id = 'ec000000-0000-0000-0000-0000000000ec' and seq = 3;
select is((select count(*)::int from notification_queue(500) q where q.kind = 'nurture_matchup_last_day'), 0,
  'a matchup whose closing day has not come owes no last-day email');

-- Opting out stops the nurture emails and nothing else.
select ok(entrant_opt_out('ea000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-0000000000aa'), 'the owner''s link opts out');
select ok(not entrant_opt_out('ea000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-0000000000bb'), 'another token does not');

-- Thank you, 36 hours after the final, to everyone but the champion.
update contests set status = 'complete' where id = 'ec000000-0000-0000-0000-0000000000ec';
update rounds set status = 'resolved', resolved_at = now() - interval '2 days',
                  opens_at = now() - interval '5 days', closes_at = now() - interval '3 days'
where contest_id = 'ec000000-0000-0000-0000-0000000000ec' and seq = 3;
update matchups set winner_entry_id = 'ea000000-0000-0000-0000-00000000000a'
where round_id = (select id from rounds where contest_id = 'ec000000-0000-0000-0000-0000000000ec' and seq = 3);
select results_eq(
  $$ select q.pet_name, q.champion_name from notification_queue(500) q
     join entries e on e.id = q.entry_id
     where q.kind = 'nurture_thanks' and e.contest_id = 'ec000000-0000-0000-0000-0000000000ec' order by 1 $$,
  $$ values ('Bo'::text, 'Ada'::text), ('Cid', 'Ada'), ('Dee', 'Ada') $$,
  'thank-you goes to every entrant but the champion, naming the champion; Ada opted out anyway');
select results_eq(
  $$ select email::text, is_final, champion, ended from buyer_notice_queue(10) where contest_id = 'ec000000-0000-0000-0000-0000000000ec' $$,
  $$ values ('fan@example.com', true,
             '[{"pet": "Ada", "opponent": "Cid", "entry_id": "ea000000-0000-0000-0000-00000000000a"}]'::jsonb,
             '[{"pet": "Cid", "round": "Championship", "opponent": "Ada"}]'::jsonb) $$,
  'after the final, the champion''s buyer hears it, and the runner-up''s run ended');


-- Only one contest votes at a time, so the next one opens once this one is complete.
-- An Open Round in its first two days owes the "voting is open" note.
insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at, submissions_close_at, status, bracket_size, bracket_round_hours)
values ('ec000000-0000-0000-0000-0000000000e2', 2102, 'Nurture', 30, now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town, photo_path, status, rights_accepted_at, moderated_at, created_at)
values ('e9000000-0000-0000-0000-000000000091', 'ec000000-0000-0000-0000-0000000000e2', 'Ivy', 'cat', 'I', 'ivy@example.com', 'Wausau', 'n/i.jpg', 'approved', now(), now() - interval '4 days', now() - interval '4 days'),
       ('e9000000-0000-0000-0000-000000000092', 'ec000000-0000-0000-0000-0000000000e2', 'Jax', 'dog', 'J', 'jax@example.com', 'Wausau', 'n/j.jpg', 'approved', now(), now() - interval '4 days', now() - interval '3 days'),
       ('e9000000-0000-0000-0000-000000000093', 'ec000000-0000-0000-0000-0000000000e2', 'Kit', 'dog', 'K', 'kit@example.com', 'Wausau', 'n/k.jpg', 'approved', now(), now() - interval '4 days', now() - interval '2 days');
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('e9000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-0000000000e2', 1, 'open', 'open', now() - interval '1 day', now() + interval '6 days');
select results_eq(
  $$ select q.kind, q.pet_name from notification_queue(500) q where q.round_id = 'e9000000-0000-0000-0000-000000000001' order by 2 $$,
  $$ values ('nurture_open'::text, 'Ivy'::text), ('nurture_open', 'Jax'), ('nurture_open', 'Kit') $$,
  'the Open Round''s first two days owe every entrant "voting is open"');

-- Day four: the halfway note carries the standings.
update rounds set opens_at = now() - interval '4 days', closes_at = now() + interval '3 days' where id = 'e9000000-0000-0000-0000-000000000001';
insert into votes (round_id, entry_id, quantity, amount_cents, buyer_email, stripe_payment_intent_id, status, confirmed_at)
values ('e9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000091', 50, 4000, 'a@example.com', 'pi_n_i', 'succeeded', now()),
       ('e9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000092', 30, 2400, 'b@example.com', 'pi_n_j', 'succeeded', now()),
       ('e9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000093', 10, 800,  'c@example.com', 'pi_n_k', 'succeeded', now());
select results_eq(
  $$ select q.pet_name, q.my_votes, q.rank, q.field_size, q.cut_margin from notification_queue(500) q
     where q.kind = 'nurture_halfway' and q.round_id = 'e9000000-0000-0000-0000-000000000001' order by q.rank $$,
  $$ values ('Ivy'::text, 50, 1, 3, 40), ('Jax', 30, 2, 3, 20), ('Kit', 10, 3, 3, -21) $$,
  'halfway: rank, field, and the margin above the cut or the votes to pass the last pet in');
select is((select count(*)::int from notification_queue(500) q where q.kind = 'nurture_open' and q.round_id = 'e9000000-0000-0000-0000-000000000001'), 0,
  'the "voting is open" note is not owed after day two');

-- ------------------------------------------------------- sponsor matches --
insert into sponsor_matches (contest_id, sponsor_name, starts_at, ends_at, ratio, cap_cents)
values ('ec000000-0000-0000-0000-0000000000e2', 'Example Pet Supply', now() - interval '1 hour', now() + interval '1 hour', 1, 500000);
select is(sponsor_match_cents('ec000000-0000-0000-0000-0000000000e2'), 7200::bigint,
  'a 1:1 match earns the net sales whose checkout began in its window');
update sponsor_matches set cap_cents = 5000 where contest_id = 'ec000000-0000-0000-0000-0000000000e2';
select is(sponsor_match_cents('ec000000-0000-0000-0000-0000000000e2'), 5000::bigint, 'up to its cap');
update votes set refunded_cents = 800 where stripe_payment_intent_id = 'pi_n_k';
update sponsor_matches set cap_cents = 500000 where contest_id = 'ec000000-0000-0000-0000-0000000000e2';
select is(sponsor_match_cents('ec000000-0000-0000-0000-0000000000e2'), 6400::bigint, 'a refund takes its sale out of the match');
select results_eq(
  $$ select match_cents, shelter_cents from contest_stats where contest_id = 'ec000000-0000-0000-0000-0000000000e2' $$,
  $$ values (6400::bigint, 1920::bigint) $$,
  'contest_stats carries the match beside the share of sales');
insert into shelters (contest_id, name, payout_weight) values ('ec000000-0000-0000-0000-0000000000e2', 'Northwoods Rescue', 1);
select results_eq(
  $$ select name, amount_cents from shelter_payouts where contest_id = 'ec000000-0000-0000-0000-0000000000e2' order by name $$,
  $$ values ('Northwoods Rescue'::text, 8320::bigint) $$,
  'the shelter''s payout is the share of sales plus the match');
select throws_ok(
  $$ insert into sponsor_matches (contest_id, sponsor_name, starts_at, ends_at, cap_cents)
     values ('ec000000-0000-0000-0000-0000000000e2', 'Another', now(), now() + interval '2 hours', 100) $$,
  '23P01', null, 'match windows cannot overlap');
select ok(has_table_privilege('anon', 'public.sponsor_matches', 'SELECT')
          and not has_table_privilege('anon', 'public.buyer_notices', 'SELECT'),
  'match windows are public; buyer notes are not');

select * from finish();
rollback;
