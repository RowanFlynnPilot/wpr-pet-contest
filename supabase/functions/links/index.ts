// What a link in an email lets its holder do, and nothing more.
//
//   goal          an owner sets (or clears) the vote goal shown on the pet's
//                 page, with the token from their approval email
//   opt-out       the same token stops the tips emails to that owner
//   unsubscribe   the token in a buyer's "plays again" note stops those, for
//                 every box that address ticked in the contest; also reached
//                 by one-click unsubscribe from a mail client (RFC 8058)
//
// Tokens are bearer secrets of their own, so every path is rate-limited and
// fails closed, and nothing here reads back an address.

import { service as db } from "../_shared/db.ts";
import { bytea, cleanToken, sha256 } from "../_shared/freevote.ts";
import { badRequest, readJson, serve } from "../_shared/http.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { oneOf, uuid } from "../_shared/validate.ts";

serve(async (req) => {
  // One-click unsubscribe from a mail client: a form POST carrying the token.
  const oneClick = new URL(req.url).searchParams.get("unsubscribe");
  if (oneClick !== null) {
    await rateLimit(req, "links-unsub-oneclick", 5000, 3600);
    return await buyerUnsubscribe(oneClick);
  }

  const body = await readJson(req);
  const action = oneOf(body.action, ["goal", "opt-out", "unsubscribe"] as const, "Action");

  switch (action) {
    case "goal": {
      await rateLimit(req, "links-goal", 30, 3600, { failClosed: true });
      const entryId = uuid(body.entry_id, "Pet");
      const token = uuid(body.token, "Link");
      const goal = body.goal === null || body.goal === "" ? null : Number(body.goal);
      if (goal !== null && (!Number.isInteger(goal) || goal < 1 || goal > 100000)) {
        throw badRequest("Enter a whole number of votes, from 1 to 100,000.");
      }
      const { data, error } = await db.rpc("set_entry_goal", { p_entry_id: entryId, p_token: token, p_goal: goal });
      if (error) throw error;
      return { ok: true, goal: data };
    }
    case "opt-out": {
      await rateLimit(req, "links-optout", 30, 3600, { failClosed: true });
      const entryId = uuid(body.entry_id, "Pet");
      const token = uuid(body.token, "Link");
      const { data, error } = await db.rpc("entrant_opt_out", { p_entry_id: entryId, p_token: token });
      if (error) throw error;
      if (data !== true) throw badRequest("That link is not valid.");
      return { ok: true };
    }
    case "unsubscribe": {
      await rateLimit(req, "links-unsub", 60, 3600, { failClosed: true });
      return await buyerUnsubscribe(body.token);
    }
  }
});

async function buyerUnsubscribe(value: unknown) {
  const token = cleanToken(value);
  if (!token) throw badRequest("That link is not valid.");
  const { data, error } = await db.rpc("buyer_notice_unsubscribe", { p_unsub_hash: bytea(await sha256(token)) });
  if (error) throw error;
  if (data !== true) throw badRequest("That link is not valid.");
  return { ok: true };
}
