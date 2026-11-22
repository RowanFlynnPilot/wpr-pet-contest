-- Each pet's votes, hour by hour, in a round that has opened (Nov. 21, 2026),
-- for the "race so far" visuals: bars that climb and pass each other over a
-- round, and charts of how the standings moved.
--
-- Counts only, like entry_round_totals and entry_round_momentum beside it: a
-- pet, a round, an hour, a number. Nothing about a voter. Paid votes count in
-- the hour Stripe settled them (confirmed_at), free votes in the hour they
-- were cast; a refund, a dispute or a void drops them out, and so does a pet
-- that is no longer approved. A finished round's history is shown as its
-- votes stand now: after a late refund it can sum to a little less than the
-- published result, which never moves (round_results).

create view entry_round_hourly as
  select x.round_id, x.entry_id, x.hour, sum(x.n)::int as votes
  from (
    select v.round_id, v.entry_id, date_trunc('hour', v.confirmed_at) as hour, v.quantity as n
    from votes v
    join rounds r on r.id = v.round_id and r.status <> 'pending'
    join entries e on e.id = v.entry_id and e.status = 'approved'
    where v.status = 'succeeded' and v.confirmed_at is not null
    union all
    select f.round_id, f.entry_id, date_trunc('hour', f.cast_at), 1
    from free_votes f
    join rounds r on r.id = f.round_id and r.status <> 'pending'
    join entries e on e.id = f.entry_id and e.status = 'approved'
    where f.status = 'counted'
  ) x
  group by x.round_id, x.entry_id, x.hour;

grant select on entry_round_hourly to anon, authenticated, service_role;
