// The notification sweep: send whatever notification_queue() says is owed.
//
// Safe to run any number of times, concurrently or not. The database decides
// what is owed, the unique constraint on notifications refuses a second record,
// and Resend's idempotency key refuses a second send inside 24 hours.

import { service } from "./db.ts";
import { emailEnabled, sendEmail } from "./email.ts";
import { optionalEnv } from "./env.ts";
import { bytea, centralDay, newToken, sha256 } from "./freevote.ts";
import { type BuyerNoteRow, type QueueRow, render, renderBuyerNote, renderFreeVoteReminder } from "./templates.ts";

const LINKS = {
  publicUrl: optionalEnv("PUBLIC_URL") ?? "https://wausaupilotandreview.com/",
  shareBase: optionalEnv("SHARE_BASE_URL") ?? "https://rowanflynnpilot.github.io/wpr-pet-contest/",
};

// Resend's default rate limit is 2 requests a second.
const SPACING_MS = 550;

export type SweepResult = {
  enabled: boolean;
  sent: number;
  failed: number;
  queued: number;
  more: boolean;
};

export async function sweep(limit = 50): Promise<SweepResult> {
  const { data, error } = await service.rpc("notification_queue", { p_limit: limit });
  if (error) throw error;
  const queue = (data ?? []) as QueueRow[];

  if (!emailEnabled) {
    return { enabled: false, sent: 0, failed: 0, queued: queue.length, more: queue.length === limit };
  }

  let sent = 0;
  let failed = 0;

  for (const [i, row] of queue.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, SPACING_MS));

    const msg = render(row, LINKS);
    const result = await sendEmail({
      to: row.to_email,
      ...msg,
      idempotencyKey: `${row.kind}:${row.entry_id}:${row.round_id ?? "-"}`,
    });

    // A transient failure is left unrecorded so the next sweep retries it.
    if (!result.ok && !result.permanent) {
      console.warn("email deferred", row.kind, row.entry_id, result.error);
      continue;
    }

    const { error: insertError } = await service.from("notifications").insert({
      kind: row.kind,
      entry_id: row.entry_id,
      round_id: row.round_id,
      to_email: row.to_email,
      status: result.ok ? "sent" : "failed",
      provider_id: result.ok ? result.id : null,
      error: result.ok ? null : result.error,
    });
    // 23505: another sweep recorded it first. Resend deduplicated the send.
    if (insertError && insertError.code !== "23505") throw insertError;

    if (result.ok) sent++;
    else failed++;
  }

  return { enabled: true, sent, failed, queued: queue.length - sent - failed, more: queue.length === limit };
}

// The buyer notes: whoever buyer_notice_queue() says is owed one, now that a
// bracket round has opened or the final is decided. Claimed with a row per
// buyer per round first, so overlapping sweeps send once.
export async function sweepBuyerNotes(limit = 50): Promise<SweepResult> {
  const { data, error } = await service.rpc("buyer_notice_queue", { p_limit: limit });
  if (error) throw error;
  const queue = (data ?? []) as (BuyerNoteRow & { round_id: string })[];

  if (!emailEnabled) {
    return { enabled: false, sent: 0, failed: 0, queued: queue.length, more: queue.length === limit };
  }

  const fnUrl = optionalEnv("SUPABASE_URL");
  let sent = 0;
  let failed = 0;

  for (const [i, row] of queue.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, SPACING_MS));

    const unsubToken = newToken();
    const kind = row.is_final ? "final" : "round";
    const { error: claimError } = await service.from("buyer_notices").insert({
      email: row.email,
      round_id: row.round_id,
      kind,
      unsub_hash: bytea(await sha256(unsubToken)),
      status: "pending",
    });
    if (claimError?.code === "23505") continue;
    if (claimError) throw claimError;

    const unsubscribe = `${LINKS.publicUrl}#/unsubscribe?bn=${unsubToken}`;
    const msg = renderBuyerNote(row, LINKS, unsubscribe);
    const result = await sendEmail({
      to: row.email,
      ...msg,
      idempotencyKey: `buyer-note:${row.round_id}:${kind}:${await hexOf(row.email)}`,
      headers: fnUrl
        ? {
          "List-Unsubscribe": `<${fnUrl}/functions/v1/links?unsubscribe=${unsubToken}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
        : { "List-Unsubscribe": `<${unsubscribe}>` },
    });

    const { error: settleError } = await service
      .from("buyer_notices")
      .update({ status: result.ok ? "sent" : "failed", provider_id: result.ok ? result.id : null, error: result.ok ? null : result.error })
      .eq("email", row.email)
      .eq("round_id", row.round_id)
      .eq("kind", kind);
    if (settleError) throw settleError;

    if (result.ok) sent++;
    else failed++;
  }

  return { enabled: true, sent, failed, queued: queue.length - sent - failed, more: queue.length === limit };
}

// An idempotency key must not carry the address itself.
async function hexOf(text: string): Promise<string> {
  const bytes = await sha256(text.toLowerCase());
  return [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ReminderRow = {
  voter_id: string;
  email: string;
  pet_id: string | null;
  pet_name: string | null;
  round_kind: "open" | "bracket";
  round_label: string;
  closes_at: string;
  contest_name: string;
};

// The free-vote morning reminders: whoever free_vote_reminder_queue() says is
// owed one. The database decides the hour in Chicago. Each send is claimed
// with a row first (one per voter per day), so overlapping sweeps send once.
export async function sweepReminders(limit = 50): Promise<SweepResult> {
  const { data, error } = await service.rpc("free_vote_reminder_queue", { p_limit: limit });
  if (error) throw error;
  const queue = (data ?? []) as ReminderRow[];

  if (!emailEnabled) {
    return { enabled: false, sent: 0, failed: 0, queued: queue.length, more: queue.length === limit };
  }

  const fnUrl = optionalEnv("SUPABASE_URL");
  let sent = 0;
  let failed = 0;

  for (const [i, row] of queue.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, SPACING_MS));

    // Two tokens: the vote link proves the address (once); the unsubscribe
    // link proves nothing, so it can sit in a header and a server log.
    const token = newToken();
    const unsubToken = newToken();
    const day = centralDay();
    const { error: claimError } = await service.from("free_vote_reminders").insert({
      voter_id: row.voter_id,
      reminder_day: day,
      link_hash: bytea(await sha256(token)),
      unsub_hash: bytea(await sha256(unsubToken)),
      status: "pending",
    });
    if (claimError?.code === "23505") continue;
    if (claimError) throw claimError;

    // The link opens the reader's pet ready to cast, or the field if that
    // pet is out. It proves the address; the vote takes one more tap.
    const where = row.pet_id ? `pet/${row.pet_id}` : row.round_kind === "bracket" ? "bracket" : "gallery";
    const link = `${LINKS.publicUrl}#/${where}?fv=r.${token}`;
    const unsubscribe = `${LINKS.publicUrl}#/unsubscribe?fv=u.${unsubToken}`;
    const msg = renderFreeVoteReminder({
      petName: row.pet_name,
      contestName: row.contest_name,
      roundName: row.round_label,
      closesAt: row.closes_at,
      link,
      unsubscribe,
    });
    const result = await sendEmail({
      to: row.email,
      ...msg,
      idempotencyKey: `free-remind:${row.voter_id}:${day}`,
      // RFC 8058: exactly one HTTPS address, which a mail client POSTs to.
      headers: fnUrl
        ? {
          "List-Unsubscribe": `<${fnUrl}/functions/v1/free-vote?unsubscribe=${unsubToken}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
        : { "List-Unsubscribe": `<${unsubscribe}>` },
    });

    const { error: settleError } = await service
      .from("free_vote_reminders")
      .update({ status: result.ok ? "sent" : "failed", provider_id: result.ok ? result.id : null, error: result.ok ? null : result.error })
      .eq("voter_id", row.voter_id)
      .eq("reminder_day", day);
    if (settleError) throw settleError;

    if (result.ok) sent++;
    else failed++;
  }

  return { enabled: true, sent, failed, queued: queue.length - sent - failed, more: queue.length === limit };
}
