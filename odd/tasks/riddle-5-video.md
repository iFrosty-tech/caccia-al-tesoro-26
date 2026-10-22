# Feature: riddle-5-video

## Objective
Publish riddle 5 ("Enigma 5", video "Ombre cinesi"): an encrypted video unlocked by the organizer's checkbox in the backend `Unlocks` sheet (same flag gate as riddle 3, no anti-download deterrents, user decision), with a riddle-5 page theme that matches the video: a shadow-puppet theatre (backlit paper screen, black silhouettes), with professional 3D depth effects and fluid animations tuned for mobile.

## Why
Riddle 5 follows the riddle-3 release model (manual signal during the event). The organizer wants the page to feel like the video ("ombre cinesi") and to show off polished 3D/motion work on phones.

## Scope / constraints
- Source: `enigma-5-ombre-cinesi-web.mp4` (1920x1080 30 fps, H.264 High L4.0 + AAC, 750.7 s, 92.63 MB). No `protect`, so no fMP4 remux and no `videoType`: plain blob playback like riddle 3.
- Encrypted with `tools/encrypt-media.mjs` -> `video/enigma-5.enc`. Key only in the session scratchpad (`enigma-5.key`), to be set as Script Property `MEDIA_KEY_p5`. Never in repo. File must stay < 100 MB (GitHub hard limit).
- Backend: `FLAG_PUZZLES.p5` in `Code.gs`; `setupUnlocks()` adds the `p5` row. Organizer must redeploy (new version, same deployment) and run `setupUnlocks()` again.
- Theme name `ombre`: `THEMES` allowlist in app.js, `PALETTES.ombre` in plankton.js, `body[data-theme="ombre"]` in style.css, optional `shadows.js` for gyro/pointer parallax (observes `body[data-theme]`, no app.js coupling). Transform/opacity-only animation, `prefers-reduced-motion` respected, no horizontal overflow at 320 px, other pages unchanged.
- Static site, no build, no dependencies, Italian UI copy.

## Tasks
- [x] T1 — Encrypt video, `FLAG_PUZZLES.p5`, `puzzles.json` p5 (`gate: "flag"`, `theme: "ombre"`), README organizer steps for Enigma 5 (route: inline; Code.gs and puzzles.json are one-line mechanical edits, README section mirrors the Enigma 3 steps; no trigger fired)
- [x] T2 — Riddle-5 page theme "ombre" (shadow theatre, 3D parallax stage, lamp-on reveal animation) via the impeccable skill (route: delegated UI writer; triggers: preparation + writer — style.css, plankton.js, app.js, index.html, new shadows.js)

## Acceptance criteria
- Repo holds only ciphertext for riddle 5; no key; every file < 100 MB. Round trip of `video/enigma-5.enc` matches the source SHA-256.
- Flag off: no key, `saveAnswer` -> `LOCKED`, locked page; flag on: video plays with the normal player.
- Riddle-5 page themed (locked and unlocked states); other pages unchanged (computed-style diff); no horizontal overflow at 320 px; reduced motion disables parallax and flicker.
- impeccable `detect.mjs --json` clean on changed targets.

## Delivery strategy
ask-on-risk (forecast ~450-600 authored lines, binary excluded)

## Progress / evidence
- T1 (inline): `video/enigma-5.enc` 90,464 KB (< 100 MB); round trip with the scratchpad key -> SHA-256 MATCH with the source (92,633,969 B). `Code.gs` `FLAG_PUZZLES.p5` (`new Function` parse OK); `puzzles.json` p5 (JSON.parse OK; `node --check app.js` OK); README "Enigma 5" organizer section. Key scan (rg, hidden files, .git excluded, 8-char prefix): 0 hits. Test-first exception: no runner for Code.gs/puzzles.json; parse checks only.
- T1 commit: see git log (`feat(riddle-5): add flag-gated encrypted video for enigma 5`).

- T1 assess (base main, committed-only, untracked tool folders excluded): medium (executable_change Code.gs), 54 lines, review_due false, under_budget -> pending in slice.
- T2 (delegated UI writer, impeccable): theme `ombre`. style.css +526 (token block after tarot + "Shadow theatre" section: layered-gradient paper with wooden frame, title as a sign on two sticks, cold-lamp `::after` pane with `mix-blend-mode: saturation` breathing 6 s and fading in 1.6 s on `.is-revealed`, skyline/church/hand layers rising with staggered eases, `:has(.puzzle.saved)` one-shot hand wave, `.riddle-view` perspective tilt <= 3deg from `--ombre-tx/ty`, moving shadow plate; standard tokens remapped on `.puzzle` so inner components inherit the paper palette). shadows.js new (268 lines, IIFE, MutationObserver on `data-theme`, mounts `div.ombre-stage` with 6 procedural SVG layers, deviceorientation on coarse pointer with iOS permission inside first gesture, pointermove on fine pointer, rAF lerp 0.08, idle sway, paused when hidden, inert under reduced motion, full unmount). plankton.js `ombre` palette. app.js `THEMES` + `"ombre"`. index.html: `shadows.js` script tag + Josefin Sans 700 weight added to the fonts request. ~800 authored lines, above the heuristic: the riddle-theme coverage list (~25 selectors) plus the 6-layer stage and sensor driver; a split would ship a half-theme.
- T2 evidence (test-first exception: visual work, no runner; scripts in scratchpad `t2/`): `node --check` app.js/plankton.js/shadows.js OK. detect.mjs `--json style.css shadows.js index.html`: `[]` but DEGRADED (parser deps missing, regex fallback) -> partial. Headless Chrome CDP (stubbed backend): p5 locked renders at 390 and 1280; scrollWidth == clientWidth at 320/390/1280 locked and revealed; `.ombre-stage` mounts on p5 (6 layers), unmounts on leave, vars cleared, remounts once; no page errors; computed-style diff HEAD vs tree (index 114 elements, p3 and p4 locked/revealed, reduced motion emulated): 0 differences; saved wave sampled over 1.3 s OK; reduced motion: vars never set, layers static, view identity. Contrast: ink on paper 8.9 (edge ~6.8), soft ink 5.8, input text 12.2, placeholder 5.7, ember focus 4.9, error 4.9, amber on black button 9.4, cream on theatre 16.2, muted 10.0. Screenshots in scratchpad `t2/shots/`. Parent spot check: `node --check shadows.js`/`app.js` OK; screenshots p5 locked and revealed at 390 reviewed.
- Not verified: real device tilt (deviceorientation, iOS permission prompt), real video playback inside the themed frame, frame rate on a low-end phone, detect.mjs ran degraded.

## Next step
Organizer: set MEDIA_KEY_p5, redeploy Code.gs (new version, same deployment), run setupUnlocks(), merge + push, then tick p5 in Unlocks when ready. Test the tilt on a real phone.
