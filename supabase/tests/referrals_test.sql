-- Run with: supabase test db
--
-- "Your links have brought N vote packs" (0029). A pack bought through one of
-- the owner's links is tagged ref = 'owner'. The tag is attribution only: the
-- pack's votes and price are the same as any other, an unknown tag is dropped
-- rather than refused, and the public view counts settled, unrefunded packs
-- per pet, never a buyer.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ---------------------------------------------------------------- fixtures --
insert into contests (id, year, name, beneficiary_split_pct, submissions_open_at,
                      submissions_close_at, status, bracket_size, bracket_round_hours)
values ('a9c00000-0000-0000-0000-0000000000c9', 2105, 'Referrals', 50,
        now() - interval '10 days', now() - interval '3 days', 'voting', 2, 24);
insert into entries (id, contest_id, pet_name, species, owner_name, owner_email, town,
                     photo_path, status, rights_accepted_at, moderated_at)
values ('a9a00000-0000-0000-0000-0000000000a9', 'a9c00000-0000-0000-0000-0000000000c9', 'Ace', 'dog', 'O', 'ace@example.com',
        'Wausau', 'r/ace.jpg', 'approved', now(), now()),
       ('a9b00000-0000-0000-0000-0000000000b9', 'a9c00000-0000-0000-0000-0000000000c9', 'Bea', 'cat', 'O', 'bea@example.com',
        'Wausau', 'r/bea.jpg', 'approved', now(), now());
insert into rounds (id, contest_id, seq, kind, status, opens_at, closes_at)
values ('a9100000-0000-0000-0000-000000000019', 'a9c00000-0000-0000-0000-0000000000c9',
        1, 'open', 'open', now() - interval '3 days', now() + interval '1 day');
insert into vote_packs (contest_id, slug, label, votes, cents)
values ('a9c00000-0000-0000-0000-0000000000c9', 'fan', 'Fan', 25, 2000);

-- Ace: two packs through the owner's links (one later refunded), one still
-- unpaid through a link, one plain. Bea: a tag nobody issued.
select create_pending_vote('a9100000-0000-0000-0000-000000000019', 'a9a00000-0000-0000-0000-0000000000a9', 'fan',
                           'a@example.com', 'pi_r_1', false, false, 'owner'),
       create_pending_vote('a9100000-0000-0000-0000-000000000019', 'a9a00000-0000-0000-0000-0000000000a9', 'fan',
                           'b@example.com', 'pi_r_2', false, false, 'owner'),
       create_pending_vote('a9100000-0000-0000-0000-000000000019', 'a9a00000-0000-0000-0000-0000000000a9', 'fan',
                           'c@example.com', 'pi_r_3', false, false, 'owner'),
       create_pending_vote('a9100000-0000-0000-0000-000000000019', 'a9a00000-0000-0000-0000-0000000000a9', 'fan',
                           'd@example.com', 'pi_r_4'),
       create_pending_vote('a9100000-0000-0000-0000-000000000019', 'a9b00000-0000-0000-0000-0000000000b9', 'fan',
                           'e@example.com', 'pi_r_5', false, false, 'facebook');
select confirm_vote(pi) from unnest(array['pi_r_1', 'pi_r_2', 'pi_r_4', 'pi_r_5']) pi;
select refund_vote('pi_r_2');


-- ----------------------------------------------------------------- the tag --
select is((select ref from votes where stripe_payment_intent_id = 'pi_r_1'), 'owner',
  'a pack bought through an owner link is tagged');
select is((select ref from votes where stripe_payment_intent_id = 'pi_r_4'), null,
  'a pack bought any other way is not');
select is((select ref from votes where stripe_payment_intent_id = 'pi_r_5'), null,
  'a tag nobody issued is dropped, and the checkout still parks');
select results_eq(
  $$ select quantity, amount_cents, bonus_multiplier from votes where stripe_payment_intent_id in ('pi_r_1', 'pi_r_4') $$,
  $$ values (25, 2000, 1), (25, 2000, 1) $$,
  'the tag changes nothing about the pack: same votes, same price');
select throws_ok(
  $$ update votes set ref = 'friend' where stripe_payment_intent_id = 'pi_r_4' $$,
  '23514', null,
  'the column takes only the one tag');


-- ---------------------------------------------------------------- the view --
select results_eq(
  $$ select entry_id, packs, votes from entry_referrals
     where entry_id in ('a9a00000-0000-0000-0000-0000000000a9', 'a9b00000-0000-0000-0000-0000000000b9') $$,
  $$ values ('a9a00000-0000-0000-0000-0000000000a9'::uuid, 1, 25) $$,
  'settled and unrefunded only: the unpaid, the refunded and the untagged drop out');

set local role anon;
select results_eq(
  $$ select packs from entry_referrals where entry_id = 'a9a00000-0000-0000-0000-0000000000a9' $$,
  $$ values (1) $$,
  'anyone can read the counts');
select throws_ok(
  $$ select create_pending_vote('a9100000-0000-0000-0000-000000000019', 'a9a00000-0000-0000-0000-0000000000a9', 'fan',
                                'x@example.com', 'pi_r_x', false, false, 'owner') $$,
  '42501', null,
  'anon cannot park a pack, tagged or not');
reset role;

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'entry_referrals' and column_name ilike '%email%'),
  0, 'the view names no buyer');

select * from finish();
rollback;
