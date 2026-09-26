-- Explicit privileges, because the defaults cannot be trusted in either
-- direction.
--
-- 1. Current Supabase projects no longer grant SELECT/INSERT/UPDATE on new
--    public tables to anon, authenticated, or even service_role. Without the
--    grants below, the gallery cannot load, submit-entry cannot insert, and the
--    moderation queue cannot read. Row level security policies do nothing for a
--    role that has no table privilege to begin with.
--
-- 2. Postgres grants EXECUTE on every new function to PUBLIC. The
--    `revoke ... from anon` lines in 0003 removed nothing, because anon was
--    inheriting EXECUTE through PUBLIC. Every security definer function was
--    callable by any visitor through /rest/v1/rpc/*. With a checkout's
--    client_secret (which begins with the payment intent id), anyone could call
--    confirm_vote and credit votes without paying, or call advance_bracket and
--    resolve a round without being an admin.
--
-- Rule from here on: every migration that creates a table, view or function
-- grants it explicitly, and every privileged function revokes from PUBLIC.
-- The access-control tests pin the complete anon surface so a missed grant
-- fails CI instead of production.


-- --------------------------------------------------------------- functions --
revoke execute on function open_round(uuid)                                   from public, anon, authenticated;
revoke execute on function close_round(uuid, int)                             from public, anon, authenticated;
revoke execute on function seed_bracket(uuid, int)                            from public, anon, authenticated;
revoke execute on function advance_bracket(uuid)                              from public, anon, authenticated;
revoke execute on function create_pending_vote(uuid, uuid, int, int, text, text) from public, anon, authenticated;
revoke execute on function confirm_vote(text)                                 from public, anon, authenticated;
revoke execute on function refund_vote(text)                                  from public, anon, authenticated;

-- open_round and close_round check is_admin() themselves; they need to be
-- reachable by a signed-in session to get that far.
grant execute on function open_round(uuid)       to authenticated;
grant execute on function close_round(uuid, int) to authenticated;

-- The vote lifecycle belongs to the edge functions alone.
grant execute on function create_pending_vote(uuid, uuid, int, int, text, text) to service_role;
grant execute on function confirm_vote(text)  to service_role;
grant execute on function refund_vote(text)   to service_role;

-- is_admin() is evaluated inside RLS policies as the querying role, including
-- the storage delete policy. It reveals only whether the caller is an admin.
grant execute on function is_admin() to anon, authenticated, service_role;


-- ------------------------------------------------------------------ tables --
-- anon and authenticated get only what RLS then narrows. TRUNCATE, REFERENCES
-- and TRIGGER arrive by default and are never wanted: TRUNCATE in particular
-- ignores row level security entirely.
revoke all on all tables in schema public from anon, authenticated;

-- Public reads. RLS on each table still decides which rows.
grant select on contests, shelters, rounds, matchups to anon, authenticated;

-- entries is column-restricted for anon. RLS filters rows, not columns: the
-- entries_public_read policy alone would publish every approved entrant's
-- email address and full name. The public gets the pet, not the owner.
grant select (id, contest_id, pet_name, species, town, photo_path, status,
              shelter_id, seed, created_at)
  on entries to anon;

-- Signed-in sessions are invited staff (signups are disabled). Admin policies
-- gate every row. What is NOT granted is as deliberate as what is:
--   * votes: read only. Votes are credited by the webhook alone.
--   * contests.status, rounds.status: never granted. Round and contest state
--     changes only through open_submissions / open_round / close_round.
--   * entries.status and the moderation columns: only through moderate_entry,
--     which records who and when.
--   * contests.beneficiary_split_pct: fixed at insert. It is published.
grant select on entries, votes, admins to authenticated;
grant update (pet_name, species, town) on entries to authenticated;
grant update (name, submissions_open_at, submissions_close_at) on contests to authenticated;
grant update (closes_at) on rounds to authenticated;
grant insert, update, delete on shelters to authenticated;

-- The edge functions hold the service role key and are trusted.
grant select, insert, update, delete on all tables in schema public to service_role;


-- ------------------------------------------------------------------- views --
grant select on entry_round_totals to anon, authenticated, service_role;
grant select on late_confirmations to authenticated, service_role;


-- ---------------------------------------------------- future tables/views --
-- The platform's per-schema defaults hand anon and authenticated TRUNCATE,
-- REFERENCES, TRIGGER and MAINTAIN on every table created from here on. Stop
-- that at the source, and give the service role working privileges by default
-- so a new table never breaks an edge function the day it ships. Public
-- access to anything new still has to be granted explicitly, and
-- access_test.sql fails until it is.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
