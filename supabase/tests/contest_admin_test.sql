-- Run with: supabase test db
--
-- Creating and fixing a contest from the desk, what the shelters are owed,
-- and erasing personal data when the year is up.

create extension if not exists pgtap with schema extensions;

begin;
select plan(31);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';


-- ---------------------------------------------------------------- create --
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok(
  $$ select create_contest(2093, 'Nope', 30, now(), now() + interval '7 days') $$,
  'not authorized', 'only an admin can create a contest');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok($$ select create_contest(2093, '  ', 30, now(), now() + interval '7 days') $$,
  'WP400', 'Give the contest a name.', 'a contest needs a name');
select throws_ok($$ select create_contest(2093, 'X', 120, now(), now() + interval '7 days') $$,
  'WP400', 'The shelter share must be a percentage from 0 to 100.', 'the split is a percentage');
select throws_ok($$ select create_contest(2093, 'X', 30, now(), now() - interval '1 day') $$,
  'WP400', 'Submissions must close after they open.', 'submissions close after they open');
select throws_ok($$ select create_contest(2093, 'X', 30, now(), now() + interval '7 days', 12) $$,
  'WP400', 'The bracket must have 4, 8, 16, 32 or 64 pets.', 'the bracket is a power of two');
select throws_ok($$ select create_contest(2026, 'X', 30, now(), now() + interval '7 days') $$,
  'WP400', 'There is already a 2026 contest.', 'one contest per year');

create temp table made (id uuid);
insert into made select create_contest(2093, 'Cutest Pet 2093', 30, now(), now() + interval '7 days');

select results_eq(
  $$ select status::text, beneficiary_split_pct, bracket_size, bracket_round_hours
     from contests where id = (select id from made) $$,
  $$ values ('draft'::text, 30, 16, 48) $$,
  'a new contest is a draft with the standard bracket');

select results_eq(
  $$ select slug, votes, cents, featured from vote_packs
     where contest_id = (select id from made) order by sort $$,
  $$ values ('starter'::text, 5, 500, false), ('fan', 25, 2000, true), ('superfan', 75, 5000, false),
            ('champion', 200, 10000, false), ('legend', 600, 25000, false) $$,
  'it starts with the recommended pack ladder');


-- ----------------------------------------------------------------- draft --
select lives_ok(
  $$ select update_draft_contest((select id from made), 'Cutest Pet in Marathon County 2093', 35,
                                 now(), now() + interval '8 days', 8, 24) $$,
  'everything about a draft can be changed');

select results_eq(
  $$ select name, beneficiary_split_pct, bracket_size, bracket_round_hours from contests where id = (select id from made) $$,
  $$ values ('Cutest Pet in Marathon County 2093'::text, 35, 8, 24) $$,
  'and the change sticks');

insert into shelters (contest_id, name, url, payout_weight)
values ((select id from made), 'North Shelter', 'https://north.example', 2),
       ((select id from made), 'South Shelter', null, 1);

-- Next year's contest, copied from this one.
create temp table copied (id uuid);
insert into copied select create_contest(2092, 'Copy', 35, now(), now() + interval '7 days', 8, 24, (select id from made));
select results_eq(
  $$ select name, payout_weight from shelters where contest_id = (select id from copied) order by name $$,
  $$ values ('North Shelter'::text, 2), ('South Shelter', 1) $$,
  'a copied contest brings its shelters and their shares');
select is((select count(*)::int from vote_packs where contest_id = (select id from copied)), 5,
  'and its packs');

select lives_ok($$ select delete_draft_contest((select id from copied)) $$, 'an empty draft can be deleted');
select is((select count(*)::int from shelters where contest_id = (select id from copied)), 0,
  'with its packs and shelters');

-- Free the one submissions_open slot the seed contest holds, then open ours.
update contests set status = 'complete' where id = '00000000-0000-0000-0000-0000000000c1';
select open_submissions((select id from made));

select throws_ok(
  $$ select update_draft_contest((select id from made), 'Changed', 50, now(), now() + interval '8 days', 8, 24) $$,
  'WP400', null,
  'once submissions open, the published split and schedule stand');
select throws_ok(
  $$ select delete_draft_contest((select id from made)) $$,
  'WP400', 'Only a draft contest can be deleted.',
  'and the contest can no longer be deleted');


-- ---------------------------------------------------------------- payout --
-- Sales of every kind for one contest: $20 kept but $5 refunded as goodwill,
-- $10 refunded, $8 paid late (refunded), $15 under chargeback, and a checkout
-- never paid.
-- Round 1 is the one open_submissions staged.
update contests set status = 'voting' where id = (select id from made);
create temp table r1 as select id from rounds where contest_id = (select id from made) and seq = 1;
grant select on made, r1 to authenticated;
update rounds set status = 'open', opens_at = now() - interval '1 day', closes_at = now() + interval '1 day'
where id = (select id from r1);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, newsletter_opt_in)
values ('aa000000-0000-0000-0000-00000000000a', (select id from made), 'Payout Pup', 'dog', 'Pat Owner',
        'pat@example.com', 'Wausau', 'p/a.jpg', 'approved', now(), now(), true);
insert into votes (round_id, entry_id, quantity, amount_cents, refunded_cents, buyer_email,
                   stripe_payment_intent_id, status, newsletter_opt_in)
values ((select id from r1), 'aa000000-0000-0000-0000-00000000000a', 25, 2000, 500,  'kept@example.com', 'pi_p_1', 'succeeded', true),
       ((select id from r1), 'aa000000-0000-0000-0000-00000000000a', 10, 1000, 1000, 'ref@example.com',  'pi_p_2', 'refunded',  false),
       ((select id from r1), 'aa000000-0000-0000-0000-00000000000a', 8,  800,  0,    'late@example.com', 'pi_p_3', 'late',      false),
       ((select id from r1), 'aa000000-0000-0000-0000-00000000000a', 15, 1500, 0,    'cb@example.com',   'pi_p_4', 'disputed',  false),
       ((select id from r1), 'aa000000-0000-0000-0000-00000000000a', 9,  999,  0,    'gone@example.com', 'pi_p_5', 'pending',   false);

set local role authenticated;
select results_eq(
  $$ select sales_cents, refunded_cents, disputed_cents, net_cents, shelter_pool_cents
     from payout_statement where contest_id = (select id from made) $$,
  $$ values (5300::bigint, 2300::bigint, 1500::bigint, 1500::bigint, 525::bigint) $$,
  'the statement: sales, refunds, chargebacks, net, and 35% of net for the shelters');

select results_eq(
  $$ select name, amount_cents from shelter_payouts where contest_id = (select id from made) order by name $$,
  $$ values ('North Shelter'::text, 350::bigint), ('South Shelter', 175::bigint) $$,
  'the pool splits two to one by payout weight');
reset role;

select is(
  (select net_cents from payout_statement where contest_id = (select id from made)),
  (select gross_cents from contest_stats where contest_id = (select id from made)),
  'the payout statement agrees with the public raised-for-shelters total');

-- Three equal shelters and a pool that does not divide by three.
insert into shelters (contest_id, name, payout_weight) values ((select id from made), 'West Shelter', 3);
update shelters set payout_weight = 3 where contest_id = (select id from made);
set local role authenticated;
select is(
  (select sum(amount_cents)::bigint from shelter_payouts where contest_id = (select id from made)),
  525::bigint,
  'rounded shares always add up to the pool exactly');
reset role;


-- --------------------------------------------------------------- privacy --
select throws_ok(
  $$ select * from erase_personal_data((select id from made)) $$,
  'WP400', 'Personal data can be erased once the contest is complete.',
  'nothing is erased while the contest is running');

update rounds set status = 'resolved', resolved_at = now() - interval '30 days'
where id = (select id from r1);
update contests set status = 'complete' where id = (select id from made);
select throws_ok(
  $$ select * from erase_personal_data((select id from made)) $$,
  'WP400', null,
  'nor inside the 120-day chargeback window');

update rounds set resolved_at = now() - interval '400 days' where id = (select id from r1);
select ok(
  exists (select 1 from contest_health() where check_name = 'personal_data_due'),
  'a year on, the health checks remind staff of the promise');

select results_eq(
  $$ select entries, votes, notifications from erase_personal_data((select id from made)) $$,
  $$ values (1, 5, 0) $$,
  'erasing reports what it changed');

select is(
  (select count(*)::int from entries e where e.contest_id = (select id from made)
     and (e.owner_email <> 'erased@invalid' or e.owner_name <> 'Erased'))
  + (select count(*)::int from votes v join rounds r on r.id = v.round_id
     where r.contest_id = (select id from made) and v.buyer_email <> 'erased@invalid'),
  0,
  'no entrant or buyer address survives');

select results_eq(
  $$ select sales_cents, net_cents from payout_statement where contest_id = (select id from made) $$,
  $$ values (5300::bigint, 1500::bigint) $$,
  'the money and results are untouched');


-- ------------------------------------------------------------ shelter goal --
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at, submissions_close_at, status)
values ('9a000000-0000-0000-0000-00000000009a', 2099, 'Goal draft', 30, now() + interval '5 days', now() + interval '12 days', 'draft'),
       ('9b000000-0000-0000-0000-00000000009b', 2100, 'Goal live', 30, now() - interval '5 days', now() + interval '2 days', 'submissions_open');
select set_shelter_goal('9a000000-0000-0000-0000-00000000009a', 500000);
select set_shelter_goal('9a000000-0000-0000-0000-00000000009a', 300000);
select is((select shelter_goal_cents from contests where id = '9a000000-0000-0000-0000-00000000009a'), 300000::bigint,
  'a draft''s goal can be set and changed freely');
update contests set shelter_goal_cents = 300000 where id = '9b000000-0000-0000-0000-00000000009b';
select throws_ok($$ select set_shelter_goal('9b000000-0000-0000-0000-00000000009b', 200000) $$,
  'WP400', 'Readers have seen the goal, so it can only be raised. Announce the new goal when you do.',
  'once readers have seen a goal it cannot be lowered');
select throws_ok($$ select set_shelter_goal('9b000000-0000-0000-0000-00000000009b', null) $$,
  'WP400', 'Readers have seen the goal, so it can only be raised. Announce the new goal when you do.',
  'or quietly removed');
select set_shelter_goal('9b000000-0000-0000-0000-00000000009b', 400000);
select is((select shelter_goal_cents from contests where id = '9b000000-0000-0000-0000-00000000009b'), 400000::bigint,
  'it can be raised');
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select throws_ok($$ select set_shelter_goal('9a000000-0000-0000-0000-00000000009a', 100) $$, 'not authorized',
  'only an admin sets the goal');


select * from finish();
rollback;
