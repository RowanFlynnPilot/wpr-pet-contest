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
- **Paid votes are credited by webhook only**, on `payment_intent.succeeded`.
  Never on the browser redirect. (Free votes have their own single path; see
  the free daily vote below.)
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
- **`votes` and the free-vote tables are never readable by anon.** They hold
  buyer and voter emails, keyed connection hashes and token hashes. The
  public leaderboard reads the `entry_round_totals` view instead.
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
- **A withdrawn pet's buyers are not refunded.** Published policy: when an
  owner takes a pet out (it died, was rehomed), vote packs already bought for
  it stand and the shelters' share of them stays. Otherwise it leaves as a
  disqualified pet does: its opponent advances whatever the count, its free
  votes go back, a payment that lands afterward is refunded as late, and its
  photo is deleted. Only `withdraw_entry`, as the staff member, reason
  required. A pet that broke the rules is disqualified, never withdrawn. The
  money kept is still vote-pack revenue, never a donation.
- **The shelters' share is of sales after refunds; card fees are WPR's.**
  `payout_statement` and `shelter_payouts` compute it, split by each
  shelter's `payout_weight`, rounded so the parts add up to the pool exactly.
- **Personal data is erased a year after the contest** (published on the
  rules page): entrant names and emails, buyer emails, free voters' emails
  with their codes, browser tokens and connection hashes, opt-ins. Pets, towns,
  photos, results and money stay. The archive export never contains owner or
  buyer details, so nothing kept outlives the promise.
- **Moderation is audited.** Only `moderate_entry` changes an entry's status,
  run as the moderator (not the service role) so `moderated_by` is the real
  person. The `moderation_recorded` constraint backs it up.
- **Free votes are written only by `free_vote_record`** (0019), reached
  through the `free-vote` function once the voter has proved the address: an
  emailed code, an emailed link, or a browser token issued after one. No API
  role holds INSERT, UPDATE or DELETE on `free_votes`, not even service_role.
  - One per verified address per Central calendar day, enforced by a unique
    index on `(voter_id, vote_day)`. Addresses compare by `email_key()`.
  - A free vote is exactly one vote, never multiplied, and never touches
    money: no money view, payout, refund path or Stripe check reads
    `free_votes`.
  - Its deadline follows the paid side: cast by `closes_at`, or for a code,
    requested by `closes_at` and confirmed within the 2-minute grace. It takes
    the round FOR SHARE, and `close_round` snapshots free votes into
    `round_results.free_votes`.
  - A disqualified pet's free votes in unfinished rounds go back to their
    voters (`returned`), who may vote again that day.
  - Voids, blocks and pauses run only through `void_free_voters` and
    `set_free_vote_paused`, as the staff member, reason required, logged in
    `free_vote_staff_log`. Finished rounds keep their results.
  - Free voting is a contest setting changed only by `set_free_vote_enabled`,
    while the contest is a draft: it is in the published rules.
  - Codes are stored as HMACs keyed by `FREE_VOTE_HASH_KEY`, tokens as
    SHA-256. Emailed links never act on GET: they open a page whose button
    confirms.
- **Uploaded photos carry no metadata but orientation.** Phone EXIF holds GPS,
  which for most entrants is their house, and the bucket serves originals.
  `submit-entry` strips it server-side even though the front end re-encodes.
- **The live tally is a cache** (0025). Triggers on `votes` and `free_votes`
  keep `round_tally`; `entry_round_totals` serves it for unresolved rounds;
  `contest_health` reports `tally_drift`; `rebuild_round_tally` repairs it.
  `close_round` never trusts it: it re-sums from the vote tables before
  seeding. The cache has not been load-tested on staging yet.
- **Buyer notes are opt-in, one per round.** A box at checkout
  (`plays_again_opt_in`) asks for one email per bracket round about the pets
  that address backed. `buyer_notices` dedups on (email, round, kind); the
  sweep sends only what `buyer_notice_queue` returns; every note carries a
  stop link and one-click unsubscribe, and `buyer_notice_unsubscribe` clears
  the opt-in for every pack that address bought in the contest.
- **Entrant tips stop on request.** Six nurture emails per owner over the
  contest (`nurture_*` kinds), gated by `entries.nurture_opt_out_at`, which
  only `entrant_opt_out` sets, with the owner's token. Notices about the
  entry itself (approved, advanced, eliminated) still go.
- **An owner's goal is the owner's.** `set_entry_goal` needs the entry's
  `owner_token` from the approval email. The token is a bearer secret:
  rate-limited in the `links` function, never read back, rotated at erasure.
- **Sponsor matches are the sponsor's money, never votes.** `sponsor_matches`
  windows cannot overlap; `sponsor_match_cents` counts sales whose checkout
  began in the window, after refunds, up to the cap. It is added to the
  shelters' pool on the counter and the payout statement, listed for the
  sponsor to settle, and never changes a count.

## Tiebreaks

- Open round: earliest submission wins. Deterministic, rewards entering early.
- Bracket rounds: better (lower) seed wins, which traces back to round 1.

No coin flips, no ties to adjudicate by hand.

## Running a contest

Everything below is a button in the admin panel (`#/admin`). The SQL is what
the buttons call, for when the panel is not an option.

1. Setup tab → set up the contest (`create_contest`): a draft with the
   recommended pack ladder, or a copy of last year's packs and shelters. Add
   the shelters and their payout weights (per the MOUs), any sponsored
   `bonus_windows`, and any sponsor matches (Packs & bonuses tab; a match may
   be added mid-contest, since it changes money, not votes). Everything is editable while it is a
   draft (`update_draft_contest`); the split is published on the rules page and
   freezes when submissions open. The free daily vote is a Setup switch too
   (draft only, and only after counsel; docs/FREE-DAILY-VOTE.md). So is an
   optional shelter goal, shown as a meter under the money counter; once
   entries open it can only be raised (`set_shelter_goal`). The Setup
   checklist says what is missing.
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
     The same sweep sends the entrant tips and the buyers' "plays again"
     notes; nothing else to run.
   - Newsletter tab → Build block, for the next edition: the new standings or
     matchups, ready to paste into the Noptin draft as one Custom HTML block.
   - If the free daily vote is on, the Free votes tab, daily too: its watch
     lists, and any `free_vote_*` warning on the Health tab.
   While voting is open, keep `HEALTH_CHECKS` on (docs/LAUNCH.md, section 6):
   it is what tells staff a webhook has broken before readers do.
   To remove a pet mid-contest (stolen photo, ineligible entrant): Moderation
   tab → Approved → Disqualify…. An owner asking to take a pet out:
   Withdraw… (no refunds). It refuses during the Open Round if the field
   would drop below `bracket_size`.
7. The final `close_round` returns null and flips the contest to `complete`.
   Side awards (`side_awards`) and the payout figures are ready the moment it
   does. Wrap-up tab: print the shelter payout statement (`payout_statement`,
   `shelter_payouts`), download the archive, and export the newsletter list.
8. A year later (the health checks remind you), Wrap-up → Erase personal data
   (`erase_personal_data`). The rules promise it; it refuses inside the 120-day
   chargeback window.

Total elapsed: roughly two and a half weeks. Do not stretch it. Past three
weeks everyone is exhausted, staff included.

## Local development

```
supabase start
supabase db reset          # applies migrations/ in order, then seed.sql
supabase test db           # pgTAP: access, bracket, contest admin, disqualify, free vote, hardening, health, lifecycle, moderation, withdrawal
supabase functions serve --env-file supabase/tests/integration/functions.env
deno test --allow-env --allow-read supabase/functions/_shared
npm --prefix web run e2e   # browser tests; mutate the DB, so reset after
npm --prefix web run audit # a11y + phone layout, against the mock API; no Docker
supabase db reset && node --test supabase/tests/integration/functions.test.mjs
cd web && npm run dev
```

`supabase start -x studio,logflare,vector,realtime,imgproxy,postgres-meta,supavisor,mailpit`
starts only what the tests need, about a quarter of the full download.

`SHARE_CARDS=true npm --prefix web run build` also draws the matchup share
cards (`web/scripts/matchup-cards.py`, Pillow). The Pages workflow sets it;
without it the matchup pages carry the first pet's photo.

Migrations use `create function`, not `create or replace`. To change a
function, add a new numbered migration (which may `create or replace`, or
drop and recreate when the signature changes — then re-grant). Never edit a
migration that has reached production.

`[auth.email] enable_signup` in config.toml must stay `true`: the CLI reads it
as "email provider on", and `false` disables admin password login too. The
global `[auth] enable_signup = false` is what refuses self-signup.

Without Docker, `node web/scripts/mock-api.mjs` serves a read-only mock of the
public API (`/__phase?set=submissions|open|bracket|complete`); point
`VITE_SUPABASE_URL` at it for layout, widget and newsletter-block work.

The local API gateway rewrites edge function CORS headers to `*`. Hosted
Supabase does not. Test CORS in `cors_test.ts`, not through `functions serve`.

## Legal, non-negotiable

- Checkout says **vote packs**, never "donation". Buying votes is not
  tax-deductible; the buyer receives something of value.
- `entries.rights_accepted_at` is a legal artifact. Never backfill it.
- WPR staff and their households may not enter (rules, Eligibility). The entry
  form says so and `submit-entry` refuses work addresses
  (`STAFF_EMAIL_DOMAINS`, default `wausaupilotandreview.com`); moderation is
  the real check.
- One-page MOU per shelter before launch: promotion, split, logo use, term.
- WPR covering a partner shelter later carries a disclosure obligation.
