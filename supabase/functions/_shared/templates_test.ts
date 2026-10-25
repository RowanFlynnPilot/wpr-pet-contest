// deno test --allow-env --allow-read supabase/functions/_shared
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  dollars, escape, formatWhen, matchupLine, type QueueRow, render, renderBuyerNote, renderFreeVoteCode, renderFreeVoteReminder,
  standingLine,
} from "./templates.ts";

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
  "nurture_ready", "nurture_open", "nurture_halfway", "nurture_last_day", "nurture_matchup_last_day", "nurture_thanks",
  "club_100", "club_500", "club_1000", "club_5000", "last_chance",
];

Deno.test("Last Chance names the place, the race, the deadline and the gap", () => {
  const row = { ...base, kind: "last_chance" as const, round_name: "Last Chance", closes_at: "2026-11-25T02:00:00Z", rank: 17, field_size: 5, my_votes: 412, cut_margin: 18 };
  const msg = render(row, LINKS);
  assertEquals(msg.subject, "Biscuit gets a Last Chance at the bracket");
  assertStringIncludes(msg.text, "No. 17");
  assertStringIncludes(msg.text, "4 other pets");
  assertStringIncludes(msg.text, "412, 18 behind the leader");
  assertStringIncludes(msg.text, "/p/7a000000-0000-0000-0000-00000000000a/?via=o");
  const leading = render({ ...row, cut_margin: 0 }, LINKS);
  assertStringIncludes(leading.text, "leads with 412");
});

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

Deno.test("another newsroom's name, phone and colors replace WPR's everywhere", () => {
  const gazette = { name: "The Example Gazette", phone: "555-010-0100", brand: "#16304f", paper: "#f7f4ee" };
  for (const kind of KINDS) {
    const msg = render({ ...base, kind, round_name: "Sweet 16" }, { ...LINKS, newsroom: gazette });
    assertStringIncludes(msg.html, "The Example Gazette");
    assertStringIncludes(msg.text, "The Example Gazette · 555-010-0100");
    assert(!msg.html.includes("Wausau") && !msg.text.includes("Wausau"), kind);
    if (msg.html.includes("<a href")) assertStringIncludes(msg.html, "background:#16304f", kind); // the button
    assertStringIncludes(msg.html, "background:#f7f4ee"); // the paper
  }
  const code = renderFreeVoteCode({ code: "482913", petName: "Biscuit", contestName: "Cutest Pet", link: "https://x/", minutes: 15, newsroom: gazette });
  assertStringIncludes(code.text, "The Example Gazette · 555-010-0100");
  assert(!code.html.includes("Wausau"));
});

Deno.test("the approval email shows the photo and gives the owner's page a button, not a raw link in the copy", () => {
  const msg = render({ ...base, kind: "entry_approved", photo_path: "c1/abc.thumb.jpg", owner_token: "11111111-1111-1111-1111-111111111111" },
    { ...LINKS, storageUrl: "https://proj.supabase.co/" });
  assertStringIncludes(msg.html, 'src="https://proj.supabase.co/storage/v1/object/public/pets/c1/abc.thumb.jpg"');
  assertStringIncludes(msg.html, "owner page</a>");
  // The owner link lives in the button, not printed in a paragraph.
  assert(!/<p[^>]*>[^<]*\?owner=/.test(msg.html), "no raw owner link in the copy");
  assertStringIncludes(msg.text, "owner page: https://wausaupilotandreview.com/pets/#/pet/");
});

Deno.test("a club note names the club, the next one, and carries the photo and a way out", () => {
  const msg = render({ ...base, kind: "club_500", my_votes: 612, photo_path: "c1/abc.jpg", owner_token: "11111111-1111-1111-1111-111111111111" },
    { ...LINKS, storageUrl: "https://proj.supabase.co" });
  assertEquals(msg.subject, "Biscuit joined the 500 Club");
  assertStringIncludes(msg.text, "The next one is the 1,000 Club.");
  assertStringIncludes(msg.html, "pets/c1/abc.jpg");
  assertStringIncludes(msg.text, "stop them here");
  const last = render({ ...base, kind: "club_5000", my_votes: 5100 }, LINKS);
  assertStringIncludes(last.text, "last club there is");
  assert(!last.html.includes("<img"), "no photo without a storage URL");
});

Deno.test("approval carries the per-pet share page", () => {
  const msg = render(base, LINKS);
  assertStringIncludes(msg.html, "https://rowanflynnpilot.github.io/wpr-pet-contest/p/7a000000-0000-0000-0000-00000000000a/");
  assertStringIncludes(msg.text, "/p/7a000000-0000-0000-0000-00000000000a/?via=o");
});

Deno.test("advancement names the round, the opponent and the reset", () => {
  const msg = render({
    ...base,
    kind: "advanced",
    round_name: "Elite Eight",
    opponent_name: "Luna",
    closes_at: "2026-10-15T01:00:00Z",
    matchup_id: "f3a0d1a2-5a8b-4d2c-9d6e-0b7c1f2e3a44",
  }, LINKS);
  assertEquals(msg.subject, "Biscuit made the Elite Eight!");
  // The matchup page: both pets in the preview, this pet on the tap.
  assertStringIncludes(msg.html, "https://rowanflynnpilot.github.io/wpr-pet-contest/m/f3a0d1a2-5a8b-4d2c-9d6e-0b7c1f2e3a44/?p=7a000000-0000-0000-0000-00000000000a");
  // Tagged as the owner's, for "your links have brought".
  assertStringIncludes(msg.text, "?p=7a000000-0000-0000-0000-00000000000a&via=o");
  const noMatchup = render({ ...base, kind: "advanced", round_name: "Elite Eight" }, LINKS);
  assertStringIncludes(noMatchup.html, "/p/7a000000-0000-0000-0000-00000000000a/");
  assertStringIncludes(msg.text, "facing Luna");
  assertStringIncludes(msg.text, "reset every round");
  assertStringIncludes(msg.text, "Wednesday, Oct. 14");
});

Deno.test("a sentence ending on a time ends on one period", () => {
  const msg = render({ ...base, kind: "nurture_halfway", round_name: "Open Round", closes_at: "2026-11-28T02:00:00Z", my_votes: 88, rank: 14, field_size: 212, cut_margin: 12 }, LINKS);
  assertStringIncludes(msg.text, "closes Friday, Nov. 27 at 8 p.m. If two pets tie");
  assert(!msg.text.includes("p.m.."));
  assert(!msg.html.includes("p.m.."));
  const note = renderBuyerNote({
    email: "fan@example.com", contest_name: "C", round_name: "Elite Eight", closes_at: "2026-11-28T02:00:00Z", is_final: false,
    playing: [{ entry_id: "7a000000-0000-0000-0000-00000000000a", pet: "Biscuit", opponent: "Luna" }], ended: [], champion: [], raised_cents: 100,
  }, LINKS, "https://example.org/u");
  assert(!note.text.includes("p.m.."));
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
  assertStringIncludes(formatWhen("2026-10-15T01:00:00Z"), "8 p.m.");
  assertStringIncludes(formatWhen("2026-10-15T17:00:00Z"), "Thursday, Oct. 15 at noon");
  assertStringIncludes(formatWhen("2026-07-04T05:00:00Z"), "Saturday, July 4 at midnight");
  assertStringIncludes(formatWhen("2026-11-20T14:30:00Z"), "Friday, Nov. 20 at 8:30 a.m.");
});

Deno.test("the free-vote code email puts the code in the subject and offers the link", () => {
  const msg = renderFreeVoteCode({
    code: "042917",
    petName: "Biscuit",
    contestName: "Cutest Pet in Marathon County",
    link: "https://wausaupilotandreview.com/pets/#/pet/x?fv=l.token",
    minutes: 15,
  });
  assertEquals(msg.subject, "042917 is your free vote code");
  assertStringIncludes(msg.text, "fv=l.token");
  assertStringIncludes(msg.html, "Confirm my vote for Biscuit");
  assertStringIncludes(msg.text, "asked to vote free");
  assert(!msg.text.includes("Hi "), "voters gave no name, so the email greets no one");
  assert(!msg.html.includes("<img"), "code emails carry no images");
});

Deno.test("the reminder names the pet when there is one, and carries an unsubscribe link", () => {
  const base = {
    contestName: "Cutest Pet in Marathon County",
    roundName: "Sweet 16",
    closesAt: "2026-10-30T23:15:00Z",
    link: "https://wausaupilotandreview.com/pets/#/pet/x?fv=r.token",
    unsubscribe: "https://wausaupilotandreview.com/pets/#/unsubscribe?fv=u.token",
  };
  const named = renderFreeVoteReminder({ ...base, petName: "Biscuit" });
  assertEquals(named.subject, "Your free vote is ready: vote for Biscuit");
  assertStringIncludes(named.text, "fv=u.token");
  assertStringIncludes(named.html, "Stop these reminders");
  const open = renderFreeVoteReminder({ ...base, petName: null });
  assertEquals(open.subject, "Your free vote is ready");
  assertStringIncludes(open.text, "your favorite");
});

Deno.test("entrant emails keep their footer", () => {
  assertStringIncludes(render(base, LINKS).text, "Vote packs are not tax-deductible donations.");
});

Deno.test("the approval email carries the owner's own link, and the tips can be stopped", () => {
  const msg = render({ ...base, owner_token: "t0ken" }, LINKS);
  assertStringIncludes(msg.text, "#/pet/7a000000-0000-0000-0000-00000000000a?owner=t0ken");
  const tip = render({ ...base, kind: "nurture_open", round_id: "r1", owner_token: "t0ken", closes_at: "2026-11-28T02:00:00Z" }, LINKS);
  assertStringIncludes(tip.text, "#/unsubscribe?owner=7a000000-0000-0000-0000-00000000000a.t0ken");
  assertStringIncludes(tip.text, "totals reset");
});

Deno.test("standings are quoted honestly, and a long shot is not told the gap", () => {
  const row = { ...base, kind: "nurture_halfway" as const, rank: 3, field_size: 24, my_votes: 90 };
  assertEquals(standingLine({ ...row, cut_margin: 12 }), "Biscuit is No. 3 of 24, 12 votes above the cut for the bracket.");
  assertEquals(standingLine({ ...row, cut_margin: 0 }), "Biscuit is No. 3 of 24, tied at the cut and in on the tiebreak.");
  assertEquals(standingLine({ ...row, rank: 19, cut_margin: -4 }), "Biscuit is No. 19 of 24, 4 votes from the bracket.");
  assertStringIncludes(standingLine({ ...row, rank: 23, cut_margin: -140 }), "shows how many votes it takes");
  assertEquals(matchupLine({ ...base, kind: "nurture_matchup_last_day", opponent_name: "Luna", my_votes: 40, opponent_votes: 31 }), "Biscuit leads Luna, 40 to 31.");
  assertEquals(matchupLine({ ...base, kind: "nurture_matchup_last_day", opponent_name: "Luna", my_votes: 10, opponent_votes: 99 }), "The score is on Biscuit's page.");
  const goal = render({ ...base, kind: "nurture_halfway", round_id: "r1", rank: 3, field_size: 24, cut_margin: 12, my_votes: 90, goal_votes: 300 }, LINKS);
  assertStringIncludes(goal.text, "Biscuit's goal is 300 votes this round; 210 to go.");
});

Deno.test("buyer notes: plays again, the run ends, the champion; never a name, always a way out", () => {
  const base2 = { email: "fan@example.com", contest_name: "Cutest Pet in Marathon County", round_name: "Elite Eight", closes_at: "2026-12-02T02:00:00Z", is_final: false, raised_cents: 150000 };
  const again = renderBuyerNote({ ...base2, playing: [{ entry_id: "x", pet: "Biscuit", opponent: "Luna" }], ended: [], champion: [] }, LINKS, "https://u/1");
  assertEquals(again.subject, "Biscuit plays again: Elite Eight vs. Luna");
  assertStringIncludes(again.text, "reset every round");
  assertStringIncludes(again.text, "Stop these emails: https://u/1");
  assert(!again.text.includes("Hi "));
  const two = renderBuyerNote({ ...base2, playing: [{ entry_id: "x", pet: "Biscuit", opponent: "Luna" }, { entry_id: "y", pet: "Gus", opponent: "Moose" }], ended: [{ pet: "Otis", opponent: "Hazel", round: "Sweet 16" }], champion: [] }, LINKS, "https://u/2");
  assertEquals(two.subject, "Two of your pets play again in the Elite Eight");
  assertStringIncludes(two.text, "Otis's run ended in the Sweet 16, against Hazel");
  const champ = renderBuyerNote({ ...base2, is_final: true, playing: [], ended: [], champion: [{ entry_id: "x", pet: "Gus", opponent: "Luna" }] }, LINKS, "https://u/3");
  assertEquals(champ.subject, "Gus is the champion");
  assertStringIncludes(champ.text, "$1,500");
  for (const m of [again, two, champ]) assert(!m.text.includes("donation") || m.text.includes("not tax-deductible") === false);
});
