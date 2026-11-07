// Fake backend for the local demo (serve.mjs --demo): answers the Apps Script calls inside the
// page, so any username/password works and nothing reaches the real Google Sheet. Riddles 1-2
// start answered, riddle 2 keeps counting down, every flag riddle stays sealed.
(function () {
  "use strict";
  const realFetch = window.fetch.bind(window);
  const ANSWERS_KEY = "demo-answers";
  const inTwoDays = new Date(Date.now() + 2 * 86400e3 + 3 * 3600e3).toISOString();

  function answers() {
    try { return JSON.parse(localStorage.getItem(ANSWERS_KEY)) || { p1: "il faro sulla collina", p2: "ventitré" }; }
    catch (_) { return {}; }
  }
  function store(all) {
    try { localStorage.setItem(ANSWERS_KEY, JSON.stringify(all)); } catch (_) {}
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const json = (obj) => new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;

    if (url.startsWith("https://script.google.com/")) {
      let body = {};
      try { body = JSON.parse((init && init.body) || "{}"); } catch (_) {}
      switch (body.action) {
        case "register":
        case "login":
          await wait(1400);
          return json({ ok: true, username: body.username || "Undici", token: "demo" });
        case "getMyAnswers":
          await wait(500);
          return json({ ok: true, username: body.username, answers: answers(), locked: ["p3", "p4", "p5", "p6"] });
        case "saveAnswer": {
          await wait(1300);
          const all = answers();
          all[body.puzzleId] = String(body.answer || "").trim();
          store(all);
          return json({ ok: true, updatedAt: new Date().toISOString() });
        }
        case "getPuzzleKey":
          await wait(400);
          if (body.puzzleId === "p2") return json({ ok: true, locked: true, unlockAt: inTwoDays, serverNow: new Date().toISOString() });
          return json({ ok: true, locked: true });
        case "getAssetKey":
          // /arancione/ stays sealed until the final riddle opens; /periodica/ gets no key here.
          if (body.assetId === "arancione") return json({ ok: true, locked: true });
          return json({ ok: false, error: "Anteprima locale: nessuna chiave.", code: "PREVIEW" });
        default:
          return json({ ok: false, error: "Azione non valida." });
      }
    }

    if (/puzzles\.json/.test(url)) {
      const res = await realFetch(input, init);
      const list = await res.json();
      list.forEach((p) => { if (p.id === "p2") p.unlockAt = inTwoDays; });
      return json(list);
    }

    return realFetch(input, init);
  };
})();
