// The notification sweep: send whatever notification_queue() says is owed.
//
// Safe to run any number of times, concurrently or not. The database decides
// what is owed, the unique constraint on notifications refuses a second record,
// and Resend's idempotency key refuses a second send inside 24 hours.

import { service } from "./db.ts";
import { emailEnabled, sendEmail } from "./email.ts";
import { optionalEnv } from "./env.ts";
import { type QueueRow, render } from "./templates.ts";

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
