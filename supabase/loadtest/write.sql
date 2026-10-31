-- A checkout, then its webhook: the real paid path for one pack.
\set e random(1, 400)
select nextval('load_seq') as k \gset
select vote_id from create_pending_vote('10ad0000-0000-0000-0000-0000000000a1',
  (select id from load_entries where n = :e), 'fan', 'buyer' || :k || '@example.com', 'pi_load_' || :k);
select confirm_vote('pi_load_' || :k);
