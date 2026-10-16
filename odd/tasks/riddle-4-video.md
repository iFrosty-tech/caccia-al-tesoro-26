# Feature: riddle-4-video

## Objective
Publish riddle 4 ("Enigma 4", video "Il mazzo"): an encrypted video unlocked by the organizer's checkbox in the backend `Unlocks` sheet (same flag gate as riddle 3), with strong anti-download / anti-inspect deterrents on the page and a riddle-4 page theme that matches the video. Rename the hidden page `/tavola/` to `/periodica/`.

## Why
Riddle 4 follows the riddle-3 release model (manual signal during the event). The organizer wants the video not to leak (no download, no re-upload), so the page must make extraction as hard as a static browser page allows.

## Scope / constraints
- Source: `enigma-4-il-mazzo-web.mp4` (1920x1080 30 fps, H.264 High L5.0 + AAC LC, 271.9 s, 69.75 MB). Remuxed (stream copy, no re-encode) to fragmented MP4 (`frag_keyframe+empty_moov+default_base_moof`) so the page can play it through Media Source Extensions instead of a downloadable blob URL. Codecs: `avc1.640032`, `mp4a.40.2`.
- Encrypted with `tools/encrypt-media.mjs` -> `video/enigma-4.enc` (69,585,074 B). Key only in the session scratchpad (`enigma-4.key`), to be set as Script Property `MEDIA_KEY_p4`. Never in repo.
- Backend: `FLAG_PUZZLES.p4` in `Code.gs`; `setupUnlocks()` adds the `p4` row. Organizer must redeploy (new version, same deployment) and run `setupUnlocks()` again.
- Honest limit: a browser cannot fully prevent extraction (decrypted bytes live in page memory; screen recording always works). Deterrents only: MSE playback (no blob URL to open/save), no context menu, `controlsList="nodownload"`, no PiP / remote playback, key shortcuts for devtools/save/view-source blocked, devtools-open heuristic pauses and veils the video, player-name watermark.
- `/periodica/`: folder move only; asset id `tavola` and `MEDIA_KEY_tavola` unchanged (no backend change).
- Static site, no build, no dependencies, Italian UI copy.

## Tasks
- [x] T1 — Rename `/tavola/` -> `/periodica/` (route: inline; mechanical folder move + README paths, no trigger fired)
- [ ] T2 — p4 flag gate in `Code.gs`, `puzzles.json` p4, MSE playback with blob fallback, anti-download/inspect deterrents, README organizer steps (route: delegated writer; triggers: writer — Code.gs, app.js, puzzles.json, README non-trivial; preparation — reading app.js/Code.gs)
- [ ] T3 — Riddle-4 page theme matching the video, via the impeccable skill (route: delegated UI writer; triggers: preparation + writer — style.css, plankton.js, app.js)

## Acceptance criteria
- Repo holds only ciphertext for riddle 4; no key; every file < 100 MB. Round trip of `video/enigma-4.enc` matches the fragmented source SHA-256.
- Flag off: no key, `saveAnswer` -> `LOCKED`, locked page; flag on: video plays (MSE where available, blob fallback otherwise, incl. iOS).
- No `blob:` video URL exposed when MSE is used; right-click, download control, PiP blocked on the riddle-4 page.
- Riddle-4 page themed; other pages unchanged; no horizontal overflow at 320 px.
- `/periodica/` serves the hidden page; `/tavola/` no longer exists.

## Delivery strategy
ask-on-risk (forecast ~400-600 authored lines, binary excluded)

## Progress / evidence
- T1: `git mv tavola periodica`; README paths updated; `rg "tavola/" README.md` shows only `periodica/...` paths.

## Next step
T2 delegated writer.
