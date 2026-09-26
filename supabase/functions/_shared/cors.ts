import { requireEnv } from "./env.ts";
// The site runs on GitHub Pages inside a WordPress iframe and calls Supabase on
// a different origin, so every browser-facing function needs preflight handling.
// Without this the browser never sends the real request and you get a CORS error
// with no server log to explain it.
//
// ALLOWED_ORIGIN is an exact origin, or a comma-separated list of them (the
// production site plus a staging or local one). Never "*": a wildcard would let
// any site on the internet create payment intents against the contest's Stripe
// account, so it is refused at module load.

const ORIGINS = requireEnv("ALLOWED_ORIGIN").split(",").map((o) => o.trim()).filter(Boolean);

if (ORIGINS.some((o) => o.includes("*"))) {
  throw new Error("ALLOWED_ORIGIN must list exact origins; wildcards are refused");
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    // Echo the caller only when it is on the list; otherwise name the first
    // allowed origin, which the browser will reject for anyone else.
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    // supabase-js sends authorization, apikey and x-client-info. Leaving any of
    // them off fails the preflight for the admin calls.
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
