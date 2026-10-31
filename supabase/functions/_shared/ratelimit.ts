// A per-client ceiling, counted in Postgres (hit_rate_limit). Blunts a burst
// from one address: card testers hammering checkout, or a script filling the
// moderation queue. Stripe Radar remains the real defense against card testing.
//
// The client address is hashed before it is stored. Fails open: if the limiter
// itself breaks, buyers must not be locked out of paying.
//
// `failClosed` is for the free vote, where a reader asked to retry loses
// nothing: no address means one shared bucket, and a broken limiter refuses.

import { service } from "./db.ts";
import { HttpError } from "./http_error.ts";

export async function rateLimit(
  req: Request,
  name: string,
  limit: number,
  windowSeconds: number,
  { failClosed = false }: { failClosed?: boolean } = {},
) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (failClosed ? "shared" : "");
  if (!ip) return;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${name}:${ip}`));
  const bucket = `${name}:${[...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  const { data, error } = await service.rpc("hit_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window: `${windowSeconds} seconds`,
  });
  if (error) {
    console.error("rate limiter unavailable", error);
    if (failClosed) throw new HttpError(503, "Free voting is busy. Please try again in a few minutes.");
    return;
  }
  if (data === false) {
    throw new HttpError(429, "Too many attempts from this connection. Please wait a few minutes and try again.");
  }
}
