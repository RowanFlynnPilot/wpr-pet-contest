// Outbound email through Resend. Off until RESEND_API_KEY is set: every caller
// checks `emailEnabled` and degrades to "nothing sent" rather than failing.
//
// Turning it on needs a Resend account, a verified sending domain (DNS records
// on wausaupilotandreview.com), and these secrets on the edge functions:
//   RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO (optional)
// See README, "Email".

import { optionalEnv } from "./env.ts";

const KEY = optionalEnv("RESEND_API_KEY");
const FROM = optionalEnv("EMAIL_FROM") ?? "Wausau Pilot & Review <pets@wausaupilotandreview.com>";
const REPLY_TO = optionalEnv("EMAIL_REPLY_TO");

export const emailEnabled = Boolean(KEY);

// permanent: this message will never send (a bad address); record it.
// halt: our side is wrong (the API key, the sending domain): nothing will send
// until staff fix it, so stop the sweep and retry everything later.
// Neither: try again on the next sweep.
export type SendResult =
  | { ok: true; id: string }
  | { ok: false; permanent: boolean; halt?: boolean; error: string };

// How a Resend error status should be treated. 401 and 403 are a missing or
// revoked key or an unverified domain; 409 is the same idempotency key still
// in flight; 429 and 5xx pass. Only the rest of 4xx (a malformed or refused
// address) is final. A config error marked permanent would record every
// queued email, approvals included, as failed for good.
export function classifyFailure(status: number): { permanent: boolean; halt: boolean } {
  if (status === 401 || status === 403) return { permanent: false, halt: true };
  if (status === 409 || status === 429 || status >= 500) return { permanent: false, halt: false };
  return { permanent: status >= 400 && status < 500, halt: false };
}

export async function sendEmail(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Resend drops a repeat of the same key within 24h. Two overlapping sweeps
  // therefore send once even before the notifications row lands.
  idempotencyKey: string;
  // List-Unsubscribe and friends, for the free-vote reminders.
  headers?: Record<string, string>;
}): Promise<SendResult> {
  if (!KEY) return { ok: false, permanent: false, halt: true, error: "email is not configured" };

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": msg.idempotencyKey,
      },
      body: JSON.stringify({
        from: FROM,
        to: [msg.to],
        reply_to: REPLY_TO,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.headers ? { headers: msg.headers } : {}),
      }),
    });
  } catch (err) {
    return { ok: false, permanent: false, error: String(err) };
  }

  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: String(body.id ?? "") };
  }

  const error = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 500);
  return { ok: false, ...classifyFailure(res.status), error };
}
