-- Round advancement and the vote lifecycle.
--
-- Everything here runs in one transaction per call. A half-created bracket is
-- not a state this system can reach.


-- Standard bracket ordering: seeds paired so 1 and 2 can only meet in the final.
-- Built by repeated expansion, so it is correct for any power-of-two field.
--   4  -> {1,4, 2,3}
--   8  -> {1,8, 4,5, 2,7, 3,6}
--   16 -> {1,16, 8,9, 4,13, 5,12, 2,15, 7,10, 3,14, 6,11}
create function bracket_seed_order(field_size int) returns int[]
  language plpgsql immutable
as $$
declare
  cur int[] := array[1, 2];
  nxt int[];
  n   int := 2;
  s   int;
begin
  if field_size < 2 or (field_size & (field_size - 1)) <> 0 then
    raise exception 'field_size must be a power of two >= 2, got %', field_size;
  end if;

  while n < field_size loop
    n := n * 2;
    nxt := array[]::int[];
    foreach s in array cur loop
      nxt := nxt || s || (n + 1 - s);
    end loop;
    cur := nxt;
  end loop;

  return cur;
end $$;


-- Rank the open field, seed the top `field_size`, build round 2.
-- Ties break on earliest submission: deterministic, and it rewards entering early.
create function seed_bracket(p_round_id uuid, p_field_size int) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_contest_id uuid;
  v_qualified  int;
  v_order      int[];
  v_next_id    uuid;
  i            int;
begin
  select contest_id into strict v_contest_id from rounds where id = p_round_id;

  with ranked as (
    select e.id,
           row_number() over (
             order by coalesce(t.votes, 0) desc, e.created_at asc
           ) as rank
    from entries e
    left join entry_round_totals t
      on t.entry_id = e.id and t.round_id = p_round_id
    where e.contest_id = v_contest_id and e.status = 'approved'
  )
  update entries e
  set seed = ranked.rank
  from ranked
  where e.id = ranked.id and ranked.rank <= p_field_size;

  get diagnostics v_qualified = row_count;
  if v_qualified <> p_field_size then
    raise exception 'need % approved entries to seed the bracket, have %',
      p_field_size, v_qualified;
  end if;

  insert into rounds (contest_id, seq, kind, status, opens_at, closes_at)
  select v_contest_id, seq + 1, 'bracket', 'pending', closes_at, closes_at + interval '2 days'
  from rounds where id = p_round_id
  returning id into v_next_id;

  v_order := bracket_seed_order(p_field_size);

  for i in 1 .. p_field_size / 2 loop
    insert into matchups (round_id, slot, entry_a_id, entry_b_id) values (
      v_next_id,
      i - 1,
      (select id from entries where contest_id = v_contest_id and seed = v_order[i * 2 - 1]),
      (select id from entries where contest_id = v_contest_id and seed = v_order[i * 2])
    );
  end loop;

  return v_next_id;
end $$;


-- Resolve every matchup in a bracket round, then build the next one.
-- Ties break on better (lower) seed, which traces back to round 1 performance.
create function advance_bracket(p_round_id uuid) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_contest_id uuid;
  v_seq        int;
  v_remaining  int;
  v_next_id    uuid;
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
    order by coalesce(t.votes, 0) desc, e.seed asc
    limit 1
  )
  where m.round_id = p_round_id;

  select count(*) into v_remaining from matchups where round_id = p_round_id;

  if v_remaining = 1 then
    update contests set status = 'complete' where id = v_contest_id;
    return null;
  end if;

  insert into rounds (contest_id, seq, kind, status, opens_at, closes_at)
  select v_contest_id, v_seq + 1, 'bracket', 'pending', closes_at, closes_at + interval '2 days'
  from rounds where id = p_round_id
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


-- The pair to close_round, and the reason submissions cannot stay open during
-- voting. Nothing else in the system moves a contest from 'submissions_open' to
-- 'voting'; leaving that to a human running an UPDATE by hand means that one
-- year, someone enters a pet after the field has already been seeded.
create function open_round(p_round_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  r rounds%rowtype;
  c contests%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict r from rounds where id = p_round_id for update;

  if r.status <> 'pending' then
    raise exception 'round % is %, expected pending', r.seq, r.status;
  end if;

  select * into strict c from contests where id = r.contest_id for update;

  if r.kind = 'open' then
    if c.status <> 'submissions_open' then
      raise exception 'contest is %, expected submissions_open', c.status;
    end if;
    -- Opening round 1 IS closing submissions. One action, not two.
    update contests set status = 'voting' where id = c.id;
  elsif c.status <> 'voting' then
    raise exception 'contest is %, expected voting', c.status;
  end if;

  update rounds set status = 'open' where id = r.id;
end $$;


-- The one button in the admin UI. Run it by hand, not on a cron: you want a
-- human confirming a round is really over before results become irreversible.
create function close_round(p_round_id uuid, p_field_size int default 16) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  r        rounds%rowtype;
  v_next_id uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict r from rounds where id = p_round_id for update;

  if r.status <> 'open' then
    raise exception 'round % is %, expected open', r.seq, r.status;
  end if;

  update rounds set status = 'closed' where id = r.id;

  if r.kind = 'open' then
    v_next_id := seed_bracket(r.id, p_field_size);
  else
    v_next_id := advance_bracket(r.id);
  end if;

  update rounds set status = 'resolved', resolved_at = now() where id = r.id;

  return v_next_id;
end $$;


-- Called by the checkout edge function before handing Stripe the payment intent.
-- Validates that this vote is even legal, then parks it as pending.
create function create_pending_vote(
  p_round_id       uuid,
  p_entry_id       uuid,
  p_quantity       int,
  p_amount_cents   int,
  p_buyer_email    text,
  p_payment_intent text
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  r            rounds%rowtype;
  v_matchup_id uuid;
  v_id         uuid;
begin
  select * into strict r from rounds where id = p_round_id;

  if r.status <> 'open' or now() not between r.opens_at and r.closes_at then
    raise exception 'round % is not accepting votes', r.seq;
  end if;

  if r.kind = 'bracket' then
    select id into v_matchup_id
    from matchups
    where round_id = r.id and p_entry_id in (entry_a_id, entry_b_id);
    if v_matchup_id is null then
      raise exception 'entry % is not in a matchup in round % (eliminated, or wrong round)',
        p_entry_id, r.seq;
    end if;
  else
    perform 1 from entries
    where id = p_entry_id and contest_id = r.contest_id and status = 'approved';
    if not found then
      raise exception 'entry % is not an approved entry in this contest', p_entry_id;
    end if;
  end if;

  insert into votes (round_id, entry_id, matchup_id, quantity,
                     amount_cents, buyer_email, stripe_payment_intent_id)
  values (p_round_id, p_entry_id, v_matchup_id, p_quantity,
          p_amount_cents, p_buyer_email, p_payment_intent)
  returning id into v_id;

  return v_id;
end $$;


-- Webhook: payment_intent.succeeded. Idempotent by construction — a retry
-- matches zero pending rows and does nothing.
create function confirm_vote(p_payment_intent text) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  perform 1 from votes where stripe_payment_intent_id = p_payment_intent;
  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;

  update votes set status = 'succeeded', confirmed_at = now()
  where stripe_payment_intent_id = p_payment_intent and status = 'pending';
end $$;


-- Webhook: charge.refunded. Refunded votes drop out of entry_round_totals.
create function refund_vote(p_payment_intent text) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  update votes set status = 'refunded'
  where stripe_payment_intent_id = p_payment_intent;

  if not found then
    raise exception 'no vote for payment intent %', p_payment_intent;
  end if;
end $$;


revoke execute on function open_round(uuid) from anon;
revoke execute on function close_round(uuid, int) from anon;
revoke execute on function seed_bracket(uuid, int) from anon, authenticated;
revoke execute on function advance_bracket(uuid) from anon, authenticated;
revoke execute on function create_pending_vote(uuid, uuid, int, int, text, text) from anon, authenticated;
revoke execute on function confirm_vote(text) from anon, authenticated;
revoke execute on function refund_vote(text) from anon, authenticated;
