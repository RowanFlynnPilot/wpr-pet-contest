# Sprints

**Status:** built behind a contest switch that is off by default (migration
0030, the Sprints section of Packs & bonuses, the Home card, the pet-page
line and the rules paragraph). Turn it on only after counsel answers the
questions at the end of this page.
**Date:** October 25, 2026
**Read with:** `CLAUDE.md` (the invariants), `docs/LAUNCH.md`

## What a sprint is

A sponsor offers a prize to the owner of the pet that takes the most votes in
a set window: "Example Pet Supply gives a $50 gift card to the owner of the
pet with the most votes from 6 to 9 p.m. Tuesday." Short-window challenges
are how other paid-vote contests give readers a reason to vote at a
particular time, and each one is a small, sellable sponsorship.

A sprint is the sponsor's prize, never votes. Sprint votes are ordinary votes:
they count toward the round exactly as they would anyway. A sprint changes no
vote count, no price and no share for the shelters.

## The rules the code keeps

- **A contest setting, draft only.** `set_sprints_enabled` turns sprints on
  or off while the contest is a draft, because a prize belongs in the
  published rules. The rules page grows a sprint paragraph when it is on.
- **A day's notice.** `add_sprint` refuses a sprint starting less than 24
  hours away, so nobody can time one around a pet they favor.
- **Inside one round, 30 minutes to 24 hours long, never overlapping.**
- **What counts.** A vote pack whose checkout began in the window and whose
  payment was credited within 10 minutes of the end (the settling time
  `close_round` also allows). A free vote cast in the window. A refund before
  the sprint is settled takes a pack out.
- **Ties** go as the round's do: the earlier entry in the Open Round, the
  better seed in a bracket round.
- **Settled by a person.** `settle_sprint`, from 10 minutes after the end,
  snapshots the standings into `sprint_results` and names the winner. After
  that nothing moves, like a resolved round: a later refund changes the
  money, never the sprint.
- **Cancel only before the start**, with a reason that is kept.
- **No hand edits.** No session can insert, update or delete a sprint or a
  result directly; `access_test.sql` pins it.

## Running one

1. **Before submissions open:** Setup → Sprints → Turn on (after counsel).
2. **Sell it.** Agree the prize, the window and the sponsor's link. Keep the
   prize something the sponsor delivers to the owner (a gift card, a basket),
   not cash from WPR.
3. **Schedule it** at least a day ahead: Packs & bonuses → Sprints → Schedule
   a sprint. Times are your local time.
4. **Announce it** the same day: a social post and a line in the next
   newsletter. The rules page lists it as soon as it is scheduled, and Home
   shows it from two days out.
5. **While it runs**, Home shows the top three with live counts and the pet
   pages carry a one-line notice.
6. **Ten minutes after it ends**, Packs & bonuses → Settle and name the
   winner. Home shows the winner for 12 hours.
7. **Deliver the prize.** The panel shows the winning owner's name and email.
   Introduce the owner to the sponsor, or collect the prize and pass it on.

A sprint pairs well with a Double Vote Hour at the start of a round, but they
are separate things: a bonus window multiplies votes, a sprint only awards a
prize.

## Questions for counsel before turning it on

These are questions, not conclusions. WPR should not switch sprints on until
counsel has answered them.

1. **Lottery.** Wisconsin treats an enterprise with a prize, chance and
   consideration as a lottery (Wis. Stat. § 945.01(5)). A sprint's winner is
   decided by votes, not chance, and the free daily vote (if on) is a way to
   take part without paying. Is a prize decided by votes that can be bought
   permissible as designed? Does the answer change if the free daily vote is
   off?
2. **Sponsor terms.** What should the sponsor agreement say about who
   supplies and delivers the prize, its stated value, substitutions and
   liability?
3. **Prize value and tax.** Should each prize stay under the value that
   triggers tax reporting for the winner, and does WPR or the sponsor carry
   that reporting if one goes over?
4. **Eligibility.** The contest's rules already exclude WPR staff and their
   households. Should partner-shelter staff be excluded from sprint prizes,
   as they are from side awards?
5. **The rules text.** Is the sprint paragraph on the rules page (section on
   bonus windows and sprints) sufficient, including "no cash alternative
   unless the sponsor offers one"?
