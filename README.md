# wpr-pet-contest

An annual reader-submitted cutest pet contest for
[Wausau Pilot & Review](https://wausaupilotandreview.com), a nonprofit newsroom
covering Marathon County, Wisconsin.

Readers submit a pet. Everyone competes in one open round. The top 16 advance to
a bracket. Votes are purchased in packs, and a published share of proceeds goes
to partner animal shelters.

## Format

| Round | Field | Length |
| --- | --- | --- |
| Submissions | open to all | 1 week |
| 1 — Open Round | every approved entry | 1 week |
| 2 — Sweet 16 | 8 matchups | 2 days |
| 3 — Elite Eight | 4 matchups | 2 days |
| 4 — Final Four | 2 matchups | 2 days |
| 5 — Championship | 1 matchup | 2 days |

**Vote totals reset every round.** Round 1 buys qualification and a seed, and
nothing more. This is the design decision everything else hangs off: without it,
whoever wins the open round is mathematically uncatchable and the bracket is
decoration.

Ties break on earliest submission in the open round, and on better seed in
bracket rounds. There is nothing for a human to adjudicate.

## What raises the money

| Lever | Where |
| --- | --- |
| Vote packs, $5 to $250, per-vote price falling from $1.00 to about 42 cents | `vote_packs` (per contest, no redeploy to change) |
| Sponsored Double Vote windows: a sponsor pays for an hour in which every pack counts twice | `bonus_windows` |
| Sponsor slots: presenting, gallery, bracket, post-purchase thank-you, each an upsell card when unsold | `web/src/config.js` |
| Per-pet share pages, so a Facebook share shows the pet's face | `web/scripts/build-share-pages.mjs` |
| Share images: owners make a story, square post or printable QR flyer from their pet's page; staff generate leaderboard, matchup and results cards from live numbers | `web/src/lib/graphics/`, admin Social tab |
| Approval email with the owner's share link (off until configured) | `notify` function |
| Live "raised for shelters" counter and anonymous purchase ticker | `contest_stats`, `recent_activity` |
| Newsletter opt-in at entry and checkout, and a separate, tax-deductible donate ask after purchase | `newsletter_signups`; the thank-you screen |

`docs/LAUNCH.md` is the checklist for everything outside the code, including
the promotion calendar.

## Stack

Supabase (Postgres, Storage, Edge Functions) for all state, Stripe for
payments, React/Vite on GitHub Pages embedded into WordPress.

Round advancement lives in Postgres rather than application code because closing
a round touches four tables and has to be all-or-nothing. In Postgres that is
free; orchestrating it from TypeScript means writing your own rollback.

## Local development

```bash
supabase start          # boots Postgres, Storage, Studio, mail catcher
supabase db reset       # applies migrations/, then seed.sql
supabase test db        # pgTAP: access, bracket, lifecycle, moderation
cp .env.example .env    # then fill in Stripe test keys
supabase functions serve --env-file .env
deno test --allow-env --allow-read supabase/functions/_shared
cd web && cp .env.example .env.local && npm install && npm run dev
```

`supabase db reset` leaves you with a contest accepting submissions, five vote
packs, a Double Vote window tomorrow evening, 20 approved entries, and 3 in the
moderation queue. Round 1 is staged but not open. Work the queue in the admin
panel, then open round 1 there (or `select open_round('00000000-0000-0000-0000-00000000d001');`
as an admin), the same call production uses.

To sign in to the admin panel locally, create a user in Studio
(http://127.0.0.1:54323 → Authentication) and add them to `admins`.

## Access control

| Reader | entries | votes | leaderboard and stats | admin reports |
| --- | --- | --- | --- | --- |
| anonymous visitor | approved only, pet columns only | no | yes | no |
| signed in, not an admin | approved only | no | yes | no |
| admin | all | read only | yes | yes |
| edge functions (service role) | all | all | yes | yes |

- `votes` holds buyer emails and is never readable by anon. The public reads
  aggregate views (`entry_round_totals`, `contest_stats`, `recent_activity`,
  `side_awards`) that carry sums and counts, never an identity.
- `entries` is column-granted to anon. Row level security filters rows, not
  columns; without the column grant, every approved entrant's email would be
  public.
- Nobody, admins included, can UPDATE contest or round status, entry status,
  the published split, or any vote. Those change only through functions.
- Admin reports (`late_confirmations`, `round_revenue`, `pack_revenue`,
  `entry_revenue`, `newsletter_signups`, `rejected_photos_live`) use
  `security_invoker`, so RLS on `votes` and `entries` still applies through
  them.

`supabase/tests/access_test.sql` pins the entire anonymous and signed-in
privilege surface: every readable table, every readable column of `entries`,
every executable function. It exists because of two bugs no functional test
noticed. The platform stopped granting table privileges by default, which would
have made the whole front end return 403. And Postgres grants EXECUTE to PUBLIC,
which made every security definer function callable by anonymous visitors,
including the one that credits votes.

## Tests

| Suite | Covers |
| --- | --- |
| `access_test.sql` | The whole privilege surface, and anon, non-admin and admin probes |
| `bracket_test.sql` | Seed ordering, bracket construction, a full playthrough, per-round vote isolation, the guards |
| `lifecycle_test.sql` | Pricing, bonus windows, confirmation, the deadline and settle period, late payments, disputes and partial refunds, frozen results, round windows, race-free entry, side awards, the email queue |
| `moderation_test.sql` | The audit trail, one-way rejection, the rejected-photo check (thumbnails included) |
| `health_test.sql` | Every live-contest check, and the bookkeeping that reports a problem once |
| `disqualify_test.sql` | Removal mid-contest: the guards, refunds in every round, walkovers, no stray email, the alert |
| `functions/_shared/*_test.ts` | Photo type sniffing and metadata stripping, input validation, CORS, email and alert text |
| `tests/integration/functions.test.mjs` | Every edge function over HTTP against the running stack: real uploads, moderation as a real staff session, checkout validation and rate limits, signed Stripe webhooks, health checks |
| `web/e2e/contest.spec.js` | A real browser: a reader enters from a phone photo, staff moderate and open voting, a paid vote appears live, checkout's packs and legal copy |

CI runs all of it, plus the front end's lint, unit tests and build, on every
pull request. The integration and browser suites need the stack and the
functions running:

```bash
supabase start && supabase db reset
supabase functions serve --env-file supabase/tests/integration/functions.env
npm --prefix web run e2e
supabase db reset && node --test supabase/tests/integration/functions.test.mjs
```

## Why a separate Stripe account

Stripe's discounted nonprofit rate requires that most of an account's volume be
tax-deductible donations. **Buying votes is not a tax-deductible donation** —
the buyer receives something of value in exchange, the same way an auction or
ticket purchase does.

A successful contest pushing thousands of non-deductible transactions through
the newsroom's main Stripe account can therefore put the discount on its actual
donations at risk. Run the contest on its own account. It also makes shelter
payout reconciliation trivial.

For the same reason, checkout says **vote packs**, never "donation", and no
receipt or page copy may imply the purchase is deductible. The post-purchase
screen does invite a donation to WPR, as a link to WPR's own donation page,
visibly separate from the purchase.

## Payments that arrive late

A vote counts if the buyer paid by the round's deadline, as Stripe records it
(the signed event's timestamp), plus a two-minute grace for someone who pressed
Pay at 7:59:58. Anything later is marked `late`, even while the round is still
open, and refunded by the webhook automatically. Without that rule, a buyer who
opened several checkouts before the deadline could keep them open and pay
afterward, watching the leaderboard, when nobody else could still buy.

Stripe webhooks can lag, so `close_round` refuses to run until ten minutes
after the deadline, giving on-time payments time to arrive. It locks the round,
so no payment can land between the tally and the status change, and it
snapshots the tally into `round_results`. From then on that round's published
totals and side awards come from the snapshot and never move. Refunds and
chargebacks after the fact still come off the money raised.

`late_confirmations` lists late payments until their refunds land. After every
close it should empty itself within a minute or two; anything that stays needs
a manual refund in Stripe.

Disqualifying a pet after voting starts refunds every pack ever bought for it
and hands any matchup it is in to its opponent (`disqualify`). Running it again
retries refunds that did not go through, and the health checks alert on any
still outstanding after fifteen minutes.

Chargebacks mark the vote `disputed` and take its votes back out of any round
still in play. Partial refunds leave the votes in place but come off the money
raised, and so off the shelters' share; refund in full to remove the votes.

Checkout takes cards and card wallets (Apple Pay, Google Pay) only. Bank debits
settle days later, after the round has closed, and would be refunded every
time. Checkout and entry are rate-limited per connection (hashed, never stored
raw) to blunt card testing; Stripe Radar is the real defense.

## Photos

The file input excludes HEIC so iOS converts to JPEG itself. The front end then
re-encodes through a canvas (at most 2048px), which bakes in orientation and
drops EXIF. `submit-entry` checks the type from the bytes rather than the
client's claim, and strips metadata again, keeping only orientation. Phone EXIF
carries GPS coordinates, which for most entrants is their house, and the bucket
serves originals publicly.

The browser also uploads an 800px copy, stored as `thumb_path` and checked and
stripped like the original, so the gallery is fast on phones without the paid
plan's image resizing. A missing or bad thumbnail falls back to the original.

Rejecting an entry deletes its photo and thumbnail in the same request
(`moderate`). `rejected_photos_live` lists any rejected entry with a file still
in the bucket; it should always be empty.

## Alerts during a contest

The `health` function runs every ten minutes while `HEALTH_CHECKS` is on. It
reports late payments whose refund is stuck, rejected photos still public, a
moderation queue more than a day behind, rounds left unopened or unfinalized,
and the failure that matters most: payments Stripe says succeeded that never
became votes, which means the webhook is broken. Problems go to staff email
or a Slack/Discord/Teams webhook when they start, every two hours while they
last, and when they clear. The admin desk's Health tab shows the same checks
live. Setup is in `docs/LAUNCH.md`, section 6.

## Email

Off until configured. When `RESEND_API_KEY` is unset, nothing is sent and the
admin panel says how many messages are waiting. When it is set, the `notify`
sweep sends whatever `notification_queue()` says is owed: received,
approved (with the share link), rejected (with the reason), advanced,
eliminated, champion. Every send is recorded; a sweep can run any number of
times without repeating one. Setup is in `docs/LAUNCH.md`.

## Repository layout

```
supabase/
  migrations/
    0001_schema.sql          tables, enums, the entry_round_totals view
    0002_rls.sql             row level security, the is_admin() helper
    0003_functions.sql       open_round, close_round, seeding, vote lifecycle
    0004_storage.sql         the pets bucket and its policies
    0005_privileges.sql      explicit grants; the PUBLIC execute fix
    0006_vote_statuses.sql   'late' and 'disputed'
    0007_vote_lifecycle.sql  vote packs, bonus windows, quote, confirm, dispute
    0008_round_control.sql   open_submissions, round windows, preflight guards
    0009_moderation.sql      moderate_entry, captions, rejected_photos_live
    0010_reporting.sql       public stats, side awards, admin revenue views
    0011_notifications.sql   the email queue and send log
    0012_hardening.sql       review fixes: deadline by payment time, frozen
                             results, unlistable bucket, race-free entries,
                             partial refunds, rate limits
    0013_round_one.sql       open_submissions stages round 1
    0014_thumbnails.sql      thumb_path, and thumbnails in the leak check
    0015_health.sql          live-contest checks and alert bookkeeping
    0016_disqualified_status.sql
    0017_disqualification.sql  removal mid-contest, with refunds and walkovers
  functions/
    _shared/                 CORS, errors, validation, photo stripping, email
    submit-entry/            the only anonymous write path in the system
    create-checkout/         vote packs, Stripe payment intent creation
    stripe-webhook/          the only place a vote becomes real
    moderate/                approve, reject (deletes the photo), purge
    notify/                  the email sweep
    health/                  live-contest checks and staff alerts
    disqualify/              remove a pet mid-contest; refunds its buyers
  tests/                     pgTAP suites, plus integration/ (HTTP) and fixtures/
  seed.sql
web/                         the React front end, share pages, admin panel;
                             e2e/ holds the browser tests
docs/LAUNCH.md               setup, dry run, promotion calendar
```

`CLAUDE.md` holds the invariants and the contest runbook.

## License

MIT. If you run a small newsroom and want to hold one of these, take it.
