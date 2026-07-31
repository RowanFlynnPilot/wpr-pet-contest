import { requireEnv } from "./env.ts";
// The site runs on GitHub Pages inside a WordPress iframe and calls Supabase on
// a different origin, so every browser-facing function needs preflight handling.
// Without this the browser never sends the real request and you get a CORS error
// with no server log to explain it.
//
// ALLOWED_ORIGIN is set explicitly, never "*". A wildcard would let any site on
// the internet create payment intents against the contest's Stripe account.

const ORIGIN = requireEnv("ALLOWED_ORIGIN");

export const corsHeaders = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { headers: corsHeaders });
}
