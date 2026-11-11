-- Retrying a reminder email that failed for a reason that passes.
--
-- The reminder sweeps (buyer notes, checkout reminders, free-vote reminders)
-- claim each send with a row before sending, so overlapping sweeps send once.
-- When Resend fails for a reason that passes (a timeout, rate limiting, a key
-- or sending domain staff can fix), the sweep now deletes its claim so the
-- next sweep offers the email again, and Resend's idempotency key keeps the
-- retry from sending twice. buyer_notices and checkout_reminders already let
-- the sweep delete; free_vote_reminders did not.

grant delete on free_vote_reminders to service_role;
