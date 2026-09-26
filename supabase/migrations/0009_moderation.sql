-- Moderation through one audited function, plus the entry fields the front
-- end collects.


alter table entries
  -- "Why is Biscuit the cutest?" Moderated along with the photo. Gives a share
  -- something to say besides the pet's name.
  add column caption text check (char_length(caption) <= 280),
  add column newsletter_opt_in boolean not null default false;

-- The public gets the caption with the rest of the pet.
grant select (caption) on entries to anon;


-- Approve or reject. Records who and when, which the moderation_recorded
-- constraint requires and a direct UPDATE could skip (moderated_by especially).
-- Returns the photo path so the caller can delete the object on rejection.
--
-- Allowed: pending -> approved | rejected, and approved -> rejected while
-- submissions are still open (a bad approval caught before the field is set).
-- Never rejected -> approved: the photo has been deleted by then.
create function moderate_entry(p_entry_id uuid, p_approve boolean, p_reason text default null)
  returns text
  language plpgsql security definer set search_path = public
as $$
declare
  e entries%rowtype;
  v_contest_status contest_status;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into strict e from entries where id = p_entry_id for update;
  select status into v_contest_status from contests where id = e.contest_id for share;

  if v_contest_status not in ('draft', 'submissions_open') then
    raise exception 'the field is set: voting has started' using errcode = 'WP400';
  end if;

  if e.status = 'rejected' then
    raise exception 'rejected entries cannot be restored; the photo is deleted' using errcode = 'WP400';
  end if;

  if e.status = 'approved' and p_approve then
    raise exception 'entry is already approved' using errcode = 'WP400';
  end if;

  if not p_approve and v_reason is null then
    raise exception 'a rejection reason is required' using errcode = 'WP400';
  end if;

  update entries
  set status           = case when p_approve then 'approved' else 'rejected' end::entry_status,
      rejection_reason = case when p_approve then null else v_reason end,
      moderated_by     = auth.uid(),
      moderated_at     = now()
  where id = e.id;

  return e.photo_path;
end $$;

-- Called with the moderator's own JWT (the edge function forwards it), never
-- the service role: auth.uid() is what lands in moderated_by.
revoke execute on function moderate_entry(uuid, boolean, text) from public, anon, authenticated;
grant execute on function moderate_entry(uuid, boolean, text) to authenticated;


-- Rejected entries whose photo is still in the public bucket. The `moderate`
-- edge function deletes the object on rejection; this is how you check that it
-- did. Must be zero rows. security_invoker keeps it admin-only through the RLS
-- on entries.
create view rejected_photos_live with (security_invoker = true) as
  select e.id as entry_id,
         e.contest_id,
         e.pet_name,
         e.photo_path,
         e.moderated_at
  from entries e
  join storage.objects o on o.bucket_id = 'pets' and o.name = e.photo_path
  where e.status = 'rejected';

grant select on rejected_photos_live to authenticated, service_role;
