-- Findings from an audit against Supabase's Postgres best practices and
-- Stripe's integration best practices. Each change is small and pinned by
-- supabase/tests/hardening_test.sql.

-- ------------------------------------------------- confirm_vote and the pet --
-- The pet is held FOR SHARE, as free_vote_record does. Without it a
-- disqualify_entry committing between the read and the update credits a vote
-- for a disqualified pet that its refund list never saw. Lock order is
-- vote -> round -> entry; disqualify_entry takes round -> entry, so there is no
-- cycle.
create or replace function confirm_vote(p_payment_intent text, p_paid_at timestamptz default null)
  returns text
  language plpgsql security definer set search_path = public, pg_temp
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
  select status into v_entry_status from entries where id = v.entry_id for share;

  if r.status = 'open'
     and v_entry_status = 'approved'
     and coalesce(p_paid_at, clock_timestamp()) <= r.closes_at + payment_grace() then
    update votes set status = 'succeeded', confirmed_at = clock_timestamp() where id = v.id;
    return 'confirmed';
  end if;

  update votes set status = 'late', confirmed_at = clock_timestamp() where id = v.id;
  return 'late';
end $$;

-- ------------------------------------------- disqualify_entry and the close --
-- The open round is taken FOR SHARE before the pet, so a disqualification
-- either finishes before close_round seeds the bracket or waits for it; it can
-- no longer commit mid-close and leave a disqualified pet holding a seed that a
-- seventeenth pet should have had. Same body as 0019 otherwise.
create or replace function disqualify_entry(p_entry_id uuid, p_reason text)
  returns table (payment_intent text)
  language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  e        entries%rowtype;
  c        contests%rowtype;
  r1       rounds%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_left   int;
  v_contest uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select contest_id into v_contest from entries where id = p_entry_id;
  perform 1 from rounds where contest_id = v_contest and status = 'open' for share;

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

  -- Re-runs are harmless: only counted votes change.
  update free_votes f
  set status = 'returned', voided_at = now(), voided_by = auth.uid(), voided_reason = 'pet disqualified'
  from rounds r
  where r.id = f.round_id and r.status <> 'resolved'
    and f.entry_id = e.id and f.status = 'counted';

  return query
  select v.stripe_payment_intent_id
  from votes v
  where v.entry_id = e.id and v.status = 'succeeded'
  order by v.created_at;
end $$;

-- --------------------------------------------------- disputes that are won --
-- A dispute WPR wins means the money stayed, so the votes count again and the
-- shelters' share includes the pack. A resolved round's totals do not move:
-- they live in round_results.
create function mark_dispute_won(p_payment_intent text) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform 1 from votes where stripe_payment_intent_id = p_payment_intent;
  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;
  update votes set status = 'succeeded'
  where stripe_payment_intent_id = p_payment_intent and status = 'disputed';
end $$;

-- ------------------------------------------ checkouts that can never count --
-- A payment intent never expires on its own. One left open past the deadline,
-- or on a pet since disqualified, can still be paid, and is then refunded as
-- late with the card fee WPR's to keep. The health schedule and the disqualify
-- function cancel them at Stripe and record it here.
alter table votes add column canceled_at timestamptz;

create function stale_pending_intents(p_limit int, p_entry_id uuid default null)
  returns table (payment_intent text)
  language sql stable security definer set search_path = public, pg_temp
as $$
  select v.stripe_payment_intent_id
  from votes v
  join rounds r on r.id = v.round_id
  join entries e on e.id = v.entry_id
  where v.status = 'pending' and v.canceled_at is null
    and (p_entry_id is null or v.entry_id = p_entry_id)
    and (r.status <> 'open' or now() > r.closes_at + payment_grace() or e.status <> 'approved')
  order by v.created_at
  limit p_limit
$$;

create function mark_intent_canceled(p_payment_intent text) returns void
  language sql security definer set search_path = public, pg_temp
as $$
  update votes set canceled_at = now()
  where stripe_payment_intent_id = p_payment_intent and status = 'pending' and canceled_at is null;
$$;

-- ------------------------------------------------- RLS: is_admin() once each --
-- A security definer function is never inlined, so a bare is_admin() in a
-- policy runs once per row. Wrapped in a scalar subquery it runs once per
-- statement (an initPlan). Same rules, measured 30 to 60 times faster on the
-- admin desk's larger reads.
alter policy votes_admin on votes using ((select is_admin())) with check ((select is_admin()));
alter policy contests_admin on contests using ((select is_admin())) with check ((select is_admin()));
alter policy shelters_admin on shelters using ((select is_admin())) with check ((select is_admin()));
alter policy entries_admin on entries using ((select is_admin())) with check ((select is_admin()));
alter policy rounds_admin on rounds using ((select is_admin())) with check ((select is_admin()));
alter policy matchups_admin on matchups using ((select is_admin())) with check ((select is_admin()));
alter policy admins_self_read on admins using (user_id = (select auth.uid()));
alter policy vote_packs_admin on vote_packs using ((select is_admin())) with check ((select is_admin()));
alter policy bonus_windows_admin on bonus_windows using ((select is_admin())) with check ((select is_admin()));
alter policy notifications_admin_read on notifications using ((select is_admin()));
alter policy round_results_admin_read on round_results using ((select is_admin()));
alter policy health_incidents_admin_read on health_incidents using ((select is_admin()));
alter policy free_voters_admin_read on free_voters using ((select is_admin()));
alter policy free_votes_admin_read on free_votes using ((select is_admin()));
alter policy free_vote_reminders_admin_read on free_vote_reminders using ((select is_admin()));
alter policy free_vote_staff_log_admin_read on free_vote_staff_log using ((select is_admin()));
alter policy pets_admin_read on storage.objects using (bucket_id = 'pets' and (select is_admin()));
alter policy pets_admin_delete on storage.objects using (bucket_id = 'pets' and (select is_admin()));

-- ------------------------------------------------- indexes on real query paths --
-- The reminder queue's "last pet this voter chose": 3.5 s per sweep without it.
create index free_votes_voter_cast_idx on free_votes (voter_id, cast_at desc);
create index free_voter_devices_voter_idx on free_voter_devices (voter_id);
-- hit_rate_limit's occasional housekeeping delete, inside a request.
create index rate_limits_window_idx on rate_limits (window_start);

-- ------------------------------------------------------ backing constraints --
alter table rounds add constraint resolution_recorded check (status <> 'resolved' or resolved_at is not null);
alter table votes add constraint refund_within_amount check (refunded_cents <= amount_cents);

-- ----------------------------------------- search_path: pg_temp searched last --
-- Every security definer function pinned to `public` gets `public, pg_temp`,
-- so a temporary table can never shadow one of ours. Not an empty path: that
-- would make citext comparisons case-sensitive and break the per-email caps.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proconfig @> array['search_path=public']
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------- access --
revoke execute on function mark_dispute_won(text), stale_pending_intents(int, uuid), mark_intent_canceled(text)
  from public, anon, authenticated;
grant execute on function mark_dispute_won(text), stale_pending_intents(int, uuid), mark_intent_canceled(text)
  to service_role;
-- Replaced: restated.
grant execute on function confirm_vote(text, timestamptz) to service_role;
grant execute on function disqualify_entry(uuid, text) to authenticated;
