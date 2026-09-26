# Launch checklist

Everything the code cannot do for itself. Work top to bottom; each section
assumes the ones above it are done. Dates are yours to set: the contest runs
about two and a half weeks end to end (CLAUDE.md, "Running a contest").

## 1. Stripe (the contest's own account)

- [ ] Create a separate Stripe account for the contest. Not WPR's donation
      account: see README, "Why a separate Stripe account".
- [ ] Statement descriptor: `WPR PET CONTEST` (Settings → Business → Public
      details). Buyers who recognize the charge do not dispute it.
- [ ] Customer emails → enable successful payment receipts. The receipt shows
      "Vote pack: N votes for <pet>", never "donation".
- [ ] Payment methods: cards, Apple Pay, Google Pay, Link. Wallets are most of
      the conversion on phones.
- [ ] Apple Pay domains (Settings → Payment methods → Apple Pay): register
      **both** `rowanflynnpilot.github.io` and `wausaupilotandreview.com`. The
      checkout runs in an iframe; Apple checks the top-level page too.
- [ ] Radar: leave on. Add a rule blocking payments where the CVC check fails.
      Vote and donation pages are a favorite target for card testing: if the
      dashboard shows a burst of small declined payments, turn on
      "Block if :card_count_for_ip_address_hourly: > 3" and tell the developer.
- [ ] Webhook endpoint:
      `https://<project>.supabase.co/functions/v1/stripe-webhook`, events
      `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`.
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

- [ ] Auth → Providers → Email: **enabled**. Auth → "Allow new users to sign
      up": **off**. (Two separate switches; the first must stay on or staff
      cannot log in.)
- [ ] Invite each moderator (Auth → Users → Invite), then add them:
      `insert into admins (user_id) select id from auth.users where email = '...';`
- [ ] Storage image transformations require the Pro plan. Without it, set
      `VITE_IMAGE_TRANSFORMS=false` and the gallery serves originals (slower on
      phones; the front end resizes before upload, so originals are ~2048px).

## 3. GitHub

- [ ] The repo is private. GitHub Pages on the free plan needs it public (the
      code is MIT-licensed and holds no secrets), or a paid plan.
- [ ] Settings → Pages → Source: GitHub Actions.
- [ ] Actions variables: `PAGES_ENABLED=true`, `VITE_SUPABASE_URL`,
      `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`,
      `VITE_PUBLIC_URL`, `VITE_IMAGE_TRANSFORMS`.
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
- [ ] GitHub: variable `EMAIL_SWEEP=true`, secrets `NOTIFY_URL` and
      `CRON_SECRET` (same value). The sweep then runs every 15 minutes.

## 6. Partners and sponsors

- [ ] One-page MOU per shelter: promotion, split, logo use, term.
- [ ] Shelter rows inserted with logos.
- [ ] Sponsor slots sold (`web/src/config.js`, `SPONSORS`): presenting, gallery,
      bracket, and the post-purchase thank-you screen, which is the most
      attentive moment in the whole flow. Unsold slots show an upsell card to
      weber.chris@wausaupilotandreview.com. Send prospects `?demo`.
- [ ] Double Vote windows sold as their own product: one sponsor per window,
      an hour or an evening, named in the banner. Insert them as
      `bonus_windows`; overlapping windows are refused.

## 7. Dry run (do not skip in year one)

Run a whole contest in Stripe test mode, on the real deploy, with staff as
entrants. Test cards: `4242 4242 4242 4242` succeeds; `4000 0000 0000 0259`
succeeds then disputes.

- [ ] Submit from an iPhone (photo library) and an Android phone. Both appear
      right way up in the moderation queue.
- [ ] Approve, reject (photo URL stops loading), and check approval emails.
- [ ] Buy each pack; buy inside a bonus window (votes doubled).
- [ ] Start a checkout, close the round, then pay: the payment is refunded
      automatically and `late_confirmations` empties itself.
- [ ] Dispute a test payment: the votes leave the leaderboard.
- [ ] Share a pet to Facebook: the preview shows that pet's photo.
      (developers.facebook.com/tools/debug to re-scrape.)
- [ ] Play every round through to a champion.
- [ ] Switch to live keys; delete the dry-run contest's rows.

## 8. Promotion calendar

The contest earns what it is promoted to earn. The app is built to turn every
share into votes; the newsroom's job is to create the shares.

| When | What |
| --- | --- |
| 2 weeks before | Announce: story, newsletter, social. Rules and split published. Sponsors signed. |
| Submissions week | Daily "new entries" social posts from the gallery. Shelters post their wildcards. Remind entrants to share once approved. |
| Round 1 week | Daily leaderboard post ("the bubble": seeds 14 to 20). First Double Vote window midweek. |
| Each bracket round | Matchup graphics per game. A Double Vote window each round, final evening. "X votes behind" is the most shareable fact in the contest. |
| Finale | Live results post. Champion story with photos. Side awards. Total raised, and a check-presentation photo with the shelters. |
| After | Thank-you email (newsletter opt-ins), wrap-up story, sponsor report from `round_revenue` and the sponsor-click analytics. |
