// Cloudflare Turnstile, the bot check on free-vote code requests. Usually
// invisible to a real reader. It exists less for fake votes (those need a
// working inbox each) than to stop scripts using the site to email codes to
// strangers at scale, which would burn WPR's sending reputation.
//
// The server never sends the reader's IP address to Cloudflare (siteverify's
// remoteip is optional and omitted). Fails closed: no secret, or Cloudflare
// unreachable, means no code is sent. Paid voting is unaffected.

import { optionalEnv } from "./env.ts";

const SECRET = optionalEnv("TURNSTILE_SECRET_KEY");
// A token is only good for our widget on our pages: the same action the
// browser asked for, solved on a host the contest is served from.
const HOSTS = (optionalEnv("ALLOWED_ORIGIN") ?? "").split(",").map((o) => {
  try {
    return new URL(o.trim()).hostname;
  } catch {
    return "";
  }
}).filter(Boolean);

export const turnstileEnabled = Boolean(SECRET);

export async function verifyTurnstile(token: unknown): Promise<boolean> {
  if (!SECRET || typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: SECRET, response: token }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    if (body?.success !== true) return false;
    if (body.action && body.action !== "free-vote") return false;
    if (HOSTS.length && body.hostname && !HOSTS.includes(body.hostname)) return false;
    return true;
  } catch (err) {
    console.error("turnstile unreachable", err);
    return false;
  }
}
