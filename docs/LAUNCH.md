# Launch checklist

Everything the code cannot do for itself. Work top to bottom; each section
assumes the ones above it are done. Dates are yours to set: the contest runs
about two and a half weeks end to end (CLAUDE.md, "Running a contest").

## Launch preflight

Run it first, to see what is left, and last, on launch morning:

```bash
node scripts/preflight.mjs
```

It checks this list against the real project, the repo, the live sites and
Stripe, one line each: ✔ done, ✖ blocks launch, ! should fix, – not checked
(and what to set so it can be). Every ✖ and ! names the section below that
fixes it. Exit status 1 means something blocks launch; `--strict` counts
warnings too. `--ref` and `--repo` override the linked project and the git
remote; `--json` is for scripts.

It needs the `supabase` and `gh` CLIs, both signed in. Each of these, set in
the shell, unlocks more:

| Set | Adds |
| --- | --- |
| `SUPABASE_DB_PASSWORD` | Migrations applied in production match `supabase/migrations` |
| `SUPABASE_ACCESS_TOKEN` | Auth: email provider on, self-signup off, site URL (the CLI then uses this token instead of its own login) |
| `STRIPE_SECRET_KEY` | Live/test mode matches the publishable key, the webhook endpoint and its events, Apple Pay domains, the statement descriptor. A restricted key with read access is enough |

Read-only: it never writes to the database, changes a setting or deploys. Its
two empty requests to `submit-entry` and `create-checkout` count against your
connection's rate limit like any reader's. It prints names and verdicts, never
a secret.

A free-plan project pauses after a week without traffic, and the preflight
reports it before anything else. Restore it from the project's dashboard page,
wait for it to come up, and run the preflight again: secrets,
functions and contest data cannot be read while it sleeps.

What it cannot see is still yours: Radar rules, receipts, MOUs, the sponsor
deals and the dry run in section 8.

## 1. Stripe (the contest's own account)

- [ ] Create a separate Stripe account for the contest. Not WPR's donation
      account: see README, "Why a separate Stripe account". WPR already uses
      Stripe, so this is a second account under the same login (account
      name, top left → New account), with the same legal entity, EIN and, if
      wanted, bank account. It starts on standard pricing. Then invite the
      developer to it with the Developer role (Settings → Team), so keys and
      the webhook are created by the person who sets them and never travel
      by email. The setup guide written for WPR's business side (Oct. 25,
      2026) walks the same steps in plain words.
- [ ] Statement descriptor: `WPR PET CONTEST` (Settings → Business → Public
      details). Buyers who recognize the charge do not dispute it.
- [ ] Customer emails → enable successful payment receipts. The receipt shows
      "Vote pack: N votes for <pet>", never "donation".
- [ ] Payment methods: cards, Apple Pay, Google Pay, Link. Wallets are most of
      the conversion on phones.
- [ ] Link on under **Wallets** (Settings → Payment methods). Nothing else to
      set: the checkout is a card integration, so Link arrives inside the
      card form as a card payment, and the form is handed the receipt email
      so a buyer with Link pays in one click. Stripe confirms every Link
      payment immediately, whatever funds it (a card or Instant Bank
      Payments), so the deadline rule holds. Do not add `link` to the
      payment method types in `create-checkout`. If the Dashboard offers
      Klarna inside Link, turn that off: votes on installments is not a good
      look for a shelter fundraiser.
- [ ] Payment method domains (Settings → Payment method domains): register
      **both** `rowanflynnpilot.github.io` and `wausaupilotandreview.com`. The
      checkout runs in an iframe, and Stripe requires the top-level domain and
      the iframe's to be registered. It covers Apple Pay, Google Pay and Link
      at once; no association file to host (Stripe does Apple's merchant
      validation).
- [ ] Radar: leave on. Add a rule blocking payments where the CVC check fails.
      Vote and donation pages are a favorite target for card testing: if the
      dashboard shows a burst of small declined payments, turn on
      "Block if :card_count_for_ip_address_hourly: > 3" and tell the developer.
- [ ] Webhook endpoint:
      `https://<project>.supabase.co/functions/v1/stripe-webhook`, events
      `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`,
      `charge.dispute.closed` (a won dispute puts the votes and the shelters'
      share back).
      Copy the signing secret for the next step.

## 2. Supabase secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  ALLOWED_ORIGIN=https://rowanflynnpilot.github.io \
  PUBLIC_URL=https://wausaupilotandreview.com/<contest-page>/ \
  SHARE_BASE_URL=https://rowanflynnpilot.github.io/wpr-pet-contest/
```

- [ ] Recommended: one restricted Stripe key per function (Dashboard →
      Developers → API keys → Create restricted key), so a leaked key can do
      only its function's job. Each falls back to `STRIPE_SECRET_KEY` while
      unset.
      | Secret | Permissions |
      | --- | --- |
      | `STRIPE_KEY_CHECKOUT` | PaymentIntents: write |
      | `STRIPE_KEY_WEBHOOK` | Refunds: write; PaymentIntents: read |
      | `STRIPE_KEY_DISQUALIFY` | Refunds: write; PaymentIntents: write |
      | `STRIPE_KEY_HEALTH` | PaymentIntents: write; Charges: read |
- [ ] Auth → Providers → Email: **enabled**. Auth → "Allow new users to sign
      up": **off**. (Two separate switches; the first must stay on or staff
      cannot log in.)
- [ ] Invite each moderator (Auth → Users → Invite), then add them:
      `insert into admins (user_id) select id from auth.users where email = '...';`
- [ ] Storage image transformations require the Pro plan. Without it, set
      `VITE_IMAGE_TRANSFORMS=false`: cards and lists serve the 800px copy made
      at upload (about 100 KB a photo, so a list of 16 pets is 1.5 MB on a
      phone), the pet page the 2048px original. The Pro plan's resizing makes
      a list avatar a few KB; worth the $25 for the contest month.

## 3. GitHub

- [x] The repo is public (done Oct. 24, 2026: the code is MIT-licensed and
      holds no secrets; the history was scanned). GitHub Pages is on, source
      GitHub Actions, `PAGES_ENABLED=true`. Until the variables below are set,
      the site's root forwards to the demo at `/demo/` (placeholder pets, the
      backend inside the browser), which is what the newsroom reviews.
- [ ] Actions variables: `VITE_SUPABASE_URL`,
      `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`,
      `VITE_PUBLIC_URL`, `VITE_IMAGE_TRANSFORMS`. Setting `VITE_SUPABASE_URL`
      is what puts the real site at the root; the demo stays at `/demo/`.
- [ ] CI secrets already exist for the database deploy
      (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`).

## 4. WordPress

- [ ] Create the contest page and paste the snippet from `web/EMBED.md`. The
      iframe needs `allow="payment"` or Apple Pay and Google Pay do not appear.
- [ ] Rules page: generated in the app at `#/rules`. Have it reviewed, then set
      `rulesApproved: true` in `web/src/config.js` to drop the draft ribbon.

## 5. Email (optional, recommended)

The approval email carries each owner's share link. Owners sharing their own
pet is what sells votes, so this is worth the setup.

- [ ] Resend account; verify `wausaupilotandreview.com` (DNS records: SPF and
      DKIM, plus DMARC if the domain lacks one). The free tier is 100 emails a
      day. A 300-entry contest sends more than that on approval day and again
      after round 1, so budget for the $20 plan for the contest month.
- [ ] `supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="Wausau Pilot & Review <pets@wausaupilotandreview.com>" CRON_SECRET=<random>`
- [ ] Another newsroom also sets `NEWSROOM_NAME`, `NEWSROOM_PHONE`,
      `NEWSROOM_BRAND_COLOR` (the site's `--brand-ink`) and `NEWSROOM_PAPER_COLOR`
      (`--cream`): the emails' kicker, footer, button and paper, and the staff
      refusal. Unset, they are WPR's.
- [ ] GitHub: variable `EMAIL_SWEEP=true`, secrets `NOTIFY_URL` and
      `CRON_SECRET` (same value). The sweep then runs every 15 minutes.
- [ ] Volume. The sweep also sends each owner six tips over the contest
      (approval, voting open, halfway, last day, matchup day, thanks), one
      "plays again" note per bracket round to each buyer who ticked the box
      at checkout, and the free-vote reminders if that is on. Budget roughly
      entries × 8 plus opted-in buyers × 4 for the contest; the $20 Resend
      plan covers a 300-entry contest with room. Every one of these carries
      its own stop link (the `links` function; nothing to configure).
- [ ] Checkout reminders: at most one per address per round, only to a
      buyer who ticked "if this checkout doesn't finish, email me once", an
      hour after it stalls. It needs the 15-minute sweep above; without it
      the reminder goes whenever staff press Send in the Email tab, which may
      be too late to help. Counsel: confirm the box's wording and that a
      single reminder the buyer asked for needs no unsubscribe link (it says
      it is the only one).

### Free daily vote (only if the contest turns it on)

Off unless Setup turns it on while the contest is a draft. Before that, get
counsel's answers to the questions in `docs/FREE-DAILY-VOTE.md`, section 9;
two of them (does a free path have to weigh as much as paid voting, and may
it be paused) could stop it. With it on, the preflight fails until all of
this is done.

- [ ] Email (above) working. Better: send from a subdomain such as
      `vote.wausaupilotandreview.com` with its own SPF, DKIM and DMARC, so
      bounces from mistyped addresses never touch the newsroom's main domain.
      Size the Resend plan for codes plus reminders (the doc has the
      arithmetic).
- [ ] Cloudflare Turnstile widget for the GitHub Pages host. GitHub variable
      `VITE_TURNSTILE_SITE_KEY`; `supabase secrets set TURNSTILE_SECRET_KEY=...`
- [ ] `supabase secrets set FREE_VOTE_HASH_KEY=<random, 32+ characters>`. It
      keys the stored codes and connection hashes; never change it mid-contest.
- [ ] The WordPress snippet from `web/EMBED.md`, including its line that
      clears `fv=` tokens from the address bar.
- [ ] Refresh `supabase/functions/_shared/disposable.ts` from the
      disposable-email-domains list.

## 6. Live-contest alerts (do this before voting opens)

If the Stripe webhook breaks at 9pm, buyers are charged and get no votes, and
the first anyone hears of it is a Facebook post. The `health` function checks
every ten minutes, including asking Stripe directly whether every successful
payment was credited, and tells staff when a problem starts, every two hours
while it lasts, and when it clears.

- [ ] Choose where alerts go (either or both), as edge function secrets:
      `STAFF_ALERT_EMAILS=a@wausaupilotandreview.com,b@...` (needs email, section 5)
      and/or `ALERT_WEBHOOK_URL=<Slack, Discord or Teams incoming webhook>`.
- [ ] `CRON_SECRET` set on the edge functions (shared with the email sweep).
- [ ] GitHub: variable `HEALTH_CHECKS=true`; secrets `HEALTH_URL`
      (`https://<project>.supabase.co/functions/v1/health`) and `CRON_SECRET`.
      With no alert channel set, the workflow fails instead and GitHub emails
      the repository owner.
- [ ] Open the admin desk's Health tab: "Live checks" should read "All clear"
      and name where problems are sent.
- [ ] Turn `HEALTH_CHECKS` off between contests. On a private repository the
      schedule costs about 4,300 Actions minutes a month.

## 7. Partners and sponsors

- [ ] One-page MOU per shelter: promotion, split, logo use, term.
- [ ] Contest created in the admin desk (Setup tab): dates, the shelter share
      agreed in the MOUs, bracket size. Shelters added there too, each with a
      logo link and its payout weight (equal weights split evenly). The Setup
      checklist lists anything still missing before submissions open.
- [ ] Sponsor slots sold (`web/src/config.js`, `SPONSORS`): presenting, gallery
      and bracket. The buyer's thank-you screen is never sold. Unsold slots
      show an upsell card to weber.chris@wausaupilotandreview.com. Send
      prospects `?demo`, and the kit in `docs/sponsor-kit/`.
- [ ] Double Vote windows sold as their own product: one sponsor per window,
      an hour or an evening, named in the banner. Insert them as
      `bonus_windows`; overlapping windows are refused.

## 8. Dry run (do not skip in year one)

Run a whole contest in Stripe test mode, on the real deploy, with staff as
entrants. Test cards: `4242 4242 4242 4242` succeeds; `4000 0000 0000 0259`
succeeds then disputes.

- [ ] Open submissions with the opening time a few hours ahead, as on
      announcement day. Home counts down, the Enter page lists what to have
      ready, "Add to my calendar" opens the phone's add-event sheet, the story
      widget says when entries open (no Enter button), and a submission before
      the opening is refused. Then let the opening pass: the form opens by
      itself.
- [ ] Submit from an iPhone (photo library) and an Android phone. Both appear
      right way up in the moderation queue.
- [ ] Approve, reject (photo URL stops loading), and check approval emails.
- [ ] Buy each pack; buy inside a bonus window (votes doubled).
- [ ] Start a checkout, let the round's deadline pass, then pay: the payment
      is refunded automatically and `late_confirmations` empties itself.
- [ ] Disable the webhook endpoint in Stripe, buy a pack, and confirm the
      "payments not credited" alert arrives within twenty minutes. Re-enable
      it: Stripe redelivers, the votes appear, and a "resolved" alert follows.
- [ ] Dispute a test payment: the votes leave the leaderboard.
- [ ] Share a pet to Facebook: the preview shows that pet's photo. During
      the bracket, a matchup link shows both pets and the deadline.
      (developers.facebook.com/tools/debug to re-scrape.)
- [ ] On an iPhone, in Safari, heart two pets inside the WordPress page, leave,
      and come back through the same story: the favorites are still there.
- [ ] Optional, for numbers on the hosted hardware: the live tally load test
      against a throwaway copy of the staging database
      (`supabase/loadtest/README.md`). CI already runs it on every migration
      change.
- [ ] If the free daily vote is on: vote with a code on a phone inside the
      WordPress page; vote again the same day (refused); open the emailed
      link on another device; come back the next day (two taps); take a
      morning reminder and unsubscribe from it; try a code at the deadline
      plus three minutes (refused); disqualify a pet with free votes (they
      come back); void a voter and pause and resume from the Free votes tab.
- [ ] Play every round through to a champion.
- [ ] Switch to live keys; delete the dry-run contest's rows.

## 9. Promotion calendar

The contest earns what it is promoted to earn. The app is built to turn every
share into votes; the newsroom's job is to create the shares.

The graphics are generated, not designed by hand. Admin desk → **Social** makes
the leaderboard and "on the bubble" cards, one card per matchup, round results,
the champion and the raised-for-shelters milestone, in feed (1080×1080) and
portrait (1080×1350) sizes, from live numbers. Its "sample numbers" preview is
stamped DO NOT POST. Every pet page has **Make a share image** for owners:
an Instagram story, a square post, and a printable flyer with a QR code for
shelter counters and shop windows. Tell entrants about it in the approval email
and every post.

Two standing placements carry the contest every day without anyone writing a
post: the **article widget** (`web/EMBED.md`, Article widget) at the foot of
every WPR story, and the **newsletter block** (admin Newsletter tab) in each
morning and afternoon edition. Both follow the contest on their own: entries,
the live top five, the closest matchup, the champion. Build the newsletter
block when the edition is built; it says what time its numbers are from.

| When | What |
| --- | --- |
| 2 weeks before | Announce: story, newsletter, social. Rules and split published. Sponsors signed. Widget added to the story template. |
| Submissions week | Daily "new entries" social posts from the gallery. Shelters post their wildcards. Remind entrants to share once approved. |
| Round 1 week | Daily leaderboard post ("the bubble": seeds 14 to 20). First Double Vote window midweek. |
| Each bracket round | Matchup graphics per game. A Double Vote window each round, final evening. "X votes behind" is the most shareable fact in the contest. |
| Finale | Live results post. Champion story with photos. Side awards. Total raised, and a check-presentation photo with the shelters. |
| After | Thank-you email (newsletter opt-ins), wrap-up story, sponsor report from `round_revenue` and the sponsor-click analytics. |

## 10. After the contest

All in the admin desk's Wrap-up tab.

- [ ] Print the shelter payout statement once the contest is complete (it is
      marked PRELIMINARY until then): sales, refunds, chargebacks, net, the
      shelter share, and each shelter's amount by its payout weight. Card fees
      are WPR's and are not deducted. Bring it to the check presentation; file a
      signed copy with each MOU.
- [ ] Download the archive (Open Round standings, every matchup, champion and
      side awards, the money). It holds no owner or buyer details, so it can be
      kept indefinitely.
- [ ] Export the newsletter list (Newsletter tab) into WPR's newsletter.
- [ ] Twelve months on (the health checks remind staff), Erase personal data.
      The rules promise it, and it cannot run inside the 120-day chargeback
      window.
- [ ] Next year: Setup → Start next year's contest copies the packs and
      shelters forward.
