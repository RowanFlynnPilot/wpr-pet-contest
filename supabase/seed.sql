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
--
-- open_round refuses while anything is still in the moderation queue, so work
-- the three pending entries first (admin panel, or moderate_entry as an admin).

insert into contests (id, year, name, beneficiary_split_pct,
                      submissions_open_at, submissions_close_at, status)
values ('00000000-0000-0000-0000-0000000000c1', 2026,
        'Cutest Pet in Marathon County', 50,
        now() - interval '7 days', now() + interval '7 days', 'submissions_open');

-- The partner's page and its logo (web/public/moments-foster-care.jpg, served
-- by the Pages site). Logo use is in the MOU.
insert into shelters (id, contest_id, name, url, logo_path)
values ('00000000-0000-0000-0000-00000000a5e1',
        '00000000-0000-0000-0000-0000000000c1',
        'Moments Foster Care', 'https://www.facebook.com/p/Moments-Foster-Care-Inc-100064839574671/',
        'https://rowanflynnpilot.github.io/wpr-pet-contest/moments-foster-care.jpg');

-- The recommended ladder. Per-vote price falls from $1.00 to about 42 cents,
-- which is what makes the big packs worth it to the buyers who decide close
-- matchups. `featured` renders as "Most popular".
insert into vote_packs (contest_id, slug, label, votes, cents, sort, featured)
values ('00000000-0000-0000-0000-0000000000c1', 'starter',  'Starter',     5,   500, 1, false),
       ('00000000-0000-0000-0000-0000000000c1', 'fan',      'Fan',        25,  2000, 2, true),
       ('00000000-0000-0000-0000-0000000000c1', 'superfan', 'Superfan',   75,  5000, 3, false),
       ('00000000-0000-0000-0000-0000000000c1', 'champion', 'Champion',  200, 10000, 4, false),
       ('00000000-0000-0000-0000-0000000000c1', 'legend',   'Legend',    600, 25000, 5, false);

-- A sponsored Double Vote window tomorrow, 7 to 9pm Wausau time, so the front
-- end has an upcoming banner to render.
insert into bonus_windows (contest_id, starts_at, ends_at, multiplier, label, sponsor_name, sponsor_url)
values ('00000000-0000-0000-0000-0000000000c1',
        (date_trunc('day', now() at time zone 'America/Chicago') + interval '1 day 19 hours') at time zone 'America/Chicago',
        (date_trunc('day', now() at time zone 'America/Chicago') + interval '1 day 21 hours') at time zone 'America/Chicago',
        2, 'Double Vote Night', 'Example Pet Supply', 'https://example.org');

-- 20 approved entries: enough to seed a 16 bracket and leave four on the bubble.
insert into entries (contest_id, pet_name, species, owner_name, owner_email,
                     town, photo_path, status, rights_accepted_at, moderated_at,
                     created_at, caption, newsletter_opt_in)
select '00000000-0000-0000-0000-0000000000c1',
       (array['Biscuit', 'Luna', 'Moose', 'Pickles', 'Juniper', 'Otis', 'Waffles',
              'Maple', 'Tater Tot', 'Clementine', 'Rocco', 'Pepper', 'Gus',
              'Noodle', 'Hazel', 'Brisket', 'Olive', 'Ziggy', 'Butterbean', 'Mabel'])[g],
       (array['dog', 'cat', 'other'])[1 + (g % 3)]::species,
       'Owner ' || g,
       'owner' || g || '@example.com',
       (array['Wausau', 'Weston', 'Schofield', 'Rothschild', 'Mosinee'])[1 + (g % 5)],
       'seed/' || g || '.jpg',
       'approved',
       now(),
       now(),
       now() + (g || ' seconds')::interval,
       case when g % 2 = 0 then 'Sleeps 20 hours a day and guards the couch for the other four.' end,
       g % 4 = 0
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
