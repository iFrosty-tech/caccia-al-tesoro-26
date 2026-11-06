# Feature: upside-down-redesign ("Il Sottosopra")

## Objective
Re-skin the whole site for the hunt's finale: the site *is* the other side, an "Upside Down"
inspired world (dark, cold, decayed air full of floating ash, a red storm pulsing overhead,
fragile artificial light: string lights, flashlights, red lightning). Every surface is up for
review: structure, components, animation, background, identity assets.

**Out of scope in this phase:** the final riddle itself. `puzzles.json`, `apps-script/`,
`video/`, `audio/` and `tools/` are NOT touched. The redesign must simply make a future sealed /
flag-gated riddle with no `theme` field look its best (the preview harness injects a fake `p6`
for that, in memory only).

## Hard constraints (unchanged from the product)
- Plain static HTML/CSS/JS, no build step, no npm dependencies, GitHub Pages.
- **Behaviour is frozen.** Every element id in `index.html`, every flow in `app.js` (auth,
  save, logout, hash router, timed/flag gates, MSE streaming, protected video guard, resume
  position, downloads) keeps working exactly as before. Visual hooks may change; logic may not.
- Functional Italian copy stays as it is (labels, buttons, statuses, errors, loader texts).
  Purely decorative new elements may carry themed words. Do not invent story/lore.
- No reproduction of the TV show's logo, title card composition (enlarged first/last letters
  joined by bars), characters, names, or imagery. We evoke the *atmosphere* with original work.
  The words "Stranger Things" never appear in the site.
- Mobile first (320–430 px, one thumb, flaky network). Desktop must look intentional too.
- `prefers-reduced-motion: reduce`: no drifting, flicker, glitch, lightning or entrance motion;
  everything readable immediately; canvases render one still frame.
- Photosensitivity (WCAG 2.3.1): no element flashes more than 3 times per second; lightning
  is a low-luminance, short, rare tint, never a full-screen white strobe.
- Contrast: body text ≥ 4.5:1, large text / UI boundaries / focus rings ≥ 3:1.
- Performance: one rAF loop per canvas, DPR capped (≤ 2, ≤ 1.5 on small screens), particle caps,
  paused when the tab is hidden; no animated `filter`/`backdrop-filter` over large areas.
- The three past riddle "rooms" (`theme: "green"` p3, `"tarot"` p4, `"ombre"` p5) keep their own
  identity and must still render correctly on top of the new base (they override tokens and use
  `body::before` / `body::after` — the global layer must not use those pseudo-elements).
- The hidden page `periodica/` keeps its behaviour and joins the new look.

## Art direction

**Thesis.** "Il Sottosopra": the same treasure hunt seen from the other side. Darkness is cold
blue-black and full of floating ash; the only lights are fragile and artificial (string bulbs,
a red rift glow, red lightning inside storm clouds). Riddles are messages that cross the barrier.

**Signature moments**
1. *Title in red neon, and its reflection upside down.* "Caccia al Tesoro" set in Fraunces
   (heavy, soft, wonky), red outlined neon with glow, warming up with a failing-neon flicker on
   entrance. Beneath it a dark, wavering, upside-down reflection of itself (mirror + mask fade):
   the world mirrored. NOT the show's logo composition.
2. *Alphabet wall.* On the login screen a compact wall of painted letters A–Z, each with a
   string-light bulb above it. Idle: a bulb flickers now and then. While the player types the
   **username**, the bulb over each typed letter flashes. It NEVER reacts to the password fields.
   Decorative: `aria-hidden="true"`.
3. *String of lights = progress.* On the index, "Indizi raccolti" is a wire with one bulb per
   riddle: lit (in bulb colours) when answered, dark glass when not; a newly saved one
   flickers on.
4. *Sealed = the gate.* A sealed/locked riddle is behind the rift: organic red cracks / membrane
   pulse slowly; "Sigillato" reads like a red rubber stamp. The final riddle will appear this way.
5. *Ash you can stir.* The background is alive: ash/spores drifting upward through layers of
   fog, a storm sky with rare red lightning, dark vines creeping in from the edges; a finger or
   cursor pushes the ash away.
6. *Save = the lights answer.* Saving an answer: bulbs chase, a red shock ring + ash burst
   (`Upside.bloom`), the panel flickers bright and settles.

**Palette (CSS tokens on `:root`).** Keep every existing token NAME (themes, `crystal.js` and
`shadows.js` read them); remap their values. Indicative values (componenti tunes for contrast):
- `--abyss` #06070d (void) · `--deep` #0e1220 · `--ghost` #232a3d
- `--panel` rgba(12,15,26,.74) · `--panel-edge` rgba(255,59,48,.20) (red hairline)
- `--field` rgba(5,6,12,.72) · `--field-edge` ≥ 3:1 vs panel (≈ #646c7e)
- `--wake` #a3121a / `--wake-bright` #e3262e — primary action (deep rift red; white text ≥ 4.5:1)
- `--light` #ff4a3d — the rift glow (focus ring, active marks); `--light-rgb` 255,74,61
- `--text` #ece6dd (warm paper white) · `--muted` #a7adbb · `--placeholder` ≥ 4.5:1
- `--error`: must be distinguishable from the red accent (lighter salmon + icon/shape cue)
- New: bulb colours `--bulb-red` #ff3b30, `--bulb-amber` #ffb627, `--bulb-green` #39d98a,
  `--bulb-blue` #3d8bff, `--bulb-pink` #ff5fa2 (only for lights, never for text);
  `--storm` #3a4a63 (lightning-lit cloud), `--ash-rgb` 184,196,214.
- Success = a warm lit bulb (amber), not green-on-red.

**Type.** Max three families, one Google Fonts request:
`https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..900,0..100,0..1;1,9..144,300..900,0..100,0..1&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Special+Elite&display=swap`
- `--display`: Fraunces (titles, riddle titles, big countdown; use `font-variation-settings`
  "SOFT" 100, "WONK" 1, heavy weights for the title).
- `--body`: IBM Plex Sans (body, inputs, buttons).
- `--type` (new): Special Elite — typewritten accents only: eyebrows, labels, statuses, the
  saved answer on tiles, the "when" line of countdowns, stamps. Never for long paragraphs.

**Motion language** (tokens in `:root`: keep `--ease-out`, add `--flicker-steps` etc.)
- *Flicker* (failing bulb / neon warming up): 0 → 1 → .2 → 1 → .6 → 1 over 500–900 ms. Reveals.
- *Pulse* (the rift breathing): 4–6 s red glow in/out. Sealed things, focus halos.
- *Drift* (ash): slow upward float, canvas only.
- *Glitch* (VHS): one 160–220 ms horizontal slice/chromatic offset when the view changes.
- *Lightning*: canvas only, rare (every ~10–25 s), ≤ 2 strikes per burst, low-alpha red/blue tint.
- Reduced motion: none of the above; final states shown at once.

**Global texture.** Film grain + vignette + faint scanlines live on a dedicated element
`<div class="ambience" aria-hidden="true"></div>` placed right after the canvas (never on
`body::before/::after`). Static (or a cheap stepped `background-position` grain); off for
reduced motion if animated.

## Contracts between agents

- **Canvas module** `upside.js` (new, replaces `plankton.js`, which is deleted). Draws on the
  existing `<canvas id="sea">` (id kept). Exposes:
  - `window.Upside.bloom(x, y)` — viewport coords: red shock ring + ash burst.
  - `window.Upside.setTheme(name)` — `""` Upside Down; `"green"`, `"tarot"`, `"ombre"` tint or
    calm the field to suit those rooms (port the old plankton palettes' intent).
  - `window.Upside.flash(strength)` — trigger a lightning burst now (strength 0..1), no-op under
    reduced motion.
  - `window.Plankton = window.Upside` alias (crystal.js and older code call `Plankton.bloom`).
  - Still listens to the `plankton:bloom` window event `{detail:{x,y}}`.
  - Sets `document.documentElement.dataset.storm = "1"` for ~200 ms during a strike, so CSS
    may react subtly (optional for CSS).
- **Script/stylesheet order in `index.html`:** `config.js`, `upside.js`, `shadows.js`,
  `crystal.js`, `lights.js`, `app.js`; stylesheets `style.css` then `motion.css`.
- **Letter wall slot:** `<div id="letter-wall" class="letter-wall" aria-hidden="true"></div>`
  as the first child of `#register-section` (above the `h2`). componenti reserves and sizes the
  slot; motion fills it via `lights.js`.
- **Lights module** `lights.js` (motion agent): `window.Lights` with `wall(el, opts)` → controller
  `{flashLetter(ch), spell(word), destroy()}`, `string(count, litMask, opts)` → element for the
  progress wire, `loader(text)` replacement for the button/status loader. Reduced-motion aware.
- **Crystal** (`crystal.js`) keeps `window.Crystal.mount(container)` and its controller API
  exactly as `app.js` uses it; reads colours from body tokens at mount.

## Team and file ownership

| Agent | Owns (may edit) | Phase |
|---|---|---|
| atmosfera — background FX | `upside.js` (new), delete `plankton.js` | 1 |
| identita — brand assets | `assets/*`, `manifest.webmanifest`, `periodica/index.html`, `periodica/tavola.css` (styles only; `tavola.js` only for the `plankton.js`→`upside.js` reference if any) | 1 |
| varco — download loader | `crystal.js` | 1 |
| componenti — UI system | `index.html`, `style.css`, minimal markup-only hooks in `app.js` | 1 |
| motion — choreography & lights | `lights.js` (new), `motion.css` (new), visual hooks in `app.js` | 2 (after componenti) |
| critica + accessibilita — review | read-only, report findings | 3 |
| rifinitura — integrator | any file above, to apply review fixes | 4 |

Nobody commits, stashes, resets or checks out: changes stay in the working tree and the
orchestrator commits them. Nobody touches files outside their row.

## Verification (every agent, on its own work)
- `node --check` on every changed JS file.
- Preview harness (stubs the backend, logs in a fake player "Undici", injects preview-only p6):
  `cd <scratchpad>/harness && NODE_PATH=$(npm root -g) node shoot.mjs --out <dir> --final
  [--states login,index,p1,...] [--widths 390,1280] [--reduced]` → PNGs + one JSON line per shot
  with console errors, page errors and horizontal overflow. Look at the PNGs.
- Zero console/page errors, zero horizontal overflow at 320/390/1280.
- Themes p3/p4/p5 still look like their rooms; `periodica/` renders its notice.

## Tasks
- [x] T1 — Phase 1 parallel: atmosfera, identita, varco, componenti.
- [x] T2 — Phase 2: motion (lights wall, lights progress, loaders, entrance, route glitch, save).
- [x] T3 — Phase 3: critica (visual/UX) + accessibilita (a11y, perf, regressions) reviews.
- [x] T4 — Phase 4: rifinitura applies confirmed fixes; orchestrator final check, commits, push.

## Progress / evidence
- Branch `claude/zealous-cray-cxqtfa` from `main` at 799b272.
- Baseline screenshots taken with the harness before any change (night-sea look).
- T1 atmosfera: `upside.js` replaces `plankton.js` (deleted). Storm sky with red-lit cloud decks,
  rare lightning (≤ 2 strikes per burst, bursts ≥ 1.5 s apart, no white flash), drifting fog
  thinned over the column, vines growing from the edges (they read `--column`), three depths of
  ash stirred by touch/cursor, `bloom()` shock ring + embers; calmer tinted air for green/tarot/
  ombre; one still frame under reduced motion; `Plankton` alias and `plankton:bloom` kept.
- T1 identita: red C9 string-bulb mark across favicon.svg/32/180/192/512 (maskable safe zone
  checked), og-image.png (one-line neon title over its rippled reflection, 216 KB), manifest
  colours `#06070d`; `periodica/` loads `upside.js`, joins the look via `tavola.css` (glass panel,
  hanging bulb with falter/dark states via `:has()`, chasing loader bulbs); `tavola.js` untouched.
- T1 varco: `crystal.js` is an obsidian shard with glowing fissures; progress is rift light
  rising inside it, decrypt is a lub-dub heartbeat, finish cracks it open (950 ms, bloom at the
  crack). API unchanged, colours from body tokens, reduced motion = still frames.
- T1 componenti: `index.html` + `style.css` rebuilt: neon outlined title with mirrored "Tesoro"
  under a horizon, letter-wall slot, dark glass panels with red hairline and mask vines, salmon
  errors with icon, Special Elite labels, bulb component, overgrown locked tiles, red rubber stamp
  over a pulsing crack for sealed riddles, desktop two-column login / index; rooms kept. app.js
  untouched by componenti.
- T2 motion: `lights.js` (letter wall answering the username only, festoon progress string,
  bulb loaders, amber bulb badge, save chase), `motion.css` (one registered `--lamp` number per
  bulb, neon warm-up, VHS view glitch, tiles flickering on, stamp slam + rift tear, grain crawl),
  guarded visual hooks in app.js (`lights()`, `crossOver()`, `mountLetterWall()`). Flash counts
  ≤ 3/s, password fields never light the wall (probe: ALL PASS), fallbacks tested with lights.js
  missing or throwing. 70/70 harness shots clean.
- T3 critica: verdict "clearly Il Sottosopra, not a recolour"; no P0/P1. P2: unsealing was a hard
  cut, desktop gate undersized, short phones scrolled the sign away on load, login button pushed
  low; P3 polish (when-line wrap, clock centring, vine over the wall, save-status font swap, small
  bulbs on desktop, no hint on the last sealed tile, sea leftovers, OG square crop).
- T3 accessibilita: no P0. Regressions, semantics, reduced motion, hidden tab, wall privacy and
  photosensitivity clean (lightning peak 0.079 vs 0.1 threshold). P1: upside.js quality step stuck
  at 1.25× on a 4×-throttled phone (27 fps). P2: transient page widening during the glitch/stamp,
  red numerals on the canvas < 4.5:1, Fraunces 271 KB. P3: back link halo, seek track 1.6:1,
  blank frame on quality step, forced-colors "al" hidden, Figtree in tavola.js, field focus ring.
- T4 rifinitura (fixes applied, working tree only):
  - upside.js: slow test `workAvg > 7 || (gapAvg > 24 && workAvg > 3)`, settles after 90 frames,
    repaints right after a quality step (no blank frame). 4× throttled phone now reaches 1× (canvas
    390×984); unthrottled phone (2.15 ms/frame, 16.8 ms) and desktop keep full quality.
  - style.css: `main { overflow-x: clip }` under 700 px (per-frame probe: innerWidth stays
    390/320 on #/, p1, p3, p6 and while navigating); `.riddle-position-current` / `.progress-found`
    in `--neon-edge` with a dark halo, halo on position, count and back link (worst p05 now
    6.5 / 7.6 / 7.6 / 5.9, was 3.2 / 1.75 / 3.7 / 4.3); seek track #5f6678→#454b5b; field focus
    ring 2px at .55; save status stays typewriter in every state; login panel keeps only the
    bottom-left vine; phone login: wall rows 2.625rem, letters 1.2rem, tighter gaps (submit bottom
    830→791 px at 390×844, register 932→891); desktop gate: crack box 200 px tall (draws ~500 px
    wide), stamp 3rem, card 56/52 px padding; when-line 40ch ≥ 560 px; long clock box 5.85em
    (measured widest reading 5.82em); forced-colors sign readable; `--tex-rift` redrawn with
    uneven, forking, tapering branches.
  - motion.css: sealing gives way on screen → `.reveal.is-unsealing` tears the loader open from
    the crack line (clip-path, 0.8 s) under a fading white-hot seam, with `Upside.flash` + bloom;
    sealed tiles keep a slow ember in their bulb (5.2 s); desktop string: 48 px wire, 17 px bulbs;
    all off under reduced motion.
  - app.js (visual only): `focus({ preventScroll: true })` on arrival (375×553 no longer opens
    345 px down); "8&nbsp;novembre" kept together in the when-line; `.is-unsealing` + guarded
    flash/bloom in `loadVideo` when the seal was on screen; stale "sea" comment.
  - index.html + periodica/index.html: Fraunces request pinned to `opsz 72`, italic pinned to
    SOFT 100 / WONK 1: 271 KB → 110 KB (title, tiles, tarot italics compared at 2×).
  - Skipped: `tavola.js` Figtree (not in rifinitura's files; falls back to system-ui harmlessly),
    app.js watermark font (SVG image cannot load web fonts), OG square crop (needs regeneration;
    1.91:1 preview is correct), loader copy "affiorando" (frozen functional copy, user's call),
    `wake-gradient` id (decorative, unreferenced).
- T4 orchestrator: `node --check` on every JS file OK; no `plankton.js` reference left; harness
  `--final --widths 390,1280` → 28/28 shots with no console/page errors and 0 px overflow;
  login, login-typing, index, p1-saved, p6 (sealed preview), p4 (tarot room), desktop login and
  the new og-image inspected. `app.js` diff reviewed: visual hooks only (lights, lightning,
  unsealing class, focus without scroll, non-breaking date space), no logic change.

## Next step
Real-phone check by the organizer (frame rate of the storm, letter wall while typing, the
unsealing tear the first time a flag riddle opens). Open decision for the organizer: the loader
copy "Il video sta affiorando…" still speaks of the old sea.
