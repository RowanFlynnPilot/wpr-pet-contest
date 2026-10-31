-- "Your links have brought 12 vote packs." An owner's own links (the posts,
-- share buttons, share images and emails on the owner's side) carry ?via=o.
-- A reader who arrives that way is remembered in that browser for a week,
-- and a pack bought for that pet in the week is tagged ref = 'owner'.
--
-- Attribution only. The tag changes nothing about the pack: not its votes,
-- its price, its multiplier, its deadline or where its money goes. No bonus
-- votes ride on it, so a referral is never a prize.
--
-- entry_referrals is counts per pet, like entry_round_totals beside it:
-- packs and votes that settled and were not refunded. Nothing about a buyer.

alter table votes add column ref text check (ref in ('owner'));

-- Signature changes (p_ref appended), so drop and recreate, then re-grant.
drop function create_pending_vote(uuid, uuid, text, text, text, boolean, boolean);
create function create_pending_vote(
  p_round_id            uuid,
  p_entry_id            uuid,
  p_pack_slug           text,
  p_buyer_email         text,
  p_payment_intent      text,
  p_newsletter_opt_in   boolean default false,
  p_plays_again_opt_in  boolean default false,
  p_ref                 text default null
) returns table (vote_id uuid, votes int, cents int, multiplier int)
  language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  q    record;
  v_id uuid;
begin
  select * into strict q from vote_quote(p_round_id, p_entry_id, p_pack_slug);

  -- An unknown tag is dropped, never refused: attribution must not stand
  -- between a buyer and a checkout.
  insert into votes (round_id, entry_id, matchup_id, quantity, amount_cents,
                     buyer_email, stripe_payment_intent_id, pack_slug,
                     bonus_multiplier, newsletter_opt_in, plays_again_opt_in, ref)
  values (p_round_id, p_entry_id, q.matchup_id, q.votes, q.cents,
          p_buyer_email, p_payment_intent, p_pack_slug,
          q.multiplier, coalesce(p_newsletter_opt_in, false), coalesce(p_plays_again_opt_in, false),
          case when p_ref = 'owner' then 'owner' end)
  returning id into v_id;

  return query select v_id, q.votes, q.cents, q.multiplier;
end $$;

create view entry_referrals as
  select v.entry_id, count(*)::int as packs, sum(v.quantity)::int as votes
  from votes v
  join entries e on e.id = v.entry_id and e.status = 'approved'
  where v.status = 'succeeded' and v.ref = 'owner'
  group by v.entry_id;


-- ------------------------------------------------------------------ access --
revoke execute on function create_pending_vote(uuid, uuid, text, text, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function create_pending_vote(uuid, uuid, text, text, text, boolean, boolean, text)
  to service_role;
grant select on entry_referrals to anon, authenticated, service_role;
