// The words in each transactional email. Pure: no env, no network, so the
// tests render every kind directly.
//
// Written for a family that entered their pet, not for a customer. Every email
// that can carry a share link does, because owners sharing their own pet is
// what sells votes.

export type NurtureKind =
  | "nurture_ready"
  | "nurture_open"
  | "nurture_halfway"
  | "nurture_last_day"
  | "nurture_matchup_last_day"
  | "nurture_thanks";

// A note when a pet passes a milestone club over the whole contest (0028).
export type ClubKind = "club_100" | "club_500" | "club_1000" | "club_5000";

export type QueueRow = {
  kind: "entry_received" | "entry_approved" | "entry_rejected" | "advanced" | "eliminated" | "champion" | "last_chance" | NurtureKind | ClubKind;
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
  // The nurture emails quote standings and carry the owner's own link.
  my_votes?: number | null;
  rank?: number | null;
  field_size?: number | null;
  cut_margin?: number | null;
  opponent_votes?: number | null;
  goal_votes?: number | null;
  owner_token?: string | null;
  champion_name?: string | null;
  opens_at?: string | null;
  // The matchup an advancement or matchup-day note is about.
  matchup_id?: string | null;
  // The pet's photo in the public bucket (its thumbnail when there is one).
  photo_path?: string | null;
};

export type Links = {
  newsroom?: Newsroom;
  // The Supabase project URL, where the public photo bucket is served.
  storageUrl?: string;
  // The WordPress page that embeds the contest.
  publicUrl: string;
  // Where the per-pet share pages live (GitHub Pages). Those carry the pet's
  // photo in the link preview; the WordPress page cannot.
  shareBase: string;
};

export type Message = { subject: string; html: string; text: string };

// The paper the mail comes from: its name in the kicker, the refusal and the
// footer, its phone, the button color (text-safe, the site's --brand-ink) and
// the paper behind the card (--cream). The functions fill it from the
// NEWSROOM_* secrets (newsroom.ts); the defaults are WPR's, so the tests and
// the deck render without any.
export type Newsroom = { name: string; phone: string; brand: string; paper: string };
export const DEFAULT_NEWSROOM: Newsroom = { name: "Wausau Pilot & Review", phone: "715-301-5539", brand: "#2b655d", paper: "#f6f2e9" };

// The owner's own link: sets a goal, stops the tips. Only in mail to them.
const ownerUrl = (links: Links, row: QueueRow) =>
  row.owner_token ? `${links.publicUrl}#/pet/${row.entry_id}?owner=${row.owner_token}` : `${links.publicUrl}#/pet/${row.entry_id}`;
const optOutUrl = (links: Links, row: QueueRow) => `${links.publicUrl}#/unsubscribe?owner=${row.entry_id}.${row.owner_token ?? ""}`;

// Where a pet stands in the Open Round, for the halfway and last-day notes.
// A big gap printed in an email reads as "don't bother", so past 50 votes
// short the sentence points at the page instead.
export function standingLine(row: QueueRow): string {
  const pet = row.pet_name;
  if (row.rank == null || row.cut_margin == null || row.field_size == null) {
    return `${pet}'s page shows where ${pet} stands right now and how many votes it takes to pass the next pet.`;
  }
  const place = `${pet} is No. ${row.rank} of ${row.field_size}`;
  if (row.cut_margin > 0) return `${place}, ${row.cut_margin} vote${row.cut_margin === 1 ? "" : "s"} above the cut for the bracket.`;
  if (row.cut_margin === 0) return `${place}, tied at the cut and in on the tiebreak.`;
  if (row.cut_margin >= -50) return `${place}, ${-row.cut_margin} vote${row.cut_margin === -1 ? "" : "s"} from the bracket.`;
  return `${place}. ${pet}'s page shows how many votes it takes to pass the next pet.`;
}

// A matchup's score the morning of its last day.
export function matchupLine(row: QueueRow): string {
  const pet = row.pet_name;
  const opp = row.opponent_name ?? "its opponent";
  const mine = row.my_votes ?? 0;
  const theirs = row.opponent_votes ?? 0;
  if (mine === theirs) return `${pet} and ${opp} are tied at ${mine}. A tie goes to the better seed.`;
  if (mine > theirs) return `${pet} leads ${opp}, ${mine} to ${theirs}.`;
  if (theirs - mine > 50) return `The score is on ${pet}'s page.`;
  return `${pet} trails ${opp}, ${mine} to ${theirs}.`;
}

const goalLine = (row: QueueRow): string | null => {
  if (!row.goal_votes || row.my_votes == null) return null;
  const left = row.goal_votes - row.my_votes;
  return left > 0
    ? `${row.pet_name}'s goal is ${row.goal_votes.toLocaleString("en-US")} votes this round; ${apNumber(left)} to go.`
    : `${row.pet_name} has passed the ${row.goal_votes}-vote goal you set. Raise it on ${row.pet_name}'s page if you like.`;
};

export function render(row: QueueRow, links: Links): Message {
  const n = links.newsroom ?? DEFAULT_NEWSROOM;
  const compose = (
    subject: string,
    first: string | null,
    paragraphs: string[],
    button?: { label: string; url: string },
    after?: string[],
    footer?: string,
    extras?: Extras,
  ) => composeMail(subject, first, paragraphs, button, after, footer, n, extras);
  // The pet's photo, for the emails that celebrate it.
  const photo = row.photo_path && links.storageUrl
    ? `${links.storageUrl.replace(/\/$/, "")}/storage/v1/object/public/pets/${row.photo_path.split("/").map(encodeURIComponent).join("/")}`
    : undefined;
  const pet = row.pet_name;
  const first = row.owner_name.split(" ")[0] || "there";
  const petUrl = `${links.publicUrl}#/pet/${row.entry_id}`;
  // The links an owner passes on carry ?via=o, so a pack bought through one
  // counts toward "your links have brought" on the owner's panel (0029).
  // Attribution only; it changes nothing about a vote.
  const shareUrl = `${links.shareBase.replace(/\/$/, "")}/p/${row.entry_id}/?via=o`;
  // During the bracket, the matchup page: both pets in the preview, and a
  // tap lands on this pet. Falls back to the pet's own page.
  const matchupUrl = row.matchup_id
    ? `${links.shareBase.replace(/\/$/, "")}/m/${row.matchup_id}/?p=${row.entry_id}&via=o`
    : shareUrl;
  const closes = row.closes_at ? formatWhen(row.closes_at) : null;
  const raised = dollars(row.raised_cents);
  const stopLine = `These tips come with your entry; stop them here: ${optOutUrl(links, row)}`;

  switch (row.kind) {
    case "entry_received":
      return compose(`We got ${pet}'s entry`, first, [
        `Thanks for entering ${pet} in ${row.contest_name}.`,
        `An editor at ${n.name} looks at every entry before it goes live, usually within a day. We will email you as soon as ${pet} is in the gallery, with a link you can share.`,
      ]);

    case "entry_approved":
      return compose(`${pet} is in! Here is your share link`, first, [
        `${pet} is now live in ${row.contest_name}.`,
        `Round 1 is open to every pet. The top vote-getters make the bracket, so the most useful thing you can do is share ${pet}'s page with friends, family and your local Facebook groups:`,
      ], { label: `Share ${pet}'s page`, url: shareUrl }, [
        `Every vote pack supports local animal shelters.`,
        `${pet} also has an owner's page, just for you: set a vote goal, make share images, and see ${pet}'s milestone badges.`,
      ], undefined, { photo, photoAlt: pet, secondary: { label: `Open ${pet}'s owner page`, url: ownerUrl(links, row) } });

    case "club_100":
    case "club_500":
    case "club_1000":
    case "club_5000": {
      const tier = Number(row.kind.slice(5));
      const club = `${tier.toLocaleString("en-US")} Club`;
      const next = [500, 1000, 5000].find((t) => t > tier);
      return compose(`${pet} joined the ${club}`, first, [
        `${pet} just passed ${tier.toLocaleString("en-US")} votes in ${row.contest_name}, counting every round. That puts ${pet} in the ${club}, and the badge is on ${pet}'s page now.`,
        next
          ? `Clubs are for every pet, whatever the standings. The next one is the ${next.toLocaleString("en-US")} Club. The share images on your owner page now carry the badge.`
          : `That's the last club there is. The share images on your owner page now carry the badge.`,
      ], { label: `Share ${pet}'s badge`, url: ownerUrl(links, row) }, [stopLine], undefined, { photo, photoAlt: pet });
    }

    case "nurture_ready":
      return compose(`${pet} is in. Voting opens ${row.opens_at ? formatWhen(row.opens_at) : "soon"}`, first, [
        `${pet} is in the gallery, and voting opens ${row.opens_at ? formatWhen(row.opens_at) : "soon"}. Nobody can vote before then, but people can look, so this week is a good time to let them know.`,
        `On ${pet}'s page, tap "Make a share image." You'll get an Instagram or Facebook story, a square post and a flyer to print. The flyer's QR code opens ${pet}'s page.`,
        `When you post on Facebook, use this link, because it shows ${pet}'s photo in the preview: ${shareUrl}`,
      ], { label: `Open ${pet}'s page`, url: ownerUrl(links, row) }, [
        `When people ask: votes come in vote packs, starting at a few dollars. A pack is a purchase, so it isn't a donation and isn't tax-deductible. A share of vote pack sales after refunds goes to the contest's partner shelter.`,
        stopLine,
      ]);

    case "nurture_open":
      return compose(`Voting is open for ${pet}`, first, [
        `The Open Round is open${closes ? `, and voting runs until ${closes}` : ""}. Every approved pet is in it, and the pets with the most votes make the bracket, seeded by their totals.`,
        `Then vote totals reset. Open Round votes decide who makes the bracket and their seeds, and that's all they decide. Every bracket matchup starts at zero.`,
        `The most useful thing you can do today is send ${pet}'s link to the people most likely to vote: family, close friends, coworkers.`,
      ], { label: `Share ${pet}'s page`, url: shareUrl }, [stopLine]);

    case "nurture_halfway": {
      const goal = goalLine(row);
      return compose(
        row.rank != null ? `${pet} is No. ${row.rank} as of this morning` : "Halfway through the Open Round",
        first,
        [
          `We're halfway through the Open Round. As of this morning, ${standingLine(row)}`,
          `The top pets make the bracket when voting closes${closes ? ` ${closes}` : ""}. If two pets tie, the one entered earlier ranks higher.`,
          ...(goal ? [goal] : []),
          `It's a good moment for an update post.`,
        ],
        { label: `Share ${pet}'s page`, url: shareUrl },
        [stopLine],
      );
    }

    case "nurture_last_day": {
      const goal = goalLine(row);
      return compose(`The Open Round closes tonight${closes ? ` at ${closes.replace(/^.*? at /, "")}` : ""}`, first, [
        `The Open Round closes tonight${closes ? `, ${closes}` : ""}. As of this morning, ${standingLine(row)}`,
        `A vote counts if its payment goes through by the deadline. A payment already in progress gets a two-minute grace period, and anything later is refunded automatically, so tell people not to wait for the last minute.`,
        ...(goal ? [goal] : []),
        `An editor finalizes the results shortly after the close, and we'll email you tonight with how ${pet} did.`,
      ], { label: `Share ${pet}'s page`, url: shareUrl }, [stopLine]);
    }

    case "nurture_matchup_last_day": {
      const goal = goalLine(row);
      return compose(`${pet} vs. ${row.opponent_name ?? "its opponent"} closes tonight`, first, [
        `${pet}'s ${row.round_name ?? "bracket"} matchup closes tonight${closes ? `, ${closes}` : ""}. As of this morning, ${matchupLine(row)}`,
        `Both pets started this round at zero, and the one with more votes at the close moves on. Payments have to go through by the deadline; later ones are refunded automatically.`,
        ...(goal ? [goal] : []),
      ], { label: `Share ${pet}'s matchup`, url: matchupUrl }, [stopLine]);
    }

    case "nurture_thanks":
      return compose(`Thank you for entering ${pet}`, first, [
        `The contest is over. ${row.champion_name ?? "The champion"} took the title, and the results page has the whole bracket and the side awards.`,
        `Readers raised ${raised} for local animal shelters. Thank you for entering ${pet} and for every share.`,
        `About your information: we erase entrants' names and email addresses 12 months after the contest. ${pet}'s photo, name and town stay in our coverage, as the rules say.`,
      ], { label: "See the results", url: `${links.publicUrl}#/results` });

    case "entry_rejected":
      return compose(`About ${pet}'s entry`, first, [
        `Thank you for entering ${pet}. We were not able to include this entry in ${row.contest_name}.`,
        `Reason: ${row.rejection_reason ?? "it did not meet the contest rules"}.`,
        `If you think we got it wrong, reply to this email and an editor will take a look.`,
      ]);

    // Last Chance (0032): the pet finished just below the bracket line and
    // races four others for the last seed. rank is its place at the start,
    // field_size the pool's size, cut_margin the votes behind the leader.
    case "last_chance": {
      const others = Math.max(0, (row.field_size ?? 5) - 1);
      const votes = apNumber(row.my_votes ?? 0);
      const behind = row.cut_margin ?? 0;
      return compose(`${pet} gets a Last Chance at the bracket`, first, [
        `${pet} finished${row.rank ? ` No. ${row.rank}` : ""} in the Open Round, just below the bracket line. Now ${pet} and ${apNumber(others)} other pet${others === 1 ? "" : "s"} race for the last spot in the bracket${closes ? `, until ${closes}` : ""}.`,
        behind > 0
          ? `Open Round votes carry over: ${pet} has ${votes}, ${apNumber(behind)} behind the leader. The most votes at the end takes the spot.`
          : `Open Round votes carry over: ${pet} leads with ${votes}. The most votes at the end takes the spot.`,
        `Only the Last Chance pets can get votes now, so a share today goes further than any day of the round:`,
      ], { label: `Share ${pet}'s page`, url: shareUrl });
    }

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
        { label: `Share ${pet}'s matchup`, url: matchupUrl },
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

// A buyer's note: the pets they backed play again, or their run ended, or
// one is the champion. No name, since checkout collects only an address.
export type BuyerNoteRow = {
  email: string;
  contest_name: string;
  round_name: string;
  closes_at: string;
  is_final: boolean;
  playing: { entry_id: string; pet: string; opponent: string | null }[];
  ended: { pet: string; opponent: string | null; round: string }[];
  champion: { entry_id: string; pet: string; opponent: string | null }[];
  raised_cents: number;
};

// AP style: a sentence or a subject line never starts with a numeral.
const spelled = (n: number) => ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][n - 2] ?? String(n);

export function renderBuyerNote(row: BuyerNoteRow, links: Links, unsubscribe: string): Message {
  const raised = dollars(row.raised_cents);
  const closes = formatWhen(row.closes_at);
  const paras: string[] = [];
  let subject: string;
  let button: { label: string; url: string };
  const footer = `You are getting this because you checked a box when you bought votes. One email a round, this contest only. Stop these emails: ${unsubscribe}`;

  if (row.champion.length) {
    const c = row.champion[0];
    subject = `${c.pet} is the champion`;
    paras.push(
      `${c.pet} is the ${row.contest_name}${c.opponent ? `, after beating ${c.opponent} in the Championship` : ""}. Thank you for backing ${c.pet}. Readers raised ${raised} for local animal shelters.`,
    );
    button = { label: "See the results", url: `${links.publicUrl}#/results` };
  } else if (row.playing.length) {
    const p = row.playing;
    subject = p.length === 1 ? `${p[0].pet} plays again: ${row.round_name}${p[0].opponent ? ` vs. ${p[0].opponent}` : ""}` : `${spelled(p.length)} of your pets play again in the ${row.round_name}`;
    paras.push(
      p.length === 1
        ? `You asked us to tell you when ${p[0].pet} plays again. ${p[0].pet} is in the ${row.round_name}${p[0].opponent ? `, facing ${p[0].opponent}` : ""}, and voting closes ${closes}.`
        : `${spelled(p.length)} of the pets you backed play again in the ${row.round_name}:${p.map((x) => `${x.pet}${x.opponent ? ` faces ${x.opponent}` : ""}`).join("; ")}. Voting closes ${closes}.`,
    );
    paras.push(`Vote totals reset every round. The votes you bought counted in the round you bought them in, and every pet starts this one at zero.`);
    button = p.length === 1 ? { label: "See the matchup", url: `${links.publicUrl}#/pet/${p[0].entry_id}` } : { label: "See the bracket", url: `${links.publicUrl}#/bracket` };
  } else {
    const e = row.ended[0];
    subject = `Thanks for backing ${e.pet}`;
    button = { label: "See the bracket", url: `${links.publicUrl}#/bracket` };
  }
  for (const e of row.ended) {
    paras.push(`${e.pet}'s run ended in the ${e.round}${e.opponent ? `, against ${e.opponent}` : ""}. Thank you for your votes.${row.champion.length || row.playing.length ? "" : ` So far the contest has raised ${raised} for local animal shelters.`}`);
  }
  return composeMail(subject, null, paras, button, [], footer, links.newsroom);
}

// The free daily vote. Plain on purpose: the code in the subject, so it shows
// in the notification; no images, no tracking, no shorteners. The link is the
// fallback for a reader who opens the email on another device. It opens a page
// whose button confirms; following it alone casts nothing (mail scanners open
// links).
export function renderFreeVoteCode(p: {
  code: string;
  petName: string;
  contestName: string;
  link: string;
  minutes: number;
  newsroom?: Newsroom;
}): Message {
  return composeMail(`${p.code} is your free vote code`, null, [
    `Your code to vote free for ${p.petName} in ${p.contestName} is ${p.code}. It works for ${p.minutes} minutes.`,
    `Type it where you asked for it, or open this link on any device:`,
  ], { label: `Confirm my vote for ${p.petName}`, url: p.link }, [
    `Didn't ask for this? You can ignore it. Nothing happens without the code.`,
  ], FREE_VOTE_FOOTER, p.newsroom);
}

// The morning reminder, for readers who opted in. No vote-pack pitch: the page
// it opens does that.
export function renderFreeVoteReminder(p: {
  petName: string | null;
  contestName: string;
  roundName: string;
  closesAt: string;
  link: string;
  unsubscribe: string;
  newsroom?: Newsroom;
}): Message {
  const who = p.petName ?? "your favorite";
  return composeMail(
    `Your free vote is ready${p.petName ? `: vote for ${p.petName}` : ""}`,
    null,
    [
      `Your free daily vote in ${p.contestName} has reset. The ${p.roundName} closes ${formatWhen(p.closesAt)}.`,
      `One tap casts it for ${who}:`,
    ],
    { label: p.petName ? `Vote for ${p.petName}` : "Cast my free vote", url: p.link },
    [],
    `${FREE_VOTE_FOOTER} Stop these reminders: ${p.unsubscribe}`,
    p.newsroom,
  );
}

// The one checkout reminder (0033): a buyer ticked "email me once if this
// checkout doesn't finish", and it didn't. Plain truth: nothing was charged,
// nothing is being held, here is the way back before voting closes, and
// this is the only reminder.
export function renderCheckoutReminder(p: {
  petName: string;
  contestName: string;
  roundName: string;
  closesAt: string;
  votes: number;
  cents: number;
  link: string;
  newsroom?: Newsroom;
}): Message {
  const votes = apNumber(p.votes);
  // The exact price: dollars() rounds to whole dollars, fine for totals.
  const price = p.cents % 100 === 0 ? dollars(p.cents) : `$${(p.cents / 100).toFixed(2)}`;
  return composeMail(
    `Still want to vote for ${p.petName}?`,
    null,
    [
      `You started a checkout for ${votes} votes for ${p.petName} (${price}) in ${p.contestName}, but it wasn't finished, so you haven't been charged.`,
      `If you'd still like to vote, the ${p.roundName} is open until ${formatWhen(p.closesAt)}. Vote packs are not tax-deductible.`,
    ],
    { label: `Vote for ${p.petName}`, url: p.link },
    [`If you already finished paying, you can ignore this.`],
    CHECKOUT_FOOTER,
    p.newsroom,
  );
}

const CHECKOUT_FOOTER =
  "You asked for this at checkout: one email if your checkout didn't finish. It is the only reminder you will get for this round.";
const FREE_VOTE_FOOTER = "You are getting this because you asked to vote free in the contest.";
const ENTRANT_FOOTER =
  "You are getting this because you entered a pet in the contest. Vote packs are not tax-deductible donations.";

// A photo above the greeting, and a second, quieter button under the
// first (the owner's page beside "Share").
type Extras = { photo?: string; photoAlt?: string; secondary?: { label: string; url: string } };

function composeMail(
  subject: string,
  first: string | null,
  paragraphs: string[],
  button?: { label: string; url: string },
  after: string[] = [],
  footer = ENTRANT_FOOTER,
  newsroom: Newsroom = DEFAULT_NEWSROOM,
  extras: Extras = {},
): Message {
  const n = newsroom;
  const signature = n.phone ? `${n.name} · ${n.phone}` : n.name;
  // A sentence that ends on "8 p.m." must not end on "8 p.m..": one period
  // after a time, wherever a template adds its own.
  const tidy = (s: string) => s.replace(/(?<!\.)\.\.(?!\.)/g, ".");
  subject = tidy(subject);
  paragraphs = paragraphs.map(tidy);
  after = after.map(tidy);
  const para = (p: string) =>
    `<p style="margin:0 0 16px;font:16px/1.55 Georgia,serif;color:#1a1a1a">${escape(p)}</p>`;

  const html = `<!doctype html><html><body style="margin:0;background:${n.paper}">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;border-top:4px solid #32373c">
<p style="margin:0 0 20px;font:11px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#32373c">${escape(n.name)}</p>
${extras.photo ? `<p style="margin:0 0 20px"><img src="${escape(extras.photo)}" alt="${escape(extras.photoAlt ?? "")}" width="240" style="display:block;width:240px;max-width:100%;height:auto;border-radius:8px;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.18)"></p>` : ""}
${first === null ? "" : `<p style="margin:0 0 16px;font:16px/1.55 Georgia,serif;color:#1a1a1a">Hi ${escape(first)},</p>`}
${paragraphs.map(para).join("\n")}
${button ? `<p style="margin:24px 0"><a href="${escape(button.url)}" style="display:inline-block;padding:12px 20px;background:${n.brand};color:#fff;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,sans-serif;border-radius:4px">${escape(button.label)}</a></p>` : ""}
${after.map(para).join("\n")}
${extras.secondary ? `<p style="margin:8px 0 24px"><a href="${escape(extras.secondary.url)}" style="display:inline-block;padding:11px 18px;border:2px solid ${n.brand};color:${n.brand};text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,sans-serif;border-radius:4px">${escape(extras.secondary.label)}</a></p>` : ""}
<p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e3ddd0;font:12px/1.6 -apple-system,Segoe UI,sans-serif;color:#6b6b6b">${escape(footer)}<br>${escape(signature)}</p>
</div></body></html>`;

  const text = [
    ...(first === null ? [] : [`Hi ${first},`]),
    ...paragraphs,
    ...(button ? [`${button.label}: ${button.url}`] : []),
    ...after,
    ...(extras.secondary ? [`${extras.secondary.label}: ${extras.secondary.url}`] : []),
    "--",
    footer,
    signature,
  ].join("\n\n");

  return { subject, html, text };
}

// AP style, Central time, matching the site: "Wednesday, Oct. 14 at 8 p.m."
const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

export function formatWhen(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour24 = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  let time: string;
  if (minute === 0 && hour24 === 12) time = "noon";
  else if (minute === 0 && hour24 === 0) time = "midnight";
  else {
    const h = hour24 % 12 || 12;
    time = `${h}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour24 < 12 ? "a.m." : "p.m."}`;
  }
  return `${get("weekday")}, ${AP_MONTHS[Number(get("month")) - 1]} ${get("day")} at ${time}`;
}

// AP style: one through nine in words, figures from 10.
const AP_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
export function apNumber(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < 10 ? AP_WORDS[n] : n.toLocaleString("en-US");
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
