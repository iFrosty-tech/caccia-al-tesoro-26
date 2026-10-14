# Feature: riddle-4-tavola

## Objective
Hidden page `/tavola/` showing the riddle 4 periodic-table image to logged-in players only, hard to download.

## Why
Riddle 4 hinges on an image players reach through a clue URL. It must not be indexed, must not be trivially saved, and should discourage screenshots.

## Scope / constraints
- Standalone page `tavola/index.html`, `noindex, nofollow, noimageindex`, not linked from the app. Path is provisional (user will rename later).
- Login required (reuses `localStorage` session `caccia-al-tesoro-session`); no flag or time gate.
- Image ships only as `tavola/tavola.enc` (AES-GCM, `tools/encrypt-media.mjs`); key lives in Script Property `MEDIA_KEY_tavola`, never in the repo.
- Server: new `getAssetKey` action with its own allow-list (`OPEN_ASSETS`), so `saveAnswer` never accepts the asset id.
- Client renders on `<canvas>` (no `<img>`/blob URL), blocks context menu/drag/long-press/select, watermarks the player name, hides the image on blur/visibilitychange.
- Not achievable on the web: blocking OS screenshots or screen recording. Only deterrents.
- Source PNG 6.3 MB -> WebP q80 (808 KB). Lossy: any hidden pixel-level data in the PNG would not survive.

## Tasks
- [x] T1 Asset: WebP q80 + encrypt to `tavola/tavola.enc`; key saved outside repo (inline).
- [ ] T2 Server: `getAssetKey` + `OPEN_ASSETS` in `apps-script/Code.gs`; README section (delegated).
- [ ] T3 Page: `tavola/index.html`, `tavola/tavola.js`, `tavola/tavola.css` with protections (delegated).
- [ ] T4 Deploy: user sets `MEDIA_KEY_tavola`, clasp push + deploy same id, merge/push (user-authorized).

## Acceptance criteria
- Logged-out visit shows a message and link back to the site login; no key request.
- Logged-in visit decrypts and draws the image; AUTH error clears session like the app.
- Page source contains robots noindex meta; no `<img>`, no object URL of the image.
- Right-click, drag, long-press save do nothing; image hidden while page unfocused; watermark shows username.
- `node --check` passes on new JS; `getPuzzleKey`/`saveAnswer` behavior unchanged.

## Checks
No test runner in repo -> no RED/GREEN; `node --check`, structural readback, manual browser check after deploy.

## Delivery strategy
ask-on-risk. Forecast ~350 authored lines, single PR.

## Progress / evidence
- T1: route inline (mechanical). `tavola.enc` 807876 bytes.

## Next step
T2+T3 via one delegated writer.
