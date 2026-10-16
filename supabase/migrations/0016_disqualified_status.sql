-- An entry removed after voting started: a stolen photo reported mid-contest,
-- an ineligible entrant, an owner caught cheating. Alone in its own migration
-- because a new enum value cannot be used in the transaction that adds it.
alter type entry_status add value if not exists 'disqualified';
