// The only place a vote becomes real.
//
// Never credit votes on the browser redirect. Redirects get abandoned, blocked,
// and double-fired; the "I paid and got no votes" complaint is the one that
// ends up on Facebook. confirm_vote is idempotent, so Stripe retries are free.
//
// Status codes are for Stripe: 400 means "this request is bad, do not retry"
// (a missing or forged signature); 500 means "retry later", which Stripe does
// for up to three days. Only a real failure on our side may return 500.

import { service as db } from "../_shared/db.ts";
import { requireEnv } from "../_shared/env.ts";
import { Stripe, stripeClient } from "../_shared/stripe.ts";

// Restricted key: Refunds write (for late payments).
const stripe = stripeClient("STRIPE_KEY_WEBHOOK");
const WEBHOOK_SECRET = requireEnv("STRIPE_WEBHOOK_SECRET");
const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Raised by the vote functions when a payment intent has no vote row.
const NO_VOTE = "no vote for payment intent";

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing stripe-signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        // event.created is when Stripe recorded the success, signed. That, not
        // when this request happens to arrive, decides whether the payment
        // beat the deadline.
        await succeeded(event.data.object, new Date(event.created * 1000));
        break;
      case "charge.refunded":
        await refunded(event.data.object);
        break;
      case "charge.dispute.created":
        await disputed(event.data.object);
        break;
      case "charge.dispute.closed":
        // Won: the money stayed, so the votes count again and the shelters'
        // share includes the pack. Lost: it stays disputed.
        if (event.data.object.status === "won") await disputeWon(event.data.object);
        break;
    }
  } catch (err) {
    console.error(event.type, event.id, err);
    return new Response("handler failed; Stripe will retry", { status: 500 });
  }

  return Response.json({ received: true });
});


async function succeeded(intent: Stripe.PaymentIntent, paidAt: Date) {
  // The contest account should only ever see vote packs, but a charge made by
  // hand in the dashboard has no vote row and must not be retried forever.
  if (intent.metadata?.kind !== "vote_pack" && !intent.metadata?.round_id) return;

  const { data: outcome, error } = await db.rpc("confirm_vote", {
    p_payment_intent: intent.id,
    p_paid_at: paidAt.toISOString(),
  });
  if (error) throw error;

  // Paid after the deadline, or after the round was resolved: the votes do not
  // count, so the money goes back. charge.refunded follows and flips the row to
  // 'refunded', which takes it off late_confirmations.
  //
  // confirm_vote keeps answering 'late' until the refund lands, so if this
  // throws, Stripe's redelivery tries again.
  if (outcome === "late") await refundLate(intent.id);
}

async function refundLate(intentId: string) {
  const existing = await stripe.refunds.list({ payment_intent: intentId, limit: 10 });
  if (existing.data.some((r) => r.status === "succeeded" || r.status === "pending")) return;

  try {
    await stripe.refunds.create(
      { payment_intent: intentId, metadata: { reason: "late_confirmation" } },
      { idempotencyKey: `late-refund-${intentId}` },
    );
    console.warn("late payment refunded", intentId);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.code === "charge_already_refunded") return;
    throw err;
  }
}

async function refunded(charge: Stripe.Charge) {
  if (typeof charge.payment_intent !== "string") return;

  // A partial refund is a goodwill gesture, not a reversal: the votes stand,
  // but the money is recorded so the shelters' share is computed on what was
  // actually kept. Refund in full to take the votes away.
  if (!charge.refunded) {
    await ignoringForeign(db.rpc("record_partial_refund", {
      p_payment_intent: charge.payment_intent,
      p_refunded_cents: charge.amount_refunded,
    }));
    return;
  }
  await ignoringForeign(db.rpc("refund_vote", { p_payment_intent: charge.payment_intent }));
}

async function disputed(dispute: Stripe.Dispute) {
  const intent = typeof dispute.payment_intent === "string"
    ? dispute.payment_intent
    : dispute.payment_intent?.id;
  if (!intent) return;
  await ignoringForeign(db.rpc("mark_vote_disputed", { p_payment_intent: intent }));
}

async function disputeWon(dispute: Stripe.Dispute) {
  const intent = typeof dispute.payment_intent === "string"
    ? dispute.payment_intent
    : dispute.payment_intent?.id;
  if (!intent) return;
  await ignoringForeign(db.rpc("mark_dispute_won", { p_payment_intent: intent }));
}

// Refunds and disputes on charges that were never vote packs are not ours.
async function ignoringForeign(call: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await call;
  if (error && !error.message.startsWith(NO_VOTE)) throw error;
}
