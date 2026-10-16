-- Disqualifying an entry after voting has started.
--
-- Policy (published in the rules): every vote pack ever bought for a
-- disqualified pet is refunded, in every round. In a matchup its opponent
-- advances whatever the count. Finished rounds keep their published results;
-- the money comes back regardless. The pet leaves the public site and its
-- photos are deleted (the usual reason is a stolen photo).
--
-- The database decides and records; the `disqualify` edge function deletes the
-- files and asks Stripe for the refunds, and charge.refunded flips each vote
-- to 'refunded' as usual. Running it again on the same pet retries whatever
-- is still unrefunded.

alter table entries
  add column disqualified_at         timestamptz,
  add column disqualified_by         uuid references auth.users(id) on delete set null,
  add column disqualification_reason text,
  add constraint disqualification_recorded
    check (status <> 'disqualified' or (disqualified_at is not null and disqualification_reason is not null));


-- Marks the entry and returns the payment intents still to refund. Safe to
-- call again on an entry already disqualified.
create function disqualify_entry(p_entry_id uuid, p_reason text)
  returns table (payment_intent text)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  e        entries%rowtype;
  c        contests%rowtype;
  r1       rounds%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_left   int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict e from entries where id = p_entry_id for update;
  select * into strict c from contests where id = e.contest_id for share;

  if c.status <> 'voting' then
    raise exception 'Disqualification is for a contest in voting. Before voting, reject the entry instead; once the contest is over, its results are final.'
      using errcode = 'WP400';
  end if;

  if e.status not in ('approved', 'disqualified') then
    raise exception 'Only an approved entry can be disqualified.' using errcode = 'WP400';
  end if;

  if e.status = 'approved' then
    if v_reason is null then
      raise exception 'A reason is required. It is kept with the entry.' using errcode = 'WP400';
    end if;

    -- During the Open Round the field must still fill the bracket, or
    -- close_round could not seed it a week from now.
    select * into r1 from rounds where contest_id = c.id and seq = 1;
    if r1.status in ('open', 'closed') then
      select count(*) - 1 into v_left from entries where contest_id = c.id and status = 'approved';
      if v_left < c.bracket_size then
        raise exception 'Disqualifying would leave % approved entries for a %-pet bracket.', v_left, c.bracket_size
          using errcode = 'WP400';
      end if;
    end if;

    update entries
    set status = 'disqualified',
        disqualified_at = now(),
        disqualified_by = auth.uid(),
        disqualification_reason = v_reason
    where id = e.id;
  end if;

  return query
  select v.stripe_payment_intent_id
  from votes v
  where v.entry_id = e.id and v.status = 'succeeded'
  order by v.created_at;
end $$;

revoke execute on function disqualify_entry(uuid, text) from public, anon, authenticated;
grant execute on function disqualify_entry(uuid, text) to authenticated;


-- A payment landing for a disqualified pet is not credited: it is marked late,
-- which the webhook refunds automatically. Otherwise as in 0012.
create or replace function confirm_vote(p_payment_intent text, p_paid_at timestamptz default null)
  returns text
  language plpgsql security definer set search_path = public
as $$
declare
  v votes%rowtype;
  r rounds%rowtype;
  v_entry_status entry_status;
begin
  select * into v from votes
  where stripe_payment_intent_id = p_payment_intent
  for update;

  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;

  -- Reported late again on a redelivery, so the webhook retries a refund that
  -- failed the first time. The refund itself is idempotent.
  if v.status = 'late' then
    return 'late';
  end if;

  if v.status <> 'pending' then
    return 'duplicate';
  end if;

  -- FOR SHARE blocks while close_round holds the round FOR UPDATE, so no
  -- payment lands between the tally and the status change.
  select * into r from rounds where id = v.round_id for share;
  select status into v_entry_status from entries where id = v.entry_id;

  if r.status = 'open'
     and v_entry_status = 'approved'
     and coalesce(p_paid_at, clock_timestamp()) <= r.closes_at + payment_grace() then
    update votes set status = 'succeeded', confirmed_at = clock_timestamp() where id = v.id;
    return 'confirmed';
  end if;

  update votes set status = 'late', confirmed_at = clock_timestamp() where id = v.id;
  return 'late';
end $$;


-- Disqualified entries' files are as public as rejected ones until deleted.
create or replace view rejected_photos_live with (security_invoker = true) as
  select e.id as entry_id,
         e.contest_id,
         e.pet_name,
         e.photo_path,
         e.moderated_at,
         o.name as object_name
  from entries e
  join storage.objects o
    on o.bucket_id = 'pets' and o.name in (e.photo_path, e.thumb_path)
  where e.status in ('rejected', 'disqualified');


-- In a matchup, a disqualified pet loses whatever the count.
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
    -- A disqualified pet loses whatever the count: its opponent advances.
    order by (e.status = 'disqualified') asc, coalesce(t.votes, 0) desc, e.seed asc
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


create or replace function notification_queue(p_limit int default 50)
  returns table (kind             text,
                 entry_id         uuid,
                 round_id         uuid,
                 to_email         citext,
                 owner_name       text,
                 pet_name         text,
                 contest_name     text,
                 round_name       text,
                 opponent_name    text,
                 closes_at        timestamptz,
                 rejection_reason text,
                 raised_cents     bigint)
  language sql stable security definer set search_path = public
as $$
  with resolved as (
    select r.*, c.bracket_size, c.name as contest_name
    from rounds r
    join contests c on c.id = r.contest_id
    where r.status = 'resolved' and r.resolved_at > now() - interval '3 days'
  ),
  owed as (
    select 'entry_received' as kind, e.id as entry_id, null::uuid as round_id,
           null::text as round_name, null::text as opponent_name,
           c.submissions_close_at as closes_at, 1 as priority, e.created_at as since
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'pending' and e.created_at > now() - interval '1 day'

    union all
    select 'entry_approved', e.id, null, null, null, null, 2, e.moderated_at
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'approved'
      and c.status in ('submissions_open', 'voting')
      and not exists (select 1 from rounds r1
                      where r1.contest_id = c.id and r1.seq = 1 and r1.status = 'resolved')

    union all
    select 'entry_rejected', e.id, null, null, null, null, 2, e.moderated_at
    from entries e
    where e.status = 'rejected' and e.moderated_at > now() - interval '7 days'

    union all
    select 'advanced', side.entry_id, n.id, round_label(n.seq, rs.bracket_size),
           opp.pet_name, n.closes_at, 3, rs.resolved_at
    from resolved rs
    join rounds n on n.contest_id = rs.contest_id and n.seq = rs.seq + 1
                 and n.status in ('pending', 'open')
    join matchups m on m.round_id = n.id
    cross join lateral (values (m.entry_a_id, m.entry_b_id),
                               (m.entry_b_id, m.entry_a_id)) as side(entry_id, opponent_id)
    join entries opp on opp.id = side.opponent_id

    union all
    select 'eliminated', e.id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 4, rs.resolved_at
    from resolved rs
    join entries e on e.contest_id = rs.contest_id
    where rs.kind = 'open' and e.status = 'approved' and e.seed is null

    union all
    select 'eliminated',
           case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end,
           rs.id, round_label(rs.seq, rs.bracket_size),
           w.pet_name, null, 4, rs.resolved_at
    from resolved rs
    join matchups m on m.round_id = rs.id and m.winner_entry_id is not null
    join entries w on w.id = m.winner_entry_id
    where rs.kind = 'bracket'

    union all
    select 'champion', m.winner_entry_id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 3, rs.resolved_at
    from resolved rs
    join contests c on c.id = rs.contest_id and c.status = 'complete'
    join matchups m on m.round_id = rs.id
    where rs.kind = 'bracket'
      and not exists (select 1 from rounds n where n.contest_id = rs.contest_id and n.seq = rs.seq + 1)
  )
  select o.kind, e.id, o.round_id, e.owner_email, e.owner_name, e.pet_name,
         c.name, o.round_name, o.opponent_name, o.closes_at, e.rejection_reason,
         coalesce(s.shelter_cents, 0)
  from owed o
  join entries e  on e.id = o.entry_id
  join contests c on c.id = e.contest_id
  left join contest_stats s on s.contest_id = c.id
  where not exists (
    select 1 from notifications x
    where x.kind = o.kind and x.entry_id = o.entry_id
      and x.round_id is not distinct from o.round_id
  )
    -- A disqualified pet's owner hears from a person, not from a template
    -- saying it "advanced" or "ended its run".
    and (o.kind in ('entry_received', 'entry_rejected') or e.status = 'approved')
  order by o.priority, o.since
  limit p_limit
$$;


-- One more check: refunds for disqualified pets that did not go through.
create or replace function contest_health()
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

  union all
  -- Buyers of a disqualified pet are owed their money. The disqualify function
  -- asks Stripe for every refund; anything still standing after 15 minutes did
  -- not go through. Re-run Disqualify on the pet to retry.
  select 'disqualified_unrefunded', 'alert', count(*)::int,
         count(*) || ' vote pack(s) for disqualified pets still unrefunded after 15 minutes. Run Disqualify again on the pet to retry.'
  from votes v
  join entries e on e.id = v.entry_id
  where e.status = 'disqualified' and v.status = 'succeeded'
    and e.disqualified_at < now() - interval '15 minutes'
  having count(*) > 0
$$;
