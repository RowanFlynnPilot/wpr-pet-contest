// The free daily vote. One anonymous function, several actions; each checks
// its own limits and leaves every rule to the database (0019), which is the
// only place a free vote is written.
//
//   request      email + pet  -> a six-digit code and a fallback link by email
//   verify       code, emailed link or reminder link -> proves the address,
//                casts the vote the code holds, remembers this browser
//   cast         remembered browser -> today's vote, no email
//   status       remembered browser -> whose it is, and whether today's is spent
//   preferences  remembered browser -> reminder and newsletter opt-ins
//   unsubscribe  reminder link -> reminders off (also one-click, RFC 8058)
//
// Off until FREE_VOTE_HASH_KEY, TURNSTILE_SECRET_KEY and email are configured
// and the contest has free voting turned on. Until then every action answers
// with a reader message, never a 500.

import { service as db } from "../_shared/db.ts";
import { emailEnabled, sendEmail } from "../_shared/email.ts";
import { optionalEnv } from "../_shared/env.ts";
import {
  bytea,
  cleanCode,
  cleanToken,
  clientIp,
  codeHash,
  connectionHash,
  isDisposable,
  newCode,
  newToken,
  normalizeEmail,
  sha256,
} from "../_shared/freevote.ts";
import { badRequest, HttpError, readJson, serve } from "../_shared/http.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { renderFreeVoteCode } from "../_shared/templates.ts";
import { turnstileEnabled, verifyTurnstile } from "../_shared/turnstile.ts";
import { oneOf, uuid } from "../_shared/validate.ts";

const HASH_KEY = optionalEnv("FREE_VOTE_HASH_KEY");
const PUBLIC_URL = optionalEnv("PUBLIC_URL") ?? "https://wausaupilotandreview.com/";
const CODE_MINUTES = 15;
const UNAVAILABLE = "Free voting isn't available right now. Vote packs are still open.";

const ACTIONS = ["request", "verify", "cast", "status", "preferences", "unsubscribe"] as const;

serve(async (req) => {
  // One-click unsubscribe from a mail client: a form POST to the link in the
  // List-Unsubscribe header, carrying the token in the query string.
  const oneClick = new URL(req.url).searchParams.get("unsubscribe");
  if (oneClick !== null) {
    // Mailbox providers send these from shared servers, so the per-connection
    // ceiling is high and fails open: the token is 256 bits, nothing to guess.
    await rateLimit(req, "free-unsub-oneclick", 5000, 3600);
    return await unsubscribe(oneClick);
  }

  if (!HASH_KEY) throw new HttpError(503, UNAVAILABLE);
  const body = await readJson(req);
  const action = oneOf(body.action, ACTIONS, "Action");
  const ip = await connectionHash(HASH_KEY, clientIp(req));

  switch (action) {
    case "request":
      return await request(req, body, ip);
    case "verify":
      return await verify(req, body, ip);
    case "cast":
      return await cast(req, body, ip);
    case "status":
      return await status(req, body);
    case "preferences":
      return await preferences(req, body);
    case "unsubscribe":
      await rateLimit(req, "free-unsub", 60, 3600, { failClosed: true });
      return await unsubscribe(body.token);
  }
});

async function request(req: Request, body: Record<string, unknown>, ip: string | null) {
  // Loose per connection: carrier networks put many phones behind one address.
  await rateLimit(req, "free-request", 20, 3600, { failClosed: true });

  const roundId = uuid(body.round_id, "Round");
  const entryId = uuid(body.entry_id, "Pet");
  const address = normalizeEmail(body.email);
  if (!address) throw badRequest("Please enter a valid email address.");
  if (!emailEnabled || !turnstileEnabled) throw new HttpError(503, UNAVAILABLE);
  if (isDisposable(address)) throw badRequest("Please use a personal email address.");

  // A bot filled the hidden field. Answer as the real path would; send nothing.
  if (typeof body.website === "string" && body.website.trim()) {
    return {
      challenge_id: crypto.randomUUID(),
      masked_email: `${address[0]}•••@${address.split("@")[1]}`,
      expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    };
  }

  if (!(await verifyTurnstile(body.turnstile_token))) {
    throw badRequest("We couldn't confirm you're a person. Please try again.");
  }

  const challengeId = crypto.randomUUID();
  const code = newCode();
  const link = newToken();
  const { data, error } = await db
    .rpc("free_vote_challenge", {
      p_challenge_id: challengeId,
      p_round_id: roundId,
      p_entry_id: entryId,
      p_email: address,
      p_code_hmac: bytea(await codeHash(HASH_KEY!, challengeId, code)),
      p_link_hash: bytea(await sha256(link)),
      p_ip_hash: ip,
      p_newsletter: body.newsletter === true,
      p_reminders: body.reminders === true,
    })
    .single<{ challenge_id: string; expires_at: string; masked_email: string; pet_name: string; contest_name: string }>();
  if (error) throw error;

  const msg = renderFreeVoteCode({
    code,
    petName: data.pet_name,
    contestName: data.contest_name,
    link: `${PUBLIC_URL}#/pet/${entryId}?fv=l.${link}`,
    minutes: CODE_MINUTES,
  });
  const sent = await sendEmail({ to: address, ...msg, idempotencyKey: `free-code:${data.challenge_id}` });
  await db.rpc("free_vote_challenge_sent", { p_challenge_id: data.challenge_id, p_sent: sent.ok });
  if (!sent.ok) {
    console.error("free vote code not sent", sent.error);
    throw new HttpError(502, "We couldn't send the code just now. Please try again in a minute.");
  }

  return { challenge_id: data.challenge_id, expires_at: data.expires_at, masked_email: data.masked_email };
}

type Verified = { outcome: string; message: string | null; entry_id: string | null; round_id: string | null; masked_email: string | null };

async function verify(req: Request, body: Record<string, unknown>, ip: string | null) {
  await rateLimit(req, "free-verify", 30, 600, { failClosed: true });

  const kind = oneOf(body.kind, ["code", "link", "reminder"] as const, "Verification");
  let challengeId: string | null = null;
  let secret: Uint8Array;
  if (kind === "code") {
    challengeId = uuid(body.challenge_id, "Code request");
    const code = cleanCode(body.code);
    if (!code) throw badRequest("Enter the six-digit code from the email.");
    secret = await codeHash(HASH_KEY!, challengeId, code);
  } else {
    const token = cleanToken(body.token);
    if (!token) throw badRequest("That link is not valid.");
    secret = await sha256(token);
  }

  // Issued now, registered by the database only if the proof holds.
  const device = newToken();
  const { data, error } = await db
    .rpc("free_vote_verify", {
      p_kind: kind,
      p_challenge_id: challengeId,
      p_secret_hash: bytea(secret),
      p_device_hash: bytea(await sha256(device)),
      p_ip_hash: ip,
    })
    .single<Verified>();
  if (error) throw error;

  const proved = ["cast", "already_voted", "verified", "refused"].includes(data.outcome);
  return {
    ...data,
    device_token: proved ? device : null,
    votes: data.outcome === "cast" ? await totalFor(data.round_id, data.entry_id) : null,
  };
}

async function cast(req: Request, body: Record<string, unknown>, ip: string | null) {
  await rateLimit(req, "free-cast", 60, 3600, { failClosed: true });

  const roundId = uuid(body.round_id, "Round");
  const entryId = uuid(body.entry_id, "Pet");
  const device = cleanToken(body.device_token);
  if (!device) return { outcome: "unknown_device", message: "Confirm your email address to vote free.", masked_email: null };

  const { data, error } = await db
    .rpc("free_vote_cast", { p_device_hash: bytea(await sha256(device)), p_round_id: roundId, p_entry_id: entryId, p_ip_hash: ip })
    .single<{ outcome: string; message: string | null; masked_email: string | null }>();
  if (error) throw error;
  return { ...data, votes: data.outcome === "cast" ? await totalFor(roundId, entryId) : null };
}

async function status(req: Request, body: Record<string, unknown>) {
  await rateLimit(req, "free-status", 120, 3600, { failClosed: true });
  const device = cleanToken(body.device_token);
  if (!device) return { known: false };
  const { data, error } = await db.rpc("free_vote_device_status", { p_device_hash: bytea(await sha256(device)) });
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? { known: true, ...row } : { known: false };
}

async function preferences(req: Request, body: Record<string, unknown>) {
  await rateLimit(req, "free-prefs", 30, 3600, { failClosed: true });
  const device = cleanToken(body.device_token);
  if (!device) throw badRequest("Confirm your email address first.");
  const flag = (v: unknown) => (typeof v === "boolean" ? v : null);
  const { data, error } = await db.rpc("free_vote_preferences", {
    p_device_hash: bytea(await sha256(device)),
    p_reminders: flag(body.reminders),
    p_newsletter: flag(body.newsletter),
  });
  if (error) throw error;
  return { ok: data === true };
}

async function unsubscribe(value: unknown) {
  const token = cleanToken(value);
  if (!token) throw badRequest("That link is not valid.");
  const { data, error } = await db.rpc("free_vote_unsubscribe", { p_link_hash: bytea(await sha256(token)) });
  if (error) throw error;
  return { ok: data === true };
}

// The pet's fresh total, for the done screen.
async function totalFor(roundId: string | null, entryId: string | null): Promise<number | null> {
  if (!roundId || !entryId) return null;
  const { data } = await db
    .from("entry_round_totals")
    .select("votes")
    .eq("round_id", roundId)
    .eq("entry_id", entryId)
    .maybeSingle();
  return data?.votes ?? null;
}
