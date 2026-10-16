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
- [x] T2 — p4 flag gate in `Code.gs`, `puzzles.json` p4, MSE playback with blob fallback, anti-download/inspect deterrents, README organizer steps (route: delegated writer; triggers: writer — Code.gs, app.js, puzzles.json, README non-trivial; preparation — reading app.js/Code.gs)
- [x] T3 — Riddle-4 page theme matching the video, via the impeccable skill (route: delegated UI writer; triggers: preparation + writer — style.css, plankton.js, app.js)

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
- T2 (delegated writer): `Code.gs` `FLAG_PUZZLES.p4` (`MEDIA_KEY_p4`) + header note; `puzzles.json` p4 with `gate: "flag"`, `protect: true`, `videoType: 'video/mp4; codecs="avc1.640032, mp4a.40.2"'` (no `theme` yet: T3 adds the name to `THEMES` in app.js, a `body[data-theme]` block in style.css and `"theme"` on p4). app.js: `createStream` (MSE / ManagedMediaSource; fMP4 fragment index from moov/moof/tfdt/trun, ~2 MB chunks, `updateend` pump, QuotaExceededError -> evict behind playhead or a detached range ahead, else wait for timeupdate; refills evicted chunks; `endOfStream`; duration set from the fragments; MediaSource URL revoked on `sourceopen`; bytes dropped once all fits unless ManagedMediaSource; blob fallback if MSE is missing/unsupported or does not open in 10 s); `guardRiddlePage` (F12, Ctrl/Cmd+Shift/Option+I/J/C, Ctrl/Cmd+U/S/P blocked; devtools gap > 160 px on resize + 1 s poll, skipped on coarse pointer / no hover; cover + pause while devtools open or page hidden/printing; contextmenu/dragstart/selectstart blocked on the player; username watermark as SVG tile; all page listeners removed on leave); `renderVideoPlayer(src, title, protect)` sets controlslist/disablePictureInPicture/disableRemotePlayback/x-webkit-airplay before the source; wake also listens to `durationchange`. style.css: `.is-protected`, `.video-watermark`, `.video-guard`, `.is-guarded`. README: Enigma 4 organizer steps + honest limits. ~+600 lines, above the ~400 heuristic because the fragment index and eviction-aware feeder are needed for MSE on quota-limited browsers.
- T2 evidence (test-first exception: no runner; scripts in the session scratchpad `t2/`):
  - `node --check app.js`: OK. `JSON.parse(puzzles.json)`: OK.
  - `gs-test.js` (Code.gs in node:vm, stubbed services): 23 passed, 0 failed (p4 locked without sheet/row/tick, `saveAnswer` LOCKED, key only when ticked, VERO text, NOT_CONFIGURED without property, p3 unchanged, `setupUnlocks` adds p4 and keeps p3 tick, idempotent, `getAssetKey` refuses p4).
  - `roundtrip.mjs`: MATCH (enc 69,585,074 B -> plain 69,585,046 B).
  - `cdp-p4.mjs` headless Chrome, stubbed backend, real key and file: `mse` 28/0 (only a MediaSource object URL, no video Blob URL, src not fetchable, readyState >= 2, duration ~271.97 s, one buffered range 0-272 s and `ended` state, play + seek 200 s, contextmenu/drag/select prevented on the player only, shortcuts prevented, Ctrl+C untouched, devtools gap pauses + Italian cover, play while covered stops, hidden page pauses + covers, no overflow at 320 px, leave: shortcuts free, MediaSource closed, every object URL revoked, p3 page unaffected); `quota` (appendBuffer capped at 60 s buffered) 29/0 incl. seek back refill and play to `ended`; `nomse` (MediaSource removed) 25/0 with blob fallback.
  - Key scan (node walker, hidden + binary files, .git excluded): prefix-8 hits 0, full key 0, git diff 0.
  - Not verified: real iPhone (ManagedMediaSource `startstreaming`/`endstreaming`, native fullscreen hides the watermark), real Android quota, real devtools docking/zoom false positives.
- T2 commit f480e8b. Review: assess medium (slice_budget_reached, base main) -> consent granted -> native review (1 lens, reliability) approved and acknowledged (lineage review-a33014f100863bd3, authority burned). Advisory follow-ups (non-blocking): R3-devtools-heuristic-lockout (app.js ~1189: side panels / vertical tabs / page zoom can trip the 160 px gap and keep a legit desktop player paused and covered); R3-mse-silent-eviction-thrash (app.js ~970: Chromium evicts silently without QuotaExceededError, feeder may keep re-appending on low-memory Android); R3-uncommitted-mse-tests (fMP4 indexer tests only in scratchpad).
- T3 (delegated UI writer, impeccable colorize/bolder scoped to p4): theme `tarot`. `puzzles.json` p4 `"theme": "tarot"`; app.js `THEMES` + `"tarot"` (no other app.js change); plankton.js `tarot` palette (gold dust + wine motes, same particle budget); style.css `body[data-theme="tarot"]` token block (aubergine abyss, gold `--light`, wine `--wake`, cream text; deck line art as inline SVG data URIs) + a scoped "Tarot deck" section: lamp pool on `body::before` (slow opacity flicker), riddle card with glowing gold border + inner frame with corner fans, uppercase title over a gold diamond rule, face-down card back (wine-red, 5:8, eight-petal rose emblem) while `.reveal` is not revealed (sealed or downloading, via `:has()`), `tarot-turn` when the video opens, `tarot-flare` on save, gold-matted video frame, warm veil/rails/loader, sepia-warmed watermark, opaque wine guard cover (emblem from 560 px). ~+376 lines (CSS mostly).
- T3 evidence (test-first exception: visual work, no runner; scripts in scratchpad `t3/`):
  - `node --check app.js` / `node --check plankton.js`: OK. `JSON.parse(puzzles.json)`: OK.
  - Contrast (computed): text 15.8:1, muted 9.3:1, placeholder 6.9:1, field edge 4:1, gold focus 12:1 on the card face; cream on wine button 8.1:1; muted on the card back 7.7:1.
  - `regress.mjs` computed-style diff (HEAD vs working tree, header + view, index/p1/p2/p3 at 390 and 1280): 0 differences.
  - `anim.mjs`: 9/0 (sealed back 5:8 + emblem, reveal via "Controlla ora" -> `tarot-turn`, no transform left, save -> `tarot-flare`, keyboard focus ring gold, leaving clears theme and lamp, no exceptions).
  - `shots.mjs`: no horizontal overflow at 320 px (locked and unlocked: scrollWidth 320 = clientWidth 320); theme cleared after leaving p4; no page errors.
  - `cdp-p4.mjs mse` (T2 regression): 28 passed, 0 failed.
  - impeccable `detect.mjs --json style.css`: `[]`.
  - Not verified: real iPhone/Android rendering of `:has()` face-down state (fallback without `:has()`: face-up styling throughout, still themed), real-device lamp flicker cost.

## Next step
Organizer: set MEDIA_KEY_p4, redeploy Code.gs (new version, same deployment), run setupUnlocks(), merge + push. Optional: soften the desktop devtools heuristic (R3-devtools-heuristic-lockout).
