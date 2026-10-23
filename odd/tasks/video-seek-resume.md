# Fix: video-seek-resume

## Objective
Two player reports on riddle 5: the page sometimes reloads and the video starts over from the top; the seek bar cannot be used to move forward.

## Why
- Seek: the wake bar was a native `<input type="range">` with a 14 px thumb. On iPhone a range only moves when its thumb is caught exactly (a tap on the track does nothing, a missed touch pans the page); everywhere the range ignored touches for the first ~2 s while its `clip-path` entrance ran (reproduced in headless Chromium: a tap at 75% hit `.wake-bar`, not the input).
- Reload: the page is not reloaded by the site (no `location.reload`, no service worker). The browser reloads it: iOS/Android drop a heavy tab (92 MB decrypted video in memory) while another app is open, iOS also when the tab runs out of memory, and a pull-down at the top of the page reloads it. Every reload downloaded the video again and played it from 0.

## Changes
- `app.js` `createWake`: pointer scrubbing on the whole bar (tap jumps, sideways drag follows and seeks on release, vertical swipe still scrolls via `touch-action: pan-y` and `pointercancel`); the range keeps keyboard and screen readers (`pointer-events: none` in `style.css`). Shared by audio and video.
- `app.js` `rememberPosition`: the position of each riddle video is kept in `localStorage` (`caccia-al-tesoro-positions`, by riddle id) every 2 s of playback, on pause/seek, when the page hides and when the view is left; restored after the metadata; cleared at the end.
- `app.js` `download`/`loadVideo`: with a known size the download fills one preallocated buffer (no chunk list + copy), and the encrypted bytes are dropped once WebCrypto has its copy: lower memory peak.
- `style.css`: `overscroll-behavior-y: none` on `html`/`body` while a loader or a video is on the page (no pull-to-refresh).
- `shadows.js`: while a video plays the lamp settles in the middle and the rAF loop stops (no per-frame style recalc of the whole page, the picture holds still); it sways again on pause/end. Partly addresses review follow-up R3-003.

## Progress / evidence
Headless Chromium (Playwright, phone emulation 390x844 @3x with touch, and desktop), stubbed backend, a 120 s 1280x720 H.264 clip encrypted with `tools/encrypt-media.mjs` (plus a fragmented copy for p4/MSE). Harness in the session scratchpad, not committed.
- Before the fix (gestures right after the reveal, while the wake draws itself): a tap on the bar and a drag from the thumb did not seek; a reload restarted from 0. The iPhone thumb-only behaviour is WebKit's, not reproducible here (no WebKit in the container).
- After: 18/18 touch checks (tap ahead, drag thumb, drag from track, vertical swipe scrolls without seeking, bar back at playhead, no pull-to-refresh with a video and back on the index, position saved while playing, resume after reload and after leaving to the index, end clears, lamp sways / holds at 0 while playing / sways after pause, no page errors); 14/14 desktop/audio/p4 checks (mouse click and drag, no focus ring, arrow/Home/End keys, right click ignored, audio tap seek, p4 resume); MSE p4 resume + tap seek while playing; download with missing/short/long Content-Length; fullscreen bar seek and idle tap only wakes the controls.
- `node --check` app.js, shadows.js: OK.
- Not verified: real iPhone/Android devices, real memory use on a phone with the 92 MB file.

## Follow-up: seek ignored on iPhone (after PR #2)
Organizer report from an iPhone (iOS 26, Safari): the bar now follows the finger and the elapsed time shows the target, but the picture keeps playing from where it was. WebKit reports `currentTime` as the seek target while a seek is pending, so the seek reached the element and AVFoundation never completed it: a blob-URL MP4 on iPhone only seeks within what it has loaded (also why the first report said it could not go *forward*).

- `app.js` `loadVideo`: any riddle with `videoType` (a fragmented MP4) streams through MSE / ManagedMediaSource, not only protected ones; the page appends the chunk under the playhead, so seeks work anywhere. `renderVideoPlayer(src, title, protect, streamed)` turns remote playback off for a stream (ManagedMediaSource needs it).
- `app.js` `createStream`: once indexed the bytes move into a Blob (outside the page's memory) and each chunk is read back with `Response(blob.slice()).arrayBuffer()` when appended; the blob fallback receives the Blob. A seek into an unbuffered range appends even after `endstreaming` (before, ManagedMediaSource could leave such a seek hanging).
- README: how to publish a video as fragmented MP4 with `videoType`.
- Riddle 5 asset: to be re-packaged (`ffmpeg -c copy -movflags frag_keyframe+empty_moov+default_base_moof`, same key) and given `videoType`; needs `MEDIA_KEY_p5`.

Evidence (same harness, fragmented test clip served as p5 with `videoType`): 15/15 stream checks (MediaSource source and no blob URL of the file, remote playback off, play, tap seek forward and back while playing, resume after reload, quota-capped buffer: far seek plays and seek back refills, ManagedMediaSource-like source after `endstreaming`: a seek into nothing gets its chunk and plays (fails on the previous `!streaming` check), no MSE: blob fallback plays and seeks, MediaSource never opening: blob fallback after the timeout, leave without errors). Earlier suites re-run, all passing (p4 now on the fragmented clip through MSE).
