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

import Stripe from "npm:stripe@17";
import { requireAdmin, service } from "../_shared/db.ts";
import { requireEnv } from "../_shared/env.ts";
import { readJson, serve } from "../_shared/http.ts";
import { optionalText, uuid } from "../_shared/validate.ts";

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
  httpClient: Stripe.createFetchHttpClient(),
});

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

  return {
    ok: failed.length === 0,
    photo_deleted: !removeError,
    refunds_requested: refunded,
    refunds_failed: failed,
  };
});
