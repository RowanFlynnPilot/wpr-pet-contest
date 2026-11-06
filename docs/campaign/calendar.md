# Day-by-day calendar

This extends the promotion calendar in `docs/LAUNCH.md`, section 9, row for
row; nothing here replaces it. Captions named below are in `social.md`,
emails in `emails.md`, and the role codes are in `README.md`.

## How to read it

Days count from entries opening. D1 is the day entries open, and D-14 is two
weeks before it. All times are Central.

`open_submissions` runs on D-14, the morning of the announcement, not on D1.
Until the opening time set in Setup, the site shows a countdown, a calendar
button and what entrants will need, and the database refuses entries; then
the form opens by itself. Run it later and the announcement's links land on an
empty site, because a draft contest is invisible to the public. It freezes the
split and the draft-only switches (free daily vote, Last Chance), so settle
those before D-14. Sprints are not used: no prizes.

| Days | Phase event | What runs it |
| --- | --- | --- |
| D-14 | Announcement | `open_submissions` (Rounds tab) that morning; story, newsletter, social |
| D1 | Entries open for two weeks | By themselves, at the time set in Setup |
| D13 to D14 | Last 48 hours of entries. Entries close D14 at 8 p.m. | |
| D15 | Open Round opens, once the moderation queue is empty, for two weeks | `open_round` (round 1) |
| D26 to D28 | The cut line: last 72 hours of the Open Round | |
| D28 | Open Round closes at 8 p.m. At 8:10, Last Chance starts for places 16 to 20 | Rounds tab, Start Last Chance |
| D29 | Last Chance closes at 8 p.m. Results, then the Sweet 16 opens that night | `close_round`, `open_round` |
| D30 to D33 | Sweet 16, closes D33 at 8 p.m. | |
| D34 to D37 | Elite Eight, closes D37 at 8 p.m. | |
| D38 to D41 | Final Four, closes D41 at 8 p.m. | |
| D42 to D45 | Championship, closes D45 at 8 p.m. The champion that night | `close_round` returns null; the contest is complete |
| D46 | Champion morning | |
| D47 to D54 | Thank-you, check presentation, wrap-up | |

### The 2026 dates (decided Nov. 5: two-week Open Round, four-day bracket rounds)

| Day | Date | What happens |
| --- | --- | --- |
| Before D1 | As soon as the rules are signed off | Announcement. The two-week tease (D-14 to D-1) was planned for Oct. 31; in 2026 it runs in the days left before Nov. 7, so fold the D-14 to D-1 rows into them |
| D1 | Sat., Nov. 7 | Entries open at 6 a.m. |
| D14 | Fri., Nov. 20 | Entries close at 8 p.m. |
| D15 | Sat., Nov. 21 | Open Round opens (gun deer season opens the same day) |
| D20 | Thu., Nov. 26 | Thanksgiving, inside the Open Round. No close, nobody on duty that night |
| D22 | Sat., Nov. 28 | The Open Round's midpoint: the "halfway" entrant email (N3) goes that morning |
| D25 | Tue., Dec. 1 | Giving Tuesday, inside the Open Round |
| D28 | Fri., Dec. 4 | Open Round closes at 8 p.m. At 8:10, Rounds tab > Start Last Chance, closing Sat. 8 p.m.: places 1 to 15 are in, 16 to 20 keep voting for seed 16 |
| D29 | Sat., Dec. 5 | Last Chance closes at 8 p.m.; after 8:10, close round 1; the Sweet 16 opens that night |
| D33 | Wed., Dec. 9 | Sweet 16 closes at 8 p.m.; the Elite Eight opens |
| D37 | Sun., Dec. 13 | Elite Eight closes at 8 p.m.; the Final Four opens |
| D41 | Thu., Dec. 17 | Final Four closes at 8 p.m.; the Championship opens |
| D45 | Mon., Dec. 21 | Championship closes at 8 p.m. The champion that night |
| D46 | Tue., Dec. 22 | Champion morning |
| D49 | Fri., Dec. 25 | Christmas: no contest posts |
| D54 | Wed., Dec. 30 | Wrap-up done |

In Setup: submissions open Nov. 7 at 6 a.m. and close Nov. 20 at 8 p.m.;
"Each bracket round" is 96 hours (four days). In the Open submissions dialog,
set "The Open Round closes at" to Fri., Dec. 4, 8:00 PM (it is prefilled a
week after entries close, Nov. 27). Last Chance is on, so someone is at the
desk at 8:10 p.m. Friday, Dec. 4, to start it, and at 8:10 p.m. Saturday to
close the round.

Giving Tuesday falls inside the Open Round. The newsroom's own
tax-deductible ask can run that day as long as it stays separate from vote
packs (README, the hard rules): vote packs are never donations.

The bracket runs evening to evening because that is what the database does:
`close_round` schedules the next round from the previous close, for
`bracket_round_hours` (96 in 2026). If the desk would rather open each bracket
round the next morning, move the opening-night rows to that morning; the
content doesn't change. Entries to champion is 45 days (two weeks, two weeks
and a day of Last Chance, then four four-day rounds), well past the "two and a
half weeks" in `CLAUDE.md`: the newsroom chose the longer run on Nov. 5. The
cost is the middle of every round going quiet, so each round below has a
mid-round post. Don't add rest days.

Keeping every close at 8 p.m. takes two small steps:

- Round 1's close is set in the Open submissions dialog (2026: Fri., Dec. 4,
  8:00 PM). It is published on the rules page from the announcement on.
- Left alone, a bracket round closes 96 hours after `close_round` ran, which
  lands a few minutes past 8. Pass the closing time when opening it:
  `open_round('<id>', '<D33 8 p.m.>')`. Posted times then stay on the hour.

Two habits shape every closing night:

1. Download the results cards before opening the next round. The Social desk
   shows results only while no round is open. Once the next round opens, it
   shows that round's matchups instead.
2. Refresh the Social desk right before every download, because its numbers
   are stamped with the time they were read. Any count that can still change
   goes out with "as of [time]."

### Assets

| Code | What it is | Where |
| --- | --- | --- |
| SD-Leaderboard | "Leaderboard, top 10" while the Open Round is open; "Open Round final standings" after it closes | Admin desk, Social |
| SD-Bubble | "On the bubble (14 to 20)": ranks 14 to 20, each with its distance from the line | Social, Open Round only |
| SD-Matchup | "[A] vs. [B]", one per matchup, with "[A] leads [B] by [n] votes" | Social, bracket rounds |
| SD-Field | "The [round] is set ([n] pets)" | Social, between rounds |
| SD-Winner | "[Pet] advances to the [round]", one per winner | Social, between rounds |
| SD-Champion | "Champion: [Pet]" | Social, after the final close |
| SD-Raised | "[$] raised", or "More than [$] raised" with the milestone box ticked | Social, once a pack has sold |
| Pet-Story, Pet-Square, Pet-Flyer | A pet page's "Make a share image": 9:16 story, square post, printable flyer with a QR code | Any pet page |
| Gallery | Approved entries' photos, with pet name and town only. The photo release in the rules covers WPR's social use | The gallery |
| Screens | Phone screenshots of the home page, How it works, the bracket, Results (side awards) and Shelters | The contest page |
| Widget | The article widget: default, `view=enter`, `view=leaderboard`, `view=matchup` or `pet=<id>` | `web/EMBED.md` |
| Block | The newsletter block | Admin desk, Newsletter, Build block |

Social desk sizes: Square (1080x1080) for the Facebook feed, Portrait
(1080x1350) for the Instagram feed. There is no 9:16 size. For a Story, set the
Portrait card on a teal (#3A867C) or cream (#F6F2E9) background in Instagram's
editor, or use a pet page's Story image.

Facebook format, unless a row says otherwise: an image post with the link at
the end of the caption. Instagram links go in the bio or on a Story link
sticker.

### Newsletter block schedule

A proposal, to settle the sponsor kit's `[newsletter block schedule]` with
Sales:

- The morning edition carries the block every day from D-14 to D47.
- The afternoon edition carries it too on D1, D14, D15, D28, D29, D33, D37, D41,
  D45 and D46: phase events and closing days.
- Build it when the edition is built. It says what time its numbers are from,
  and a Double Vote Hour starting within 36 hours shows up in it on its own,
  with its sponsor.

The rows below mark the block as AM or AM+PM. The pre-launch table lists it
only on D-14 and D-1; the morning block runs every day in between.

### Article widget placements

| From | Where | Variant |
| --- | --- | --- |
| D-14 | Story template, at the foot of every WPR story | Default, which follows the phase |
| D-14 | The announcement story | `view=enter`. It falls back to the default until entries open |
| D15 | The Open Round story | `view=leaderboard` |
| D30 | The bracket story | `view=matchup` (the round's closest matchup) |
| Any day | A story about one pet: a wildcard, a Final Four profile | `pet=<id>` |
| D46 | The champion story | `pet=<champion id>` |
| D-14, if web staff agree | The home page sidebar | Default |

## Before D-14

- Rules approved and published, and `rulesApproved` flipped in
  `web/src/config.js` (`docs/LAUNCH.md`, section 4).
- Contest created as a draft with the split and Moments Foster Care added
  (Setup tab). The split freezes when submissions open.
- Sponsors signed. Double Vote Hours entered as `bonus_windows` (Packs &
  bonuses tab), so they list on the rules page.
- **A Double Vote Hour at the opening of every round**, sponsored or not:
  the first hour after the Open Round and each bracket round open (Packs &
  bonuses → Bonus windows, ×2). Contest platforms call this an entry
  promotion: it gives the opening post a reason to act now and front-loads
  the round's momentum. Enter them with the rest of the schedule so they
  list on the rules page; the newsletter block and the site bar pick them up
  on their own. If the round's opening time moves, move its window too.
- Sprints, Last Chance and the finale, if WPR uses them: sprints and Last
  Chance are draft-only switches in Setup (sprints after counsel,
  `docs/SPRINTS.md`); the finale is set later in the Rounds tab.
- Widget in the story template. Social desk checked with "sample numbers" (and
  nothing from it posted).
- Owners' toolkit ready to send, comment guidelines drafted, escalation
  contacts filled in (`moderation.md`).

## Pre-launch: D-14 to D-1

Where the table says Screens, the Social desk's **launch** group has a card
ready (Social tab, once the contest's entry dates are set in Setup): the
announcement, the three-card "How it works" carousel, the countdown (which
turns into "Entries open tomorrow"), and in entries week "Entries are open",
"N pets entered so far", "Last 48 hours to enter" and, once entries close,
the field. Each comes square, portrait and Story size (1080x1920, the
backdrop for a countdown sticker), with captions to copy.

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D-14 | Announcement | Admin | Run `open_submissions` before the story posts | Rounds tab | CE | Check Home shows the countdown and the widget says "Entries open Saturday, Nov. 7" |
| D-14 | | WPR story | Article | Screens (home page); Widget `view=enter` | R | Disclosure line: WPR runs the contest; 50% of vote pack sales after refunds goes to Moments Foster Care |
| D-14 | | Facebook | Image post | Screens (home page on a phone) | SE | social.md, Announcement |
| D-14 | | Instagram | Feed post | Screens | SE | Same, link in bio |
| D-14 | | Newsletter | Block, AM | Block ("Entries open soon") | NL | |
| D-14 | | Partner | Partner pack to MFC | Caption, dates, rules link, logo terms from the MOU, the poster (Social desk: The launch, Poster to print) | CE | MFC posts on its own schedule. Drafted Oct. 25 as the "Moments Foster Care Partner Pack" doc; fill its brackets from the MOU |
| D-14 | | Sponsors | Confirm Double Vote Hours | Packs & bonuses tab | Sales, CE | Announce a window only once it's in the schedule |
| D-13 | | Facebook groups | Build the group list; message admins | social.md, Groups playbook | SE | No posting yet |
| D-12 | | Facebook, Instagram | Three-card carousel | Screens (How it works, the reset callout) | SE | social.md, How it works |
| D-11 | | Facebook, Instagram | Partner post | MFC's photo, with permission; Screens (Shelters) | SE, MFC | social.md, Meet Moments. Disclosure line |
| D-10 | | Facebook, Instagram | Photo tips | Staff's own pet photos, labeled as examples | SE, R | social.md, Photo tips |
| D-9 | | Instagram Story | Countdown sticker to D1 | Screens | SE | |
| D-8 | | Open slot | | | SE | Halloween before D1? "Save your costume photos" (see Dates to plan around) |
| D-7 | | Facebook | Image post | Screens (home page pack card) | SE | social.md, What a vote pack is |
| D-6 | | Prep | Toolkit page published; approval email tested end to end | | CE | |
| D-5 | | Facebook, Instagram | Sponsor thank-you | Sponsor's own artwork | SE, Sales | Only if a package includes it. Labeled |
| D-4 | | Open slot | | | SE | |
| D-3 | | Instagram Story | Countdown sticker; question box, "What's your pet's best trick?" | Screens | SE | Answers arrive as DMs; reply by hand |
| D-2 | | Prep | Comment guidelines ready to pin; entries-week moderation rota | | CE, SE | |
| D-1 | Day before | Facebook, Instagram, Story | Image post and Story | Screens | SE | social.md, Entries open tomorrow |
| D-1 | | Newsletter | Block, AM | Block | NL | |

## Entries: D1 to D14

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Entries open | Admin | Nothing to run: the form opens at [time] | Rounds tab | CE | Check the widget and block now say entries are open |
| D1 | | WPR story | Brief | Widget `view=enter` | R | Disclosure line |
| D1 | | Facebook | Image post; pin the comment guidelines | Screens (Enter page) | SE | social.md, Entries open |
| D1 | | Instagram | Feed post, plus a Story with a link sticker | Screens | SE | |
| D1 | | Newsletter | Block, AM+PM | Block ("Entries open", count so far) | NL | |
| D1 | | Facebook groups | First WPR post, only where admins said yes | | SE | social.md, Groups playbook |
| D1 | | Partner | MFC posts the entry call | Partner pack | MFC | |
| D2 | | Moderation | Clear the queue at least twice a day | Moderation tab; Email tab to confirm sends | CE | Approval emails go out on their own |
| D2 | | Facebook, Instagram | Carousel of first entries (5 to 10 pets) | Gallery | SE | social.md, New entries |
| D2 | | Newsletter | Block, AM | Block | NL | |
| D3 | | Email | N1 to entrants approved at least 24 hours ago, then daily for new approvals | | CE | emails.md, N1 |
| D3 | | Instagram Story | "This morning's entries," one pet a frame, link sticker to enter | Pet-Story or Gallery | SE | |
| D3 | | Newsletter | Block, AM | Block | NL | |
| D4 | | Facebook, Instagram | Wildcard spotlight | Pet-Square of the wildcard | SE, MFC | Only if MFC entered foster pets |
| D4 | | WPR story | Optional foster-pet feature | Widget `pet=<id>` | R | Disclosure line |
| D4 | | Newsletter | Block, AM | Block | NL | |
| D5 | | Facebook | New entries carousel | Gallery | SE | social.md, New entries |
| D5 | | Open slot | | | SE | |
| D5 | | Newsletter | Block, AM | Block | NL | |
| D6 to D12 | Entries, second week | All | The first week's rhythm again: the queue cleared twice a day, a new-entries carousel every other day, N1 to new approvals, the newsletter block each morning | Gallery; Moderation tab | CE, SE, NL | The middle of a two-week window goes quiet without it. A mid-window count post ("[N] pets in, one week left") on D8 |
| D13 | Last 48 hours | Facebook, Instagram | Image post with the real close time | Gallery | SE | social.md, Last 48 hours |
| D13 | | Instagram Story | Countdown sticker to the close | | SE | |
| D13 | | Newsletter | Block, AM | Block | NL | |
| D14 | Entries close at [time] | Facebook, Story | Morning post | Gallery | SE | social.md, Last day to enter |
| D14 | | Newsletter | Block, AM+PM | Block ("Entries closed") | NL | |
| D14 | | Moderation | Clear every pending entry | Moderation tab | CE | `open_round` refuses while anything is pending, or with fewer than 16 approved |
| D14 | | Facebook | After the close: "[N] pets. Voting opens [day, time]." | Gallery collage | SE | |

## Open Round: D15 to D28

Two weeks, with Thanksgiving and Giving Tuesday inside. The first week builds
the leaderboard; the second is the cut line.

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D15 | Open Round opens | Admin | `open_round` (round 1), first thing, keeping its close at D28, 8 p.m. | Rounds tab | CE | Checkout starts the moment it opens |
| D15 | | Facebook | Album of the field (up to 10 photos) | Gallery | SE | social.md, Open Round opens |
| D15 | | Instagram | Carousel, plus a three-frame "how to vote" Story | Gallery; Screens | SE | |
| D15 | | WPR story | "Voting opens: meet the field" | Widget `view=leaderboard` | R | Disclosure line |
| D15 | | Email | N2 to every approved entrant | | CE | emails.md, N2 |
| D15 | | Newsletter | Block, AM+PM | Block (Open Round leaderboard) | NL | |
| D15 | | Facebook groups | Second WPR post per group | | SE | |
| D15 | | Free vote | Free votes tab, checked daily from today | | CE | Reminders send each morning on their own |
| D16 | | Facebook, Instagram | "Top 10 right now, as of [time]" | SD-Leaderboard | SE | social.md, Leaderboard |
| D16 | | Instagram Story | Quiz sticker: "Do Open Round votes carry into the bracket?" (No) | SD-Leaderboard | SE | |
| D17 | | Facebook, Instagram | On the bubble | SD-Bubble | SE | social.md, Cut line (early) |
| D18 | Double Vote Hour [if scheduled] | Facebook, Instagram | Morning notice, labeled | SD-Leaderboard | SE, Sales | social.md, Double Vote Hour |
| D18 | | Instagram Story | At the start of the hour: countdown sticker to its end, link sticker | | SE | |
| D19 | | Facebook | New faces: three pets from the middle of the board, not the top | Pet-Square | SE | Spreads attention past the leaders |
| D20 | Thanksgiving | Facebook, Instagram | One post, scheduled the day before: "Thankful for [N] pets" | Gallery collage | SE | No numbers, no close, nobody on duty that night |
| D21 | Black Friday | Facebook, Instagram | Leaderboard, as of [time] | SD-Leaderboard | SE | A labeled sponsor thank-you fits here if a package includes it |
| D22 | Halfway | Facebook, Instagram | "Halfway through the Open Round: the top 10" | SD-Leaderboard | SE | social.md, Leaderboard |
| D22 | | Email | N3 to approved entrants, the halfway note | | CE | emails.md, N3. Goes on its own that morning |
| D22 | | Facebook | Shelter milestone, if one has been crossed | SD-Raised (milestone) | SE | social.md, Shelter total |
| D23 | | Facebook, Instagram | On the bubble, as of [time] | SD-Bubble | SE | |
| D24 | Double Vote Hour [if scheduled] | Facebook, Instagram, Stories | Morning notice and start-of-hour Story | SD-Leaderboard | SE, Sales | social.md, Double Vote Hour |
| D25 | Giving Tuesday | Facebook | Leaderboard only | SD-Leaderboard | SE | Keep vote packs out of WPR's own giving ask (Dates to plan around) |
| D26 | Cut line begins | Facebook, Instagram | "On the bubble, as of [time]" | SD-Bubble | SE | social.md, Cut line |
| D26 | | Instagram Story | Bubble and a countdown sticker to D28, 8 p.m. | SD-Bubble | SE | |
| D27 | | Facebook, Instagram | Bubble, plus "closes tomorrow at 8 p.m." | SD-Bubble | SE | |
| D27 | | Reel prep | Shoot b-roll for the bracket reveal | | R | social.md, Reel 1. Nothing with numbers yet |
| D28 | Open Round last day | Facebook, Instagram | Morning: "closes tonight at 8 p.m." | SD-Bubble | SE | social.md, Cut line (last day) |
| D28 | | Email | N4 | | CE | emails.md, N4 |
| D28 | | Instagram Story | Bubble updates through the day; countdown sticker | SD-Bubble | SE | |
| D28 | | Newsletter | Block, AM+PM | Block | NL | |
| D28 | | Contest page, Stories | Double Vote Hour on the last evening [if sold], presented by [Sponsor] | Stories frame 5 | Sales, SE | social.md, Double Vote Hour |
| D28 | 8 p.m. close | Admin | At 8:10 p.m.: Rounds tab > Start Last Chance, closing D29 at 8 p.m. The pool's owners get their email straight away | Rounds tab | CE | Places 1 to 15 are in the bracket; 16 to 20 keep voting |
| D28 | | Facebook, Instagram | Night: "15 are in. Five pets, one spot, 24 hours" | Social desk, Last Chance cards | SE | social.md, Last Chance |

The newsletter block runs every morning of the round (Newsletter block
schedule, above).

## Last Chance: D29

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D29 | Last Chance | Facebook, Instagram | Morning: the five, as of [time] | Social desk, Last Chance cards | SE | social.md, Last Chance |
| D29 | | Instagram Story | The five, one a frame, countdown sticker to 8 p.m. | Pet-Story | SE | |
| D29 | | Newsletter | Block, AM+PM | Block | NL | |
| D29 | 8 p.m. close | Admin | After 8:10 p.m.: `close_round`; check `late_confirmations` and `rejected_photos_live` | Rounds and Health tabs | CE | Advancement and elimination emails go out on the sweep |
| D29 | | Admin | Refresh the Social desk; download "Open Round final standings," "The Sweet 16 is set (16 pets)" and the 16 winner cards | SD-Leaderboard, SD-Field, SD-Winner | CE | Before opening the Sweet 16 |
| D29 | | Admin | `open_round` (Sweet 16), closing D33 at 8 p.m. | Rounds tab | CE | |
| D29 | | Facebook, Instagram | Night: "The Sweet 16 is set" | SD-Field, with final standings as a second image | SE | social.md, Round results |

## Bracket: D30 to D45

Each round follows the same four-day pattern: matchup day, a standings post,
a mid-round push, then the last day and the close.

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D30 | Sweet 16 day 1: the bracket reveal | Instagram, Facebook, TikTok if WPR has it | Reel | Screens (bracket); SD-Field; Gallery | R | social.md, Reel 1 |
| D30 | | Facebook | Album of all eight matchups | SD-Matchup x8 (Square) | SE | social.md, Matchup day |
| D30 | | Instagram | Carousel of eight matchups | SD-Matchup x8 (Portrait) | SE | |
| D30 | | Instagram and Facebook Stories | Matchup-day sequence | SD-Matchup | SE | social.md, Stories |
| D30 | | WPR story | "Meet the Sweet 16" | Widget `view=matchup` | R | Disclosure line |
| D30 | | Newsletter | Block, AM | Block ("The Sweet 16 is on") | NL | |
| D30 | | Facebook groups | Third WPR post per group: the bracket | | SE | |
| D30 | | Email | B1 to opted-in buyers | | CE | emails.md, B1 |
| D31 | | Facebook, Instagram | The closest three matchups, as of [time] | SD-Matchup | SE | |
| D32 | Mid-round | Facebook, Instagram | Upset watch if a lower seed leads; otherwise a Double Vote Hour [if scheduled] | SD-Matchup | SE, Sales | social.md, Reel 2 or Double Vote Hour |
| D33 | Sweet 16 last day | Facebook, Instagram | Morning album, cards as of [time] | SD-Matchup | SE | social.md, Matchup last day |
| D33 | | Email | N5 to entrants still in | | CE | emails.md, N5 |
| D33 | | Stories | Last-day sequence | SD-Matchup | SE | |
| D33 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | social.md, Double Vote Hour |
| D33 | | Newsletter | Block, AM+PM | Block | NL | |
| D33 | 8 p.m. close | Admin | Close routine as on D29; download "The Elite Eight is set (8 pets)" and eight winner cards; `open_round` (Elite Eight), closing D37 at 8 p.m. | SD-Field, SD-Winner | CE | |
| D33 | | Facebook, Instagram | Night: "The Elite Eight is set," plus an upset post if a lower seed won | SD-Field, SD-Winner | SE | social.md, Round results; Upset |
| D34 | Elite Eight day 1 | Facebook, Instagram | Four matchups | SD-Matchup x4 | SE | social.md, Matchup day |
| D34 | | Reel | Reel 2, results version, if the Sweet 16 had an upset | SD-Winner | R | |
| D34 | | Stories, Email, Newsletter | Matchup-day sequence; B1; block, AM | | SE, CE, NL | |
| D35 | | Facebook, Instagram | Standings, as of [time] | SD-Matchup | SE | |
| D36 | Mid-round | Facebook, Instagram | The closest matchup, or a Double Vote Hour [if scheduled] | SD-Matchup | SE, Sales | |
| D37 | Elite Eight last day | Facebook, Instagram, Stories | Morning album and last-day sequence | SD-Matchup | SE | |
| D37 | | Email | N5 | | CE | |
| D37 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | |
| D37 | | Newsletter | Block, AM+PM | Block | NL | |
| D37 | 8 p.m. close | Admin, Facebook, Instagram | Close routine; "The Final Four is set (4 pets)"; `open_round` (Final Four), closing D41 at 8 p.m. | SD-Field, SD-Winner | CE, SE | |
| D38 | Final Four day 1 | Facebook, Instagram | Two matchups | SD-Matchup x2 | SE | |
| D38 | | WPR story | Optional Final Four profiles | Widget `pet=<id>` or `view=matchup` | R | |
| D38 | | Stories, Email, Newsletter | Matchup-day sequence; B1; block, AM | | SE, CE, NL | |
| D39 | | Facebook | Shelter milestone, if crossed | SD-Raised (milestone) | SE | |
| D40 | Mid-round | Facebook, Instagram | Standings, as of [time], or a Double Vote Hour [if scheduled] | SD-Matchup | SE, Sales | |
| D41 | Final Four last day | Facebook, Instagram, Stories | Morning post and last-day sequence | SD-Matchup | SE | |
| D41 | | Email | N5 | | CE | |
| D41 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | |
| D41 | | Newsletter | Block, AM+PM | Block | NL | |
| D41 | 8 p.m. close | Admin, Facebook, Instagram | Close routine; "The Championship is set (2 pets)"; `open_round` (Championship), closing D45 at 8 p.m. | SD-Field, SD-Winner | CE, SE | Rounds tab > The finale: set the live reveal for D45 if WPR streams it |
| D42 | Championship day 1 | Facebook, Instagram | "[A] vs. [B] for the title" | SD-Matchup | SE | social.md, Matchup day (Championship) |
| D42 | | WPR story | Championship preview | Widget `view=matchup` | R | |
| D42 | | Stories, Email, Newsletter | Matchup-day sequence; B1; block, AM | | SE, CE, NL | |
| D43 | | Facebook, Instagram | "As of [time]" standings | SD-Matchup | SE | |
| D44 | Mid-round | Facebook, Instagram | Each finalist's road to the final, one post each | The pet pages | SE | |
| D45 | Championship last day | Facebook, Instagram, Stories | Morning post and last-day sequence | SD-Matchup | SE | |
| D45 | | Email | N5 | | CE | |
| D45 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | |
| D45 | | Newsletter | Block, AM+PM | Block | NL | |
| D45 | 8 p.m. close | Admin | `close_round` returns null and the contest is complete. Health checks. Download the champion card and the exact shelter total | SD-Champion, SD-Raised | CE | The champion email goes out on the sweep |
| D45 | | Facebook, Instagram | Night: "[Pet] is the champion" | SD-Champion | SE | social.md, Champion |

The newsletter block runs every morning of the bracket too.

## Champion and thank-you: D46 to D54

Christmas (D49) falls in the middle. Get the thank-you out before it and the
payout statement printed; the check presentation can slip to the first week
of January if Moments prefers.

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D46 | Champion morning | Instagram, Facebook, TikTok if WPR has it | Reel | SD-Champion; the pet page's road to the crown; SD-Raised | R | social.md, Reel 3 |
| D46 | | WPR story | Champion story with photos | Widget `pet=<champion id>` | R | Disclosure line. No owner names in campaign copy |
| D46 | | Facebook, Instagram | Side awards: Best Dog, Best Cat, Best Other | Screens (Results) | SE | social.md, Side awards |
| D46 | | Facebook, Instagram | Shelter total | SD-Raised (exact) | SE | social.md, Shelter total |
| D46 | | Newsletter | Block, AM+PM | Block ("Meet the [year] champion") | NL | |
| D46 | | Facebook groups | Fourth and last WPR post per group | | SE | |
| D47 | | Email | N6 thank-you to entrants | | CE | emails.md, N6 |
| D47 | | Facebook | Thank-you to entrants, voters, Moments and sponsors | Gallery collage | SE | social.md, Thank you. Sponsors labeled |
| D47 | | Newsletter | Block, AM, the last one | Block | NL | |
| D48 | | Admin | Print the payout statement; download the archive; export the newsletter list | Wrap-up tab | CE | |
| D48 | | Sales | Sponsor report from `round_revenue` and sponsor clicks | | Sales | |
| D50 to D54 | Check presentation at [date] | Facebook, Instagram | Photo post | Staff photo with MFC | R, SE | Payout statement in hand. Or the first week of January |
| D50 to D54 | | WPR story | Wrap-up: the total and the statement's top lines | | R | Disclosure line |
| D50 to D54 | | Newsletter list | Thank-you email to newsletter opt-ins | | NL | WPR's own ask goes here, separate from vote packs (`docs/LAUNCH.md`, section 9, After) |
| D54 | | Debrief | KPIs against targets; next year's changes; switch `HEALTH_CHECKS` off | | CE, EIC | |
| D+365 | | Admin | Erase personal data | Wrap-up tab | CE | The rules promise it |

## The free daily vote (on in 2026)

The rows above assume it, as the D15 row says:

- CE checks the Free votes tab and any `free_vote_*` warning on the Health tab
  every day of voting, and after every close.
- Morning reminders go out on their own to readers who asked for them.
  `emails.md`, part C, has the copy.
- Posts and owner emails may mention "one free vote a day": counsel signed off
  on the rules on Nov. 5. Vote packs stay the main ask.

## Dates to plan around

The contest runs from early November to the week before Christmas.

| Date (2026) | What | What to do |
| --- | --- | --- |
| Sat., Oct. 31 | Halloween | During entries: costume photos are welcome as entries, one photo per pet. During voting: a costume-parade carousel of approved entries already in costume. Never ask owners to change an entered photo |
| Wed., Nov. 11 | Veterans Day | Regular contest posts are fine. No themed posts and no tie-ins |
| Nov. 21 to 29 (check the DNR's dates) | Gun deer season | The Open Round's first week. Plenty of readers are in the woods; the cut line comes after it |
| Thu., Nov. 26 | Thanksgiving | Inside the Open Round: one scheduled post, no close, nobody on duty that night |
| Fri., Nov. 27, and Sat., Nov. 28 | Black Friday, Small Business Saturday | A natural thank-you to local sponsors, labeled, if sponsors want it |
| Tue., Dec. 1 | Giving Tuesday | Keep vote packs out of it entirely. Packs are purchases, not gifts. If Moments runs its own Giving Tuesday campaign, it is Moments' to promote |
| Mon., Dec. 21 | The Championship closes | A weeknight, four days before Christmas. Champion posts go out the next morning |
| Thu., Dec. 24, and Fri., Dec. 25 | Christmas Eve and Christmas | No contest posts. The thank-you goes out before (D47) |

Placing D1, for future years:

- No close on Election Day or on Thanksgiving Day.
- The Championship should close on a weeknight.
- 2026 runs 45 days by choice (Nov. 5). A shorter year keeps to the
  two-and-a-half weeks in `CLAUDE.md`.
- Every close needs a CE on duty at 8 p.m.
