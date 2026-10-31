-- What every open pet or gallery page polls every 20 seconds.
select entry_id, votes, free_votes
from entry_round_totals
where round_id = '10ad0000-0000-0000-0000-0000000000a1';
