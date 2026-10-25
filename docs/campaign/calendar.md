# Day-by-day calendar

This extends the promotion calendar in `docs/LAUNCH.md`, section 9, row for
row; nothing here replaces it. Captions named below are in `social.md`,
emails in `emails.md`, and the role codes are in `README.md`.

## How to read it

Days count from entries opening. D1 is the day `open_submissions` runs, and
D-14 is two weeks before it. All times are Central.

| Days | Phase event | What runs it |
| --- | --- | --- |
| D-14 | Announcement | Story, newsletter, social |
| D1 | Entries open for a week | `open_submissions` (Setup) |
| D6 to D7 | Last 48 hours of entries. Entries close D7 at [time] | |
| D8 | Open Round opens, once the moderation queue is empty | `open_round` (round 1) |
| D12 to D14 | The cut line: last 72 hours of the Open Round | |
| D14 | Open Round closes at 8 p.m. Results, then the Sweet 16 opens that night | `close_round`, `open_round` |
| D15 to D16 | Sweet 16, closes D16 at 8 p.m. | |
| D17 to D18 | Elite Eight, closes D18 at 8 p.m. | |
| D19 to D20 | Final Four, closes D20 at 8 p.m. | |
| D21 to D22 | Championship, closes D22 at 8 p.m. The champion that night | `close_round` returns null; the contest is complete |
| D23 | Champion morning | |
| D24 to D29 | Thank-you, check presentation, wrap-up | |

### The 2026 dates (decided Oct. 24: entries open Saturday, Nov. 14)

| Day | Date | What happens |
| --- | --- | --- |
| D-14 | Sat., Oct. 31 (Halloween) | Announcement. The "before D-14" prep is the week of Oct. 26 |
| D1 | Sat., Nov. 14 | Entries open |
| D7 | Fri., Nov. 20 | Entries close at [time] |
| D8 | Sat., Nov. 21 | Open Round opens (gun deer season opens the same day) |
| D13 | Thu., Nov. 26 | Thanksgiving, inside the Open Round |
| D14 | Fri., Nov. 27 | Open Round closes at 8 p.m.; Sweet 16 opens that night |
| D16 | Sun., Nov. 29 | Sweet 16 closes at 8 p.m. |
| D18 | Tue., Dec. 1 (Giving Tuesday) | Elite Eight closes at 8 p.m. |
| D20 | Thu., Dec. 3 | Final Four closes at 8 p.m. |
| D22 | Sat., Dec. 5 | Championship closes at 8 p.m. The champion that night |
| D23 | Sun., Dec. 6 | Champion morning |
| D29 | Sat., Dec. 12 | Wrap-up done |

In Setup: submissions open Nov. 14 and close Nov. 20 at [time]; pass
`2026-11-27 20:00 America/Chicago` as `open_submissions`' second argument so
the Open Round closes at 8 p.m.

Giving Tuesday lands on the Elite Eight's last day. The newsroom's own
tax-deductible ask can run that day as long as it stays separate from vote
packs (README, the hard rules): vote packs are never donations.

The bracket runs evening to evening because that is what the database does:
`close_round` schedules the next round from the previous close, for
`bracket_round_hours` (48). If the desk would rather open each bracket round
the next morning, move the opening-night rows to that morning; the content
doesn't change. Entries to champion is 22 days (a week, a week, then four
two-day rounds), a little over the "two and a half weeks" in `CLAUDE.md`.
Don't add rest days.

Keeping every close at 8 p.m. takes two small steps:

- Round 1 closes a week after entries close. If entries close at some other
  hour, give `open_submissions` the 8 p.m. closing time as its second argument.
- Left alone, a bracket round closes 48 hours after `close_round` ran, which
  lands a few minutes past 8. Pass the closing time when opening it:
  `open_round('<id>', '<D16 8 p.m.>')`. Posted times then stay on the hour.

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

- The morning edition carries the block every day from D-14 to D24.
- The afternoon edition carries it too on D1, D7, D8, D14, D16, D18, D20, D22
  and D23: phase events and closing days.
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
| D8 | The Open Round story | `view=leaderboard` |
| D15 | The bracket story | `view=matchup` (the round's closest matchup) |
| Any day | A story about one pet: a wildcard, a Final Four profile | `pet=<id>` |
| D23 | The champion story | `pet=<champion id>` |
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

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D-14 | Announcement | WPR story | Article | Screens (home page); Widget `view=enter` | R | Disclosure line: WPR runs the contest; 50% of vote pack sales after refunds goes to Moments Foster Care |
| D-14 | | Facebook | Image post | Screens (home page on a phone) | SE | social.md, Announcement |
| D-14 | | Instagram | Feed post | Screens | SE | Same, link in bio |
| D-14 | | Newsletter | Block, AM | Block ("Entries open soon") | NL | |
| D-14 | | Partner | Partner pack to MFC | Caption, dates, rules link, logo terms from the MOU | CE | MFC posts on its own schedule |
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

## Entries week: D1 to D7

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Entries open | Admin | Run `open_submissions` at [time] | Setup tab | CE | Check the widget and block now say entries are open |
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
| D6 | Last 48 hours | Facebook, Instagram | Image post with the real close time | Gallery | SE | social.md, Last 48 hours |
| D6 | | Instagram Story | Countdown sticker to the close | | SE | |
| D6 | | Newsletter | Block, AM | Block | NL | |
| D7 | Entries close at [time] | Facebook, Story | Morning post | Gallery | SE | social.md, Last day to enter |
| D7 | | Newsletter | Block, AM+PM | Block ("Entries closed") | NL | |
| D7 | | Moderation | Clear every pending entry | Moderation tab | CE | `open_round` refuses while anything is pending, or with fewer than 16 approved |
| D7 | | Facebook | After the close: "[N] pets. Voting opens [day, time]." | Gallery collage | SE | |

## Open Round: D8 to D14

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D8 | Open Round opens | Admin | `open_round` (round 1), first thing | Rounds tab | CE | Checkout starts the moment it opens |
| D8 | | Facebook | Album of the field (up to 10 photos) | Gallery | SE | social.md, Open Round opens |
| D8 | | Instagram | Carousel, plus a three-frame "how to vote" Story | Gallery; Screens | SE | |
| D8 | | WPR story | "Voting opens: meet the field" | Widget `view=leaderboard` | R | Disclosure line |
| D8 | | Email | N2 to every approved entrant | | CE | emails.md, N2 |
| D8 | | Newsletter | Block, AM+PM | Block (Open Round leaderboard) | NL | |
| D8 | | Facebook groups | Second WPR post per group | | SE | |
| D8 | | [IF FREE VOTE ON] | Free votes tab, checked daily from today | | CE | Reminders send each morning on their own |
| D9 | | Facebook, Instagram | "Top 10 right now, as of [time]" | SD-Leaderboard | SE | social.md, Leaderboard |
| D9 | | Instagram Story | Quiz sticker: "Do Open Round votes carry into the bracket?" (No) | SD-Leaderboard | SE | |
| D9 | | Newsletter | Block, AM | Block | NL | |
| D10 | | Facebook, Instagram | On the bubble | SD-Bubble | SE | social.md, Cut line (early) |
| D10 | | Newsletter | Block, AM | Block | NL | |
| D11 | Double Vote Hour [if scheduled] | Facebook, Instagram | Morning notice, labeled | SD-Leaderboard | SE, Sales | social.md, Double Vote Hour |
| D11 | | Instagram Story | At the start of the hour: countdown sticker to its end, link sticker | | SE | |
| D11 | | Email | N3 to approved entrants | | CE | emails.md, N3 |
| D11 | | Newsletter | Block, AM | Block (shows the bonus line itself) | NL | |
| D12 | Cut line begins | Facebook, Instagram | "On the bubble, as of [time]" | SD-Bubble | SE | social.md, Cut line |
| D12 | | Facebook | Shelter milestone, if one has been crossed | SD-Raised (milestone) | SE | social.md, Shelter total |
| D12 | | Newsletter | Block, AM | Block | NL | |
| D13 | | Facebook, Instagram | Bubble, plus "closes tomorrow at 8 p.m." | SD-Bubble | SE | |
| D13 | | Instagram Story | Leaderboard and a countdown sticker | SD-Leaderboard | SE | |
| D13 | | Reel prep | Shoot b-roll for the bracket reveal | | R | social.md, Reel 1. Nothing with numbers yet |
| D13 | | Newsletter | Block, AM | Block | NL | |
| D14 | Open Round last day | Facebook, Instagram | Morning: "closes tonight at 8 p.m." | SD-Bubble | SE | social.md, Cut line (last day) |
| D14 | | Email | N4 | | CE | emails.md, N4 |
| D14 | | Instagram Story | Bubble updates through the day; countdown sticker | SD-Bubble | SE | |
| D14 | | Newsletter | Block, AM+PM | Block | NL | |
| D14 | | Contest page, Stories | Double Vote Hour on the last evening [if sold], presented by [Sponsor] | Stories frame 5 | Sales, SE | social.md, Double Vote Hour |
| D14 | 8 p.m. close | Admin | After 8:10 p.m.: `close_round`; check `late_confirmations` and `rejected_photos_live` | Rounds and Health tabs | CE | Advancement and elimination emails go out on the sweep |
| D14 | | Admin | Refresh the Social desk; download "Open Round final standings," "The Sweet 16 is set (16 pets)" and the 16 winner cards | SD-Leaderboard, SD-Field, SD-Winner | CE | Before opening the Sweet 16 |
| D14 | | Admin | `open_round` (Sweet 16), closing D16 at 8 p.m. | Rounds tab | CE | |
| D14 | | Facebook, Instagram | Night: "The Sweet 16 is set" | SD-Field, with final standings as a second image | SE | social.md, Round results |

## Bracket: D15 to D22

Each round follows the same two-day pattern: matchup day, then last day and
the close.

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D15 | Sweet 16 day 1: the bracket reveal | Instagram, Facebook, TikTok if WPR has it | Reel | Screens (bracket); SD-Field; Gallery | R | social.md, Reel 1 |
| D15 | | Facebook | Album of all eight matchups | SD-Matchup x8 (Square) | SE | social.md, Matchup day |
| D15 | | Instagram | Carousel of eight matchups | SD-Matchup x8 (Portrait) | SE | |
| D15 | | Instagram and Facebook Stories | Matchup-day sequence | SD-Matchup | SE | social.md, Stories |
| D15 | | WPR story | "Meet the Sweet 16" | Widget `view=matchup` | R | Disclosure line |
| D15 | | Newsletter | Block, AM | Block ("The Sweet 16 is on") | NL | |
| D15 | | Facebook groups | Third WPR post per group: the bracket | | SE | |
| D15 | | Email | B1 to opted-in buyers [if built] | | CE | emails.md, B1 |
| D16 | Sweet 16 last day | Facebook, Instagram | Morning album, cards as of [time] | SD-Matchup | SE | social.md, Matchup last day |
| D16 | | Email | N5 to entrants still in | | CE | emails.md, N5 |
| D16 | | Stories | Last-day sequence | SD-Matchup | SE | |
| D16 | | Open slot | Reel 2, upset watch, if a lower seed leads late | SD-Matchup | R | social.md, Reel 2 |
| D16 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | social.md, Double Vote Hour |
| D16 | | Newsletter | Block, AM+PM | Block | NL | |
| D16 | 8 p.m. close | Admin | Close routine as on D14; download "The Elite Eight is set (8 pets)" and eight winner cards; `open_round` (Elite Eight) | SD-Field, SD-Winner | CE | |
| D16 | | Facebook, Instagram | Night: "The Elite Eight is set," plus an upset post if a lower seed won | SD-Field, SD-Winner | SE | social.md, Round results; Upset |
| D17 | Elite Eight day 1 | Facebook, Instagram | Four matchups | SD-Matchup x4 | SE | social.md, Matchup day |
| D17 | | Reel | Reel 2, results version, if the Sweet 16 had an upset | SD-Winner | R | |
| D17 | | Stories | Matchup-day sequence | SD-Matchup | SE | |
| D17 | | Email | B1 [if built] | | CE | |
| D17 | | Newsletter | Block, AM | Block | NL | |
| D18 | Elite Eight last day | Facebook, Instagram, Stories | Morning album and last-day sequence | SD-Matchup | SE | |
| D18 | | Email | N5 | | CE | |
| D18 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | |
| D18 | | Newsletter | Block, AM+PM | Block | NL | |
| D18 | 8 p.m. close | Admin, Facebook, Instagram | Close routine; "The Final Four is set (4 pets)" | SD-Field, SD-Winner | CE, SE | |
| D19 | Final Four day 1 | Facebook, Instagram | Two matchups | SD-Matchup x2 | SE | |
| D19 | | WPR story | Optional Final Four profiles | Widget `pet=<id>` or `view=matchup` | R | |
| D19 | | Facebook | Shelter milestone, if crossed | SD-Raised (milestone) | SE | |
| D19 | | Stories, Email, Newsletter | Matchup-day sequence; B1; block, AM | | SE, CE, NL | |
| D20 | Final Four last day | Facebook, Instagram, Stories | Morning post and last-day sequence | SD-Matchup | SE | |
| D20 | | Email | N5 | | CE | |
| D20 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | |
| D20 | | Newsletter | Block, AM+PM | Block | NL | |
| D20 | 8 p.m. close | Admin, Facebook, Instagram | Close routine; "The Championship is set (2 pets)" | SD-Field, SD-Winner | CE, SE | |
| D21 | Championship day 1 | Facebook, Instagram | "[A] vs. [B] for the title" | SD-Matchup | SE | social.md, Matchup day (Championship) |
| D21 | | WPR story | Championship preview | Widget `view=matchup` | R | |
| D21 | | Stories, Email, Newsletter | Matchup-day sequence; B1; block, AM | | SE, CE, NL | |
| D22 | Championship last day | Facebook, Instagram, Stories | Morning post and last-day sequence | SD-Matchup | SE | |
| D22 | | Email | N5 | | CE | |
| D22 | | Contest page, Stories | Double Vote Hour on the final evening, presented by [Sponsor] | Stories frame 5 | Sales, SE | |
| D22 | | Newsletter | Block, AM+PM | Block | NL | |
| D22 | 8 p.m. close | Admin | `close_round` returns null and the contest is complete. Health checks. Download the champion card and the exact shelter total | SD-Champion, SD-Raised | CE | The champion email goes out on the sweep |
| D22 | | Facebook, Instagram | Night: "[Pet] is the champion" | SD-Champion | SE | social.md, Champion |

## Champion and thank-you: D23 to D29

| Day | Event | Channel | Format | Asset | Owner | Copy and notes |
| --- | --- | --- | --- | --- | --- | --- |
| D23 | Champion morning | Instagram, Facebook, TikTok if WPR has it | Reel | SD-Champion; the pet page's road to the crown; SD-Raised | R | social.md, Reel 3 |
| D23 | | WPR story | Champion story with photos | Widget `pet=<champion id>` | R | Disclosure line. No owner names in campaign copy |
| D23 | | Facebook, Instagram | Side awards: Best Dog, Best Cat, Best Other | Screens (Results) | SE | social.md, Side awards |
| D23 | | Facebook, Instagram | Shelter total | SD-Raised (exact) | SE | social.md, Shelter total |
| D23 | | Newsletter | Block, AM+PM | Block ("Meet the [year] champion") | NL | |
| D23 | | Facebook groups | Fourth and last WPR post per group | | SE | |
| D24 | | Email | N6 thank-you to entrants | | CE | emails.md, N6 |
| D24 | | Facebook | Thank-you to entrants, voters, Moments and sponsors | Gallery collage | SE | social.md, Thank you. Sponsors labeled |
| D24 | | Newsletter | Block, AM, the last one | Block | NL | |
| D25 | | Admin | Print the payout statement; download the archive; export the newsletter list | Wrap-up tab | CE | |
| D25 | | Sales | Sponsor report from `round_revenue` and sponsor clicks | | Sales | |
| D26 to D29 | Check presentation at [date] | Facebook, Instagram | Photo post | Staff photo with MFC | R, SE | Payout statement in hand |
| D26 to D29 | | WPR story | Wrap-up: the total and the statement's top lines | | R | Disclosure line |
| D26 to D29 | | Newsletter list | Thank-you email to newsletter opt-ins | | NL | WPR's own ask goes here, separate from vote packs (`docs/LAUNCH.md`, section 9, After) |
| D29 | | Debrief | KPIs against targets; next year's changes; switch `HEALTH_CHECKS` off | | CE, EIC | |
| D+365 | | Admin | Erase personal data | Wrap-up tab | CE | The rules promise it |

## [IF FREE VOTE ON]

Nothing in the rows above assumes the free daily vote. If Setup turned it on:

- CE checks the Free votes tab and any `free_vote_*` warning on the Health tab
  every day of voting, and after every close.
- Morning reminders go out on their own to readers who asked for them.
  `emails.md`, part C, has the copy.
- Whether posts and owner emails mention "one free vote a day" is the
  newsroom's decision 13 in `docs/FREE-DAILY-VOTE.md`, with wording per
  counsel's answer to Q4. Until both are settled, leave it off social.

## Dates to plan around

The contest runs late October into November. Check these against D1 once the
dates are set.

| Date (2026) | What | What to do |
| --- | --- | --- |
| Sat., Oct. 31 | Halloween | Before D1: "Save your costume photos" in the open slot. During entries week: costume photos are welcome as entries, one photo per pet. During voting: a costume-parade carousel of approved entries already in costume. Never ask owners to change an entered photo |
| Sun., Nov. 1 | Daylight saving time ends | Deadlines are in Central time either way. Check any close or scheduled post near 2 a.m., and write "Central time" on every deadline that week |
| Tue., Nov. 3 | Election Day | No round closes on election night and no contest posts that evening. Drop the block from the results edition if space is tight. Staff time goes to the election first |
| Wed., Nov. 11 | Veterans Day | Regular contest posts are fine. No themed posts and no tie-ins |
| Nov. 21 to 29 (check the DNR's dates) | Gun deer season | Plenty of readers are in the woods. Avoid putting the Championship close on opening weekend |
| Thu., Nov. 26 | Thanksgiving | No close on Thanksgiving Day: use `open_round`'s closing-time argument to end that round Wednesday or Friday at 8 p.m. If the contest has ended, the thank-you post fits Thanksgiving week |
| Fri., Nov. 27, and Sat., Nov. 28 | Black Friday, Small Business Saturday | A natural thank-you to local sponsors, labeled, if sponsors want it |
| Tue., Dec. 1 | Giving Tuesday | Keep vote packs out of it entirely. Packs are purchases, not gifts. If Moments runs its own Giving Tuesday campaign, it is Moments' to promote |

Placing D1:

- No close on Nov. 3 or on Thanksgiving Day.
- The Championship should close on a weeknight.
- Keep the whole run inside the 22 days above.
- Every close needs a CE on duty at 8 p.m.
