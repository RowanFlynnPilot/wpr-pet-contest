// Creates a Stripe payment intent and parks a pending vote against it.
//
// Packs exist because Stripe's 2.9% + 30c takes 33% off a $1 single vote.
// The client sends a pack id, never a price. Prices live here only.

import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { requireEnv } from "../_shared/env.ts";

const PACKS = {
  small:  { votes: 5,  cents: 500 },
  medium: { votes: 25, cents: 2000 },
  large:  { votes: 75, cents: 5000 },
} as const;

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
const db = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const { pack_id, round_id, entry_id, buyer_email } = await req.json();

  const pack = PACKS[pack_id as keyof typeof PACKS];
  if (!pack) throw new Error(`unknown pack ${pack_id}`);

  const intent = await stripe.paymentIntents.create({
    amount: pack.cents,
    currency: "usd",
    receipt_email: buyer_email,
    metadata: { round_id, entry_id, votes: String(pack.votes) },
  });

  // Validates the vote is legal (round open, entry live in this round) and
  // fails loudly before the buyer ever sees a card form.
  const { error } = await db.rpc("create_pending_vote", {
    p_round_id: round_id,
    p_entry_id: entry_id,
    p_quantity: pack.votes,
    p_amount_cents: pack.cents,
    p_buyer_email: buyer_email,
    p_payment_intent: intent.id,
  });
  if (error) {
    await stripe.paymentIntents.cancel(intent.id);
    throw error;
  }

  return Response.json({ client_secret: intent.client_secret }, { headers: corsHeaders });
});
