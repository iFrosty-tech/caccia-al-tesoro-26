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
- [ ] T1 — Phase 1 parallel: atmosfera, identita, varco, componenti.
- [ ] T2 — Phase 2: motion (lights wall, lights progress, loaders, entrance, route glitch, save).
- [ ] T3 — Phase 3: critica (visual/UX) + accessibilita (a11y, perf, regressions) reviews.
- [ ] T4 — Phase 4: rifinitura applies confirmed fixes; orchestrator final check, commits, push.

## Progress / evidence
- Branch `claude/zealous-cray-cxqtfa` from `main` at 799b272.
- Baseline screenshots taken with the harness before any change (night-sea look).
