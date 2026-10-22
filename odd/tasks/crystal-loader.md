# Feature: crystal-loader

## Objective
Replace the flat progress bar shown while a riddle video downloads and decrypts ("Il video sta affiorando…") with an interactive 3D loading object: a faceted crystal (icosahedron) drawn on a canvas, which the player can spin with a finger while waiting. Download progress is readable in the object itself (facets light up one by one); decryption makes it breathe faster and the finished state cracks it open in a bloom of light before the video appears.

## Why
The user asked (2026-10-22) for a 3D, possibly interactive, loading animation instead of the bar, so the player has something to do while a ~90 MB video arrives on a phone. The site's thesis is "darkness hides, living light reveals": a crystal that fills with light is the reveal metaphor made tangible.

## Scope / constraints
- Static site, no build step, no dependencies: plain canvas 2D with hand-written 3D projection (painter's algorithm), in a new `crystal.js` module exposing `window.Crystal` like `plankton.js` / `shadows.js`.
- Shared by every video riddle (p2 night sea, p3 green, p4 tarot, p5 ombre): colours come from the theme tokens on `body` (`--light-rgb`, `--wake-rgb`, `--foam-rgb`, `--abyss`), read at mount.
- Hook point: `progressMeter()` in `app.js` (used by `renderLockedStage` for the video, and by `renderDownload` for files). The video stage gets the crystal; the file download keeps its bar.
- Keep the accessible progress semantics (`role="progressbar"`, `aria-valuenow`, textual percent/MB, `role="status"` title) alongside the canvas.
- Interactive: pointer drag rotates with inertia; tap pulses the crystal and calls `Plankton.bloom`; idle slow rotation. `prefers-reduced-motion`: no idle rotation, no inertia, no breathing; facets still fill, drag still rotates, finish is a plain fade.
- Performance: canvas sized by CSS (clamp, ~200 px), DPR-aware, rAF only while the loader is visible and the tab is visible; stops on leave/abort. No horizontal overflow at 320 px.
- UI copy Italian, code/comments English. Other pages and the audio/file flows unchanged.

## Tasks
- [x] T1 — Crystal loader module + wiring + styles (route: delegated writer; triggers: writer (crystal.js, app.js, style.css, index.html) + preparation). Verification: `node --check` on app.js and crystal.js, impeccable `detect.mjs --json` on changed targets, browser check on a video riddle at mobile and desktop widths with the real download, reduced-motion check.

## Acceptance criteria
- On a video riddle the loader shows the crystal; facets lit track download percent; decrypt phase and finish bloom visible; video mounts as before.
- Drag spins the crystal on touch and mouse; tap pulses; nothing scrolls the page unexpectedly during drag.
- Themes p2/p3/p4/p5 each tint the crystal from their own tokens.
- Reduced motion path works; no rAF running when the loader is hidden.
- `detect.mjs` clean on changed targets; no console errors.

## Delivery strategy
ask-on-risk (forecast ~400 authored lines)

## Progress / evidence
- Branch `feat/crystal-loader` from `main` at dd6af03.

- T1 (delegated writer, ~680 authored lines: the hand-written 3D renderer, interaction, visibility gating and reduced-motion path live in one module, nothing padded): `crystal.js` new (589 lines), `app.js` +52/−6, `style.css` +36/−1, `index.html` +1. `node --check app.js` / `crystal.js`: ok. `detect.mjs --json` on the four targets: `[]` (degraded: regex fallback, html/css parsers missing). Writer's headless harness: facets fill bottom-up on all four themes, decrypt breathing, reduced-motion fill, drag/tap, finish 690 ms, destroy leaves 0 canvases, no overflow at 320/1280 px; one bug fixed (halo capped at half canvas). Parent spot check in Chrome on the served harness: night sea at 85% mostly lit with a dark crown, tarot drag spins the crystal, decrypt and finish resolve, ombre reads grey while sealed (incumbent cold-lamp saturation blend on the card, same as the old bar). Not verified: real download/MSE path (needs the backend key), real touch inertia feel.
- Test-first exception: no test runner in the repo (static site); checks are syntax, detector and browser inspection.
- Engram mirror: PENDING (the Engram hook refused host session registration in this session; resync when available).

- Work-unit commit 8467521 on `feat/crystal-loader`. RDD assess: medium, review due (slice budget reached, 724 lines); consent envelope relayed, user chose "Salta questa volta" (declined, candidate-scoped). Merged into `main` and pushed on the user's request (2026-10-22).

## Next step
Done. Watch the first real download on a phone (touch inertia feel, MSE path on p5).
