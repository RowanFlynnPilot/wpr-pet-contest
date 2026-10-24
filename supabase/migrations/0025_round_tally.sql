-- A cached tally for rounds still in play.
--
-- Every reader on a pet or gallery page polls entry_round_totals every 20
-- seconds. Summing every vote of the open round on each poll cost about 40 ms
-- at contest scale (measured on synthetic data); a 400-row tally table answers
-- in under a millisecond. The cache is kept by statement triggers on votes
-- and free_votes, so every write path, present or future, maintains it.
--
-- Nothing irreversible depends on the cache: close_round rebuilds the round's
-- tally from the base tables under its lock before it seeds or advances, and
-- a health check compares the cache with the base tables while a round is
-- live. Resolved rounds are still served from round_results, which never
-- moves.

create table round_tally (
  round_id     uuid   not null references rounds(id) on delete cascade,
  entry_id     uuid   not null references entries(id) on delete cascade,
  votes        int    not null default 0,
  amount_cents bigint not null default 0,
  free_votes   int    not null default 0,
  primary key (round_id, entry_id)
);
alter table round_tally enable row level security;
revoke all on round_tally from anon, authenticated, service_role;
grant select on round_tally to service_role;

-- Deltas applied in one lock order (round, then entry), so two statements
-- touching the same pets cannot deadlock.
create function tally_apply(p_deltas jsonb) returns void
  language sql security definer set search_path = public, pg_temp
as $$
  insert into round_tally as t (round_id, entry_id, votes, amount_cents, free_votes)
  select (d->>'round_id')::uuid, (d->>'entry_id')::uuid,
         sum((d->>'votes')::int), sum((d->>'amount_cents')::bigint), sum((d->>'free_votes')::int)
  from jsonb_array_elements(p_deltas) d
  group by 1, 2
  having sum((d->>'votes')::int) <> 0 or sum((d->>'amount_cents')::bigint) <> 0 or sum((d->>'free_votes')::int) <> 0
  order by 1, 2
  on conflict (round_id, entry_id) do update
    set votes = t.votes + excluded.votes,
        amount_cents = t.amount_cents + excluded.amount_cents,
        free_votes = t.free_votes + excluded.free_votes
$$;

create function tally_votes_ins() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform tally_apply(coalesce((
    select jsonb_agg(jsonb_build_object('round_id', round_id, 'entry_id', entry_id,
                                        'votes', quantity, 'amount_cents', amount_cents, 'free_votes', 0))
    from new_rows where status = 'succeeded'), '[]'));
  return null;
end $$;

create function tally_votes_upd() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform tally_apply(coalesce((
    select jsonb_agg(jsonb_build_object(
      'round_id', n.round_id, 'entry_id', n.entry_id,
      'votes', (case when n.status = 'succeeded' then n.quantity else 0 end)
             - (case when o.status = 'succeeded' then o.quantity else 0 end),
      'amount_cents', (case when n.status = 'succeeded' then n.amount_cents else 0 end)
                    - (case when o.status = 'succeeded' then o.amount_cents else 0 end),
      'free_votes', 0))
    from new_rows n join old_rows o on o.id = n.id
    where n.status is distinct from o.status or n.quantity <> o.quantity or n.amount_cents <> o.amount_cents), '[]'));
  return null;
end $$;

create function tally_free_ins() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform tally_apply(coalesce((
    select jsonb_agg(jsonb_build_object('round_id', round_id, 'entry_id', entry_id, 'votes', 1, 'amount_cents', 0, 'free_votes', 1))
    from new_rows where status = 'counted'), '[]'));
  return null;
end $$;

create function tally_free_upd() returns trigger
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform tally_apply(coalesce((
    select jsonb_agg(jsonb_build_object(
      'round_id', n.round_id, 'entry_id', n.entry_id,
      'votes', (n.status = 'counted')::int - (o.status = 'counted')::int, 'amount_cents', 0,
      'free_votes', (n.status = 'counted')::int - (o.status = 'counted')::int))
    from new_rows n join old_rows o on o.id = n.id
    where n.status is distinct from o.status), '[]'));
  return null;
end $$;

-- The live sums from the base tables: what the cache must equal.
create view round_live_sums as
  select round_id, entry_id, sum(votes)::int as votes, sum(amount_cents)::bigint as amount_cents, sum(free_votes)::int as free_votes
  from (select v.round_id, v.entry_id, v.quantity as votes, v.amount_cents::bigint as amount_cents, 0 as free_votes
        from votes v where v.status = 'succeeded'
        union all
        select f.round_id, f.entry_id, 1, 0::bigint, 1
        from free_votes f where f.status = 'counted') s
  group by round_id, entry_id;
revoke all on round_live_sums from anon, authenticated;
grant select on round_live_sums to service_role;

-- Triggers and the backfill in one step, with writers held off, so no vote
-- lands between the two.
lock table votes, free_votes in share mode;
create trigger votes_tally_ins after insert on votes
  referencing new table as new_rows for each statement execute function tally_votes_ins();
create trigger votes_tally_upd after update on votes
  referencing old table as old_rows new table as new_rows for each statement execute function tally_votes_upd();
create trigger free_votes_tally_ins after insert on free_votes
  referencing new table as new_rows for each statement execute function tally_free_ins();
create trigger free_votes_tally_upd after update on free_votes
  referencing old table as old_rows new table as new_rows for each statement execute function tally_free_upd();
insert into round_tally (round_id, entry_id, votes, amount_cents, free_votes)
select round_id, entry_id, votes, amount_cents, free_votes from round_live_sums;

-- Resolved rounds from the snapshot; live rounds from the cache. Still
-- security definer, for the reason in 0001.
create or replace view entry_round_totals as
  select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
  from round_results t
  union all
  select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
  from round_tally t
  join rounds r on r.id = t.round_id
  where r.status <> 'resolved' and (t.votes > 0 or t.free_votes > 0);

-- Rebuild one round's cache from the base tables. close_round does this
-- itself; staff can do it by hand if the health check reports drift.
create function rebuild_round_tally(p_round_id uuid) returns int
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_rows int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  perform 1 from rounds where id = p_round_id for update;
  delete from round_tally where round_id = p_round_id;
  insert into round_tally (round_id, entry_id, votes, amount_cents, free_votes)
  select round_id, entry_id, votes, amount_cents, free_votes from round_live_sums where round_id = p_round_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

-- close_round makes the tally exact under its lock, then proceeds as before.
create or replace function close_round(p_round_id uuid) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r         rounds%rowtype;
  v_size    int;
  v_next_id uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict r from rounds where id = p_round_id for update;

  if r.status <> 'open' then
    raise exception 'round % is %, expected open', r.seq, r.status;
  end if;

  if now() < r.closes_at + settle_period() then
    raise exception 'round % closes at %. Results can be finalized from % so payments made before the deadline can settle.',
      r.seq, r.closes_at, r.closes_at + settle_period()
      using errcode = 'WP400';
  end if;

  update rounds set status = 'closed' where id = r.id;

  -- Nothing irreversible reads the cache: the round's tally is rebuilt from
  -- the vote tables here, under the lock that keeps any payment out.
  delete from round_tally where round_id = r.id;
  insert into round_tally (round_id, entry_id, votes, amount_cents, free_votes)
  select round_id, entry_id, votes, amount_cents, free_votes from round_live_sums where round_id = r.id;

  if r.kind = 'open' then
    select bracket_size into v_size from contests where id = r.contest_id;
    v_next_id := seed_bracket(r.id, v_size);
  else
    v_next_id := advance_bracket(r.id);
  end if;

  insert into round_results (round_id, entry_id, votes, amount_cents, free_votes)
  select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
  from entry_round_totals t
  where t.round_id = r.id;

  update rounds set status = 'resolved', resolved_at = clock_timestamp() where id = r.id;

  return v_next_id;
end $$;

-- The drift check joins the health checks. As 0019, plus one row.
create or replace function contest_health()
  returns table (check_name text, severity text, items int, detail text)
  language sql stable security definer set search_path = public, pg_temp
as $$
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
  select 'moderation_backlog', 'warn', count(*)::int,
         count(*) || ' entr' || case when count(*) = 1 then 'y has' else 'ies have' end
           || ' waited more than a day for moderation.'
  from entries e
  join contests c on c.id = e.contest_id
  where e.status = 'pending' and c.status = 'submissions_open'
    and e.created_at < now() - interval '24 hours'
  having count(*) > 0

  union all
  select 'round_not_finalized', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' ended '
           || to_char(r.closes_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' and has not been finalized. Close it in the admin desk.'
  from rounds r
  join contests c on c.id = r.contest_id
  where r.status = 'open' and r.closes_at < now() - interval '1 hour'

  union all
  select 'round_not_opened', 'warn', 1,
         'Submissions closed '
           || to_char(c.submissions_close_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' but the Open Round has not started. Finish moderation, then open it.'
  from rounds r
  join contests c on c.id = r.contest_id
  where r.seq = 1 and r.status = 'pending' and c.status = 'submissions_open'
    and c.submissions_close_at < now() - interval '1 hour'

  union all
  select 'round_not_opened', 'warn', 1,
         round_label(r.seq, c.bracket_size) || ' was due to start '
           || to_char(r.opens_at at time zone 'America/Chicago', 'Mon FMDD at FMHH12:MI AM')
           || ' and has not been opened.'
  from rounds r
  join contests c on c.id = r.contest_id
  join rounds prev on prev.contest_id = r.contest_id and prev.seq = r.seq - 1 and prev.status = 'resolved'
  where r.status = 'pending' and r.opens_at < now() - interval '1 hour'

  union all
  select 'disqualified_unrefunded', 'alert', count(*)::int,
         count(*) || ' vote pack(s) for disqualified pets still unrefunded after 15 minutes. Run Disqualify again on the pet to retry.'
  from votes v
  join entries e on e.id = v.entry_id
  where e.status = 'disqualified' and v.status = 'succeeded'
    and e.disqualified_at < now() - interval '15 minutes'
  having count(*) > 0

  union all
  select 'personal_data_due', 'warn', 1,
         c.year || ' contest ended over a year ago and its entrant and buyer emails are still stored. Erase them from the Wrap-up tab (export the newsletter list first).'
  from contests c
  where c.status = 'complete' and c.personal_data_erased_at is null
    and (select max(r.resolved_at) from rounds r where r.contest_id = c.id) < now() - interval '365 days'

  union all
  select 'free_vote_paused', 'warn', 1,
         'Free voting has been paused since '
           || to_char(c.free_vote_paused_at at time zone 'America/Chicago', 'FMHH12:MI AM')
           || '. Resume it from the Free votes tab when it is safe.'
  from contests c
  where c.free_vote_enabled and c.status = 'voting'
    and c.free_vote_paused_at < now() - interval '1 hour'

  union all
  select 'free_vote_spike', 'warn', count(*)::int,
         string_agg(w.pet_name || ' (' || w.free_last_hour || ')', ', ')
           || ' gained more than 200 free votes in the last hour. Check the Free votes tab.'
  from free_vote_pet_watch w
  where w.free_last_hour > 200
  having count(*) > 0

  union all
  select 'free_vote_shared_connection', 'warn', count(*)::int,
         count(*) || ' connection(s) cast free votes for more than 15 addresses in the last hour. Check the Free votes tab.'
  from free_vote_connection_watch w
  where w.voters > 15
  having count(*) > 0

  union all
  select 'free_vote_codes_failing', 'warn', count(*) filter (where ch.send_status = 'failed')::int,
         count(*) filter (where ch.send_status = 'failed') || ' of ' || count(*)
           || ' free-vote code emails failed in the last hour. Check the email provider.'
  from free_vote_challenges ch
  where ch.send_status is not null and ch.created_at > now() - interval '1 hour'
  having count(*) >= 10 and count(*) filter (where ch.send_status = 'failed') * 5 > count(*)

  union all
  -- The live tally cache must equal the vote tables. close_round rebuilds
  -- its round regardless; this says so sooner.
  select 'tally_drift', 'alert', count(*)::int,
         count(*) || ' live tally row(s) differ from the vote tables. Rebuild the round''s tally (rebuild_round_tally) and tell the developer.'
  from (
    select coalesce(c.round_id, l.round_id) as round_id
    from (select t.* from round_tally t join rounds r on r.id = t.round_id and r.status <> 'resolved') c
    full outer join (select s.* from round_live_sums s join rounds r on r.id = s.round_id and r.status <> 'resolved') l
      on l.round_id = c.round_id and l.entry_id = c.entry_id
    where coalesce(c.votes, 0) <> coalesce(l.votes, 0)
       or coalesce(c.free_votes, 0) <> coalesce(l.free_votes, 0)
       or coalesce(c.amount_cents, 0) <> coalesce(l.amount_cents, 0)
  ) d
  having count(*) > 0
$$;

-- ------------------------------------------------------------------ access --
revoke execute on function tally_apply(jsonb), tally_votes_ins(), tally_votes_upd(), tally_free_ins(), tally_free_upd(),
  rebuild_round_tally(uuid)
  from public, anon, authenticated;
grant execute on function rebuild_round_tally(uuid) to authenticated;
-- Replaced: restated.
grant select on entry_round_totals to anon, authenticated, service_role;
grant execute on function close_round(uuid) to authenticated;
grant execute on function contest_health() to service_role;
