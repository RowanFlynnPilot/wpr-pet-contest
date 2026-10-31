-- Two new terminal states for a vote. Alone in their own migration because a
-- value added to an enum cannot be used until the transaction that added it
-- has committed, and 0007 uses both.
--
-- late:     the payment settled after its round was already resolved. Money was
--           taken for votes that did not count. Excluded from every total, so a
--           resolved round's published score never moves after the fact. The
--           webhook refunds these automatically.
-- disputed: the buyer opened a chargeback. Excluded from every total. Without
--           this, a buyer could win a matchup and then take the money back.

alter type vote_status add value if not exists 'late';
alter type vote_status add value if not exists 'disputed';
