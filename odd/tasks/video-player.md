# Feature: video-player

## Objective
Replace the native `<video controls>` of the timed riddle (Enigma 2) with a custom, animated player that belongs to the bioluminescent night-sea world: the same orb of light and wake seek bar as the riddle audio player.

## Why
The native controls look different on every browser and break the mystery; the audio player already set the site's media language. Enigma 2 unlocks 2026-10-11 20:30 Europe/Rome, so the player must be solid on phones first.

## Scope / constraints
- Files: `app.js` (player component used by `renderTimedStage`/`mountVideo`), `style.css`. No new dependencies, no build step, Italian UI copy.
- Keep the unlock / download / decrypt flow, teardown (`onLeave`), and error handling unchanged.
- Shared wake seek styling between audio and video, no duplicated rule blocks.
- Mobile first (320 px, one thumb); fullscreen on Android/desktop via element fullscreen, iPhone falls back to `video.webkitEnterFullscreen()`.
- `prefers-reduced-motion`: no ripples/glint/travel, state changes still legible.

## Motion thesis
- Focal: the riddle surfaces (existing frame rise), then a dimming veil with a large orb that pings like sonar invites the first play; pressing it blooms the sea, the veil dissolves and the orb sinks into the picture.
- Continuity: pause brings the veil and orb back; end shows a replay orb; fullscreen controls fade out after idle and return on any touch.
- Feedback: wake seek with travelling glint, elapsed time lit while playing, searching arc while buffering.

## Tasks
- [x] T1 — Custom animated video player + shared wake seek (route: delegated writer; triggers: writer — app.js and style.css non-trivial; preparation — reading player code to write)

## Acceptance criteria
- No native controls; play/pause, seek (drag + arrow keys ±5 s), elapsed/total time, fullscreen toggle all work by touch, mouse and keyboard, with Italian aria labels.
- States visible: ready (veil + orb), playing, paused, buffering, ended (replay), error.
- Picture keeps the video's own aspect ratio (from metadata), never taller than ~70svh.
- Only one media plays at a time (audio and video pause each other).
- Leaving the page still stops the video and revokes the blob URL.
- No horizontal overflow at 320 px; reduced motion path verified; `node --check app.js` OK; impeccable detector clean.

## Delivery strategy
single-pr (~350 authored lines forecast)

## Progress / evidence
- T1 (delegated writer): `renderVideoPlayer` in app.js with shared helpers `ICONS`, `orbButton()`, `createWake()`; shared CSS `.orb`, `.orb-button`, `.media-icon`, `.wake-*`, `.media-time` (audio keeps `.audio-*` hooks for ignite rules). +710/-173 lines, above the ~400 heuristic because the audio seek/orb styles moved into shared classes instead of being duplicated.
- Evidence (test-first exception: static site, no runner; harness in session scratchpad, not committed):
  - `node --check app.js`: OK (re-run by parent).
  - impeccable detect app.js style.css: `[]` (re-run by parent).
  - Headless Chrome over CDP, stubbed API, ffmpeg 1280x720 clip encrypted with tools/encrypt-media.mjs: 54/54 checks (no native controls, play/pause by button and picture, seek range + arrows, buffering arc, ended replay, real element fullscreen + idle hide, audio/video mutual pause, leave revokes blob and exits fullscreen, no overflow at 320/390/1280, reduced motion visible).
  - Portrait 720x1280 clip capped at <=70svh.
  - Audio regression: computed-style dump of p1 player idle state 0 diffs; screenshots match.
  - Parent visual check of 390 ready/playing/ended/fullscreen, 320 ready, audio p1.
- Not verified: real iPhone `webkitEnterFullscreen`, Android orientation lock, real network buffering, the real 247 s file on device.

## Next step
Push/merge to main before 20:30 (user decision); test on a real phone.
