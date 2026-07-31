-- Applied by `supabase db reset` after migrations. Local development only —
-- this file never runs against production.
--
-- Gives you a contest accepting submissions with round 1 staged but not yet
-- open. Advance it the way production does:
--
--   select open_round('00000000-0000-0000-0000-00000000d001');
--
-- which closes submissions and moves the contest to voting in one transaction.
-- Round 1 is deliberately NOT seeded as 'open': a contest cannot be accepting
-- entries and running a vote at the same time, and fixture data that models an
-- impossible state teaches you to expect one.

insert into contests (id, year, name, beneficiary_split_pct,
                      submissions_open_at, submissions_close_at, status)
values ('00000000-0000-0000-0000-0000000000c1', 2026,
        'Cutest Pet in Marathon County', 30,
        now() - interval '7 days', now() + interval '7 days', 'submissions_open');

insert into shelters (id, contest_id, name, url)
values ('00000000-0000-0000-0000-00000000a5e1',
        '00000000-0000-0000-0000-0000000000c1',
        'Example Humane Society', 'https://example.org');

-- 20 approved entries: enough to seed a 16 bracket and leave four on the bubble.
insert into entries (contest_id, pet_name, species, owner_name, owner_email,
                     town, photo_path, status, rights_accepted_at, moderated_at, created_at)
select '00000000-0000-0000-0000-0000000000c1',
       'Pet ' || g,
       (array['dog', 'cat', 'other'])[1 + (g % 3)]::species,
       'Owner ' || g,
       'owner' || g || '@example.com',
       (array['Wausau', 'Weston', 'Schofield', 'Rothschild', 'Mosinee'])[1 + (g % 5)],
       'seed/' || g || '.jpg',
       'approved',
       now(),
       now(),
       now() + (g || ' seconds')::interval
from generate_series(1, 20) g;

-- Three pending entries so the moderation queue is not empty.
insert into entries (contest_id, pet_name, species, owner_name, owner_email,
                     town, photo_path, rights_accepted_at)
select '00000000-0000-0000-0000-0000000000c1', 'Pending ' || g, 'dog',
       'Owner P' || g, 'pending' || g || '@example.com', 'Wausau',
       'seed/pending-' || g || '.jpg', now()
from generate_series(1, 3) g;

insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('00000000-0000-0000-0000-00000000d001',
        '00000000-0000-0000-0000-0000000000c1', 1, 'open', 'pending',
        now() - interval '1 day', now() + interval '6 days');
