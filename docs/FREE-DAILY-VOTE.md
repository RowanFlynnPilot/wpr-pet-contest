# Free daily vote

> **Legal position (Oct. 26, 2026, from WPR's editor; confirming with
> Lawyers for Reporters).** The contest awards no prize, so selling vote
> packs raises no lottery question (Wis. Stat. 945.01), and a free route
> would not have cured one anyway. Turning the free vote on is a product
> decision, not a legal one.

**Status:** built behind a contest switch that is off by default (migration
0019, the `free-vote` function, the pet-page sheet and the Free votes tab).
Decided Oct. 23, 2026: build now and switch on after counsel answers section
9; one free vote a day for any pet; a remembered browser plus optional
morning reminders; free votes count in every round. Not yet built from this
doc: the Resend bounce webhook, Turnstile step-up during spikes, and the
domain-cluster alert. The switch is a separate draft-only function,
`set_free_vote_enabled`, rather than a new argument to `create_contest`.
**Date:** October 23, 2026
**Read with:** `CLAUDE.md` (the invariants), `PRODUCT.md`, `docs/LAUNCH.md`

## Summary

The proposal is to give every reader one free vote a day alongside the vote
packs. The free vote costs nothing and counts as exactly one vote. It requires
a verified email address. That requirement is what makes it useful to WPR,
because it brings a confirmed address that may opt in to the newsletter and a
reason to come back tomorrow. It is also what stops it from becoming unlimited
free voting.

The recommended design:

- **Verify by emailed code.** A six-digit code goes out through the contest's
  existing Resend setup, and the reader types it into a sheet on the pet page.
  The same email carries a tap-to-confirm link for readers who open it on
  another device. No Supabase Auth accounts are created. Section 4 compares
  the options.
- **Remember the browser after the first code.** After that, voting takes two
  taps a day. An optional morning reminder email brings readers back with a
  link that works in one tap.
- **One free vote per email address per calendar day, Central time.** A unique
  index enforces the limit. A Double Vote window never multiplies a free vote,
  and a free vote counts only in the round that is open.
- **Free votes live in their own table** (`free_votes`), so no money view,
  refund path or payout changes. They are added to paid votes in
  `entry_round_totals.votes`, and `close_round` freezes them into
  `round_results` with everything else.
- **The same deadline rules as paid votes.** A free vote counts if it is cast
  by the round's closing time. A vote confirmed by emailed code gets the same
  two-minute grace, but only if the code was requested before the deadline.
- **Paid voting stays the main action.** The Vote button and the pinned bar
  stay paid. The free vote is a quieter button below them, and every free vote
  ends on a vote-pack offer.
- **A contest-level flag turns it on.** The flag is set while the contest is a
  draft and is fixed when submissions open, like the shelter split. Staff get
  a pause switch for abuse, subject to what counsel says.

Two things come before any building: counsel answers the questions in section
9, and the newsroom works through section 15. The rough effort is 15 to 20
developer days, which is about three to four calendar weeks with review
(section 13).

---

## 1. Why, and how strong the evidence is

The request cites two examples.

- **LNP's "Scenes of Lancaster County."** The LINA article
  (<https://lina.org.au/2025/07/10/competitions-as-engagement-tool/>) says
  voting once a day is free and each additional vote is $1. It says winners
  receive a cash prize and a place in the paper's calendar. It gives no
  figures for sign-ups, revenue or return visits.
- **A Second Street athlete ballot.** The case study is at
  <https://uplandsoftware.com/articles/times-herald-record-athlete-ballot/>,
  and the URL names the Times Herald-Record. As cited in the request, it
  reports 2,800+ database opt-ins, 2,700+ sponsor opt-ins and daily-vote
  reminder emails. The page returned a server error when fetched for this doc,
  so those figures are **not checked here**. Read it before quoting it. It is
  a vendor's case study, and the request's summary does not say whether that
  ballot sold votes at all.

**What the evidence supports:** newsrooms use a daily free vote with
reminders, and it plausibly grows email lists.

**What it does not support:** any claim about what a free vote does to paid
revenue. There is also no WPR baseline. `PRODUCT.md` says no real contest data
exists yet, so the first contest cannot measure cannibalization. It can only
estimate it (section 11).

A free vote may also give the contest a no-purchase path. Whether that matters
legally is a question for counsel. This doc does not answer it (section 9).

## 2. Goals and non-goals

**Goals**

1. **Grow the newsletter list** with verified addresses. The opt-in box is
   never pre-checked, like the boxes at entry and checkout.
2. **Bring readers back daily** while voting is open. Each return visit is
   another look at the pets, the packs, the sponsors and the newsroom.
3. **Give every reader a way to take part without paying.** Whether this has
   legal weight is up to counsel.
4. **Do not cannibalize paid packs.** Paid stays the primary action. The free
   vote is one vote a day and is never multiplied. Every free vote leads to the
   packs.

**Non-goals**

- Making free voting equal in weight to paid voting. If counsel says a free
  path must be equal in weight, this design does not meet that bar (Q2).
- Reader accounts: no passwords, no profiles, no `auth.users` rows for voters.
- Sharing voter emails with sponsors. The rules promise addresses are "never
  published or sold" (Q9).
- Any change to the money. Free votes never touch `contest_stats.gross_cents`,
  `payout_statement` or `shelter_payouts`, and the shelters' share is
  unchanged.
- Any change to the format, the tiebreaks or round control.
- SMS or social login.
- Automatic fraud rulings. The system raises alerts, and staff decide what to
  void.

## 3. How a vote works today

1. `create-checkout` calls `vote_quote` (0007), which checks the round, the
   pet and the pack and returns the price. It then creates a Stripe payment
   intent and calls `create_pending_vote`. The bonus multiplier is locked at
   that point.
2. `stripe-webhook` receives `payment_intent.succeeded` and calls
   `confirm_vote(intent, paid_at)` (0017). The vote counts if the round is
   open, the pet is approved, and Stripe's signed `paid_at` is no later than
   `closes_at + payment_grace()` (2 minutes, 0012). Otherwise the vote is
   marked `late` and refunded. `confirm_vote` takes the round `FOR SHARE`, so
   it cannot interleave with `close_round`.
3. `entry_round_totals` (0012) returns the `round_results` snapshot for
   resolved rounds and live sums from `votes` for the rest.
4. `close_round` refuses until `closes_at + settle_period()` (10 minutes),
   seeds or advances, and copies the tally into `round_results`.

Many objects read `votes`. They are the reason free votes should not be rows
in it:

| Reads `votes` | What a free-vote row in `votes` would break |
| --- | --- |
| `votes` constraints | `amount_cents > 0` and `stripe_payment_intent_id not null unique` would both have to go |
| `contest_stats` | "Votes sold" on the Money tab; `gross_cents` without a filter |
| `round_revenue`, `pack_revenue`, `entry_revenue` | purchase, buyer and per-pack counts |
| `payout_statement`, `shelter_payouts` | purchase counts, next to the shelters' money |
| `recent_activity` | the purchase ticker would fill with one-vote rows |
| `newsletter_signups` | filters on `status = 'succeeded'`, which is a payment state |
| `disqualify_entry`, `disqualify` function | would return free rows as payment intents to refund |
| `contest_health` (`disqualified_unrefunded`) | a free vote for a disqualified pet would raise an alert that never clears |
| `late_confirmations`, `health` Stripe cross-check | both are keyed to payment intents |

Each of these would need a `source = 'paid'` filter, and a single missed
filter would misstate money. A separate table leaves all of them untouched.

## 4. Options for verifying a free vote

| | Friction on a phone | Fraud resistance | Running cost | Deliverability exposure | Fit with this codebase |
| --- | --- | --- | --- | --- | --- |
| **A. Emailed 6-digit code** (own tokens, Resend) | Medium the first time, low after if the browser is remembered | One inbox per vote per day | One email per verification | High: the code must arrive within seconds | Good |
| **B. Emailed confirm link** (own tokens, Resend) | Higher: the reader leaves the iframe and loses their place | Same as A | Same as A | Same as A, plus link scanners | Good, as a fallback to A |
| **C. Supabase Auth email OTP or magic link** | Same as A | Same as A, with built-in captcha | Needs custom SMTP anyway | Same as A | Poor |
| **D. Cookie or device limit, no email** | Lowest | None to speak of | None | None | Easy, but meets no goal |

**A. Emailed code.**
- **Flow.** The reader stays inside the WordPress iframe, switches to Mail,
  reads the code and types it in. The email puts the code in the subject line,
  so it shows in the notification. iOS can offer emailed codes as keyboard
  autofill (`autocomplete="one-time-code"`). Whether that works inside a
  cross-origin iframe is untested, so it goes on the device test list.
- **Fraud.** An attacker needs a working inbox for every vote every day. A
  private catch-all domain gets around that, which is why there are domain
  alerts (section 8).
- **Fit.** `sendEmail`, `hit_rate_limit`, the `WP400` reader-error pattern and
  CORS handling already exist.

**B. Emailed link.**
- **Flow.** Tapping the link in Mail opens a new tab, often outside the
  WordPress page. That costs the reader their place, though it gives WPR a
  pageview if the link targets the WordPress URL.
- **Scanners.** Corporate mail scanners open links to check them, so a link
  that votes on GET would cast votes nobody asked for. The link has to open a
  page whose button confirms the vote.
- **Recommendation.** Use it as a fallback in the same email as A, for readers
  who open the email on another device.

**C. Supabase Auth OTP.**
- **Self-signup.** It requires turning on self-signup (`[auth] enable_signup`).
  Today that setting is what keeps the public out of the `authenticated` role.
- **The privilege model.** Every voter would become an `authenticated` session
  in a model that treats that role as invited staff ("Signed-in sessions are
  invited staff (signups are disabled)", 0005). The 0012 tightening and the
  non-admin probes in `access_test.sql` would keep the obvious leaks closed.
  But every grant to `authenticated` would become reachable by anyone with an
  email address.
- **Bundle weight.** The public client deliberately carries no session and
  skips supabase-js to save weight (`web/src/lib/supabase.js`). Voter auth
  would add it back to every reader's phone.
- **Email and erasure.** Supabase's built-in mailer is not meant for production
  volume, so custom SMTP would be needed anyway. Erasure would also have to
  delete auth users.
- **Verdict.** Not recommended.

**D. Cookie or device limit.**
- **No list.** It collects no email, so it fails goal 1.
- **No real limit.** A private window gets around it.
- **Storage.** Safari partitions, and may clear, storage in third-party
  iframes.
- **Cannibalization.** A free vote anyone can repeat at will is the version
  most likely to cannibalize packs.

**Not pursued.** SMS costs money per message and collects phone numbers.
Social login brings OAuth consent screens, platform app review and a third
party in the vote path.

**A smaller alternative, if the newsroom wants list growth without changing
voting:** add an unchecked "email me when this round closes" box on the pet
page. It collects addresses and brings readers back. It does not create a
no-purchase path.

**Recommendation: A, with B as a fallback in the same email, plus a remembered
browser.** The remembered browser is optional. The first version could ship
without it, because the reminder link covers most return visits. Without it,
though, readers who skip reminders would need a new code every day.

**Why codes do not go through the existing email queue.** `notification_queue`
is built around entries: `notifications.entry_id` is `not null`, with a unique
key of `(kind, entry_id, round_id)`. The sweep runs every 15 minutes
(`notify.yml`) with sends spaced 550 ms apart (`_shared/notify.ts`), and a
code has to arrive in seconds. So codes are sent synchronously with
`sendEmail` (`_shared/email.ts`) inside the request. Reminders can wait, so
they use a sweep modeled on `notify` (section 5.10).

---

## 5. Recommended design

### 5.1 The flow in brief

1. The reader taps **Cast your free daily vote**, below the paid Vote button on
   the pet page.
2. **The first time:** the reader enters an email, ticks the reminder and
   newsletter boxes or leaves them unticked, passes Turnstile (usually without
   seeing it), and taps **Email me a code**. The `free-vote` function (action
   `request`) checks the limits, records a challenge that holds the round and
   the pet, and emails a code and a link.
3. The reader types the code (action `verify`). The database checks it, marks
   the address verified, casts the vote through `free_vote_record`, and returns
   a device token for the browser to keep.
4. **Done screen:** the pet's new total, when the next free vote unlocks, a
   vote-pack offer and the share tools.
5. **Later days:** a browser holding a token sees "Cast your free vote as
   j•••@gmail.com" (action `cast`). No email is sent.
6. **Optional reminder:** each morning (Central), while a round is open and the
   reader has not voted that day. Its link proves the address and opens the
   pet page ready to cast.

### 5.2 Data model

All of this is new, in one migration (`0019_free_votes.sql`). It is a sketch,
not final SQL.

```sql
create type free_vote_status as enum ('counted', 'voided', 'returned');

-- Public through the existing table-level SELECT grant on contests: the front
-- end needs both. Nothing else about free voting goes on this table.
alter table contests
  add column free_vote_enabled   boolean not null default false,
  add column free_vote_paused_at timestamptz;

-- One row per address per contest. Erased with the rest of the personal data.
create table free_voters (
  id                uuid primary key default gen_random_uuid(),
  contest_id        uuid not null references contests(id) on delete cascade,
  email             citext not null,   -- as typed; where codes and reminders go
  email_key         text not null,     -- email_key(email): the identity the limits use
  verified_at       timestamptz,
  newsletter_opt_in boolean not null default false,
  reminders_opt_in  boolean not null default false,   -- this contest only
  undeliverable_at  timestamptz,       -- hard bounce: stop sending
  blocked_at        timestamptz,
  blocked_by        uuid references auth.users(id) on delete set null,
  blocked_reason    text,
  created_at        timestamptz not null default now(),
  unique (contest_id, email_key),
  constraint block_recorded check (blocked_at is null or blocked_reason is not null)
);

-- A code request, holding the vote it casts when confirmed. Codes are never
-- stored: only an HMAC keyed by FREE_VOTE_HASH_KEY, which the database never sees.
create table free_vote_challenges (
  id          uuid primary key default gen_random_uuid(),
  voter_id    uuid not null references free_voters(id) on delete cascade,
  round_id    uuid not null references rounds(id) on delete cascade,
  entry_id    uuid not null references entries(id) on delete cascade,
  code_hmac   bytea not null,
  link_hash   bytea not null unique,   -- sha256 of the emailed link token
  attempts    int  not null default 0,
  send_status text,                    -- 'sent' | 'failed', written by the edge function
  ip_hash     text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,    -- created_at + free_vote_code_ttl() (10 minutes)
  used_at     timestamptz,
  outcome     text                     -- cast | already_voted | late | locked | expired
);

-- Browsers that have proved the address, so later days need no email.
create table free_voter_devices (
  id           uuid primary key default gen_random_uuid(),
  voter_id     uuid not null references free_voters(id) on delete cascade,
  token_hash   bytea not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create table free_votes (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds(id),
  entry_id      uuid not null references entries(id),
  matchup_id    uuid references matchups(id),   -- as on votes: null in the open round
  voter_id      uuid not null references free_voters(id),
  vote_day      date not null,                  -- free_vote_day(cast_at)
  via           text not null check (via in ('code', 'link', 'device', 'reminder')),
  status        free_vote_status not null default 'counted',
  voided_at     timestamptz,
  voided_by     uuid references auth.users(id) on delete set null,
  voided_reason text,
  ip_hash       text,                           -- keyed hash, never the address
  cast_at       timestamptz not null default clock_timestamp(),
  constraint void_recorded
    check (status = 'counted' or (voided_at is not null and voided_reason is not null))
);

-- The daily limit is a constraint, not application logic, so two taps at once
-- cannot both count. A 'returned' vote (its pet was disqualified) frees the day.
create unique index free_votes_one_per_day on free_votes (voter_id, vote_day)
  where status <> 'returned';
create index free_votes_tally_idx on free_votes (round_id, entry_id)
  where status = 'counted';

create table free_vote_reminders (
  voter_id     uuid not null references free_voters(id) on delete cascade,
  reminder_day date not null,
  link_hash    bytea not null unique,
  status       text not null check (status in ('sent', 'failed')),
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  primary key (voter_id, reminder_day)
);

-- Pauses and voids, with who and why. Moderation is audited; so is this.
create table free_vote_staff_log (
  id           uuid primary key default gen_random_uuid(),
  contest_id   uuid not null references contests(id) on delete cascade,
  action       text not null check (action in ('pause', 'resume', 'void')),
  voter_ids    uuid[],
  votes_voided int,
  reason       text not null,
  actor        uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table round_results add column free_votes int not null default 0;
```

**Why the audit lives outside `contests`.** `contests` is granted to anon at
table level (0005), so every new column on it is public. The pause audit (who
paused it, and why) therefore goes in `free_vote_staff_log`, not on
`contests`.

### 5.3 Functions

| Function | Called by | Grant | What it does |
| --- | --- | --- | --- |
| `email_key(text)` | internal | none | Lowercases, drops a `+tag` from the local part, and drops dots for `gmail.com` and `googlemail.com`. The one definition of "the same address." |
| `free_vote_day(timestamptz)` | internal, tests | none | `(ts at time zone 'America/Chicago')::date` |
| `free_vote_code_ttl()`, `free_vote_reminder_hour()`, alert thresholds | internal | none | Constants, in the style of `payment_grace()` and `settle_period()` |
| `free_vote_record(voter, round, entry, via, requested_at, ip_hash)` | internal | none | **The one place a free vote is written.** Checks the flag and pause, the voter, and the round (`FOR SHARE`) with its timing; takes the entry `FOR SHARE` and checks it is approved; checks the matchup in a bracket round. Inserts, and turns a unique violation into `already_voted`. |
| `free_vote_challenge(round, entry, email, code_hmac, link_hash, ip_hash, newsletter, reminders)` | `free-vote` | service_role | Refuses when the flag is off, voting is paused, the round is not open, it is past `closes_at`, or the pet is not legal (the same checks and `WP400` messages as `vote_quote`). Upserts the voter, applies the per-address caps, records the challenge. Returns its id, expiry and a masked address. Answers the same way whether or not the address has voted today. |
| `free_vote_verify(kind, challenge_id, secret_hash, device_hash, ip_hash)` | `free-vote` | service_role | `kind` is `code`, `link` or `reminder`. Counts attempts and checks expiry. Marks the address verified and registers the device. For a code or link, casts the challenge's vote. Returns an outcome. |
| `free_vote_cast(device_hash, round, entry, ip_hash)` | `free-vote` | service_role | The remembered-browser path |
| `free_vote_preferences(device_hash, reminders, newsletter)` | `free-vote` | service_role | Opt-ins changed from the done screen |
| `free_vote_reminder_queue(limit)` | reminder sweep | service_role | Who is owed today's reminder (section 5.10) |
| `free_vote_unsubscribe(link_hash)` | `free-vote` | service_role | Turns reminders off from the email link |
| `void_free_voters(voter_ids uuid[], reason)` | admin desk, staff JWT | authenticated (checks `is_admin()`) | Blocks the voters, voids their counted votes in unresolved rounds, and logs it. Run as the staff member, so `voided_by` is a real person. |
| `set_free_vote_paused(contest, paused, reason)` | admin desk, staff JWT | authenticated (checks `is_admin()`) | Pause or resume, logged |

**Replaced in the same migration:**

- `entry_round_totals`: one new column appended (5.5).
- `close_round`: snapshots `free_votes` too.
- `disqualify_entry`: returns free votes (5.8).
- `newsletter_signups`: a third source.
- `contest_health`: new checks.
- `contest_stats`: `free_votes` appended.
- `erase_personal_data`: drop and recreate. The return type gains a
  `free_voters` count, so the grant must be restated.
- `create_contest` and `update_draft_contest`: drop and recreate with
  `p_free_vote boolean default false`, then re-grant. Copying from last year
  copies the flag.

**Unchanged on purpose:** `vote_quote`, `create_pending_vote`, `confirm_vote`,
`recent_activity`, `late_confirmations`, `round_revenue`, `pack_revenue`,
`entry_revenue`, `payout_statement`, `shelter_payouts`, `notification_queue`,
`seed_bracket` and `advance_bracket`.

### 5.4 The `free-vote` edge function

One anonymous function, `supabase/functions/free-vote/index.ts`. It has
`verify_jwt = false` in `config.toml`, like `create-checkout`, because it does
its own checks. CORS and errors go through the existing `serve()`.

| Action | Body | Before calling the database | Returns |
| --- | --- | --- | --- |
| `request` | `round_id`, `entry_id`, `email`, opt-ins, `turnstile_token`, honeypot `website` | rate limit `free-request`; honeypot (answer as if it worked, as `submit-entry` does); validate; disposable-domain check; Turnstile `siteverify` | challenge id, masked address, expiry. Then `sendEmail` with idempotency key `free-code:<challenge>`, and `send_status` written to the challenge. |
| `verify` | `challenge_id` + `code`, or a link or reminder token | rate limit `free-verify` | outcome, a new device token, the pet's fresh total |
| `cast` | `device_token`, `round_id`, `entry_id`, `turnstile_token` only when the pet is under step-up (section 8) | rate limit `free-cast` | outcome |
| `remind` | `device_token`, on or off | rate limit | ok |
| `unsubscribe` | token from the reminder email | rate limit | ok |

Secrets: `FREE_VOTE_HASH_KEY` (HMAC for codes and IP hashes) and
`TURNSTILE_SECRET_KEY`. The web build gets `VITE_TURNSTILE_SITE_KEY`. With
email switched off (`RESEND_API_KEY` unset), `request` refuses with "Free
voting isn't available right now." `scripts/preflight.mjs` blocks launch when
the flag is on and any of these secrets is missing.

Tokens are 32 random bytes. The database stores `sha256(token)`. Codes are
compared as `HMAC(FREE_VOTE_HASH_KEY, challenge_id || code)`, so a database
dump does not reveal live codes.

### 5.5 How free votes reach totals and frozen results

`votes` in `entry_round_totals` becomes paid plus free. A new `free_votes`
column carries the free part. `create or replace view` may append a column, so
every existing reader keeps working.

```sql
create or replace view entry_round_totals as
  select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
  from round_results t
  union all
  select live.round_id, live.entry_id,
         sum(live.votes)::int, sum(live.amount_cents)::bigint, sum(live.free_votes)::int
  from (
    select v.round_id, v.entry_id, v.quantity, v.amount_cents::bigint, 0
    from votes v join rounds r on r.id = v.round_id
    where v.status = 'succeeded' and r.status <> 'resolved'
    union all
    select f.round_id, f.entry_id, 1, 0::bigint, 1
    from free_votes f join rounds r on r.id = f.round_id
    where f.status = 'counted' and r.status <> 'resolved'
  ) live (round_id, entry_id, votes, amount_cents, free_votes)
  group by live.round_id, live.entry_id;
```

**It stays security definer**, for the reason in 0001: anon cannot read
`free_votes`, so a `security_invoker` version would show zero free votes
without raising any error.

**`close_round`** changes in one place:

```sql
insert into round_results (round_id, entry_id, votes, amount_cents, free_votes)
select t.round_id, t.entry_id, t.votes, t.amount_cents, t.free_votes
from entry_round_totals t where t.round_id = r.id;
```

Its lock, settle check and order are untouched. Existing `round_results` rows
default to 0 free votes, which is correct because none existed then.

**Seeding, advancement and side awards need no change.** `seed_bracket` and
`advance_bracket` rank on `entry_round_totals.votes`, so free votes count with
no code change, and the tiebreaks are untouched. `side_awards` reads the
Open Round snapshot. The front end gets the combined count everywhere it
already reads `votes`: the scoreboard, the leaderboard, the article widget,
the newsletter block and the share graphics.

**Load.** Every reader on a pet page polls totals every 20 seconds
(`useRoundTotals`), and free votes are one row each. The partial index
`free_votes_tally_idx` should keep the aggregate cheap. Load-test it in the dry
run with synthetic rows at the volume the newsroom expects. If it is slow,
keep a running count per pet and round, updated in `free_vote_record`.

### 5.6 Limits and the day boundary

- **Per day:** one free vote per verified address per Central calendar day,
  across the whole contest. `vote_day` is `free_vote_day(cast_at)`, and the
  unique index enforces it. Midnight Central is when the next vote unlocks,
  and it is what the site says. The front end already formats in
  `America/Chicago` (`web/src/lib/format.js`), and so does `contest_health`.
- **Why a calendar day and not a rolling 24 hours.** "Resets at midnight" is
  easy to explain, it lines up with the morning reminder, and a unique index
  can enforce it. A rolling window needs a time comparison under a lock.
- **Daylight time.** Daylight time ends Sunday, Nov. 1, 2026. If a contest
  spans that date, it is 25 hours long in Central time (05:00Z Nov. 1 to
  06:00Z Nov. 2). Keying on the date handles that with no special case.
- **Per round:** no separate cap. The effective cap is the number of Central
  dates the round touches. A 48-hour bracket round opened at 8 p.m. touches
  three dates, so a reader gets up to three free votes in it. If the newsroom
  wants exactly N per round, add `contests.free_votes_per_round` and check it
  in `free_vote_record` (decision 3).
- **Which pet:** the day's one vote goes to whichever pet the reader picks.
  Decision 3 asks whether it should be one vote a day per pet instead.
- **Votes a pet can receive:** no hard cap. A pet that goes viral should win.
  A spike raises an alert and turns on step-up checks (section 8).

### 5.7 Deadlines, the grace period and `close_round`

The rules follow `confirm_vote` and `vote_quote`, where checkout cannot start
after the deadline and payment gets two minutes to finish:

| Path | Counts when |
| --- | --- |
| Remembered browser or reminder link (one step) | cast at or before `closes_at` |
| Emailed code or link (two steps) | the code was requested at or before `closes_at` **and** confirmed at or before `closes_at + payment_grace()` |
| Anything later | refused, with "The {round} closed at {time}." Nothing is recorded, because there is nothing to refund. |

- **Requests after the deadline.** `free_vote_challenge` refuses a request
  after `closes_at`, as `vote_quote` refuses a checkout. That closes the trick
  of requesting codes before the deadline and confirming them afterward while
  watching the leaderboard. The paid side closed the same hole in 0012.
- **Locking.** `free_vote_record` takes the round `FOR SHARE`, like
  `confirm_vote`. `close_round` holds it `FOR UPDATE`, so a free vote either
  commits before the tally or sees the round resolved.
- **The settle period.** The 10-minute settle exists for slow webhooks. Free
  votes are recorded the moment they are cast, so they need none. The free
  window ends at `closes_at` plus 2 minutes, and `close_round` cannot run until
  `closes_at` plus 10, so the two never overlap. The lock is a second guard.
- **`late_confirmations`** is unchanged. It is about money.
- **The front end** hides the free-vote button once `useNow()` passes
  `closes_at`, as `CheckoutModal` hides Pay.

### 5.8 Disqualification

Policy: a disqualified pet's free votes in unfinished rounds stop counting and
go back to the voters, who may cast that day's free vote again. Finished
rounds keep their results. This is the free-vote version of "every vote pack
comes back."

`disqualify_entry` (create or replace; same signature) adds this inside its
transaction:

```sql
update free_votes f
set status = 'returned', voided_at = now(), voided_by = auth.uid(),
    voided_reason = 'pet disqualified'
from rounds r
where r.id = f.round_id and r.status <> 'resolved'
  and f.entry_id = e.id and f.status = 'counted';
```

- **Re-runs.** Running it again is harmless, because only `counted` rows
  change. The `disqualify` edge function needs no change: free votes return no
  payment intents.
- **Refunds and alerts.** `contest_health.disqualified_unrefunded` reads only
  `votes`, so it never waits on a free refund that cannot exist.
- **Races.** `free_vote_record` takes the entry `FOR SHARE`, so a vote cannot
  slip in beside a concurrent disqualification. A pet that is not `approved`
  is refused.
- **No email.** Voters are not emailed when a pet they voted for is removed.
  The volume is high and the message is low-value (decision 12).

### 5.9 Showing free votes

- **The scoreboard shows one combined number.** A vote is a vote, and the bracket
  is decided on the sum.
- **The pet page adds a small line under the count:** "Includes 212 free
  votes." This is the honest version of "drama with integrity." It also lets
  buyers see how small the free share is. Whether to show it is decision 4.
  The data is in `entry_round_totals.free_votes`.
- **The purchase ticker stays paid only.** `recent_activity` is unchanged.
  Free votes, one row each, would bury the purchases, and the ticker's job is
  showing that people are buying.
- **`contest_stats`** gains `free_votes` for an optional "N free votes cast"
  line. `votes` stays paid only, so "Votes sold" on the Money tab stays right.
- **The archive** (`lib/archive.js`) adds free counts per round from
  `round_results.free_votes`. It still contains no emails.
- **Copy that becomes false:** the Home page card "Every vote helps a shelter"
  (`PackCard` in `pages/Home.jsx`) must become "Every vote pack helps a
  shelter." Section 9 lists the rest.

### 5.10 Newsletter opt-in and daily reminders

**Newsletter.** The sheet carries the same unchecked box and wording as
checkout ("Send me Wausau Pilot & Review's free daily newsletter"). The
`newsletter_signups` view gains a third branch:

```sql
union all
select fv.contest_id, fv.email, fv.verified_at, 'free vote'
from free_voters fv
where fv.newsletter_opt_in and fv.verified_at is not null
```

Only verified addresses get in, so every free-vote row is a confirmed yes.
The Newsletter tab's copy ("opt-ins from entries and vote pack purchases")
gains "and free votes."

**Reminders** are a separate unchecked box: "Remind me each morning to vote
(this contest only)."

- **Who gets one.** `free_vote_reminder_queue` returns voters who opted in,
  are verified, are not blocked or undeliverable, have not voted today and
  have not had a reminder today. A round must be open, it must be past
  `free_vote_reminder_hour()` in Chicago, and it must be before `closes_at`.
  The sweep claims a `free_vote_reminders` row, then sends.
- **Schedule.** Reminders run in the existing `notify` sweep on the existing
  schedule. The database decides whether it is past the hour in Chicago, so
  the UTC cron needs no daylight-time adjustment.
- **Capacity.** At 550 ms between sends, one invocation sends roughly a
  hundred emails a minute, and the edge runtime limits how long one
  invocation can run (check the plan). A few thousand reminders therefore need
  either more frequent runs during the morning or Resend's batch endpoint
  (check its limits). Size this in the dry run.
- **The link** goes to the WordPress page (`PUBLIC_URL#/pet/<id>?fv=...`),
  which gives WPR the pageview. It proves the address, registers the browser
  and opens the free-vote sheet ready to cast. If the reader's last pet is
  out, it goes to `#/bracket` instead.
- **Unsubscribing.** Every reminder has an unsubscribe link and
  `List-Unsubscribe` headers. `sendEmail` takes no custom headers today and
  needs a small change. Reminders stop when the contest ends and never carry
  over to next year.
- **Content.** Reminders carry no pack pitch. The page they open does that.
  Keeping the email free of offers keeps it simpler to classify (Q7).

### 5.11 Personal data and erasure

New personal data: voter addresses and their `email_key`, keyed IP hashes,
device-token hashes and reminder logs. `erase_personal_data` takes all of it
within the existing promise and the existing 120-day floor:

```sql
update free_voters
set email = 'erased@invalid', email_key = 'erased:' || id,
    newsletter_opt_in = false, reminders_opt_in = false
where contest_id = c.id and email <> 'erased@invalid';
-- then: delete this contest's voters' rows from free_voter_devices,
-- free_vote_challenges and free_vote_reminders, and set free_votes.ip_hash
-- to null for this contest's rounds.
```

- **What stays.** The votes, counts and results stay. `free_vote_staff_log`
  keeps staff ids and reasons, so reasons should never include an address.
- **`email_key` is erased too.** A normalized address is still an address.
- **The keyed IP hash.** `ratelimit.ts` stores unsalted, truncated SHA-256
  hashes, which is fine for buckets that live a day. Anyone can reverse an
  unsalted hash of an IPv4 address by trying all of them. Per-vote hashes kept
  for months need the HMAC key. Whether to drop them sooner, at contest
  completion, is part of Q8.
- **The Wrap-up desk.** Its erase confirmation gains "every free voter's
  address," and the result line gains a voter count.

### 5.12 The contest flag and the pause switch

- **`contests.free_vote_enabled`.** It is set through `create_contest` and
  `update_draft_contest`, so it is editable only while the contest is a draft.
  It freezes when submissions open because it is in the rules, exactly like
  the split.
- **No grants on it.** No session gets `UPDATE` on it, and `access_test.sql`
  pins that.
- **The Setup checklist** shows it, along with what it requires: email, the
  Turnstile keys and the hash key.
- **`set_free_vote_paused`.** Staff can pause mid-contest when abuse outruns
  the controls. Pausing sets `free_vote_paused_at`, the site shows "Free
  voting is paused," and the `free_vote_paused` health check warns until
  someone resumes it.
- **Pausing needs counsel's answer.** If the free path is legally what keeps
  the contest lawful, pausing it may not be allowed (Q3).

---

## 6. Invariants in `CLAUDE.md`

### Reworded

**Votes are credited by webhook only.**
> **Paid votes are credited by webhook only**, on `payment_intent.succeeded`.
> Never on the browser redirect. **Free votes are written only by
> `free_vote_record`**, reached through the `free-vote` function once the voter
> has proved the address (a code, an emailed link, or a device token issued
> after one). Never on the browser's say-so, never by staff, never by a GET.
> No API role (anon, authenticated or service_role) holds INSERT, UPDATE or
> DELETE on `free_votes`.

**The deadline is when Stripe says the buyer paid.** Keep the paragraph and
add:
> A free vote's deadline is when it is cast. A one-step vote counts if cast by
> `closes_at`. A vote confirmed by emailed code or link counts if the code was
> requested by `closes_at` and confirmed by `closes_at` plus the same 2-minute
> grace. Anything later is refused, and there is nothing to refund.
> `free_vote_record` takes the round FOR SHARE, so no free vote lands between
> `close_round`'s tally and its status change.

**A resolved round's totals never move.**
> `close_round` snapshots the tally, paid and free (`round_results.free_votes`),
> and `entry_round_totals` serves that snapshot for resolved rounds. Refunds,
> chargebacks and free-vote voids after the fact change the money or the audit
> trail, never a published result or a side award.

**Vote totals reset every round.** One clause:
> Votes carry `round_id`, paid and free alike; the leaderboard filters on it.
> A free vote is spent on the day and counts only in the round it was cast in.

**`votes` is never readable by anon.**
> **`votes` and the free-vote tables are never readable by anon.** They hold
> buyer and voter emails, keyed IP hashes and token hashes. The public
> leaderboard reads the `entry_round_totals` view instead.

**The public sees the pet, never the owner.** Add:
> ...or the voter. Free-vote counts reach the public only as a column of
> `entry_round_totals` (and `contest_stats`). A new column on `contests` is
> public the moment it exists (table-level grant), so nothing private goes
> there.

**Prices live in `vote_packs`.** Add:
> A free vote is exactly one vote. It is not a pack, has no price, and no bonus
> window multiplies it.

**A disqualified pet's buyers are all refunded.** Add:
> Its free votes in unfinished rounds stop counting and go back to their voters
> (status `returned`), who may vote again that day. `disqualify_entry` does
> it in the same transaction. Finished rounds keep their results.

**Personal data is erased a year after the contest.**
> ...entrant names and emails, buyer emails, free voters' emails and their
> normalized keys, device tokens, codes, reminder logs, keyed IP hashes,
> opt-ins.

**Moderation is audited.** Add:
> Free-vote voids, voter blocks and pauses are audited the same way: only
> `void_free_voters` and `set_free_vote_paused`, run as the staff member,
> reason required, logged in `free_vote_staff_log`.

**Every migration grants explicitly.** Add:
> `free_votes` is the one table where even `service_role` gets no write grant:
> 0005's default privileges hand it one, so the migration revokes it.

### New

- **One free vote per verified address per Central calendar day.** A unique
  index on `(voter_id, vote_day)` enforces it, not application code. Addresses
  are compared by `email_key()`.
- **Free votes never touch money.** No money view, payout, refund path or
  Stripe check reads `free_votes`.
- **Emailed links never act on GET.** Mail scanners open links. A link opens a
  page whose button confirms.
- **Free voting is a contest setting fixed when submissions open.**
  `free_vote_enabled` changes only through `create_contest` and
  `update_draft_contest`. Only `set_free_vote_paused` pauses it.
- **Codes and tokens are stored hashed.** Codes are stored keyed by
  `FREE_VOTE_HASH_KEY`, and tokens as SHA-256.

### Unchanged

Advancement in one transaction; round state only through the three functions;
`close_round` by hand; the unlistable bucket; nothing public before
moderation; no HEIC; deleting rejected photos; the shelters' share (free votes
carry no money); photo metadata; the tiebreaks.

`PRODUCT.md` ("Votes are credited only when Stripe confirms the payment") and
`README.md` ("What raises the money", "Format") need matching edits when this
ships.

## 7. Grants and `access_test.sql`

**Grants in the migration**

```sql
alter table free_voters          enable row level security;  -- likewise the other five
create policy free_voters_admin_read on free_voters for select to authenticated using (is_admin());
create policy free_votes_admin_read  on free_votes  for select to authenticated using (is_admin());
create policy free_vote_reminders_admin_read on free_vote_reminders for select to authenticated using (is_admin());
create policy free_vote_staff_log_admin_read on free_vote_staff_log for select to authenticated using (is_admin());
-- free_vote_challenges and free_voter_devices: no policies. Not even admins read codes or tokens.

revoke all on free_voters, free_vote_challenges, free_voter_devices, free_votes,
              free_vote_reminders, free_vote_staff_log from anon, authenticated;
grant select on free_voters, free_votes, free_vote_reminders, free_vote_staff_log to authenticated;

grant select on free_voters, free_voter_devices, free_votes, free_vote_staff_log to service_role;
grant select, insert, update on free_vote_challenges, free_vote_reminders to service_role;
revoke insert, update, delete on free_votes, free_voters, free_voter_devices, free_vote_staff_log
  from service_role;   -- undo 0005's default; the definer functions write these

revoke execute on function email_key(text), free_vote_day(timestamptz), free_vote_record(...),
  free_vote_challenge(...), free_vote_verify(...), free_vote_cast(...), free_vote_preferences(...),
  free_vote_reminder_queue(int), free_vote_unsubscribe(bytea),
  void_free_voters(uuid[], text), set_free_vote_paused(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function free_vote_challenge(...), free_vote_verify(...), free_vote_cast(...),
  free_vote_preferences(...), free_vote_reminder_queue(int), free_vote_unsubscribe(bytea)
  to service_role;
grant execute on function void_free_voters(uuid[], text), set_free_vote_paused(uuid, boolean, text)
  to authenticated;

-- Admin views, security_invoker so RLS on the tables keeps them admin-only.
grant select on free_vote_daily, free_vote_watch to authenticated, service_role;

-- Recreated with new signatures: restate.
grant execute on function erase_personal_data(uuid) to authenticated;
grant execute on function create_contest(...), update_draft_contest(...) to authenticated;
```

`create or replace` keeps the existing grants on `entry_round_totals`,
`close_round`, `disqualify_entry`, `contest_health`, `contest_stats` and
`newsletter_signups`. The migration should restate them anyway, so a reader
of the migration sees the whole surface.

**`access_test.sql` changes**

- **"anon can read exactly..."** stays the same, on purpose. No free-vote
  relation is public.
- **"anon sees the pet on an entry"** stays the same.
- **"signed-in sessions reach only the admin actions"** becomes:
  `close_round, create_contest, delete_draft_contest, disqualify_entry,
  erase_personal_data, is_admin, moderate_entry, open_round, open_submissions,
  round_label, set_free_vote_paused, update_draft_contest, void_free_voters`.
  If an old `create_contest` overload were left behind by mistake, the name
  would appear twice and this test would fail. That is good.
- **"the edge functions reach exactly..."** becomes: `confirm_vote,
  contest_health, create_pending_vote, free_vote_cast, free_vote_challenge,
  free_vote_preferences, free_vote_reminder_queue, free_vote_unsubscribe,
  free_vote_verify, hit_rate_limit, insert_entry, is_admin,
  mark_vote_disputed, notification_queue, record_health,
  record_partial_refund, refund_vote, round_label, vote_quote`.
- **New assertions** (`plan(23)` goes to about `plan(29)`):
  1. No session writes free votes: `authenticated` holds no INSERT, UPDATE or
     DELETE on any free-vote table, and `service_role` holds none on
     `free_votes`.
  2. `contests.free_vote_enabled` and `free_vote_paused_at` are not updatable
     by `authenticated`.
  3. anon selecting from `free_voters` throws `permission denied`.
  4. A signed-in non-admin reads zero rows from `free_voters`, `free_votes`
     and `free_vote_staff_log`.
  5. An admin can read `free_voters` (with a fixture voter).
  6. The column list of `entry_round_totals` is pinned: `round_id, entry_id,
     votes, amount_cents, free_votes`.

---

## 8. Abuse controls

### Verified email, normalized

- **Verification.** No vote without a code, an emailed link, or a device token
  issued after one.
- **`email_key()`.** It folds `Jo.Smith+pets@Gmail.com` and `josmith@gmail.com`
  into one identity. Plus-tags are dropped for every domain, which only ever
  merges addresses that reach the same inbox.
- **Limitation.** Providers with other aliasing schemes are not folded. Private
  catch-all domains cost a determined family little, which is what the domain
  alert below is for.

### Disposable domains

- **The list.** Keep a vendored copy, such as the community-maintained
  disposable-email-domains project on GitHub (check its license), in
  `_shared/disposable_domains.txt`, refreshed before each contest.
- **No live lookups.** Sending readers' addresses to a third-party checking
  service would break the privacy stance.
- **The message.** "Please use a personal email address."
- **The limit.** A list does not catch a fresh private domain.

### Rate limits

All use `hit_rate_limit`. The numbers are starting values to tune in the dry
run. They are not derived from data.

| Limit | Where | Start at | Why |
| --- | --- | --- | --- |
| Code requests per connection | `rateLimit('free-request')` | 20 an hour | Phones on carrier networks share addresses (carrier-grade NAT), so per-IP limits must stay loose |
| Code checks per connection | `rateLimit('free-verify')` | 30 per 10 minutes | Guessing |
| Wrong codes per challenge | `free_vote_verify` | 5, then the challenge is dead | A 6-digit code then has 5 tries in a million |
| Code requests per address | `free_vote_challenge` | 3 per 10 minutes, 8 a day | Stops the site being used to flood someone's inbox |
| New addresses per connection per hour | `free_vote_watch` (by `ip_hash`) | Soft: an alert (`free_vote_shared_connection`) and step-up, never a refusal on its own | One person farming addresses. Carrier NAT puts unrelated phones behind one address, so this is a weak signal. |
| One-tap casts per connection | `rateLimit('free-cast')` | 60 an hour | Scripts holding many device tokens |
| Free votes a pet receives | none (soft) | Alert plus step-up (below) | A hard cap would punish a pet that goes viral |
| Free votes per address | the unique index | 1 a day | The rule itself |

**Fail closed.** `ratelimit.ts` fails open, and skips limiting when there is no
client address, because locking a buyer out loses money. The free-vote buckets
should refuse instead ("Free voting is busy; try again in a few minutes") and
treat a missing address as one shared bucket. A reader asked to retry loses
nothing.

**Step-up.** While a pet is over the spike threshold, one-tap casts for that
pet also need a Turnstile token. Real readers barely notice, and scripts
holding many tokens slow down.

### Bot check: Cloudflare Turnstile

- **Where.** On every code request, and on one-tap casts under step-up. The
  server verifies with Cloudflare's `siteverify` and omits the optional
  `remoteip`, so the reader's IP address is not sent to Cloudflare from the
  server.
- **Cost.** Cloudflare markets Turnstile with a free plan. **Confirm the
  current limits and terms before relying on it (open question).**
- **Privacy.** It runs a Cloudflare script in the reader's browser and sends
  browser signals to Cloudflare. That puts a new third party on reader pages,
  and the privacy section of the rules should name it (Q8).
  Cloudflare publishes privacy terms for Turnstile, and counsel should read
  them.
- **Accessibility and embedding.** It has to pass the axe audit at phone size,
  and it needs testing with VoiceOver and inside the WordPress iframe on an
  iPhone.
- **When Cloudflare is down.** Fail closed for code requests. Paid voting is
  unaffected.
- **Alternatives.** hCaptcha (compare its terms), or no bot check at first:
  email verification plus rate limits plus alerts, with Turnstile ready behind
  its environment variable. The recommendation is Turnstile on, because the
  bigger risk is not fake votes but the site emailing codes to strangers at
  scale, which burns WPR's sending reputation.

### Email deliverability

- **Send from a subdomain** (for example `vote.wausaupilotandreview.com`) with
  its own SPF, DKIM and DMARC. Bounces and complaints from fake or mistyped
  addresses then hurt that subdomain's reputation, not the newsroom's main
  domain.
- **Keep code emails plain:** the code in the subject, no images, no tracking
  pixels, no link shorteners.
- **Wire up Resend's bounce and complaint webhooks**, which do not exist today,
  so they set `free_voters.undeliverable_at`. Without them, every typo keeps
  bouncing all contest long. This needs a small webhook endpoint and one more
  service function (`free_vote_undeliverable`). Neither is counted in
  sections 5.3, 7 or 13, and both could follow in a second release.
- **Check whether reminder volume reaches the major mailbox providers'
  bulk-sender thresholds** (one-click unsubscribe, spam-rate limits). The
  unsubscribe design above assumes it might.

### Alerts through the existing health checks

New rows in `contest_health`. They reach staff through the `health` schedule
and the Health tab with no new plumbing. All are `warn`, because each one is a
judgment call:

| Check | Fires when (thresholds are placeholders) |
| --- | --- |
| `free_vote_spike` | A pet receives more than N free votes in an hour, or free votes make up more than X% of its gains that hour |
| `free_vote_shared_connection` | One `ip_hash` casts for more than N distinct addresses in an hour |
| `free_vote_domain_cluster` | More than N addresses verify in an hour from one domain outside a common-provider list |
| `free_vote_codes_failing` | More than X% of code sends fail in an hour (Resend or DNS trouble) |
| `free_vote_paused` | Voting has been paused for more than an hour, so nobody forgets to resume it |

`record_health` keys incidents by `check_name`, so each check alerts once,
reminds every two hours, and reports when it clears, as the existing checks
do.

### What staff see in the admin desk

A new **Free votes** tab, between Health and Money:

- **Stats:** free votes today and this round, unique voters, new
  verifications, code send failures, reminder opt-ins, and the free share of
  the round's total.
- **Watch list** (`free_vote_watch`): pets by free votes in the last hour with
  their free share, connections casting for many addresses (shown as a short
  hash; raw addresses are never stored), and domain clusters.
- **Voter lookup** by address, admins only: verification time, votes,
  devices.
- **Void and block:** a reason plus a typed confirmation, the same pattern as
  Disqualify. Bulk void from a watch-list row. Only unresolved rounds change,
  and the screen says so: "Finished rounds keep their results."
- **Pause and resume**, with a reason, showing the log.

Other tabs change slightly:

- **Money** adds one line: "Free votes are not sales and are not in these
  figures."
- **Rounds** shows each closed round's free and paid split from
  `round_results`.
- **Setup** gets the flag and the checklist item.
- **Wrap-up and Newsletter** get the copy changes in 5.10 and 5.11.

---

## 9. Rules, site copy, and questions for counsel

### Rules page (`web/src/pages/Rules.jsx`, generated from contest data)

These appear only when `free_vote_enabled` is true.

- **Dek:** "Free to enter. Vote free once a day, or buy vote packs. Vote packs
  are not tax-deductible."
- **5. The deadline:** add the free-vote timing from 5.7.
- **7. Vote packs:** "Votes are cast by buying vote packs" becomes "Votes are
  cast with vote packs or with the free daily vote (section 8)."
- **New 8. Free daily vote:**
  - One free vote per person per day, Central time, verified by email. It
    counts as one vote, in the open round only, and no bonus window
    multiplies it. No purchase is needed.
  - Using several addresses to cast more than one a day breaks the rules, and
    WPR may void those votes.
  - WPR may void free votes it reasonably believes were obtained by fraud
    before results are finalized. Finalized results stand.
  - Reminders are optional. The pause wording waits for counsel (Q3).
- **Bonus windows:** "Free votes are not multiplied."
- **Late payments:** "A free vote attempted after the deadline is not
  recorded."
- **Disqualification:** add the return of free votes from 5.8.
- **Privacy:** add free voters' addresses, keyed connection data used to
  prevent fraud, the bot-check provider, and the reminder emails. All are
  erased 12 months after the contest, like everything else.
- **Eligibility:** voter eligibility, once decided (decision 8, Q6).
- **Renumbering:** inserting section 8 renumbers the later sections, and
  section 12's "(section 10)" reference to Disqualification must follow.

### Site copy

- **Pet page:** the free-vote button, its helper line, and the used-today
  state (section 10).
- **Home page** `PackCard`: "Every vote helps a shelter" becomes "Every vote
  pack helps a shelter."
- **`HowItWorks`, step 2:** add "Everyone also gets one free vote a day."
- **Approval and advancement emails** (`_shared/templates.ts`): "Ask friends
  to cast their free vote for {pet} every day." Owners rallying friends is the
  strongest return-visit driver the contest has. Weigh that against the
  cannibalization risk (decision 13).
- **Newsletter block** (`lib/newsletter.js`): an optional line, "Your free vote
  resets every day."
- **`EMBED.md` snippet:** after forwarding the hash into the iframe, clear it
  from the WordPress page's address bar with one `history.replaceState` line.
  The app cannot do this from inside the iframe, and the free-vote links carry
  single-use tokens in the hash. This needs an edit on the WordPress page.

### Questions for counsel

These are questions only. This doc draws no legal conclusions. The rest of
the doc refers to them as Q1 to Q11.

1. **Classification.** With paid votes deciding the winner, how does
   Wisconsin law classify this promotion: a contest, a lottery, gambling,
   charitable gaming, or none of these? Does it matter that votes, not chance,
   decide? Does it matter that WPR is a nonprofit and that shelters share the
   proceeds?
2. **Does a free path change that,** and if so, on what terms? Must a free
   method be comparable in weight to paid voting for it to matter? Is one free
   vote a day, next to packs of up to 600 votes, enough, not enough, or
   irrelevant?
   - Read with it: Wisconsin's 2015 guidance sheet "Contests, Sweepstakes and
     Sales Promotions" (charitable.wi.gov, Content/PDF/ContestsSweepstakesPromotions 4.15.pdf)
     says that "if a promotion allows participation by means of two different
     methods, one of which constitutes consideration and the other does not, it
     is an illegal lottery," assuming prize and chance are also present, and
     that "the worthiness of the cause ... has no bearing." So in Wisconsin a
     free path may not do what "no purchase necessary" does elsewhere; the
     question may turn on prize (Q5) and chance instead.
   - Also: Valentin v. La Prensa, 103 Misc. 2d 875 (N.Y. Civ. Ct. 1980), held a
     newspaper's baby contest with purchased coupon votes and a cash prize an
     illegal lottery, reasoning that unlimited bought votes made the outcome
     turn on who bought the most, not on the entrants. Another state, and a
     contest with a cash prize, but close to this one in shape.
3. **If the free path matters legally,** may WPR pause it mid-contest for
   abuse? Offer it in some rounds only? Change its terms after submissions
   open?
4. **Disclosures.** Is "No purchase necessary" or similar wording required?
   Where must it appear: the rules, the pet page, checkout? Does the current
   dek, "Voting is by vote pack purchase," need to change regardless?
5. **Prize.** The draft rules name no prize, and the champion email says only
   "An editor will be in touch." Does any recognition count as a prize for
   this analysis: a feature story, a sponsor-donated item, a title? Does the
   answer to Q1 or Q2 depend on it?
6. **Voter eligibility.** Should free voters have a minimum age, and does
   COPPA bear on collecting emails from people under 13? Residency? Staff and
   their families? Can the rules enforce "one person, one free vote a day"
   when people hold several addresses, and how should that be worded?
7. **Email.** Are daily reminders commercial messages under CAN-SPAM, either
   as drafted (no pack pitch) or with one? What must they contain (postal
   address, unsubscribe)? Is an unchecked box at vote time enough consent? Are
   code emails purely transactional?
8. **Privacy.** Do the rules' privacy section and any WPR privacy notice cover
   the new data: voter addresses, keyed IP hashes, device tokens, and signals
   sent to Cloudflare by Turnstile? Is 12 months right for the IP hashes, or
   should they go at contest completion?
9. **Sponsor opt-ins**, as in the Second Street example: are they compatible
   with the rules' promise that addresses are "never published or sold," and
   what would consent have to look like? This proposal leaves them out.
10. **Shelter MOUs and the split.** Does anything in the MOUs or the split
    language assume every vote is a sale? Free votes raise no money.
11. **Voiding.** Is the rules language enough for voiding free votes before
    results are final, and for letting finalized results stand when fraud is
    found later?

---

## 10. The flow on a phone

Most readers arrive on an iPhone from a share link to one pet
(`PRODUCT.md`). The free vote lives on the pet page, inside the first screen,
under the paid action.

```
+-------------------------------------------+
| OPEN ROUND  Closes Thu 8 p.m.     2d 03:12 |
|      1,204  votes this round    #9 of 312  |
| The first pet out needs 37 votes to pass   |
| Biscuit. The top 16 make the bracket...    |
| Includes 212 free votes.                   |   <- optional (decision 4)
+-------------------------------------------+
[            Vote for Biscuit             ]    primary, opens packs (unchanged)
Vote packs from $5, as low as 42¢ a vote...    PriceHint (unchanged)
[       Cast your free daily vote         ]    new, btn-ghost
One free vote per email a day. Resets at midnight Central.
```

The numbers are illustrative. In `Pet.jsx`, `VoteBlock` keeps its primary
button and `PriceHint` and gains the free button below them. `StickyVote`, the
pinned bar on phones, stays paid only: one pinned action. In bracket rounds
the same block appears under `BracketPanel`. During `counting`, `intermission`
or for an eliminated pet, the free button is hidden, just as the paid one is.

**The sheet** is a separate lazy chunk with no Stripe.js. That keeps it light,
and it keeps "free" from appearing as a pack-like choice beside the $5 Starter
in `CheckoutModal`'s radio list, where it would anchor buyers low. The sheet
reuses the `Modal` and the checkout head (photo, round, current votes).

1. **Email step** (first time, or no remembered browser):
   - Email field (`type="email"`, `autocomplete="email"`).
   - Two unchecked boxes: "Remind me each morning to vote (this contest
     only)" and the newsletter line.
   - Turnstile, then **Email me a code**.
   - Small print: "We'll email a 6-digit code. One free vote per address per
     day. Vote packs are how the contest raises money for shelters. Rules."
2. **Code step:**
   - "Enter the code we sent to j•••@gmail.com. It works for 10 minutes."
   - One field with `inputmode="numeric"` and `autocomplete="one-time-code"`,
     then **Cast free vote**.
   - "Didn't get it? Check spam or Promotions, or resend in 30 seconds." and
     "Use a different email."
3. **Done:**
   - "Your free vote is in. Biscuit has 1,205 votes this round. Your next free
     vote unlocks at midnight Central (in 6 hr 12 min)."
   - **Upsell card:** the featured pack ("Fan · 25 votes · $20 · Most
     popular"), the shelter share from the contest row, and **See vote
     packs**, which opens `CheckoutModal` through `useCheckout()` with the
     featured pack preselected, as `defaultPack` already does. During a Double
     Vote window: "Double Votes is on until 9 p.m.: every pack counts twice."
   - `ShareTools`, compact: "Now get Biscuit more votes."
   - If the reader skipped reminders, a one-tap "Remind me tomorrow."
4. **Remembered browser:** "Cast your free vote for Biscuit as
   j•••@gmail.com," then **Cast free vote**, then the done screen. There is
   also "Not you?" to forget the browser. It takes two taps on purpose: one
   tap on the page would invite accidental votes, and the sheet is where the
   upsell lives.
5. **Already used today:** the page button becomes a status line, "Free vote
   used today (for Pepper). Next one at midnight Central," with a countdown.
   The paid button is unchanged.

**The code email:**

> **Subject:** Your free vote code: 482913
>
> Here is your code to cast a free vote for Biscuit in the Open Round of
> Cutest Pet in Marathon County: **482913**. It works for 10 minutes.
>
> Or confirm on this device: [Confirm my free vote]
>
> Didn't ask for this? Ignore it. Nothing happens without the code.
>
> *Wausau Pilot & Review · Rules · You're getting this because this address
> was entered to vote. We won't email again unless you asked for reminders or
> the newsletter.*

The link opens `PUBLIC_URL#/pet/<id>?fv=<token>`. `parseHash` already reads
hash parameters. The page opens the sheet at a **Confirm my free vote** button
and never votes on load. Then it strips the token with `history.replaceState`,
as `usePaymentReturn` does. Fragments are not sent to servers or in
`Referer`, and Plausible's default script records paths, not hashes.

**The reminder email** (opt-in, about 8 a.m. Central, only on days with an open
round and only if the reader hasn't voted):

> **Subject:** Your free vote for Biscuit is ready
>
> Today's free vote in the Elite Eight is waiting. As of 8 a.m., Biscuit
> trails Pepper by 42 votes. Voting closes Thursday at 8 p.m.
>
> [Cast today's free vote]
>
> *Stop these reminders · Wausau Pilot & Review*

**The remembered browser** would be the reader app's first use of browser
storage. The admin client already keeps its session there under
`wpr-pets-admin`. Every read and write is wrapped in try/catch. Safari
partitions storage inside the WordPress iframe and may clear it, so the
WordPress page and the direct share page each need one code. A missing token
simply means the code flow.

---

## 11. Metrics to watch

| Metric | Source | Goal it tests |
| --- | --- | --- |
| Newsletter opt-ins by source (entry, vote pack, free vote) | `newsletter_signups.sources` | 1 |
| New verified voters a day; code request-to-verify rate; median time to verify; send failures | `free_vote_daily` (admin view over challenges and voters) | 1, friction |
| Voters casting on 2+, 3+, 5+ distinct days | `free_votes` grouped by voter | 2 |
| Reminder opt-in rate; reminder-to-vote rate (`via = 'reminder'`); unsubscribes | `free_vote_daily` | 2 |
| Free voters who later bought a pack (matched by `email_key`, after their first free vote) | `free_vote_daily` (admin only, counts not addresses) | 4 |
| Purchases, buyers and gross per round; Starter-pack share | `round_revenue`, `pack_revenue` | 4 (no baseline in year one) |
| Free share of each round's total | `round_results.free_votes / votes` | integrity |
| Decisive free votes: matchups (and the 16th/17th cut line) where the margin was smaller than the winner's free votes | post-close admin report | integrity, optics |
| Voids, blocks, pauses, health alerts | `free_vote_staff_log`, `health_incidents` | abuse |
| Funnel in the browser: sheet opened, code sent, cast, upsell clicked | Plausible `track()` events (`Free Vote Started`, `Free Vote Cast`, `Free Vote Upsell`) | all |

Agree on targets before launch, for example "keep it next year if verified
opt-ins pass N and pack revenue per round meets plan." Without a prior year,
cannibalization is an estimate. The free-voter-to-buyer rate and any shift in
Starter-pack share are the best signals available.

## 12. Rollout

1. **Counsel and decisions first.** Section 9 and section 15. If Q2 or Q3
   comes back badly, stop here.
2. **Build behind the flag**, default off. Ship the migration, the function
   and the UI with the flag off. Nothing is visible, and `free-vote` refuses
   with a reader message.
3. **Ops:**
   - Resend sending subdomain and DNS records.
   - Resend plan sized to the estimate below.
   - Turnstile keys.
   - `FREE_VOTE_HASH_KEY`.
   - Bounce webhook.
   - The `EMBED.md` hash-clearing line on the WordPress page.
   - Preflight checks for all of the above.
   - A new `LAUNCH.md` section.
4. **Dry run** (`LAUNCH.md` section 8), on staff phones and inside the
   WordPress iframe:
   - Request, verify, the link fallback, the remembered browser, the
     reminder, unsubscribe.
   - A late attempt at `closes_at` plus 3 minutes.
   - Disqualify a pet with free votes.
   - Void a voter.
   - Pause and resume.
   - `close_round` and its snapshot.
   - Erase on a test contest.
   - Load-test totals with synthetic free votes.
   - Tune the rate limits and alert thresholds.
5. **Switch on at draft time** in Setup. The rules regenerate, and
   `open_submissions` freezes the flag.
6. **Live.** Check the Free votes tab daily, plus after every close (add it to
   the `CLAUDE.md` runbook next to `late_confirmations`). Use pause only as
   counsel allows.
7. **Afterward.** Review the metrics against the targets, and decide on year
   two.

**Email volume estimate, to size the Resend plan.** `LAUNCH.md` budgets
Resend's $20 plan for the contest month based on approval-day volume. Free
voting adds:

- codes = verified voters × codes per voter (re-verifications on a second
  browser);
- reminders = reminder opt-ins × days with an open round. That is about 15
  days in the standard format: 7 for the Open Round plus 4 bracket rounds of
  2 days.

With made-up inputs, only to show the arithmetic: 2,000 verified voters at 1.3
codes each is 2,600 codes. 800 of them taking reminders over 15 days is 12,000
reminders. That is about 14,600 emails in total. Check the plan's quota
against the newsroom's own estimate.

## 13. Effort

These are rough sizes for one developer who knows the codebase. They exclude
counsel, copy review and waiting on decisions.

| Area | Work | Rough size |
| --- | --- | --- |
| Migration | `0019_free_votes.sql`: six tables, enum, contest columns, RLS and grants, about a dozen functions, two admin views; replace `entry_round_totals`, `close_round`, `disqualify_entry`, `newsletter_signups`, `contest_stats`, `contest_health`; drop and recreate `erase_personal_data`, `create_contest`, `update_draft_contest`. Similar in size to 0012 plus 0017. | 3–4 days |
| Edge functions | `free-vote/index.ts`; `_shared/turnstile.ts`, `_shared/disposable.ts` plus the list; code and reminder templates in `templates.ts`; header support in `email.ts`; reminder sweep in `notify.ts` and `notify/index.ts`; fail-closed and keyed-hash options in `ratelimit.ts`; `config.toml` entry | 3–4 days |
| Front end | Free-vote provider and sheet (lazy, like `Checkout.jsx`); `Pet.jsx` `VoteBlock` and link landing; `lib/api.js` (contest columns with the existing fallback, `free_votes` in totals); device-token helper; copy in `Rules.jsx`, `HowItWorks.jsx`, `Home.jsx`; admin Free votes tab plus Setup, Money, Rounds, Newsletter and Wrap-up edits; `lib/archive.js`; `web/scripts/mock-api.mjs`; axe audit | 4–6 days |
| Tests | New `free_vote_test.sql` (flag and pause; code attempts and expiry; one a day; the Central date across Nov. 1, 2026; deadline and grace; snapshot and voids after resolution; seeding with free votes; disqualify returns; erasure; newsletter view); updates to `access_test`, `bracket_test`, `disqualify_test`, `health_test`, `contest_admin_test`; Deno tests for normalization, the domain list, templates and Turnstile; integration tests in `functions.test.mjs` (seed challenges with a known HMAC from `functions.env`, since local email is off; Cloudflare documents test keys that always pass or fail); a Playwright flow in `web/e2e` | 3–4 days |
| Docs and ops | `CLAUDE.md` invariants and runbook, `README.md`, `PRODUCT.md`, `LAUNCH.md`, `EMBED.md`, preflight checks | 1 day |
| **Total** | | **about 15–20 developer days**, three to four calendar weeks with review |

**Running costs, all unknown until checked:** the Resend plan at the estimated
volume, Turnstile's terms, and Supabase plan quotas for edge function calls
and database load. Card fees are unaffected, since free votes involve no
payments.

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Counsel concludes a free path must be comparable in weight, or may not be paused | Find out before building (Q2, Q3). The design does not try to meet a comparable-weight bar. |
| A family farms addresses on a private domain | Domain and shared-connection alerts, step-up checks, staff voids before results are final, and rules language |
| Codes to fake addresses damage sending reputation | Turnstile, per-address caps, disposable list, a sending subdomain, bounce handling |
| "Free votes decided it" complaints | The free share shown on the pet page; the decisive-free-votes report; the rule that results are final |
| Cannibalization of small packs | One vote, never multiplied, paid stays primary, an upsell on every free vote, the ticker paid only; watch Starter share |
| Staff load during a live contest | Alerts are `warn` with thresholds tuned in the dry run; voids are one action; the pause switch |
| More moving parts in a system that has not run a real contest | The flag stays off unless the dry run passes. `CLAUDE.md` says "Especially year one" about `close_round`, and the same caution applies here. |

## 15. Open decisions for the newsroom

Numbered so the rest of this doc can refer to them.

1. [ ] **Do it this contest, next contest, or not at all,** given thin
       evidence and counsel's answers.
2. [ ] **Which rounds:** all, the Open Round only, or the bracket only.
3. [ ] **The limit:** one free vote per address per day in total
       (recommended), or one per pet per day. Add a per-round cap?
4. [ ] **Show free votes separately** on public pages ("Includes N free
       votes")? Recommended: yes, as a small line under the combined count.
5. [ ] **Remember the browser** (two taps a day) or a code every day?
6. [ ] **Offer daily reminders?** At what hour, Central? Keep sending after the
       reader's pet is out?
7. [ ] **Bot check:** Turnstile (recommended), hCaptcha, or none at first.
8. [ ] **Voter eligibility:** age, residency, staff (with counsel).
9. [ ] **Sending subdomain** name, and the Resend budget for the contest month.
10. [ ] **Pause switch policy,** once counsel answers Q3.
11. [ ] **Sponsor opt-ins:** recommended no for now.
12. [ ] **Email voters when a pet they voted for is disqualified?**
        Recommended: no.
13. [ ] **Promote "free once a day"** in owner emails and share text, or keep
        it on the pet page only?
14. [ ] **No bonus multiplier on free votes:** confirm.
15. [ ] **Success targets** for keeping it next year.
