-- Run with: supabase test db
--
-- The live tally cache (0025) equals the vote tables after every kind of
-- write, the public totals read from it, drift is reported, and close_round
-- never trusts it.

create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours, free_vote_enabled)
values ('7c000000-0000-0000-0000-0000000000c7', 2103, 'Tally', 30,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24, true);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at, created_at)
select id::uuid, '7c000000-0000-0000-0000-0000000000c7', name, 'dog', 'O', lower(name) || '@example.com', 'Wausau',
       't/' || name || '.jpg', 'approved', now(), now(), now() - (mins || ' minutes')::interval
from (values ('7a000000-0000-0000-0000-0000000000a7', 'Ace', 3), ('7b000000-0000-0000-0000-0000000000b7', 'Bea', 2),
             ('7e000000-0000-0000-0000-0000000000e7', 'Cy', 1)) as t(id, name, mins);
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('71000000-0000-0000-0000-000000000017', '7c000000-0000-0000-0000-0000000000c7',
        1, 'open', 'open', now() - interval '2 days', now() + interval '1 day');
insert into vote_packs (contest_id, slug, label, votes, cents)
values ('7c000000-0000-0000-0000-0000000000c7', 'fan', 'Fan', 25, 2000);

-- The drift between the cache and the vote tables, for live rounds.
create function pg_temp.drift() returns int language sql as $$
  select count(*)::int
  from (select t.* from round_tally t join rounds r on r.id = t.round_id and r.status <> 'resolved') c
  full outer join (select s.* from round_live_sums s join rounds r on r.id = s.round_id and r.status <> 'resolved') l
    on l.round_id = c.round_id and l.entry_id = c.entry_id
  where coalesce(c.votes, 0) <> coalesce(l.votes, 0) or coalesce(c.free_votes, 0) <> coalesce(l.free_votes, 0)
     or coalesce(c.amount_cents, 0) <> coalesce(l.amount_cents, 0)
$$;


-- --------------------------------------------------------- every write --
select create_pending_vote('71000000-0000-0000-0000-000000000017', '7a000000-0000-0000-0000-0000000000a7', 'fan', 'a@example.com', 'pi_t_1'),
       create_pending_vote('71000000-0000-0000-0000-000000000017', '7a000000-0000-0000-0000-0000000000a7', 'fan', 'b@example.com', 'pi_t_2'),
       create_pending_vote('71000000-0000-0000-0000-000000000017', '7b000000-0000-0000-0000-0000000000b7', 'fan', 'c@example.com', 'pi_t_3'),
       create_pending_vote('71000000-0000-0000-0000-000000000017', '7e000000-0000-0000-0000-0000000000e7', 'fan', 'd@example.com', 'pi_t_4');
select is((select count(*)::int from round_tally where round_id = '71000000-0000-0000-0000-000000000017'), 0,
  'a pending checkout is not a vote');
select confirm_vote(pi) from unnest(array['pi_t_1', 'pi_t_2', 'pi_t_3']) pi;
select results_eq(
  $$ select entry_id, votes, amount_cents from entry_round_totals where round_id = '71000000-0000-0000-0000-000000000017' order by votes desc $$,
  $$ values ('7a000000-0000-0000-0000-0000000000a7'::uuid, 50, 4000::bigint), ('7b000000-0000-0000-0000-0000000000b7', 25, 2000::bigint) $$,
  'confirmed payments reach the public totals through the cache');

select refund_vote('pi_t_2');
select record_partial_refund('pi_t_3', 500);
select mark_vote_disputed('pi_t_3');
select mark_dispute_won('pi_t_3');
update rounds set closes_at = now() - interval '3 minutes' where id = '71000000-0000-0000-0000-000000000017';
select confirm_vote('pi_t_4');   -- past the deadline and its grace: late, never credited
update rounds set closes_at = now() + interval '1 day' where id = '71000000-0000-0000-0000-000000000017';

insert into free_voters (id, contest_id, email, email_key, verified_at)
values ('7f000000-0000-0000-0000-0000000000f7', '7c000000-0000-0000-0000-0000000000c7', 'v@example.com', 'v@example.com', now()),
       ('7f000000-0000-0000-0000-0000000000f8', '7c000000-0000-0000-0000-0000000000c7', 'w@example.com', 'w@example.com', now());
insert into free_votes (round_id, entry_id, voter_id, vote_day, via)
values ('71000000-0000-0000-0000-000000000017', '7e000000-0000-0000-0000-0000000000e7', '7f000000-0000-0000-0000-0000000000f7', current_date, 'code'),
       ('71000000-0000-0000-0000-000000000017', '7e000000-0000-0000-0000-0000000000e7', '7f000000-0000-0000-0000-0000000000f8', current_date, 'code');
select void_free_voters(array['7f000000-0000-0000-0000-0000000000f8'::uuid], 'Test');

select results_eq(
  $$ select entry_id, votes, amount_cents, free_votes from entry_round_totals where round_id = '71000000-0000-0000-0000-000000000017' order by votes desc, entry_id $$,
  $$ values ('7a000000-0000-0000-0000-0000000000a7'::uuid, 25, 2000::bigint, 0), ('7b000000-0000-0000-0000-0000000000b7', 25, 2000::bigint, 0),
            ('7e000000-0000-0000-0000-0000000000e7', 1, 0::bigint, 1) $$,
  'refunds, a won dispute, a late payment, free votes and a void all land in the cache');
select is(pg_temp.drift(), 0, 'and the cache equals the vote tables exactly');
select ok(not exists (select 1 from contest_health() where check_name = 'tally_drift'), 'no drift, no alert');


-- ------------------------------------------------------------------ drift --
update round_tally set votes = votes + 7 where round_id = '71000000-0000-0000-0000-000000000017' and entry_id = '7a000000-0000-0000-0000-0000000000a7';
select is(pg_temp.drift(), 1, 'a tampered cache row is drift');
select ok(exists (select 1 from contest_health() where check_name = 'tally_drift' and severity = 'alert'),
  'and the health checks say so');
select is(rebuild_round_tally('71000000-0000-0000-0000-000000000017'), 3, 'a rebuild rewrites the round from the vote tables');
select is(pg_temp.drift(), 0, 'and the drift is gone');


-- ----------------------------------------------------------- close_round --
update round_tally set votes = 999 where round_id = '71000000-0000-0000-0000-000000000017' and entry_id = '7b000000-0000-0000-0000-0000000000b7';
update rounds set closes_at = now() - interval '11 minutes' where id = '71000000-0000-0000-0000-000000000017';
select close_round('71000000-0000-0000-0000-000000000017');
select results_eq(
  $$ select e.pet_name, rr.votes from round_results rr join entries e on e.id = rr.entry_id
     where rr.round_id = '71000000-0000-0000-0000-000000000017' order by rr.votes desc, e.pet_name $$,
  $$ values ('Ace'::text, 25), ('Bea', 25), ('Cy', 1) $$,
  'close_round never trusts the cache: the snapshot comes from the vote tables');
select ok(not has_table_privilege('anon', 'public.round_tally', 'SELECT') and not has_table_privilege('authenticated', 'public.round_tally', 'SELECT'),
  'the cache is reached only through entry_round_totals');

select * from finish();
rollback;
