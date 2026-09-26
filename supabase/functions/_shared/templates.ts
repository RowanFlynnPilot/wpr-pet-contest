// The words in each transactional email. Pure: no env, no network, so the
// tests render every kind directly.
//
// Written for a family that entered their pet, not for a customer. Every email
// that can carry a share link does, because owners sharing their own pet is
// what sells votes.

export type QueueRow = {
  kind: "entry_received" | "entry_approved" | "entry_rejected" | "advanced" | "eliminated" | "champion";
  entry_id: string;
  round_id: string | null;
  to_email: string;
  owner_name: string;
  pet_name: string;
  contest_name: string;
  round_name: string | null;
  opponent_name: string | null;
  closes_at: string | null;
  rejection_reason: string | null;
  raised_cents: number;
};

export type Links = {
  // The WordPress page that embeds the contest.
  publicUrl: string;
  // Where the per-pet share pages live (GitHub Pages). Those carry the pet's
  // photo in the link preview; the WordPress page cannot.
  shareBase: string;
};

export type Message = { subject: string; html: string; text: string };

const TEAL = "#2b655d";
const CREAM = "#f6f2e9";

export function render(row: QueueRow, links: Links): Message {
  const pet = row.pet_name;
  const first = row.owner_name.split(" ")[0] || "there";
  const petUrl = `${links.publicUrl}#/pet/${row.entry_id}`;
  const shareUrl = `${links.shareBase.replace(/\/$/, "")}/p/${row.entry_id}/`;
  const closes = row.closes_at ? formatWhen(row.closes_at) : null;
  const raised = dollars(row.raised_cents);

  switch (row.kind) {
    case "entry_received":
      return compose(`We got ${pet}'s entry`, first, [
        `Thanks for entering ${pet} in ${row.contest_name}.`,
        `A Wausau Pilot & Review editor looks at every entry before it goes live, usually within a day. We will email you as soon as ${pet} is in the gallery, with a link you can share.`,
      ]);

    case "entry_approved":
      return compose(`${pet} is in! Here is your share link`, first, [
        `${pet} is now live in ${row.contest_name}.`,
        `Round 1 is open to every pet. The top vote-getters make the bracket, so the most useful thing you can do is share ${pet}'s page with friends, family and your local Facebook groups:`,
      ], { label: `Share ${pet}'s page`, url: shareUrl }, [
        `Every vote pack supports local animal shelters.`,
      ]);

    case "entry_rejected":
      return compose(`About ${pet}'s entry`, first, [
        `Thank you for entering ${pet}. We were not able to include this entry in ${row.contest_name}.`,
        `Reason: ${row.rejection_reason ?? "it did not meet the contest rules"}.`,
        `If you think we got it wrong, reply to this email and an editor will take a look.`,
      ]);

    case "advanced":
      return compose(
        row.round_name === "Championship"
          ? `${pet} is in the Championship!`
          : `${pet} made the ${row.round_name}!`,
        first,
        [
          `${pet} is through to the ${row.round_name}${row.opponent_name ? `, facing ${row.opponent_name}` : ""}.`,
          `Vote totals reset every round, so both pets start at zero.${closes ? ` Voting closes ${closes}.` : ""} Now is the time to share again:`,
        ],
        { label: `Share ${pet}'s matchup`, url: shareUrl },
      );

    case "eliminated":
      return compose(`Thank you for entering ${pet}`, first, [
        `${pet}'s run ended in the ${row.round_name}${row.opponent_name ? `, against ${row.opponent_name}` : ""}. Thank you for being part of it.`,
        `Together, this year's entrants have raised ${raised} for local animal shelters so far. You can keep following the bracket here:`,
      ], { label: "See the bracket", url: `${links.publicUrl}#/bracket` });

    case "champion":
      return compose(`${pet} is the champion!`, first, [
        `${pet} won ${row.contest_name}. Congratulations!`,
        `This year's contest raised ${raised} for local animal shelters. An editor will be in touch soon.`,
      ], { label: `See ${pet}'s page`, url: petUrl });
  }
}

function compose(
  subject: string,
  first: string,
  paragraphs: string[],
  button?: { label: string; url: string },
  after: string[] = [],
): Message {
  const para = (p: string) =>
    `<p style="margin:0 0 16px;font:16px/1.55 Georgia,serif;color:#1a1a1a">${escape(p)}</p>`;

  const html = `<!doctype html><html><body style="margin:0;background:${CREAM}">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;border-top:4px solid #32373c">
<p style="margin:0 0 20px;font:11px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#32373c">Wausau Pilot &amp; Review</p>
<p style="margin:0 0 16px;font:16px/1.55 Georgia,serif;color:#1a1a1a">Hi ${escape(first)},</p>
${paragraphs.map(para).join("\n")}
${button ? `<p style="margin:24px 0"><a href="${escape(button.url)}" style="display:inline-block;padding:12px 20px;background:${TEAL};color:#fff;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,sans-serif;border-radius:4px">${escape(button.label)}</a></p>` : ""}
${after.map(para).join("\n")}
<p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e3ddd0;font:12px/1.6 -apple-system,Segoe UI,sans-serif;color:#6b6b6b">You are getting this because you entered a pet in the contest. Vote packs are not tax-deductible donations.<br>Wausau Pilot &amp; Review · 715-301-5539</p>
</div></body></html>`;

  const text = [
    `Hi ${first},`,
    ...paragraphs,
    ...(button ? [`${button.label}: ${button.url}`] : []),
    ...after,
    "--",
    "Wausau Pilot & Review · 715-301-5539",
  ].join("\n\n");

  return { subject, html, text };
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
