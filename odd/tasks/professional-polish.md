# Feature: professional-polish

## Objective
Make the site read as a finished, authored product: identity when shared, an unambiguous and honest login, riddle pages with real structure, and an in-world animated loader for the slow login/registration and save requests.

## Why
Impeccable critique 2026-10-11 (`.impeccable/critique/2026-10-11T13-41-32Z__index-html.md`, 26/40) found three P1s: riddle content reads as a placeholder, login/registration is ambiguous and never says the organizer sees passwords, and the site has no favicon/og/manifest (bare WhatsApp preview, 404 favicon). The user also asked for a beautiful animated component during the long login/registration and save waits.

## Scope / constraints
- Files: `index.html`, `style.css`, `app.js`, `puzzles.json` (schema only, text untouched), `README.md` (document new fields), new icon/og/manifest assets at repo root or `assets/`.
- Plain static HTML/CSS/JS, no build step, no new dependencies, Italian UI copy, GitHub Pages at https://ifrosty-tech.github.io/caccia-al-tesoro-26/.
- Never invent lore: new riddle fields (`subtitle`, `hint`) are optional and written by the organizer; the UI renders nothing when absent.
- Backend contract (Apps Script) unchanged.
- Mobile first (320 px, one thumb); `prefers-reduced-motion` respected; keep the bioluminescent wake world.

## Tasks
- [x] T1 — Identity: favicon (SVG + PNG), apple-touch-icon, og:image, meta description, og/twitter tags, manifest, per-page `document.title` (route: delegated writer; triggers: writer — multiple files + new assets)
  - Evidence: `assets/` favicon.svg + 32/180/192/512 PNGs and 1200x630 og-image.png (256 KB) rendered with headless Chrome from wake/plankton SVG/HTML; stub run: icon/apple-touch/manifest links all 200, titles "Caccia al Tesoro" / "Indizi · Caccia al Tesoro" / "Enigma 1 · Caccia al Tesoro"; manifest JSON parses; `node --check app.js` OK; detector 6 findings (baseline 6, no new rules).
- [ ] T2 — Login/registration: Accedi/Registrati segmented toggle with one primary button, default Registrati on a device with no prior session, visible labels, show-password, confirm password on register, note that the organizer sees the password (route: delegated writer; triggers: writer — index.html, style.css, app.js non-trivial)
- [ ] T3 — Riddle page structure: eyebrow ("Enigma I di II"), title, body rhythm, media labelled as the riddle, optional `subtitle`/`hint`; drop the 0.25-opacity reveal delay on dedicated pages; README fields (route: delegated writer; triggers: writer)
- [ ] T4 — Animated in-world loader for login/registration and answer save, reduced-motion fallback (route: delegated writer; triggers: writer)

## Acceptance criteria
- Shared link shows title, description and image; no 404 favicon; manifest valid.
- First visit defaults to Registrati; Enter submits the selected mode; mismatched confirm password blocked inline; labels stay visible while typing.
- Riddle pages render eyebrow/title/body/media; absent optional fields leave no empty gaps.
- Loader visible for the whole login/registration and save request, announced to assistive tech, buttons disabled while pending, static fallback under reduced motion.
- No horizontal overflow at 320/390 px; `node --check app.js` OK; impeccable detector (full parser) no new findings.

## Delivery strategy
single-pr (~900 authored lines forecast; user fast-forwards feature branches into main, no PRs). One work-unit commit per task.

## Progress / evidence
- Branch `feat/professional-polish` from main 3e8f54f (first reviewed boundary).

## Next step
T1–T4 via delegated writer.
