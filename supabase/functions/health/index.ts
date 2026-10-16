// Live-contest health. Runs the database checks (contest_health) plus one only
// this function can do: asking Stripe which vote-pack payments succeeded and
// confirming each one was credited.
//
// Two callers:
// - the schedule (.github/workflows/health.yml, with CRON_SECRET): records the
//   problems and tells staff about new, ongoing and cleared ones;
// - the admin Health tab (staff session): shows the same checks, tells nobody.
//
// Delivery, whichever is configured:
//   STAFF_ALERT_EMAILS  comma-separated; needs email (RESEND_API_KEY) set up
//   ALERT_WEBHOOK_URL   a Slack, Discord or Teams incoming webhook
// With neither, the response says so and the scheduled workflow fails, which
// makes GitHub email the repository owner. Crude, but nothing goes unheard.

import Stripe from "npm:stripe@17";
import { type Change, formatAlert, type IntentLike, type Problem, uncreditedPayments } from "../_shared/alerts.ts";
import { requireAdmin, service } from "../_shared/db.ts";
import { emailEnabled, sendEmail } from "../_shared/email.ts";
import { optionalEnv, requireEnv } from "../_shared/env.ts";
import { serve } from "../_shared/http.ts";
import { safeEqual } from "../_shared/validate.ts";

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
  httpClient: Stripe.createFetchHttpClient(),
});
const CRON_SECRET = optionalEnv("CRON_SECRET");
const STAFF = (optionalEnv("STAFF_ALERT_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const WEBHOOK = optionalEnv("ALERT_WEBHOOK_URL");
const DESK_URL = (optionalEnv("SHARE_BASE_URL") ?? "https://rowanflynnpilot.github.io/wpr-pet-contest/") + "#/admin/health";

const LOOKBACK_SECONDS = 3 * 3600;

serve(async (req) => {
  const presented = req.headers.get("x-cron-secret");
  const scheduled = Boolean(CRON_SECRET && presented && safeEqual(presented, CRON_SECRET));
  if (!scheduled) await requireAdmin(req);

  const problems: Problem[] = [];

  const { data: rows, error } = await service.rpc("contest_health");
  if (error) throw error;
  for (const r of rows ?? []) problems.push({ check_name: r.check_name, severity: r.severity, detail: r.detail });

  problems.push(...await stripeCheck());

  const channels = { email: emailEnabled && STAFF.length > 0, webhook: Boolean(WEBHOOK) };
  let notified = 0;
  let delivered = false;

  if (scheduled) {
    const { data, error: recordError } = await service.rpc("record_health", { p_problems: problems });
    if (recordError) throw recordError;
    const changes = ((data ?? []) as Change[]).filter((c) => c.change !== ("silent" as string));
    notified = changes.length;
    if (changes.length) delivered = await deliver(changes);
  }

  return {
    ok: problems.length === 0,
    checked_at: new Date().toISOString(),
    problems,
    channels,
    notified,
    // True when there was nothing new to say, or it was said.
    delivered: notified === 0 || delivered,
  };
});


async function stripeCheck(): Promise<Problem[]> {
  const now = Math.floor(Date.now() / 1000);
  let intents: IntentLike[];
  try {
    const list = await stripe.paymentIntents.list({
      created: { gte: now - LOOKBACK_SECONDS },
      limit: 100,
      expand: ["data.latest_charge"],
    });
    intents = list.data.map((pi) => ({
      id: pi.id,
      status: pi.status,
      metadata: pi.metadata,
      paidAt: typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge.created : null,
    }));
  } catch (err) {
    console.error("stripe check failed", err);
    return [{
      check_name: "stripe_unreachable",
      severity: "warn",
      detail: "Could not reach Stripe to confirm payments are being credited. Check STRIPE_SECRET_KEY and Stripe's status page.",
    }];
  }

  const ids = intents.filter((pi) => pi.status === "succeeded").map((pi) => pi.id);
  const status = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await service.from("votes").select("stripe_payment_intent_id, status").in("stripe_payment_intent_id", ids);
    if (error) throw error;
    for (const v of data ?? []) status.set(v.stripe_payment_intent_id, v.status);
  }

  const problem = uncreditedPayments(intents, status, now);
  return problem ? [problem] : [];
}


async function deliver(changes: Change[]): Promise<boolean> {
  const { subject, text } = formatAlert(changes, DESK_URL);
  let ok = false;

  if (WEBHOOK) {
    try {
      // `text` for Slack and Teams, `content` for Discord.
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `*${subject}*\n${text}`, content: `**${subject}**\n${text}` }),
      });
      ok ||= res.ok;
      if (!res.ok) console.error("alert webhook failed", res.status, await res.text());
    } catch (err) {
      console.error("alert webhook failed", err);
    }
  }

  if (emailEnabled && STAFF.length) {
    const stamp = new Date().toISOString().slice(0, 16);
    for (const to of STAFF) {
      const result = await sendEmail({
        to,
        subject,
        text,
        html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`,
        idempotencyKey: `health:${to}:${stamp}`,
      });
      ok ||= result.ok;
      if (!result.ok) console.error("alert email failed", to, result.error);
    }
  }

  return ok;
}
