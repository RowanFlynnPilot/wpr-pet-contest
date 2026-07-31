// The only place a vote becomes real.
//
// Never credit votes on the browser redirect. Redirects get abandoned, blocked,
// and double-fired; the "I paid and got no votes" complaint is the one that
// ends up on Facebook. confirm_vote is idempotent, so Stripe retries are free.

import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireEnv } from "../_shared/env.ts";

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
const db = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

Deno.serve(async (req) => {
  const event = await stripe.webhooks.constructEventAsync(
    await req.text(),
    req.headers.get("stripe-signature")!,
    requireEnv("STRIPE_WEBHOOK_SECRET"),
  );

  if (event.type === "payment_intent.succeeded") {
    const { error } = await db.rpc("confirm_vote", {
      p_payment_intent: event.data.object.id,
    });
    if (error) throw error;
  }

  if (event.type === "charge.refunded") {
    const { error } = await db.rpc("refund_vote", {
      p_payment_intent: event.data.object.payment_intent as string,
    });
    if (error) throw error;
  }

  return Response.json({ received: true });
});
