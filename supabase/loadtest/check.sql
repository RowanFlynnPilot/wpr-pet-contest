-- After the load: what landed, the drift (must be zero, the same comparison
-- contest_health's tally_drift makes), and what a page poll costs read from
-- the cache against summing the vote tables.

select count(*) filter (where status = 'succeeded') as paid_packs,
       count(*) filter (where status = 'refunded')  as refunded_packs,
       count(*) filter (where status = 'pending')   as pending_checkouts
from votes where round_id = '10ad0000-0000-0000-0000-0000000000a1';

select count(*) as free_votes from free_votes where round_id = '10ad0000-0000-0000-0000-0000000000a1';

create temp view load_drift as
  select coalesce(c.entry_id, l.entry_id) as entry_id,
         c.votes as cached_votes, l.votes as summed_votes,
         c.free_votes as cached_free, l.free_votes as summed_free,
         c.amount_cents as cached_cents, l.amount_cents as summed_cents
  from (select * from round_tally where round_id = '10ad0000-0000-0000-0000-0000000000a1') c
  full outer join (select * from round_live_sums where round_id = '10ad0000-0000-0000-0000-0000000000a1') l
    on l.entry_id = c.entry_id
  where coalesce(c.votes, 0) <> coalesce(l.votes, 0)
     or coalesce(c.free_votes, 0) <> coalesce(l.free_votes, 0)
     or coalesce(c.amount_cents, 0) <> coalesce(l.amount_cents, 0);

select count(*) as drifted_rows from load_drift;
select * from load_drift limit 10;

do $$
declare n int;
begin
  select count(*) into n from load_drift;
  if n > 0 then
    raise exception '% tally row(s) drifted from the vote tables under load', n;
  end if;
end $$;

-- The poll, from the cache, then the same totals summed from the vote tables.
explain (analyze, costs off, summary on)
  select entry_id, votes, free_votes from entry_round_totals where round_id = '10ad0000-0000-0000-0000-0000000000a1';
explain (analyze, costs off, summary on)
  select entry_id, votes, free_votes from round_live_sums where round_id = '10ad0000-0000-0000-0000-0000000000a1';
