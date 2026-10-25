// Creates a Stripe payment intent and parks a pending vote against it.
//
// Packs exist because Stripe's 2.9% + 30c takes 33% off a $1 single vote. The
// client names a pack; vote_packs in the database says what it costs. The
// client never sends a price.
//
// Order matters: vote_quote validates the vote before Stripe is touched, so a
// request for a closed round or an eliminated pet creates no payment intent.

import { service as db } from "../_shared/db.ts";
import { Stripe, stripeClient } from "../_shared/stripe.ts";
import { HttpError, readJson, serve } from "../_shared/http.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { email, slug, uuid } from "../_shared/validate.ts";
import { cheerCode, cheerName } from "../_shared/cheers.ts";

// Restricted key: PaymentIntents write.
const stripe = stripeClient("STRIPE_KEY_CHECKOUT");

type Quote = { contest_id: string; pet_name: string; votes: number; cents: number; multiplier: number };
type Parked = { votes: number; cents: number; multiplier: number };

serve(async (req) => {
  // Generous for a family on one wifi buying for several pets; tight enough to
  // blunt a card tester working from one address.
  await rateLimit(req, "checkout", 30, 600);

  const body = await readJson(req);
  const roundId = uuid(body.round_id, "Round");
  const entryId = uuid(body.entry_id, "Pet");
  const packSlug = slug(body.pack_slug, "Vote pack");
  const buyerEmail = email(body.buyer_email);
  const optIn = body.newsletter_opt_in === true;
  // "Tell me when this pet plays again": one email a round, enrolled only
  // once the webhook credits the payment.
  const playsAgain = body.plays_again_opt_in === true;
  // The buyer came through one of the owner's links in the last week (0029).
  // Attribution only: it changes nothing about the pack. Anything else is
  // ignored, never refused.
  const ref = body.ref === "owner" ? "owner" : null;
  // A cheer (0033): one of the six codes, and a first name only with one.
  // Anything else is dropped, never refused.
  const cheer = cheerCode(body.cheer);
  const cheerFrom = cheer ? cheerName(body.cheer_name) : null;
  // "Email me once if this checkout doesn't finish": opt-in only.
  const remind = body.reminder_opt_in === true;
  // One per checkout attempt, from the browser. A double-click or a retried
  // request reuses it, and Stripe hands back the same payment intent instead
  // of a second one.
  const requestId = body.request_id === undefined ? crypto.randomUUID() : uuid(body.request_id, "Request");

  const { data: quote, error: quoteError } = await db
    .rpc("vote_quote", { p_round_id: roundId, p_entry_id: entryId, p_pack_slug: packSlug })
    .single<Quote>();
  if (quoteError) throw quoteError;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: quote.cents,
      currency: "usd",
      receipt_email: buyerEmail,
      // Printed on the receipt. "Vote pack", never "donation": this purchase
      // is not tax-deductible. A clear description also heads off "I don't
      // recognize this charge" disputes.
      description: `Vote pack: ${quote.votes} votes for ${quote.pet_name}`,
      // Cards, which includes Apple Pay and Google Pay, and Link once it is on
      // under Wallets in the Stripe Dashboard: a card integration carries Link
      // as a card (wallet type "link"), and Stripe confirms every Link payment
      // immediately whatever funds it, so the deadline holds. Do not add
      // "link" here: that would make it a separate payment method type. Not
      // "automatic" either: that can switch on bank debits, which settle days
      // later, after the round has closed, and would be refunded as late.
      payment_method_types: ["card"],
      metadata: {
        kind: "vote_pack",
        contest_id: quote.contest_id,
        round_id: roundId,
        entry_id: entryId,
        pack_slug: packSlug,
      },
    }, { idempotencyKey: `checkout-${requestId}` });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeIdempotencyError) {
      // Same request id, different pack or pet. The browser should mint a new id.
      throw new HttpError(409, "Your selection changed. Please try again.");
    }
    throw err;
  }

  const { data: vote, error: parkError } = await db
    .rpc("create_pending_vote", {
      p_round_id: roundId,
      p_entry_id: entryId,
      p_pack_slug: packSlug,
      p_buyer_email: buyerEmail,
      p_payment_intent: intent.id,
      p_newsletter_opt_in: optIn,
      p_plays_again_opt_in: playsAgain,
      // Sent only when set, so a checkout still parks against a database a
      // migration behind.
      ...(ref ? { p_ref: ref } : {}),
      ...(cheer ? { p_cheer: cheer, p_cheer_name: cheerFrom } : {}),
      ...(remind ? { p_reminder_opt_in: true } : {}),
    })
    .single<Parked>();

  if (parkError) {
    // A retried request: this intent already has its pending vote.
    if (parkError.code === "23505") {
      // ...unless it was cancelled, in which case the secret is useless.
      if (intent.status === "canceled") {
        throw new HttpError(409, "That checkout expired. Please try again.");
      }
      const { data: existing, error } = await db
        .from("votes")
        .select("quantity, amount_cents, bonus_multiplier")
        .eq("stripe_payment_intent_id", intent.id)
        .single();
      if (error) throw error;
      return {
        client_secret: intent.client_secret,
        votes: existing.quantity,
        cents: existing.amount_cents,
        multiplier: existing.bonus_multiplier,
        pet_name: quote.pet_name,
      };
    }
    await stripe.paymentIntents.cancel(intent.id).catch((e) => console.error("cancel failed", intent.id, e));
    throw parkError;
  }

  // The pack's price changed between the quote and the insert. Vanishingly
  // rare, but the buyer must pay what the vote row says.
  if (vote.cents !== intent.amount) {
    await stripe.paymentIntents.cancel(intent.id).catch((e) => console.error("cancel failed", intent.id, e));
    throw new HttpError(409, "The price changed while you were checking out. Please try again.");
  }

  // A bonus window opened or closed between the quote and the insert. The vote
  // row is what counts, so the receipt must say the same number.
  if (vote.votes !== quote.votes) {
    await stripe.paymentIntents.update(intent.id, {
      description: `Vote pack: ${vote.votes} votes for ${quote.pet_name}`,
    });
  }

  return {
    client_secret: intent.client_secret,
    votes: vote.votes,
    cents: vote.cents,
    multiplier: vote.multiplier,
    pet_name: quote.pet_name,
  };
});
