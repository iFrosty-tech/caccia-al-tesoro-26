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

## Next step
Admin deploys Apps Script, pastes URL in `config.js`, enables GitHub Pages on `main`.
