# Cutest Pet in Marathon County: campaign kit

Prepared Oct. 24, 2026. A plan, not published copy: nothing here goes out
until an editor fills its placeholders and approves it. It extends the
promotion calendar in `docs/LAUNCH.md`, section 9, and follows the phases in
`CLAUDE.md`, "Running a contest."

| File | What it is |
| --- | --- |
| `README.md` | This brief |
| `calendar.md` | Day by day, from two weeks before entries open to the thank-you |
| `owners-toolkit.md` | What entrants get: share scripts by phase, captions, Facebook group etiquette, asking family to vote |
| `emails.md` | The entrant nurture sequence, the opt-in buyer note, free-vote reminder copy |
| `social.md` | Caption bank, three Reels/TikTok scripts, a Stories sequence, the Facebook Groups playbook |
| `moderation.md` | Crisis and moderation playbook, holding statements, who approves what |

## Goal

Raise as much money as the contest can without pressure tactics, for Moments
Foster Care and for WPR, then turn the attention into newsletter readers and
sponsors who come back next year. Moments gets 50% of vote pack sales after
refunds (the split configured for this contest; it freezes when submissions
open). Most of the money will come from entrants' friends and family, so most
of this kit is about helping entrants share.

## The single story

Marathon County's pets go head to head for the title, the newsroom runs the
count in the open, and 50% of every vote pack sale goes to Moments Foster
Care.

Each post tells one chapter of it: the field, the bubble, a matchup, an
upset, the champion, the check.

## Audiences

| Audience | What they want | What we ask | How we reach them |
| --- | --- | --- | --- |
| Owners (entrants) | Their pet seen, and a fair shot | Enter, then share at each phase | Approval and nurture emails, the owners' toolkit, the share-image maker |
| Owners' friends and family | To back someone they love without hassle | Buy a pack for that pet, pass the link on | Mostly through the owner. WPR reaches few of them directly |
| Readers and voters | A race worth following | Pick favorites, buy packs, come back for results | WPR's Facebook and Instagram, the article widget, the newsletter block, stories |
| Sponsors | Local visibility next to a good cause | Buy placements and Double Vote Hours, then renew | Chris Weber, `docs/sponsor-kit/`, the post-contest report |
| Moments Foster Care's community | Help for the animals in foster care | Share the contest; enter foster pets as wildcards if Moments chooses to | Moments' own channels, using WPR's partner pack |

## Messages, and what proves each

1. Free to enter with a phone photo, and an editor checks every entry. (Rules,
   section 3)
2. 50% of vote pack sales after refunds goes to Moments Foster Care. Card fees
   come out of WPR's share. (Rules, section 1; the payout statement)
3. The count is fair. Totals reset every round, a vote counts once the payment
   clears, the deadline is when the buyer paid, results freeze at the close,
   and ties follow published rules. (Rules, sections 5, 6 and 9)
4. A vote pack is a purchase. Buyers get votes, so packs are not donations and
   are not tax-deductible. (Rules, section 7)

Section numbers are for the rules with the free daily vote off. With it on,
every section from Bonus windows onward is numbered one higher (Bonus windows
becomes 9).

## Channels

| Kind | Channel | Notes |
| --- | --- | --- |
| Standing, runs itself | Article widget at the foot of every WPR story | Changes with the phase (`web/EMBED.md`) |
| Standing, built per edition | Newsletter block | Proposed schedule in `calendar.md`; it fills the sponsor kit's `[newsletter block schedule]` |
| Posted | WPR's Facebook Page | The main channel |
| Posted | Instagram feed, Stories, Reels | Reels for reach, Stories for matchup days |
| Posted | TikTok | Only if WPR already runs an account. The Reels scripts carry TikTok notes |
| Posted | WPR stories | Announcement, Open Round, bracket, champion, wrap-up |
| Email | Transactional (built) plus the nurture sequence (not built) | `emails.md` |
| Earned | Owners' shares, local Facebook groups, Moments' channels, sponsors' own posts, printed QR flyers | Owners' shares drive the votes |

No paid media is assumed. Posts are scheduled natively in Meta Business
Suite. No paid scheduling tools.

## KPIs

One North Star, four supporting measures, and guardrails. Year one has no
baseline, so each year-one target is a learning goal: record the number. Year
two's targets are ranges set from year-one data. None of these is a
follower count or a like count.

| KPI | Why | Where to read it | Year one | Year two |
| --- | --- | --- | --- | --- |
| North Star: net vote pack sales after refunds | The money: Moments' 50% and WPR's share | Money tab; payout statement at the close | Record it | [range], set from year-one data |
| Activated entrants: share of approved pets with at least one vote pack in the Open Round | Shows whether owners are sharing, and whether the toolkit helps | The gallery's vote counts while the round runs; the archive download after | Record it | [range], set from year-one data |
| Buyers and purchases per round | Shows whether interest holds through the bracket | `round_revenue` (Money tab) | Record it | [range], set from year-one data |
| Newsletter opt-ins by source | What the newsroom keeps after the contest | Newsletter tab (`newsletter_signups`) | Record it | [range], set from year-one data |
| Sponsor revenue and renewals | Pays for next year | Sales; sponsor clicks once analytics are on | Record it | [range], set from year-one data |

Guardrails, held whatever the North Star does:

- Refunds and disputes as a share of payments (Money tab).
- `late_confirmations` empty within an hour of every close, and
  `rejected_photos_live` at zero rows (Health tab).
- Entries moderated within a day. The "entry received" email promises it.
- Every public complaint answered within [hours] while voting is open.
- Unsubscribes from the nurture emails under [threshold].

Channel signals: link clicks, shares and sends on Facebook and Instagram
(Meta Insights), clicks on the newsletter block (`utm_source=newsletter`), and
widget and share clicks (Plausible). Plausible records nothing until
`ANALYTICS.domain` is set in `web/src/config.js`, so turn it on before D1 or
those numbers won't exist.

Action thresholds, to set before launch:

- If fewer than [x]% of approved pets have a vote by the end of Open Round day
  2, send nurture email N3 early and post the "how to share" Story.
- If disputes pass [x] in a day, tell the developer (`docs/LAUNCH.md`, section
  1, Radar).
- If a round's buyers fall below [x]% of the round before, move that round's
  Double Vote Hour earlier in the evening and post the closest matchups twice.

Review: five minutes on the Money tab each morning while voting is open, a
short weekly check-in, and a full debrief within two weeks of the champion.

## Staff time it assumes

Planning estimates, not measurements. Replace them with year-one actuals.

| Week | Main work | Estimated staff hours |
| --- | --- | --- |
| Pre-launch 1 (D-14 to D-8) | Announcement story and posts, partner pack, Double Vote schedule, group list | 8 to 12 |
| Pre-launch 2 (D-7 to D-1) | Daily posts, toolkit page, comment guidelines, Social desk rehearsal | 6 to 8 |
| Entries week (D1 to D7) | Daily posts, groups, newsletter, plus moderation at about a minute an entry | 10 to 14, plus moderation |
| Open Round (D8 to D14) | Daily leaderboard and bubble posts, a Double Vote Hour, emails, the close | 10 to 14 |
| Bracket (D15 to D22) | Four evening closes at about an hour each, matchup posts, two or three Reels, the champion story | 18 to 24 |
| Wrap-up (D23 to D29) | Champion and thank-you posts, check presentation, wrap-up story, sponsor report, debrief | 8 to 12 |

Roles used throughout: contest editor (CE), social editor (SE), reporter (R),
newsletter editor (NL), Sales (Chris Weber), editor-in-chief (EIC), and
Moments Foster Care (MFC), a partner rather than staff. In a small newsroom
one person can be CE and SE. Someone has to be on duty at 8 p.m. on the five
closing nights.

## Rules every piece follows

- Say "vote packs." Never "donation," "gift" or "contribution," and nothing
  that suggests a tax deduction. WPR's own ask for tax-deductible support stays
  separate from anything about vote packs.
- Every post made while voting is open says vote totals reset every round.
- Never name an owner or a buyer. Pets and towns only. WPR doesn't reshare
  entrants' posts, because a reshare shows the owner's account.
- Live numbers stay placeholders until the moment of posting: [shelter total],
  [votes], [time]. Refresh the Social desk right before downloading. Images
  made with "sample numbers" carry a DO NOT POST band and never go out.
- Real deadlines only. No countdowns that reset, no "almost sold out," no
  invented statistics.
- No prizes. The champion gets the title and bragging rights. Counsel is still
  reviewing whether any prize changes the contest's legal status
  (`docs/FREE-DAILY-VOTE.md`, section 9, Q2 and Q5).
- Label sponsor mentions: "presented by [Sponsor]" in the copy, plus Meta's
  paid-partnership label on any post that names a paying sponsor.
- WPR doesn't pick favorites. Every matchup gets its card, and staff never
  campaign for a pet.
- Any WPR story about Moments Foster Care, during the contest or after it,
  discloses the partnership.
- The free daily vote is built but switched off pending counsel. Everything
  marked [IF FREE VOTE ON] stays out unless Setup turns it on.

## Fill before launch

- The rules approved by counsel (`rulesApproved: true`), then check every
  section number cited in this kit against the final page.
- [contest page link] and [rules link]; [D1 date and time] and every closing
  time; the pack ladder as set in the Packs tab (this kit assumes the
  recommended $5 to $250 ladder).
- How Moments Foster Care describes itself, its logo terms from the MOU, its
  giving page, and whether it will enter wildcards. The app and the draft
  rules say "partner shelters," plural; confirm the name and the count.
- Double Vote Hours: [times], [sponsor names].
- [contest hashtag], checked for prior use; [toolkit link] if the owners'
  toolkit is published as a page; [escalation contacts]; [postal address] for
  email footers.
- Analytics switched on, if click numbers are wanted.
