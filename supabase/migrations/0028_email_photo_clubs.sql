-- Two email changes. The approval email shows the pet's photo and gives
-- the owner's page a button instead of a raw link, so the queue now carries
-- the photo. And the milestone clubs get a note: one when a pet passes 100,
-- 500, 1,000 or 5,000 votes over the whole contest (see the club branch).
-- notification_queue is rebuilt from 0024's with those two additions only;
-- its return type changes, so it is dropped and granted afresh.

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('entry_received', 'entry_approved', 'entry_rejected', 'advanced', 'eliminated', 'champion',
                  'nurture_ready', 'nurture_open', 'nurture_halfway', 'nurture_last_day',
                  'nurture_matchup_last_day', 'nurture_thanks',
                  'club_100', 'club_500', 'club_1000', 'club_5000'));

drop function notification_queue(int);
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
                 raised_cents     bigint,
                 my_votes         int,
                 rank             int,
                 field_size       int,
                 cut_margin       int,
                 opponent_votes   int,
                 goal_votes       int,
                 owner_token      uuid,
                 champion_name    text,
                 opens_at         timestamptz,
                 -- The matchup an advancement or matchup-day note is about,
                 -- for the two-pet share page.
                 matchup_id       uuid,
                 -- The pet's photo (its thumbnail when there is one), for the
                 -- approval and club emails. Public once the entry is approved.
                 photo_path       text)
  language sql stable security definer set search_path = public, pg_temp
as $$
  with resolved as (
    select r.*, c.bracket_size, c.name as contest_name
    from rounds r
    join contests c on c.id = r.contest_id
    where r.status = 'resolved' and r.resolved_at > now() - interval '3 days'
  ),
  -- Open Round standings, for the halfway and last-day emails.
  standings as (
    select e.id as entry_id, r.id as round_id, c.bracket_size,
           coalesce(t.votes, 0)::int as votes,
           row_number() over (partition by c.id order by coalesce(t.votes, 0) desc, e.created_at asc)::int as rank,
           count(*) over (partition by c.id)::int as field_size
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r on r.contest_id = c.id and r.seq = 1 and r.status = 'open'
    left join entry_round_totals t on t.round_id = r.id and t.entry_id = e.id
    where e.status = 'approved'
  ),
  cut as (
    select s.*,
           (select x.votes from standings x where x.round_id = s.round_id and x.rank = s.bracket_size) as last_in,
           (select x.votes from standings x where x.round_id = s.round_id and x.rank = s.bracket_size + 1) as first_out
    from standings s
  ),
  -- Each approved pet's votes over the whole contest, every round that
  -- has opened, for the club notes: the same sum the pet page shows.
  contest_totals as (
    select e.id as entry_id, sum(t.votes)::int as votes
    from entries e
    join rounds r on r.contest_id = e.contest_id and r.status <> 'pending'
    join entry_round_totals t on t.round_id = r.id and t.entry_id = e.id
    where e.status = 'approved'
    group by e.id
  ),
  owed as (
    select 'entry_received' as kind, e.id as entry_id, null::uuid as round_id,
           null::text as round_name, null::text as opponent_name,
           c.submissions_close_at as closes_at, 1 as priority, e.created_at as since,
           null::int as my_votes, null::int as rank, null::int as field_size, null::int as cut_margin,
           null::int as opponent_votes, null::text as champion_name, null::timestamptz as opens_at, null::uuid as matchup_id
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'pending' and e.created_at > now() - interval '1 day'

    union all
    select 'entry_approved', e.id, null, null, null, null, 2, e.moderated_at,
           null, null, null, null, null, null, null, null
    from entries e
    join contests c on c.id = e.contest_id
    where e.status = 'approved'
      and c.status in ('submissions_open', 'voting')
      and not exists (select 1 from rounds r1
                      where r1.contest_id = c.id and r1.seq = 1 and r1.status = 'resolved')

    union all
    select 'entry_rejected', e.id, null, null, null, null, 2, e.moderated_at,
           null, null, null, null, null, null, null, null
    from entries e
    where e.status = 'rejected' and e.moderated_at > now() - interval '7 days'

    union all
    select 'advanced', side.entry_id, n.id, round_label(n.seq, rs.bracket_size),
           opp.pet_name, n.closes_at, 3, rs.resolved_at,
           null, null, null, null, null, null, n.opens_at, m.id
    from resolved rs
    join rounds n on n.contest_id = rs.contest_id and n.seq = rs.seq + 1
                 and n.status in ('pending', 'open')
    join matchups m on m.round_id = n.id
    cross join lateral (values (m.entry_a_id, m.entry_b_id),
                               (m.entry_b_id, m.entry_a_id)) as side(entry_id, opponent_id)
    join entries opp on opp.id = side.opponent_id

    union all
    select 'eliminated', e.id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 4, rs.resolved_at,
           null, null, null, null, null, null, null, null
    from resolved rs
    join entries e on e.contest_id = rs.contest_id
    where rs.kind = 'open' and e.status = 'approved' and e.seed is null

    union all
    select 'eliminated',
           case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end,
           rs.id, round_label(rs.seq, rs.bracket_size),
           w.pet_name, null, 4, rs.resolved_at,
           null, null, null, null, null, null, null, null
    from resolved rs
    join matchups m on m.round_id = rs.id and m.winner_entry_id is not null
    join entries w on w.id = m.winner_entry_id
    where rs.kind = 'bracket'

    union all
    select 'champion', m.winner_entry_id, rs.id, round_label(rs.seq, rs.bracket_size),
           null, null, 3, rs.resolved_at,
           null, null, null, null, null, null, null, null
    from resolved rs
    join contests c on c.id = rs.contest_id and c.status = 'complete'
    join matchups m on m.round_id = rs.id
    where rs.kind = 'bracket'
      and not exists (select 1 from rounds n where n.contest_id = rs.contest_id and n.seq = rs.seq + 1)

    -- N1: a day after approval, while voting is still a day or more away.
    union all
    select 'nurture_ready', e.id, null, null, null, r1.opens_at, 5, e.moderated_at + interval '24 hours',
           null, null, null, null, null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id and c.status = 'submissions_open'
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'pending'
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and r1.opens_at - e.moderated_at > interval '24 hours'
      and now() >= e.moderated_at + interval '24 hours'
      and now() < r1.opens_at

    -- N2: the Open Round's first two days.
    union all
    select 'nurture_open', e.id, r1.id, round_label(1, c.bracket_size), null, r1.closes_at, 5, r1.opens_at,
           null, null, null, null, null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'open'
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= r1.opens_at and now() < r1.opens_at + interval '2 days'

    -- N3: 7 a.m. on day 4 of the Open Round, with the standings.
    union all
    select 'nurture_halfway', e.id, r1.id, round_label(1, c.bracket_size), null, r1.closes_at, 5,
           chicago_morning(r1.opens_at + interval '3 days'),
           k.votes, k.rank, k.field_size,
           case when k.rank <= k.bracket_size then k.votes - coalesce(k.first_out, 0)
                else -(coalesce(k.last_in, 0) - k.votes + 1) end,
           null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'open'
    join cut k on k.entry_id = e.id and k.round_id = r1.id
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= chicago_morning(r1.opens_at + interval '3 days')
      and chicago_morning(r1.opens_at + interval '3 days') < r1.closes_at - interval '12 hours'
      and now() < r1.closes_at

    -- N4: 7 a.m. on the Open Round's closing day.
    union all
    select 'nurture_last_day', e.id, r1.id, round_label(1, c.bracket_size), null, r1.closes_at, 5,
           chicago_morning(r1.closes_at),
           k.votes, k.rank, k.field_size,
           case when k.rank <= k.bracket_size then k.votes - coalesce(k.first_out, 0)
                else -(coalesce(k.last_in, 0) - k.votes + 1) end,
           null, null, r1.opens_at, null
    from entries e
    join contests c on c.id = e.contest_id
    join rounds r1 on r1.contest_id = c.id and r1.seq = 1 and r1.status = 'open'
    join cut k on k.entry_id = e.id and k.round_id = r1.id
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= chicago_morning(r1.closes_at) and now() < r1.closes_at

    -- N5: 7 a.m. on a bracket round's closing day, for the pets in it.
    union all
    select 'nurture_matchup_last_day', e.id, rb.id, round_label(rb.seq, c.bracket_size), opp.pet_name, rb.closes_at, 5,
           chicago_morning(rb.closes_at),
           coalesce(tm.votes, 0)::int, null, null, null, coalesce(topp.votes, 0)::int, null, rb.opens_at, m.id
    from entries e
    join contests c on c.id = e.contest_id
    join rounds rb on rb.contest_id = c.id and rb.kind = 'bracket' and rb.status = 'open'
    join matchups m on m.round_id = rb.id and e.id in (m.entry_a_id, m.entry_b_id)
    join entries opp on opp.id = case when m.entry_a_id = e.id then m.entry_b_id else m.entry_a_id end
                    and opp.status = 'approved'
    left join entry_round_totals tm on tm.round_id = rb.id and tm.entry_id = e.id
    left join entry_round_totals topp on topp.round_id = rb.id and topp.entry_id = opp.id
    where e.status = 'approved' and e.nurture_opt_out_at is null
      and now() >= chicago_morning(rb.closes_at) and now() < rb.closes_at

    -- N6: 36 hours after the final, to everyone but the champion.
    union all
    select 'nurture_thanks', e.id, null, null, null, null, 5, rf.resolved_at + interval '36 hours',
           null, null, null, null, null, w.pet_name, null, null
    from entries e
    join contests c on c.id = e.contest_id and c.status = 'complete'
    join rounds rf on rf.contest_id = c.id and rf.kind = 'bracket' and rf.status = 'resolved'
                  and not exists (select 1 from rounds n where n.contest_id = c.id and n.seq = rf.seq + 1)
    join matchups fm on fm.round_id = rf.id and fm.winner_entry_id is not null
    join entries w on w.id = fm.winner_entry_id
    where e.status = 'approved' and e.nurture_opt_out_at is null and e.id <> fm.winner_entry_id
      and now() >= rf.resolved_at + interval '36 hours' and now() < rf.resolved_at + interval '10 days'

    -- Milestone clubs (lib/milestones.js on the site): a note at 100, 500,
    -- 1,000 and 5,000 votes over the contest, while voting runs. Only the
    -- highest club reached is owed, and never a lower one after a higher
    -- one went (email switched on late, or a big night), so a pet hears
    -- at most four times. A tips-style note: an owner who stopped the tips
    -- gets none.
    union all
    select 'club_' || top.tier, e.id, null, null, null, null, 5, now(),
           ct.votes, null, null, null, null, null, null, null
    from entries e
    join contests c on c.id = e.contest_id and c.status = 'voting'
    join contest_totals ct on ct.entry_id = e.id
    cross join lateral (
      select max(x) as tier from unnest(array[100, 500, 1000, 5000]) as x where x <= ct.votes
    ) top
    where e.status = 'approved' and e.nurture_opt_out_at is null and top.tier is not null
      and not exists (select 1 from notifications n
                      where n.entry_id = e.id and n.kind like 'club\_%'
                        and substring(n.kind from 6)::int >= top.tier)
  )
  select o.kind, e.id, o.round_id, e.owner_email, e.owner_name, e.pet_name,
         c.name, o.round_name, o.opponent_name, o.closes_at, e.rejection_reason,
         coalesce(s.shelter_cents, 0) + coalesce(s.match_cents, 0),
         o.my_votes, o.rank, o.field_size, o.cut_margin, o.opponent_votes,
         e.goal_votes, e.owner_token, o.champion_name, o.opens_at, o.matchup_id,
         coalesce(e.thumb_path, e.photo_path)
  from owed o
  join entries e  on e.id = o.entry_id
  join contests c on c.id = e.contest_id
  left join contest_stats s on s.contest_id = c.id
  where not exists (
    select 1 from notifications x
    where x.kind = o.kind and x.entry_id = o.entry_id
      and x.round_id is not distinct from o.round_id
  )
    -- A pet no longer in the contest hears from a person, not a template.
    and (o.kind in ('entry_received', 'entry_rejected') or e.status = 'approved')
  order by o.priority, o.since
  limit p_limit
$$;

revoke execute on function notification_queue(int) from public, anon, authenticated;
grant execute on function notification_queue(int) to service_role;
