# wpr-pet-contest

Annual reader-submitted cutest pet contest for Wausau Pilot & Review. Paid
voting, proceeds split with area animal shelters. Format: one open round for the
whole field, then a 16-entry bracket.

## Stack

Supabase (Postgres + Storage + Edge Functions) for all state, Stripe for
payments, React/Vite on GitHub Pages, WordPress iframe embed. Design system:
teal `#3A867C`, cream `#F6F2E9`, Fraunces display, Public Sans body, JetBrains
Mono for vote counts.

Unlike the Ledger tools there is no scraper and no static JSON. This is
write-heavy from day one.

## Invariants

These are load-bearing. Do not soften them.

- **Vote totals reset every round.** Votes carry `round_id`; the leaderboard
  filters on it. Round 1 buys qualification and seeding, nothing more. This is
  published in the rules and repeated in every post.
- **Advancement is one transaction.** `close_round()` closes, resolves, and
  builds the next round atomically. A half-built bracket is unreachable.
- **Round state changes only through `open_round` and `close_round`.** Neither
  contest status nor round status is ever updated by hand.
- **`close_round` is run by hand, not by cron.** A human confirms a round is
  over before results become irreversible. Especially year one.
- **Votes are credited by webhook only**, on `payment_intent.succeeded`. Never
  on the browser redirect.
- **`votes` is never readable by anon.** It holds buyer emails. The public
  leaderboard reads the `entry_round_totals` view instead.
- **Nothing is public before moderation.** `submit-entry` inserts with
  `status = 'pending'` and returns no id.
- **No HEIC, anywhere.** Browsers cannot render it. Keep it out of the bucket
  allowlist AND out of the file input's `accept` attribute — iOS transcodes to
  JPEG automatically when `accept` excludes it, which is what makes iPhone
  submissions work at all.
- **Rejecting an entry deletes its storage object.** The bucket is public, so a
  rejected photo stays fetchable at its UUID URL until the object is gone.
- **Moderation is audited.** The `moderation_recorded` constraint will not let
  an entry leave `pending` without a `moderated_at`. Set `moderated_by` too.

## Tiebreaks

- Open round: earliest submission wins. Deterministic, rewards entering early.
- Bracket rounds: better (lower) seed wins, which traces back to round 1.

No coin flips, no ties to adjudicate by hand.

## Running a contest

1. Insert the `contests` row with `beneficiary_split_pct` set. Publish that
   percentage on the rules page before launch.
2. `status = 'submissions_open'`, one week.
3. Moderate. Approve or reject with a reason; rejection reasons are required.
4. Insert round 1 (`seq = 1`, `kind = 'open'`, status stays `pending`), then
   `select open_round('<round-1-id>');` — this closes submissions and moves the
   contest to `voting` in the same transaction. Never flip contest status by
   hand; that is how you end up accepting entries after the field is set.
5. `select close_round('<round-1-id>', 16);` → seeds the bracket, builds round 2.
6. `open_round` each bracket round, leave it two days, then `close_round`.
   Four bracket rounds.
   After every close: `select * from late_confirmations;` — this must return
   zero rows. Anything listed is a payment that settled after results were
   computed, meaning money taken for votes that were never counted. Refund those
   payment intents in Stripe; the webhook flips them to 'refunded' by itself.
7. The final `close_round` returns null and flips the contest to `complete`.

Total elapsed: roughly two and a half weeks. Do not stretch it. Past three
weeks everyone is exhausted, staff included.

## Local development

```
supabase start
supabase db reset          # applies migrations/ in order
supabase functions serve
```

Migrations use `create function`, not `create or replace`. To change a
function, add a new numbered migration.

## Not built yet

- React front end (gallery, bracket view, checkout, admin moderation queue)
- Side awards (Best Dog / Best Cat off round 1 totals) — pure query, no schema
- Shelter payout reporting: `sum(amount_cents) * beneficiary_split_pct / 100`

## Legal, non-negotiable

- Checkout says **vote packs**, never "donation". Buying votes is not
  tax-deductible; the buyer receives something of value.
- `entries.rights_accepted_at` is a legal artifact. Never backfill it.
- One-page MOU per shelter before launch: promotion, split, logo use, term.
- WPR covering a partner shelter later carries a disclosure obligation.
