# Email sequences

Three sequences, with full copy, timing and exit conditions:

- A. Entrant nurture, beyond the transactional emails that already exist.
- B. An opt-in note to buyers when their pet plays again. Needs a new opt-in
  box at checkout.
- C. Free-vote reminder copy, used only if the free daily vote is switched on.

None of A or B is built. Each email would be a new kind in
`supabase/functions/_shared/templates.ts` and the notify queue. The engineering
list is at the end.

What already exists and sends on its own (`templates.ts`): entry received,
approved (with the owner's share link), rejected, advanced, eliminated and
champion; plus the free-vote code and reminder, which sit behind the
free-vote switch. The sequences below fit around those and repeat none of
them.

## Rules for every email here

- Say "vote packs." A pack is a purchase, not a donation, and not
  tax-deductible. The entrant footer already says so.
- No newsroom ask. WPR's request for tax-deductible support goes to newsletter
  opt-ins, in the newsletter, apart from anything about vote packs.
- No prizes. The champion gets the title and bragging rights.
- Every standing is stamped "as of [time]," because people read email hours
  after it's sent. Closing times come from the round row and render like the
  existing emails do (`formatWhen`, Central).
- At most one nurture email per entrant per day, and none within six hours of
  a transactional email to the same person. An entrant with several pets gets
  one email per send that covers all of them.
- Every email in A and B carries an unsubscribe link and WPR's [postal
  address]. Counsel should say whether they count as commercial messages under
  CAN-SPAM, the same question `docs/FREE-DAILY-VOTE.md` asks about reminders
  (Q7).
- Layout follows `compose()` in `templates.ts`: a greeting, short paragraphs,
  one button, an optional closing paragraph, the footer.

Merge fields used below:

| Field | What it is |
| --- | --- |
| `{first}` | Entrant's first name (entrant emails only; checkout collects no name) |
| `{pet}`, `{opponent}`, `{champion}` | Pet names |
| `{pet_link}` | The pet on the WordPress contest page (`#/pet/<id>`) |
| `{share_link}` | The pet's share page (`/p/<id>/`), which shows the photo in a Facebook preview |
| `{toolkit_link}`, `{results_link}`, `{bracket_link}`, `{newsletter_link}` | Pages; the newsletter link is `NEWSLETTER_URL` in `web/src/config.js` |
| `{round}`, `{closes}`, `{opens}` | Round name and times |
| `{rank}`, `{field}`, `{line_phrase}`, `{as_of}` | Open Round standing. `{line_phrase}` is "[n] votes above the bracket line" or "[n] votes from the bracket," close to the Social desk's wording |
| `{lead_phrase}` | "leads [opponent] by [n] votes," "trails [opponent] by [n] votes," or "is tied with [opponent]" |
| `{raised}` | Shelter total so far, as the eliminated email already computes it |
| `{bonus_line}` | "[Double Votes], presented by [Sponsor], runs [span]. Vote packs whose checkout starts in that window count [double]." Only when a window is scheduled before the close; the sponsor is always named as presenter |

## A. Entrant nurture

Goal: more entrants share at the moments that matter, so more pets get votes.
It moves the "activated entrants" KPI in `README.md`. The arc: get ready, it's
on, where you stand, last call, the bracket's last days, thank you.

| # | Email | Sent | To | Button |
| --- | --- | --- | --- | --- |
| | Approved (exists) | On approval | The entrant | Share [pet]'s page |
| N1 | Get ready | 24 hours after approval, while voting hasn't opened | Approved entrants | Open [pet]'s page |
| N2 | Voting is open | When the Open Round opens (D8) | Every approved entrant | Share [pet]'s page |
| N3 | Halfway | Open Round day 4 (D11), 7 a.m. | Every approved entrant | Share [pet]'s page |
| N4 | Last day | Open Round's last day (D14), 7 a.m. | Every approved entrant | Share [pet]'s page |
| | Advanced or eliminated (exists) | After each close | | |
| N5 | Matchup's last day | 7 a.m. on D16, D18, D20 and D22 | Entrants whose pet is in that round | Share [pet]'s matchup |
| | Champion (exists) | After the final close | The champion's entrant | |
| N6 | Thank you | D24, morning | Every approved entrant except the champion's | See the results |

```
[approved] -> Approved email (exists)
     |
     +-- voting opens within 24h? --yes--> skip N1
     |                                       |
     no                                      |
     v                                       |
    N1 (approval + 24h) ---------------------+
                                             v
                               N2 (Open Round opens, D8)
                                             |
                               N3 (D11, 7 a.m.)
                                             |
                               N4 (D14, 7 a.m.)
                                             |
                             [close] -> Advanced or Eliminated (exists)
                                 |                   |
                              advanced            eliminated --> wait --> N6 (D24)
                                 |
                  N5 (last day of each round, 7 a.m.)
                                 |
                [close] -> advanced: next round's N5
                        -> eliminated: wait for N6 (D24)
                        -> champion: Champion email (exists), no N6

[disqualified at any point] -> EXIT, nothing further from this sequence
[unsubscribed]              -> EXIT; transactional emails still send
```

Exits and suppressions:

- A rejected entry never enters the sequence.
- A disqualified entry leaves at once. The editor handles that conversation
  privately (`moderation.md`).
- An eliminated pet stops getting N5 and still gets N6.
- The champion's entrant gets the existing champion email, not N6.
- Unsubscribing ends the nurture emails. Approved, advanced, eliminated and
  champion still send, since they're about the entry itself (counsel to
  confirm).
- If the contest is paused or cancelled, stop everything.
- No re-entry. One sequence per entry.

### N1: Get ready

Subject options:
- Before voting opens: {pet}'s flyer and share image
- {pet} is in. Voting opens {opens}
- A few minutes now helps {pet} later

Preview: Make a share image, get the right link for Facebook, and see what to
post when.

Why it exists: to get entrants ready during entries week, so they can share
the moment voting opens.

> Hi {first},
>
> {pet} is in the gallery, and voting opens {opens}. Nobody can vote before
> then, but people can look, so this week is a good time to let them know.
>
> On {pet}'s page, tap "Make a share image." You'll get an Instagram or
> Facebook story, a square post and a flyer to print. The flyer's QR code opens
> {pet}'s page.
>
> When you post on Facebook, use this link, because it shows {pet}'s photo in
> the preview: {share_link}. A link copied from the contest page shows the
> contest's picture instead.
>
> Our toolkit has a post ready for each stage, from the day voting opens to the
> bracket: {toolkit_link}
>
> [Open {pet}'s page] -> {pet_link}
>
> When people ask: votes come in vote packs, starting at $5. A pack is a
> purchase, so it isn't a donation and isn't tax-deductible. 30% of vote pack
> sales after refunds goes to Moments Foster Care.

Skip it if the Open Round opens within 24 hours of approval; N2 covers it.

### N2: Voting is open

Subject options:
- Voting is open for {pet}
- The Open Round is on, and {pet} is in it
- {pet} can get votes now

Preview: The top 16 make the bracket when the Open Round closes.

> Hi {first},
>
> The Open Round is open, and voting runs until {closes}. Every approved pet is
> in it, and the 16 with the most votes make the bracket, seeded by their
> totals.
>
> Then vote totals reset. Open Round votes decide who makes the bracket and
> their seeds, and that's all they decide. Every bracket matchup starts at
> zero.
>
> Vote packs start at $5. The most useful thing you can do today is send
> {pet}'s link to the people most likely to vote: family, close friends,
> coworkers.
>
> [Share {pet}'s page] -> {share_link}

[IF FREE VOTE ON, and only if decision 13 says to promote it] Add: "Everyone
also gets one free vote a day for any pet."

### N3: Halfway

Subject options:
- {pet} is No. {rank} as of this morning
- Halfway through the Open Round: where {pet} stands
- Halfway through the Open Round (the version without standings)

Preview: {line_phrase} as of {as_of}. The Open Round closes {closes}.

> Hi {first},
>
> We're halfway through the Open Round. As of {as_of}, {pet} is No. {rank} of
> {field}, {line_phrase}.
>
> The top 16 make the bracket when voting closes {closes}. If two pets tie, the
> one entered earlier ranks higher.
>
> {bonus_line}
>
> It's a good moment for an update post. The toolkit has one ready to fill in:
> {toolkit_link}
>
> [Share {pet}'s page] -> {share_link}

Without standings, or for a pet more than [x] votes from the line, replace the
second sentence with: "{pet}'s page shows where {pet} stands right now and how
many votes it takes to pass the next pet." A big gap, printed in an email,
reads as "don't bother."

### N4: Last day of the Open Round

Subject options:
- The Open Round closes tonight at 8 p.m.
- Last day of the Open Round for {pet}

Preview: Payments have to go through by 8 p.m. Results come shortly after.

> Hi {first},
>
> The Open Round closes tonight, {closes}. As of {as_of}, {pet} is
> {line_phrase}.
>
> A vote counts if its payment goes through by the deadline. A payment already
> in progress gets a two-minute grace, and anything later is refunded
> automatically, so tell people not to wait for the last minute.
>
> An editor finalizes the results shortly after the close, and we'll email you
> tonight with how {pet} did.
>
> [Share {pet}'s page] -> {share_link}

Same rule as N3 for pets far from the line.

### N5: A matchup's last day

Subject options:
- {pet} vs. {opponent} closes tonight
- Last day of the {round} for {pet}

Preview: As of {as_of}, {pet} {lead_phrase}.

> Hi {first},
>
> {pet}'s {round} matchup closes tonight, {closes}. As of {as_of}, {pet}
> {lead_phrase}.
>
> Both pets started this round at zero, and the one with more votes at the
> close moves on. A tie goes to the better seed. Payments have to go through by
> the deadline; later ones are refunded automatically.
>
> {bonus_line}
>
> [Share {pet}'s matchup] -> {share_link}

If {pet} trails by more than [x] votes, drop the standing and say: "The score
is on {pet}'s page."

### N6: Thank you

Subject options:
- Thank you for entering {pet}
- A champion, and {raised} for Moments Foster Care

Preview: {champion} took the title, and readers raised {raised} for Moments
Foster Care.

> Hi {first},
>
> The contest is over. {champion} is the [year] Cutest Pet in Marathon County,
> and the Open Round's Best Dog, Best Cat and Best Other are on the results
> page.
>
> Readers raised {raised} for Moments Foster Care, which is 30% of vote pack
> sales after refunds. Thank you for entering {pet} and for every share.
>
> About your information: we erase entrants' names and email addresses 12
> months after the contest. {pet}'s photo, name and town stay in our coverage,
> as the rules say.
>
> [See the results] -> {results_link}
>
> If you'd like to hear when next year's contest opens, Wausau Pilot & Review's
> newsletter is free: {newsletter_link}

### Measuring A

The primary measure is activated entrants: the share of approved pets with at
least one vote pack in the Open Round, compared between entrants who got N1
and those approved too late for it. Per email, watch clicks on the button and
unsubscribes. Open rates are unreliable with Apple's mail privacy, so don't
steer by them.

With a few hundred entrants, a split test won't settle much in year one. If
you test anything, test N2's subject line (pet first, or the round first) and
treat the result as a hint.

## B. Buyer note: "your pet plays again"

One short email per round, only to buyers who ask for it. It needs a new
checkbox at checkout, so it is not built.

### The new opt-in box

In `CheckoutModal`, under the existing newsletter box, unchecked by default:

> [ ] Email me when {pet} plays again (this contest only, one email a round).

Store the choice with the vote, per purchase and per pet. A purchase enrolls
only when the webhook credits it, so a late, refunded or disputed payment
never does. The rules' privacy section says buyers' addresses serve "receipts,
contest notices and, for those who opt in, WPR's newsletter." Ask counsel
whether this note needs its own line there.

### When it sends

When each bracket round opens. A buyer gets one email that round, covering
every pet they opted in for: the ones that play again (B1) and the ones whose
run just ended (B2). After the final close, the champion's buyers get B3 and
the runner-up's get B2. Checkout collects only an email address, so these open
without a name.

### B1: plays again

Subject options:
- {pet} plays again: {round} vs. {opponent}
- {pet} made the {round}

Preview: Both pets start at zero. Voting closes {closes}.

> You asked us to tell you when {pet} plays again. {pet} is in the {round},
> facing {opponent}, and voting closes {closes}.
>
> Vote totals reset every round. The votes you bought counted in the round you
> bought them in, and both pets start this one at zero.
>
> [See the matchup] -> {pet_link}
>
> You're getting this because you checked a box when you bought votes for
> {pet}. One email a round, this contest only. Stop these emails: [unsubscribe]

More than one pet: "Two of the pets you backed play again. {pet} faces
{opponent}, and {pet 2} faces {opponent 2}. Voting closes {closes}." Then the
reset paragraph, with one button to the bracket.

### B2: the run ends

Subject: Thanks for backing {pet}

> {pet}'s run ended in the {round}, against {opponent}. Thank you for your
> votes. So far the contest has raised {raised} for Moments Foster Care.
>
> The bracket runs until [final close].
>
> [See the bracket] -> {bracket_link}

When B1 and B2 land in the same round, they share one email. A pet leaves the
sequence after its B2.

### B3: the champion

Subject: {pet} is the champion

> {pet} is the [year] Cutest Pet in Marathon County, after beating {opponent}
> in the Championship. Thank you for backing {pet}. Readers raised {raised} for
> Moments Foster Care.
>
> [See the results] -> {results_link}

The last email in the sequence.

### Exits and suppressions for B

- Unsubscribing stops all of B for that address.
- When every pet a buyer opted in for is out, B2 is the last email.
- Nothing sends after the contest is complete, except B3 and the final B2 on
  the closing night.
- A disqualified pet's buyers get nothing from this sequence. Their refunds
  come through Stripe, with Stripe's refund receipt if receipts are on.
  Whether WPR also sends a plain notice is a separate decision.
- Never more than one B email per buyer per round. Nothing sends when the
  Open Round opens; the first B email goes out when the Sweet 16 does.

## C. Free-vote reminders [IF FREE VOTE ON]

The morning reminder is built (`renderFreeVoteReminder` in `templates.ts`) and
switched off with the free vote. This adds variants for particular days and
the lines that go around it. Rules for this copy, from
`docs/FREE-DAILY-VOTE.md`, sections 5.10 and 9:

- No vote pack pitch in a reminder. The page it opens handles that, and an
  offer-free reminder is simpler to classify (Q7).
- A free vote is one vote and is never multiplied, so reminders never mention
  Double Vote Hours.
- Free votes raise no money. Nothing in a reminder suggests they help Moments
  Foster Care.
- Reminders go only to readers who ticked "Remind me each morning to vote
  (this contest only)," only on days with an open round, and they stop when
  the contest ends. Every one has the stop link.

The built version, for reference. Subject: "Your free vote is ready: vote for
{pet}." Body: "Your free daily vote in {contest} has reset. The {round} closes
{closes}. One tap casts it for {pet}:" Button: "Vote for {pet}."

C1, an ordinary day: use the built version as it is.

C2, a round's last day:

> Subject: Last day of the {round}: your free vote is ready
>
> Your free daily vote has reset, and the {round} closes tonight, {closes}. One
> tap casts it for {pet}:
>
> [Vote for {pet}]

C3, with a standing (only if the newsroom shows free votes publicly,
decision 4):

> Subject: Your free vote for {pet} is ready
>
> Today's free vote in the {round} is waiting. As of 8 a.m., {pet}
> {lead_phrase}. Voting closes {closes}.
>
> [Cast today's free vote]

C4, the reader's pet is out (if reminders continue after that, decision 6):

> Subject: Your free vote is ready
>
> {pet}'s run ended in the {round}. Your free daily vote still works for any
> pet in the {current round}, which closes {closes}.
>
> [See the {current round}]

The link goes to `#/bracket`, as section 5.10 specifies.

C5, the last one of the contest:

> Subject: Last day: your free vote for {pet}
>
> The Championship closes tonight, {closes}, and your free vote has reset. One
> tap casts it for {pet}. This is the last reminder: they stop when the
> contest ends.
>
> [Vote for {pet}]

Lines for elsewhere, each waiting on decision 13 and counsel's answer to Q4:

- Social and the newsletter block: "Everyone also gets one free vote a day.
  It resets at midnight Central."
- Owner emails (the section 9 suggestion): "Ask friends to cast their free
  vote for {pet} every day."

## What engineering needs

- New notification kinds in `templates.ts` and the queue. `QueueRow` needs
  rank, field size, distance to the line, the opponent's count and an as-of
  time, read from `entry_round_totals` when the email is built.
- Time-based sends (N3, N4, N5 at 7 a.m. on set days). The sweep already runs
  every 15 minutes; it needs to know the round schedule.
- An unsubscribe link and `List-Unsubscribe` headers. `sendEmail` takes no
  custom headers today; the free-vote reminders need the same change.
- WPR's postal address in the footer of A and B.
- For B: the checkbox, a column on `votes` granted explicitly in its
  migration, an `access_test.sql` update, and `erase_personal_data` covering
  it. `votes` stays unreadable by anon.
- Resend volume: up to ten more emails per entrant, and about one per round
  per opted-in buyer. Check it against the plan in `docs/LAUNCH.md`, section
  5.

If none of this is built in time, N2, N4 and N6 matter most. Fold their key
lines into the toolkit page and the social posts. Don't export entrant
addresses into another mail tool: the rules say they're used only to run the
contest, and every extra copy is one more thing to erase in a year.
