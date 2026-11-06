// Il Sottosopra: the world on the other side, drawn on the fixed canvas #sea behind the page.
// Back to front: a storm sky whose clouds glow red from inside when lightning runs through
// them, bands of cold fog, dark vines creeping in from the edges, and ash rising through three
// depths that a finger or pointer stirs. The soft layers (sky, fog, glows) are painted into a
// small buffer and scaled up once per frame; the vines are cached and redrawn only while they
// grow or on resize.
// window.Upside: bloom(x, y) (viewport coordinates), setTheme(name) ("" is the Sottosopra;
// "green", "tarot", "ombre" calm the air for those rooms), flash(strength) (a burst of
// lightning now, strength 0..1). window.Plankton stays as an alias for older callers, and the
// "plankton:bloom" window event still works. While a bolt strikes, <html> carries
// data-storm="1" for ~200 ms so the page may react.

(function () {
  "use strict";

  const idle = function () {};
  window.Upside = { bloom: idle, setTheme: idle, flash: idle };
  window.Plankton = window.Upside;

  const canvas = document.getElementById("sea");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  const TAU = Math.PI * 2;
  const URL_BAR = 140; // extra canvas below the fold on phones, shown when the URL bar retracts

  // Quality steps, taken only if frames turn out slow: DPR cap (desktop, phone), size of the
  // soft buffer relative to the page, share of the ash kept. Nothing here is crisper than the
  // vine caches (1.5x), so a 2x canvas would only quadruple the fill for no visible gain.
  const QUALITY = [
    { dpr: [1.5, 1.5], sky: 0.5, ash: 1 },
    { dpr: [1.25, 1.25], sky: 0.36, ash: 0.7 },
    { dpr: [1, 1], sky: 0.28, ash: 0.5 },
  ];

  // Each room: ash tints (main, an occasional second one and how often), the halo of glowing
  // motes, the shock ring of a bloom, the fog, how much storm and vine it has, how fast its air
  // rises and how calm it is. Tints follow the theme tokens in style.css.
  const THEMES = {
    // The Sottosopra: pale ash, a few embers from the rift, cold fog, the red storm.
    "": {
      storm: 1, ash: "184, 196, 214", alt: "255, 120, 96", altRate: 0.035, glow: "200, 214, 238",
      ring: "255, 74, 61", core: "255, 200, 188", fog: "118, 134, 164", fogAlpha: 1, rise: 1, calm: 1, shine: 1,
    },
    // Toxic room: green spores rising through a faint green haze.
    green: {
      storm: 0, ash: "109, 255, 180", alt: "24, 196, 110", altRate: 0.45, glow: "120, 255, 190",
      ring: "109, 255, 180", core: "220, 255, 236", fog: "40, 112, 82", fogAlpha: 0.7, rise: 0.55, calm: 0.75, shine: 1.1,
    },
    // Tarot salon: gold dust hanging in lamplight, a few wine-red motes.
    tarot: {
      storm: 0, ash: "240, 198, 120", alt: "178, 58, 92", altRate: 0.22, glow: "255, 214, 150",
      ring: "240, 198, 120", core: "255, 241, 216", fog: "112, 72, 52", fogAlpha: 0.5, rise: 0.12, calm: 0.5, shine: 1.3,
    },
    // Shadow theatre: amber dust drifting through the lamp's beam (shadows.js draws the
    // puppets in front), a few umber motes.
    ombre: {
      storm: 0, ash: "240, 166, 64", alt: "138, 90, 42", altRate: 0.3, glow: "255, 196, 120",
      ring: "240, 166, 64", core: "255, 233, 196", fog: "150, 100, 50", fogAlpha: 0.3, rise: 0.22, calm: 0.55, shine: 1.7, beam: true,
    },
  };

  let width = 0; // canvas size in CSS px (taller than the viewport on phones)
  let height = 0;
  let viewH = 0; // the visible viewport height: the scene is composed for it
  let dpr = 1;
  let small = false;
  let quality = 0;
  let lastViewport = { w: 0, h: 0 };
  let rafId = 0;
  let lastTime = 0;
  let clock = 0; // ms of animated time; frozen while stopped
  let themeKey = "";
  let theme = THEMES[""];
  let stormMix = 1; // 0..1: how much of the storm and the vines is shown, eased on theme change

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function rgba(rgb, a) {
    return "rgba(" + rgb + ", " + a + ")";
  }

  function surface(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // Shortest signed turn from angle a to angle b.
  function turnTo(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    return d;
  }

  // ---------- Sprites (pre-rendered: drawing an image is far cheaper than shadowBlur) ----------

  function radial(size, stops) {
    const c = surface(size, size);
    const g = c.getContext("2d");
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach((s) => grad.addColorStop(s[0], s[1]));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  // A flake of ash: an irregular little polygon, so tumbling ones catch the light unevenly.
  function flake(rgb) {
    const c = surface(24, 24);
    const g = c.getContext("2d");
    g.translate(12, 12);
    g.beginPath();
    const n = 5 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3);
      const r = rand(4.5, 10);
      if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 10);
    grad.addColorStop(0, rgba(rgb, 0.95));
    grad.addColorStop(1, rgba(rgb, 0.4));
    g.fillStyle = grad;
    g.fill();
    return c;
  }

  // A heavy storm cloud: billows lit from above, a dark belly, a flat ragged base.
  function cloudSprite() {
    const W = 440;
    const H = 208;
    const c = surface(W, H);
    const g = c.getContext("2d");
    const puffs = [];
    const n = 18 + ((Math.random() * 8) | 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const hump = Math.sin(t * Math.PI);
      puffs.push([
        W * (0.13 + 0.74 * t) + rand(-10, 10),
        H * 0.66 - hump * H * rand(0.1, 0.24),
        H * (0.15 + 0.24 * hump * rand(0.7, 1.15)),
      ]);
    }
    for (let i = 0; i < 6; i++) puffs.push([W * rand(0.3, 0.7), H * rand(0.34, 0.48), H * rand(0.11, 0.19)]);
    puffs.forEach((p) => {
      const grad = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], p[2]);
      grad.addColorStop(0, "rgba(255, 255, 255, 1)");
      grad.addColorStop(0.5, "rgba(255, 255, 255, 0.85)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      g.fillStyle = grad;
      g.fillRect(p[0] - p[2], p[1] - p[2], p[2] * 2, p[2] * 2);
    });
    g.globalCompositeOperation = "source-atop";
    const body = g.createLinearGradient(0, 0, 0, H);
    body.addColorStop(0, "rgb(42, 48, 68)");
    body.addColorStop(0.45, "rgb(21, 24, 36)");
    body.addColorStop(1, "rgb(7, 8, 13)");
    g.fillStyle = body;
    g.fillRect(0, 0, W, H);
    puffs.forEach((p) => {
      const crown = g.createRadialGradient(p[0] - p[2] * 0.2, p[1] - p[2] * 0.45, 0, p[0] - p[2] * 0.2, p[1] - p[2] * 0.45, p[2] * 0.75);
      crown.addColorStop(0, "rgba(86, 98, 130, 0.28)");
      crown.addColorStop(1, "rgba(86, 98, 130, 0)");
      g.fillStyle = crown;
      g.fillRect(0, 0, W, H);
      const belly = g.createRadialGradient(p[0] + p[2] * 0.15, p[1] + p[2] * 0.35, 0, p[0] + p[2] * 0.15, p[1] + p[2] * 0.35, p[2] * 0.8);
      belly.addColorStop(0, "rgba(5, 6, 12, 0.45)");
      belly.addColorStop(1, "rgba(5, 6, 12, 0)");
      g.fillStyle = belly;
      g.fillRect(0, 0, W, H);
    });
    g.globalCompositeOperation = "destination-out";
    const base = g.createLinearGradient(0, H * 0.6, 0, H * 0.92);
    base.addColorStop(0, "rgba(0, 0, 0, 0)");
    base.addColorStop(1, "rgba(0, 0, 0, 1)");
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    return c;
  }

  // A patch of fog that tiles horizontally: soft elliptical blobs wrapped around both ends,
  // mostly faint with a few dense ones, thinned out in places, fading out at top and bottom.
  function fogSprite(rgb) {
    const W = 512;
    const H = 160;
    const c = surface(W, H);
    const g = c.getContext("2d");
    function blob(x, y, r, sx, colour) {
      for (let k = -1; k <= 1; k++) {
        g.setTransform(sx, 0, 0, 1, x + k * W, y);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, colour);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        g.fillStyle = grad;
        g.fillRect(-r, -r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 30; i++) {
      blob(rand(0, W), H * rand(0.3, 0.7), rand(24, 52), rand(1.8, 3.2), rgba(rgb, 0.04 + Math.pow(Math.random(), 1.8) * 0.4));
    }
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 5; i++) blob(rand(0, W), H * rand(0.38, 0.62), rand(36, 60), rand(1.4, 2.4), "rgba(0, 0, 0, " + rand(0.45, 0.85) + ")");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "destination-in";
    const edge = g.createLinearGradient(0, 0, 0, H);
    edge.addColorStop(0, "rgba(0, 0, 0, 0)");
    edge.addColorStop(0.32, "rgba(0, 0, 0, 1)");
    edge.addColorStop(0.68, "rgba(0, 0, 0, 1)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = edge;
    g.fillRect(0, 0, W, H);
    return c;
  }

  const cloudSprites = [];
  for (let i = 0; i < 5; i++) cloudSprites.push(cloudSprite());
  const strikeRed = radial(128, [[0, "rgba(255, 70, 52, 1)"], [0.3, "rgba(255, 52, 40, 0.5)"], [0.65, "rgba(200, 30, 30, 0.12)"], [1, "rgba(200, 30, 30, 0)"]]);
  const strikeBlue = radial(128, [[0, "rgba(176, 198, 236, 1)"], [0.3, "rgba(140, 166, 210, 0.45)"], [0.65, "rgba(100, 126, 170, 0.1)"], [1, "rgba(100, 126, 170, 0)"]]);
  // The red storm overhead and the rift glowing low in the corners.
  const skyGlow = radial(128, [[0, "rgba(120, 18, 26, 0.9)"], [0.4, "rgba(78, 12, 22, 0.45)"], [0.75, "rgba(40, 8, 18, 0.12)"], [1, "rgba(40, 8, 18, 0)"]]);
  const mist = radial(128, [[0, "rgba(92, 104, 134, 0.55)"], [0.45, "rgba(70, 80, 106, 0.24)"], [1, "rgba(60, 70, 94, 0)"]]);
  const riftGlow = radial(128, [[0, "rgba(190, 26, 28, 0.8)"], [0.35, "rgba(140, 16, 24, 0.35)"], [0.7, "rgba(80, 10, 20, 0.08)"], [1, "rgba(80, 10, 20, 0)"]]);

  let spr = null;

  function buildThemeSprites() {
    const t = theme;
    spr = {
      mote: radial(32, [[0, rgba(t.ash, 1)], [0.22, rgba(t.ash, 0.85)], [0.5, rgba(t.ash, 0.2)], [1, rgba(t.ash, 0)]]),
      moteAlt: radial(32, [[0, rgba(t.alt, 1)], [0.22, rgba(t.alt, 0.85)], [0.5, rgba(t.alt, 0.2)], [1, rgba(t.alt, 0)]]),
      flakes: [flake(t.ash), flake(t.ash), flake(t.ash)],
      flakeAlt: flake(t.alt),
      bokeh: radial(64, [[0, rgba(t.ash, 0.45)], [0.62, rgba(t.ash, 0.38)], [0.82, rgba(t.ash, 0.52)], [0.92, rgba(t.ash, 0.16)], [1, rgba(t.ash, 0)]]),
      halo: radial(64, [[0, rgba(t.glow, 0.75)], [0.2, rgba(t.glow, 0.3)], [0.5, rgba(t.glow, 0.07)], [1, rgba(t.glow, 0)]]),
      haloAlt: radial(64, [[0, rgba(t.alt, 0.8)], [0.2, rgba(t.alt, 0.32)], [0.5, rgba(t.alt, 0.08)], [1, rgba(t.alt, 0)]]),
      ring: radial(256, [[0, rgba(t.ring, 0)], [0.58, rgba(t.ring, 0)], [0.78, rgba(t.ring, 0.2)], [0.885, rgba(t.core, 0.85)], [0.94, rgba(t.ring, 0.3)], [1, rgba(t.ring, 0)]]),
      core: radial(128, [[0, rgba(t.core, 0.85)], [0.22, rgba(t.ring, 0.5)], [0.6, rgba(t.ring, 0.12)], [1, rgba(t.ring, 0)]]),
      fog: [fogSprite(t.fog), fogSprite(t.fog), fogSprite(t.fog)],
      streak: rgba(t.ash, 1),
    };
  }

  // ---------- Sky: clouds, fog, lightning (painted at low resolution, then scaled up) ----------

  const sky = surface(1, 1);
  const skyCtx = sky.getContext("2d");
  // Fog has its own buffer so it can be thinned over the reading column before joining the sky.
  const fogBuf = surface(1, 1);
  const fogCtx = fogBuf.getContext("2d");
  let fogMask = null;
  let skyScale = QUALITY[0].sky;
  let clouds = [];
  // Fog bands, top to bottom: centre and height (share of the viewport), drift (px/s), opacity.
  const FOG = [
    { y: 0.26, h: 0.34, v: 7, a: 0.55, off: 0 },
    { y: 0.58, h: 0.4, v: -4.5, a: 0.3, off: 0 },
    { y: 0.9, h: 0.46, v: 10, a: 0.8, off: 0 },
  ];

  function layoutSky() {
    clouds = [];
    const deck = clamp(width * 0.42, 190, 520);
    // A far deck of smaller, fainter clouds, then a near deck of heavy ones lower down.
    for (let layer = 0; layer < 2; layer++) {
      const span = width + deck * 2.4;
      const n = Math.ceil(span / (deck * (layer ? 0.8 : 0.62)));
      for (let i = 0; i < n; i++) {
        const w = deck * (layer ? rand(1.15, 1.65) : rand(0.8, 1.2));
        clouds.push({
          sprite: (Math.random() * cloudSprites.length) | 0,
          x: -deck * 1.2 + ((i + rand(0.1, 0.9)) * span) / n,
          y: viewH * (layer ? rand(0.05, 0.13) : rand(-0.01, 0.07)),
          w: w,
          h: w * (layer ? rand(0.4, 0.5) : rand(0.36, 0.46)),
          v: layer ? rand(4.5, 7.5) : rand(2, 3.5),
          alpha: layer ? rand(0.7, 0.92) : rand(0.38, 0.58),
          phase: rand(0, TAU),
          span: span,
        });
      }
    }
    FOG.forEach((band) => {
      band.off = rand(0, 1000);
    });
  }

  // Lightning: bursts of one or two strikes; each lights the clouds around it from inside.
  let nextBurst = 0;
  let lastBurst = -1e9;
  const strikes = []; // queued strikes of the current burst
  const lights = []; // live strikes
  let stormTimer = 0;

  function scheduleBurst(min, max) {
    nextBurst = clock + rand(min, max);
  }

  function burst(strength) {
    // Bursts at least 1.5 s apart: with up to two strikes each, never more than two flashes in
    // any second (WCAG 2.3.1 allows three).
    if (clock - lastBurst < 1500) return;
    lastBurst = clock;
    const blue = Math.random() < 0.28;
    const x = width * rand(0.12, 0.88);
    const y = viewH * rand(0.05, 0.15);
    strikes.push({ at: clock, s: strength, blue: blue, x: x, y: y });
    if (Math.random() < 0.45) {
      strikes.push({
        at: clock + rand(160, 320),
        s: strength * rand(0.5, 0.85),
        blue: blue,
        x: clamp(x + width * rand(-0.18, 0.18), 0, width),
        y: y + viewH * rand(-0.03, 0.03),
      });
    }
    scheduleBurst(10000, 25000);
  }

  function strike(p) {
    const light = { x: p.x, y: p.y, t0: clock, s: p.s, blue: p.blue, bolt: null };
    if (Math.random() < 0.6 || p.s > 0.85) light.bolt = makeBolt(p.x, p.y, p.blue);
    lights.push(light);
    if (lights.length > 2) lights.shift();
    root.dataset.storm = "1";
    clearTimeout(stormTimer);
    stormTimer = setTimeout(() => {
      delete root.dataset.storm;
    }, 200);
  }

  // A quick rise, then a slow fade: one soft swell of light per strike, no strobe.
  function lightLevel(light) {
    const t = clock - light.t0;
    if (t < 0) return 0;
    if (t < 45) return (t / 45) * light.s;
    return light.s * Math.exp(-(t - 45) / 230);
  }

  // Jagged line by midpoint displacement, appended to out as x, y pairs (start excluded).
  function jag(ax, ay, bx, by, rough, depth, out) {
    if (!depth) {
      out.push(bx, by);
      return;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const off = (Math.random() * 2 - 1) * rough * len;
    const mx = (ax + bx) / 2 - (dy / len) * off;
    const my = (ay + by) / 2 + (dx / len) * off;
    jag(ax, ay, mx, my, rough, depth - 1, out);
    jag(mx, my, bx, by, rough, depth - 1, out);
  }

  // A thin branching bolt running between clouds, rendered once into its own small canvas.
  function makeBolt(x, y, blue) {
    const len = clamp(width * 0.32, 110, 300) * rand(0.75, 1.1);
    const dir = x > width / 2 ? -1 : 1;
    const ang = rand(0.08, 0.5);
    const main = [x, y];
    jag(x, y, x + Math.cos(ang) * len * dir, y + Math.sin(ang) * len, 0.22, 6, main);
    const paths = [main];
    const forks = 1 + ((Math.random() * 2) | 0);
    for (let f = 0; f < forks; f++) {
      const i = 2 * (((main.length / 2) * rand(0.2, 0.65)) | 0);
      const bx = main[i];
      const by = main[i + 1];
      const a = Math.atan2(Math.sin(ang), Math.cos(ang) * dir) + rand(0.35, 0.9) * (Math.random() < 0.7 ? dir : -dir);
      const l = len * rand(0.2, 0.4);
      const branch = [bx, by];
      jag(bx, by, bx + Math.cos(a) * l, by + Math.abs(Math.sin(a)) * l, 0.25, 4, branch);
      paths.push(branch);
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    paths.forEach((p) => {
      for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]);
        maxX = Math.max(maxX, p[i]);
        minY = Math.min(minY, p[i + 1]);
        maxY = Math.max(maxY, p[i + 1]);
      }
    });
    const pad = 10;
    const scale = Math.min(dpr, 2);
    const c = surface((maxX - minX + pad * 2) * scale, (maxY - minY + pad * 2) * scale);
    const g = c.getContext("2d");
    g.setTransform(scale, 0, 0, scale, (pad - minX) * scale, (pad - minY) * scale);
    g.lineCap = "round";
    g.lineJoin = "round";
    const glow = blue ? "150, 176, 226" : "255, 66, 50";
    const core = blue ? "232, 240, 255" : "255, 214, 204";
    // Layered strokes make the glow: wide and faint, then the thin hot core.
    [[7, rgba(glow, 0.07)], [3.2, rgba(glow, 0.18)], [1.2, rgba(core, 0.85)]].forEach((pass) => {
      paths.forEach((p, k) => {
        g.lineWidth = pass[0] * (k ? 0.6 : 1);
        g.strokeStyle = pass[1];
        g.globalAlpha = k ? 0.65 : 1;
        g.beginPath();
        g.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
        g.stroke();
      });
    });
    return { canvas: c, x: minX - pad, y: minY - pad, w: c.width / scale, h: c.height / scale, dur: rand(80, 120) };
  }

  function paintSky() {
    const s = skyScale;
    skyCtx.setTransform(1, 0, 0, 1, 0, 0);
    skyCtx.globalCompositeOperation = "source-over";
    skyCtx.globalAlpha = 1;
    skyCtx.clearRect(0, 0, sky.width, sky.height);
    skyCtx.setTransform(s, 0, 0, s, 0, 0);

    let flare = 0; // the strongest live strike, for the air and the sky behind the clouds
    for (let i = 0; i < lights.length; i++) flare = Math.max(flare, lightLevel(lights[i]));

    if (stormMix > 0.004) {
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        const roll = Math.sin(clock * 0.00017 + c.phase);
        const h = c.h * (1 + 0.05 * roll);
        skyCtx.globalAlpha = c.alpha * stormMix * (0.9 + 0.1 * roll);
        skyCtx.drawImage(cloudSprites[c.sprite], c.x - c.w / 2, c.y - h * 0.45, c.w, h);
      }
      // Lightning lights the clouds from inside: painted only where there is cloud.
      skyCtx.globalCompositeOperation = "source-atop";
      const R = clamp(width * 0.5, 220, 560);
      for (let i = 0; i < lights.length; i++) {
        const level = lightLevel(lights[i]);
        if (level < 0.004) continue;
        skyCtx.globalAlpha = Math.min(1, level * 0.82 * stormMix);
        skyCtx.drawImage(lights[i].blue ? strikeBlue : strikeRed, lights[i].x - R, lights[i].y - R * 0.7, R * 2, R * 1.4);
      }
      // The red storm glows behind the clouds, breathing slowly.
      skyCtx.globalCompositeOperation = "destination-over";
      const pulse = 0.5 + 0.5 * Math.sin((clock * TAU) / 6400);
      const rx = Math.max(width * 0.7, 300);
      const ry = viewH * 0.38;
      skyCtx.globalAlpha = Math.min(1, stormMix * (0.46 + 0.2 * pulse + flare * 0.45));
      skyCtx.drawImage(skyGlow, width * 0.64 - rx, -ry * 1.05, rx * 2, ry * 2);
      // Mist gathers in the bottom corners, where the rift glows: the vines stand against it.
      skyCtx.globalCompositeOperation = "source-over";
      const mx = Math.max(reach * 1.9, width * 0.3);
      const my = viewH * 0.5;
      skyCtx.globalAlpha = stormMix * 0.75;
      skyCtx.drawImage(mist, -mx, viewH - my * 0.75, mx * 2, my * 2);
      skyCtx.drawImage(mist, width - mx, viewH - my * 0.75, mx * 2, my * 2);
      const cx = Math.min(width * 0.5, 420);
      const cy = viewH * 0.34;
      skyCtx.globalAlpha = stormMix * (0.42 + 0.14 * Math.sin((clock * TAU) / 5200) + flare * 0.2);
      skyCtx.drawImage(riftGlow, -cx, viewH - cy * 0.6, cx * 2, cy * 2);
      skyCtx.globalAlpha = stormMix * (0.42 + 0.14 * Math.sin((clock * TAU) / 5200 + 2.1) + flare * 0.2);
      skyCtx.drawImage(riftGlow, width - cx, viewH - cy * 0.6, cx * 2, cy * 2);
    }

    // Fog: wide bands drifting at their own pace, the nearest the fastest, thinner in the middle.
    fogCtx.setTransform(1, 0, 0, 1, 0, 0);
    fogCtx.globalCompositeOperation = "source-over";
    fogCtx.clearRect(0, 0, fogBuf.width, fogBuf.height);
    fogCtx.setTransform(s, 0, 0, s, 0, 0);
    const tile = Math.max(width * 1.15, 620);
    for (let b = 0; b < FOG.length; b++) {
      const band = FOG[b];
      const h = viewH * band.h;
      const y = viewH * band.y + Math.sin(clock * 0.00009 + b * 2.3) * viewH * 0.015 - h / 2;
      const off = ((band.off % tile) + tile) % tile;
      fogCtx.globalAlpha = band.a * theme.fogAlpha;
      // Tiles meet edge to edge: any overlap would draw a bright seam.
      for (let x = off - tile; x < width; x += tile) fogCtx.drawImage(spr.fog[b], x, y, tile, h);
    }
    fogCtx.globalAlpha = 1;
    fogCtx.globalCompositeOperation = "destination-out";
    fogCtx.fillStyle = fogMask;
    fogCtx.fillRect(0, 0, width, height);
    skyCtx.setTransform(1, 0, 0, 1, 0, 0);
    skyCtx.globalAlpha = 1;
    skyCtx.drawImage(fogBuf, 0, 0);
    skyCtx.setTransform(s, 0, 0, s, 0, 0);

    // The flash spills into the air and the fog around it.
    if (flare > 0.004 && stormMix > 0.004) {
      skyCtx.globalCompositeOperation = "lighter";
      const R = clamp(width * 0.7, 300, 800);
      for (let i = 0; i < lights.length; i++) {
        const level = lightLevel(lights[i]);
        if (level < 0.004) continue;
        skyCtx.globalAlpha = level * 0.16 * stormMix;
        skyCtx.drawImage(lights[i].blue ? strikeBlue : strikeRed, lights[i].x - R, lights[i].y - R * 0.6, R * 2, R * 1.4);
      }
    }
    skyCtx.globalCompositeOperation = "source-over";
    skyCtx.globalAlpha = 1;
  }

  // ---------- Vines: dark tendrils creeping in from the edges ----------

  // Geometry is built in "edge space": x is the distance in from the side edge, so both sides
  // share the code and the right one is drawn mirrored.
  let tendrils = [];
  let reach = 0; // how far the vines may come in from the edge
  let stripW = 0;
  let growStart = -1; // clock when the vines started growing; -1 before the first motion frame
  let grown = false;
  let growEnd = 0;
  const vineBody = [surface(1, 1), surface(1, 1)];
  const vineVeins = [surface(1, 1), surface(1, 1)];
  let vineScale = 1;
  let vinesNeedPaint = true;
  // Per side, the vertical spans that hold vines (ceiling, floor): only those are blitted.
  let vineBands = [[], []];

  // The page's reading column (style.css --column), which the vines stay out of.
  function columnWidth() {
    const v = parseFloat(getComputedStyle(root).getPropertyValue("--column"));
    return v > 0 ? v : 640;
  }

  function makeVines() {
    tendrils = [];
    const phone = width < 700;
    // On phones only thin wisps at the very edges; on wide screens the margins beside the
    // reading column are theirs.
    reach = phone ? clamp(width * 0.1, 24, 44) : clamp((width - columnWidth()) / 2 - 8, 56, 330);
    stripW = reach + 30;
    const unit = phone ? 0.34 : clamp(reach / 200, 0.6, 1.1); // thickness scale
    const below = height - viewH; // the hidden strip on phones
    const up = -Math.PI / 2;
    const down = Math.PI / 2;
    for (let side = 0; side < 2; side++) {
      const first = tendrils.length;
      // The clump in the bottom corner: thick roots rising and twisting, and a few stubs.
      const roots = phone ? 3 : 5;
      for (let i = 0; i < roots; i++) {
        tendril(rand(-8, reach * 0.35), height + 8, up + rand(0.1, 0.75), viewH * rand(0.24, 0.52) + below, rand(16, 28) * unit, rand(0, 700), 0, up, 2);
      }
      const stubs = phone ? 2 : 4;
      for (let i = 0; i < stubs; i++) {
        tendril(rand(0, reach * 0.7), height + 8, up + rand(-0.2, 1.1), rand(40, 110) + below, rand(10, 18) * unit, rand(0, 600), 0, up, 0);
      }
      // Up the lower side edge.
      const sides = phone ? 1 : 2;
      for (let i = 0; i < sides; i++) {
        tendril(-8, viewH * rand(0.55, 0.9), up + rand(0.5, 1.1), viewH * rand(0.16, 0.3), rand(8, 13) * unit, rand(500, 1500), 0, up, 1);
      }
      // Hanging from the top corner.
      tendril(-8, viewH * rand(0, 0.08), down - rand(0.5, 1.1), viewH * rand(0.12, 0.24), rand(8, 13) * unit, rand(800, 1700), 0, down, 1);
      if (!phone) tendril(rand(reach * 0.2, reach * 0.6), -8, down + rand(-0.4, 0.2), viewH * rand(0.08, 0.16), rand(5, 9) * unit, rand(900, 2000), 0, down, 0);
      for (let j = first; j < tendrils.length; j++) tendrils[j].side = side;
    }
    growEnd = 0;
    tendrils.forEach((t) => {
      growEnd = Math.max(growEnd, t.t0 + t.dur);
    });
    vineBands = [0, 1].map((side) => {
      const spans = [[Infinity, -Infinity], [Infinity, -Infinity]];
      tendrils.forEach((t) => {
        if (t.side !== side) return;
        const span = spans[t.top ? 0 : 1];
        for (let i = 1; i < t.n * 2; i += 2) {
          if (t.pts[i] < span[0]) span[0] = t.pts[i];
          if (t.pts[i] > span[1]) span[1] = t.pts[i];
        }
      });
      return spans
        .filter((span) => span[1] > span[0])
        .map((span) => [Math.max(0, Math.floor(span[0] - 24)), Math.min(height, Math.ceil(span[1] + 24))]);
    });
  }

  // One tendril: a slow S-curving walk that bends back when it nears the reading column,
  // leans toward `bias` (up from the floor, down from the ceiling), coils at the tip, forks
  // `forks` times, and on thick trunks carries a thin vine winding around it.
  function tendril(x, y, angle, length, w0, t0, depth, bias, forks) {
    const step = small ? 3.5 : 5;
    const sc = step / 5; // turning rates are per 5 px, whatever the step
    const n = Math.max(4, Math.round(length / step));
    const pts = new Float32Array(n * 2);
    let a = angle;
    let k = 0;
    const curl = (Math.random() < 0.5 ? -1 : 1) * rand(0.18, 0.36) * sc * (depth ? 1.25 : 1);
    const wobF = rand(0.025, 0.06) * sc;
    const wobP = rand(0, TAU);
    const wobA = rand(0.025, 0.05) * sc;
    const out = bias + (bias < 0 ? -0.5 : 0.5); // along the edge, slightly outward
    const inward = bias + (bias < 0 ? 0.6 : -0.6);
    for (let i = 0; i < n; i++) {
      pts[i * 2] = x;
      pts[i * 2 + 1] = y;
      const u = i / n;
      k += rand(-0.006, 0.006) * sc;
      k *= 0.95;
      let turn = k + Math.sin(i * wobF + wobP) * wobA;
      if (u > 0.7) turn += curl * Math.pow((u - 0.7) / 0.3, 1.6);
      turn += turnTo(a, bias) * 0.01 * sc;
      if (x > reach * 0.7) turn += turnTo(a, out) * 0.08 * sc * clamp((x - reach * 0.7) / (reach * 0.3), 0, 1.5);
      else if (x < 2 && i > 3) turn += turnTo(a, inward) * 0.06 * sc;
      a += turn;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
    }
    const dur = (length / rand(150, 230)) * 1000;
    tendrils.push({
      side: 0,
      top: bias > 0,
      pts: pts,
      n: n,
      w0: w0,
      t0: t0,
      dur: dur,
      seed: rand(0, TAU),
      vein: w0 > (small ? 3 : 5) || Math.random() < 0.3,
      // Veins show in stretches, as if under thicker skin elsewhere.
      dash: [rand(24, 80), rand(10, 46), rand(12, 50), rand(8, 30)],
      nodes: Math.random() < 0.3 ? [rand(0.2, 0.6)] : [],
    });

    // A thin vine winding round the trunk: the trunk's path, swung from side to side.
    if (depth === 0 && w0 > 6 && Math.random() < 0.6) {
      const s1 = rand(0.5, 0.85);
      const i0 = Math.floor(n * 0.04);
      const m = Math.floor(n * s1) - i0;
      if (m > 8) {
        const wp = new Float32Array(m * 2);
        const f = rand(0.16, 0.26) * sc;
        const ph = rand(0, TAU);
        for (let j = 0; j < m; j++) {
          const i = i0 + j;
          const ia = Math.max(0, i - 1);
          const ib = Math.min(n - 1, i + 1);
          const tx = pts[ib * 2] - pts[ia * 2];
          const ty = pts[ib * 2 + 1] - pts[ia * 2 + 1];
          const len = Math.hypot(tx, ty) || 1;
          const off = w0 * 0.55 * Math.pow(1 - i / n, 0.6) * Math.sin(j * f + ph);
          wp[j * 2] = pts[i * 2] - (ty / len) * off;
          wp[j * 2 + 1] = pts[i * 2 + 1] + (tx / len) * off;
        }
        tendrils.push({
          side: 0, top: bias > 0, pts: wp, n: m, w0: Math.max(1.4, w0 * 0.2), t0: t0 + dur * 0.04, dur: dur * (s1 - 0.04),
          seed: rand(0, TAU), vein: false, dash: [], nodes: [],
        });
      }
    }

    // Forks: they peel off at a shallow angle and coil on their own.
    for (let f = 0; f < forks; f++) {
      const s = rand(0.2, 0.62);
      const i = Math.floor(s * n);
      const w = w0 * Math.pow(1 - s, 0.6);
      if (w < 1 || i >= n - 1) continue;
      const dir = Math.atan2(pts[i * 2 + 3] - pts[i * 2 + 1], pts[i * 2 + 2] - pts[i * 2]);
      tendril(
        pts[i * 2], pts[i * 2 + 1], dir + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.7),
        length * (1 - s) * rand(0.45, 0.8), w * 0.62, t0 + dur * s, depth + 1, bias,
        depth === 0 && Math.random() < 0.5 ? 1 : 0
      );
    }
  }

  function sizeVineCaches() {
    vineScale = Math.min(dpr, 1.5);
    for (let side = 0; side < 2; side++) {
      [vineBody[side], vineVeins[side]].forEach((c) => {
        c.width = Math.max(1, Math.ceil(stripW * vineScale));
        c.height = Math.max(1, Math.ceil(height * vineScale));
      });
    }
    vinesNeedPaint = true;
  }

  const LIGHT_X = 0.45; // light from above and from the middle of the page, in edge space
  const LIGHT_Y = -0.89;
  let scratch = new Float32Array(0);

  // Paint both caches at the given growth time (ms since the vines started).
  function paintVines(age) {
    for (let side = 0; side < 2; side++) {
      const body = vineBody[side].getContext("2d");
      const veins = vineVeins[side].getContext("2d");
      body.setTransform(1, 0, 0, 1, 0, 0);
      body.clearRect(0, 0, vineBody[side].width, vineBody[side].height);
      veins.setTransform(1, 0, 0, 1, 0, 0);
      veins.clearRect(0, 0, vineVeins[side].width, vineVeins[side].height);
      body.setTransform(vineScale, 0, 0, vineScale, 0, 0);
      veins.setTransform(vineScale, 0, 0, vineScale, 0, 0);
      veins.lineCap = "round";
      veins.lineJoin = "round";
      for (let j = 0; j < tendrils.length; j++) {
        const t = tendrils[j];
        if (t.side !== side) continue;
        const g = clamp((age - t.t0) / t.dur, 0, 1);
        if (g <= 0) continue;
        paintTendril(body, veins, t, Math.max(2, Math.ceil(t.n * g)));
      }
    }
  }

  function paintTendril(body, veins, t, m) {
    const p = t.pts;
    if (scratch.length < m * 4) scratch = new Float32Array(m * 4);
    const q = scratch; // per point: half width, normal x, normal y, offset of the lit ridge
    for (let i = 0; i < m; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(m - 1, i + 1);
      let tx = p[i1 * 2] - p[i0 * 2];
      let ty = p[i1 * 2 + 1] - p[i0 * 2 + 1];
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const u = i / (m - 1);
      // Fleshy: thick for most of its length, then a quick taper; knots along the way.
      const w = t.w0 * 0.5 * Math.pow(1 - u, 0.5) * (1 + 0.14 * Math.sin(i * 0.45 + t.seed));
      q[i * 4] = w;
      q[i * 4 + 1] = -ty;
      q[i * 4 + 2] = tx;
      // The ridge leans toward the light along the normal, so it always stays inside the body.
      q[i * 4 + 3] = (LIGHT_X * -ty + LIGHT_Y * tx) * 0.26 * w;
    }
    // Body: one filled outline.
    body.fillStyle = "rgb(15, 17, 26)";
    body.beginPath();
    for (let i = 0; i < m; i++) {
      const w = q[i * 4];
      if (i) body.lineTo(p[i * 2] + q[i * 4 + 1] * w, p[i * 2 + 1] + q[i * 4 + 2] * w);
      else body.moveTo(p[i * 2] + q[i * 4 + 1] * w, p[i * 2 + 1] + q[i * 4 + 2] * w);
    }
    for (let i = m - 1; i >= 0; i--) {
      const w = q[i * 4];
      body.lineTo(p[i * 2] - q[i * 4 + 1] * w, p[i * 2 + 1] - q[i * 4 + 2] * w);
    }
    body.closePath();
    body.fill();
    if (t.w0 > 1.6) {
      // Wet sheen: a lighter ridge on the lit side, then a thin glint along it.
      body.fillStyle = "rgba(54, 62, 88, 0.6)";
      body.beginPath();
      for (let i = 0; i < m; i++) {
        const o = q[i * 4 + 3] + q[i * 4] * 0.22;
        if (i) body.lineTo(p[i * 2] + q[i * 4 + 1] * o, p[i * 2 + 1] + q[i * 4 + 2] * o);
        else body.moveTo(p[i * 2] + q[i * 4 + 1] * o, p[i * 2 + 1] + q[i * 4 + 2] * o);
      }
      for (let i = m - 1; i >= 0; i--) {
        const o = q[i * 4 + 3] - q[i * 4] * 0.22;
        body.lineTo(p[i * 2] + q[i * 4 + 1] * o, p[i * 2 + 1] + q[i * 4 + 2] * o);
      }
      body.closePath();
      body.fill();
      if (t.w0 > 4) {
        body.strokeStyle = "rgba(160, 174, 206, 0.2)";
        body.lineWidth = clamp(t.w0 * 0.08, 0.6, 1.4);
        body.beginPath();
        const end = Math.floor(m * 0.85);
        for (let i = 0; i < end; i++) {
          const o = q[i * 4 + 3] + q[i * 4] * 0.08;
          if (i) body.lineTo(p[i * 2] + q[i * 4 + 1] * o, p[i * 2 + 1] + q[i * 4 + 2] * o);
          else body.moveTo(p[i * 2] + q[i * 4 + 1] * o, p[i * 2 + 1] + q[i * 4 + 2] * o);
        }
        body.stroke();
      }
    }
    if (!t.vein) return;
    // Veins, in the thick part only: a faint glow under the skin, then a thin red thread,
    // showing in stretches.
    const end = Math.max(2, Math.floor(m * 0.62));
    const passes = t.w0 > 4
      ? [[Math.min(t.w0 * 0.7, 12), "rgba(255, 40, 30, 0.045)"], [clamp(t.w0 * 0.09, 0.6, 1.4), "rgba(255, 70, 56, 0.42)"]]
      : [[clamp(t.w0 * 0.16, 0.5, 1), "rgba(255, 70, 56, 0.34)"]];
    veins.setLineDash(t.dash);
    passes.forEach((pass) => {
      veins.lineWidth = pass[0];
      veins.strokeStyle = pass[1];
      veins.beginPath();
      veins.moveTo(p[0], p[1]);
      for (let i = 1; i < end; i++) veins.lineTo(p[i * 2], p[i * 2 + 1]);
      veins.stroke();
    });
    veins.setLineDash([]);
    // Swollen nodes where the veins gather.
    t.nodes.forEach((at) => {
      const i = Math.floor(at * (t.n - 1));
      if (i >= m) return;
      const r = Math.max(2, q[i * 4] * 1.4);
      const x = p[i * 2];
      const y = p[i * 2 + 1];
      const grad = veins.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(255, 96, 76, 0.6)");
      grad.addColorStop(0.4, "rgba(255, 50, 40, 0.22)");
      grad.addColorStop(1, "rgba(255, 50, 40, 0)");
      veins.fillStyle = grad;
      veins.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }

  function drawVines(flare) {
    if (stormMix < 0.004) return;
    const breathe = (clock * TAU) / 6200;
    for (let side = 0; side < 2; side++) {
      // Breathing: the strip swells a little out of its edge, anchored at the edge. A pure
      // scale (mirrored on the right) keeps the blit on the fast, axis-aligned path.
      const b = 1 + 0.018 * Math.sin(breathe + side * 2.4);
      ctx.setTransform(side ? -dpr * b : dpr * b, 0, 0, dpr, side ? width * dpr : 0, 0);
      const pulse = 0.5 + 0.5 * Math.sin((clock * TAU) / 5600 + side * 1.7);
      const veins = clamp(stormMix * (0.3 + 0.6 * pulse + flare * 0.3), 0, 1);
      const bands = vineBands[side];
      for (let i = 0; i < bands.length; i++) {
        const y = bands[i][0];
        const h = bands[i][1] - y;
        const sy = y * vineScale;
        const sh = Math.min(h * vineScale, vineBody[side].height - sy);
        if (sh <= 0) continue;
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = stormMix;
        ctx.drawImage(vineBody[side], 0, sy, vineBody[side].width, sh, 0, y, stripW, sh / vineScale);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = veins;
        ctx.drawImage(vineVeins[side], 0, sy, vineVeins[side].width, sh, 0, y, stripW, sh / vineScale);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- Ash: rising through three depths, stirred by the pointer ----------

  let count = 0;
  let ax, ay, avx, avy, arise, asize, aphase, astir, apick;
  let alayer, akind, aspin;
  const LAYER_ALPHA = [0.34, 0.52, 0.72];
  const LAYER_PUSH = [0.5, 0.75, 1];

  function seedAsh() {
    const cap = small ? 250 : 560;
    count = Math.round(Math.min(cap, (width * height) / (small ? 1500 : 1800)) * QUALITY[quality].ash);
    ax = new Float32Array(count);
    ay = new Float32Array(count);
    avx = new Float32Array(count);
    avy = new Float32Array(count);
    arise = new Float32Array(count);
    asize = new Float32Array(count);
    aphase = new Float32Array(count);
    astir = new Float32Array(count);
    apick = new Float32Array(count);
    alayer = new Uint8Array(count);
    akind = new Uint8Array(count); // 0 mote, 1 flake, 2 out-of-focus near the camera, 3 glowing
    aspin = new Int8Array(count);
    let bokeh = small ? 5 : 9;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      const layer = r < 0.5 ? 0 : r < 0.84 ? 1 : 2;
      alayer[i] = layer;
      ax[i] = Math.random() * width;
      ay[i] = Math.random() * height;
      aphase[i] = rand(0, TAU);
      apick[i] = Math.random();
      if (layer === 2 && bokeh > 0) {
        bokeh--;
        akind[i] = 2;
        asize[i] = rand(8, small ? 16 : 22);
        arise[i] = rand(26, 40);
      } else if (layer === 2) {
        akind[i] = 1;
        asize[i] = rand(2.8, 5);
        arise[i] = rand(20, 32);
      } else {
        akind[i] = Math.random() < 0.06 ? 3 : 0;
        asize[i] = layer ? rand(1.7, 2.7) : rand(1.1, 1.8);
        arise[i] = layer ? rand(12, 20) : rand(7, 12);
      }
    }
  }

  // Short-lived ash flung out by a bloom.
  const BURST = 96;
  const bx = new Float32Array(BURST);
  const by = new Float32Array(BURST);
  const bvx = new Float32Array(BURST);
  const bvy = new Float32Array(BURST);
  const bage = new Float32Array(BURST).fill(1);
  const blife = new Float32Array(BURST).fill(1);
  const bsize = new Float32Array(BURST);
  let burstNext = 0;
  let rings = [];

  // Pointer segment travelled since the previous frame, consumed by step().
  const pointer = { x: 0, y: 0, prevX: 0, prevY: 0, active: false, moved: false };
  const pokes = [];

  // Push ash away from the segment a -> b and set it swirling: each mote curls back into the
  // wake on its own side, like water behind a finger.
  function stir(sx, sy, ex, ey, radius) {
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const ux = dx / len;
    const uy = dy / len;
    const speed = Math.min(len, 60);
    const r2 = radius * radius;
    for (let i = 0; i < count; i++) {
      let s = ((ax[i] - sx) * dx + (ay[i] - sy) * dy) / (len * len);
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const cx = ax[i] - (sx + dx * s);
      const cy = ay[i] - (sy + dy * s);
      const d2 = cx * cx + cy * cy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      const f = 1 - d / radius;
      const depth = LAYER_PUSH[alayer[i]];
      const push = (30 + speed * 7) * f * depth;
      avx[i] += (cx / d) * push + ux * speed * 3 * f * depth;
      avy[i] += (cy / d) * push + uy * speed * 3 * f * depth;
      aspin[i] = (cy / d) * ux - (cx / d) * uy > 0 ? 1 : -1;
      if (f > astir[i]) astir[i] = f;
    }
  }

  // Radial push (a tap, or the shock of a bloom).
  function blast(x, y, radius, strength, lit) {
    for (let i = 0; i < count; i++) {
      const dx = ax[i] - x;
      const dy = ay[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const d = Math.sqrt(d2) || 1;
      const f = 1 - d / radius;
      const push = strength * (0.35 + f) * LAYER_PUSH[alayer[i]];
      avx[i] += (dx / d) * push;
      avy[i] += (dy / d) * push;
      aspin[i] = Math.random() < 0.5 ? 1 : -1;
      const lift = f * lit;
      if (lift > astir[i]) astir[i] = lift;
    }
  }

  function bloom(x, y) {
    if (reducedMotion.matches || !count) return;
    rings.push({ x: x, y: y, t0: clock });
    if (rings.length > 4) rings.shift();
    const radius = small ? 170 : 240;
    blast(x, y, radius * 1.1, 260, 0.9);
    const n = small ? 26 : 40;
    for (let k = 0; k < n; k++) {
      const i = burstNext;
      burstNext = (burstNext + 1) % BURST;
      const a = rand(0, TAU);
      const v = rand(140, 460);
      bx[i] = x + Math.cos(a) * 6;
      by[i] = y + Math.sin(a) * 6;
      bvx[i] = Math.cos(a) * v;
      bvy[i] = Math.sin(a) * v;
      bage[i] = 0;
      blife[i] = rand(0.8, 1.3);
      bsize[i] = rand(1.4, 3.4);
    }
  }

  // ---------- The loop ----------

  function step(dt) {
    clock += dt;
    const sec = dt / 1000;
    const k = dt / 16.67;
    stormMix += (theme.storm - stormMix) * (1 - Math.exp(-dt / 380));

    // Vines grow once, in the first seconds; out of sight they simply finish.
    if (!grown) {
      if (growStart < 0) growStart = clock;
      if (clock - growStart >= growEnd || stormMix < 0.01) grown = true;
      vinesNeedPaint = true;
    }

    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.x += c.v * sec;
      if (c.x - c.w / 2 > width + c.w * 0.1) c.x -= c.span;
    }
    for (let b = 0; b < FOG.length; b++) FOG[b].off += FOG[b].v * sec * theme.calm;

    // Lightning: due strikes, then the next burst when the storm is up.
    for (let i = strikes.length - 1; i >= 0; i--) {
      if (strikes[i].at <= clock) {
        if (stormMix > 0.5) strike(strikes[i]);
        strikes.splice(i, 1);
      }
    }
    for (let i = lights.length - 1; i >= 0; i--) {
      if (clock - lights[i].t0 > 1600) lights.splice(i, 1);
    }
    if (theme.storm && stormMix > 0.9 && clock >= nextBurst) burst(rand(0.55, 1));

    if (pointer.moved) {
      stir(pointer.prevX, pointer.prevY, pointer.x, pointer.y, small ? 72 : 120);
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      pointer.moved = false;
    }
    while (pokes.length) {
      const p = pokes.shift();
      blast(p.x, p.y, small ? 60 : 80, 70, 0.6);
    }

    const drag = Math.pow(0.965, k);
    const settle = Math.pow(0.984, k);
    const rise = theme.rise;
    const calm = theme.calm;
    const t1 = clock * 0.00031;
    const t2 = clock * 0.00023;
    for (let i = 0; i < count; i++) {
      // Gentle turbulence: two slow sine fields, stronger near the camera.
      const depth = LAYER_PUSH[alayer[i]];
      const n1 = Math.sin(ay[i] * 0.006 + t1 + aphase[i]);
      const n2 = Math.sin(ax[i] * 0.0045 - t2 + aphase[i] * 0.5);
      const vx = (n1 * 14 + n2 * 8) * depth * calm;
      const vy = -arise[i] * rise * (0.75 + 0.25 * n2) + n1 * 5 * (1 - rise) * calm;
      // A stirred mote's own motion curls round while it fades.
      if (astir[i] > 0.02) {
        const turn = aspin[i] * astir[i] * 2.6 * sec;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const x = avx[i];
        avx[i] = x * c - avy[i] * s;
        avy[i] = x * s + avy[i] * c;
        astir[i] *= settle;
      }
      avx[i] *= drag;
      avy[i] *= drag;
      ax[i] += (vx + avx[i]) * sec;
      ay[i] += (vy + avy[i]) * sec;
      if (ay[i] < -30) {
        ay[i] += height + 60;
        ax[i] = Math.random() * width;
      } else if (ay[i] > height + 30) ay[i] -= height + 60;
      if (ax[i] < -30) ax[i] += width + 60;
      else if (ax[i] > width + 30) ax[i] -= width + 60;
    }

    const bdrag = Math.pow(0.9, k);
    for (let i = 0; i < BURST; i++) {
      if (bage[i] >= blife[i]) continue;
      bage[i] += sec;
      bvx[i] *= bdrag;
      bvy[i] = bvy[i] * bdrag - 14 * rise * sec * 4;
      bx[i] += bvx[i] * sec;
      by[i] += bvy[i] * sec;
    }
    if (rings.length && clock - rings[0].t0 > 1100) rings.shift();
  }

  // The lamp's beam in the shadow theatre: where its pool of light is on the back wall.
  function beamAt(x, y) {
    const dx = (x - width * 0.5) / Math.max(width * 0.55, 220);
    const dy = (y - viewH * 0.22) / (viewH * 0.42);
    const d = dx * dx + dy * dy;
    return d >= 1 ? 0.12 : 0.12 + 0.88 * (1 - d) * (1 - d);
  }

  function drawAsh(flare) {
    const twinkleT = clock * 0.0013;
    const tumbleT = clock * 0.0016;
    const alt = theme.altRate;
    const beam = !!theme.beam;
    const shine = theme.shine;
    // Lightning catches the ash in the upper half of the page.
    const flash = flare * stormMix * 0.8;
    ctx.globalCompositeOperation = "source-over";
    for (let layer = 0; layer < 3; layer++) {
      const base = LAYER_ALPHA[layer];
      for (let i = 0; i < count; i++) {
        if (alayer[i] !== layer) continue;
        const x = ax[i];
        const y = ay[i];
        let a = (base * (0.72 + 0.28 * Math.sin(twinkleT + aphase[i])) + astir[i] * 0.35) * shine;
        if (beam) a *= beamAt(x, y);
        if (flash > 0.01 && y < viewH * 0.6) a *= 1 + flash * (1 - y / (viewH * 0.6));
        const isAlt = apick[i] < alt;
        const kind = akind[i];
        if (kind === 2) {
          const d = asize[i] * 2;
          ctx.globalAlpha = Math.min(1, a * 0.17);
          ctx.drawImage(spr.bokeh, x - d / 2, y - d / 2, d, d);
        } else if (kind === 1) {
          const tumble = Math.abs(Math.cos(tumbleT * (0.6 + apick[i]) + aphase[i]));
          const h = asize[i] * 2.6;
          const w = h * (0.3 + 0.7 * tumble);
          ctx.globalAlpha = Math.min(1, a * (0.6 + 0.4 * tumble));
          ctx.drawImage(isAlt ? spr.flakeAlt : spr.flakes[i % 3], x - w / 2, y - h / 2, w, h);
        } else {
          const d = asize[i] * 3 * (1 + astir[i] * 0.4);
          ctx.globalAlpha = Math.min(1, a);
          ctx.drawImage(isAlt ? spr.moteAlt : spr.mote, x - d / 2, y - d / 2, d, d);
        }
      }
    }
    // Stirred ash leaves short streaks along its swirl, so the wake reads even at a glance.
    ctx.strokeStyle = spr.streak;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.1;
    for (let b = 0; b < 3; b++) {
      const lo = 0.15 + b * 0.28;
      const hi = b === 2 ? 2 : lo + 0.28;
      ctx.globalAlpha = Math.min(1, (0.16 + b * 0.14) * shine);
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const st = astir[i];
        if (st <= lo || st > hi || akind[i] === 2) continue;
        const sp = Math.hypot(avx[i], avy[i]);
        if (sp < 18) continue;
        const l = Math.min(sp * 0.05, 22) / sp;
        ctx.moveTo(ax[i], ay[i]);
        ctx.lineTo(ax[i] - avx[i] * l, ay[i] - avy[i] * l);
      }
      ctx.stroke();
    }
    // Halos of the glowing motes and the freshly stirred ones.
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < count; i++) {
      const glow = (akind[i] === 3 ? 0.32 : 0) + astir[i] * 0.34;
      if (glow < 0.03) continue;
      let a = glow * (0.7 + 0.3 * Math.sin(twinkleT * 1.4 + aphase[i]));
      if (beam) a *= beamAt(ax[i], ay[i]);
      const d = asize[i] * 9 + astir[i] * 14;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(apick[i] < alt ? spr.haloAlt : spr.halo, ax[i] - d / 2, ay[i] - d / 2, d, d);
    }
  }

  function drawBloom() {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < BURST; i++) {
      if (bage[i] >= blife[i]) continue;
      const life = bage[i] / blife[i];
      const fade = Math.pow(1 - life, 1.2);
      const d = bsize[i] * 3;
      ctx.globalAlpha = fade * 0.9;
      ctx.drawImage(spr.mote, bx[i] - d / 2, by[i] - d / 2, d, d);
      // Embers at first: lit by the shock, then plain ash.
      const hot = Math.max(0, 1 - life * 2.2);
      if (hot > 0.02) {
        const h = bsize[i] * 8;
        ctx.globalAlpha = hot * 0.55;
        ctx.drawImage(spr.core, bx[i] - h / 2, by[i] - h / 2, h, h);
      }
    }
    const R = small ? 170 : 240;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const t = (clock - ring.t0) / 1000;
      if (t < 0 || t >= 1) continue;
      const e = 1 - Math.pow(1 - t, 3);
      // The flash at the centre.
      const c = R * 0.55 * (0.6 + 0.4 * e);
      ctx.globalAlpha = Math.pow(1 - t, 2.5) * 0.6;
      ctx.drawImage(spr.core, ring.x - c, ring.y - c, c * 2, c * 2);
      // The shock ring, and a fainter echo just behind it.
      const r = R * (0.1 + 0.9 * e);
      ctx.globalAlpha = Math.pow(1 - t, 1.6) * 0.9;
      ctx.drawImage(spr.ring, ring.x - r, ring.y - r, r * 2, r * 2);
      const t2 = t - 0.12;
      if (t2 > 0) {
        const r2 = R * 0.72 * (1 - Math.pow(1 - t2, 3));
        ctx.globalAlpha = Math.pow(1 - t2, 2) * 0.35;
        ctx.drawImage(spr.ring, ring.x - r2, ring.y - r2, r2 * 2, r2 * 2);
      }
    }
  }

  function drawBolts() {
    if (stormMix < 0.004) return;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < lights.length; i++) {
      const bolt = lights[i].bolt;
      if (!bolt) continue;
      const t = clock - lights[i].t0;
      if (t < 0 || t > bolt.dur) continue;
      ctx.globalAlpha = (1 - Math.pow(t / bolt.dur, 2) * 0.6) * stormMix;
      ctx.drawImage(bolt.canvas, bolt.x, bolt.y, bolt.w, bolt.h);
    }
  }

  function render() {
    let flare = 0;
    for (let i = 0; i < lights.length; i++) flare = Math.max(flare, lightLevel(lights[i]));

    paintSky();
    // The sky replaces the whole previous frame ("copy"): no separate full-screen clear.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "copy";
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sky, 0, 0, sky.width / skyScale, sky.height / skyScale);
    ctx.globalCompositeOperation = "source-over";
    drawBolts();
    if (vinesNeedPaint && stormMix > 0.004) {
      paintVines(grown ? Infinity : clock - growStart);
      vinesNeedPaint = !grown;
    }
    drawVines(flare);
    drawAsh(flare);
    drawBloom();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  // Frame cost watch: if the scene is too heavy for this device, step its quality down. The
  // script's own time misses work the GPU does later, so long frames count too (a phone saving
  // battery at 30 fps only steps down if our share of the frame is real, over 3 ms).
  let workAvg = 0;
  let gapAvg = 0;
  let workFrames = 0;

  function frame(time) {
    const gap = lastTime ? time - lastTime : 16.67;
    const dt = Math.min(gap, 50);
    lastTime = time;
    const begin = performance.now();
    step(dt);
    render();
    const work = performance.now() - begin;
    workAvg = workAvg ? workAvg * 0.95 + work * 0.05 : work;
    gapAvg = gapAvg ? gapAvg * 0.95 + Math.min(gap, 100) * 0.05 : gap;
    // Below ~40 fps with real work on our side: a mid-range phone settles in about 1.5 s.
    const slow = workAvg > 7 || (gapAvg > 24 && workAvg > 3);
    if (++workFrames > 90 && grown && slow && quality < QUALITY.length - 1) {
      quality++;
      workFrames = 0;
      workAvg = 0;
      gapAvg = 0;
      count = Math.round(count * (QUALITY[quality].ash / QUALITY[quality - 1].ash));
      resize(false);
      // Resizing wipes the canvas: repaint now so no empty frame is shown.
      render();
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    stop();
    if (reducedMotion.matches) {
      // One still frame: grown vines, scattered ash, calm clouds, no lightning.
      strikes.length = 0;
      lights.length = 0;
      rings = [];
      bage.fill(1);
      if (count) astir.fill(0);
      stormMix = theme.storm;
      grown = true;
      vinesNeedPaint = true;
      clearTimeout(stormTimer);
      delete root.dataset.storm;
      render();
      return;
    }
    lastTime = 0;
    workFrames = 0; // a tab switch must not count as slow frames
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function isSmallScreen() {
    return Math.min(window.innerWidth, window.innerHeight) < 700;
  }

  // Size the canvas and its buffers; `rebuild` lays the scene out again (new size), otherwise
  // only the resolution changes (quality step).
  function resize(rebuild) {
    small = isSmallScreen();
    width = window.innerWidth;
    // Extra height on phones covers the strip revealed when the URL bar retracts.
    height = window.innerHeight + (small ? URL_BAR : 0);
    viewH = window.innerHeight;
    lastViewport = { w: window.innerWidth, h: window.innerHeight };
    const q = QUALITY[quality];
    dpr = Math.min(window.devicePixelRatio || 1, q.dpr[small ? 1 : 0]);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    skyScale = q.sky;
    sky.width = fogBuf.width = Math.max(1, Math.ceil(width * skyScale));
    sky.height = fogBuf.height = Math.max(1, Math.ceil(height * skyScale));
    // How much fog to take away over the reading column (CSS px, drawn in the fog buffer).
    const column = Math.min(340, width * 0.5);
    const cut = small ? 0.35 : 0.6;
    fogMask = fogCtx.createLinearGradient(0, 0, width, 0);
    fogMask.addColorStop(0, "rgba(0, 0, 0, 0)");
    fogMask.addColorStop(clamp(0.5 - (column + 120) / width, 0, 0.5), "rgba(0, 0, 0, 0)");
    fogMask.addColorStop(clamp(0.5 - (column - 60) / width, 0, 0.5), "rgba(0, 0, 0, " + cut + ")");
    fogMask.addColorStop(clamp(0.5 + (column - 60) / width, 0.5, 1), "rgba(0, 0, 0, " + cut + ")");
    fogMask.addColorStop(clamp(0.5 + (column + 120) / width, 0.5, 1), "rgba(0, 0, 0, 0)");
    fogMask.addColorStop(1, "rgba(0, 0, 0, 0)");
    if (rebuild !== false) {
      layoutSky();
      makeVines();
      seedAsh();
      // A new layout appears grown: the vines only creep in once, on arrival.
      if (growStart >= 0) grown = true;
    }
    sizeVineCaches();
  }

  function setTheme(name) {
    const key = Object.prototype.hasOwnProperty.call(THEMES, name) ? name : "";
    if (key === themeKey) return;
    themeKey = key;
    theme = THEMES[key];
    buildThemeSprites();
    vinesNeedPaint = true;
    // Landing straight in a room: no storm fading out first.
    if (clock < 800) stormMix = theme.storm;
    if (theme.storm) scheduleBurst(5000, 12000);
    // The still frame of reduced motion is redrawn; the moving scene eases into the new room.
    if (reducedMotion.matches) start();
  }

  function flash(strength) {
    if (reducedMotion.matches || !rafId || !theme.storm || stormMix < 0.5) return;
    const s = typeof strength === "number" && isFinite(strength) ? clamp(strength, 0, 1) : 1;
    if (s > 0) burst(Math.max(0.25, s));
  }

  function trackPoint(x, y) {
    if (!pointer.active) {
      pointer.prevX = x;
      pointer.prevY = y;
      pointer.active = true;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.moved = true;
  }

  function releasePoint() {
    pointer.active = false;
  }

  function poke(x, y) {
    if (rafId && pokes.length < 4) pokes.push({ x: x, y: y });
  }

  // Pointer events stop once a touch turns into a scroll, so touch is tracked too.
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") trackPoint(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") poke(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener("pointerleave", releasePoint, { passive: true });
  document.addEventListener("mouseleave", releasePoint, { passive: true });
  window.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (t) {
      releasePoint();
      trackPoint(t.clientX, t.clientY);
      poke(t.clientX, t.clientY);
    }
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (t) trackPoint(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener("touchend", releasePoint, { passive: true });
  window.addEventListener("touchcancel", releasePoint, { passive: true });

  window.addEventListener("plankton:bloom", (e) => {
    if (e.detail) bloom(e.detail.x, e.detail.y);
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Mobile browsers resize height when the URL bar slides: ignore those.
      if (window.innerWidth === lastViewport.w && Math.abs(window.innerHeight - lastViewport.h) < URL_BAR) return;
      resize();
      start();
    }, 150);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", start);
  }

  window.Upside = { bloom: bloom, setTheme: setTheme, flash: flash };
  window.Plankton = window.Upside;

  buildThemeSprites();
  resize();
  scheduleBurst(3500, 5500);
  start();
})();
