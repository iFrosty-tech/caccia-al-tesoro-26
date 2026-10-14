# Feature: riddle-4-tavola

## Objective
Hidden page `/tavola/` showing the riddle 4 periodic-table image to logged-in players only, hard to download.

## Why
Riddle 4 hinges on an image players reach through a clue URL. It must not be indexed, must not be trivially saved, and should discourage screenshots.

## Scope / constraints
- Standalone page `tavola/index.html`, `noindex, nofollow, noimageindex`, not linked from the app. Path is provisional (user will rename later).
- Login required (reuses `localStorage` session `caccia-al-tesoro-session`); no flag or time gate.
- Image ships only as `tavola/tavola.enc` (AES-GCM, `tools/encrypt-media.mjs`); key lives in Script Property `MEDIA_KEY_tavola`, never in the repo.
- Server: new `getAssetKey` action with its own allow-list (`OPEN_ASSETS`), so `getPuzzleKey` never hands out the asset key (`saveAnswer` keeps its pre-existing behavior).
- Client renders on `<canvas>` (no `<img>`/blob URL), blocks context menu/drag/long-press/select, watermarks the player name, hides the image on blur/visibilitychange.
- Not achievable on the web: blocking OS screenshots or screen recording. Only deterrents.
- Source PNG 6.3 MB -> WebP q80 (808 KB). Lossy: any hidden pixel-level data in the PNG would not survive.

## Tasks
- [x] T1 Asset: WebP q80 + encrypt to `tavola/tavola.enc`; key saved outside repo (inline).
- [x] T2 Server: `getAssetKey` + `OPEN_ASSETS` in `apps-script/Code.gs`; README section (delegated).
- [x] T3 Page: `tavola/index.html`, `tavola/tavola.js`, `tavola/tavola.css` with protections (delegated).
- [x] T4 Deploy: user sets `MEDIA_KEY_tavola`, clasp push + deploy same id, merge/push (user-authorized).

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
- T2: route delegated (one writer for T2+T3, 2+ non-trivial files). Commit `5e42f35` feat(server): add getAssetKey for open encrypted assets.
  - `getAssetKey` authenticates, then `assetKeyResponse` (pure core) checks `PUZZLE_ID_PATTERN` + `OPEN_ASSETS`, reads the property, `NOT_CONFIGURED` when empty. Not routed through `puzzleGate`; `getPuzzleKey`/`saveAnswer` untouched.
  - `node --check` on a scratchpad copy of `Code.gs`: OK.
  - Node vm smoke of `assetKeyResponse`: `tavola` -> `{ok:true,key}` (trimmed); empty property -> NOT_CONFIGURED; `p3` and `../x` -> BAD_REQUEST "Contenuto non valido."; `puzzleGate('tavola')` -> null, so `getPuzzleKey` refuses it.
  - Note: `saveAnswer` already accepts any pattern-valid id that is not gated (pre-existing, unchanged); docs state only that `getPuzzleKey` never hands out asset keys.
  - README: new subsection "Pagina nascosta `/tavola/`" under section 3 (rotate: encrypt -> `MEDIA_KEY_tavola` -> push, redeploy only if `Code.gs` changed).
- T3: route delegated (same writer). Commit `5f1c013` feat(tavola): add hidden login-only page for the riddle 4 image.
  - `node --check tavola/tavola.js`: OK.
  - `rg -n "<img|createObjectURL" tavola/`: no matches (exit 1).
  - Mocked-DOM Node harness (real AES-GCM via webcrypto): logged out -> no key request, login link; AUTH -> session cleared, "Sessione scaduta" + link; NOT_CONFIGURED and wrong key -> Italian error + retry; valid key -> bitmap from `image/webp` Blob, canvas 1504x1128 backing for 376 CSS px (dpr 3, up to 4x for pinch-zoom), watermark drawn.
  - Impeccable detector: `[]`, but DEGRADED (regex fallback, no contrast evaluation).
  - Size: 646 added lines, over the ~400 advisory heuristic: CSS mirrors site tokens/loader and JS duplicates the app's session/API/decrypt helpers (app.js is a closed IIFE).
  - Test-first exception: no test runner in the repo, so no RED/GREEN; checks above plus manual browser check after deploy (T4).
  - Known limit: needs `createImageBitmap` (Safari 15+); older browsers get a "Browser non adatto" message instead of an image element fallback.

- Review (RDD on, medium: executable change in Code.gs; consent granted): lineage review-86bf1c23d4fd3381, reliability lens, approved + acknowledged. Advisory WARNING R3-unfocused-initial-reveal (image drawn while window unfocused at load) and SUGGESTION R3-print-no-unveil fixed in follow-up commit (hasFocus check, afterprint unveil). SUGGESTION R3-no-committed-tests left as later work (no test runner).

- T4: route inline (user-authorized). User set MEDIA_KEY_tavola; `clasp push -f` + `clasp deploy -i <same id>` -> @6. Live smoke: getAssetKey with fake token -> AUTH (action recognized). Merged to main and pushed.

## Next step
Manual browser check on Pages (logged out, logged in, blur veil, watermark, pinch-zoom). Rename /tavola/ when the final clue URL is chosen.
