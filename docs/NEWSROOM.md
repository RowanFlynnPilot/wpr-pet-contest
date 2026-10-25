# Running it in another town

The engine is one codebase; the newsroom is a setting. Everything a reader
could tell apart from another town's edition comes from three places.

## 1. The newsroom entry (`web/src/newsrooms.js`)

Add an object under your key: name, shortName, url, tagline, phone, city,
state, region (the place the contest covers, as it reads after "Cutest Pet
in"), timeZone, legalEntity, nonprofit (true or false: it changes the giving
copy and nothing else), badge and wordmark (paths under `web/public/`, or
null for a text wordmark in the display face), supportUrl, newsletterUrl,
contact, sponsorInquiry, utmSource, towns, and `theme` (the key of your
theme block, or null for the default) plus `fonts` (a Google Fonts
stylesheet URL, or null).

Set `VITE_NEWSROOM=<key>` where the site is built (the Pages workflow's
variables). The sales demo switches newsrooms at runtime from the bar at the
bottom; a real build is one newsroom.

## 2. The theme (`web/src/styles/tokens.css`)

A block on `:root[data-theme='<key>']` that sets the role tokens: `--brand`
(with `-ink`, `-deep`, `-tint`, `-wash`), `--accent` (with `-ink`, `-tint`),
`--danger` if the default red collides with your brand, the paper family
(`--cream`, `--cream-deep`, `--rule`, `--rule-strong`, `--slate`), and the
faces (`--display`, `--display-xl`, `--sans`). Everything else, the arena's
board shades included, derives from those with `color-mix()`. Each face has
a `size-adjust`ed local fallback in `tokens.css` so the page holds still
while the web font arrives; give yours the same (measure the width ratio in
a browser canvas) or the layout shifts on a slow connection.

Two rules worth keeping: brand and accent are fills, and text in either
family uses the `-ink` partner (check 4.5:1 on your paper); danger stays its
own hue so a red brand never reads as an error.

## 3. What is yours to supply

- A badge and a wordmark in `web/public/` (or none), and `og-card.png`
  (regenerate with `web/scripts/og-card.py` after changing the faces).
- Your own Supabase project, Stripe account and Resend account, set up per
  `docs/LAUNCH.md`. Each newsroom runs its own copy; nothing is shared.
- The functions' `NEWSROOM_NAME`, `NEWSROOM_PHONE`, `NEWSROOM_BRAND_COLOR` and
  `NEWSROOM_PAPER_COLOR` secrets, so the emails and the staff refusal carry
  your name (defaults are WPR's), and `STAFF_EMAIL_DOMAINS` for your staff.
- `VITE_NEWSROOM=<key> npm run og-card` redraws the default share card in your
  name, region and colors (it reads `newsrooms.js` and `tokens.css`).
- The contest itself (name, dates, split, packs, shelters) in the admin desk.
- Email copy is already neutral; the sender address and the newsroom's
  name in the templates come from the function secrets (see LAUNCH.md).

## What stays the same

The format, the rules' structure, the money invariants in `CLAUDE.md`, the
accessibility audit and the tests. Run them before launch, in your name.
