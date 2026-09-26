-- open_submissions now stages round 1 itself.
--
-- Staff cannot insert rounds (no session holds INSERT on `rounds`, because
-- round state belongs to the round functions), so the runbook's "insert round
-- 1 by hand" step could only be done in SQL. Opening submissions is the moment
-- the contest's schedule is set anyway: round 1 is scheduled to open when
-- submissions close and to run a week, and open_round can still move its
-- closing time.

drop function open_submissions(uuid);

create function open_submissions(p_contest_id uuid, p_round1_closes_at timestamptz default null)
  returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  c        contests%rowtype;
  v_closes timestamptz;
  v_round  uuid;
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

  v_closes := coalesce(p_round1_closes_at, c.submissions_close_at + interval '7 days');
  if v_closes <= c.submissions_close_at then
    raise exception 'round 1 must close after submissions do (%)', c.submissions_close_at;
  end if;

  update contests set status = 'submissions_open' where id = c.id;

  select id into v_round from rounds where contest_id = c.id and seq = 1;
  if v_round is null then
    insert into rounds (contest_id, seq, kind, status, opens_at, closes_at)
    values (c.id, 1, 'open', 'pending', c.submissions_close_at, v_closes)
    returning id into v_round;
  end if;

  return v_round;
end $$;

revoke execute on function open_submissions(uuid, timestamptz) from public, anon, authenticated;
grant execute on function open_submissions(uuid, timestamptz) to authenticated;
