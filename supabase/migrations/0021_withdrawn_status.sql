-- An entry its owner takes out of the contest: a pet that has died or been
-- rehomed, a family that changed its mind. Unlike a disqualification, nobody
-- is refunded. Alone in its own migration because a new enum value cannot be
-- used in the transaction that adds it.
alter type entry_status add value if not exists 'withdrawn';
