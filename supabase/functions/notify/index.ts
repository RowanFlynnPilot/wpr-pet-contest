// Run the notification sweep. Called by the admin panel after moderation and
// after each round close, and optionally on a schedule with CRON_SECRET.
//
// With email off (no RESEND_API_KEY) it sends nothing and reports how many
// messages are waiting, so the admin panel can say so.

import { requireAdmin } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
import { serve } from "../_shared/http.ts";
import { sweep, sweepBuyerNotes, sweepReminders } from "../_shared/notify.ts";
import { safeEqual } from "../_shared/validate.ts";

const CRON_SECRET = optionalEnv("CRON_SECRET");

serve(async (req) => {
  const presented = req.headers.get("x-cron-secret");
  const isCron = Boolean(CRON_SECRET && presented && safeEqual(presented, CRON_SECRET));
  if (!isCron) await requireAdmin(req);

  const entrants = await sweep(50);
  // Free-vote reminders ride the same schedule; the database decides when
  // each is due.
  const reminders = await sweepReminders(50);
  const buyers = await sweepBuyerNotes(50);
  return { ...entrants, reminders, buyers };
});
