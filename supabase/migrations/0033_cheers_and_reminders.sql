-- Two checkout additions.
--
-- Cheers. A buyer may add a cheer to a vote pack: one of six the site offers
-- ("Go Biscuit!"), stored as a code, never free text, so there is nothing to
-- moderate but an optional first name. A cheer shows only once its payment
-- succeeds (entry_cheers, and recent_activity for the live feed), carries
-- the name the buyer chose to show, and staff can hide one (hide_cheer).
-- The name is erased with the buyer's address a year after the contest.
--
-- Checkout reminders. A buyer may tick "email me once if this checkout
-- doesn't finish". An hour after a checkout that never completed, the sweep
-- sends one reminder (checkout_reminder_queue), at most one per address per
-- round (checkout_reminders), never once the pet's deadline is less than 15
-- minutes away, and not if the address has since bought for that pet in that
-- round. Opt-in only; the reminder says it is the only one.

alter table votes
  add column cheer           text check (cheer in ('go', 'paws', 'cutest', 'shelters', 'champion', 'love')),
  add column cheer_name      text check (char_length(cheer_name) between 1 and 20 and cheer_name !~ '[0-9@:/<>]'),
  add column cheer_hidden_at timestamptz,
  add column cheer_hidden_by uuid references auth.users(id) on delete set null,
  add column reminder_opt_in boolean not null default false,
  add constraint votes_cheer_name_needs_cheer check (cheer_name is null or cheer is not null);

-- Signature changes (three parameters appended): drop, recreate, re-grant.
drop function create_pending_vote(uuid, uuid, text, text, text, boolean, boolean, text);
create function create_pending_vote(
  p_round_id            uuid,
  p_entry_id            uuid,
  p_pack_slug           text,
  p_buyer_email         text,
  p_payment_intent      text,
  p_newsletter_opt_in   boolean default false,
  p_plays_again_opt_in  boolean default false,
  p_ref                 text default null,
  p_cheer               text default null,
  p_cheer_name          text default null,
  p_reminder_opt_in     boolean default false
) returns table (vote_id uuid, votes int, cents int, multiplier int)
  language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  q       record;
  v_id    uuid;
  v_cheer text := case when p_cheer in ('go', 'paws', 'cutest', 'shelters', 'champion', 'love') then p_cheer end;
  v_name  text := nullif(trim(p_cheer_name), '');
begin
  -- A cheer the site never offered, or a name that is not a first name, is
  -- dropped, never refused: neither may stand between a buyer and a
  -- checkout. The edge function checks the name more strictly first.
  if v_cheer is null or char_length(v_name) > 20 or v_name ~ '[0-9@:/<>]' then
    v_name := null;
  end if;

  select * into strict q from vote_quote(p_round_id, p_entry_id, p_pack_slug);

  -- An unknown tag is dropped, never refused: attribution must not stand
  -- between a buyer and a checkout.
  insert into votes (round_id, entry_id, matchup_id, quantity, amount_cents,
                     buyer_email, stripe_payment_intent_id, pack_slug,
                     bonus_multiplier, newsletter_opt_in, plays_again_opt_in, ref,
                     cheer, cheer_name, reminder_opt_in)
  values (p_round_id, p_entry_id, q.matchup_id, q.votes, q.cents,
          p_buyer_email, p_payment_intent, p_pack_slug,
          q.multiplier, coalesce(p_newsletter_opt_in, false), coalesce(p_plays_again_opt_in, false),
          case when p_ref = 'owner' then 'owner' end,
          v_cheer, v_name, coalesce(p_reminder_opt_in, false))
  returning id into v_id;

  return query select v_id, q.votes, q.cents, q.multiplier;
end $$;

-- The cheers, for the pet page: paid, not hidden, on a pet still in the
-- contest. A first name only when the buyer gave one. Never an address.
create view entry_cheers as
  select v.id as cheer_id, v.round_id, v.entry_id, v.cheer, v.cheer_name, v.quantity as votes, v.confirmed_at
  from votes v
  join entries e on e.id = v.entry_id and e.status = 'approved'
  where v.status = 'succeeded' and v.cheer is not null and v.cheer_hidden_at is null;

-- The live feed carries the cheer too (columns appended; a hidden one shows
-- as a plain purchase).
create or replace view recent_activity as
  select v.round_id,
         v.entry_id,
         v.quantity         as votes,
         v.bonus_multiplier,
         v.confirmed_at,
         case when v.cheer_hidden_at is null then v.cheer end      as cheer,
         case when v.cheer_hidden_at is null then v.cheer_name end as cheer_name
  from votes v
  where v.status = 'succeeded';

-- Staff hide a cheer (a name that should not be public, say). Logged on the
-- row: when and by whom.
create function hide_cheer(p_vote_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  update votes set cheer_hidden_at = now(), cheer_hidden_by = auth.uid()
  where id = p_vote_id and cheer is not null and cheer_hidden_at is null;
end $$;


-- ------------------------------------------------------ checkout reminders --
create table checkout_reminders (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null,
  round_id    uuid not null references rounds(id) on delete cascade,
  vote_id     uuid not null references votes(id) on delete cascade,
  status      text not null check (status in ('pending', 'sent', 'failed')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now(),
  unique (email, round_id)
);
alter table checkout_reminders enable row level security;
create policy checkout_reminders_admin_read on checkout_reminders for select to authenticated using ((select is_admin()));

-- Who is owed a reminder: the latest unfinished, opted-in checkout per
-- address per round, an hour old (and under a day), while the pet can still
-- be voted for with at least 15 minutes to spare.
create function checkout_reminder_queue(p_limit int default 50)
  returns table (vote_id uuid, email citext, round_id uuid, entry_id uuid, pet_name text, contest_name text,
                 round_name text, closes_at timestamptz, votes int, cents int, pack_slug text)
  language sql stable security definer set search_path = public, pg_temp
as $$
  select * from (
    select distinct on (v.buyer_email, v.round_id)
           v.id, v.buyer_email, v.round_id, v.entry_id, e.pet_name, c.name,
           round_label(r.seq, c.bracket_size), round_deadline(r, v.entry_id),
           v.quantity, v.amount_cents, v.pack_slug
    from votes v
    join rounds r   on r.id = v.round_id and r.status = 'open'
    join contests c on c.id = r.contest_id and c.status = 'voting'
    join entries e  on e.id = v.entry_id and e.status = 'approved'
    where v.status = 'pending' and v.canceled_at is null and v.reminder_opt_in
      and v.buyer_email <> 'erased@invalid'
      and v.created_at < now() - interval '1 hour'
      and v.created_at > now() - interval '24 hours'
      and round_deadline(r, v.entry_id) > now() + interval '15 minutes'
      and not exists (select 1 from votes s
                      where s.round_id = v.round_id and s.entry_id = v.entry_id
                        and s.buyer_email = v.buyer_email and s.id <> v.id
                        and s.status <> 'pending' and s.created_at >= v.created_at)
      and not exists (select 1 from checkout_reminders cr
                      where cr.email = v.buyer_email and cr.round_id = v.round_id)
    order by v.buyer_email, v.round_id, v.created_at desc
  ) owed
  limit p_limit
$$;


-- ------------------------------------------------------------ erasure --
create or replace function erase_personal_data(p_contest_id uuid)
  returns table (entries int, votes int, notifications int, free_voters int)
  language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  c        contests%rowtype;
  v_ended  timestamptz;
  v_e      int;
  v_v      int;
  v_n      int;
  v_f      int;
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
  set owner_name = 'Erased', owner_email = 'erased@invalid', newsletter_opt_in = false,
      owner_token = gen_random_uuid(), nurture_opt_out_at = coalesce(nurture_opt_out_at, now())
  where e.contest_id = c.id and e.owner_email <> 'erased@invalid';
  get diagnostics v_e = row_count;

  -- A cheer's first name goes with the address; the cheer itself stays, as
  -- anonymous as the pack it rode on.
  update votes v
  set buyer_email = 'erased@invalid', newsletter_opt_in = false, plays_again_opt_in = false,
      cheer_name = null, reminder_opt_in = false
  from rounds r
  where r.id = v.round_id and r.contest_id = c.id
    and (v.buyer_email <> 'erased@invalid' or v.cheer_name is not null);
  get diagnostics v_v = row_count;

  update notifications n
  set to_email = 'erased@invalid'
  from entries e
  where e.id = n.entry_id and e.contest_id = c.id and n.to_email <> 'erased@invalid';
  get diagnostics v_n = row_count;

  delete from buyer_notices bn using rounds r where r.id = bn.round_id and r.contest_id = c.id;
  delete from checkout_reminders cr using rounds r where r.id = cr.round_id and r.contest_id = c.id;

  delete from free_voter_devices d using free_voters fv where fv.id = d.voter_id and fv.contest_id = c.id;
  delete from free_vote_challenges ch using free_voters fv where fv.id = ch.voter_id and fv.contest_id = c.id;
  delete from free_vote_reminders rm using free_voters fv where fv.id = rm.voter_id and fv.contest_id = c.id;
  update free_votes f set ip_hash = null from rounds r
  where r.id = f.round_id and r.contest_id = c.id and f.ip_hash is not null;
  update free_voters fv
  set email = 'erased@invalid', email_key = 'erased:' || fv.id,
      newsletter_opt_in = false, reminders_opt_in = false
  where fv.contest_id = c.id and fv.email <> 'erased@invalid';
  get diagnostics v_f = row_count;

  update contests set personal_data_erased_at = now() where id = c.id;

  return query select v_e, v_v, v_n, v_f;
end $$;


-- ------------------------------------------------------------------ access --
revoke execute on function create_pending_vote(uuid, uuid, text, text, text, boolean, boolean, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function create_pending_vote(uuid, uuid, text, text, text, boolean, boolean, text, text, text, boolean)
  to service_role;
grant select on entry_cheers to anon, authenticated, service_role;
grant select on recent_activity to anon, authenticated, service_role;
revoke execute on function hide_cheer(uuid) from public, anon, authenticated;
grant execute on function hide_cheer(uuid) to authenticated;
grant select on checkout_reminders to authenticated;
grant select, insert, update, delete on checkout_reminders to service_role;
revoke execute on function checkout_reminder_queue(int) from public, anon, authenticated;
grant execute on function checkout_reminder_queue(int) to service_role;
-- Replaced: restated.
revoke execute on function erase_personal_data(uuid) from public, anon, authenticated;
grant execute on function erase_personal_data(uuid) to authenticated;
