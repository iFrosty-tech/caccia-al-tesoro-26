# Feature: puzzle-pages

## Objective
After login, the home becomes a polished, more professional "collected clues" index: a progress header ("Indizi raccolti n / N") and one tile per riddle showing its status (solved / still to reveal) and the player's saved answer. Tapping a tile opens a dedicated riddle page with the riddle text, the audio player and the answer form.

## Why
The single long list mixes reading, listening and answering for every riddle at once. A hub + detail structure is clearer on a phone, scales as the organizer publishes more riddles, and makes progress visible.

## Scope / constraints
- Plain static HTML/CSS/JS, no build, no dependencies (GitHub Pages). Backend (`apps-script/Code.gs`) unchanged: reuse `getMyAnswers` and `saveAnswer`.
- Routing: hash routes in the same page — `#/` (index) and `#/enigma/<id>` (riddle page). Keeps session, plankton canvas and works on GitHub Pages; browser back/forward and deep links work; unknown id falls back to the index with a notice.
- Keep the bioluminescent night-sea world (tokens in `style.css`, `PRODUCT.md`); refine hierarchy, spacing and typography for a more professional finish. Mobile-first, `prefers-reduced-motion` respected, Italian UI copy.
- Audio: only one track at a time; leaving a riddle page stops playback and drops the download.
- `puzzles.json` format unchanged (`id`, `title`, `text`, optional `audio`).

## Tasks
- [x] T1 — Hash router + index view (progress, tiles with status and saved answer) + dedicated riddle page (back link, text, audio, answer form; saving updates the index state) + visual redesign of the post-login views (route: delegated writer; triggers: writer — app.js, style.css, index.html non-trivial; preparation — impeccable references)

## Acceptance criteria
- Logged-in home shows "Indizi raccolti n / N" and one tile per published riddle; solved tiles show the saved answer, unsolved ones show "ancora da svelare".
- Tile → `#/enigma/<id>` page with riddle text, audio player (when `audio` is set) and answer input pre-filled with the saved answer; save shows status and flare; back returns to the index with the updated tile.
- Deep link to `#/enigma/<id>` after login works; unknown id → index; logout from any view returns to login and stops audio.
- No horizontal overflow at 320 px; keyboard focus visible; reduced motion respected.

## Delivery strategy
single-pr (~350 lines forecast)

## Progress / evidence
- Decision (user): home = index of riddles + collected answers (not a plain index, not organizer-published extra clues).
- T1 implemented by delegated writer (uncommitted, awaiting parent spot check):
  - `app.js`: hash router (`#/`, `#/enigma/<id>`, `hashchange`); puzzles + `getMyAnswers` fetched once per login into `game` state, answers map updated locally after `saveAnswer` (trimmed like the server); stale loads ignored via `loadId`; unknown id → `replaceState("#/")` + notice; deep link survives login and AUTH logout, explicit "Esci" clears the route; every route change and logout calls `stopAllAudio()`; focus moves to the view heading, riddle page scrolls to top, index restores its scroll; tiles ignite on the first index visit only, the tile and progress segment of a just-saved clue flare on return.
  - `index.html`: `#puzzles-list` → `#puzzles-view` router outlet; greeting split so small phones show only the name.
  - `style.css`: progress header ("Indizi raccolti" + `n / N` + one luminous segment per riddle), tiles (hollow ring vs lit point of light, collected answer clamped to 2 lines, "ancora da svelare"), riddle page (back link with SVG chevron, larger thin title, answer area with visible label behind a hairline), full-width header veil, 44px tap targets, reduced-motion overrides for the new entrances. Login screen unchanged.
  - `README.md`: one paragraph on the index and `#/enigma/<id>` riddle URLs.
- Evidence (test-first exception: static site, no test runner):
  - `node --check app.js`: OK.
  - `node …/impeccable/scripts/detect.mjs --json style.css app.js`: `[]`.
  - Headless Chrome 155 over CDP (scratchpad `harness.mjs`, fetch stub, 3 harness-only puzzles, reduced motion and `--motion` runs): 28/28 checks PASS on repeated runs, no console errors — no horizontal overflow at 320/390/1280 (index, riddle page, long username); counter `1 / 3`; tile → `#/enigma/p1` with heading focus, pre-filled answer, audio player; back/forward; save → `Salvato ✓`, trimmed input, index `2 / 3` with the new clue and no extra `getMyAnswers`; unknown id → `#/` + notice; logged-out deep link → login → lands on the riddle; logout from a riddle → login, route cleared, no `<audio>` left.

- T1 commit 1584124. Assess: medium, slice_budget_reached (711 lines; untracked .atl/ .impeccable/ excluded) -> consent granted -> native review (1 lens, reliability) approved and acknowledged (lineage review-22d99149ef6e2e76, authority burned). Advisory follow-ups (non-blocking): R3-save-reads-live-input (app.js:694, local answer rebuilt from live input instead of the submitted value), R3-save-after-navigate-stale-index (app.js:691, save resolving after navigating back leaves index stale and freshId dangling), R3-no-committed-tests (router checks live only in the scratchpad harness).

- Follow-up fix (user-authorized): save keeps the submitted value (R3-save-reads-live-input) and re-renders the index when a save resolves after leaving the riddle page (R3-save-after-navigate-stale-index). Evidence: node --check OK; harness 28/28 PASS, no console errors. The two race scenarios themselves were not exercised by the harness (no delayed save stub). R3-no-committed-tests stays open.

## Next step
User local check, then push/merge and real-device check on GitHub Pages.
