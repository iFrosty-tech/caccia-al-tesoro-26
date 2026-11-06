// String lights of the Sottosopra: the alphabet wall on the login panel, the wire of bulbs that
// counts the collected clues, the bulb loader, the lit bulb of a saved answer and the chase of
// lights that answers a save. Everything here is decorative (aria-hidden) and reads
// prefers-reduced-motion. app.js checks for window.Lights and keeps plain fallbacks without it.
//
// One bulb everywhere: <span class="lamp">, a socket and a glass drawn in motion.css. How much
// it glows is the registered CSS property --lamp (0 dark glass, 1 lit, above 1 a surge), so a
// flicker is just a keyframe animation of one number.
//
// window.Lights:
//   wall(el, opts)            fills the alphabet wall; returns {flashLetter(ch), spell(word, gap),
//                             pause(), resume(), destroy()} or null. opts.input: the USERNAME field
//                             the wall answers (a password field is refused); opts.delay: ms before
//                             the wall powers on.
//   string(count, lit, opts)  the progress wire: one bulb per riddle; lit: array of booleans or a
//                             bitmask; opts.fresh: index of the clue just collected; opts.entrance:
//                             the bulbs power on in sequence (first visit).
//   loader(text)              the waiting mark: a short wire of chasing bulbs, then the text.
//   badge()                   "saved": a lit amber bulb whose filament is a check (null in the
//                             tarot and ombre rooms, which keep their own mark).
//   chase(card)               a string of bulbs runs along the top of a panel, then lights and fades.
//   letter(ch)                the wall letter a character lights ("è" → "E"), or "" for none.
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const COLORS = ["red", "amber", "green", "blue", "pink"];
  // A bulb never switches on again sooner than this: at most three flashes in any second (WCAG 2.3.1).
  const MIN_FLASH_GAP = 340;
  const WALL_COLS = 9;
  // Rooms with a lighting of their own: no coloured bulbs there.
  const PLAIN_ROOMS = ["tarot", "ombre"];

  const motion =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };

  function still() {
    return Boolean(motion.matches);
  }

  function onMotionChange(handler) {
    if (typeof motion.addEventListener === "function") motion.addEventListener("change", handler);
    else if (typeof motion.addListener === "function") motion.addListener(handler);
  }

  function offMotionChange(handler) {
    if (typeof motion.removeEventListener === "function") motion.removeEventListener("change", handler);
    else if (typeof motion.removeListener === "function") motion.removeListener(handler);
  }

  function inPlainRoom() {
    const room = document.body ? document.body.dataset.theme : "";
    return PLAIN_ROOMS.indexOf(room) >= 0;
  }

  // The string's colours repeat every five bulbs, in the same order as the tiles.
  function bulbColor(i) {
    return "var(--bulb-" + COLORS[i % COLORS.length] + "-rgb)";
  }

  function lamp(className) {
    const el = document.createElement("span");
    el.className = "lamp" + (className ? " " + className : "");
    return el;
  }

  // Seeded random: the wall is painted once, the same on every visit and every device.
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // The wall letter for a typed character: accents fold to their base letter (è → E); digits,
  // spaces and symbols have no bulb.
  function wallLetter(ch) {
    let text = String(ch == null ? "" : ch);
    if (typeof text.normalize === "function") text = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const letter = text.charAt(0).toUpperCase();
    return /^[A-Z]$/.test(letter) ? letter : "";
  }

  function svgEl(tag, attributes) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes || {}).forEach((name) => el.setAttribute(name, attributes[name]));
    return el;
  }

  // ---------- The alphabet wall ----------

  function wall(el, opts) {
    if (!el || el.nodeType !== 1) return null;
    opts = opts || {};
    if (el.__lights) el.__lights.destroy();

    // The wall answers the username only: a password field is never listened to.
    let input = opts.input && opts.input.nodeType === 1 ? opts.input : null;
    if (input && String(input.type).toLowerCase() === "password") input = null;

    const paint = seeded(1983);
    const cells = {};
    const list = [];
    const byElement = new Map();
    const frag = document.createDocumentFragment();

    // The wire runs behind the sockets; drawn once the cells are laid out.
    const wire = svgEl("svg", { class: "wall-wire", focusable: "false" });
    const wireShadow = svgEl("path", { class: "wall-wire-shadow" });
    const wirePath = svgEl("path", { class: "wall-wire-line" });
    const plug = svgEl("g", { class: "wall-plug" });
    wire.append(wireShadow, wirePath, plug);
    frag.append(wire);

    for (let i = 0; i < ALPHABET.length; i++) {
      const letter = ALPHABET[i];
      const cell = document.createElement("span");
      cell.className = "wall-cell";
      cell.style.setProperty("--bulb-rgb", bulbColor(i));
      // Painted by hand: each letter leans, sits and swells a little differently.
      cell.style.setProperty("--tilt", ((paint() * 2 - 1) * 7).toFixed(1) + "deg");
      cell.style.setProperty("--lift", ((paint() * 2 - 1) * 1.8).toFixed(1) + "px");
      cell.style.setProperty("--grow", (0.92 + paint() * 0.16).toFixed(3));
      cell.style.setProperty("--paint-weight", String(Math.round(700 + paint() * 200)));
      const bulb = lamp();
      const mark = document.createElement("span");
      mark.className = "wall-letter";
      mark.textContent = letter;
      cell.append(bulb, mark);
      const entry = { el: cell, bulb: bulb, letter: letter, fx: "", last: -1e9 };
      cells[letter] = entry;
      list.push(entry);
      byElement.set(cell, entry);
      frag.append(cell);
    }
    el.replaceChildren(frag);
    el.classList.add("is-live");

    let destroyed = false;
    let idleTimer = 0;
    let wakeTimer = 0;
    let frame = 0;
    let spellTimers = [];
    let previous = input ? input.value : "";
    // While the player types, the idle flickers wait: only their name lights up.
    let quietUntil = 0;

    function play(entry, kind, now) {
      // A flash alternates two identical animations, so a new one restarts without a reflow.
      if (kind === "flash") kind = entry.fx === "flash-a" ? "flash-b" : "flash-a";
      entry.fx = kind;
      entry.last = now;
      entry.el.dataset.fx = kind;
    }

    function onAnimationEnd(event) {
      const entry = byElement.get(event.target);
      if (!entry || event.animationName !== "lamp-" + entry.fx) return;
      entry.fx = "";
      delete entry.el.dataset.fx;
    }
    el.addEventListener("animationend", onAnimationEnd);

    function flashLetter(ch) {
      const letter = wallLetter(ch);
      const entry = letter ? cells[letter] : null;
      if (!entry || destroyed) return false;
      // Reduced motion: the letters of the name simply stay lit (see warm), nothing blinks.
      if (still()) return true;
      const now = performance.now();
      // Still bright from its last flash: it just stays lit.
      if (now - entry.last < MIN_FLASH_GAP) return true;
      play(entry, "flash", now);
      return true;
    }

    function cancelSpell() {
      spellTimers.forEach(clearTimeout);
      spellTimers = [];
    }

    // Runs a word along the wall, one bulb after another.
    function spell(word, gap) {
      cancelSpell();
      if (destroyed || still()) return;
      const step = Math.max(60, Number(gap) || 520);
      Array.from(String(word || ""))
        .map(wallLetter)
        .filter(Boolean)
        .slice(0, 30)
        .forEach((letter, i) => {
          spellTimers.push(setTimeout(() => flashLetter(letter), i * step));
        });
    }

    // The letters of the name being typed keep a faint glow, like filaments cooling down.
    function warm(value) {
      const present = {};
      Array.from(String(value || "")).forEach((ch) => {
        const letter = wallLetter(ch);
        if (letter) present[letter] = true;
      });
      list.forEach((entry) => entry.el.classList.toggle("is-warm", Boolean(present[entry.letter])));
    }

    function onInput() {
      const value = input.value;
      // What was just typed: the text between the unchanged start and the unchanged end.
      let start = 0;
      while (start < value.length && start < previous.length && value[start] === previous[start]) start++;
      let endNew = value.length;
      let endOld = previous.length;
      while (endNew > start && endOld > start && value[endNew - 1] === previous[endOld - 1]) {
        endNew--;
        endOld--;
      }
      const added = value.slice(start, endNew);
      previous = value;
      quietUntil = performance.now() + 2500;
      warm(value);
      if (!added) return;
      if (added.length === 1) flashLetter(added);
      // A paste or an autofill runs along the wall.
      else spell(added, 90);
    }
    if (input) {
      input.addEventListener("input", onInput);
      warm(previous);
    }

    function shown() {
      return !document.hidden && el.isConnected && el.getClientRects().length > 0;
    }

    // Idle: now and then a bulb fails and catches, or glows up slowly and fades.
    function idle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (shown() && performance.now() > quietUntil) {
          const entry = list[Math.floor(Math.random() * list.length)];
          if (!entry.fx && !entry.el.classList.contains("is-warm")) {
            // The flicker's second strike comes ~300 ms in: no typed flash on top of it before then.
            if (Math.random() < 0.68) play(entry, "flicker", performance.now() + 300);
            else play(entry, "glow", performance.now());
          }
        }
        idle();
      }, rand(900, 2600));
    }

    // Power on: the current runs along the wire once, A to Z.
    function wake() {
      if (!shown()) return;
      const now = performance.now();
      list.forEach((entry, i) => {
        entry.el.style.setProperty("--d", i * 38 + "ms");
        play(entry, "chase", now + i * 38);
      });
    }

    function pause() {
      clearTimeout(idleTimer);
      clearTimeout(wakeTimer);
      idleTimer = 0;
      wakeTimer = 0;
    }

    function resume() {
      if (destroyed || still() || idleTimer) return;
      idle();
    }

    function onVisibility() {
      if (document.hidden) pause();
      else resume();
    }
    document.addEventListener("visibilitychange", onVisibility);

    function onMotion() {
      if (still()) {
        pause();
        cancelSpell();
        list.forEach((entry) => {
          entry.fx = "";
          delete entry.el.dataset.fx;
        });
      } else {
        resume();
      }
    }
    onMotionChange(onMotion);

    // The wire, in the wall's own pixels: scallops between the sockets of a row, a loop down at the
    // end of each row (the string snakes back), a loose end that hangs into the empty last cell.
    function drawWire() {
      frame = 0;
      if (destroyed) return;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const sag = seeded(7);
      const points = list.map((entry) => {
        const r = entry.bulb.getBoundingClientRect();
        return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height * 0.12 };
      });
      const colW = (points[1].x - points[0].x) || box.width / WALL_COLS;
      const rowH = points.length > WALL_COLS ? points[WALL_COLS].y - points[0].y : 46;
      const f = (n) => n.toFixed(1);
      const rows = [];
      for (let i = 0; i < points.length; i += WALL_COLS) rows.push(points.slice(i, i + WALL_COLS));
      // Row 2 runs right to left: the string snakes.
      if (rows[1]) rows[1].reverse();

      const first = rows[0][0];
      let d = "M" + f(first.x - colW * 0.85) + " " + f(first.y - rowH * 0.3);
      d += " Q" + f(first.x - colW * 0.5) + " " + f(first.y + 2) + " " + f(first.x) + " " + f(first.y);
      rows.forEach((row, r) => {
        for (let i = 1; i < row.length; i++) {
          const a = row[i - 1];
          const b = row[i];
          const dip = 2.2 + sag() * 2.6;
          d += " Q" + f((a.x + b.x) / 2) + " " + f(Math.max(a.y, b.y) + dip * 2) + " " + f(b.x) + " " + f(b.y);
        }
        const next = rows[r + 1];
        if (!next) return;
        // The loop down to the next row, bulging out past the last bulb.
        const end = row[row.length - 1];
        const start = next[0];
        const out = r % 2 === 0 ? 1 : -1;
        d +=
          " C" + f(end.x + out * colW * 0.62) + " " + f(end.y + rowH * 0.12) +
          " " + f(start.x + out * colW * 0.62) + " " + f(start.y - rowH * 0.48) +
          " " + f(start.x) + " " + f(start.y);
      });
      // The loose end drops into the empty cell after Z, a plug on its end: nothing is plugged in.
      const last = points[points.length - 1];
      const plugX = last.x + colW * 0.92;
      const plugY = last.y + rowH * 0.62;
      d +=
        " C" + f(last.x + colW * 0.45) + " " + f(last.y + 5) +
        " " + f(plugX) + " " + f(last.y - 2) +
        " " + f(plugX) + " " + f(plugY - 6);
      wirePath.setAttribute("d", d);
      wireShadow.setAttribute("d", d);
      plug.setAttribute("transform", "translate(" + f(plugX) + " " + f(plugY - 6) + ") rotate(-8)");
      if (!plug.firstChild) {
        plug.append(
          svgEl("rect", { x: "-2.6", y: "0", width: "5.2", height: "6.5", rx: "1.3" }),
          svgEl("path", { d: "M-1.2 6.5v3.2M1.2 6.5v3.2" })
        );
      }
    }

    function scheduleWire() {
      if (!frame) frame = requestAnimationFrame(drawWire);
    }
    const resizer = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleWire) : null;
    if (resizer) resizer.observe(el);
    else window.addEventListener("resize", scheduleWire);
    scheduleWire();

    if (!still()) {
      wakeTimer = setTimeout(() => {
        wakeTimer = 0;
        wake();
        idle();
      }, Math.max(0, Number(opts.delay) || 0));
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      pause();
      cancelSpell();
      cancelAnimationFrame(frame);
      if (input) input.removeEventListener("input", onInput);
      el.removeEventListener("animationend", onAnimationEnd);
      document.removeEventListener("visibilitychange", onVisibility);
      offMotionChange(onMotion);
      if (resizer) resizer.disconnect();
      else window.removeEventListener("resize", scheduleWire);
      el.classList.remove("is-live");
      el.replaceChildren();
      if (el.__lights === controller) delete el.__lights;
    }

    const controller = { flashLetter: flashLetter, spell: spell, pause: pause, resume: resume, destroy: destroy };
    el.__lights = controller;
    return controller;
  }

  // ---------- The string of collected clues ----------

  // Festoon: the wire is hooked at each bulb and droops between hooks, the hooks themselves
  // following one gentle sag across the width. Heights in % of the string's box.
  const STRING_TOP = 12;
  const STRING_SAG = 9;
  const STRING_DROOP = 21;

  function hookAt(u) {
    return STRING_TOP + 4 * STRING_SAG * u * (1 - u);
  }

  function string(count, lit, opts) {
    opts = opts || {};
    const total = Math.max(0, Math.floor(Number(count) || 0));
    const isLit = (i) =>
      Array.isArray(lit) ? Boolean(lit[i]) : typeof lit === "number" ? Boolean(lit & (1 << i)) : false;
    const fresh = Number.isInteger(opts.fresh) ? opts.fresh : -1;

    const line = document.createElement("div");
    line.className = "light-string" + (opts.entrance && !still() ? " is-entering" : "");
    line.setAttribute("aria-hidden", "true");

    // The wire scales with the string; its stroke keeps its width. It comes in from both edges a
    // little higher, as if hung beyond the screen.
    const svg = svgEl("svg", { class: "light-wire", viewBox: "0 0 100 100", preserveAspectRatio: "none", focusable: "false" });
    const hooks = [{ x: 0, y: STRING_TOP - 6 }];
    for (let i = 0; i < total; i++) hooks.push({ x: ((i + 0.5) / total) * 100, y: hookAt((i + 0.5) / total) });
    hooks.push({ x: 100, y: STRING_TOP - 6 });
    let d = "M0 " + hooks[0].y.toFixed(2);
    for (let i = 1; i < hooks.length; i++) {
      const a = hooks[i - 1];
      const b = hooks[i];
      const droop = (a.y + b.y) / 2 + STRING_DROOP * 2;
      d += " Q" + ((a.x + b.x) / 2).toFixed(2) + " " + droop.toFixed(2) + " " + b.x.toFixed(2) + " " + b.y.toFixed(2);
    }
    svg.append(svgEl("path", { class: "light-wire-shadow", d: d }), svgEl("path", { class: "light-wire-line", d: d }));
    line.append(svg);

    let litOrder = 0;
    for (let i = 0; i < total; i++) {
      const u = (i + 0.5) / total;
      const bulb = lamp(isLit(i) ? "is-on" : "");
      if (i === fresh && isLit(i)) bulb.classList.add("is-fresh");
      bulb.style.setProperty("--bulb-rgb", bulbColor(i));
      bulb.style.setProperty("--x", (u * 100).toFixed(2) + "%");
      bulb.style.setProperty("--y", hookAt(u).toFixed(2) + "%");
      bulb.style.setProperty("--n", String(i));
      if (isLit(i)) bulb.style.setProperty("--lit-n", String(litOrder++));
      line.append(bulb);
    }
    return line;
  }

  // ---------- Waiting and saved ----------

  function loader(text) {
    const box = document.createElement("span");
    box.className = "loader loader-lights";
    const wire = document.createElement("span");
    wire.className = "loader-string";
    wire.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) wire.append(lamp());
    const label = document.createElement("span");
    label.className = "loader-text";
    label.textContent = String(text == null ? "" : text);
    box.append(wire, label);
    return box;
  }

  function badge() {
    if (inPlainRoom()) return null;
    const bulb = lamp("check-lamp");
    bulb.setAttribute("aria-hidden", "true");
    const filament = svgEl("svg", { class: "check-filament", viewBox: "0 0 12 12", focusable: "false" });
    filament.append(svgEl("path", { d: "M3.1 6.3 5.2 8.4 9 4", pathLength: "1" }));
    bulb.append(filament);
    return bulb;
  }

  // ---------- The lights answer a save ----------

  function chase(card) {
    if (!card || card.nodeType !== 1 || still() || inPlainRoom()) return;
    const old = card.querySelector(":scope > .save-chase");
    if (old) old.remove();
    const strip = document.createElement("span");
    strip.className = "save-chase";
    strip.setAttribute("aria-hidden", "true");
    const width = card.clientWidth || 320;
    const total = Math.max(7, Math.min(15, Math.round(width / 30)));
    for (let i = 0; i < total; i++) {
      const bulb = lamp();
      bulb.style.setProperty("--bulb-rgb", bulbColor(i));
      bulb.style.setProperty("--x", (((i + 0.5) / total) * 100).toFixed(2) + "%");
      bulb.style.setProperty("--n", String(i));
      strip.append(bulb);
    }
    // Gone with its own fade (no timer); a view change takes it away with the card.
    strip.addEventListener("animationend", (event) => {
      if (event.target === strip) strip.remove();
    });
    card.append(strip);
  }

  // The seal's stamp lands (motion.css: stamp-press): a shock ring in the ash where it hits.
  document.addEventListener("animationend", (event) => {
    if (event.animationName !== "stamp-press" || still()) return;
    const upside = window.Upside || window.Plankton;
    if (!upside || typeof upside.bloom !== "function") return;
    const r = event.target.getBoundingClientRect();
    upside.bloom(r.left + r.width / 2, r.top + r.height / 2);
  });

  window.Lights = {
    wall: wall,
    string: string,
    loader: loader,
    badge: badge,
    chase: chase,
    letter: wallLetter,
  };
})();
