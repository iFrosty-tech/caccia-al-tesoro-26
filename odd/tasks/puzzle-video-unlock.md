# Feature: puzzle-video-unlock

## Objective
Publish riddle 2 ("Enigma 2", a video) now, but keep it locked until 2026-10-11 20:30 Europe/Rome (18:30Z). Until then players see an on-screen countdown; at zero the video becomes watchable. It must be impossible to watch the video before that time by any means.

## Why
The organizer wants to release riddles on a schedule. GitHub Pages is static and the repo is PUBLIC: anything pushed (files, `puzzles.json`, git history) is readable immediately, so a client-only timer protects nothing.

## Scope / constraints
- Decision (user): encrypted video in the repo. The MP4 is encrypted with AES-256-GCM (random key, random 12-byte IV) and only the ciphertext is committed. The key lives ONLY in Apps Script Script Properties, never in the repo, and the backend returns it only when its own clock is past the unlock time.
- The plaintext MP4 and the key must never enter the repo or its history.
- Unlock time is enforced server-side (Apps Script clock). `unlockAt` in `puzzles.json` drives only the countdown display; the client re-syncs from the server when it reaches zero early.
- Before unlock: riddle text, video and answer form hidden; backend `saveAnswer` rejects a locked riddle.
- Static site, no build, no dependencies. Keep the night-sea look (`style.css` tokens, `PRODUCT.md`). Italian UI copy.
- Video file: original render kept as is (1080p, 247 s, ~34 MB, already ~1.1 Mbps). Downloaded fully, decrypted with WebCrypto, played from a blob URL.
- Backend change requires the organizer to redeploy the Apps Script (same deployment, new version) and set the key property.

## Tasks
- [x] T1 — Encryption tool + encrypted asset, backend `getPuzzleKey` + locked `saveAnswer`, client countdown / unlock / decrypt / video player, index lock state, README (route: delegated writer; triggers: writer — Code.gs, app.js, style.css, puzzles.json, tool script, README non-trivial; preparation — reading app.js/Code.gs to write)

## Acceptance criteria
- Repo contains only the ciphertext; no plaintext MP4, no key.
- Round-trip check: ciphertext decrypted with WebCrypto equals the original MP4 (hash).
- Before 20:30 the riddle page shows a countdown and nothing else of the riddle; the index tile shows it as locked.
- At zero the client asks the backend; if still locked it re-syncs, otherwise it downloads (with progress), decrypts and plays the video, then shows text and answer form.
- `getPuzzleKey` returns no key before the unlock time; `saveAnswer` on a locked riddle fails with code `LOCKED`.
- No horizontal overflow at 320 px; leaving the page stops the video and frees the blob URL.

## Delivery strategy
single-pr (~350 authored lines forecast, binary asset excluded)

## Progress / evidence
- T1 commit b496388 (delegated writer). Files: tools/encrypt-media.mjs, video/enigma-2.enc (33,787,381 B = source + 28), apps-script/Code.gs (TIMED_PUZZLES, getPuzzleKey via pure helper puzzleKeyResponse/timedPuzzleState, saveAnswer LOCKED), puzzles.json (p2), app.js (leaveView/onLeave cleanup, locked tiles with live countdown, renderTimedStage: server clock sync, retry/backoff, streamed download with progress, WebCrypto decrypt, blob video), style.css, README.md.
- Key stored only outside the repo (session scratchpad enigma-2.key); rg over working tree and git log --all -p: 0 hits. No .mp4 in tree.
- Evidence (test-first exception: static site, no test runner; checks live in the scratchpad, not committed):
  - node --check app.js / tools/encrypt-media.mjs: OK.
  - Round trip with globalThis.crypto.subtle: decrypted SHA-256 == source SHA-256 (MATCH, re-run by parent); tampered tag rejected (OperationError).
  - Code.gs loaded in node:vm with fake Date/PropertiesService: 10/10 PASS (1 ms before unlock locked + no key + saveAnswer LOCKED; at/after unlock key returned; missing property NOT_CONFIGURED; untimed/toString BAD_REQUEST; bad token AUTH).
  - Headless Chrome over CDP: locked index + riddle countdown at 320/390 with no overflow; unlock with real key → blob video, loadedmetadata 247.21 s 1920x1080; leave revokes blob and aborts download; zero transition, server-behind re-sync, NOT_CONFIGURED/offline/bad-key states.
  - impeccable detect: [].
- Review: assess medium, slice_budget_reached (801 lines) → consent granted → native review (1 lens, reliability) approved and acknowledged (lineage review-ec38ed54673d7997, authority burned). Advisory follow-ups (non-blocking): R3-001 no committed tests for unlock rules (covered only by scratchpad gs-test), R3-002 round-trip evidence was not yet recorded (now recorded above), R3-003 index tiles use clockOffset only after a riddle page sync, so a fast device clock can show "ancora da svelare" early on the index (cosmetic; server enforces).
- Organizer manual steps before 20:30: set Script Property MEDIA_KEY_p2 = key file content; redeploy Code.gs as new version of the same deployment; merge + push to main.

## Next step
Organizer manual steps above; optional follow-up R3-003.
