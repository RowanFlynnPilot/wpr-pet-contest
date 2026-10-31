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

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; permanent: boolean; error: string };

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
  if (!KEY) return { ok: false, permanent: false, error: "email is not configured" };

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

  // 4xx other than rate limiting will not fix itself on retry (a bad address,
  // an unverified domain). Record it and move on. 429 and 5xx are retried by
  // the next sweep.
  const error = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 500);
  const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
  return { ok: false, permanent, error };
}
