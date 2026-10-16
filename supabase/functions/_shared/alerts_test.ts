// deno test --allow-env --allow-read supabase/functions/_shared
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { type Change, formatAlert, type IntentLike, uncreditedPayments } from "./alerts.ts";

const NOW = 1_800_000_000;
const pi = (id: string, minutesAgo: number, extra: Partial<IntentLike> = {}): IntentLike => ({
  id,
  status: "succeeded",
  metadata: { kind: "vote_pack" },
  paidAt: NOW - minutesAgo * 60,
  ...extra,
});

Deno.test("a vote pack paid 15 minutes ago and never credited is flagged", () => {
  const problem = uncreditedPayments([pi("pi_1", 15)], new Map([["pi_1", "pending"]]), NOW);
  assertEquals(problem?.check_name, "payments_not_credited");
  assertEquals(problem?.severity, "alert");
  assertStringIncludes(problem!.detail, "1 payment(s)");
});

Deno.test("a payment with no vote row at all is flagged too", () => {
  assert(uncreditedPayments([pi("pi_ghost", 30)], new Map(), NOW));
});

Deno.test("credited, recent, failed and foreign payments are not flagged", () => {
  const intents = [
    pi("pi_ok", 30),
    pi("pi_late", 30),
    pi("pi_recent", 3),
    pi("pi_failed", 30, { status: "requires_payment_method" }),
    pi("pi_foreign", 30, { metadata: {} }),
    pi("pi_unknown_time", 30, { paidAt: null }),
  ];
  const status = new Map([["pi_ok", "succeeded"], ["pi_late", "late"]]);
  assertEquals(uncreditedPayments(intents, status, NOW), null);
});

Deno.test("alerts lead with the urgent problem and end with the desk link", () => {
  const changes: Change[] = [
    { check_name: "b", severity: "warn", detail: "Queue is slow.", change: "reminder" },
    { check_name: "c", severity: "warn", detail: "Bucket tidy.", change: "resolved" },
    { check_name: "a", severity: "alert", detail: "Payments not credited.", change: "opened" },
  ];
  const { subject, text } = formatAlert(changes, "https://desk/#/admin/health");
  assertEquals(subject, "Pet contest: 2 problems need attention");
  const lines = text.split("\n");
  assertEquals(lines[0], "PROBLEM (urgent): Payments not credited.");
  assertEquals(lines[1], "STILL HAPPENING: Queue is slow.");
  assertEquals(lines[2], "RESOLVED: Bucket tidy.");
  assertEquals(lines.at(-1), "Admin desk: https://desk/#/admin/health");
});

Deno.test("an all-clear says so", () => {
  const { subject } = formatAlert(
    [{ check_name: "a", severity: "alert", detail: "x", change: "resolved" }],
    "https://desk",
  );
  assertEquals(subject, "Pet contest: all clear");
});
