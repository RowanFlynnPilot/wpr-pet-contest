// The moderators' note when new entries reach the queue (0035). Pure: no env
// and no network, so the tests import it directly. Sending lives in notify.ts.

export type ModerationAlert = {
  contestName: string;
  newCount: number;
  pending: number;
  oldestAt: string | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// "a@x.com, b@y.com" → ["a@x.com", "b@y.com"]: blanks and anything that is not
// an address are dropped, duplicates once.
export function parseRecipients(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of String(value ?? "").split(/[,;\s]+/)) {
    const addr = part.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) seen.add(addr);
  }
  return [...seen];
}

function waited(oldestAt: string | null, now: Date): string | null {
  if (!oldestAt) return null;
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(oldestAt).getTime()) / 60000));
  if (minutes < 60) return null;
  const hours = Math.round(minutes / 60);
  return `The oldest has waited about ${plural(hours, "hour", "hours")}.`;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderModerationAlert(alert: ModerationAlert, deskUrl: string, now = new Date()) {
  const fresh = plural(alert.newCount, "new pet is", "new pets are");
  const subject = `${fresh[0].toUpperCase()}${fresh.slice(1)} waiting for review`;
  const lines = [
    `${alert.contestName}: ${fresh} waiting for review.`,
    alert.pending > alert.newCount ? `${plural(alert.pending, "entry is", "entries are")} in the queue in all.` : null,
    waited(alert.oldestAt, now),
    "Nothing is public until an editor approves it.",
  ].filter(Boolean) as string[];
  const text = `${lines.join("\n")}\n\nReview them: ${deskUrl}\n\nYou get at most one of these every 15 minutes, only when new entries arrive.`;
  const html = `<div style="font:16px/1.5 -apple-system,Segoe UI,sans-serif;color:#1a1a1a">` +
    lines.map((l) => `<p style="margin:0 0 10px">${escape(l)}</p>`).join("") +
    `<p style="margin:18px 0"><a href="${escape(deskUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#2b655d;color:#fff;font-weight:700;text-decoration:none">Open the moderation queue</a></p>` +
    `<p style="margin:0;font-size:13px;color:#666">You get at most one of these every 15 minutes, only when new entries arrive.</p></div>`;
  return { subject, text, html };
}
