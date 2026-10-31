-- How many votes each pet took in the last 24 hours of a round still open,
-- for the "climbing" marks on the Open Round board: the page ranks today's
-- totals against yesterday's (today's minus these) with the same tiebreak
-- close_round uses, and marks a pet that rose three places or more.
--
-- Counts only, like entry_round_totals beside it: a pet, a round, a number.
-- Nothing about a voter, and nothing for a finished round, whose results
-- never move. Paid votes count from when Stripe settled them (confirmed_at);
-- free votes from when they were cast; a refund or a void drops them out.
-- votes_recent_idx (round_id, confirmed_at) and free_votes_cast_idx serve it.

create view entry_round_momentum as
  select x.round_id, x.entry_id, sum(x.n)::int as votes_24h
  from (
    select v.round_id, v.entry_id, v.quantity as n
    from votes v
    join rounds r on r.id = v.round_id
    where r.status = 'open' and v.status = 'succeeded'
      and v.confirmed_at > now() - interval '24 hours'
    union all
    select f.round_id, f.entry_id, 1
    from free_votes f
    join rounds r on r.id = f.round_id
    where r.status = 'open' and f.status = 'counted'
      and f.cast_at > now() - interval '24 hours'
  ) x
  group by x.round_id, x.entry_id;

grant select on entry_round_momentum to anon, authenticated, service_role;
