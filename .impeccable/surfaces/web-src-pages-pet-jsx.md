---
version: 1
slug: "web-src-pages-pet-jsx"
primary_target: "web/src/pages/Pet.jsx"
related_targets: ["web/src/App.jsx","web/src/components/Banner.jsx","web/src/components/Masthead.jsx"]
---

# Pet page and phone shell

**Mode:** Persuade. A visitor who lands from a share link decides and votes.

**Audience and job:** mostly iPhone readers, often in the WordPress iframe, arriving from an owner's share link. They want to see the pet, see where it stands, and vote. Primary action: Vote for {pet}, a working button in the first viewport.

**Constraints:**
- Totals reset every round, stated wherever counts appear.
- Vote packs, never donations.
- Inside the iframe, position: fixed anchors to the bottom of the whole tall frame, so the pinned bar is standalone-only and the inline button must sit inside the first viewport.
- Every phase and state survives: waiting, open round, counting, bracket live, pending round, walkover, knocked out, unseeded, champion.

**Decided 2026-10-23:**
- The user picked a fusion of Road to the Crown with Matchday Scoreboard.
- Newsroom credibility stays in a slim band.
- Empty sponsor slots never appear on the thank-you screen and stay lighter than Vote.

## Direction contract

THESIS: Every pet's page is its run at the crown: where it stands on the road, the live game it is in right now, and one tap to vote. It refuses the category default of a photo, a stats card and a vote button buried two screens down.

OWN-WORLD: WPR's Follow the Money in arena mode.
- **Ground:** cream.
- **Scoreboard:** a deep-teal (#1f4b45) panel with JetBrains Mono digits in fixed dark cells over ghost 8s.
- **Sun (#f4b942):** for the lit lamp, the leader's bar and the crown.
- **Names:** Fraunces at optical size 144, set over the photo.
- **The road:** teal dots, solid where traveled and dashed ahead, ending in a crown.

STORY: The visitor recognizes the pet at once, sees its place on the road and in the live game, feels the stakes (the gap, the clock, an upset), and votes without scrolling.

FIRST VIEWPORT: 390x844, standalone, top to bottom:
1. Compact WPR flag (56px), slim contest bar (44px), nav (48px). Inside the iframe, the flag is gone.
2. A full-bleed photo, about 240px, with the name in 56px Fraunces and seed · town over a bottom scrim.
3. The road strip (56px): Open, Sweet 16, Elite 8, Final 4 and Final as stops, then the crown, with the current stop ringed.
4. The scoreboard panel: a round-and-clock row; two faces with names and seeds; fixed-cell digits; a tug bar; an "Upset" lamp lit when the lower seed leads.
5. "Vote for {name}" directly beneath, inside the viewport.

When that button scrolls away, a pinned Vote bar takes over (standalone only).

Signature interaction: a changed digit re-ignites in its own cell while nothing slides, and the lamp lights the moment the underdog takes the lead.

FORM: Road to the Crown (the dealt lead, #4 on the ordered list) fused with Matchday Scoreboard (#1). Seed key 481985d7.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
