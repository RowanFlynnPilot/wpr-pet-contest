# Embedding the pet contest in WordPress

The contest lives on one WordPress page, in a single iframe. The page holds
**only the iframe, no script**: WPR's server firewall refuses to save a page
with a script in it, and it does so quietly. The editor's Preview shows the
unsaved draft, so the embed looks live there while the published page never
received it. That is what happened to the Hunting Brag Board's first snippet
on Oct. 31, 2026. WPR's other tools on the site are iframe-only for the same
reason.

## Setting up the page

1. **Pages > Add New.** Title: Cutest Pet in Marathon County. Address (slug):
   `pet-contest`. Template: full width, no sidebar.
2. **Add a Custom HTML block**, not a Paragraph or Code block, and paste the
   line below and nothing else. Copy it from this file or another plain-text
   source, never from Word or a formatted email: "smart" curly quotes break
   it.

   ```html
   <iframe src="https://rowanflynnpilot.github.io/wpr-pet-contest/" title="Cutest Pet in Marathon County, Wausau Pilot &amp; Review" style="width:100%;height:88vh;min-height:640px;border:0;display:block" allow="payment; web-share; clipboard-write" data-no-lazy="1"></iframe>
   ```

3. **Featured image:** `web/public/og-card.png` (1200 x 630). Facebook and X
   show it when someone shares the page.
4. **Publish.** Then purge the page from LiteSpeed's cache: admin bar >
   LiteSpeed Cache > **Purge this page**.
5. **Check the published page, not the Preview:** open its address in a
   private window, or on a phone where you are not signed in to WordPress,
   and once inside the Facebook app. The contest should fill most of the
   screen and scroll inside its frame. Until the contest is switched on it
   shows the demo with sample pets; that is expected.
6. Send Rowan the address. Rowan points the contest's links and emails at it
   and runs the launch check, which reads the published page and confirms
   the iframe is there with `allow="payment"`.

What the line carries:

- `allow="payment"`: Apple Pay and Google Pay. Without it the wallet buttons
  silently never appear.
- `allow="web-share; clipboard-write"`: a pet's Share button opens the
  phone's own share sheet, and Copy link works.
- `data-no-lazy="1"`: LiteSpeed otherwise swaps every iframe's address for
  `about:blank` until the reader scrolls, and the contest is the page's main
  content.
- `height:88vh; min-height:640px`: most of a screen. The contest scrolls
  inside the frame and lays itself out for that (its checkout, toasts and
  pinned Vote bar stay in view).

**If the page shows the contest in Preview but not when published:**

- Purge the page in LiteSpeed (step 4) and reload the private window.
- Open the page in the editor and switch to the Code editor (the three-dot
  menu > Code editor). If the `<iframe ...>` line is missing or cut short,
  the save stripped it: paste it again into a Custom HTML block, from plain
  text.
- Make sure nothing else is in that block, above all no `<script>`. One
  script in the block and the firewall refuses the whole save.

## The rules page

A second page, so the rules have their own address on wausaupilotandreview.com
whether or not the site-wide script below is in. Same steps as the contest
page: **Pages > Add New**, title "Cutest Pet contest rules", slug
`pet-contest-rules`, full width, one Custom HTML block with only this line,
publish, purge in LiteSpeed, check the published page:

```html
<iframe src="https://rowanflynnpilot.github.io/wpr-pet-contest/#/rules" title="Cutest Pet in Marathon County: official rules" style="width:100%;height:88vh;min-height:640px;border:0;display:block" allow="payment; web-share; clipboard-write" data-no-lazy="1"></iframe>
```

The route is in the iframe's own address, so it needs no script. Links in
stories, posts and emails can then say
`wausaupilotandreview.com/pet-contest-rules/`.

## The site-wide script (needed for links to land on WPR's site)

With the iframe alone, the contest works, but every link the contest sends
out (a pet's share link, the emails, the share pages) has to open the contest
at its GitHub address, because a link to `…/pet-contest/#/pet/<id>` can't reach
the right screen inside the page. One line of site-wide code, added once by a
WordPress administrator, fixes that, so every link lands on
wausaupilotandreview.com:

- **Share links open the pet.** A link to `…/pet-contest/#/pet/<id>` opens
  that pet's page. Without it, such a link opens the contest's home.
- **No inner scrollbar.** The frame grows to the contest, so the page scrolls
  as one.

It goes in the site's header or footer code (a header and footer code plugin
such as WPCode, or wherever the site keeps other third-party scripts), never
in a page:

```html
<script src="https://rowanflynnpilot.github.io/wpr-pet-contest/embed.js" defer data-no-optimize="1"></script>
```

`data-no-optimize="1"` keeps LiteSpeed from bundling it with the site's own
scripts. If the firewall refuses that save too, ask the host to check its
ModSecurity log for the save and allow the rule.

The script finds the contest's frames by their address, so the page keeps
its plain iframe. It accepts messages only from the contest's own origin and
only ever sets a height or scrolls; nothing from the frame is executed.

**Until it is in, share links point at the contest itself.** Leave the
`VITE_PUBLIC_URL` variable unset and set the `PUBLIC_URL` function secret to
`https://rowanflynnpilot.github.io/wpr-pet-contest/` (unset, emails would
link to WPR's home page): every share link, share page and email then opens
the contest at its own address, which carries WPR's flag and opens the right
pet. Once the script is on the site (the launch check says "forwards deep
links"), set both to the WordPress page.

## Article widget

A compact card for any WPR story or sidebar, so every pageview is a way into
the contest. It changes with the contest:

| When | It shows | Button |
| --- | --- | --- |
| Entries open | "Is your pet the cutest in Marathon County?", entries so far, a strip of recent pets | Enter your pet |
| Open Round | The live top five, with time left | See every pet and vote |
| Bracket rounds | The closest matchup of the round | See the bracket |
| Between rounds | "The Sweet 16 starts soon" | See the bracket |
| After the final | The champion | See the results |

It also shows the Double Vote banner while one is on (with its sponsor), the
running "raised for local shelters" total, and the presenting sponsor's credit,
so every article embed is a sponsor impression. It refreshes once a minute and
loads about 84 kB, most of it React.

```html
<iframe src="https://rowanflynnpilot.github.io/wpr-pet-contest/widget.html?to=https://wausaupilotandreview.com/pet-contest/"
  style="width:100%;max-width:640px;border:0;display:block;height:510px"
  loading="lazy" title="Cutest Pet in Marathon County, live"></iframe>
```

- **`to`** is the contest page taps land on. Only wausaupilotandreview.com
  addresses are accepted; anything else falls back to the configured page, so
  the widget can never be turned into a WPR-branded link elsewhere.
- **`pet=<id>`** makes it one pet's card: its photo and votes, or its matchup
  during the bracket, with "Vote for (name)". Use it in a story about that pet.
  The id is the end of the pet's page address (`#/pet/<id>`).
- **`view=leaderboard`**, **`view=matchup`** or **`view=enter`** pins a card,
  when the phase has something to put in it. Leave it off and the phase decides.

Measured at 400px wide: 505px for the leaderboard with a Double Vote banner
(about 460px without), 371px for a matchup, 340px for one pet, 314px for
entries, 279px for the champion. The background is transparent, so a fixed
510px leaves only empty space in the shorter phases. With the site-wide
script (above) on the site, each widget frame is sized to its card; no id or
page script is needed, and none may go in a post, for the same firewall
reason.

Clicks are tracked as `Widget Click` events, tagged with the card shown, and
sponsor taps as `Sponsor Click` with slot `widget`, once analytics is on.

## Before launch

1. **`VITE_PUBLIC_URL`** (repo Actions variable) and the `PUBLIC_URL`
   function secret: this page's address, e.g.
   `https://wausaupilotandreview.com/pet-contest/`, **once the site-wide
   script is on the site**, then redeploy. Every share link, share page
   redirect and email link then lands readers here. Without the script a pet
   link would open the contest's home, so until then leave `VITE_PUBLIC_URL`
   unset and set `PUBLIC_URL` to
   `https://rowanflynnpilot.github.io/wpr-pet-contest/`: links open the
   contest at its own address.
2. **`allow="payment"` is required** for Apple Pay and Google Pay inside an
   iframe. Without it the wallet buttons silently never appear.
3. **Register both domains for Apple Pay** in the contest's Stripe account
   (Settings → Payment method domains): `rowanflynnpilot.github.io` (the
   iframe's own origin, where the Payment Element runs) **and**
   `wausaupilotandreview.com` (the top-level page Apple checks). Missing either
   one hides Apple Pay on iPhones, which is most of the traffic.
4. **Payment methods are cards only**, which includes Apple Pay and Google Pay
   (the Payment Element shows them as wallet buttons). Nothing redirects to a
   bank, so checkout never navigates the iframe away. The app still handles a
   redirect return (`?paid=1`) in case that ever changes.
5. **`ALLOWED_ORIGIN`** on the edge functions must include
   `https://rowanflynnpilot.github.io`. The browser calls Supabase from the
   iframe's origin, not from wausaupilotandreview.com.

## How it works

- `src/lib/embed.js` watches the document with a ResizeObserver and a
  MutationObserver and posts `{ type: 'wpr-pets-height', height }` whenever the
  height changes. It measures `<body>`, not `<html>`: the root element never
  reports less than the iframe's current height, so a frame sized that way could
  grow but never shrink.
- On every route change it posts `{ type: 'wpr-pets-nav' }`.
- **Two frame shapes.** The pasted frame is a fixed window most of a screen
  tall, and the app lays itself out as it does on its own: checkout floats
  over the page, toasts and the pinned Vote bar sit at the bottom of the
  frame. The site-wide script (`public/embed.js`) grows the frame to the app
  and answers each height with `{ type: 'wpr-pets-host' }`; only then does
  the app add `html.is-embedded`, the styles for a page-tall frame.
- **In a page-tall frame, checkout takes over the iframe.** A normal fixed
  overlay would open centered in a 5,000px frame, far from where the reader
  is looking, and Stripe's 3-D Secure challenge would do the same. While
  checkout is open the app hides the page behind it, the frame shrinks to the
  checkout panel, and a `wpr-pets-nav` message scrolls it into view. Closing
  checkout restores the page and scrolls back to the pet.

## Deep links

- `…/pet-contest/#/pet/<id>`: a pet's page (what Share buttons produce). On
  the WordPress page these need the site-wide script; at the contest's own
  address they always work.
- `#/gallery`, `#/bracket`, `#/enter`, `#/rules`, `#/shelters`, `#/results`
- `#/sponsors`: the media kit. Send prospects here.
- Append `?demo` to the iframe `src` (or open
  `https://rowanflynnpilot.github.io/wpr-pet-contest/?demo`) to preview every
  open sponsor slot as "Your Brand Here".
- `#/admin` is the staff desk, at
  `https://rowanflynnpilot.github.io/wpr-pet-contest/#/admin`. It opens only in
  its own tab, never inside the WordPress page (a framed desk could be
  clickjacked). Never link it from the site; it is a bookmark.

## Facebook and X previews

Crawlers do not run JavaScript, and a `#/pet/<id>` route is invisible to them.
The build writes a small static page per approved pet at
`https://rowanflynnpilot.github.io/wpr-pet-contest/p/<id>/` with that pet's
photo and name in its Open Graph tags; it redirects people to this WordPress
page. The Facebook and X share buttons use it automatically when it exists.

Share pages exist only for pets approved before the last deploy, so during the
contest the site should rebuild on a schedule (hourly is plenty). A pet without
a page yet falls back to the plain link, and `404.html` redirects any stale
`/p/<id>/` link to the right pet.

Use Facebook's Sharing Debugger to refresh a preview after a photo changes.
