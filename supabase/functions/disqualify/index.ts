// Disqualify an entry after voting has started, as the signed-in moderator.
//
// The database records the decision (disqualify_entry, audited as the person
// doing it) and returns every payment for the pet still to refund. This
// function then deletes the pet's photo files and asks Stripe for each
// refund. charge.refunded follows for each, and the webhook flips the vote to
// 'refunded' as usual.
//
// Safe to run again on the same pet: it retries only what is still standing.
// The Health tab (and the alert schedule) flags any refund still outstanding
// after fifteen minutes.

import { requireAdmin, service } from "../_shared/db.ts";
import { readJson, serve } from "../_shared/http.ts";
import { cancelStaleIntents, Stripe, stripeClient } from "../_shared/stripe.ts";
import { optionalText, uuid } from "../_shared/validate.ts";

// Restricted key: Refunds write, PaymentIntents write (to cancel unpaid checkouts).
const stripe = stripeClient("STRIPE_KEY_DISQUALIFY");

serve(async (req) => {
  const staff = await requireAdmin(req);
  const body = await readJson(req);
  const entryId = uuid(body.entry_id, "Entry");

  const { data, error } = await staff.rpc("disqualify_entry", {
    p_entry_id: entryId,
    p_reason: optionalText(body.reason, "Reason", 200),
  });
  if (error) throw error;
  const intents = ((data ?? []) as { payment_intent: string }[]).map((r) => r.payment_intent);

  // Off the public site now, whatever happens with the refunds.
  const { data: files, error: readError } = await service
    .from("entries").select("photo_path, thumb_path").eq("id", entryId).single();
  if (readError) throw readError;
  const paths = [files.photo_path, files.thumb_path].filter(Boolean) as string[];
  const { error: removeError } = await service.storage.from("pets").remove(paths);
  if (removeError) console.error("photo delete failed", entryId, paths, removeError);

  let refunded = 0;
  const failed: { payment_intent: string; error: string }[] = [];
  for (const intent of intents) {
    try {
      await stripe.refunds.create(
        { payment_intent: intent, metadata: { reason: "disqualified", entry_id: entryId } },
        { idempotencyKey: `dq-refund-${intent}` },
      );
      refunded++;
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError && err.code === "charge_already_refunded") {
        refunded++;
        continue;
      }
      console.error("refund failed", intent, err);
      failed.push({ payment_intent: intent, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Checkouts for the pet still open can never count now: close them, so no
  // one pays into a refund.
  const { data: stale, error: staleError } = await service.rpc("stale_pending_intents", { p_limit: 200, p_entry_id: entryId });
  if (staleError) throw staleError;
  const cancels = await cancelStaleIntents(stripe, service, ((stale ?? []) as { payment_intent: string }[]).map((r) => r.payment_intent));

  return {
    ok: failed.length === 0,
    photo_deleted: !removeError,
    refunds_requested: refunded,
    refunds_failed: failed,
    checkouts_canceled: cancels.canceled,
  };
});
