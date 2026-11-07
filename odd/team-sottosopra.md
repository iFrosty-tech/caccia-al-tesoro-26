# Team "Sottosopra" (Claude Code agents)

The design team that built the "Il Sottosopra" look, kept in the repository so every Claude Code
session (terminal, desktop app, web) can call it. Each member is a project subagent in
`.claude/agents/`; `.claude/workflows/team-sottosopra.js` runs the whole team on one request.

## Design reference
- `PRODUCT.md`: who plays, on what, and why.
- `odd/tasks/upside-down-redesign.md`: the art direction of the current look. Its sections
  "Hard constraints", "Art direction" (thesis, signature moments, palette, type, motion
  language) and "Contracts between agents" are the living design system. Read them before
  any work. A new brief (written by `regia` in `odd/tasks/<slug>.md`) adds to it, never
  silently contradicts it.

## Members and file ownership

| Agent | Role | Owns (may edit) |
|---|---|---|
| `regia` | art director: turns a request into a brief and assignments | `odd/tasks/<slug>.md` only |
| `atmosfera` | background canvas FX | `upside.js`, `shadows.js` |
| `identita` | brand assets and the look of the hidden pages | `assets/*` (icons, og image, `hidden.css`), `manifest.webmanifest`, `periodica/index.html`, `periodica/tavola.css`, `arancione/index.html`, `arancione/arancione.css`, `c/index.html` |
| `varco` | the video download loader | `crystal.js` |
| `componenti` | UI system: markup and static styles | `index.html`, `style.css`, markup-only hooks in `app.js` |
| `motion` | choreography and string lights | `lights.js`, `motion.css`, visual hooks in `app.js` |
| `critica` | visual/UX review | read-only |
| `accessibilita` | accessibility, performance, regression review | read-only |
| `rifinitura` | integrator: applies confirmed review findings | every file above |

`motion` starts after `componenti` when both work on the same request. The reviewers run after
the builders, independently; `rifinitura` runs last.

## Rules for every member
- Edit only the files your row owns; others may be editing theirs in the same working tree.
- Never `git commit`, `stash`, `reset`, `checkout`, `restore` or `clean`: changes stay in the
  working tree and the main session commits them. Reading (`git diff`, `git show`) is fine.
- Game behaviour is frozen unless the request is about it: every id in `index.html` and every
  flow in `app.js` (auth, save, logout, hash router, timed/flag/announced gates, MSE streaming,
  protected video, resume, downloads) keeps working, and so does the logic of the hidden pages
  (`periodica/tavola.js`, `arancione/arancione.js`). `puzzles.json`, `apps-script/`, `video/`,
  `audio/`, the `.enc` files and `tools/encrypt-media.mjs` are not touched for visual work.
- Functional Italian copy stays as it is; decorative words may be themed. No lore invented.
- Never reproduce the TV show's logo, title-card composition, characters, names or imagery;
  the words "Stranger Things" never appear in the site.
- Mobile first (320-430 px, one thumb, flaky network), desktop intentional.
  `prefers-reduced-motion` honoured; nothing flashes more than 3 times per second.
- Plain static HTML/CSS/JS, no build step, no dependencies in the site.
- Code comments in English, short, saying why, in the style of the file around them.
- Scratch files (test pages, renders) go in `.preview/<role>/` (git-ignored), never in the site.

## Verification
- `node --check` on every changed JS file.
- Screenshots with the preview harness (stubbed backend, fake player "Undici"):

  ```sh
  node tools/preview/shoot.mjs --out .preview/shots/<role> [--states login,index,p1,...] [--widths 320,390,1280] [--reduced]
  ```

  States: login, login-typing, index, index-fresh, p1, p1-saving, p1-saved, p2, p3, p4, p5, p6,
  and the hidden pages periodica, periodica-out, arancione, arancione-out, c.
  Each shot prints JSON: `consoleErrors` and `pageErrors` empty,
  `overflowPx` 0. Open the PNGs with the Read tool and look at them; iterate until they are right.
- The rooms p3 (green), p4 (tarot), p5 (ombre) still read as themselves; the hidden pages
  `periodica/`, `arancione/` and `c/` render their notices.
- To click through by hand: `node tools/preview/serve.mjs --demo` (fake backend, any password).
- Playwright with Chromium is needed (`tools/preview/playwright.mjs` says how to install it).
