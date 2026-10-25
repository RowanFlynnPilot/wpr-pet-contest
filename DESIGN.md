---
name: Cutest Pet in Marathon County
description: Wausau Pilot & Review's reader pet contest, in WPR's Follow the Money system played in arena mode.
colors:
  teal: "#3a867c"
  teal-ink: "#2b655d"
  teal-deep: "#1f4b45"
  teal-tint: "#e1edea"
  teal-wash: "#eff5f3"
  sun: "#f4b942"
  sun-ink: "#7a5500"
  sun-tint: "#fcefd0"
  cream: "#f6f2e9"
  cream-deep: "#ede6d6"
  paper: "#ffffff"
  ink: "#1a1a1a"
  ink-2: "#3a3a3a"
  muted: "#5f5f5f"
  rule: "#e3ddd0"
  rule-strong: "#cfc6b3"
  slate: "#32373c"
  red: "#9b2226"
  red-tint: "#f8e6e4"
  board-cell: "#0f2a26"
  board-row: "#163a35"
  board-label: "#cfe3de"
  board-text: "#e3efec"
typography:
  display-xl:
    fontFamily: "'Bricolage Grotesque', 'Bricolage Display Fallback', Arial, sans-serif"
    fontSize: "clamp(46px, 13vw, 88px)"
    fontWeight: 650
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontVariation: "'opsz' 96"
  display:
    fontFamily: "'Bricolage Grotesque', 'Bricolage Display Fallback', Arial, sans-serif"
    fontSize: "clamp(34px, 9vw, 64px)"
    fontWeight: 650
    lineHeight: 0.98
    letterSpacing: "-0.025em"
    fontVariation: "'opsz' 96"
  headline:
    fontFamily: "'Bricolage Grotesque', 'Bricolage Fallback', Arial, sans-serif"
    fontSize: "clamp(24px, 4.2vw, 34px)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Bricolage Grotesque', 'Bricolage Fallback', Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 650
    lineHeight: 1.1
  caption:
    fontFamily: "'Bricolage Grotesque', 'Bricolage Fallback', Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "0.14em"
  score:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "clamp(32px, 9.5vw, 46px)"
    fontWeight: 700
    lineHeight: 1.16
    fontFeature: "'tnum'"
  clock:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "14.5px"
    fontWeight: 700
    letterSpacing: "0.04em"
    fontFeature: "'tnum'"
rounded:
  sm: "6px"
  field: "8px"
  md: "10px"
  face: "12px"
  board: "14px"
  pill: "999px"
spacing:
  gutter: "16px"
  gutter-wide: "24px"
  section: "36px"
  max: "1120px"
components:
  button-primary:
    backgroundColor: "{colors.teal-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.teal-deep}"
  button-primary-lg:
    backgroundColor: "{colors.teal-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
    height: "54px"
  button-sun:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.teal-wash}"
  button-quiet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "44px"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
    height: "38px"
  chip-selected:
    backgroundColor: "{colors.teal-ink}"
    textColor: "{colors.paper}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "46px"
  scoreboard:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.board}"
    padding: "12px 14px 14px"
  score-cell:
    backgroundColor: "{colors.board-cell}"
    textColor: "{colors.paper}"
    typography: "{typography.score}"
    rounded: "{rounded.sm}"
  lamp:
    backgroundColor: "{colors.board-row}"
    textColor: "{colors.board-label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px 4px 8px"
  lamp-on:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
  leader-row:
    backgroundColor: "{colors.board-row}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  crown-slot:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.board}"
    padding: "18px 12px"
  champion:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
    rounded: "{rounded.board}"
    padding: "22px"
  done-board:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.face}"
    padding: "10px 12px"
  done-check:
    backgroundColor: "{colors.teal-ink}"
    textColor: "{colors.paper}"
    size: "34px"
  done-impact:
    backgroundColor: "{colors.sun-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  banner:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.paper}"
    padding: "10px 0"
  nav:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    height: "48px"
---

# Design System: Cutest Pet in Marathon County

## Overview

**Creative North Star: "Follow the Money, in Arena Mode"**

The site is WPR's newsroom system, the one it uses to follow the money, carried into a sports arena. The ground stays a newsroom's: warm cream paper, a slate-ruled masthead, Public Sans body copy, Fraunces headlines. On that ground the contest lays out an arena: a deep-teal scoreboard with fixed-cell digits, a lamp that lights when something happens, a game clock, and a road of dots running from the open round to a crown. The newsroom supplies the credibility; the arena supplies the stakes.

Density is set for one iPhone screen. The pet page puts the pet, its place on the road, the live game and the Vote button inside a 390 by 844 viewport; Home puts its title, the live board for the current phase and the primary action there too. The shell gives up height to make room: a one-line masthead on phones, a slim one-line contest bar, then the nav. Drama is staged and never faked. Digits change in place and nothing reflows. On the board the lamp is always present, lit or unlit, so an upset reads as a light coming on, not a badge appearing. Wherever a count appears, it is labeled as resetting every round.

Sun yellow is held back for the moments that count: a lit lamp, the leader's tug bar and ring, the crown, Double Vote windows, and one whole field, the champion's. Teal does the structural work. Shadows are soft and tinted with teal; there are no hard offsets.

**Key Characteristics:**
- Cream newsroom ground with one deep-teal arena panel per screen.
- JetBrains Mono digits in dark fixed cells over ghost 8s; tabular figures everywhere a number is counted.
- Bricolage Grotesque at optical size 96 for pet names and big lines, set over the photo behind a teal scrim.
- The road: teal dots, solid where the pet has traveled and dashed ahead, ending in a drawn crown.
- Pill-shaped controls with soft, teal-tinted drop shadows.
- Drawn SVG marks for arrows, checks, crosses and the crown; never text glyphs.
- One sun field in the whole contest: the champion's.

## Colors

The palette is a newsroom's warm paper and ink, one teal family carrying the brand, and a sun yellow kept for the moments that count.

### Primary
- **Typewriter Teal** (teal): the teal of the typewriter in WPR's badge. A fill color only, for bars, rules, road dots and lines, focus rings, quote marks and large display accents. It measures 3.9:1 on cream, so it never carries body text.
- **Teal Ink** (teal-ink): the readable teal, for links, primary button fills, selected chips and tabs, active nav text, the winner's check, and teal text on light grounds (6.0:1 on cream, 6.7:1 under white).
- **Arena Teal** (teal-deep): the scoreboard, the contest banner, the bracket's crown slot, the thank-you mini board, the photo-hero ground, and the hover state of primary buttons.
- **Teal Wash / Teal Tint** (teal-wash, teal-tint): quiet backgrounds for notices, the hover state of ghost buttons and leaderboard rows, winning matchup sides, and the active dropzone.

### Secondary
- **Sun** (sun): lit lamps, the leader's tug bar, face ring and row ring, the crown when won, the game clock's digits, an upset matchup's border, Double Vote bars and badges, the sun button, and the champion field. A fill and an on-dark text color; never text on cream.
- **Sun Ink** (sun-ink): sun-family text on light grounds, and the crown's outline.
- **Sun Tint** (sun-tint): the soft ring around the live road stop, the adoptable badge, the upcoming-bonus bar, warnings, and the shelter-impact line on the thank-you screen.

### Tertiary
- **Knockout Red** (red, red-tint): elimination on the road, urgent countdowns, form errors, destructive buttons. It marks loss and error only, never excitement.

### Neutral
- **Cream** (cream): the page ground.
- **Cream Deep** (cream-deep): photo placeholders, skeletons, progress tracks.
- **Paper** (paper): cards, nav, masthead, inputs, the sticky vote bar.
- **Ink, Ink 2, Muted** (ink, ink-2, muted): body text, secondary text, and metadata. Muted still passes AA on cream.
- **Rule, Rule Strong** (rule, rule-strong): hairlines and dividers, plus control borders, the dashed road ahead, and the bracket poster's joins.
- **Slate** (slate): the masthead's heavy top rule and underline, carried over from WPR.
- **Board Cell, Board Row, Board Label, Board Text** (board-cell, board-row, board-label, board-text): the arena's own shades on teal-deep. Board Cell is the digit wells and the tug-bar track; Board Row is the unlit lamp's housing and the leader rows; Board Label is the round name, units and unit labels; Board Text is the deadline and the notes on the board. The leading row lifts to a lighter teal (#24564f). These are hard-coded in the stylesheet today rather than declared in `tokens.css`.

### Named Rules
**The Fill-Versus-Ink Rule.** Teal and sun are fills. Text in either family uses its ink partner (teal-ink, sun-ink) on light grounds. Sun can be text only on teal-deep.

**The Sun Is Earned Rule.** Sun appears where something is won, leading, lit or doubled. A sun surface that marks nothing is noise.

**The One Sun Field Rule.** The champion panel is the only panel filled with sun. Everywhere else sun is a ring, a bar, a lamp, a pill or a crown.

**The White-Label Line.** The tokens are named by role in `styles/tokens.css`: `brand` (with `-ink`, `-deep`, `-tint`, `-wash`), `accent` (with `-ink`, `-tint`), `danger` (with `-tint`), the paper family and the three faces. The names this document uses (teal, sun, red) are aliases of those roles, kept so the stylesheet reads as it always has. The board shades (`--board-cell`, `--board-row`, `--board-row-lead`, `--board-ring`, `--board-bulb`, `--board-label`, `--board-text`, `--board-dim`, `--board-quiet`) and the warm derivatives (`--accent-rule`, `--accent-wash`, `--accent-soft`, `--accent-light`, `--danger-rule`, `--danger-bright`, `--danger-deep`, `--danger-deeper`) are mixed from the roles with `color-mix()`, so a newsroom that sets its brand gets a matching arena for free. The stylesheet carries no brand literal; the canvas share images, confetti and the Stripe form read the resolved tokens through `lib/theme.js`.

A newsroom is a theme block on `:root[data-theme='…']` plus an entry in `src/newsrooms.js` (name, region, towns, clock, lockup, faces). The sales demo carries a second one, "The Example Gazette": navy and gold on a cooler paper, Newsreader over Source Sans 3. Danger keeps its own hue in every theme, so a red-leaning brand never reads as an error. Slate and the masthead rule belong to the newsroom's identity, not the contest's.

## Typography

**Display Font:** Bricolage Grotesque (with size-adjusted Arial fallbacks, `Bricolage Fallback`, `Bricolage Display Fallback` and `Bricolage Figure Fallback`, so lines do not rewrap when the web font arrives). Chosen Oct. 24, 2026 over the fleet's Fraunces, which carries eighteen WPR tools: this one should look like its own product. It has no italic, so emphasis is weight (the headline's `em` at 760) and color; the dek and the owner's caption are upright at 400.
**Body Font:** Public Sans (with the system UI stack)
**Label/Mono Font:** JetBrains Mono, for vote counts, seeds, prices, ranks and clocks

**Character:** a soft, wedge-serifed editorial display against a plain civic sans, plus a mono face that makes every count look like a scoreboard reading.

### Hierarchy
- **Display XL** (650, clamp(46px, 13vw, 88px), line height 0.9, opsz 144): the pet's name over its photo. The champion's name uses the same face at the same optical size, at clamp(44px, 9vw, 76px).
- **Display** (650, clamp(34px, 9vw, 64px), line height 0.98, -0.025em, opsz 144, display fallback face): Home's title, balanced over two to three lines on a phone, with its key word in teal-ink italic.
- **Headline** (600, clamp(24px, 4.2vw, 34px), line height 1.1): section headings.
- **Title** (600 to 650, 17 to 21px): team names on the board, leader-row names, the contest bar's title (19px), card names and pet-card names (26px on the gallery's featured card).
- **Caption / Dek** (the display face, upright, 400, 17 to 20px, line height 1.45, 62ch max): the owner's caption in teal curly quotes, and deks under headings.
- **Body** (400, 16px, line height 1.55): everything else. Small print runs 12.5 to 13.5px in muted.
- **Section count** (Public Sans 700, 14px, muted, 6px below the heading): a count or status under a heading.
- **Label** (800, 11.5 to 12px, 0.12 to 0.14em, uppercase): the scoreboard's round name, its lamp and unit labels, bracket column heads, the champion's story line (13px, 0.06em), the road stops (sentence case, 0.03em), and table headers.
- **Score** (JetBrains Mono 700, clamp(32px, 9.5vw, 46px), tabular): digits in board cells; 24px in leader rows, 30px on the thank-you board. Clocks run at 14.5px with 0.04em tracking.

### Named Rules
**The Counted-In-Mono Rule.** Any number a reader might compare (votes, seeds, ranks, prices per vote, clocks) sets in JetBrains Mono with tabular figures. Dollar headline amounts set in Fraunces at opsz 144.

**The Big-Line Optical Size Rule.** Display lines larger than about 30px use `'opsz' 96` with the display fallback face; smaller display text stays at the automatic optical size with the regular fallback.

**The Under-Never-Over Rule.** A count or status sits under its heading, never above it as a kicker. Headings carry no kicker at all. A section count goes beneath the heading, and only when it says something the heading doesn't. The scoreboard's round name is the board's header row, not a kicker over a heading.

## Layout

The page centers on a 1120px column with a 16px gutter on phones and 24px from 720px up. Side padding is `max(gutter, safe-area inset)` on each side (`--pad-l`, `--pad-r`), with `viewport-fit=cover`, so a landscape notch never clips content; the pinned Vote bar adds the bottom inset. Sections are spaced 36px apart (8px when one follows another). Grids use `minmax(0, 1fr)` tracks throughout so a long unbroken pet name cannot push a column off a phone.

The pet page is the system's reference layout. On phones it stacks: a full-bleed photo at 2:1 with the name over a bottom scrim, the road strip, the scoreboard, the Vote button, all inside the first viewport. When that button scrolls away, a paper bar pinned to the bottom takes over, outside the WordPress iframe only, since `fixed` would anchor to the bottom of the whole frame. From 900px the stage splits into a square photo (1.05fr), sticky at 16px from the top, beside the play column (1fr), with 36px between.

Home's first screen is the live board, not a newspaper hero. On phones one column stacks title, board, actions, lede, then (in the entry weeks) the taped polaroids, 14px apart under 18px of top padding. From 900px two equal columns put title, lede, actions and polaroids on the left and the board in the right column, spanning every row, with 18px by 44px gaps. Measured at 390 by 844 across phases, the board ends between 469 and 596px and the primary action between 559 and 686px: both above the fold.

The shell gives height back on small screens. Below 640px the masthead collapses to one line (34px badge, 26px wordmark, no tagline or dateline). The contest bar is always the slim one-line form (19px title, 10px padding); below 480px it drops its status line but keeps the presenting credit, which wraps to a second line. The Double Vote bar shrinks to a single line below 640px. Breakpoints in use: 400, 480, 560, 640, 720, 760, 880, 900, 980 and 1000px.

Pet galleries run 2, 3 and 4 columns (at 640px and 980px), with 12 to 18px gaps. Below 760px the town and sort selects share one row, two equal columns under the full-width search.

## Elevation & Depth

Hybrid: tonal layering does most of the work (cream ground, paper cards, a deep-teal arena panel) and soft, teal-tinted shadows add lift. Every shadow is a blurred drop with a negative spread, tinted toward the teal family (toward sun-ink under the champion). None is a hard offset.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(31, 43, 40, 0.06), 0 4px 14px rgba(31, 43, 40, 0.06)`): cards, pet cards, matchups, sponsor cards.
- **Lift** (`box-shadow: 0 2px 4px rgba(31, 43, 40, 0.08), 0 12px 28px rgba(31, 43, 40, 0.12)`): pet-card hover, the desktop photo hero, toasts.
- **Button press** (`box-shadow: 0 6px 14px -7px rgba(31, 75, 69, 0.7)`, sun variant `rgba(122, 85, 0, 0.55)`): primary and sun buttons, collapsing to `0 2px 5px -2px` with a 1px drop on press.
- **Board** (`box-shadow: 0 14px 28px -18px rgba(15, 42, 38, 0.75)`): under the scoreboard and the bracket's crown slot.
- **Champion** (`box-shadow: 0 16px 32px -20px rgba(122, 85, 0, 0.6)`): under the sun field; its photo sits on `0 14px 28px -16px rgba(31, 43, 40, 0.55)`.
- **Sticky bar** (`box-shadow: 0 -10px 24px -14px rgba(0, 0, 0, 0.35)`): the pinned Vote bar, cast upward.

### Named Rules
**The Soft-Offset Rule.** Buttons sit on a soft, tinted shadow with a negative spread. Pressing them moves them down 1px and tightens the shadow. Hard offsets are not part of this world.

**The Light-Not-Lift Rule.** On the board, emphasis is light, not elevation: a sun ring on the leader's face or row, a lamp igniting, a digit flaring sun as it changes.

## Shapes

Corners are soft and consistent. Controls are pills (999px): buttons, chips, round tabs, share buttons, lamps, badges, the back link. Containers round at 10px (cards, notices, leader rows, the desktop photo hero), the scoreboard, crown slot, champion and modal at 14px, inputs at 8px, digit cells and small thumbnails at 6px, and board faces and the thank-you mini board at 12px. Road stops are circles, 24px across with 3px rings. The crown is a drawn five-point SVG silhouette, filled cream with a sun-ink outline until won, then filled sun.

Lines carry state: a solid 3px teal line where the pet has traveled, a 5-on, 4-off dash in rule-strong ahead, and a dashed ring on a stop it never reached. On the bracket poster a 2px rule-strong bracket, rounded 8px at its outer corners, joins each pair toward the next round.

## Components

### Buttons
Confident pills with a soft drop beneath.
- **Shape:** full pill (999px), 44px minimum height, 2px border slot.
- **Primary:** teal-ink fill, white bold 15.5px text, button-press shadow. Large (54px, 17.5px text) is the Vote button and Home's primary action. Block buttons wrap a long name rather than widen the page.
- **Hover / Focus:** primary deepens to teal-deep; press moves down 1px and tightens the shadow. Focus is a 3px teal outline at 2px offset. Transitions run 150ms on the house ease.
- **Sun:** sun fill with ink text, for celebration and Double Vote actions, hover to a lighter sun.
- **Ghost:** transparent with a teal-ink border and text, washing teal on hover. **Quiet:** paper with a rule-strong border that darkens on hover. **Danger:** red, for admin only.

### Chips
- **Style:** paper pills, 38px tall, rule-strong border, 14px bold ink-2 text, with optional mono counts.
- **State:** selected chips and round tabs fill teal-ink with white text.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** paper on cream. A sun card (`.card.sun`, good news: the entry confirmation, the thank-you after the final, the adoptable pet) is a warm surface, #fffaf0 inside a #ecd9a6 hairline.
- **Shadow Strategy:** resting shadow; pet cards lift 2px with the lift shadow on hover.
- **Border:** 1px rule, on every side. No card, counter, award, modal or sponsor placement carries a colored top bar: emphasis comes from what is inside (the amount in Display XL, the sun-ink award label, the modal's own head), never from a rail on the container.
- **Internal Padding:** 18px; pet-card bodies 10 to 12px.

### Browser Surfaces
The parts the browser draws follow the palette: text selection is sun-tint on ink (white at 30% on the board and the bars), the caret and native checkboxes and radios are teal-ink (`caret-color`, `accent-color`), thin scrollbars are rule-strong on nothing, links underline 1px at 0.18em offset, headings balance (`text-wrap: balance`) and paragraphs never leave a word alone (`text-wrap: pretty`). Nothing is set under 11px.

### Inputs / Fields
- **Style:** paper, 1px rule-strong, 8px radius, 46px minimum, 16px text (no iOS zoom). The admin's compact table and window fields run 14px, rising to 16px on coarse pointers.
- **Focus:** 3px teal outline flush to a teal border.
- **Error / Disabled:** red border with bold red 13.5px error text below; disabled controls drop to 55% opacity.

### Navigation
A paper bar under the contest bar with 48px links in bold ink-2, a 3px teal underline on the current page and teal-ink text on hover. Links tighten to 13.5px below 400px, and the Vote call to action joins the bar from 720px.

### Touch and Press
The site is built for a thumb first.
- **Hover is for mice:** every `:hover` rule sits inside `(hover: hover) and (pointer: fine)`, so a tap never leaves a stuck hover state.
- **Press feedback:** buttons drop 1px; chips, round tabs and share buttons scale to 0.97 over 100ms; a pressed pet card dims its photo to 94% brightness.
- **Controls behave like controls:** the tap highlight is off, links and controls take `touch-action: manipulation` (no double-tap wait), and only controls (buttons, chips, tabs, share buttons, ARIA buttons and tabs) refuse text selection and the long-press callout. Content links keep selection.
- **Modal:** checkout's backdrop and sheet use `overscroll-behavior: contain`, so scrolling to its end never drags the page behind it. Below 560px it is a bottom sheet with 16px top corners.

### The Scoreboard (signature)
A deep-teal panel at 14px radius. A header row holds the round name (label style, board-label) with its deadline beneath, the lamp, and the game clock in sun mono. A head-to-head sets two faces (12px radius, a 2px dim ring, a 3px sun ring on the leader) over names and mono seeds, with fixed-cell digits and a sun tug bar on a board-cell track. A solo layout serves counts and rank; countdown cells (days, hours, minutes) use the same cells with real zeros. Digits sit in 0.74em by 1.16em board-cell wells over a ghost 8 at 5.5% white. A changed digit remounts and flares from sun with a glow (420ms, `cubic-bezier(0.16, 1, 0.3, 1)`), and nothing slides. Unlit leading cells are ghosts, not zeros; clock cells pad with real zeros. Screen readers get one sentence, never a tick each second.

### The Home Board
Home's first screen shows the phase on one board, one board per phase:
- **Entry weeks:** before entries open, countdown cells to the opening. While entries are open, a solo count of pets entered with the game clock to the close. Once closed, the field's count and countdown cells to voting.
- **Open Round:** the top three as leader rows: a 22px mono rank, a 40px face (9px radius), the name over its town, and 24px cells. Rows sit on board-row at 10px radius; the leader's row lifts to #24564f inside a 2px inset sun ring, with its rank in sun. The note names the fight at the cut line.
- **Bracket round:** the closest matchup as a face-off (faces, names, seeds, cells, tug bar), with the upset lamp in the header.
- **Between rounds:** countdown cells to the next round, and the reminder that every total starts over.

### The Lamp (signature)
A pill on the board. Unlit: board-row housing, a dim bulb, and the word drawn as a ghost (7.5% white) the way the 8s sit behind the digits; the word is decoration and screen readers get the lamp's sentence. Lit: a sun fill, ink text, an ember bulb, and a ring that blooms outward once (900ms). It names the event (Upset, Champion).

The upset lamp is on the board whenever the two seeds differ, and lights the moment the worse seed leads. Off the board it appears only lit: on a matchup card the card takes a sun border and ring and a head row carries the lit lamp ("Upset alert" while voting, "Upset" once decided); in the article widget a small sun pill reading "Upset alert" rides the race's label line.

### The Road Strip (signature)
One row of stops from the open round to the crown, each with a short label and a mono result or date. Done stops are teal discs with a drawn check. The live stop is teal-deep with a sun ring and a sun-tint halo. Next has a teal ring, ahead a rule-strong ring, a knockout a red disc with a drawn cross, and a stop never reached a dashed ring.

### Pet Hero
The photo with the pet's name in Display XL and seed, town and species in bold 14px warm white, over a scrim that rises from the bottom 70%. The scrim, the ground behind the photo and the back link take the pet's own color: `lib/photoTint.js` reads a small copy of the photo, keeps its hue, holds saturation between 24 and 52 percent and pins lightness at 20 percent, so white type reads at about 9:1 on any pet. Until the photo loads, or where the bucket sends no CORS headers, the arena teal stands in (`--tint`, `--tint-0/55/90`, `--tint-glow` on `.pet-hero`, each with the teal fallback). It is the one place the pets, the only asset that changes every year, drive the color.

**The Pet's Color Rule.** The tint belongs to the hero on the pet's own page. It never reaches the board, the buttons or the cards, so a pet's color can never be mistaken for a state.

### Photo-First Gallery
The grid leads with photos. While the Open Round is live and the grid is unfiltered and sorted by votes, the leader's card is featured: it spans two cells, its photo goes 16:10, and its name sets at 26px. The sponsor never comes first; it rides as a full-width break after the first full row of photos, whatever the column count. Search runs full width; on phones the town and sort selects share the row beneath it.

### The Bracket Poster
From 1000px the bracket is a poster: one column per round plus the crown. Columns are weighted to their load: the round of 16 at 1.3fr, the middle rounds at 1fr, the crown at 0.8fr. Each column head stacks the round's name over its timing. Slots come in pairs, centered against the pair they feed, and each pair is joined toward the next round by a rule-strong bracket. On the poster each side stacks the name over its count (15px name, 13px muted count) beside an 18px seed and a 36px photo; names wrap rather than truncate, and Vote buttons stack and wrap their labels. The crown column holds a teal-deep slot on the board shadow: a 44px crown, dark until won, then sun with a sun-ink outline, over the champion's 72px face and name. Below 1000px the bracket becomes round tabs.

Matchup cards show a winner's side on teal-wash with a drawn check after the name in teal-ink, and a loser greyed. A 3px bar along each side's foot shows its share, teal for the first side and sun for the second.

### The Champion Reveal
The contest's only sun field, at 14px radius with the champion shadow, where the road ends. The photo sits in a 6px white border, tilted -2 degrees, with a sun crown tipped -14 degrees on its corner. The name sets in Display XL; under it a label-style story line states the year and the seed's story ("The top seed holds on", "A No. 12 seed takes the crown"). The reveal is staged on the arena's ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`): the photo settles from a steeper tilt (900ms), the crown drops onto it (800ms, after 450ms), then the name lands (700ms, after 750ms), so the name arrives a beat after the photo. Confetti falls behind it once, in colors that show on sun: teal-deep, teal, white, teal-ink and sun-tint. Under reduced motion all of it is still.

### The Thank-You Screen
The modal's head says only "Thank you!". The hero beneath sets the pet's photo (104px, 16px radius) with a 34px teal-ink check disc on its corner, ringed in paper, beside the count bought ("25 votes for Gus") and a teal-deep mini board whose cells show the pet's total this round, labeled as including the buyer's votes. A sun-tint line states what the pack sent to the shelter. Then the status in one sentence ("Totals reset every round"), compact share tools (Share, Facebook, Text, Copy link), Buy another pack and Done, and a one-line 13px note that a vote pack isn't a donation, with links to give to WPR or get the newsletter. Confetti (sun, teal, white, teal-tint) falls once when the votes are credited. A late payment gets the plain facts instead: no confetti, no board.

### Winner Check
A win is marked with the drawn check (a 3px-stroke SVG path), in teal-ink after a winner's name and white on the thank-you disc. Never a text glyph.

### Shell
A slate-ruled paper masthead carries WPR's badge and wordmark, then the teal-deep contest bar with a 7% paw-print pattern: one line holding the contest's name in 19px Fraunces, its status, and the presenting sponsor's credit. Every page carries its own h1, so the bar never grows. Then the Double Vote bar in sun when a window is live.

## Do's and Don'ts

### Do:
- **Do** put the pet, its road, the live board and a working Vote button inside a 390 by 844 first viewport.
- **Do** put Home's title, the phase board and the primary action above the fold at 390 by 844.
- **Do** set every comparable number in JetBrains Mono with tabular figures, and change digits in place inside fixed cells.
- **Do** say "Totals reset every round" wherever a count appears.
- **Do** call purchases vote packs.
- **Do** use teal-ink, never teal, for text and button fills on light grounds; reserve sun for lit, leading, won or doubled.
- **Do** draw arrows, checks, crosses and the crown as inline SVG that rides the text baseline.
- **Do** give buttons the soft, tinted press shadow and a 1px press.
- **Do** keep sponsor placements visually lighter than Vote, and keep them off the buyer's thank-you screen.
- **Do** keep the lamp present on the board while unlit, so its moment is a light igniting.
- **Do** honor reduced motion: ignite, lamp bloom, the champion reveal, confetti and transitions all collapse.
- **Do** gate every hover style behind `(hover: hover) and (pointer: fine)` and give touch an `:active` press instead.
- **Do** pad page edges with `--pad-l` and `--pad-r` so content clears the notch.

### Don't:
- **Don't** place an uppercase kicker or eyebrow above a heading; put counts and status beneath it.
- **Don't** use text glyphs for arrows, checks or crosses.
- **Don't** use hard offset shadows.
- **Don't** set body text in teal or sun on cream.
- **Don't** call a vote pack a donation.
- **Don't** pin a fixed Vote bar inside the WordPress iframe.
- **Don't** let a count reflow or slide when it changes.
- **Don't** fill any panel but the champion's with sun.
- **Don't** truncate a name on the bracket poster or inside a Vote button; let it wrap.

## Three moments (Oct. 25, 2026)

- **The photo, whole.** The pet page's hero is a button; a tap opens the
  photo at full size on the color of the photo itself (`PhotoLightbox`,
  the modal with a `lightbox` class). Escape, the close button, a tap beside
  the photo or a pull down on a phone closes it; pinch still zooms. The
  hero keeps its crop; the lightbox is where the whole picture lives.
- **The link as friends see it.** Above the share buttons, `LinkPreview`
  draws the unfurl a reader's friends get: the share page's picture (the
  matchup card during a bracket round, when the deploy drew one; the photo
  otherwise), the site, the title and the description, in the words
  `build-share-pages.mjs` writes. It never invents a card that does not
  exist: a missing card falls back to the photo.
- **"Biscuit is entered!"** The entry form's success screen shows the photo
  they just sent in a frame, a line they can post today (there is no page
  to link until an editor approves the entry, so it points at the front
  door), a native share and a copy button, and a calendar note for the day
  voting opens. The demo takes an entry so the screen can be seen; a pending
  entry is private either way.

## Dark mode and the bracket that draws itself (Oct. 25, 2026)

- **Dark mode follows the OS.** The paper family has a light and a dark cut
  (`--paper-light` / `--paper-dark` and so on in `tokens.css`); the mode
  picks. Brand-colored text uses `--brand-text` (the ink in light, the brand
  lifted toward white on dark paper), and the tints are mixed into the dark
  paper; fills and buttons keep `--brand-ink`. `<html data-mode="light|dark">`
  overrides the OS: the WordPress embed and the article widget are always
  light, because they sit inside a light page; the admin desk stays light;
  the demo's bar switches. The share images read the light tokens through a
  light probe, so a poster is the brand's look whatever the screen. The
  badge and wordmark are transparent PNGs now; dark mode inverts the
  wordmark. The audit runs five pages in the dark as well.
- **The bracket draws itself.** Each column's links draw in left to right
  (`clip-path`), the names slide in behind them, a won side lights up, the
  crown lands last; `--col` and `--row` on the markup set the stagger. A
  round resolving while the page is open mounts the next column's names,
  and they arrive the same way. On a phone, one round at a time, the column
  delay is zero. Reduced motion turns it all off.

## The section bar (Oct. 25, 2026)

The sections share the nav evenly, each with an emoji (🏠 Home, 📸 Enter,
🐶 Pets, 🏆 Bracket, 👑 Results, ❤️ Shelters, 📋 Rules; `aria-hidden`, so
the word is the name). On a phone it is a tab bar, emoji over the word; from
720px one row with the call to action at the end. The current section is
washed and underlined across its share. The paw was tried for Pets and set
aside: it disappears on dark paper.

## Meet a pet, and the nameplate in the dark (Oct. 25, 2026)

- **"Meet a pet."** One of the newsroom's adoptable pets, at random, as the
  way into its adoption page (`AdoptButton`; WPR's is the Central Wisconsin
  pet finder). The pets come from `adoptables.json`, which the deploy builds
  from the adoption tool's feed (`scripts/adoptables.mjs`: name, breed, age
  and a 120px square from Adopt-a-Pet's CDN, shelter notes like "*Barn
  Cat*" stripped; 275 of 286 pets have real photos). The page fetches it
  only when the button nears the screen; without it, the featured pet;
  without that, a plain invitation. A warm card: the photo in a white ring
  that straightens on hover, a heart on its shoulder, a teal arrow. On Home
  under the partner shelter and on the Shelters page. A newsroom without an
  adoption page (`adoptUrl: null`) gets no button.
- **The nameplate in dark mode** is the brand's ink (`--masthead-bg`), a
  step lighter than the contest bar, with the wordmark in white: the paper's
  name never sits on near-black. Light mode keeps newsprint.

## Clubs, climbers, profiles and the finish (Oct. 25, 2026)

- **Milestone clubs** (`lib/milestones.js`): a badge at 50, 100, 250, 500,
  1,000, 2,500, 5,000 and 10,000 votes over the whole contest, every round
  summed (totals reset for the race, not for the clubs). Digital only: no
  prize rides on them. The pet page shows every club joined as a sun stamp,
  the next one ghosted, and a bar with the votes still to go; a gallery card
  carries its highest club as a chip.
- **Climbing** (`climbers` in `lib/rank.js`, the `entry_round_momentum`
  view): a pet that rose three places or more since yesterday gets a ▲n on
  the Open Round board, its gallery card and its pet page. Today's standings
  against yesterday's (today's totals minus the last day's votes), both with
  the open round's tiebreak. Nothing until the round has run a day, and
  nothing in the bracket, where every matchup is head to head.
- **Get to know** (0026): three optional prompts on the entry form (also
  answers to, favorite thing, best trick or quirk), moderated with the
  caption and shown on the pet page under it. Moderators can correct or
  clear an answer instead of rejecting the entry.
- **The finish.** The three faces are self-hosted (`src/fonts`, Latin
  subsets, OFL) and the two the first screen needs are preloaded: no
  third-party request before the first paint. A lazy photo fades in over a
  blurred tiny copy of itself where the host can serve one (pre-rendered
  widths or the render endpoint); never an eager photo, which is usually the
  largest paint. A short haptic tick when votes land, on phones that have
  one, and not for readers who ask for less motion.

## The pass after the deck review (Oct. 25, 2026)

- **Who the pet is, first.** On the pet page the caption and the "Get to
  know" answers (`PetAbout`) sit right under the photo, as chips that read as
  phrases ("aka Biscuit Boy", "Loves the squeaky hedgehog", an opening
  article lowercased); then the road, the scoreboard and the vote. The entry
  form shows the same block live as the owner types ("On Biscuit's page").
- **The thank-you screen** names the club a pack unlocked ("Your pack put
  Moose in the 250 Club", on sun) or the votes to the next one.
- **Phones:** the link preview is the compact kind (thumbnail beside the
  words), the milestone row shows only the latest club and the next, and
  Home's three steps become one line once voting is on (`HowItWorks
  compact`), the reset rule kept.
- **Rising today** sorts the gallery by the last day's votes in the Open
  Round. **The clubs** on Results tally each club and name the pets in the top
  one.
- **Share images carry the club** as a sun pill with a drawn medal (on the
  photo in the story and the flyer, under the town on the square). Clubs only
  grow, so a printed flyer never goes stale.
- The wordmark and badge are transparent PNGs, so anything that flattens
  them must flatten onto white (`og-card.py`'s `on_white`), and the canvas
  wordmark mask multiplies by the pixel's alpha.

## The owner's kit (Oct. 25, 2026)

- **Ready-made posts.** The owner panel writes a Facebook post, an Instagram
  caption and a text message for where the pet stands right now (before
  voting, the Open Round, a matchup, unseeded, out, champion), on chips with
  one Copy button (`lib/ownerPosts.js`). The hook first, one call to action,
  the link where it is clickable and "Link in bio" with the local hashtags on
  Instagram. Never "donation", never invented urgency; a matchup says the
  count starts at zero.
- **"Your links have brought 3 vote packs."** The owner's own links carry
  `?via=o`, the share pages keep it on the way through, and the panel shows
  the count from `entry_referrals`. Attribution only: nothing about the pack
  changes, and nothing is won.
- **Fair play.** The rules and money pages open with the promises the code
  keeps, each a check and one sentence: one field with real ranks (no small
  groups where every pet leads its own), totals that reset, half to the
  shelters after refunds with card fees on the newsroom, a purchase never a
  donation, one price list, results that stand, staff who stay out.
- **Sprints.** A sun card on Home (the surface kept for good news): coming
  up with a countdown, running with the top three and their counts, being
  counted, then the winner's photo for half a day. A one-line notice on the
  pet pages while one runs. Every card says sprint votes count toward the
  round like any other.
- **The keepsake.** Once a pet's run is over (at the finish, or out of the
  bracket), the image maker offers a certificate: 11 x 8.5 landscape, cream
  inside a thick-over-thin frame, the photo with its club on the left, and
  on the right "Certificate of Cuteness" (of Champion Cuteness for the
  winner), what the pet did, its votes over the whole contest, what voters
  raised at the finish, and the newsroom's name on a signature line. At the
  finish it is the image maker's first choice.
- **The finale.** A live reveal staff schedule (time and stream link): a
  deep-teal card on Home and Results, the scoreboard's own countdown cells,
  a sun "Where to watch" and a calendar file; "Live now" with a pulsing dot
  for two hours; then a quiet replay line for two weeks. It never hides the
  result: the final count is public as voting closes, and the crown drops
  when staff run the last Close on the stream.
