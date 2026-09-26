-- Transactional email: who is owed which message, and a log of what was sent.
--
-- Dormant until RESEND_API_KEY is set on the edge functions. The `notify`
-- function is a sweep: it asks notification_queue() what is owed, sends it,
-- and records each send here. The unique constraint makes a sweep safe to run
-- any number of times: from the admin panel after each moderation or round
-- close, or on a schedule. A missed call heals itself on the next one.
--
-- The approval email carries the owner's share link. Owners sharing their own
-- pet is what sells votes, so this is the email that matters most.

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('entry_received', 'entry_approved', 'entry_rejected',
                                            'advanced', 'eliminated', 'champion')),
  entry_id    uuid not null references entries(id) on delete cascade,
  round_id    uuid references rounds(id) on delete cascade,
  to_email    citext not null,
  status      text not null check (status in ('sent', 'failed')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now(),
  constraint notifications_once unique nulls not distinct (kind, entry_id, round_id)
);

alter table notifications enable row level security;

create policy notifications_admin_read on notifications
  for select to authenticated using (is_admin());

grant select on notifications to authenticated;
grant select, insert, update, delete on notifications to service_role;


-- Everything owed and not yet sent, oldest obligation first.
--
-- Freshness limits are deliberate. Turn email on mid-contest and nobody gets a
-- "we received your entry" note about a pet already in the Final Four:
--   received  - within a day of submission, still pending
--   approved  - only until round 1 resolves (after that it is old news)
--   rejected  - within a week of the decision
--   advanced / eliminated / champion - within three days of the round closing
create function notification_queue(p_limit int default 50)
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
    -- received
    select 'entry_received' as kind, e.id as entry_id, null::uuid as round_id,
           null::text as round_name, null::text as opponent_name,
           c.submissions_close_at as closes_at, 1 as priority, e.created_at as since
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'pending' and e.created_at > now() - interval '1 day'

    union all
    -- approved
    select 'entry_approved', e.id, null, null, null, null, 2, e.moderated_at
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'approved'
      and c.status in ('submissions_open', 'voting')
      and not exists (select 1 from rounds r1
                      where r1.contest_id = c.id and r1.seq = 1 and r1.status = 'resolved')

    union all
    -- rejected
    select 'entry_rejected', e.id, null, null, null, null, 2, e.moderated_at
    from entries e
    where e.status = 'rejected' and e.moderated_at > now() - interval '7 days'

    union all
    -- advanced: both sides of every matchup in the round after a fresh close
    select 'advanced', side.entry_id, n.id, round_label(n.seq, rs.bracket_size),
           opp.pet_name, n.closes_at, 3, rs.resolved_at
    from resolved rs
    join rounds n on n.contest_id = rs.contest_id and n.seq = rs.seq + 1
    join matchups m on m.round_id = n.id
    cross join lateral (values (m.entry_a_id, m.entry_b_id),
                               (m.entry_b_id, m.entry_a_id)) as side(entry_id, opponent_id)
    join entries opp on opp.id = side.opponent_id

    union all
    -- eliminated in the open round: approved, not seeded
    select 'eliminated', e.id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 4, rs.resolved_at
    from resolved rs
    join entries e on e.contest_id = rs.contest_id
    where rs.kind = 'open' and e.status = 'approved' and e.seed is null

    union all
    -- eliminated in a bracket round: the loser of each matchup
    select 'eliminated',
           case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end,
           rs.id, round_label(rs.seq, rs.bracket_size),
           w.pet_name, null, 4, rs.resolved_at
    from resolved rs
    join matchups m on m.round_id = rs.id and m.winner_entry_id is not null
    join entries w on w.id = m.winner_entry_id
    where rs.kind = 'bracket'

    union all
    -- champion: winner of the final
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
  -- A pet that advanced is not also "eliminated" in the same close; the final
  -- winner gets 'champion', never 'eliminated'.
  order by o.priority, o.since
  limit p_limit
$$;

revoke execute on function notification_queue(int) from public, anon, authenticated;
grant execute on function notification_queue(int) to service_role;
