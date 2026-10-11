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
- [x] T2 — Login/registration: Accedi/Registrati segmented toggle with one primary button, default Registrati on a device with no prior session, visible labels, show-password, confirm password on register, note that the organizer sees the password (route: delegated writer; triggers: writer — index.html, style.css, app.js non-trivial)
  - Evidence: native radio fieldset toggle + single submit; stub run: first visit mode=register/"Registrati" with 3 visible labels, `known=1` mode=login/"Accedi"; Enter in password field sent exactly `login`; mismatched confirm showed inline error with 0 requests; "pippo " vs "pippo" (trim) registered and set `caccia-al-tesoro-known=1`; show-password flips type to text (aria-pressed); auth error message kept inputs; no overflow at 320/390/1440; field border 3.4:1 vs panel (was 1.72:1); detector 6 (no new rules).
- [x] T3 — Riddle page structure: eyebrow ("Enigma I di II"), title, body rhythm, media labelled as the riddle, optional `subtitle`/`hint`; drop the 0.25-opacity reveal delay on dedicated pages; README fields (route: delegated writer; triggers: writer)
  - Evidence: position "I di II" / "II di II" rendered in the back-link row (not a kicker over the title, which the impeccable craft floor bans; SR text "Enigma 1 di 2"); "Ascolta l'enigma" label over audio, "Guarda l'enigma" over the revealed video; stub with injected `subtitle`/`hint`: both render, without them no nodes; card opacity 0.6 at 250 ms and 1 when settled, filter none (was 0.25 + blur until IntersectionObserver); body 62ch / 1.7; no overflow at 320/390/1440; puzzles.json untouched and parses; README documents the fields; detector 6 (no new rules).
- [x] T4 — Animated in-world loader for login/registration and answer save, reduced-motion fallback (route: delegated writer; triggers: writer)
  - Evidence: `wakeLoader()` (glint running down a small wake, head flare, two plankton specks) inside the auth submit button ("Accesso in corso…" / "Registrazione…", full text in a visually hidden role=status) and in the save status line ("Salvataggio…", role=status); also reused for "Caricamento enigmi…". Stub with 2 s delay: auth button 52 px before/during (no shift), radios + toggle disabled; save status 22 px before/during/after, Salva disabled; "Salvato ✓" replaced by SVG check badge + "Salvato"; error hands off to existing message. Reduced motion: wake animation `loader-breathe 2.4s infinite`, glint static. No overflow at 320/390/1440; `node --check app.js` OK; detector 6 (no new rules).

## Notes for follow-up
- PRODUCT.md still says "Login and registration share one form (two submit buttons)"; it was outside this feature's edit surface.
- The riddle position is rendered in the back-link row rather than as an eyebrow above the title (impeccable craft floor bans kickers; the title already says "Enigma 1").

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
Parent spot check and native review of the four work-unit commits.
