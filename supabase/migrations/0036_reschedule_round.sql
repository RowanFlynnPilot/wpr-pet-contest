-- Moving a round's scheduled start before it opens.
--
-- open_submissions stages round 1 to open the moment entries close, and the
-- public schedule quotes that time: the rules page, the countdowns, the
-- "voting opens" lines and the nurture_ready email. In 2026 the Open Round
-- opens the morning after entries close, by hand, so the schedule has to be
-- able to say so.
--
-- This moves only the scheduled opens_at of a round that has not opened. It
-- changes no status: a round still opens only through open_round, which
-- stamps the real opens_at when it runs. Admin only, like the other round
-- controls.

create function reschedule_round(p_round_id uuid, p_opens_at timestamptz)
  returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r rounds%rowtype;
  c contests%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  -- Same lock order as open_round: the round, then its contest.
  select * into strict r from rounds where id = p_round_id for update;
  select * into strict c from contests where id = r.contest_id for share;

  if r.status <> 'pending' then
    raise exception 'round % is %; only a round that has not opened can be rescheduled', r.seq, r.status;
  end if;

  if p_opens_at is null or p_opens_at <= now() then
    raise exception 'the new start must be in the future';
  end if;

  if p_opens_at > r.closes_at - interval '24 hours' then
    raise exception 'the round closes %; it must start at least a day before that', r.closes_at;
  end if;

  if r.seq = 1 and p_opens_at < c.submissions_close_at then
    raise exception 'voting cannot open before entries close (%)', c.submissions_close_at;
  end if;

  update rounds set opens_at = p_opens_at where id = r.id;
end $$;

revoke execute on function reschedule_round(uuid, timestamptz) from public, anon, authenticated;
grant execute on function reschedule_round(uuid, timestamptz) to authenticated;
