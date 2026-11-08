// Preview harness for the site: serves the repository on a free local port, stubs the Apps
// Script backend, logs in a fake player ("Undici") and takes full-page screenshots of every view.
// It never writes to the repository except the PNGs under --out.
//
// Usage (from the repository root):
//   node tools/preview/shoot.mjs [--out .preview/shots] [--states login,index,p1,...]
//                                [--widths 390,1280] [--reduced] [--wait 2600] [--scale 1]
//
// States: login, login-typing, index, index-fresh, p1, p1-saving, p1-saved, p2 (counting down),
//         p3, p4, p5, p6 (sealed: the stub keeps every flag riddle closed); hidden pages:
//         periodica (logged in; the stub refuses its key, so it shows the error notice),
//         periodica-out, arancione (logged in, sealed until p6 opens), arancione-out, c,
//         reveal (logged in, sealed until everyone solves everything), reveal-out;
//         all (default).
// Prints one JSON line per shot: file, console errors, page errors, horizontal overflow (px).
// Needs Playwright with Chromium (see playwright.mjs).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./playwright.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(opt("root", path.join(HERE, "..", "..")));
const OUT = path.resolve(opt("out", path.join(ROOT, ".preview", "shots")));
const WIDTHS = String(opt("widths", "390,1280")).split(",").map(Number);
const REDUCED = !!opt("reduced", false);
const WAIT = Number(opt("wait", 2600));
const SCALE = Number(opt("scale", 1));
const ALL = ["login", "login-typing", "index", "index-fresh", "p1", "p1-saving", "p1-saved", "p2", "p3", "p4", "p5", "p6", "periodica", "periodica-out", "arancione", "arancione-out", "c", "reveal", "reveal-out"];
// Hidden pages: the folder each state opens.
const HIDDEN = { periodica: "periodica/", arancione: "arancione/", c: "c/", reveal: "reveal--trailer/" };
let STATES = String(opt("states", "all"));
STATES = STATES === "all" || STATES === "true" ? ALL : STATES.split(",");

fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg",
  ".woff2": "font/woff2", ".webp": "image/webp", ".jpg": "image/jpeg",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file)] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : stat.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const inTwoDays = new Date(Date.now() + 2 * 86400e3 + 3 * 3600e3 + 125e3).toISOString();

async function stubBackend(page, { saveDelay = 1600 } = {}) {
  await page.route("https://script.google.com/**", async (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch (_) {}
    const reply = (obj) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(obj) });
    switch (body.action) {
      case "register":
      case "login":
        await new Promise((r) => setTimeout(r, 1200));
        return reply({ ok: true, username: body.username || "Undici", token: "tok" });
      case "getMyAnswers":
        return reply({ ok: true, username: "Undici", answers: { p1: "il faro sulla collina", p2: "ventitré" }, locked: ["p3", "p4", "p5", "p6"] });
      case "saveAnswer":
        await new Promise((r) => setTimeout(r, saveDelay));
        return reply({ ok: true, updatedAt: new Date().toISOString() });
      case "getPuzzleKey":
        if (body.puzzleId === "p2") return reply({ ok: true, locked: true, unlockAt: inTwoDays, serverNow: new Date().toISOString() });
        return reply({ ok: true, locked: true });
      case "getAssetKey":
        // /arancione/ and /reveal--trailer/ stay sealed; /periodica/ gets no key here.
        if (body.assetId === "arancione" || body.assetId === "reveal-trailer") return reply({ ok: true, locked: true });
        return reply({ ok: false, error: "Anteprima: nessuna chiave.", code: "PREVIEW" });
      default:
        return reply({ ok: false, error: "Azione non valida." });
    }
  });
  // Timed riddle p2 must look locked in the preview: shift its unlock time into the future.
  await page.route(/puzzles\.json/, async (route) => {
    const real = JSON.parse(fs.readFileSync(path.join(ROOT, "puzzles.json"), "utf8"));
    for (const p of real) if (p.id === "p2") p.unlockAt = inTwoDays;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(real) });
  });
}

const browser = await chromium.launch();
const results = [];

async function shoot(state, width) {
  const mobile = width < 700;
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 860 },
    deviceScaleFactor: SCALE,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: REDUCED ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await stubBackend(page);

  const loggedIn = !state.startsWith("login") && !state.endsWith("-out");
  await page.addInitScript((logged) => {
    try {
      localStorage.setItem("caccia-al-tesoro-known", "1");
      if (logged) localStorage.setItem("caccia-al-tesoro-session", JSON.stringify({ username: "Undici", token: "tok" }));
      else localStorage.removeItem("caccia-al-tesoro-session");
    } catch (_) {}
  }, loggedIn);

  let hash = "";
  const m = /^p(\d)/.exec(state);
  if (m) hash = "#/enigma/p" + m[1];
  if (state === "index-fresh") hash = "#/enigma/p1";

  const pagePath = HIDDEN[state.replace(/-out$/, "")] || "";
  await page.goto(BASE + pagePath + hash, { waitUntil: "load" });
  await page.waitForTimeout(WAIT);

  if (state === "login-typing") {
    await page.click("#username-input");
    await page.keyboard.type("Undici", { delay: 120 });
    await page.waitForTimeout(250);
  }
  if (state === "p1-saving" || state === "p1-saved" || state === "index-fresh") {
    await page.fill("form.answer-form input[type=text]", "il faro sulla collina");
    await page.click("form.answer-form button[type=submit]");
    await page.waitForTimeout(state === "p1-saving" ? 500 : 2600);
    if (state === "index-fresh") {
      await page.evaluate(() => { location.hash = "#/"; });
      await page.waitForTimeout(1400);
    }
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const file = path.join(OUT, `${state}-${width}${REDUCED ? "-reduced" : ""}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const r = { file, consoleErrors, pageErrors, overflowPx: overflow };
  results.push(r);
  console.log(JSON.stringify(r));
  await context.close();
}

try {
  for (const width of WIDTHS) for (const state of STATES) {
    try { await shoot(state, width); }
    catch (e) { console.log(JSON.stringify({ state, width, harnessError: String(e).slice(0, 400) })); }
  }
} finally {
  await browser.close();
  server.close();
}
