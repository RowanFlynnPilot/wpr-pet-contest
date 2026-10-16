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
- **Round state changes only through `open_submissions`, `open_round` and
  `close_round`.** Neither contest status nor round status is ever updated by
  hand, and no session holds UPDATE on either column.
- **Every migration grants explicitly.** The platform no longer grants table
  privileges by default, and Postgres grants EXECUTE on every new function to
  PUBLIC. Each new table, view or function gets its grants in the migration
  that creates it; each privileged function does `revoke ... from public, anon,
  authenticated`. `access_test.sql` pins the whole anon and authenticated
  surface and fails until a new object is added to it on purpose. (0003's
  revokes left every security definer function callable by anon; that is how
  free votes were one curl away.)
- **The public sees the pet, never the owner.** `entries` is column-granted to
  anon; `owner_name`, `owner_email` and the moderation columns are not in the
  grant. Public views carry sums and counts, never an email.
- **Prices live in `vote_packs`.** The client names a pack; `vote_quote` prices
  it. A bonus window's multiplier is locked when checkout begins, because the
  buyer is shown a vote count before paying.
- **`close_round` is run by hand, not by cron.** A human confirms a round is
  over before results become irreversible. Especially year one.
- **Votes are credited by webhook only**, on `payment_intent.succeeded`. Never
  on the browser redirect.
- **The deadline is when Stripe says the buyer paid**, not when the webhook
  arrives. `confirm_vote` counts a payment made by `closes_at` plus a 2-minute
  grace, and marks anything later `late` (refunded by the webhook), even while
  the round is still open. Otherwise a buyer holding checkouts opened before
  the deadline could pay after it, watching the leaderboard.
- **A resolved round's totals never move.** `close_round` snapshots the tally
  into `round_results`, and `entry_round_totals` serves that snapshot for
  resolved rounds. Refunds and chargebacks after the fact change the money
  (`contest_stats`), never a published result or a side award.
- **The photo bucket is not listable.** Objects are served by public URL; only
  admins may list. Anything listable would expose unmoderated uploads.
- **`votes` is never readable by anon.** It holds buyer emails. The public
  leaderboard reads the `entry_round_totals` view instead.
- **Nothing is public before moderation.** `submit-entry` inserts with
  `status = 'pending'` and returns no id.
- **No HEIC, anywhere.** Browsers cannot render it. Keep it out of the bucket
  allowlist AND out of the file input's `accept` attribute — iOS transcodes to
  JPEG automatically when `accept` excludes it, which is what makes iPhone
  submissions work at all.
- **Rejecting an entry deletes its storage objects**, the photo and its
  thumbnail. The bucket is public, so a rejected photo stays fetchable at its
  UUID URL until the object is gone. The `moderate` edge function does it in
  the same request; `rejected_photos_live`
  must be zero rows, and `decision: "purge"` retries a failed delete.
- **A disqualified pet's buyers are all refunded.** Published policy: every
  vote pack bought for it, in every round, comes back; in a matchup its
  opponent advances whatever the count; finished rounds keep their results.
  Only `disqualify_entry` (via the `disqualify` function, which deletes the
  photos and asks Stripe for the refunds) can do it, only while voting, and
  re-running it retries refunds still outstanding. A payment that lands for a
  disqualified pet afterward is marked `late` and refunded, never credited.
- **Moderation is audited.** Only `moderate_entry` changes an entry's status,
  run as the moderator (not the service role) so `moderated_by` is the real
  person. The `moderation_recorded` constraint backs it up.
- **Uploaded photos carry no metadata but orientation.** Phone EXIF holds GPS,
  which for most entrants is their house, and the bucket serves originals.
  `submit-entry` strips it server-side even though the front end re-encodes.

## Tiebreaks

- Open round: earliest submission wins. Deterministic, rewards entering early.
- Bracket rounds: better (lower) seed wins, which traces back to round 1.

No coin flips, no ties to adjudicate by hand.

## Running a contest

Everything below is a button in the admin panel (`#/admin`). The SQL is what
the buttons call, for when the panel is not an option.

1. Insert the `contests` row (`status = 'draft'`) with `beneficiary_split_pct`,
   `bracket_size` (16) and `bracket_round_hours` (48). Publish the percentage on
   the rules page before launch. Insert its `vote_packs` (seed.sql has the
   recommended ladder), `shelters`, and any sponsored `bonus_windows`.
2. `select open_submissions('<contest-id>');` — refuses without an active vote
   pack. One week. It also stages round 1 (pending), scheduled to open when
   submissions close and to run a week; pass a second argument for a different
   round 1 closing time.
3. Moderate. Approve or reject with a reason; rejection reasons are required.
   Send the approval emails (Email tab) so owners get their share links.
4. `select open_round('<round-1-id>');` — this closes submissions and moves the
   contest to `voting` in the same transaction. It refuses while anything is
   still pending, or with fewer approved entries than `bracket_size`. Never flip
   contest status by hand; that is how you end up accepting entries after the
   field is set.
5. `select close_round('<round-1-id>');` → seeds `bracket_size` entries, builds
   round 2. It refuses until 10 minutes after `closes_at`: payments made before
   the deadline need that long to settle, and a slow webhook must not turn an
   on-time buyer into a refund. Announce results "shortly after" the deadline.
6. `open_round` each bracket round, leave it two days, then `close_round`.
   Four bracket rounds. `open_round('<id>', '<closes-at>')` sets a new closing
   time; it refuses one under an hour away. Opening a round starts checkout
   immediately, whatever its scheduled start.
   After every close, the Health tab (or by hand):
   - `select * from late_confirmations;` — payments that settled after results
     were computed. The webhook refunds these automatically and each row drops
     out when the refund lands, usually within a minute. Anything still listed
     after that needs a manual refund in Stripe.
   - `select * from rejected_photos_live;` — must be zero rows.
   - Run the email sweep (Email tab) for advancement and elimination notices.
   While voting is open, keep `HEALTH_CHECKS` on (docs/LAUNCH.md, section 6):
   it is what tells staff a webhook has broken before readers do.
   To remove a pet mid-contest (stolen photo, ineligible entrant): Moderation
   tab → Approved → Disqualify…. It refuses during the Open Round if the field
   would drop below `bracket_size`.
7. The final `close_round` returns null and flips the contest to `complete`.
   Side awards (`side_awards`) and the payout figure (`contest_stats.
   shelter_cents`) are ready the moment it does.

Total elapsed: roughly two and a half weeks. Do not stretch it. Past three
weeks everyone is exhausted, staff included.

## Local development

```
supabase start
supabase db reset          # applies migrations/ in order, then seed.sql
supabase test db           # pgTAP: access, bracket, health, lifecycle, moderation
supabase functions serve --env-file supabase/tests/integration/functions.env
deno test --allow-env --allow-read supabase/functions/_shared
npm --prefix web run e2e   # browser tests; mutate the DB, so reset after
supabase db reset && node --test supabase/tests/integration/functions.test.mjs
cd web && npm run dev
```

`supabase start -x studio,logflare,vector,realtime,imgproxy,postgres-meta,supavisor,mailpit`
starts only what the tests need, about a quarter of the full download.

Migrations use `create function`, not `create or replace`. To change a
function, add a new numbered migration (which may `create or replace`, or
drop and recreate when the signature changes — then re-grant). Never edit a
migration that has reached production.

`[auth.email] enable_signup` in config.toml must stay `true`: the CLI reads it
as "email provider on", and `false` disables admin password login too. The
global `[auth] enable_signup = false` is what refuses self-signup.

The local API gateway rewrites edge function CORS headers to `*`. Hosted
Supabase does not. Test CORS in `cors_test.ts`, not through `functions serve`.

## Legal, non-negotiable

- Checkout says **vote packs**, never "donation". Buying votes is not
  tax-deductible; the buyer receives something of value.
- `entries.rights_accepted_at` is a legal artifact. Never backfill it.
- One-page MOU per shelter before launch: promotion, split, logo use, term.
- WPR covering a partner shelter later carries a disclosure obligation.
