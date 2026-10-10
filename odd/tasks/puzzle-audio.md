# Feature: puzzle-audio

## Objective
Each puzzle can carry an audio track, played through a custom audio player inside its riddle card. Enigma 1 gets `Timeline 1.wav`.

## Why
The riddles are narrated/scored audio; players must listen to them on their phones during the hunt.

## Scope / constraints
- Plain JS, no build, no dependencies (GitHub Pages static site).
- Audio is optional per puzzle: `puzzles.json` entry gets an optional `audio` path (relative, e.g. `audio/enigma-1.mp3`).
- Source WAV is 74 MB (24-bit/48 kHz, 4:17): shipped as MP3 160 kbps / 44.1 kHz (5.1 MB) for mobile data. Original WAV stays outside the repo.
- Custom player matches the bioluminescent night-sea design (tokens in `style.css`), accessible (keyboard, labels, live time), works on iOS/Android Safari/Chrome.
- `preload="metadata"`: no full download until the player presses play.

## Tasks
- [x] T0 — Convert WAV → `audio/enigma-1.mp3` (ffmpeg libmp3lame 160k, 44.1 kHz; duration 256.79 s verified with ffprobe) (route: inline, mechanical)
- [x] T1 — `audio` field in `puzzles.json`, custom player rendered in `app.js`, styles in `style.css`, README note on adding audio (route: delegated, writer trigger: 2+ non-trivial files: app.js, style.css)
- [x] T2 — Impeccable polish + animate pass on the audio player: tighter fit with the night-sea world, purposeful motion (route: delegated, writer trigger: style.css + app.js, preparation trigger: impeccable references)

## Acceptance criteria
- Puzzle with `audio` shows player between riddle text and answer form; puzzle without `audio` unchanged.
- Play/pause toggle, seekable progress (pointer + keyboard), current/total time, loading and error states.
- Only one track plays at a time across cards.
- Logout/re-render stops playback.

## Delivery strategy
single-pr (~250 lines forecast)

## Progress / evidence
- T0 done on branch `feat/puzzle-audio`.
- T1 implemented (uncommitted, awaiting parent commit): `puzzles.json` p1 `audio` field; `app.js` `renderAudioPlayer` (hidden `<audio preload="metadata">`, SVG play/pause toggle with switching aria-label, `input[type=range]` seek with `aria-valuetext` "m:ss di m:ss" and `--progress` fill, arrow keys ±5 s, elapsed/total time, `waiting`/`canplay` loading state, error message "Impossibile caricare l'audio.", rewind on `ended`, one-track-at-a-time via a shared `tracks` Set, `stopAllAudio()` in `showRegister` and at the start of `showPuzzles` also drops the source to stop downloads); `style.css` player block (round glowing wake button, 3px luminous track with wake-head thumb, -webkit and -moz styling, thumb focus ring in `--light`, 44px+ targets, tabular-nums time; reduced motion covered by the existing global rule); README "Audio (facoltativo)" subsection with ffmpeg command.
- Design note: player state class is `is-sounding`, not `is-playing`, because `body.is-playing` already means "logged in".
- T1 evidence: `node --check app.js` OK; `JSON.parse(puzzles.json)` OK; headless Chrome 155 harness (scratchpad server serving the repo, stubbed API fetch, fake session, extra test puzzles) at 390px, 320px and 1280px: p1 shows player with duration 4:16 and max 256; puzzle without `audio` renders unchanged (3 cards, 2 players); missing file shows the error state and message; clicking play switches to the pause icon, label "Metti in pausa" and `is-sounding`. Not verified: actual audible playback and seeking (the Python test server lacks HTTP Range support); real-device iOS/Android check pending.

- T0+T1 commit 3360eea. Review assess: medium, slice_budget_reached → consent granted → native review (1 lens, reliability) approved and acknowledged (lineage review-a40ae20e733a736d). Advisory follow-ups (non-blocking): R3-duration-once (app.js:280, duration read only on `loadedmetadata`), R3-error-terminal (app.js:317, error state has no retry), R3-scrub-latch (app.js:262, `scrubbing` stays true if `change` never fires), R3-unverified-playback (real-device check).
- T2 implemented (uncommitted, awaiting parent commit; route: delegated writer). Motion thesis: one 2.8 s beat (`--pulse`) while sounding: the orb emits a ripple ring, a glint of light runs along the played wake, and the wake head flares as it arrives. `app.js`: toggle wrapped in `.audio-orb` (halo, ripple, searching arc as `::before/::after` behind the button), seek wrapped in `.audio-bar` with an `aria-hidden` `.audio-glint` overlay (`--progress` now set on the bar), `bloomAt()` helper shared with `celebrate()`, plankton bloom at the orb when a track starts from the top (not on resume). `style.css`: play/pause icons stacked and cross-morphed (scale + rotate + opacity), quicker press scale 0.9, static halo fades in while sounding (replaces the box-shadow breathe), buffering = cyan conic arc orbiting the orb (replaces dim-pulse), error dims the track to 0.45, elapsed time glows while sounding; entrance: after the card ignites the orb lights (blur/scale/opacity) and the wake draws itself left to right with `clip-path` (echo of the title wake), then the times fade in. Head flare is skipped while the thumb shows its focus ring. Reduced motion: loops collapse, the halo, cyan time, pause icon and a static loading arc keep state legible; entrance overrides added; plankton already skips the bloom. All loops are transform/opacity on small layers and run only while sounding/loading.
- T2 evidence: `node --check app.js` OK; impeccable `detect.mjs --json style.css app.js` → `[]`; headless Chrome harness (scratchpad, stubbed API, fake session, forced states frozen via `document.getAnimations()`) at 320, 390, 1280 px and 390 px reduced motion, plus 2x zooms: sounding (pause icon, ripple mid-expansion at 250–350 ms, glint reaching the head at ~1.7 s), buffering arc, error state, idle; no overflow at 320 px; DOM state unchanged (labels, `aria-valuetext` "0:00 di 4:16", max 256, error message). Not verified: the live entrance sequence and icon morph in motion (headless virtual time does not advance transitions; checked by frozen frames and code), Safari/Firefox animation support on range thumb pseudo-elements (degrades to a static head), real-device playback.

## Next step
Real-device check (iPhone/Android): play, pause, seek on GitHub Pages after merge.
