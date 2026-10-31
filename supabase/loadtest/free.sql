-- A free vote from a newly verified address. In production only
-- free_vote_record writes free_votes; this is the same insert, and the same
-- statement trigger keeps the tally.
\set e random(1, 400)
select nextval('load_seq') as k \gset
with v as (
  insert into free_voters (contest_id, email, email_key, verified_at)
  values ('10ad0000-0000-0000-0000-0000000000c1', 'free' || :k || '@example.com', 'free' || :k || '@example.com', now())
  returning id
)
insert into free_votes (round_id, entry_id, voter_id, vote_day, via)
select '10ad0000-0000-0000-0000-0000000000a1', (select id from load_entries where n = :e), v.id, current_date, 'code'
from v;
