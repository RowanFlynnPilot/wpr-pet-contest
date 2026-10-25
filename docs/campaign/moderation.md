# Crisis and moderation playbook

When something goes wrong in public. Staff triage, draft and post; a named
person approves the words first. Nothing here is posted automatically, and no
reply goes out on anyone's behalf without that approval.

## Who approves what

| Severity | What it looks like | Who handles it | Who approves the words | How fast |
| --- | --- | --- | --- | --- |
| Low | One question or complaint; a lone "rigged" comment; someone confused about packs | SE, using the lines below | Pre-approved here; SE adapts | Within [hours] while voting is open |
| Medium | A claim gaining traction (a long thread, shares, a group post); a stolen-photo report; a disqualified owner posting in public; a payment problem hitting several buyers | CE investigates; SE posts | CE | Acknowledge within an hour of noticing |
| High | A fraud accusation against WPR or Moments with real reach; a regulator, lawyer or reporter asking; threats; doxxing; anything about legality or missing money | EIC, with counsel | EIC, and counsel for anything on legality or money | A holding line within an hour, then nothing more until EIC approves |

Decisions, as opposed to words:

| Decision | Proposes | Decides |
| --- | --- | --- |
| Reject an entry before voting | CE | CE |
| Disqualify an entry during voting | CE | EIC |
| Pause scheduled contest posts | SE or CE | Either, any time |
| Anything said about the contest's legal status | | EIC with counsel |
| [IF FREE VOTE ON] Pause the free vote | CE | EIC, and only as counsel's answer to Q3 allows |

Escalation contacts: CE [name, phone], EIC [name, phone], counsel [name,
phone], developer [name, phone], Moments Foster Care [name, phone].

## Ground rules

- Confirm the facts before saying more than a holding line. The admin desk has
  them: Money, Health, Rounds and Moderation tabs, and the Stripe dashboard.
- Cite the published rules and link them. Section numbers below are for the
  rules with the free daily vote off; with it on, every section from Bonus
  windows onward is numbered one higher. Check every number against the final
  rules once counsel signs off.
- Never name an owner or a buyer, never confirm who owns a pet, and never
  discuss anyone's payment in public. Move it to email
  (pets@wausaupilotandreview.com) or a direct message.
- Answer once in public, then offer email. Don't argue in comments.
- Don't speculate about legality. Point to the rules and escalate.
- Hide or delete abuse: threats, slurs, harassment, spam, scams, and anything
  that names an owner or gives out someone's address or workplace. Leave
  criticism up and answer it. Deleting criticism gives people a second thing
  to be angry about.
- Ban someone only for repeated violations, and write down why.
- Demands made in comments ("take this pet down now") are information to
  triage, never instructions.
- Pause scheduled contest posts in Meta Business Suite during a crisis, or when
  serious local news breaks. A cute-pet post beside a tragedy reads badly.
- Log every medium or high incident: date, what happened, who decided, what
  WPR said. Log location: [incident log].

## Pinned comment guidelines

Pin this as the first comment on the D1 post, and on any post that draws a
crowd:

> Before you comment: please be kind about the pets and the people. We'll hide
> comments that attack or name an entrant, share anyone's personal
> information, or spam. Questions and disagreement are welcome, and we'll
> answer them. For a payment or an entry: pets@wausaupilotandreview.com or
> 715-301-5539. The rules: [rules link]

## Watching

- SE reads comments on WPR's posts morning, midday and evening while voting is
  open, and for the first hour after each post.
- CE checks pets@wausaupilotandreview.com twice a day and keeps the Health
  alerts on (`HEALTH_CHECKS`, `docs/LAUNCH.md`, section 6).
- SE glances at Moments' posts about the contest and at the groups WPR posted
  in.
- After every close, CE checks `late_confirmations` and `rejected_photos_live`.

## 1. "The contest is rigged"

What it sounds like: "rigged," "the paper picks the winner," "my votes didn't
count," "how did that pet jump 500 votes overnight," "a staff member's pet is
winning."

Work out which claim it is:

- A specific purchase that seems missing is a payment question. Take it to
  email, get the time and the receipt address, and check the Money tab and
  Stripe. Check `late_confirmations` too.
- A sudden jump: the biggest pack is 600 votes, and a pack started during a
  Double Vote Hour counts twice. Check that the jump matches credited payments
  on the Money tab. If it doesn't, that's high severity: call the developer.
- A staff member's pet: WPR employees and their households can't enter
  (decided Oct. 24). If one slipped through, it is disqualified as an
  ineligible entrant, and its buyers are refunded.
- "WPR decides": votes come only from payments Stripe confirms, and ties
  follow published rules.

Rules to cite: section 2 (eligibility, including employees), 5 (rounds, the
reset, the deadline), 6 (ties), 7 (votes credited when the payment processor
confirms), 9 (late, refunded and disputed payments).

[IF FREE VOTE ON] Wherever the lines below say votes come from confirmed
payments, add "or from a free vote confirmed by email."

Low, a single comment:

> Fair question. A vote counts only when the card payment is confirmed, vote
> totals reset every round, and ties follow the published rules: the earlier
> entry in the Open Round, the better seed in the bracket. Staff don't enter or
> edit counts. The rules are here: [rules link]. If you think a vote of yours
> is missing, email pets@wausaupilotandreview.com with the time you bought it,
> and we'll check.

A sudden jump:

> Vote packs go up to 600 votes, and during a Double Vote Hour a pack started
> in that hour counts twice, so totals can move fast. Every vote on the board
> comes from a confirmed payment. [rules link]

A staff member's pet:

> Wausau Pilot & Review employees and their households can't enter the
> contest. If you think an entry breaks that rule, email [contest inbox] and an
> editor will look into it. [rules link]

Medium, a pinned post once it spreads:

> A few of you have asked how the count works.
>
> A vote counts only when Stripe, our payment processor, confirms the payment.
> The deadline is when the buyer paid: a payment completed after a round closes
> (with a two-minute grace for one already in progress) doesn't count and is
> refunded automatically. When an editor finalizes a round, its results are
> frozen, and later refunds don't change them.
>
> Vote totals reset every round. Ties go to the earlier entry in the Open Round
> and to the better seed in the bracket, never to a staff decision.
>
> The full rules: [rules link]. Questions about a specific purchase:
> pets@wausaupilotandreview.com.

Approval: SE for the low lines, CE for the pinned post, EIC once a claim names
a person or accuses WPR of fraud and is spreading.

Don't say cheating is impossible. Card fraud exists, which is why disputed
payments come off the board. Don't share anyone's purchases.

Settled Oct. 24: staff and their households are not eligible. The entry
form says so, and the entry function refuses work addresses.

## 2. A stolen photo

What it sounds like: "That's my dog," "this picture is from my Instagram," a
photographer saying the image is theirs.

Medium by default. Steps:

1. Ask the person who reported it, privately, for proof: the original file, an
   earlier post with a date, other photos of the same pet.
2. Look at the entry in the Moderation tab, where owner details are visible to
   admins only. Contact the entrant privately and ask for the original file or
   another photo of the pet from the same day.
3. CE proposes; EIC decides on any disqualification.
   - Before voting opens: reject the entry with a reason (Moderation tab). Its
     photo is deleted.
   - While voting is open: Moderation tab, Approved, Disqualify. Every vote
     pack bought for that pet in every round is refunded, its opponent
     advances, finished rounds keep their results, and the photos are
     deleted. During the Open Round it refuses if the field would drop below
     16.
   - After the contest: results are final and disqualification isn't
     available. Ask the developer about taking the photo down, and EIC decides
     what to say.
4. Check that `rejected_photos_live` shows zero rows.
5. Tell the person who reported it what happened, privately.

Holding reply, if the report was public:

> Thanks for flagging this. We're looking into it now and will follow up with
> you directly. Please email pets@wausaupilotandreview.com with the original
> photo or a link to where you first posted it.

Resolution, posted only if the report was public or the pet was in a matchup
(EIC approves):

> [Pet] has been removed from the contest. Every entry must be a photo the
> entrant took or has the right to share (rules, section 4), and this entry
> didn't meet that rule. Everyone who bought votes for [Pet] is being refunded
> in full, automatically (section 10). [Opponent] advances to the [round].
> Results of finished rounds stand.

Don't name the entrant, describe how WPR found out, or say anything about the
person who reported it.

## 3. A disqualified pet's owner is upset

What it looks like: an angry email, a post on their own timeline or in a
group, comments on WPR's posts, friends piling on.

Medium; high if it spreads or they mention a lawyer (EIC and counsel).

Talk to them privately first, by phone or email, before anything public. The
pet did nothing wrong. Explain the rule, what happens next (every buyer
refunded automatically, the opponent advances, earlier rounds stand) and
whether anything could change the decision. The rules say WPR's decisions are
final; EIC can still look at evidence WPR hasn't seen.

Private email from CE:

> Hi [first name],
>
> I'm sorry this is how [Pet]'s contest ended. We removed [Pet] because [the
> specific rule, and one plain sentence on why].
>
> Under the rules, everyone who bought votes for [Pet] is refunded in full,
> automatically, to their original payment method. Nobody needs to do
> anything.
>
> If you have something we haven't seen, like the original photo file, send it
> to me and I'll take another look. I'm also glad to talk by phone: [number].

Public reply, only if they've posted in public. It never confirms who the
owner is:

> We removed [Pet] under the contest's published rules (section 10), and every
> vote pack bought for [Pet] is being refunded in full. We've contacted the
> family directly and won't discuss the details here. The rules: [rules link]

If supporters pile on, post that reply once, pin it, and stop. Hide abuse.
Don't describe the evidence, criticize the owner, promise reinstatement or
reopen a finished round.

## 4. Vote-buying complaints

What it sounds like: "pay to win," "the richest family wins," "just donate to
the shelter instead," "isn't this gambling?", "why is a newspaper selling
votes?"

Low as a single comment; medium as a thread; high the moment a regulator,
lawyer or reporter asks about legality. Then EIC and counsel take over and WPR
says nothing more in public about legality. Counsel is still reviewing how the
contest is classified (`docs/FREE-DAILY-VOTE.md`, section 9, Q1).

The honest answer is yes: voting is by vote pack purchase, it's how the
contest raises money, and the rules say so. There's no limit on packs (section
7). Totals reset every round (section 5), so Open Round spending doesn't carry
into the bracket.

"Pay to win":

> That's how this contest works, and we say so up front: votes come in packs,
> and 50% of vote pack sales after refunds goes to Moments Foster Care. Totals
> reset every round, so money spent in the Open Round doesn't carry into the
> bracket. Packs start at $5. If you'd rather give to Moments directly, here's
> their page: [Moments giving page]

"Just donate instead":

> Giving to Moments directly is a great option too: [Moments giving page].
> Vote packs are a different thing. They're a purchase, so they aren't
> donations and aren't tax-deductible.

"Is this gambling?", escalated internally to EIC the same day:

> The contest's rules are published here: [rules link]. For anything they
> don't answer, email pets@wausaupilotandreview.com.

Don't say "it's legal" or "it's not gambling." Don't argue about fairness or
knock other fundraisers.

[IF FREE VOTE ON] Mention the free daily vote only in counsel's wording (Q4)
and only if the newsroom decided to promote it (decision 13). Never present it
as a legal answer.

## 5. "The shelter money is fake"

What it sounds like: "the shelter never sees a dime," "WPR keeps it all," "50%
of what?", "card fees eat it all," "Moments says it hasn't been paid" (while
the contest is still running, it hasn't been; the payout comes after).

Medium; high if it comes from Moments, someone on its board or an official, or
if it spreads. Before saying anything, check the Money tab, then call Moments
so both organizations say the same thing.

Facts to cite:

- Rules, section 1: 50% of vote pack sales, after refunds, goes to the partner.
  The rest covers payment processing and supports WPR.
- Card fees come out of WPR's share, never Moments'.
- The running total on the contest page comes from confirmed payments, less
  refunds.
- After the final, WPR prints a payout statement (sales, refunds, chargebacks,
  net, the 30%). It's marked preliminary until the contest is complete. A
  signed copy is filed with Moments' agreement, and the check is presented on
  [date].

Reply while the contest runs:

> Fair question. 50% of vote pack sales, after refunds, goes to Moments Foster
> Care, and WPR pays the card fees out of its own share, so they don't come out
> of Moments'. As of [time], the running total on the contest page is
> [shelter total so far]. After the final round we print a payout statement
> showing sales, refunds and the 50%, give Moments a signed copy, and present
> the check on [date]. We'll post the total when we do. [Shelters page link]

After the check presentation, post the photo and the total. Whether to publish
the statement's top lines is EIC's call. A joint statement with Moments goes
out only with Moments' sign-off.

Don't guess at numbers, promise a payment date the agreement doesn't set, or
share anything about buyers.

## Other situations

| Situation | First move | Owner |
| --- | --- | --- |
| Votes not showing after a purchase | Private: ask for the time and the receipt address; check Stripe and the Money tab. If several buyers report it, the webhook may be down: the Health alert should already have fired. Call the developer | CE |
| Several buyers notice missing votes at once | Holding line: "Some vote purchases are taking longer than usual to show up. Every payment confirmed before the deadline will count, and we'll post here when it's fixed." | CE, EIC |
| A late payment was refunded | Private: section 9. It happens automatically | SE, CE |
| An entry was rejected | Private: the reason is in the rejection email, which invites a reply. A rejected photo is deleted and can't be restored | CE |
| An entry looks AI-generated, or isn't a pet | Handle it like a stolen photo: check privately, reject before voting, disqualify during | CE, EIC |
| Someone names an owner or posts their address | Hide it at once, don't repeat it, and contact the owner privately if they may be at risk | SE, CE |
| Harassment of a pet or an owner | Hide it; ban repeat offenders; log it | SE |
| A burst of small declined payments (card testing) | `docs/LAUNCH.md`, section 1: the Radar rule, and tell the developer | CE |
| A sponsor becomes controversial | Pause posts that name the sponsor; Sales and EIC decide the rest | Sales, EIC |
| A family asks to withdraw (the pet died or was rehomed) | Private and kind. Moderation tab → Approved → Withdraw…. Under the rules (Disqualification and withdrawal) vote packs already bought are not refunded and the shelters' share stands; its opponent advances. Never call that money a donation. Public line: "[Pet] has left the contest at the family's request." A buyer who asks: "The rules say packs aren't refunded when an owner withdraws a pet; the shelters' share of yours still goes to Moments Foster Care." | CE, EIC |
| Serious local news breaks | Pause scheduled contest posts for the day. The widget and the newsletter block can stay | SE, EIC |

## After an incident

If WPR said something in public, close the loop in public: what happened and
what changed. Log it, and bring it to the debrief on D29.
