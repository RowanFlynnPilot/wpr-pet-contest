import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { parseRecipients, renderModerationAlert } from "./moderation.ts";

const DESK = "https://rowanflynnpilot.github.io/wpr-pet-contest/#/admin/moderation";

Deno.test("recipients: commas, spaces, case and junk", () => {
  assertEquals(parseRecipients(" Editor@WausauPilotAndReview.com, a@b.co ;a@b.co, nope, "), [
    "editor@wausaupilotandreview.com",
    "a@b.co",
  ]);
  assertEquals(parseRecipients(undefined), []);
  assertEquals(parseRecipients(""), []);
});

Deno.test("one new pet, nothing else waiting", () => {
  const msg = renderModerationAlert({ contestName: "Cutest Pet", newCount: 1, pending: 1, oldestAt: null }, DESK);
  assertEquals(msg.subject, "1 new pet is waiting for review");
  assertEquals(msg.text.includes("in the queue in all"), false);
  assertStringIncludes(msg.text, DESK);
  assertStringIncludes(msg.html, `href="${DESK}"`);
});

Deno.test("several new, more waiting, the oldest for hours", () => {
  const now = new Date("2026-11-10T15:00:00Z");
  const msg = renderModerationAlert(
    { contestName: "Cutest Pet", newCount: 3, pending: 7, oldestAt: "2026-11-10T12:10:00Z" },
    DESK,
    now,
  );
  assertEquals(msg.subject, "3 new pets are waiting for review");
  assertStringIncludes(msg.text, "7 entries are in the queue in all.");
  assertStringIncludes(msg.text, "about 3 hours");
});

Deno.test("names are escaped in the html", () => {
  const msg = renderModerationAlert({ contestName: "A <b> & C", newCount: 2, pending: 2, oldestAt: null }, DESK);
  assertStringIncludes(msg.html, "A &lt;b&gt; &amp; C");
});
