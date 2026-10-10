# Feature: puzzle-site

## Objective
Minimal static site (GitHub Pages) where players register with a username only, answer puzzles, and can change answers anytime. Admin sees everyone's answers; players see only their own.

## Constraints
- Do not over-engineer: plain HTML/CSS/JS, no build step, no framework.
- GitHub Pages is static → storage via Google Apps Script web app backed by a Google Sheet.
- Puzzles published by admin by editing `puzzles.json` and pushing.
- No email/password. Username claim returns a random token stored in localStorage so others cannot read/overwrite a player's answers by typing their username.

## Tasks
- [x] T1 — Site + Apps Script backend + README setup guide (route: delegated, writer trigger: 2+ non-trivial files)

## Acceptance criteria
- Register with username (unique, case-insensitive); token saved locally.
- Puzzles listed from `puzzles.json`; answers saved/updated (upsert) per user+puzzle.
- Player sees only own answers; admin sees all in the Sheet.

## Delivery strategy
single-pr (small feature)

## Progress / evidence
- T1: `node --check app.js|config.js` OK, `puzzles.json` parses OK, Code.gs syntax OK. Test-first exception: no runner, backend runs only in Google.
- Not verified: live Apps Script calls and browser flow (needs admin deployment).
- Known limits (documented in README): logout or device change loses token → admin deletes row in "Users"; re-registered username inherits old "Answers" rows.

- T1 commit 86abca9; native review (4 lenses) approved and acknowledged, 12 non-blocking advisory findings.
- T2 commit 7387f0a: Apps Script manifest (web app, anonymous access) + .gitignore for clasp files.
- main pushed; GitHub Pages enabled: https://ifrosty-tech.github.io/caccia-al-tesoro-26/
- clasp 3.4.1 installed globally.

- clasp create (bound Sheet), push, deploy @1 done; API_URL set in config.js.
- Endpoint check: returns "Accesso negato / autorizzazione necessaria" until owner authorizes scopes once.

- Owner authorized scopes. E2E via curl: register OK, duplicate (case-insensitive) rejected, save + update OK, getMyAnswers returns own answers, wrong token rejected (AUTH). Formula-like answer "=007" round-trips intact.
- Pages live: index, config.js (with API URL), puzzles.json all 200. Browser UI not driven manually.

## Next step
Delete test user `zz_test` rows from "Users" and "Answers". Replace example puzzles in puzzles.json.
Redeploy after Code.gs changes: `clasp push -f && clasp deploy -i <deploymentId>` to keep the same URL.
