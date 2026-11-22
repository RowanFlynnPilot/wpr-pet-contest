-- Run with: supabase test db
--
-- The hour-by-hour counts behind the "race so far" visuals (0040): a number
-- per pet per hour, never a voter; refunds, voids and pets no longer in the
-- contest drop out; nothing for a round that has not opened.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours, free_vote_enabled)
values ('9c000000-0000-0000-0000-0000000000d1', 2105, 'Hourly', 50,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24, true);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select id::uuid, '9c000000-0000-0000-0000-0000000000d1', name, 'dog', 'O', lower(name) || '@example.com', 'Wausau',
       'h/' || name || '.jpg', 'approved', now(), now(), now() - (mins || ' minutes')::interval
from (values ('9a000000-0000-0000-0000-0000000000d1', 'Ace', 3), ('9b000000-0000-0000-0000-0000000000d1', 'Bea', 2),
             ('9e000000-0000-0000-0000-0000000000d1', 'Cy', 1)) as t(id, name, mins);
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('91000000-0000-0000-0000-0000000000d1', '9c000000-0000-0000-0000-0000000000d1',
        1, 'open', 'open', now() - interval '3 days', now() + interval '1 day');
insert into vote_packs (contest_id, slug, label, votes, cents)
values ('9c000000-0000-0000-0000-0000000000d1', 'fan', 'Fan', 25, 2000);

select create_pending_vote('91000000-0000-0000-0000-0000000000d1', '9a000000-0000-0000-0000-0000000000d1', 'fan', 'a@example.com', 'pi_h_1'),
       create_pending_vote('91000000-0000-0000-0000-0000000000d1', '9a000000-0000-0000-0000-0000000000d1', 'fan', 'b@example.com', 'pi_h_2'),
       create_pending_vote('91000000-0000-0000-0000-0000000000d1', '9b000000-0000-0000-0000-0000000000d1', 'fan', 'c@example.com', 'pi_h_3'),
       create_pending_vote('91000000-0000-0000-0000-0000000000d1', '9b000000-0000-0000-0000-0000000000d1', 'fan', 'd@example.com', 'pi_h_4');
select confirm_vote(pi) from unnest(array['pi_h_1', 'pi_h_2', 'pi_h_3', 'pi_h_4']) pi;
-- Ace's first pack settled two days ago; Bea's second was refunded.
update votes set confirmed_at = now() - interval '2 days' where stripe_payment_intent_id = 'pi_h_1';
select refund_vote('pi_h_4');

insert into free_voters (id, contest_id, email, email_key, verified_at)
values ('9f000000-0000-0000-0000-0000000000d1', '9c000000-0000-0000-0000-0000000000d1', 'v@example.com', 'v@example.com', now()),
       ('9f000000-0000-0000-0000-0000000000d2', '9c000000-0000-0000-0000-0000000000d1', 'w@example.com', 'w@example.com', now());
insert into free_votes (round_id, entry_id, voter_id, vote_day, via)
values ('91000000-0000-0000-0000-0000000000d1', '9e000000-0000-0000-0000-0000000000d1', '9f000000-0000-0000-0000-0000000000d1', current_date, 'code'),
       ('91000000-0000-0000-0000-0000000000d1', '9e000000-0000-0000-0000-0000000000d1', '9f000000-0000-0000-0000-0000000000d2', current_date, 'code');
select void_free_voters(array['9f000000-0000-0000-0000-0000000000d2'::uuid], 'Test');

select results_eq(
  $$ select entry_id, sum(votes)::int from entry_round_hourly
     where round_id = '91000000-0000-0000-0000-0000000000d1' group by entry_id order by entry_id $$,
  $$ values ('9a000000-0000-0000-0000-0000000000d1'::uuid, 50), ('9b000000-0000-0000-0000-0000000000d1'::uuid, 25),
            ('9e000000-0000-0000-0000-0000000000d1'::uuid, 1) $$,
  'every counted vote, once: the refund and the voided free vote drop out');

select is(
  (select count(*)::int from entry_round_hourly where entry_id = '9a000000-0000-0000-0000-0000000000d1'), 2,
  'each pack sits in the hour it settled');

select is(
  (select min(hour) from entry_round_hourly where entry_id = '9a000000-0000-0000-0000-0000000000d1'),
  date_trunc('hour', now() - interval '2 days'),
  'hours are whole hours');

select is(
  (select sum(votes)::int from entry_round_hourly where round_id = '91000000-0000-0000-0000-0000000000d1'),
  (select sum(votes)::int from entry_round_totals where round_id = '91000000-0000-0000-0000-0000000000d1'),
  'the history adds up to the live totals');

-- A pet no longer in the contest leaves the history with the standings.
update entries set status = 'rejected', rejection_reason = 'Test' where id = '9b000000-0000-0000-0000-0000000000d1';
select is(
  (select count(*)::int from entry_round_hourly where entry_id = '9b000000-0000-0000-0000-0000000000d1'), 0,
  'a pet no longer approved has no history');

-- A round that has not opened has none.
update rounds set status = 'pending' where id = '91000000-0000-0000-0000-0000000000d1';
select is(
  (select count(*)::int from entry_round_hourly where round_id = '91000000-0000-0000-0000-0000000000d1'), 0,
  'nothing for a round that has not opened');

select results_eq(
  $$ select a.attname::text collate "default" from pg_attribute a
     where a.attrelid = 'public.entry_round_hourly'::regclass and a.attnum > 0 and not a.attisdropped
     order by a.attnum $$,
  $$ values ('round_id'), ('entry_id'), ('hour'), ('votes') $$,
  'the hourly counts carry a number per pet per hour, never a voter');

select * from finish();
rollback;
