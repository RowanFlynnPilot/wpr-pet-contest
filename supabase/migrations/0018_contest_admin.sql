-- Running a contest from the admin desk, start to finish: create it, fix it
-- while it is still a draft, pay the shelters, and keep the privacy promise
-- afterward.
--
-- Until now the contest row, its packs and its shelters were hand-written SQL
-- in production, the riskiest manual step in the runbook. Contest status still
-- moves only through open_submissions / open_round / close_round; these
-- functions create a draft, edit a draft, or delete an empty one.


alter table shelters
  -- Share of the shelter pool, relative to the other shelters: 1 and 1 is an
  -- even split, 2 and 1 is two thirds and one third. Set by the MOUs.
  add column payout_weight int not null default 1 check (payout_weight > 0);

alter table contests
  add column personal_data_erased_at timestamptz;


-- The recommended ladder, used when a contest is not copied from another.
create function default_vote_packs() returns jsonb
  language sql immutable
as $$
  select '[
    {"slug": "starter",  "label": "Starter",  "votes": 5,   "cents": 500,   "featured": false},
    {"slug": "fan",      "label": "Fan",      "votes": 25,  "cents": 2000,  "featured": true},
    {"slug": "superfan", "label": "Superfan", "votes": 75,  "cents": 5000,  "featured": false},
    {"slug": "champion", "label": "Champion", "votes": 200, "cents": 10000, "featured": false},
    {"slug": "legend",   "label": "Legend",   "votes": 600, "cents": 25000, "featured": false}
  ]'::jsonb
$$;


-- Shared validation, with messages written for the person filling in the form.
create function check_contest_settings(
  p_name text, p_split_pct int, p_open timestamptz, p_close timestamptz,
  p_bracket_size int, p_round_hours int
) returns void
  language plpgsql stable set search_path = public
as $$
begin
  if p_name is null then
    raise exception 'Give the contest a name.' using errcode = 'WP400';
  end if;
  if p_split_pct is null or p_split_pct not between 0 and 100 then
    raise exception 'The shelter share must be a percentage from 0 to 100.' using errcode = 'WP400';
  end if;
  if p_open is null or p_close is null or p_close <= p_open then
    raise exception 'Submissions must close after they open.' using errcode = 'WP400';
  end if;
  if p_close <= now() then
    raise exception 'Submissions must close in the future.' using errcode = 'WP400';
  end if;
  if p_bracket_size is null or p_bracket_size not in (4, 8, 16, 32, 64) then
    raise exception 'The bracket must have 4, 8, 16, 32 or 64 pets.' using errcode = 'WP400';
  end if;
  if p_round_hours is null or p_round_hours not between 12 and 168 then
    raise exception 'Bracket rounds must last between 12 hours and a week.' using errcode = 'WP400';
  end if;
end $$;


-- A new contest, as a draft. With p_copy_from, its packs and shelters come from
-- that contest (next year's contest is usually last year's with new dates);
-- otherwise the recommended ladder and no shelters.
create function create_contest(
  p_year                 int,
  p_name                 text,
  p_split_pct            int,
  p_submissions_open_at  timestamptz,
  p_submissions_close_at timestamptz,
  p_bracket_size         int default 16,
  p_round_hours          int default 48,
  p_copy_from            uuid default null
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id   uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  perform check_contest_settings(v_name, p_split_pct, p_submissions_open_at, p_submissions_close_at,
                                 p_bracket_size, p_round_hours);

  if p_year is null or p_year not between 2024 and 2100 then
    raise exception 'Choose a contest year.' using errcode = 'WP400';
  end if;
  if exists (select 1 from contests where year = p_year) then
    raise exception 'There is already a % contest.', p_year using errcode = 'WP400';
  end if;

  insert into contests (year, name, status, beneficiary_split_pct, submissions_open_at,
                        submissions_close_at, bracket_size, bracket_round_hours)
  values (p_year, v_name, 'draft', p_split_pct, p_submissions_open_at,
          p_submissions_close_at, p_bracket_size, p_round_hours)
  returning id into v_id;

  if p_copy_from is not null then
    insert into vote_packs (contest_id, slug, label, votes, cents, sort, featured, active)
    select v_id, slug, label, votes, cents, sort, featured, active
    from vote_packs where contest_id = p_copy_from;

    insert into shelters (contest_id, name, url, logo_path, payout_weight)
    select v_id, name, url, logo_path, payout_weight
    from shelters where contest_id = p_copy_from;
  end if;

  if not exists (select 1 from vote_packs where contest_id = v_id) then
    insert into vote_packs (contest_id, slug, label, votes, cents, sort, featured)
    select v_id, p->>'slug', p->>'label', (p->>'votes')::int, (p->>'cents')::int, n::int, (p->>'featured')::boolean
    from jsonb_array_elements(default_vote_packs()) with ordinality as t(p, n);
  end if;

  return v_id;
end $$;


-- Everything about a contest is editable until submissions open. After that the
-- split is published and the schedule is public, so this refuses.
create function update_draft_contest(
  p_contest_id           uuid,
  p_name                 text,
  p_split_pct            int,
  p_submissions_open_at  timestamptz,
  p_submissions_close_at timestamptz,
  p_bracket_size         int,
  p_round_hours          int
) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c      contests%rowtype;
  v_name text := nullif(trim(p_name), '');
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict c from contests where id = p_contest_id for update;
  if c.status <> 'draft' then
    raise exception 'Only a draft can be changed this way. Once submissions open, the published split and schedule stand.'
      using errcode = 'WP400';
  end if;

  perform check_contest_settings(v_name, p_split_pct, p_submissions_open_at, p_submissions_close_at,
                                 p_bracket_size, p_round_hours);

  update contests
  set name = v_name, beneficiary_split_pct = p_split_pct,
      submissions_open_at = p_submissions_open_at, submissions_close_at = p_submissions_close_at,
      bracket_size = p_bracket_size, bracket_round_hours = p_round_hours
  where id = c.id;
end $$;


-- A draft created by mistake. Nothing with entries or money can be deleted.
create function delete_draft_contest(p_contest_id uuid) returns void
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
    raise exception 'Only a draft contest can be deleted.' using errcode = 'WP400';
  end if;
  if exists (select 1 from entries where contest_id = c.id) then
    raise exception 'This draft already has entries and cannot be deleted.' using errcode = 'WP400';
  end if;

  delete from contests where id = c.id;
end $$;


-- --------------------------------------------------------------- payout --
-- What the shelters are owed, per the published rule: the split percentage of
-- vote pack sales after refunds. Stripe's fees are WPR's cost and are not
-- taken out of the shelter share. Chargebacks are excluded while disputed.
create view payout_statement with (security_invoker = true) as
  select c.id   as contest_id,
         c.year,
         c.name,
         c.status,
         c.beneficiary_split_pct,
         count(v.id) filter (where v.status = 'succeeded')::int as purchases,
         coalesce(sum(v.amount_cents) filter (where v.status in ('succeeded', 'refunded', 'late', 'disputed')), 0)::bigint as sales_cents,
         coalesce(sum(case when v.status in ('refunded', 'late') then v.amount_cents
                           when v.status = 'succeeded' then v.refunded_cents
                           else 0 end), 0)::bigint as refunded_cents,
         coalesce(sum(v.amount_cents) filter (where v.status = 'disputed'), 0)::bigint as disputed_cents,
         coalesce(sum(v.amount_cents - v.refunded_cents) filter (where v.status = 'succeeded'), 0)::bigint as net_cents,
         (coalesce(sum(v.amount_cents - v.refunded_cents) filter (where v.status = 'succeeded'), 0)
           * c.beneficiary_split_pct / 100)::bigint as shelter_pool_cents
  from contests c
  left join rounds r on r.contest_id = c.id
  left join votes v  on v.round_id = r.id
  group by c.id;


-- Each shelter's part of the pool, by payout_weight. Rounded down to the cent,
-- with the leftover cents going to the largest share so the parts add up to
-- the pool exactly.
create view shelter_payouts with (security_invoker = true) as
  with s as (
    select sh.*,
           sum(sh.payout_weight) over (partition by sh.contest_id) as total_weight,
           row_number() over (partition by sh.contest_id order by sh.payout_weight desc, sh.name, sh.id) as rank
    from shelters sh
  ),
  shares as (
    select s.contest_id, s.id as shelter_id, s.name, s.url, s.payout_weight, s.rank,
           floor(p.shelter_pool_cents * s.payout_weight::numeric / s.total_weight)::bigint as floor_cents,
           p.shelter_pool_cents
    from s join payout_statement p on p.contest_id = s.contest_id
  )
  select contest_id, shelter_id, name, url, payout_weight,
         (floor_cents + case when rank = 1
                             then shelter_pool_cents - sum(floor_cents) over (partition by contest_id)
                             else 0 end)::bigint as amount_cents
  from shares;


-- -------------------------------------------------------------- privacy --
-- The published promise: a year after a contest, the entrant and buyer email
-- addresses go. Pet names, towns, photos, results and the money stay; Stripe
-- payment ids stay for reconciliation. Not before the 120-day chargeback
-- window has closed, since a dispute may need the buyer's address.
create function erase_personal_data(p_contest_id uuid)
  returns table (entries int, votes int, notifications int)
  language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  c        contests%rowtype;
  v_ended  timestamptz;
  v_e      int;
  v_v      int;
  v_n      int;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict c from contests where id = p_contest_id for update;
  if c.status <> 'complete' then
    raise exception 'Personal data can be erased once the contest is complete.' using errcode = 'WP400';
  end if;

  select max(r.resolved_at) into v_ended from rounds r where r.contest_id = c.id;
  if v_ended > now() - interval '120 days' then
    raise exception 'Personal data can be erased from %, after the 120-day chargeback window closes.',
      to_char((v_ended + interval '120 days') at time zone 'America/Chicago', 'FMMonth FMDD, YYYY')
      using errcode = 'WP400';
  end if;

  update entries e
  set owner_name = 'Erased', owner_email = 'erased@invalid', newsletter_opt_in = false
  where e.contest_id = c.id and e.owner_email <> 'erased@invalid';
  get diagnostics v_e = row_count;

  update votes v
  set buyer_email = 'erased@invalid', newsletter_opt_in = false
  from rounds r
  where r.id = v.round_id and r.contest_id = c.id and v.buyer_email <> 'erased@invalid';
  get diagnostics v_v = row_count;

  update notifications n
  set to_email = 'erased@invalid'
  from entries e
  where e.id = n.entry_id and e.contest_id = c.id and n.to_email <> 'erased@invalid';
  get diagnostics v_n = row_count;

  update contests set personal_data_erased_at = now() where id = c.id;

  return query select v_e, v_v, v_n;
end $$;


-- One more check: the privacy promise, a year on.
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

  union all
  -- The published privacy promise: entrant and buyer emails are erased a year
  -- after the contest ends.
  select 'personal_data_due', 'warn', 1,
         c.year || ' contest ended over a year ago and its entrant and buyer emails are still stored. Erase them from the Wrap-up tab (export the newsletter list first).'
  from contests c
  where c.status = 'complete' and c.personal_data_erased_at is null
    and (select max(r.resolved_at) from rounds r where r.contest_id = c.id) < now() - interval '365 days'
$$;


revoke execute on function default_vote_packs() from public, anon, authenticated;
revoke execute on function check_contest_settings(text, int, timestamptz, timestamptz, int, int) from public, anon, authenticated;
revoke execute on function create_contest(int, text, int, timestamptz, timestamptz, int, int, uuid) from public, anon, authenticated;
revoke execute on function update_draft_contest(uuid, text, int, timestamptz, timestamptz, int, int) from public, anon, authenticated;
revoke execute on function delete_draft_contest(uuid) from public, anon, authenticated;
revoke execute on function erase_personal_data(uuid) from public, anon, authenticated;

grant execute on function create_contest(int, text, int, timestamptz, timestamptz, int, int, uuid) to authenticated;
grant execute on function update_draft_contest(uuid, text, int, timestamptz, timestamptz, int, int) to authenticated;
grant execute on function delete_draft_contest(uuid) to authenticated;
grant execute on function erase_personal_data(uuid) to authenticated;

grant select on payout_statement, shelter_payouts to authenticated, service_role;
