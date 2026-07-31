# wpr-pet-contest

Backend for an annual reader-submitted cutest pet contest, built for
[Wausau Pilot & Review](https://wausaupilotandreview.com), a nonprofit newsroom
covering Marathon County, Wisconsin.

Readers submit a pet. Everyone competes in one open round. The top 16 advance to
a bracket. Votes are purchased, and a published share of proceeds goes to
partner animal shelters.

## Format

| Round | Field | Length |
| --- | --- | --- |
| Submissions | open to all | 1 week |
| 1 — open | every approved entry | 1 week |
| 2 — round of 16 | 8 matchups | 2 days |
| 3 — quarterfinals | 4 matchups | 2 days |
| 4 — semifinals | 2 matchups | 2 days |
| 5 — final | 1 matchup | 2 days |

**Vote totals reset every round.** Round 1 buys qualification and a seed, and
nothing more. This is the design decision everything else hangs off: without it,
whoever wins the open round is mathematically uncatchable and the bracket is
decoration.

Ties break on earliest submission in the open round, and on better seed in
bracket rounds. There is nothing for a human to adjudicate.

## Stack

Supabase (Postgres, Storage, Edge Functions) for all state, Stripe for payments,
React/Vite on GitHub Pages embedded into WordPress.

Round advancement lives in Postgres rather than application code because closing
a round touches four tables and has to be all-or-nothing. In Postgres that is
free; orchestrating it from TypeScript means writing your own rollback.

## Local development

```bash
supabase start          # boots Postgres, Storage, Studio, mail catcher
supabase db reset       # applies migrations/, then seed.sql
supabase test db        # runs the pgTAP suite
supabase functions serve
```

`supabase db reset` leaves you with a contest accepting submissions, 20 approved
entries, and 3 in the moderation queue. Round 1 is staged but not open — run
`select open_round('00000000-0000-0000-0000-00000000d001');` to close
submissions and start voting, the same call production uses.

Copy `.env.example` to `.env` for the edge functions. In production these are
set with `supabase secrets set`, never committed.

## Access control

| Reader | entries | votes | leaderboard | late_confirmations |
| --- | --- | --- | --- | --- |
| anonymous visitor | approved only | no | yes | no |
| authenticated non-admin | approved only | no | yes | no |
| admin | all | all | yes | yes |
| edge functions (service role) | all | all | yes | yes |

`votes` holds buyer emails and is never readable by anon. The public leaderboard
reads `entry_round_totals`, an aggregate view, instead. `late_confirmations`
uses `security_invoker` so row level security still applies through it —
without that, its grant would hand the full buyer list to any logged-in session.

The first three rows of this table are asserted in the test suite.

## Tests

`supabase/tests/bracket_test.sql` covers seed ordering, bracket construction,
the full playthrough to a champion, per-round vote isolation, and every guard —
double-closing a round, voting for an eliminated pet, confirming an unknown
payment intent, webhook retry idempotency, and seeding with too few entries.

Run it before touching anything in `0003_functions.sql`.

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
receipt or page copy may imply the purchase is deductible.

## Known operational rule

Stripe webhooks can lag. `close_round` counts only votes that were confirmed at
the moment it ran, so a payment settling afterward is money taken for a vote
nobody received. The `late_confirmations` view lists exactly those. Check it
after every round close; the answer should be zero rows.

## Repository layout

```
supabase/
  migrations/
    0001_schema.sql      tables, enums, the entry_round_totals view
    0002_rls.sql         row level security, the is_admin() helper
    0003_functions.sql   open_round, close_round, seeding, vote lifecycle
    0004_storage.sql     the pets bucket and its policies
  functions/
    _shared/cors.ts      preflight handling for browser-facing functions
    _shared/env.ts       required-secret checks that fail at module load
    submit-entry/        the only anonymous write path in the system
    create-checkout/     vote packs, Stripe payment intent creation
    stripe-webhook/      the only place a vote becomes real
  tests/
  seed.sql
```

`CLAUDE.md` holds the invariants and the contest runbook.

## Not built yet

The React front end: submission form, gallery, bracket view, checkout, and the
admin moderation queue.

## License

MIT. If you run a small newsroom and want to hold one of these, take it.
