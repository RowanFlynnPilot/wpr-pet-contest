# Pet contest sponsor kit

For Chris Weber (weber.chris@wausaupilotandreview.com), to sell the Cutest Pet
in Marathon County placements. Prepared Oct. 23, 2026. **All prices are
PROPOSED: suggestions for Chris to set, not commitments.**

| File | What it is |
| --- | --- |
| `index.html` | The pitch page. One self-contained file, with every placement shown in context. Open it, attach it, or print it to PDF (9 pages). |
| `leave-behind.html` | One page. Print or save as PDF at Letter size, margins "None". |
| `email.txt` | An email to adapt for one business. |
| `proposed-packages.html` | Internal, not for prospects: the tiers, the reasoning and the rate-card math behind each price. |
| `assets/` | Each mock-up as a PNG, for attaching to email, plus WPR's badge and wordmark. |
| `src/` | Page sources (`*.template.html`), `build.py` to rebuild the pages, `capture.mjs` to reshoot the mock-ups. |

## Before anything goes to a business

1. Set the prices. They appear in `index.html`, `leave-behind.html`,
   `email.txt` and `proposed-packages.html`.
2. Fill in every placeholder below. In the HTML pages, placeholders are
   highlighted in gold.
3. Delete the "PROPOSED, for Chris Weber to set" notice from the pitch page
   and the leave-behind, and the first two lines of `email.txt`.

To edit the pages, change `src/index.template.html` or
`src/leave-behind.template.html`, then run `python docs/sponsor-kit/src/build.py`
(needs Pillow). You can also edit the built `.html` directly: the images are
long single lines, but the text can still be searched.

## Placeholders

| Placeholder | What goes there | Where |
| --- | --- | --- |
| ~~`[contest dates]`~~ | Filled: Nov. 14 to Dec. 5, 2026 (entries open Saturday, Nov. 14; champion Saturday night, Dec. 5) | pitch, leave-behind, email |
| `[shelter share %]` | The published share of vote-pack sales, after refunds, that goes to Moments Foster Care | pitch (twice), leave-behind, email |
| `[number of Double Vote Hours]` | How many hours WPR will sell | pitch (twice), leave-behind |
| `[newsletter block schedule]` | Which daily editions carry the contest block, and how often | pitch |
| `[artwork deadline]` | When the sponsor's logo, tagline and link are due | pitch |
| `[commitment deadline]` | When a business must reply to hold a placement | pitch, leave-behind, email |
| `[contest preview link]` | The contest app's address with `?demo` added, which fills every open slot with "Your Brand Here" | pitch, email |
| `[confirm click reporting]` | What WPR can report to a sponsor. See the notes below. | pitch |
| `[first name]`, `[Business name]`, `[placement or package]`, `[one reason that fits them]` | Per prospect | email |

## Where the numbers come from

- **1.4M+ monthly page views, 354K+ unique monthly visitors, 20K+ email
  subscribers, 36K+ social likes and follows**, and the quote "a daily habit,
  not a drive-by click": WPR's 2026–2027 media kit, Advertiser's Edition
  (https://wausaupilotandreview.com/media-kit-2/, updated Oct. 1, 2026), as
  recorded in the wpr-ad-pitch skill. These are WPR-wide figures, and the
  pages say so. No contest traffic exists yet.
- **$5–$250 vote packs**: the contest's recommended pack ladder
  (`supabase/migrations/0018_contest_admin.sql`).
- **Moments Foster Care** as the partner: the brief for this kit. The app
  and the draft rules say "partner shelters" (plural), so confirm the name and
  the count before sending.
- **Rate-card anchors** in `proposed-packages.html` (leaderboard $300/week, run
  of site $150, newsletter slots): https://wausaupilotandreview.com/sponsorship-and-advertising/,
  read Oct. 10, 2026, via the wpr-ad-pitch skill.
- **Office phone 715-301-5539**: `web/src/config.js`.

## Notes before you sell

Still open:

- **Click reporting.** The app counts clicks on each sponsor placement, without
  cookies, but records nothing until its analytics are switched on
  (`ANALYTICS.domain` is empty today). It counts no impressions. Confirm before
  promising a report. That includes the "Clicks you can check" line on the
  in-app media kit (`#/sponsors`).
- **Share cards are not sold here.** Share images and share pages carry no
  sponsor credit.

Settled:

- **The buyer's thank-you screen is not sold** (decided 2026-10-23). It carries
  no advertising, and the kit doesn't offer it.

Fixed in the app on 2026-10-23, and the kit matches:

- **The presenting credit shows on phones.** It wraps to its own line in the
  contest bar below 480px wide (see `mockup-presenting-bar-mobile.png`).
- **The gallery slot moved.** It is now a full-width card right after the first
  full row of photos: 2 per row on a phone, 3 on a tablet, 4 on a computer, one
  fewer in the Open Round, when the leader's card spans two cells. The gallery
  mock-ups were reshot.
- **The in-app media kit (`#/sponsors`) no longer overclaims.** It no longer
  mentions impressions, "scroll longest", "traffic peaks", "every pet lover" or
  share cards.

Also:

- **The mock-ups use sample data.** The pets, vote counts, "$1,188 raised"
  and "30%" are made up by the mock API. Every image says so.

## Reshooting the mock-ups

The commands are at the top of `src/capture.mjs`. It runs the contest app
against `web/scripts/mock-api.mjs` on ports 8795 and 5185. Reshoot after any
change to the sponsor slots or the design, then copy the new PNGs into
`assets/` and run `build.py`.
