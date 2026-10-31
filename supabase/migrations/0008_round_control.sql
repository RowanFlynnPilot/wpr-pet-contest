-- Round control, hardened.
--
-- What was wrong with the 0003 versions:
--
-- * open_round never touched opens_at. The next round is created with
--   opens_at = the previous round's scheduled close. Close a round early and
--   open the next one straight away, and the round shows 'open' while checkout
--   rejects every vote until the old scheduled time arrives.
-- * Scheduled windows chained off each other. Close round 2 twelve hours late
--   and round 3 silently lost twelve of its forty-eight hours.
-- * Opening round 1 with entries still in the moderation queue froze them out
--   of the field forever, and opening it with fewer approved entries than the
--   bracket needs only failed a week later, at close_round, after all the
--   voting money was in.
-- * Contest status went from draft to submissions_open by hand, the one status
--   change the invariants did not cover.


-- Display name for a round. The front end mirrors this.
create function round_label(p_seq int, p_bracket_size int) returns text
  language sql immutable
as $$
  select case
    when p_seq = 1 then 'Open Round'
    else case (p_bracket_size / (2 ^ (p_seq - 2))::int)
      when 2  then 'Championship'
      when 4  then 'Final Four'
      when 8  then 'Elite Eight'
      when 16 then 'Sweet 16'
      else 'Round of ' || (p_bracket_size / (2 ^ (p_seq - 2))::int)
    end
  end
$$;


-- draft -> submissions_open. Refuses to launch a contest nobody can buy votes in.
create function open_submissions(p_contest_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c contests%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict c from contests where id = p_contest_id for update;

  if c.status <> 'draft' then
    raise exception 'contest is %, expected draft', c.status;
  end if;

  if c.submissions_close_at <= now() then
    raise exception 'submissions_close_at (%) is already past', c.submissions_close_at;
  end if;

  if not exists (select 1 from vote_packs where contest_id = c.id and active) then
    raise exception 'add at least one active vote pack before opening submissions';
  end if;

  update contests set status = 'submissions_open' where id = c.id;
end $$;


-- Replaces open_round(uuid). Same call still works; p_closes_at is optional.
drop function open_round(uuid);

create function open_round(p_round_id uuid, p_closes_at timestamptz default null)
  returns void
  language plpgsql security definer set search_path = public
as $$
declare
  r rounds%rowtype;
  c contests%rowtype;
  v_closes   timestamptz;
  v_pending  int;
  v_approved int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict r from rounds where id = p_round_id for update;

  if r.status <> 'pending' then
    raise exception 'round % is %, expected pending', r.seq, r.status;
  end if;

  select * into strict c from contests where id = r.contest_id for update;

  v_closes := coalesce(p_closes_at, r.closes_at);
  if v_closes < now() + interval '1 hour' then
    raise exception 'round % would close at %, under an hour from now. Pass a closing time: select open_round(''%'', ''<timestamptz>'');',
      r.seq, v_closes, r.id;
  end if;

  if r.kind = 'open' then
    if c.status <> 'submissions_open' then
      raise exception 'contest is %, expected submissions_open', c.status;
    end if;

    select count(*) filter (where status = 'pending'),
           count(*) filter (where status = 'approved')
      into v_pending, v_approved
    from entries where contest_id = c.id;

    -- Once round 1 opens the field is final. Anything still pending would be
    -- shut out without anyone having looked at it.
    if v_pending > 0 then
      raise exception '% entries are still awaiting moderation. Approve or reject them first.', v_pending;
    end if;

    if v_approved < c.bracket_size then
      raise exception 'only % approved entries; a % bracket needs at least %',
        v_approved, c.bracket_size, c.bracket_size;
    end if;

    -- Opening round 1 IS closing submissions. One action, not two.
    update contests set status = 'voting' where id = c.id;
  elsif c.status <> 'voting' then
    raise exception 'contest is %, expected voting', c.status;
  end if;

  -- The window is what checkout enforces, so it must describe reality.
  update rounds set status = 'open', opens_at = now(), closes_at = v_closes
  where id = r.id;
end $$;


-- Next round's scheduled window: starts at the later of the previous round's
-- scheduled close and now, and runs the contest's bracket_round_hours. Both
-- builders below use it, so a late close never eats into the next round.
create function next_round_window(p_round_id uuid, out opens_at timestamptz, out closes_at timestamptz)
  language sql stable set search_path = public
as $$
  select greatest(r.closes_at, now()),
         greatest(r.closes_at, now()) + make_interval(hours => c.bracket_round_hours)
  from rounds r join contests c on c.id = r.contest_id
  where r.id = p_round_id
$$;


create or replace function seed_bracket(p_round_id uuid, p_field_size int) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_contest_id uuid;
  v_seq        int;
  v_qualified  int;
  v_order      int[];
  v_next_id    uuid;
  w            record;
  i            int;
begin
  select contest_id, seq into strict v_contest_id, v_seq from rounds where id = p_round_id;

  with ranked as (
    select e.id,
           row_number() over (
             order by coalesce(t.votes, 0) desc, e.created_at asc
           ) as rank
    from entries e
    left join entry_round_totals t
      on t.entry_id = e.id and t.round_id = p_round_id
    where e.contest_id = v_contest_id and e.status = 'approved'
  )
  update entries e
  set seed = ranked.rank
  from ranked
  where e.id = ranked.id and ranked.rank <= p_field_size;

  get diagnostics v_qualified = row_count;
  if v_qualified <> p_field_size then
    raise exception 'need % approved entries to seed the bracket, have %',
      p_field_size, v_qualified;
  end if;

  select * into w from next_round_window(p_round_id);

  insert into rounds (contest_id, seq, kind, status, opens_at, closes_at)
  values (v_contest_id, v_seq + 1, 'bracket', 'pending', w.opens_at, w.closes_at)
  returning id into v_next_id;

  v_order := bracket_seed_order(p_field_size);

  for i in 1 .. p_field_size / 2 loop
    insert into matchups (round_id, slot, entry_a_id, entry_b_id) values (
      v_next_id,
      i - 1,
      (select id from entries where contest_id = v_contest_id and seed = v_order[i * 2 - 1]),
      (select id from entries where contest_id = v_contest_id and seed = v_order[i * 2])
    );
  end loop;

  return v_next_id;
end $$;


create or replace function advance_bracket(p_round_id uuid) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_contest_id uuid;
  v_seq        int;
  v_remaining  int;
  v_next_id    uuid;
  w            record;
  i            int;
begin
  select contest_id, seq into strict v_contest_id, v_seq
  from rounds where id = p_round_id;

  update matchups m
  set winner_entry_id = (
    select e.id
    from entries e
    left join entry_round_totals t
      on t.entry_id = e.id and t.round_id = p_round_id
    where e.id in (m.entry_a_id, m.entry_b_id)
    order by coalesce(t.votes, 0) desc, e.seed asc
    limit 1
  )
  where m.round_id = p_round_id;

  select count(*) into v_remaining from matchups where round_id = p_round_id;

  if v_remaining = 1 then
    update contests set status = 'complete' where id = v_contest_id;
    return null;
  end if;

  select * into w from next_round_window(p_round_id);

  insert into rounds (contest_id, seq, kind, status, opens_at, closes_at)
  values (v_contest_id, v_seq + 1, 'bracket', 'pending', w.opens_at, w.closes_at)
  returning id into v_next_id;

  for i in 0 .. (v_remaining / 2) - 1 loop
    insert into matchups (round_id, slot, entry_a_id, entry_b_id) values (
      v_next_id,
      i,
      (select winner_entry_id from matchups where round_id = p_round_id and slot = i * 2),
      (select winner_entry_id from matchups where round_id = p_round_id and slot = i * 2 + 1)
    );
  end loop;

  return v_next_id;
end $$;


-- Replaces close_round(uuid, int default 16). The field size now defaults to
-- the contest's own bracket_size, so a contest configured for 8 cannot be
-- seeded as 16 by an admin who left the second argument off.
drop function close_round(uuid, int);

create function close_round(p_round_id uuid, p_field_size int default null) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  r         rounds%rowtype;
  v_size    int;
  v_next_id uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  -- Held until commit. confirm_vote takes FOR SHARE on this row, so no payment
  -- can land between the tally below and the status change.
  select * into strict r from rounds where id = p_round_id for update;

  if r.status <> 'open' then
    raise exception 'round % is %, expected open', r.seq, r.status;
  end if;

  update rounds set status = 'closed' where id = r.id;

  if r.kind = 'open' then
    select bracket_size into v_size from contests where id = r.contest_id;
    v_next_id := seed_bracket(r.id, coalesce(p_field_size, v_size));
  else
    v_next_id := advance_bracket(r.id);
  end if;

  -- clock_timestamp: the moment the result was fixed, after the tally.
  update rounds set status = 'resolved', resolved_at = clock_timestamp() where id = r.id;

  return v_next_id;
end $$;


revoke execute on function open_submissions(uuid)            from public, anon, authenticated;
revoke execute on function open_round(uuid, timestamptz)     from public, anon, authenticated;
revoke execute on function close_round(uuid, int)            from public, anon, authenticated;
revoke execute on function next_round_window(uuid)           from public, anon, authenticated;
revoke execute on function seed_bracket(uuid, int)           from public, anon, authenticated;
revoke execute on function advance_bracket(uuid)             from public, anon, authenticated;

grant execute on function open_submissions(uuid)        to authenticated;
grant execute on function open_round(uuid, timestamptz) to authenticated;
grant execute on function close_round(uuid, int)        to authenticated;

-- Pure and harmless; handy for anyone rendering round names from SQL.
grant execute on function round_label(int, int) to anon, authenticated, service_role;
