// One Stripe client recipe for every function.
//
// The SDK and API version are pinned: an unpinned `npm:stripe@17` resolves to
// whatever 17.x is newest at each deploy, and without an explicit apiVersion
// the requests' version can move while the webhook endpoint keeps the one it
// was created with. Upgrade both together, between contests (the
// upgrade-stripe skill walks through it).
//
// Least privilege: each function may run on its own restricted key (Stripe
// Dashboard -> Developers -> API keys -> restricted). Where that secret is not
// set, the shared STRIPE_SECRET_KEY still works, so nothing breaks while keys
// are rolled out. docs/LAUNCH.md section 2 lists each key's permissions.

import Stripe from "npm:stripe@17.7.0";
import { optionalEnv, requireEnv } from "./env.ts";

export { Stripe };
export const STRIPE_API_VERSION = "2025-02-24.acacia";

export function stripeClient(restrictedKeyEnv: string): Stripe {
  const key = optionalEnv(restrictedKeyEnv) ?? requireEnv("STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION, httpClient: Stripe.createFetchHttpClient() });
}

// Checkouts that can never count (stale_pending_intents): cancel them at
// Stripe so nobody pays into a refund, and record it. A paid or processing
// intent belongs to the webhook and is left alone.
export async function cancelStaleIntents(
  stripe: Stripe,
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> },
  ids: string[],
): Promise<{ canceled: number; skipped: number; failed: number }> {
  const out = { canceled: 0, skipped: 0, failed: 0 };
  for (const id of ids) {
    let canceled = false;
    try {
      await stripe.paymentIntents.cancel(id, { cancellation_reason: "abandoned" }, { idempotencyKey: `cancel-${id}` });
      canceled = true;
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError && err.code === "payment_intent_unexpected_state") {
        const pi = await stripe.paymentIntents.retrieve(id).catch(() => null);
        canceled = pi?.status === "canceled";
        if (!canceled) out.skipped++;
      } else {
        console.error("cancel failed", id, err);
        out.failed++;
      }
    }
    if (canceled) {
      const { error } = await db.rpc("mark_intent_canceled", { p_payment_intent: id });
      if (error) throw error;
      out.canceled++;
    }
  }
  return out;
}
