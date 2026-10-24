-- Withdrawal: an owner takes a pet out of the contest.
--
-- Published policy (rules, "Disqualification and withdrawal"): vote packs
-- already bought for a withdrawn pet are not refunded, and the shelters' share
-- of them stands. Otherwise it leaves the way a disqualified pet does: in a
-- matchup its opponent advances whatever the count, its free votes in rounds
-- not yet finalized go back to their voters, a payment that lands for it
-- afterward is marked late and refunded (confirm_vote checks the pet is
-- approved), its photo comes down, and finished rounds keep their results.
--
-- Only withdraw_entry does it, as the staff member, reason required.

alter table entries
  add column withdrawn_at      timestamptz,
  add column withdrawn_by      uuid references auth.users(id) on delete set null,
  add column withdrawal_reason text,
  add constraint withdrawal_recorded
    check (status <> 'withdrawn' or (withdrawn_at is not null and withdrawal_reason is not null));

create function withdraw_entry(p_entry_id uuid, p_reason text) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  e         entries%rowtype;
  c         contests%rowtype;
  r1        rounds%rowtype;
  v_reason  text := nullif(trim(p_reason), '');
  v_left    int;
  v_contest uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  -- Same lock order as disqualify_entry: the open round, then the pet, so a
  -- withdrawal cannot land in the middle of close_round's seeding.
  select contest_id into v_contest from entries where id = p_entry_id;
  perform 1 from rounds where contest_id = v_contest and status = 'open' for share;

  select * into strict e from entries where id = p_entry_id for update;
  select * into strict c from contests where id = e.contest_id for share;

  if e.status = 'withdrawn' then
    return;   -- already done; running it again changes nothing
  end if;
  if c.status not in ('submissions_open', 'voting') then
    raise exception 'A pet can be withdrawn while entries are open or voting is under way. Once the contest is over, its results are final.'
      using errcode = 'WP400';
  end if;
  if e.status <> 'approved' then
    raise exception 'Only an approved entry can be withdrawn. Reject a pending entry instead.' using errcode = 'WP400';
  end if;
  if v_reason is null then
    raise exception 'A reason is required. It is kept with the entry.' using errcode = 'WP400';
  end if;

  -- During the Open Round the field must still fill the bracket.
  select * into r1 from rounds where contest_id = c.id and seq = 1;
  if r1.status in ('open', 'closed') then
    select count(*) - 1 into v_left from entries where contest_id = c.id and status = 'approved';
    if v_left < c.bracket_size then
      raise exception 'Withdrawing would leave % approved entries for a %-pet bracket.', v_left, c.bracket_size
        using errcode = 'WP400';
    end if;
  end if;

  update entries
  set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawal_reason = v_reason
  where id = e.id;

  -- Free votes raise no money: in unfinished rounds they go back, so those
  -- voters may vote again that day.
  update free_votes f
  set status = 'returned', voided_at = now(), voided_by = auth.uid(), voided_reason = 'pet withdrawn'
  from rounds r
  where r.id = f.round_id and r.status <> 'resolved'
    and f.entry_id = e.id and f.status = 'counted';
end $$;

-- In a matchup, a withdrawn pet loses whatever the count, as a disqualified
-- one does. Otherwise as 0017.
create or replace function advance_bracket(p_round_id uuid) returns uuid
  language plpgsql security definer set search_path = public, pg_temp
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
    -- A pet no longer in the contest loses whatever the count.
    order by (e.status in ('disqualified', 'withdrawn')) asc, coalesce(t.votes, 0) desc, e.seed asc
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

-- A withdrawn pet's photo files are as public as a rejected one's until
-- deleted; the Moderation desk deletes them in the same step.
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
  where e.status in ('rejected', 'disqualified', 'withdrawn');

revoke execute on function withdraw_entry(uuid, text) from public, anon, authenticated;
grant execute on function withdraw_entry(uuid, text) to authenticated;
-- Replaced: restated.
revoke execute on function advance_bracket(uuid) from public, anon, authenticated;
grant select on rejected_photos_live to authenticated;
