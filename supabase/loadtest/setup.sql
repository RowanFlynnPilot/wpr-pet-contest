-- The live tally under load (0025): one contest in voting, an open Open
-- Round, 400 approved pets and a vote pack, for pgbench to hammer. Fixed ids,
-- so the pgbench scripts can name them. Writes votes: run it on a scratch
-- database only (the CI's local stack, or a throwaway staging copy), never
-- on production.

begin;

insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours, free_vote_enabled)
values ('10ad0000-0000-0000-0000-0000000000c1', 2199, 'Load test', 50,
        now() - interval '10 days', now() - interval '3 days', 'voting', 16, 48, true);

insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('10ad0000-0000-0000-0000-0000000000a1', '10ad0000-0000-0000-0000-0000000000c1',
        1, 'open', 'open', now() - interval '1 day', now() + interval '1 day');

insert into vote_packs (contest_id, slug, label, votes, cents)
values ('10ad0000-0000-0000-0000-0000000000c1', 'fan', 'Fan', 25, 2000);

-- The pets, numbered 1 to 400 for the scripts' random picks.
create table load_entries (n int primary key, id uuid not null);
with made as (
  insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                       photo_path, status, rights_accepted_at, moderated_at, created_at)
  select gen_random_uuid(), '10ad0000-0000-0000-0000-0000000000c1', 'Pet ' || n,
         ((array['dog', 'cat', 'other'])[1 + n % 3])::species, 'O', 'owner' || n || '@example.com', 'Wausau',
         'load/' || n || '.jpg', 'approved', now(), now(), now() - n * interval '1 minute'
  from generate_series(1, 400) n
  returning id, pet_name
)
insert into load_entries select substring(pet_name from 5)::int, id from made;

-- Unique payment intents and voter addresses across every client.
create sequence load_seq;

commit;
