# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Readers of Wausau Pilot & Review**, mostly on iPhones, arriving from a share link to one pet's page, a WPR story's article widget, the newsletter, or social posts. They come to see a pet they know, vote for it, and watch the race. Many are friends and family of an entrant, mobilized by the owner's shares.
- **Entrants (pet owners)**, who enter for free from a phone photo, then campaign: sharing their pet's page, share images and flyers to drive votes.
- **WPR staff**, who moderate entries, open and close rounds by hand, run Double Vote windows with sponsors, send email, and pay out the shelters, all from the admin desk.
- **Sponsors**, local businesses buying the presenting, gallery, bracket and thank-you placements, and sponsored Double Vote windows.
- **Prospective buyers (stated goal, 2026-10-23):** other newsrooms who could license the contest for their own region. Specifics (pricing, hosting, support) are undecided.

## Product Purpose

An annual reader contest, "Cutest Pet in Marathon County", that raises money for Wausau Pilot & Review and area animal shelters. Entering is free; votes are sold in vote packs ($5 to $250), and the proceeds are split with partner shelters by published weights. Success means a town-wide talking point that brings new readers, newsletter sign-ups and sponsors to a nonprofit newsroom, and a sizable check for the shelters.

## Positioning

A hometown newsroom's contest, with the honesty of a newsroom behind it: totals that reset every round, results frozen when a round closes, refunds for late or disqualified payments, a public split with named shelters, and the newsroom's name on all of it. Readers can trust the money and the count in a way a giveaway page or a social-media poll can't offer.

## Operating Context

- **Format:** one open round for the whole field, which sets qualification and seeding, then a 16-pet bracket (Sweet 16, Elite Eight, Final Four, Championship) over roughly two and a half weeks.
- **Embedding:** in a WordPress page through an iframe, plus a compact widget in WPR stories and a block in the daily newsletters.
- **Moments that matter:** Double Vote windows, which are sponsored hours when every pack counts twice. The last hours before a round closes. Upsets in the bracket. The champion announcement.

## Capabilities and Constraints

- **Votes are credited only when Stripe confirms the payment, by webhook.** The deadline is when the buyer paid. Late payments and payments for disqualified pets are refunded, never credited.
- **Vote totals reset every round.** This is published in the rules and repeated on the site.
- **Legal copy:**
  - They are "vote packs", never "donation".
  - Vote packs are not tax-deductible.
  - The shelters' share is of sales after refunds.
- **Privacy:** the public sees the pet, never the owner, and nothing is public before moderation. Personal data is erased a year after the contest.
- **Photos:** no HEIC; all metadata except orientation is stripped.
- **Tiebreaks:** open round by earliest entry; bracket by better seed.

## Brand Commitments

- **Design system:** WPR's "Follow the Money":
  - teal #3A867C for fills, #2B655D for text and buttons;
  - cream #F6F2E9;
  - Fraunces display, Public Sans body, JetBrains Mono for vote counts.
- **Identity:** WPR's masthead, badge and tagline ("Where Locals Look First For News") mark the newsroom's surfaces.
- **Sponsors:** sponsor slots render an upsell when unsold (chosen revenue lever). They never appear on the buyer's thank-you screen and stay visually lighter than Vote on reader pages (decided 2026-10-23).

## Evidence on Hand

- **Real assets:** the WPR badge and wordmark (`web/public/`), the rules text (draft, pending counsel), the partner-shelter structure, and the sponsor slot model.
- **No real contest data yet:** no real entries, photos, totals, sponsors or testimonials exist. The mock API (`web/scripts/mock-api.mjs`) serves a synthetic field for design work, which must never be presented as real.

## Product Principles

1. **The pet first.** A reader who taps a link to a pet sees that pet and can vote without hunting.
2. **Drama with integrity.** Stage the competition (races, upsets, the crown) as vividly as sports coverage, but never misstate a count, a deadline or where the money goes.
3. **Every pageview raises money for the shelters.** Make the cause and the tally visible at the moments people pay, never with pressure tactics.
4. **Built to travel.** Anything specific to WPR or Marathon County should come from config, so another newsroom could run it.

## Accessibility & Inclusion

WCAG 2.2 AA, enforced by the axe audit (`npm --prefix web run audit`) at phone size across every page and phase. Reduced motion is respected.
