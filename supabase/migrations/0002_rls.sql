-- Access model, in one sentence: anon reads approved public data and writes
-- nothing. Every write path goes through an edge function holding the service
-- role key, or through an admin session.

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create function is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;


alter table contests enable row level security;
alter table shelters enable row level security;
alter table entries  enable row level security;
alter table rounds   enable row level security;
alter table matchups enable row level security;
alter table votes    enable row level security;
alter table admins   enable row level security;


create policy contests_public_read on contests
  for select to anon, authenticated using (status <> 'draft');

create policy shelters_public_read on shelters
  for select to anon, authenticated using (true);

create policy entries_public_read on entries
  for select to anon, authenticated using (status = 'approved');

create policy rounds_public_read on rounds
  for select to anon, authenticated using (true);

create policy matchups_public_read on matchups
  for select to anon, authenticated using (true);


-- `votes` gets no anon policy at all. Buyer emails live there.
create policy votes_admin on votes
  for all to authenticated using (is_admin()) with check (is_admin());

create policy contests_admin on contests
  for all to authenticated using (is_admin()) with check (is_admin());

create policy shelters_admin on shelters
  for all to authenticated using (is_admin()) with check (is_admin());

create policy entries_admin on entries
  for all to authenticated using (is_admin()) with check (is_admin());

create policy rounds_admin on rounds
  for all to authenticated using (is_admin()) with check (is_admin());

create policy matchups_admin on matchups
  for all to authenticated using (is_admin()) with check (is_admin());

create policy admins_self_read on admins
  for select to authenticated using (user_id = auth.uid());


grant select on entry_round_totals to anon, authenticated;

-- security_invoker on this view means RLS on `votes` still applies, so the
-- grant below resolves to admins only. Without security_invoker this one line
-- would expose every buyer email to any authenticated session.
grant select on late_confirmations to authenticated;
