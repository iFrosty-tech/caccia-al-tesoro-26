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
- [ ] T1 — Encryption tool + encrypted asset, backend `getPuzzleKey` + locked `saveAnswer`, client countdown / unlock / decrypt / video player, index lock state, README (route: delegated writer; triggers: writer — Code.gs, app.js, style.css, puzzles.json, tool script, README non-trivial; preparation — reading app.js/Code.gs to write)

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
- (pending)

## Next step
T1 via delegated writer.
