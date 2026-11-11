-- Run with: supabase test db
--
-- The reminder sweeps can release a claim after a send that failed for a
-- reason that passes (0037), and no browser session can.

create extension if not exists pgtap with schema extensions;

begin;
select plan(2);

select ok(
  has_table_privilege('service_role', 'public.buyer_notices', 'DELETE')
  and has_table_privilege('service_role', 'public.checkout_reminders', 'DELETE')
  and has_table_privilege('service_role', 'public.free_vote_reminders', 'DELETE'),
  'the sweep can release a claim it could not send');

select ok(
  not has_table_privilege('authenticated', 'public.buyer_notices', 'DELETE')
  and not has_table_privilege('authenticated', 'public.checkout_reminders', 'DELETE')
  and not has_table_privilege('authenticated', 'public.free_vote_reminders', 'DELETE')
  and not has_table_privilege('anon', 'public.free_vote_reminders', 'DELETE'),
  'and no browser session can');

select * from finish();
rollback;
