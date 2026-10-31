-- Health checks for a live contest, and a memory of which problems staff have
-- already been told about.
--
-- The admin Health tab shows the same facts, but only to someone who opens it.
-- During a contest the failure that matters happens at 9pm: the webhook breaks,
-- payments keep succeeding, nobody gets their votes, and the first anyone at
-- WPR hears of it is a Facebook post. The `health` edge function runs these
-- checks on a schedule (plus a cross-check against Stripe that only it can do)
-- and tells staff.


-- What is wrong right now, from the database's side. One row per problem.
create function contest_health()
  returns table (check_name text, severity text, items int, detail text)
  language sql stable security definer set search_path = public
as $$
  -- Money taken for votes that do not count, and the automatic refund has not
  -- landed. Fifteen minutes is far longer than a refund normally takes.
  select 'late_refund_stuck', 'alert', count(*)::int,
         count(*) || ' late payment(s) still unrefunded after 15 minutes. Refund them in Stripe; the Health tab lists them.'
  from late_confirmations
  where confirmed_at < now() - interval '15 minutes'
  having count(*) > 0

  union all
  select 'rejected_photo_public', 'alert', count(*)::int,
         count(*) || ' rejected photo file(s) are still public. Delete them from the Health tab.'
  from rejected_photos_live
  having count(*) > 0

  union all
  -- Entrants waiting on a human. Each one is a family not yet sharing.
  select 'moderation_backlog', 'warn', count(*)::int,
         count(*) || ' entr' || case when count(*) = 1 then 'y has' else 'ies have' end
           || ' waited more than a day for moderation.'
  from entries e
  join contests c on c.id = e.contest_id
  where e.status = 'pending' and c.status = 'submissions_open'
    and e.created_at < now() - interval '24 hours'
  having count(*) > 0

  union all
  -- Past its deadline (and the settle period) but nobody has finalized it.
  select 'round_not_finalized', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' ended '
           || to_char(r.closes_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' and has not been finalized. Close it in the admin desk.'
  from rounds r
  join contests c on c.id = r.contest_id
  where r.status = 'open' and r.closes_at < now() - interval '1 hour'

  union all
  -- Submissions ended but round 1 never opened.
  select 'round_not_opened', 'warn', 1,
         'Submissions closed '
           || to_char(c.submissions_close_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' but the Open Round has not started. Finish moderation, then open it.'
  from rounds r
  join contests c on c.id = r.contest_id
  where r.seq = 1 and r.status = 'pending' and c.status = 'submissions_open'
    and c.submissions_close_at < now() - interval '1 hour'

  union all
  -- A bracket round sitting pending well after the previous one resolved.
  select 'round_not_opened', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' was due to start '
           || to_char(r.opens_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' and has not been opened.'
  from rounds r
  join contests c on c.id = r.contest_id
  join rounds prev on prev.contest_id = r.contest_id and prev.seq = r.seq - 1 and prev.status = 'resolved'
  where r.status = 'pending' and r.opens_at < now() - interval '1 hour'
$$;


-- Open problems, one per check. A problem is reported when it first appears,
-- again every two hours while it lasts, and once more when it clears. Without
-- this a ten-minute schedule would send six identical emails an hour.
create table health_incidents (
  check_name       text primary key,
  severity         text not null check (severity in ('alert', 'warn')),
  detail           text not null,
  opened_at        timestamptz not null default now(),
  last_notified_at timestamptz
);

alter table health_incidents enable row level security;
create policy health_incidents_admin_read on health_incidents
  for select to authenticated using (is_admin());
grant select on health_incidents to authenticated;


-- Record the current problems ([{check_name, severity, detail}]) and return
-- what to tell staff now: 'opened', 'reminder' or 'resolved'. Marks what it
-- returns as told.
create function record_health(p_problems jsonb)
  returns table (check_name text, severity text, detail text, change text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_names text[];
begin
  select coalesce(array_agg(p.check_name), '{}')
    into v_names
  from jsonb_to_recordset(coalesce(p_problems, '[]')) as p(check_name text, severity text, detail text);

  insert into health_incidents as h (check_name, severity, detail)
  select p.check_name, p.severity, p.detail
  from jsonb_to_recordset(coalesce(p_problems, '[]')) as p(check_name text, severity text, detail text)
  on conflict (check_name) do update
    set severity = excluded.severity, detail = excluded.detail;

  -- Cleared problems staff were told about get a "resolved"; ones nobody was
  -- told about simply disappear.
  return query
  delete from health_incidents h
  where not (h.check_name = any (v_names))
  returning h.check_name, h.severity, h.detail,
            case when h.last_notified_at is null then 'silent' else 'resolved' end;

  return query
  with due as (
    select h.check_name, h.last_notified_at is null as first_time
    from health_incidents h
    where h.check_name = any (v_names)
      and (h.last_notified_at is null or h.last_notified_at < now() - interval '2 hours')
    for update
  )
  update health_incidents h
  set last_notified_at = now()
  from due
  where h.check_name = due.check_name
  returning h.check_name, h.severity, h.detail,
            case when due.first_time then 'opened' else 'reminder' end;
end $$;


revoke execute on function contest_health() from public, anon, authenticated;
revoke execute on function record_health(jsonb) from public, anon, authenticated;
grant execute on function contest_health() to service_role;
grant execute on function record_health(jsonb) to service_role;
