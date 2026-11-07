# Feature: c-crossword ("Cruciverba" at /c/, in the Sottosopra)

Objective: the final-night interactive crossword replaces the "Ancora sigillato" placeholder of the
reserved hidden page `c/` (the QR's short link already lands on `/c/`), dressed in the site's
Sottosopra identity. Branch `feat/c-crossword`. No test runner: `node --check`, byte/hash checks,
harness and Playwright probes. Nobody on the team commits; the main session does.

## Specs (organizer's spec, verbatim)

Reference implementation, tested, behaviour final, read-only, outside the repository:
`C:\Users\marco\Music\Enigma Finale Caccia al Tesoro\Cruciverba\cruciverba-interattivo\`
(`index.html`, `style.css`, `app.js`, `puzzle.js`). `puzzle.js` sets `window.CROSSWORD` and is
the source of truth for the layout: 29 x 29 free-form grid, 69 words, clues, and 31 highlighted
cells with their index 1-31. It contains no letters and no answers, on purpose. Only the organizer
holds the solution. Nobody on the team opens anything in `C:\Users\marco\Downloads\`.

S1. Path. The crossword is served at `/caccia-al-tesoro-26/c/` (and `/c`, which GitHub Pages redirects).
    Other pages (`/periodica/`, `/arancione/`, the main site) keep working unchanged. The page is never
    linked from the site or from another hidden page.

S2. Layout is fixed. Copy `puzzle.js` byte for byte. Do not regenerate, reorder or renumber anything.
    Do not reword, translate or "fix" any clue: they are deliberate, including their punctuation.

S3. No solution in the repository, ever (it is public, and so is its history): no answer word, letter
    grid, list of answers, answer hashes, the hidden message spelled by the highlighted cells, or the
    final phrase. There is no answer check of any kind, so nothing needs the answers. Do not invent
    sample words to type into the grid in docs, briefs, tests or screenshots committed to the repository;
    use neutral filler such as repeated "A" or "QWERTY" when a filled state must be shown.

S4. The light lies, on purpose. The organizer's words, verbatim (one word elided so that this public
    file shares no word with the private solution):
    > "la casella della lettera si illumina anche se la parola è sbagliata cosi da rendere […] ancora piu difficile"
    > "quando la parola è completa"
    - A highlighted cell lights up (warm light, short flicker, its index 1-31 shown in the corner) as soon
      as every cell of its word holds a letter, right or wrong.
    - It switches off again if a letter of that word is deleted.
    - The index number is shown only while the cell is lit, and is not written into the DOM before that.
    - Do NOT add: answer checking, a "verifica"/"rivela" button, a hint, a message bar that collects the
      lit letters, or any text explaining what the numbers mean or that the light does not mean "correct".
      Reviewers must not ask for any of these either.
    - Non-highlighted words never light anything.

S5. Interaction: everything in the reference `app.js` keeps working exactly as is:
    - click/tap a cell selects its word; tapping the active cell again toggles across/down;
    - typing writes and moves forward inside the word; Backspace clears the current cell or moves back
      and clears; Delete clears the current cell; arrows move, and an arrow perpendicular to the word
      switches direction first; Tab / Shift+Tab next/previous word; Enter next word; Space toggles direction;
    - several letters in a single `input` event (paste, swipe typing, suggestions) are ALL written in order;
    - accented letters normalised (È -> E); anything outside A-Z ignored;
    - clicking a clue selects its word at its first empty cell;
    - a sticky bar shows the current clue ("12 orizzontale" plus the clue and its length);
    - clues of completely filled words are dimmed;
    - selecting a cell scrolls only the grid frame and the clue column, never the whole page.
    Change `app.js` only where the repository or the new look requires it (for example a class name
    hook), and say why in the report. Its logic stays.

S6. Mobile: works at 375 px wide with no horizontal page scroll; the grid scrolls inside its own frame.
    Cells about 27 px or larger; zoom - and + buttons available. Typing goes through one hidden input with
    a zero-width sentinel, placed over the active cell, `font-size: 16px` so iOS does not zoom.

S7. Saving: letters saved in `localStorage` under the key `cruciverba-finale-v1`, wrapped in try/catch so
    the page still works when storage is blocked. "Cancella tutto" asks
    `Cancellare tutte le lettere dello schema?` before clearing.

S8. Look and copy. OVERRIDE by the organizer: the reference's "night facade" look (Big Shoulders Display,
    Literata and its colour tokens) is replaced by the site's Stranger Things / Sottosopra identity
    (tokens, fonts, background, string lights) as defined in the repository's design reference.
    The metaphor of a highlighted cell "turning on" when its word is complete stays: it is the heart
    of the page. The Italian copy stays verbatim:
    - Title "Cruciverba", subtitle "Sesta notte. L'ultima."
    - Initial bar text "Tocca una casella per iniziare."
    - Headings "Orizzontali" and "Verticali"
    - Button "Cancella tutto"
    - Keep `noindex, nofollow` robots meta and full `prefers-reduced-motion` support. Any flicker stays
      short and photosensitivity-safe.
    - The grid must stay legible and playable for a long session on a phone at night: letters, clue
      text and the active word must be clearly readable over any background effect.

S9. Fit the repository: plain static GitHub Pages site (`.nojekyll`, no build step). The new files live
    under `c/`; bump `?v=` cache-busting on any shared CSS/JS that changes. Do not link the page from
    anywhere.

## Assumptions (regia)
- A1. "A tema Stranger Things" means the site's own Sottosopra identity (S8). The repository's hard
  constraint stands: no show logo, title-card composition, characters, names or imagery, and the
  words "Stranger Things" never appear in the page, its comments or its files.
- A2. `c/app.js` ships byte-identical to the reference. Everything the look needs is reachable
  through the classes and ids `app.js` already produces (listed under Contracts), so no hook is
  justified. If a builder finds a real blocker, they stop and report the exact one-line diff and
  why; they never change sizing constants, timings, keys, storage, copy or flow.
- A3. `<title>` stays "Cruciverba" as in the reference (the page is openly a crossword; the
  siblings' "Caccia al Tesoro" title hides content this page does not need to hide).
- A4. No link back to the hunt, no `<noscript>` text, no new functional copy: the reference has
  none, and S8 freezes the copy.
- A5. Every lit cell uses the same warm amber. Per-index colours would be read as a verdict
  (red = wrong) on a page whose light must say nothing.
- A6. Highlighted cells stay indistinguishable from the others until they light (as in the
  reference). Marking them in advance would change the game.

## Out of scope
- Any change to the crossword's behaviour, layout, clues or copy (S2, S5, S7, S8). `c/puzzle.js`
  and `c/app.js` are copies, not sources to edit.
- Answer checking, hints, reveal, a lit-letter collector, a counter or progress of lit cells (no
  "N/31", no wire of 31 bulbs), any text about what the light or the numbers mean (S4).
- Linking `/c/` from anywhere; the QR / short link.
- `upside.js`, `shadows.js`, `crystal.js`, `lights.js`, `motion.css`, `style.css`, the root
  `index.html` and `app.js`, `puzzles.json`, `apps-script/`, media, `/periodica/`, `/arancione/`.
  `assets/hidden.css` stays as it is (see Contracts).
- `tools/preview/*` (owned by nobody): the harness only has the empty `c` state; filled, lit and
  active states are probed with scratch scripts in `.preview/<role>/`.
- Sound, vibration, cross-device sync.

## Constraints that matter here
- Mobile first: 320-430 px, one thumb, at night, possibly 30-60 minutes of play. No horizontal page
  scroll at 320 or 375; the grid scrolls inside its frame; cells 27 px at 375 (app.js computes
  `--cell`; CSS must not fight it).
- Legibility beats atmosphere (PRODUCT principle 1). Letters, clue text and the active word read
  clearly over the canvas: the board and the clue column sit on panels at >= 0.86 opacity, and
  the sticky clue bar on >= 0.94 because content scrolls under it.
- No `backdrop-filter` on the board, the frame or the clue column: they are large and sit over an
  animated canvas, so a blur would be recomputed every frame on a phone. Static `filter` on the
  title only.
- Contrast: letters >= 7:1 on every tile state (empty, in-word, active, lit); clue text and cell
  numbers >= 4.5:1; tile identifiable against the frame and focus/active rings >= 3:1 (WCAG 1.4.11).
- `prefers-reduced-motion`: no flicker, no entrance, no transitions; lit cells shown lit at once.
- Photosensitivity: no element flashes more than 3 times in any second.
- Never the show's title card: "Cruciverba" is one line, letters all the same size, no bars or box
  framing the word, no Benguiat-like face. Fraunces only.
- Files: plain HTML/CSS/JS, no build, no dependencies. Code comments in English, short, why.
- S3 everywhere: probes and screenshots use only "A" repeated or "QWERTY". Never type, write or
  guess a real word, and never write down which letters the lit cells spell.

## Art direction

**Thesis: the wall of lights, last night.** The crossword is a wall of dark glass panes in the
Sottosopra. Behind 31 of them hangs a bulb nobody can see. When a word is complete, its bulb comes
on behind the pane: warm, faltering for a moment, then steady, a small number appearing in its
corner. It comes on for any complete word, right or wrong, and the same way every time it comes
on (first lighting or after a correction: see L6). The rest of the page is cold and still,
so that the only warm things on screen are the bulbs the player has switched on. The air (ash,
storm, vines) lives around the board, never on it.

**Signature moment: a bulb comes on behind the pane** (the S8 heart). On completion the pane goes
from cold glass to amber light from within: a hot pale core, amber body, darker amber rim, a glow
spilling about 0.6 cell onto the neighbours (lit cells sit above them, `z-index: 1`). The letter
turns to dark ink; the index appears bottom-right in dark ink. The switch-on uses the beats of the
site's flicker rhythm with shallow dips (0 -> 1 -> 0.86 -> 1 -> 0.93 -> surge -> 1; revised by
rifinitura from 0.2 / 0.6 so it can restart on every lighting without flashing, L6). Then it
holds, steady, for the whole session: no
breathing, no falter, no reaction to lightning. A bulb that wavers later would be read as "this one
is wrong".

**Second moment: the lights remember.** A returning player reloads the page: the bulbs they had
lit come back on together in one soft rise after the entrance. One smooth rise, no flicker, never
staggered by index (an order 1..31 would be an explanation of the numbers, forbidden by S4).

**Masthead.** "Cruciverba" as the site's red outlined neon (Fraunces 900, SOFT 100, WONK 1,
`-webkit-text-stroke` in `--neon-edge` over a 0.1 fill, glow as stacked `drop-shadow`s, as in
`style.css` `.title-neon`), one line, left-aligned, with the rift horizon hairline under it
(`.title::after` in `style.css`). No upside-down reflection here: it costs height on a phone, and
it is the main site's own sign. Subtitle "Sesta notte. L'ultima." in Special Elite, `--light-text`.
One bulb, the site's mark, hangs from the top edge of the screen at the right end of the masthead
on its cord, reusing `hidden.css` `.notice-lamp` as it is (its warm-up and breathing are already
there): it costs no height on a phone. One bulb only: in a treasure hunt every countable decoration
becomes a clue, and this page must not offer false ones. Budget: masthead <= 150 px tall at 375,
<= 140 px at >= 960 (app.js's desktop fit assumes about 210 px above the frame for masthead + bar).

**Board** (`.play`). A dark glass panel like the sibling pages' notice: `--panel` raised to
>= 0.86, red hairline `--panel-edge`, the rift's light line along the top edge. Inside:
- The current-clue bar (sticky): opaque dark glass, red hairline under it. `.current-ref`
  ("12 orizzontale") in Special Elite, `--light`; `.current-text` in IBM Plex Sans 500, `--text`.
- The frame (`#viewport`): the void behind the wall, near black (about `rgba(3, 4, 9, 0.82)`).
  Vines (the `--tex-vines` masks from `hidden.css`) creep in from two corners of the frame, static,
  behind the tiles: they show only through the holes of the free-form grid, never over a tile or a
  letter. Thin dark scrollbars (`scrollbar-color`).
- Tiles (`.cell`): cold glass, fill about `#1c2233`, a top-lit hairline about `#5d6578` (>= 3:1
  against the frame), radius 3 px. Letters in Fraunces 800, SOFT 100, `--text`: the same painted
  hand as the alphabet wall on the login. Check them at 20 px cells (desktop) and 27 px; if any
  capital is ambiguous there, switch letters to IBM Plex Sans 600 and say so. Cell numbers `.num`
  and the lit index `.mark` in IBM Plex Sans 600, tabular figures (Special Elite is unreadable at
  8 px).
- The active word (`.in-word`): the flashlight of the rift on the wall, tile tinted deep red
  (about `#3b1a24`) with a faint inner red edge. The active cell (`.is-active`): a 2 px `--light`
  inner ring; it is also the keyboard focus indicator, since `#keys` is invisible. Active and lit:
  a 2 px dark-ink inner ring inside the amber, glow kept.
- Tools: "-" and "+" as square ghost controls (44 x 44 min, `--field-edge` border, `--text`).
  "Cancella tutto" right-aligned, quiet ghost in `--muted`: the destructive action is never the
  loudest thing on the board, so not the red primary.

**Clues** (`.clues`). On a panel at >= 0.86. Headings "Orizzontali" / "Verticali" in Fraunces 650
SOFT 100 WONK 1 (as `.notice-title`) with a short rift hairline. Rows: `.clue-num` in Special
Elite, `--light`; `.clue-text` in IBM Plex Sans, `--text`; `.clue-len` in Special Elite, `--muted`.
Active row: 3 px `--light` left edge on `rgba(var(--light-rgb), 0.12)`. Filled row (`.is-filled`):
text and number in `--muted` (still >= 4.5:1; never opacity, never strike-through, never amber:
"filled" is not "lit" and not "right").

**Layout.** Phones: masthead, board, clues stacked. >= 960 px: board left, clue column right
(22 rem), the clue column sticky with its own scroll; >= 1360 px: clue column 38 rem in two
sub-columns. Same structure as the reference, because `app.js` depends on it (Contracts).

**Tokens.** `hidden.css` gives `--abyss`, `--panel`, `--panel-edge`, `--light`/`--light-rgb`,
`--wake`, `--text`, `--muted`, `--bulb-*-rgb`, `--display`, `--body`, the textures and
`--ease-out`. `c/cruciverba.css` adds, mirroring `style.css` values: `--type` (Special Elite stack),
`--neon-edge` #ff9488, `--neon-core` #ffe3dc, `--light-text` #ffd7a8, `--field-edge` #646c7e,
and page tokens `--tile`, `--tile-edge`, `--tile-word`, `--lit-rgb` (= `--bulb-amber-rgb`),
`--lit-ink` (about #1d1405, 10:1 on amber), `--column` (see Contracts). Bulb colours only for
light, never for text. Fonts: the hidden pages' pinned request, nothing else:
`https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,72,400..900,0..100,0..1;1,72,400..600,100,1&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Special+Elite&display=swap`

**Motion.** Entrance once: the title's neon warms up (flicker, <= 900 ms), the board and clues fade
in (opacity only, <= 450 ms), then the remembered bulbs rise. The switch-on of a bulb: 600-760 ms,
two partial dips, a small surge allowed at the end (`--lamp` slightly above 1) before settling.
Selection: `background-color` transitions <= 120 ms on `.cell` and `.clue` only. Nothing idles in
the grid. The page ignores `data-storm`. Reduced motion: none of it; final states at once.

## Contracts between agents

**Frozen DOM API (from `app.js`; never rename, never restructure around it).**
- Ids: `grid`, `viewport`, `keys`, `current-ref`, `current-text`, `clues-across`, `clues-down`,
  `zoom-in`, `zoom-out`, `clear`. Class `.clues` on the clue section (`querySelector(".clues")`).
- Built by `app.js`: `.cell` > (`.num` optional) `.letter` `.mark`; `.clue` > `.clue-num`
  `.clue-text` `.clue-len`. State classes: `.cell.in-word`, `.cell.is-active`, `.cell.is-lit`,
  `.cell.switching-on`, `.clue.is-active`, `.clue.is-filled`. Inline on `#grid`: `--cell`, `--gap`,
  `grid-template-columns/rows`. All cell geometry is sized from `var(--cell)`.
- `.mark` is empty until its cell lights; no CSS may show anything in it or in an unlit
  highlighted cell (no `::after` content, no `attr()`), and no class may mark highlighted cells.
- `.switching-on` stays on the cell after the animation; `app.js` removes it, forces a reflow and
  adds it again on every new lighting. Cells lit on load (restore) get `.is-lit` without it.

**Geometry (CSS must keep `app.js` exact).**
- `.grid` is `position: relative`, `width: max-content`; `.cell` is positioned relative to it:
  `#keys` is moved with `translate(offsetLeft, offsetTop)` of the active cell.
- `.keys` exactly as the reference: absolute at 0,0 of `.grid`, one cell in size, `opacity: 0`,
  `font-size: 16px`, `padding: 0`, `border: 0`, `caret-color: transparent`, `pointer-events: none`.
- `#viewport` is the grid's scroll container (`overflow: auto`, `overscroll-behavior: contain`);
  phones keep a max-height around 70vh. Its padding is read by `resize()`, so keep it modest
  (about 1 rem) and symmetric. Add `scroll-margin-top` equal to the sticky bar's height, so the
  clue-tap `scrollIntoView` does not leave the first row under the bar.
- Breakpoint: the two-column layout switches at exactly `min-width: 960px` (`app.js` uses
  `matchMedia("(max-width: 959px)")`). At >= 960 `.clues` is its own scroll container
  (`max-height` + `overflow: auto`); below it must not scroll, so the page stays on the grid.
- No `overflow` other than `visible`/`clip` on `.play`, `.board`, `main` (the sticky bar needs it).
- No transforms or transform animations on `.play`, `#viewport`, `#grid`, `.cell` (keeps
  `getBoundingClientRect` in `scrollWithin` and the input overlay exact). Opacity only.
- `touch-action: manipulation` on `#viewport`, `.cell`, `.tool`, `.clue`, so a second tap on the
  active cell toggles direction instead of zooming on iOS.

**The lamp (identita draws, motion animates).** `c/cruciverba.css` registers
`@property --lamp { syntax: "<number>"; inherits: false; initial-value: 0; }` and draws the lit
pane only under `.cell.is-lit`, entirely from `--lamp` (0 = cold glass, 1 = lit, > 1 surge):
background, glow radius and alpha, ink colour. `.cell.is-lit { --lamp: 1 }` is the final state.
Unlit cells carry no shadow at all. `c/cruciverba-motion.css` animates only `--lamp` (and the
title's/board's opacity), with `backwards` fills, so that when an animation ends the page is
exactly what `cruciverba.css` draws:
- `.cell.is-lit.switching-on`: the switch-on.
- `.cell.is-lit:not(.switching-on)`: the restore rise (on load only in practice: during a live
  lighting this selector matches only inside `app.js`'s forced reflow and is replaced at once).

**Files and load order** (`c/index.html`): head as the sibling hidden pages (charset; viewport
with `viewport-fit=cover`; robots `noindex, nofollow, noimageindex`; googlebot; referrer
`no-referrer`; `theme-color` #06070d; `color-scheme` dark; `<title>Cruciverba</title>`; the
`../assets/` icons; the `js` class script; preconnects; the pinned fonts URL), then stylesheets
`../assets/hidden.css?v=20261107` (unchanged), `cruciverba.css?v=20261107`,
`cruciverba-motion.css?v=20261107`. `<body class="cruciverba">`: `canvas#sea.sea`,
`div.ambience` (both `aria-hidden`), the masthead, `main.board`. Scripts at the end of body, in
this order: `puzzle.js?v=20261107`, `app.js?v=20261107`, `../upside.js?v=20261106` (the game is
built before the air starts). A comment says the page is reached only by its QR code and is never
linked from the site.

**Shared shell.** `assets/hidden.css` is shared with `/arancione/` and stays untouched: override
its `body` grid centring under `body.cruciverba` in `cruciverba.css`. If a change there becomes
unavoidable, `/arancione/` must stay pixel-identical and both pages get a new `?v=`.

**Background.** `upside.js` runs unchanged with the default Sottosopra theme (no `setTheme`, no
`bloom`, no `flash` from this page). It reads `--column` with `parseFloat`, so `cruciverba.css`
sets it on `:root` at >= 960 px to the board's max width as a plain px length (for example
`1536px` for 96 rem), never rem, `calc()` or `min()`; vines then stay in the margins.

## Ownership for this request

| Member | Owns for this request | Starts |
|---|---|---|
| `identita` | `c/index.html` (its row), and, as the hidden pages' look: `c/cruciverba.css` (new), `c/puzzle.js` (new, byte copy), `c/app.js` (new, byte copy, logic frozen), the empty stub of `c/cruciverba-motion.css` | 1 |
| `motion` | `c/cruciverba-motion.css` (content) | 2, after identita's report |
| `critica`, `accessibilita` | read-only review | 3 |
| `rifinitura` | every file above, to apply confirmed findings | 4 |

`atmosfera`, `varco` and `componenti` are not needed: the canvas, the loader and the main site's
UI system are untouched. `odd/team-sottosopra.md` still says the hidden page `c/` "renders its
notice": the main session updates that line when it commits (no builder owns it).

## Verification
- `node --check c/app.js c/puzzle.js`.
- Byte identity with the reference (copy with `cp`, never retype: `app.js` holds a literal
  zero-width space as its sentinel). SHA-256 must be:
  `c/puzzle.js` 46842b767928b8d22a5d77708c0066a50b63eecda85b6e6c44c767f25cef0bc4,
  `c/app.js` 3ca80a2e00005177bb5072e564d98330e0e65896d607ebdcb8c8e73bd81099d8.
- Harness: `node tools/preview/shoot.mjs --out .preview/shots/<role> --states c --widths 320,375,1280`
  and the same with `--reduced --widths 375`: `consoleErrors` and `pageErrors` empty,
  `overflowPx` 0. If `hidden.css` changed: also `--states arancione,arancione-out --widths 390`.
- Probe (scratch script in `.preview/<role>/`, Playwright via `../../tools/preview/playwright.mjs`),
  filler only. Seeding: in the page, walk `window.CROSSWORD.words` (row, col, direction, length) and
  write "A" into every cell of the chosen words; store `{ "r,c": "A" }` in
  `localStorage["cruciverba-finale-v1"]`; reload. Shots (open every PNG):
  `c-active-375` (empty grid, a clue tapped), `c-lit-375` and `c-lit-1280` (8 highlighted words
  filled with "A", one word active), `c-scrolled-375` (page scrolled 300 px: sticky bar holds),
  `c-zoom-375` (two taps on +), `c-lit-375-reduced`, and 959 / 960 px wide (layout switches with
  `app.js`). Assertions:
  - empty load: no `.cell.is-lit`, every `.mark` empty;
  - typing "A" x length into a highlighted word through `#keys` lights its cell and its `.mark`
    shows that highlight's index; one Backspace switches it off and empties `.mark`;
  - one `input` event carrying "QWERTY" after the sentinel writes Q, W, E, R, T, Y in order;
  - `--cell` on `#grid` is 27px at 375; `scrollWidth - innerWidth` is 0 at 320 and 375;
  - tapping a cell far inside the frame leaves `window.scrollY` unchanged;
  - the "Cancella tutto" dialog message is exactly `Cancellare tutte le lettere dello schema?`;
  - with `Storage.prototype.getItem/setItem` made to throw (init script), the page builds and
    typing works with no page errors.
- Contrast numbers reported for: letter on each tile state, `.num` on tile, tile edge vs frame,
  active ring, ink on amber, filled clue text on panel.

## For the reviewers
Look at legibility over a long night session on a 375 px phone, the switch-on moment, the
restored bulbs, the sticky bar, desktop at 1280, reduced motion and forced colours (lit cells must
stay distinguishable, for example with `forced-color-adjust: none` or a `Highlight` outline).
Per S4, never ask for an answer check, a verify/reveal button, a hint, a collector of lit letters,
a lit counter, or any text explaining the numbers or saying the light does not mean "correct".
Never request changes to `puzzle.js`, the clues, or `app.js` logic.

## Tasks
- [x] T1 identita (phase 1): copy `puzzle.js` and `app.js` (hash-checked), build `c/index.html` and
      `c/cruciverba.css` (static look, `--lamp` drawing), create the empty `c/cruciverba-motion.css`
      stub; harness + probe; report contrast numbers and anything motion must know. (L3)
- [x] T2 motion (phase 2, after T1): `c/cruciverba-motion.css`: switch-on, restore rise, entrance,
      selection transitions, reduced motion; flash-count and timing probe. (L4; switch-on revised in L6)
- [x] T3 critica + accessibilita: independent reviews. (L5)
- [x] T4 rifinitura: apply confirmed findings. (L6)
- [x] T5 main session: final harness run, update the `c/` line in `odd/team-sottosopra.md`, commit. (L7)

## Log
- L1 (2026-11-07, organizer, verbatim): "Utilizza i vari agenti per rendere la pagina cruciverba a
  tema stranger things. La pagina cruciverba sarebbe quella "/c"" (the message also attached two
  files from the organizer's Downloads folder; the team never opens them).
- L2 (2026-11-07, regia): baseline shots in `.preview/shots/regia/before/` (`c` shows "Ancora
  sigillato" at 375 and 1280, no errors, 0 px overflow). Reference measured with filler only:
  392 cells, `--cell` 27px at 375 and 20px at 1280, 0 px overflow. Builders: identita, motion.
- L3 (identita): `c/puzzle.js` and `c/app.js` copied with `cp`, byte-identical (hashes above), no
  hook needed. `c/index.html` rebuilt on the siblings' head (the placeholder is gone);
  `c/cruciverba.css`: red Fraunces neon masthead on the horizon hairline with hidden.css's single
  `.notice-lamp`, 0.9 glass panels, opaque sticky bar (`--bar-h` 70 px under 640, 52 above), void
  frame with vines behind the panes, cold glass tiles, red active word, `--lamp`-drawn amber lit
  pane, forced-colours mapping. Probe 45/45; harness 320/375/1280 + reduced: no errors, 0 overflow;
  contrast all above the brief's floors.
- L4 (motion): `c/cruciverba-motion.css`, all inside `prefers-reduced-motion: no-preference`:
  `c-neon-on` (title, opacity, on hidden.css lamp-on's beats), `c-fade-in` (`.play`, `.clues`),
  `c-lamp-on` (switch-on, 720 ms), `c-lamp-rise` (restore, 700 ms from 450 ms, never staggered),
  120 ms background-color selection. Flicker played once per pane per visit to stay at 3 dips/s or
  fewer on quick corrections (flash probe on real pixels).
- L5 (reviews). critica: reads as the Sottosopra, integrity holds; P1 a pane relit after its first
  flicker snapped on with no flicker (history readable as "now it is right"); P2 index and rim at
  `--lamp` 0 during the restore delay, lit index running into wide letters at 20 px, desktop tools
  below the fold at 1280x860 with a 16 px frame scroll; five P3. accessibilita: no P0/P1; P2 first
  Tab lands on an invisible focus, the sticky bar can hide the active cell (app.js), clue rows 40 px;
  P3 button cascade, tagline under lightning, smooth scroll under reduced motion (app.js), Tab
  trap by S5, perf (no change), tile-edge margin (guard only).
- L6 (rifinitura). Fixed: P1, switch-on now `.cell.is-lit.switching-on` and restarts on every
  lighting, dips 0.86 / 0.93 (under 0.1 relative luminance on real pixels: a plain completion 0
  flashes, one correction 1, two quick corrections 2, at 375 and 1280; was 2 / 3-4); restore rule
  no longer carries `c-lamp-on -1s`. Index, its knock-out, the ink and the letter's room all ride
  `--lit-ramp` (from `--lamp`), rim mixes from `--tile-edge`: nothing shows before the light. Lit
  index on a knock-out of the pane's colour, lit letter steps down on panes under 27 px. Desktop:
  tools in the bar row (44 px), viewport padding 0.5 rem, frame and clue column end on the same
  line above the fold at every size measured 960x860 to 1920x1080 (no frame scroll at 1280x860);
  two-line bar at 960-1279 and 1360-1499 where most clues wrap beside the tools. First-Tab ring on
  the frame; clue rows 44 px min; `:where(.cruciverba) button`; clue baseline; bar placeholder
  centred; masthead on x=12 like the panels; hover only on hover devices; tagline dark halo.
  `?v=20261107b` on both stylesheets. Skipped: red ring on a lit pane of the active word (red
  framing a bulb as it comes on can read as a verdict, A5; regia's call); app.js-only items
  (bar hiding the active cell, clue-tap condition, smooth scroll under reduced motion, Tab trap):
  logic frozen, organizer's decision; lamp breathing count (hidden.css reused as is). Checks:
  hashes unchanged, `node --check` app.js/puzzle.js, probe 45/45, flash probe, audit, harness
  320/390/1280 normal and reduced (102 shots, 0 errors, 0 overflow), rooms p3/p4/p5 and
  periodica/arancione unchanged.
- L7 (2026-11-07, main session): T5. app.js and puzzle.js byte-identical to the reference (cmp).
  Functional check served like GitHub Pages (repo under /caccia-al-tesoro-26/, /c -> 301 -> /c/):
  35/35 pass: /c and /c/ load, /, /periodica/, /arancione/ load; copy and robots verbatim; no index
  in the DOM before lighting; 1 verticale completed lights with 31; 62 orizzontale filled with QWERTY
  lights with 15; one Backspace turns it off; reload keeps letters and lights; multi-letter input
  writes every letter; exact confirm text; cell click leaves page scroll alone; no console errors;
  at 375: no page overflow, grid scrolls in its frame, clues below, 27 px cells, 16px input, zoom.
  Leak check (whole words, case-insensitive) of every added or changed file against the private
  answer list and the hidden-message words: 0 matches, after eliding one word from the S4 quote.
  The `c/` line in odd/team-sottosopra.md updated.
