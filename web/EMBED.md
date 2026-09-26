# Embedding the pet contest in WordPress

Standard WPR iframe pattern: the app posts its height to the parent page so the
iframe never shows an inner scrollbar, and a small script on the WordPress side
resizes it, forwards deep links, and scrolls the app back into view when a
reader navigates.

## Snippet

Create a full-width page (no sidebar) on wausaupilotandreview.com, add a
**Custom HTML** block, and paste:

```html
<iframe
  id="wpr-pets"
  src="https://rowanflynnpilot.github.io/wpr-pet-contest/"
  title="Cutest Pet in Marathon County — Wausau Pilot &amp; Review"
  style="width: 100%; border: 0; display: block;"
  height="1400"
  allow="payment; web-share; clipboard-write"
></iframe>
<script>
  (function () {
    var ORIGIN = 'https://rowanflynnpilot.github.io';
    var frame = document.getElementById('wpr-pets');

    // Share links are this page plus the app's route, e.g.
    // .../pet-contest/#/pet/<id>. Pass the route into the iframe.
    if (location.hash.indexOf('#/') === 0) {
      frame.src = frame.src.split('#')[0] + location.hash;
    }

    window.addEventListener('message', function (event) {
      if (event.origin !== ORIGIN || !event.data) return;
      if (event.data.type === 'wpr-pets-height' && event.data.height > 0) {
        frame.style.height = event.data.height + 'px';
      }
      if (event.data.type === 'wpr-pets-nav') {
        // The reader moved to another view (or opened checkout). If they
        // were scrolled deep into the old one, bring the app's top back.
        if (frame.getBoundingClientRect().top < 0) {
          frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  })();
</script>
```

Accepts only messages from the GitHub Pages origin, and only ever sets a height
or scrolls. Nothing from the iframe is executed.

## Before launch

1. **Set `VITE_PUBLIC_URL`** (repo Actions variable) to this page's permalink,
   e.g. `https://wausaupilotandreview.com/pet-contest/`, and redeploy. Every
   share link, share page redirect and email link then lands readers here
   instead of on the bare GitHub Pages URL.
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
- **Checkout takes over the iframe.** The iframe is as tall as the whole page,
  so a normal fixed overlay would open centered in a 5,000px frame, far from
  where the reader is looking, and Stripe's 3-D Secure challenge would do the
  same. While checkout is open the app hides the page behind it, the frame
  shrinks to the checkout panel, and a `wpr-pets-nav` message scrolls it into
  view. Closing checkout restores the page and scrolls back to the pet.
- The `height="1400"` attribute is only the size before JavaScript runs.

## Deep links

- `…/pet-contest/#/pet/<id>`: a pet's page (what Share buttons produce)
- `#/gallery`, `#/bracket`, `#/enter`, `#/rules`, `#/shelters`, `#/results`
- `#/sponsors`: the media kit. Send prospects here.
- Append `?demo` to the iframe `src` (or open
  `https://rowanflynnpilot.github.io/wpr-pet-contest/?demo`) to preview every
  open sponsor slot as "Your Brand Here".
- `#/admin` is the staff desk on the same deployment. Never link it from the
  site; it is a bookmark.

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
