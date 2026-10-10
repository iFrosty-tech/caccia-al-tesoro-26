# Feature: player-password

## Objective
Each player picks a (silly, goliardic) password at registration and can log back in from any device with username + password.

## Why
Today the only credential is a random token in localStorage: logout or a device change locks the player out of their username.

## Scope / constraints
- Secrecy is explicitly NOT a goal (friends only). Password stored in plain text in the `Users` sheet so the admin can read it.
- Keep it dead simple: plain JS, no build, no hashing, no recovery flow.
- Existing `Users` rows stay valid: password goes in a new 4th column (`username | token | createdAt | password`).
- Rows without a password cannot log in (admin can type one into the sheet).

## Tasks
- [x] T1 — Backend `register` takes password, new `login` action returning the stored token; frontend form with username + password and Registrati/Accedi; README + logout copy updated (route: delegated, writer trigger: 2+ non-trivial files: Code.gs, app.js)
- [ ] T2 — Push + redeploy Apps Script on same deployment id, E2E via curl

## Acceptance criteria
- Register requires password (1–50 chars, trimmed); duplicate username still rejected.
- Login with correct password (case-sensitive) returns username + token; wrong password → clear error; unknown user → clear error.
- Logout no longer warns about losing the account.
- Password like `=lol` or `007` round-trips intact.

## Delivery strategy
single-pr (small feature, ~150 lines forecast)

## Progress / evidence
- T1 commit 652c4fd. `node --check app.js` OK, Code.gs syntax OK. Writer smoke test with fake SpreadsheetApp: old 3-column sheet gets the password header; register, duplicate, login, wrong password, unknown user and legacy row behave as specified. Test-first exception: no runner, backend runs only in Google. Review assess: medium, under_budget (pending in slice).

## Next step
T2: clasp push + redeploy on the same deployment id, E2E via curl; then merge to main so Pages serves the new frontend.
