---
version: 1
slug: "web-src-pages-home-jsx"
primary_target: "web/src/pages/Home.jsx"
related_targets: ["web/src/pages/Gallery.jsx","web/src/pages/Bracket.jsx","web/src/pages/Results.jsx","web/src/components/CheckoutModal.jsx"]
---

# Home, Gallery, Bracket, Results and the thank-you screen

**Mode:** Persuade.
- **Home:** a reader arriving from a story, the widget or the newsletter sees what the contest is doing right now and acts: votes or enters.
- **Gallery:** an owner hunting for their pet.
- **Bracket:** someone following the race.
- **Results:** the payoff.

**What was asked (user, 2026-10-23):**
- Home's first screen becomes the live scoreboard.
- A photo-first gallery.
- A bracket poster.
- The leftover labels above headings cleared.
- Peak moments:
  - a celebratory thank-you screen with the shelter impact;
  - upset alerts everywhere;
  - a staged champion reveal.
- Real-phone polish.

**World:** inherited from DESIGN.md ("Follow the Money, in Arena Mode") and the pet page's contract. No new visual world, so no concept round. The request names the composition.

**Constraints:**
- Totals reset every round, stated wherever counts appear.
- Vote packs, never donations.
- No kicker above a heading.
- Sponsor slots lighter than Vote and never on the thank-you screen.
- Inside the WordPress iframe there is no fixed bar, and no masthead.

## Direction contract

THESIS: Home is the contest's live board, not a newspaper hero. The first screen shows what is at stake right now and the one thing to do about it. It refuses the category hero of a headline over polaroids with the action below the fold.

OWN-WORLD: The pet page's arena on the same cream ground.
- **The board:** deep teal (#1f4b45) with fixed-cell JetBrains Mono digits over ghost 8s, a game clock, and a lamp lit by an upset.
- **Leader rows:** a sun ring on first place.
- **The poster bracket:** rule-strong joins and a teal-deep crown slot that turns sun when won.
- **The champion:** the contest's only sun field. The crown drops onto a white-bordered photo.
- **The thank-you screen:** the pet's photo with a teal check, and a mini board whose digits light up as the votes land.

STORY: A reader sees the phase at a glance (entries counting down, the race to the top 16, the closest matchup, the next round), the stakes in numbers, and acts without scrolling. At the end, the champion's name arrives a beat after "is…".

FIRST VIEWPORT: 390x844, Home:
- the slim WPR flag (56–58px), the slim contest bar (44px) and the nav (48px);
- the title in Fraunces at optical size 144, two to three lines;
- the phase board;
- the primary action pill.

Measured: the board bottom is 469–596px and the action bottom 559–686px across phases. Desktop puts the board in the right column.

Signature interaction: the pet page's changed digits re-ignite in place, the upset lamp lights on matchup cards and the widget, and the champion reveal is staged (photo settles, crown drops, name lands). All three collapse under reduced motion.

FORM: An extension of the established world (seed 481985d7: Road to the Crown with Matchday Scoreboard), with the composition named by the user's request. No new roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
