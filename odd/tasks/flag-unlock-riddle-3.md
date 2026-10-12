# Feature: flag-unlock-riddle-3

## Objective
Publish riddle 3 ("Enigma 3"): an encrypted video plus a downloadable encrypted SSTV audio file (WAV). Both stay locked until the organizer ticks a checkbox in a specific cell of the backend spreadsheet. The riddle page uses a green theme instead of the usual blue.

## Why
Riddle 2 unlocked at a fixed time. Riddle 3 must unlock on the organizer's manual signal during the event. The repo is public, so the gate must be server-side: the AES key is handed out only when the sheet flag is on.

## Scope / constraints
- Reuse the riddle-2 crypto: AES-256-GCM files (IV || ciphertext || tag) produced by `tools/encrypt-media.mjs`. One key per riddle (`MEDIA_KEY_p3` Script Property) for both files, distinct random IVs. Key never in repo or history (kept in the session scratchpad).
- Gate: sheet `Unlocks` with columns `puzzleId | unlocked`; row `p3` with a checkbox in column B. Missing sheet/row or unchecked = locked. A `setupUnlocks()` function, run once from the Apps Script editor, creates the sheet and the unchecked checkbox row.
- Locked riddle: no countdown; the page says it is not revealed yet and re-checks the server periodically and on demand. `saveAnswer` rejects it (`LOCKED`). Index tile shows it locked using server state.
- Unlocked: video decrypted and played like riddle 2; the audio offered as a download of the original WAV (`enigma-3-sstv.wav`, lossless, needed for SSTV decoding), decrypted in the browser.
- Video re-encoded from the 165 MB render (over GitHub's 100 MB limit) to 1080p60 two-pass x264 ~1.9 Mbps + AAC 128k (~80 MB). Decision (user): keep 60 fps and 1080p.
- Green theme for the riddle-3 page only, via a `theme` field in `puzzles.json`. Static site, no build, no dependencies, Italian UI copy.
- Backend change requires the organizer to set `MEDIA_KEY_p3`, redeploy Code.gs (new version, same deployment) and run `setupUnlocks()` once.

## Tasks
- [x] T1 — Encrypted assets (audio done, video after re-encode), backend flag gate (`Unlocks` sheet, `getPuzzleKey`, `saveAnswer`, locked state for the index), client locked state + polling, audio download, green theme, `puzzles.json` p3, README (route: delegated writer; triggers: writer — Code.gs, app.js, style.css, puzzles.json, README non-trivial; preparation — reading app.js/Code.gs to write)

## Acceptance criteria
- Repo contains only ciphertext (`video/enigma-3.enc`, `audio/enigma-3-sstv.enc`); no plaintext media, no key; every file < 100 MB.
- Round trip: decrypted video and audio SHA-256 equal the sources.
- Flag off: no key from `getPuzzleKey`, `saveAnswer` → `LOCKED`, riddle page shows the locked state only, index tile locked.
- Flag on: video plays, WAV downloads with the original bytes, text and answer form shown; the page re-checks and unlocks without a reload.
- Riddle-3 page is green; other pages unchanged. No horizontal overflow at 320 px; leaving the page stops media, aborts downloads and revokes blob URLs.

## Delivery strategy
single-pr (~500 authored lines forecast, binary assets excluded)

## Progress / evidence
- Audio encrypted: `audio/enigma-3-sstv.enc` 4,405,824 B (source 4,405,796 + 28).
- Video: re-encoded 1080p60 High@4.2, 2.01 Mbps, 308.5 s, 77,679,450 B; `video/enigma-3.enc` 77,679,478 B. Parent round trip (WebCrypto): MATCH.
- T1 (delegated writer): Code.gs `FLAG_PUZZLES`, shared `puzzleGate`, `unlockFlags`/`readUnlockFlags`, `setupUnlocks()`, `getMyAnswers.locked`; app.js generalized locked stage (timed + flag), 30 s polling + "Controlla ora" + visibility recheck, WAV download with "Salva di nuovo" fallback; style.css blue accents tokenized + `body[data-theme="green"]`; plankton.js `setTheme`; README organizer steps.
- Evidence (test-first exception: no runner; scripts in scratchpad):
  - node --check app.js / plankton.js: OK.
  - gs-test-flag.js (Code.gs in node:vm): 44/0 — re-run by parent: 44 passed, 0 failed.
  - roundtrip3.mjs audio: SHA-256 match, tampered rejected.
  - cdp-flag.mjs 320 click: 29/0; 390 poll: 30/0 (real video 1920x1080 308 s, WAV download byte-identical, no overflow, theme only on p3, blobs revoked on leave).
  - Key scan working tree: 0 hits. Screenshots reviewed by parent (green sealed + unlocked pages).
- Not verified: real iOS device download; network-level abort on leave.

## Next step
Organizer: set Script Property MEDIA_KEY_p3, redeploy Code.gs (new version, same deployment), run setupUnlocks() once, merge + push. Tick `Unlocks!B` for p3 to release.
