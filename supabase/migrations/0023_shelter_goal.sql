-- An optional goal for the shelters' share, shown as a meter under the money
-- counter. Campaigns raise more as they near a goal; the meter only works if
-- the goal is honest, so once the contest is public a published goal can be
-- raised (and the raise announced) but never lowered or removed.

alter table contests
  add column shelter_goal_cents bigint check (shelter_goal_cents is null or shelter_goal_cents > 0);

create function set_shelter_goal(p_contest_id uuid, p_goal_cents bigint) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c contests%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  select * into strict c from contests where id = p_contest_id for update;
  if c.status = 'complete' then
    raise exception 'The contest is over; its goal stands as published.' using errcode = 'WP400';
  end if;
  if p_goal_cents is not null and p_goal_cents <= 0 then
    raise exception 'A goal must be more than $0.' using errcode = 'WP400';
  end if;
  if c.status <> 'draft' and c.shelter_goal_cents is not null
     and (p_goal_cents is null or p_goal_cents < c.shelter_goal_cents) then
    raise exception 'Readers have seen the goal, so it can only be raised. Announce the new goal when you do.'
      using errcode = 'WP400';
  end if;
  update contests set shelter_goal_cents = p_goal_cents where id = c.id;
end $$;

revoke execute on function set_shelter_goal(uuid, bigint) from public, anon, authenticated;
grant execute on function set_shelter_goal(uuid, bigint) to authenticated;
