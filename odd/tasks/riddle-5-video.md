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
- [ ] T2 — Riddle-5 page theme "ombre" (shadow theatre, 3D parallax stage, lamp-on reveal animation) via the impeccable skill (route: delegated UI writer; triggers: preparation + writer — style.css, plankton.js, app.js, index.html, new shadows.js)

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

## Next step
T2 (theme "ombre", delegated UI writer).
