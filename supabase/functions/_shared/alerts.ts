// Health problems: the Stripe cross-check and the words staff receive. Pure:
// no env and no network, so the tests import it directly. Sending lives in the
// `health` function.

export type Problem = { check_name: string; severity: "alert" | "warn"; detail: string };
export type Change = Problem & { change: "opened" | "reminder" | "resolved" };

// Minimal shapes of what Stripe and the votes table return.
export type IntentLike = {
  id: string;
  status: string;
  metadata?: Record<string, string> | null;
  // Unix seconds the payment succeeded (the latest charge's created time).
  paidAt: number | null;
};

// Payments Stripe says succeeded, more than `graceSeconds` ago, whose vote is
// still pending or missing. The webhook is the only thing that credits a vote,
// so this is the signature of a broken webhook: money taken, votes not given.
export function uncreditedPayments(
  intents: IntentLike[],
  voteStatus: Map<string, string>,
  nowSeconds: number,
  graceSeconds = 600,
): Problem | null {
  const stuck = intents.filter((pi) =>
    pi.status === "succeeded" &&
    pi.metadata?.kind === "vote_pack" &&
    pi.paidAt !== null && nowSeconds - pi.paidAt > graceSeconds &&
    (voteStatus.get(pi.id) ?? "pending") === "pending"
  );
  if (!stuck.length) return null;
  return {
    check_name: "payments_not_credited",
    severity: "alert",
    detail: `${stuck.length} payment(s) succeeded in Stripe more than ${Math.round(graceSeconds / 60)} minutes ago ` +
      `but no votes were credited. The Stripe webhook may be failing: check Stripe → Developers → Webhooks ` +
      `for errors. Stripe retries for three days, so votes arrive on their own once it is fixed.`,
  };
}

const LABEL: Record<Change["change"], string> = {
  opened: "PROBLEM",
  reminder: "STILL HAPPENING",
  resolved: "RESOLVED",
};

export function formatAlert(changes: Change[], deskUrl: string): { subject: string; text: string } {
  const open = changes.filter((c) => c.change !== "resolved");
  const alerts = open.filter((c) => c.severity === "alert").length;
  const subject = open.length
    ? `Pet contest: ${open.length} problem${open.length === 1 ? "" : "s"}${alerts ? " need attention" : ""}`
    : "Pet contest: all clear";

  const order = (c: Change) => (c.change === "resolved" ? 2 : c.severity === "alert" ? 0 : 1);
  const lines = [...changes]
    .sort((a, b) => order(a) - order(b))
    .map((c) => `${LABEL[c.change]}${c.severity === "alert" && c.change !== "resolved" ? " (urgent)" : ""}: ${c.detail}`);

  return {
    subject,
    text: [...lines, "", `Admin desk: ${deskUrl}`].join("\n"),
  };
}
