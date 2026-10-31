-- Sprints: a sponsor's prize for the pet that takes the most votes in a set
-- window, say 6 to 9 p.m. on a Tuesday. "Example Pet Supply gives a $50 gift
-- card to the owner of the pet with the most votes tonight."
--
-- A sprint is the sponsor's prize, never votes. Sprint votes are ordinary
-- votes: they count toward the round exactly as they would anyway, and the
-- sprint changes no count, no price and no money. What it adds is a reason
-- to vote at a particular time, which is what a newsroom can sell.
--
-- The rules that keep it fair:
--   * Sprints are a contest setting, on only while the contest is a draft
--     (set_sprints_enabled): a prize is in the published rules, and counsel
--     reviews it before launch (docs/SPRINTS.md).
--   * Announced a day ahead: add_sprint refuses a sprint that starts less
--     than 24 hours away, so nobody can time one around a pet they favor.
--   * Inside one round's voting window, 30 minutes to 24 hours long, and no
--     two sprints in a contest overlap.
--   * What counts: a pack whose checkout began in the window and whose payment
--     was credited within 10 minutes of its end (the same settling time
--     close_round allows), and a free vote cast in the window. A refund
--     before the sprint is settled drops a pack out; after, nothing moves.
--   * Ties go as the round's do: in the Open Round the earliest entry, in a
--     bracket round the better seed.
--   * settle_sprint, run by a person 10 minutes after the end, snapshots the
--     standings into sprint_results and names the winner. A settled sprint
--     never changes, like a resolved round.
--   * A sprint can be cancelled, with a reason, only before it starts.

alter table contests add column sprints_enabled boolean not null default false;

create table sprints (
  id               uuid primary key default gen_random_uuid(),
  contest_id       uuid not null references contests(id) on delete cascade,
  round_id         uuid not null references rounds(id) on delete cascade,
  label            text not null default 'Sprint' check (char_length(label) between 1 and 60),
  prize            text not null check (char_length(prize) between 3 and 140),
  sponsor_name     text not null check (char_length(sponsor_name) between 1 and 80),
  sponsor_url      text check (sponsor_url ~ '^https://'),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  cancelled_at     timestamptz,
  cancel_reason    text,
  settled_at       timestamptz,
  settled_by       uuid,
  winner_entry_id  uuid references entries(id),
  winner_votes     int,
  check (ends_at - starts_at between interval '30 minutes' and interval '24 hours'),
  check (cancelled_at is null or settled_at is null),
  check ((cancelled_at is null) = (cancel_reason is null)),
  constraint sprints_no_overlap
    exclude using gist (contest_id with =, tstzrange(starts_at, ends_at) with &&) where (cancelled_at is null)
);
create index sprints_round_idx on sprints (round_id);
alter table sprints enable row level security;
create policy sprints_public_read on sprints for select to anon, authenticated using (true);

-- The snapshot settle_sprint takes: every pet with a sprint vote, in order.
create table sprint_results (
  sprint_id  uuid not null references sprints(id) on delete cascade,
  entry_id   uuid not null references entries(id),
  votes      int not null check (votes > 0),
  place      int not null check (place > 0),
  primary key (sprint_id, entry_id),
  unique (sprint_id, place)
);
alter table sprint_results enable row level security;
create policy sprint_results_admin_read on sprint_results for select to authenticated using ((select is_admin()));

-- Counts per pet, live until the sprint is settled and the snapshot after.
-- Nothing about a voter or a buyer.
create view sprint_standings as
  with live as (
    select s.id as sprint_id, x.entry_id, sum(x.n)::int as votes
    from sprints s
    cross join lateral (
      select v.entry_id, v.quantity as n
      from votes v
      where v.round_id = s.round_id and v.status = 'succeeded'
        and v.created_at >= s.starts_at and v.created_at < s.ends_at
        and v.confirmed_at <= s.ends_at + interval '10 minutes'
      union all
      select f.entry_id, 1
      from free_votes f
      where f.round_id = s.round_id and f.status = 'counted'
        and f.cast_at >= s.starts_at and f.cast_at < s.ends_at
    ) x
    where s.settled_at is null and s.cancelled_at is null and s.starts_at <= now()
    group by s.id, x.entry_id
  )
  select l.sprint_id, l.entry_id, l.votes,
         row_number() over (partition by l.sprint_id
                            order by l.votes desc,
                                     case when r.kind = 'bracket' then e.seed end asc nulls last,
                                     e.created_at, e.id)::int as place
  from live l
  join sprints s on s.id = l.sprint_id
  join rounds r on r.id = s.round_id
  join entries e on e.id = l.entry_id and e.status = 'approved'
  union all
  select sr.sprint_id, sr.entry_id, sr.votes, sr.place
  from sprint_results sr;


-- --------------------------------------------------------- staff actions --
-- On or off, while the contest is a draft: a prize is in the published rules.
create function set_sprints_enabled(p_contest_id uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c contests%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  select * into strict c from contests where id = p_contest_id for update;
  if c.status <> 'draft' then
    raise exception 'Sprints are in the published rules, so they can only be switched on or off while the contest is a draft.'
      using errcode = 'WP400';
  end if;
  update contests set sprints_enabled = coalesce(p_enabled, false) where id = c.id;
end $$;

create function add_sprint(
  p_round_id      uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_prize         text,
  p_sponsor_name  text,
  p_sponsor_url   text default null,
  p_label         text default 'Sprint'
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r     rounds%rowtype;
  c     contests%rowtype;
  v_id  uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  select * into strict r from rounds where id = p_round_id;
  select * into strict c from contests where id = r.contest_id for update;
  if not c.sprints_enabled then
    raise exception 'Sprints are off for this contest. They can be switched on in Setup while the contest is a draft.'
      using errcode = 'WP400';
  end if;
  if r.status not in ('pending', 'open') then
    raise exception 'That round is over.' using errcode = 'WP400';
  end if;
  if p_starts_at < now() + interval '24 hours' then
    raise exception 'A sprint must be announced at least a day ahead, so it has to start 24 hours from now or later.'
      using errcode = 'WP400';
  end if;
  if p_starts_at < r.opens_at or p_ends_at > r.closes_at then
    raise exception 'A sprint has to fit inside the round''s voting window.' using errcode = 'WP400';
  end if;
  if p_ends_at - p_starts_at not between interval '30 minutes' and interval '24 hours' then
    raise exception 'A sprint runs from 30 minutes to 24 hours.' using errcode = 'WP400';
  end if;
  if char_length(coalesce(trim(p_prize), '')) not between 3 and 140 then
    raise exception 'Name the prize in a few words (up to 140 characters), like "a $50 gift card".' using errcode = 'WP400';
  end if;
  if char_length(coalesce(trim(p_sponsor_name), '')) not between 1 and 80 then
    raise exception 'Name the sponsor giving the prize.' using errcode = 'WP400';
  end if;
  if nullif(trim(p_sponsor_url), '') is not null and trim(p_sponsor_url) !~ '^https://' then
    raise exception 'The sponsor link has to start with https://.' using errcode = 'WP400';
  end if;

  insert into sprints (contest_id, round_id, label, prize, sponsor_name, sponsor_url, starts_at, ends_at, created_by)
  values (c.id, r.id, coalesce(nullif(trim(p_label), ''), 'Sprint'), trim(p_prize), trim(p_sponsor_name),
          nullif(trim(p_sponsor_url), ''), p_starts_at, p_ends_at, auth.uid())
  returning id into v_id;
  return v_id;
exception
  when exclusion_violation then
    raise exception 'That sprint overlaps another one. Sprints cannot overlap.' using errcode = 'WP400';
end $$;

-- Before it starts only, with a reason. A sprint that has begun runs out.
create function cancel_sprint(p_sprint_id uuid, p_reason text) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s        sprints%rowtype;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if v_reason is null then
    raise exception 'A reason is required. It is kept with the sprint.' using errcode = 'WP400';
  end if;
  select * into strict s from sprints where id = p_sprint_id for update;
  if s.cancelled_at is not null then
    return;
  end if;
  if now() >= s.starts_at then
    raise exception 'That sprint has started, so it runs to the end.' using errcode = 'WP400';
  end if;
  update sprints set cancelled_at = now(), cancel_reason = v_reason where id = s.id;
end $$;

-- Ten minutes after the end, by a person: the snapshot and the winner.
-- Returns the winning entry (null when nobody voted).
create function settle_sprint(p_sprint_id uuid) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s        sprints%rowtype;
  v_winner uuid;
  v_votes  int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  select * into strict s from sprints where id = p_sprint_id for update;
  if s.cancelled_at is not null then
    raise exception 'That sprint was cancelled.' using errcode = 'WP400';
  end if;
  if s.settled_at is not null then
    return s.winner_entry_id;
  end if;
  if now() < s.ends_at + interval '10 minutes' then
    raise exception 'Payments need 10 minutes to settle. Try again after %.',
      to_char((s.ends_at + interval '10 minutes') at time zone 'America/Chicago', 'FMHH12:MI a.m.')
      using errcode = 'WP400';
  end if;

  insert into sprint_results (sprint_id, entry_id, votes, place)
  select ss.sprint_id, ss.entry_id, ss.votes, ss.place
  from sprint_standings ss
  where ss.sprint_id = s.id;

  select entry_id, votes into v_winner, v_votes from sprint_results where sprint_id = s.id and place = 1;
  update sprints
     set settled_at = now(), settled_by = auth.uid(), winner_entry_id = v_winner, winner_votes = v_votes
   where id = s.id;
  return v_winner;
end $$;


-- ------------------------------------------------------------------ access --
grant select on sprints to anon, authenticated, service_role;
grant select on sprint_results to authenticated, service_role;
grant select on sprint_standings to anon, authenticated, service_role;
revoke execute on function set_sprints_enabled(uuid, boolean),
  add_sprint(uuid, timestamptz, timestamptz, text, text, text, text),
  cancel_sprint(uuid, text), settle_sprint(uuid)
  from public, anon, authenticated;
grant execute on function set_sprints_enabled(uuid, boolean),
  add_sprint(uuid, timestamptz, timestamptz, text, text, text, text),
  cancel_sprint(uuid, text), settle_sprint(uuid)
  to authenticated;
