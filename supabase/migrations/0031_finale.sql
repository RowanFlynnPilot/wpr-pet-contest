-- The finale: a live reveal of the champion (a Facebook Live, say, the
-- evening the final closes). Staff set when it starts and where to watch;
-- the site shows a countdown and a "watch live" link, then a replay link.
--
-- Presentation only. The finale never holds a result back: the final count
-- is public as voting closes, and close_round, run by a person (on the
-- stream, ideally), is what makes the champion official. The settings live
-- on the contest because every page already reads it.

alter table contests
  add column finale_at  timestamptz,
  add column finale_url text check (finale_url ~ '^https://');

-- Either may be cleared (null). A link must be https, and a time must not be
-- set for a contest already erased.
create function set_contest_finale(p_contest_id uuid, p_at timestamptz, p_url text) returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c     contests%rowtype;
  v_url text := nullif(trim(p_url), '');
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  select * into strict c from contests where id = p_contest_id for update;
  if v_url is not null and v_url !~ '^https://' then
    raise exception 'The link has to start with https://.' using errcode = 'WP400';
  end if;
  if c.personal_data_erased_at is not null then
    raise exception 'This contest is archived.' using errcode = 'WP400';
  end if;
  update contests set finale_at = p_at, finale_url = v_url where id = c.id;
end $$;

revoke execute on function set_contest_finale(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function set_contest_finale(uuid, timestamptz, text) to authenticated;
