-- Moderator alerts (Nov. 10, 2026): one email to the moderators when new
-- entries reach the queue, at most once per sweep (every 15 minutes), never
-- one per pet and never for an empty queue.
--
-- moderation_alerts records each alert: counts and times only, no person.
-- moderation_alert_claim() decides, under a lock, whether one is owed: pending
-- entries submitted since the last alert for this contest. It records the
-- alert before the email goes, so two overlapping sweeps send once; the sweep
-- deletes the row again if the send fails, so the next sweep retries.

create table moderation_alerts (
  id          bigint generated always as identity primary key,
  contest_id  uuid not null references contests(id) on delete cascade,
  new_count   int not null check (new_count > 0),
  pending     int not null check (pending >= new_count),
  sent_at     timestamptz not null default now()
);
create index moderation_alerts_contest on moderation_alerts (contest_id, sent_at desc);

alter table moderation_alerts enable row level security;
create policy moderation_alerts_admin_read on moderation_alerts for select to authenticated using ((select is_admin()));

grant select on moderation_alerts to authenticated;
grant select, insert, delete on moderation_alerts to service_role;


create function moderation_alert_claim()
returns table (alert_id bigint, contest_id uuid, contest_name text, new_count int, pending int, oldest_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  c        contests;
  last_at  timestamptz;
  n_new    int;
  n_all    int;
  oldest   timestamptz;
  new_id   bigint;
begin
  -- Entries arrive only while submissions are open.
  select * into c from contests k where k.status = 'submissions_open' order by k.year desc limit 1;
  if not found then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('moderation_alert'), hashtext(c.id::text));

  select max(a.sent_at) into last_at from moderation_alerts a where a.contest_id = c.id;

  select count(*) filter (where e.created_at > coalesce(last_at, '-infinity'::timestamptz)),
         count(*),
         min(e.created_at)
    into n_new, n_all, oldest
  from entries e
  where e.contest_id = c.id and e.status = 'pending';

  if n_new = 0 then
    return;
  end if;

  insert into moderation_alerts (contest_id, new_count, pending)
  values (c.id, n_new, n_all)
  returning id into new_id;

  return query select new_id, c.id, c.name, n_new, n_all, oldest;
end;
$$;

revoke all on function moderation_alert_claim() from public, anon, authenticated;
grant execute on function moderation_alert_claim() to service_role;
