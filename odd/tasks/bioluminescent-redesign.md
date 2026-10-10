# Feature: bioluminescent-redesign

## Objective
Make the site far more beautiful, mobile-first, with striking animation and an animated background, carrying the hunt's "mysterious and enigmatic" theme.

## Why
The current UI is a neutral form (system font, cream/orange cards). The organizer wants players to feel they entered a mysterious game, mostly on phones.

## Direction (chosen by the user on the impeccable decision page, seed key 5f921f41)
"Mare Bioluminescente": a black night sea that lights up where the thumb touches. Raised for mystery: the dark hides the riddles and light reveals them.
Build path: code-led (no image generation available). Craft bar: impeccable plankton world board/hero.

## Scope / constraints
- Plain static HTML/CSS/JS, no build, GitHub Pages. Keep every element id and all behavior in `app.js` (auth, save, logout confirm, AUTH handling).
- Italian UI copy; do not change factual copy without asking.
- `prefers-reduced-motion`: no animated background motion, no entrance motion. Content visible without JS animation.
- Mobile performance: canvas particle field with capped DPR and particle count, paused when the tab is hidden.

## Tasks
- [x] T1 — Rebuild visual world: `index.html`, `style.css`, new `plankton.js` (animated canvas sea + touch wakes + bloom), small hooks in `app.js` (save bloom, card ignite). Route: delegated (writer trigger: 2+ non-trivial files).
- [ ] T2 — Inspect mobile + desktop screenshots once, fix batch, finish review, DESIGN.md.

## Acceptance criteria
- Animated background visible on login and puzzles views; touch/pointer leaves glowing wakes.
- One orchestrated entrance; riddle cards ignite on reveal; save success blooms light.
- All flows still work: login, register, save, logout, config warning, errors.
- Contrast ≥ 4.5:1 for body text; focus rings themed; reduced motion respected.

## Delivery strategy
single-pr (forecast ~500 authored lines, mostly one new world; ask-on-risk not triggered as one coherent visual unit).

## Progress / evidence
- T1 (delegated writer): `node --check app.js` / `plankton.js` pass. Headless captures `.impeccable/review/{mobile,mobile-puzzles,desktop}.png` viewed by writer and parent: title in light, wake curve, login in thumb zone, riddle cards lit. Detector `[]` but ran degraded (regex-only, no contrast eval). Test-first exception: no runner, purely visual change.
- Deviations: particle density area/700 (caps 700/1100), canvas +140px on phones for URL-bar retraction, passive touch listeners, Registrati styled secondary, h1 aria-label with aria-hidden line spans.
- Not verified: real-phone frame rate, autonomous wake speed (headless shows a long diagonal streak), save bloom, reduced-motion path.

## Next step
T2: real-phone check by the user, then finish review and DESIGN.md.
