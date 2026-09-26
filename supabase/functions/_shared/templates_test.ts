// deno test --allow-env --allow-read supabase/functions/_shared
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { dollars, escape, formatWhen, type QueueRow, render } from "./templates.ts";

const LINKS = {
  publicUrl: "https://wausaupilotandreview.com/pets/",
  shareBase: "https://rowanflynnpilot.github.io/wpr-pet-contest/",
};

const base: QueueRow = {
  kind: "entry_approved",
  entry_id: "7a000000-0000-0000-0000-00000000000a",
  round_id: null,
  to_email: "jo@example.com",
  owner_name: "Jo Smith",
  pet_name: "Biscuit",
  contest_name: "Cutest Pet in Marathon County",
  round_name: null,
  opponent_name: null,
  closes_at: null,
  rejection_reason: null,
  raised_cents: 123_400,
};

const KINDS: QueueRow["kind"][] = [
  "entry_received", "entry_approved", "entry_rejected", "advanced", "eliminated", "champion",
];

Deno.test("every kind renders with a subject, html and text", () => {
  for (const kind of KINDS) {
    const msg = render({ ...base, kind, round_name: "Sweet 16" }, LINKS);
    assert(msg.subject.length > 0, kind);
    assertStringIncludes(msg.html, "Hi Jo,");
    assertStringIncludes(msg.text, "Wausau Pilot & Review");
    // The legal line: nothing may imply a vote pack is a donation.
    assertStringIncludes(msg.html, "not tax-deductible");
  }
});

Deno.test("approval carries the per-pet share page", () => {
  const msg = render(base, LINKS);
  assertStringIncludes(msg.html, "https://rowanflynnpilot.github.io/wpr-pet-contest/p/7a000000-0000-0000-0000-00000000000a/");
  assertStringIncludes(msg.text, "/p/7a000000-0000-0000-0000-00000000000a/");
});

Deno.test("advancement names the round, the opponent and the reset", () => {
  const msg = render({
    ...base,
    kind: "advanced",
    round_name: "Elite Eight",
    opponent_name: "Luna",
    closes_at: "2026-10-15T01:00:00Z",
  }, LINKS);
  assertEquals(msg.subject, "Biscuit made the Elite Eight!");
  assertStringIncludes(msg.text, "facing Luna");
  assertStringIncludes(msg.text, "reset every round");
  assertStringIncludes(msg.text, "Wednesday, October 14");
});

Deno.test("owner-supplied text is escaped in html", () => {
  const msg = render({ ...base, pet_name: "<img src=x onerror=alert(1)>", owner_name: "A&B" }, LINKS);
  assert(!msg.html.includes("<img src=x"));
  assertStringIncludes(msg.html, "&lt;img");
  assertStringIncludes(msg.html, "Hi A&amp;B,");
});

Deno.test("formatting helpers", () => {
  assertEquals(dollars(123_400), "$1,234");
  assertEquals(escape(`"'&`), "&quot;&#39;&amp;");
  assertStringIncludes(formatWhen("2026-10-15T01:00:00Z"), "8:00 PM");
});
