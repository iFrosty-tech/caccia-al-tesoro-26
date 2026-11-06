// Il cuore del varco: the loading object of a video riddle, drawn on a small canvas. A shard of
// dark obsidian veined with fissures. As the download arrives, the rift light rises inside it
// from the bottom tip like a level: the facets and the veins below it burn red, its front glows
// orange; while the video is decrypted the shard beats like a heart (lub-dub) and draws the ash
// around it inwards; the finished shard cracks open along its length, light floods out of the
// split and a few splinters fly before the video takes its place. The player can spin it with a
// finger while waiting. Colours come from the theme tokens on body, read once at mount, so every
// room tints it.
// Exposes window.Crystal.mount(container, options), which returns a controller
// { setProgress(fraction | null), setPhase("download" | "decrypt"), finish() -> Promise, destroy() }.
// Where the canvas is unavailable the controller is a set of no-ops, so callers never branch.

(function () {
  "use strict";

  function idle() {
    return {
      setProgress: function () {},
      setPhase: function () {},
      finish: function () {
        return Promise.resolve();
      },
      destroy: function () {},
    };
  }
  window.Crystal = { mount: idle };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = Math.PI * 2;

  // Camera distance in shard lengths (the farthest corner sits at 1): a mild perspective.
  const CAMERA = 3.6;
  // One cold light, upper left and in front; HALF is its Blinn half vector, for the glints.
  const LIGHT = normalize([-0.45, 0.7, 0.6]);
  const HALF = normalize([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
  // The same light on screen (y down): a glint runs across a facet from that side.
  const GLINT = [-0.54, -0.84];
  const REACH = 0.41; // the shard's farthest corner, as a share of the canvas side
  const IDLE_SPIN = 0.32; // rad/s around the shard's own axis
  const DECRYPT_SPIN = 0.6;
  // Decryption beats like a slow heart: a lub, a softer dub, a rest. Under 2 beats a second.
  const BEAT_PERIOD = 1.15;
  const DUB_DELAY = 0.27;
  const RIFT_PERIOD = 5.2; // the rift light breathes this slowly while downloading
  const FINISH_MS = 950;
  const CRACK_AT = 0.3; // share of the finish spent heating up before the shard splits
  const FINISH_REDUCED_MS = 300;
  const TAP_MS = 250;
  const TAP_PX = 8;
  const MOTE_COUNT = 34;
  const SPLINTERS = 9;
  // Vein strokes are batched by glow level: one stroke per level instead of one per segment.
  const LEVELS = 9;
  const VEIN_MAX = 1.5; // glow 1 is a lit vein at the rising front, 1.5 white-hot
  const VEIN_WIDTHS = [1, 0.72, 0.5]; // main fissure, its thinning tail, a branch

  // ---------- Small vector and matrix helpers (row-major 3x3) ----------

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function normalize(v) {
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
  }

  function rotX(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [1, 0, 0, 0, c, -s, 0, s, c];
  }

  function rotY(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  }

  function rotZ(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }

  function multiply(m, n) {
    const out = new Array(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out[r * 3 + c] = m[r * 3] * n[c] + m[r * 3 + 1] * n[3 + c] + m[r * 3 + 2] * n[6 + c];
      }
    }
    return out;
  }

  function apply(m, v) {
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
    ];
  }

  // Rotate in view space: a drag to the right turns the near side to the right, whatever the
  // shard's current orientation.
  function turn(rot, yaw, pitch) {
    return multiply(rotY(yaw), multiply(rotX(pitch), rot));
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function decay(rate, dt) {
    return 1 - Math.exp(-rate * dt);
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // A fixed seed: every player holds the same shard with the same fissures.
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- The shard ----------

  // An icosahedron stood on a tip (apex, two staggered rings of five, apex), stretched into a
  // double-terminated crystal and roughened: rings twisted and pushed in and out, tips off axis
  // and the bottom one shorter, so it reads as a broken shard rather than a cut gem.
  const CORNERS = (function () {
    const random = seeded(0x5077050);
    const jitter = function (amount) {
      return (random() * 2 - 1) * amount;
    };
    const corners = [[0.3, 1.6, -0.12]];
    for (let ring = 0; ring < 2; ring++) {
      for (let k = 0; k < 5; k++) {
        const a = ((k + ring * 0.5) * TAU) / 5 + jitter(0.24);
        const r = (ring ? 0.9 : 0.97) * (1 + jitter(0.24));
        corners.push([r * Math.cos(a), (ring ? -0.42 : 0.5) + jitter(0.15), r * Math.sin(a)]);
      }
    }
    corners.push([-0.16, -1.22, 0.12]);
    let far = 0;
    corners.forEach(function (c) {
      far = Math.max(far, Math.hypot(c[0], c[1], c[2]));
    });
    return corners.map(function (c) {
      return [c[0] / far, c[1] / far, c[2] / far];
    });
  })();
  const TOP_TIP = 0;
  const BOTTOM_TIP = 11;
  const TRIANGLES = [];
  for (let k = 0; k < 5; k++) {
    const u0 = 1 + k;
    const u1 = 1 + ((k + 1) % 5);
    const l0 = 6 + k;
    const l1 = 6 + ((k + 1) % 5);
    TRIANGLES.push([TOP_TIP, u0, u1], [u0, l0, u1], [l0, l1, u1], [BOTTOM_TIP, l1, l0]);
  }
  const FACE_COUNT = TRIANGLES.length;

  // Each face keeps its corners, its outward normal and the heights it spans, which say how
  // much of it the rising light holds.
  const FACES = TRIANGLES.map(function (tri) {
    const a = CORNERS[tri[0]];
    const b = CORNERS[tri[1]];
    const c = CORNERS[tri[2]];
    const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    let normal = normalize(cross(sub(b, a), sub(c, a)));
    if (dot(normal, centre) < 0) normal = [-normal[0], -normal[1], -normal[2]];
    return {
      corners: tri,
      points: [a, b, c],
      normal: normal,
      low: Math.min(a[1], b[1], c[1]),
      high: Math.max(a[1], b[1], c[1]),
    };
  });

  // A face on the bottom tip: the tip's glow follows it when the shard splits.
  const BOTTOM_FACE = FACES.findIndex(function (face) {
    return face.corners[0] === BOTTOM_TIP;
  });
  const BOTTOM = CORNERS[BOTTOM_TIP][1];
  const TOP = CORNERS[TOP_TIP][1];

  // The part of a polygon (corners in the shard's own space) between two heights.
  function clipBand(poly, lo, hi) {
    const below = clipAt(poly, hi, 1);
    return lo > -Infinity && below.length ? clipAt(below, lo, -1) : below;
  }

  // Keeps the side where sign * (y - h) <= 0.
  function clipAt(poly, h, sign) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const dp = sign * (p[1] - h);
      const dq = sign * (q[1] - h);
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, h, p[2] + (q[2] - p[2]) * t]);
      }
    }
    return out;
  }

  // Where the plane at height h cuts a face: the two ends of the light's front on it, or null.
  function crossing(face, h) {
    if (h <= face.low || h >= face.high) return null;
    const ends = [];
    for (let i = 0; i < 3; i++) {
      const p = face.points[i];
      const q = face.points[(i + 1) % 3];
      if ((p[1] - h) * (q[1] - h) < 0) {
        const t = (h - p[1]) / (q[1] - p[1]);
        ends.push([p[0] + (q[0] - p[0]) * t, h, p[2] + (q[2] - p[2]) * t]);
      }
    }
    return ends.length === 2 ? ends : null;
  }

  // Where a ray from the centre leaves the shard (it is star-shaped around its centre, so
  // there is exactly one such point), and on which face.
  function castRay(d) {
    for (let i = 0; i < FACE_COUNT; i++) {
      const tri = FACES[i].corners;
      const a = CORNERS[tri[0]];
      const e1 = sub(CORNERS[tri[1]], a);
      const e2 = sub(CORNERS[tri[2]], a);
      const p = cross(d, e2);
      const det = dot(e1, p);
      if (Math.abs(det) < 1e-9) continue;
      const s = [-a[0], -a[1], -a[2]];
      const u = dot(s, p) / det;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      const q = cross(s, e1);
      const v = dot(d, q) / det;
      if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const t = dot(e2, q) / det;
      if (t > 0) return { point: [d[0] * t, d[1] * t, d[2] * t], face: i };
    }
    return null;
  }

  // The fissures: jagged cracks that start at the bottom tip, where the light gets in, and climb
  // the surface with a few side branches. Walked on the sphere of directions and laid onto the
  // faces, so they run continuously across the edges. Each segment remembers its face (it moves
  // with it when the shard splits) and its height (when the rising light reaches it).
  const VEINS = (function () {
    const random = seeded(0xf155e5);
    const points = [];
    const segments = [];

    function place(theta, phi) {
      const hit = castRay([Math.sin(theta) * Math.cos(phi), -Math.cos(theta), Math.sin(theta) * Math.sin(phi)]);
      if (!hit) return -1;
      points.push(hit.point);
      return points.length - 1;
    }

    function link(a, b, width) {
      const pa = points[a];
      const pb = points[b];
      const mid = castRay(normalize([pa[0] + pb[0], pa[1] + pb[1], pa[2] + pb[2]]));
      segments.push({ a: a, b: b, width: width, face: mid ? mid.face : 0, height: (pa[1] + pb[1]) / 2 });
    }

    function crack(theta, phi, steps, rise, drift, main) {
      let from = place(theta, phi);
      let bend = 0;
      for (let i = 0; i < steps && from >= 0; i++) {
        bend = bend * 0.45 + (random() * 2 - 1) * 0.26 + drift;
        phi += bend;
        theta += rise * (0.6 + 0.8 * random());
        if (theta > Math.PI - 0.12) break;
        const to = place(theta, phi);
        if (to < 0) break;
        link(from, to, main ? (i < steps * 0.6 ? 0 : 1) : 2);
        if (main && i > 2 && random() < 0.2) {
          const side = random() < 0.5 ? -1 : 1;
          crack(theta, phi, 3 + Math.floor(random() * 5), rise * 0.55, side * (0.13 + 0.12 * random()), false);
        }
        from = to;
      }
    }

    [25, 17, 22, 12, 20].forEach(function (steps, k) {
      crack(0.1 + 0.18 * random(), (k * TAU) / 5 + 0.3 + (random() * 2 - 1) * 0.35, steps, 0.12, 0, true);
    });
    return { points: points, segments: segments };
  })();

  // ---------- Colours from the theme tokens ----------

  // Fallbacks: the Sottosopra's own tokens (style.css :root).
  const DEFAULTS = {
    light: [255, 74, 61],
    wake: [227, 38, 46],
    deep: [163, 18, 26],
    storm: [92, 14, 24],
    sheen: [255, 196, 184],
    foam: [255, 241, 234],
    abyss: [6, 7, 13],
    ash: [184, 196, 214],
    warm: [255, 195, 92],
  };

  function readPalette() {
    const style = getComputedStyle(document.body);
    const light = channels(style.getPropertyValue("--light-rgb"), DEFAULTS.light);
    const sheen = channels(style.getPropertyValue("--sheen-rgb"), DEFAULTS.sheen);
    const foam = channels(style.getPropertyValue("--foam-rgb"), DEFAULTS.foam);
    const abyss = hexChannels(style.getPropertyValue("--abyss"), DEFAULTS.abyss);
    const ash = channels(style.getPropertyValue("--ash-rgb"), DEFAULTS.ash);
    const warm = channels(style.getPropertyValue("--success-rgb"), DEFAULTS.warm);
    // The glass takes the cold of the ash and a little of the room's own sheen.
    const cold = mix(ash, sheen, 0.3);
    return {
      light: light,
      wake: channels(style.getPropertyValue("--wake-rgb"), DEFAULTS.wake),
      deep: channels(style.getPropertyValue("--wake-deep-rgb"), DEFAULTS.deep),
      storm: channels(style.getPropertyValue("--deep-rgb"), DEFAULTS.storm),
      foam: foam,
      abyss: abyss,
      ash: ash,
      cold: cold,
      glass: mix(abyss, cold, 0.24),
      // The hot front of a vein: the rift light pulled towards the room's warm lamp (orange
      // in the Sottosopra, the room's own light elsewhere).
      ember: mix(light, warm, 0.5),
    };
  }

  function channels(value, fallback) {
    const parts = String(value).split(",").map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback;
  }

  function hexChannels(value, fallback) {
    let hex = String(value).trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.replace(/./g, "$&$&");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(c, alpha) {
    return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + clamp(alpha, 0, 1).toFixed(3) + ")";
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  // The look of each vein glow level, computed once per mount: a dormant crack is a dark red
  // hairline in the stone; a lit one burns red, its rising front orange, the finish white-hot.
  function veinStyles(palette) {
    const dormant = mix(palette.storm, palette.deep, 0.5);
    const styles = [];
    for (let i = 0; i < LEVELS; i++) {
      const g = (i / (LEVELS - 1)) * VEIN_MAX;
      let core;
      if (g < 0.5) core = mix(dormant, palette.light, g / 0.5);
      else if (g < 1) core = mix(palette.light, palette.ember, (g - 0.5) / 0.5);
      else core = mix(palette.ember, palette.foam, (g - 1) / 0.5);
      const on = Math.min(1, g / 0.6);
      styles.push({
        core: rgba(core, 0.5 + 0.5 * on),
        glow: rgba(g > 1 ? mix(palette.light, palette.ember, g - 1) : palette.light, 0.3 * on + 0.2 * Math.max(0, g - 1)),
        haze: rgba(palette.wake, 0.1 * on + 0.08 * Math.max(0, g - 1)),
        lit: g > 0.05,
      });
    }
    return styles;
  }

  // ---------- One mounted shard ----------

  function mount(container, options) {
    if (!container || !document.createElement("canvas").getContext) return idle();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return idle();
    canvas.className = "crystal-canvas";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const palette = readPalette();
    const styles = veinStyles(palette);
    const lightFill = rgba(palette.light, 1);
    const hotLayer = rgba(palette.ember, 1);
    const splinterFill = rgba(mix(palette.abyss, palette.glass, 0.5), 1);
    const seamStyles = {
      haze: rgba(palette.light, 0.16),
      glow: rgba(palette.ember, 0.55),
      core: rgba(mix(palette.ember, palette.foam, 0.55), 0.95),
    };
    const bloomOnFinish = !options || options.bloom !== false;

    let size = 0;
    let dpr = 1;
    // Leaning a little, top towards the viewer, so it stands like a shard stuck in the ground.
    let rot = multiply(rotZ(-0.2), multiply(rotX(0.3), rotY(0.5)));
    let progress = null; // fraction received, or null while the total is unknown
    let lit = 0; // the fraction currently shown, eased towards the target
    let phase = "download";
    let heart = 0; // blend into the decrypt heartbeat
    let beat = 0; // the heartbeat right now, 0..1
    let pulse = 0; // energy of a tap, fading
    let spinY = 0; // angular velocities of a flick around the screen axes, rad/s
    let spinX = 0;
    let axisSpin = 0; // the idle turn around the shard's own axis, rad/s
    let finishAt = 0;
    let finishMs = 0;
    let finishTimer = 0;
    let crackTimer = 0;
    let finishResolve = null;
    let finishPromise = null;
    let split = null; // how the shard breaks, fixed as the finish begins
    let destroyed = false;
    let visible = true;
    let rafId = 0;
    let lastTime = 0;
    let clock = 0;
    let lean = false; // set once if this device turns out too slow for every touch
    const drag = { active: false, id: 0, x: 0, y: 0, startX: 0, startY: 0, startTime: 0, lastMove: 0, vx: 0, vy: 0 };

    // Ash around the shard, drawn in while it beats: angle and distance on an ellipse around
    // the centre (1 at the rim of the canvas), sinking in faster on every beat.
    const motes = [];
    for (let i = 0; i < MOTE_COUNT; i++) motes.push(spawn({}, 0.3 + 0.7 * Math.random()));

    function spawn(mote, dist) {
      mote.angle = Math.random() * TAU;
      mote.dist = dist;
      mote.speed = 0.12 + 0.12 * Math.random();
      mote.swirl = (Math.random() < 0.5 ? -1 : 1) * (0.2 + 0.35 * Math.random());
      mote.size = 0.7 + 1.1 * Math.random();
      mote.front = Math.random() < 0.45;
      return mote;
    }

    function motion() {
      return !reducedMotion.matches;
    }

    function finishing() {
      return finishAt > 0;
    }

    function target() {
      if (phase === "decrypt" || finishing()) return 1;
      return progress === null ? lit : progress;
    }

    // Frames run only while something moves: always under free motion (the idle turn), only on
    // demand under reduced motion.
    function animating() {
      if (destroyed || !visible || document.hidden) return false;
      if (drag.active || finishing() || pulse > 0.01 || Math.abs(target() - lit) > 0.002) return true;
      return motion();
    }

    function schedule() {
      if (rafId || destroyed) return;
      rafId = requestAnimationFrame(frame);
    }

    function frame(now) {
      rafId = 0;
      if (destroyed) return;
      if (!size) resize();
      const gap = lastTime ? now - lastTime : 0;
      const dt = lastTime ? Math.min(0.05, gap / 1000) : 1 / 60;
      lastTime = now;
      clock += dt;
      step(dt);
      const begin = performance.now();
      draw(now);
      if (gap) watch(performance.now() - begin, gap);
      if (animating()) schedule();
      else lastTime = 0;
    }

    // Frame cost watch, like the page background's: if frames keep running long, the shard
    // drops its costliest touches (the wide haze of the veins, the glints, the far veins). The
    // script's own time misses work the GPU does later, so long gaps between frames count too.
    let workAvg = 0;
    let gapAvg = 0;
    let watched = 0;
    function watch(work, gap) {
      if (lean) return;
      workAvg = workAvg ? workAvg * 0.95 + work * 0.05 : work;
      gapAvg = gapAvg ? gapAvg * 0.95 + Math.min(gap, 100) * 0.05 : gap;
      if (++watched > 120 && (workAvg > 6 || (gapAvg > 40 && workAvg > 2))) lean = true;
    }

    // DPR capped at 2, and at 1.5 on a phone (the site's canvas budget).
    function resize() {
      const rect = canvas.getBoundingClientRect();
      size = Math.round(rect.width);
      dpr = Math.min(window.innerWidth < 700 ? 1.5 : 2, window.devicePixelRatio || 1);
      const px = Math.max(1, Math.round(size * dpr));
      if (canvas.width !== px) canvas.width = px;
      if (canvas.height !== px) canvas.height = px;
    }

    function heartbeat(t) {
      const p = t % BEAT_PERIOD;
      return Math.min(1, thump(p) + 0.68 * thump(p - DUB_DELAY) + thump(p - BEAT_PERIOD));
    }

    // One beat: a quick swell (peak after 60 ms) and a slower ebb.
    function thump(x) {
      if (x < 0) return 0;
      const k = x / 0.06;
      return k * Math.exp(1 - k);
    }

    function step(dt) {
      const free = motion();
      const wantHeart = phase === "decrypt" || finishing() ? 1 : 0;
      if (!free) {
        // Reduced motion: every state is shown at once, nothing turns on its own.
        spinX = spinY = axisSpin = 0;
        lit = target();
        heart = wantHeart;
        beat = 0;
        pulse = 0;
        return;
      }
      if (finishing()) {
        // The shard seizes up: the crack runs along a line that must not move.
        spinX = spinY = axisSpin = 0;
      } else if (!drag.active) {
        // Friction: a flick settles, and the slow turn around the shard's own axis comes back.
        spinY += (0 - spinY) * decay(2.2, dt);
        spinX += (0 - spinX) * decay(2.2, dt);
        axisSpin += ((phase === "decrypt" ? DECRYPT_SPIN : IDLE_SPIN) - axisSpin) * decay(1.5, dt);
      }
      if (!drag.active && !finishing()) {
        if (spinY || spinX) rot = turn(rot, spinY * dt, spinX * dt);
        if (axisSpin) rot = multiply(rot, rotY(axisSpin * dt));
      }
      lit += (target() - lit) * decay(7, dt);
      heart += (wantHeart - heart) * decay(4, dt);
      beat = phase === "decrypt" && !finishing() ? heart * heartbeat(clock) : 0;
      pulse *= Math.exp(-5 * dt);
      if (heart > 0.01) {
        for (let i = 0; i < MOTE_COUNT; i++) {
          const mote = motes[i];
          mote.dist -= mote.speed * dt * (1 + 2.4 * beat);
          mote.angle += mote.swirl * dt * (1.3 - mote.dist);
          if (mote.dist < 0.24) spawn(mote, 1);
        }
      }
    }

    function sweeping() {
      return progress === null && !finishing() && phase !== "decrypt";
    }

    // The heights of the shard that hold light right now: everything below the level the
    // download has reached (a hair past each tip at 0 and 1); with no total known, a short band
    // that climbs on its own (a still glow at the bottom under reduced motion).
    function lightBand(free) {
      if (sweeping()) {
        if (!free) return { lo: -Infinity, hi: BOTTOM + 0.3 * (TOP - BOTTOM) };
        const hi = BOTTOM - 0.05 + ((clock / 2.4) % 1) * (TOP - BOTTOM + 0.65);
        return { lo: hi - 0.6, hi: hi };
      }
      return { lo: -Infinity, hi: BOTTOM - 0.01 + lit * (TOP - BOTTOM + 0.02) };
    }

    // How much of a face lies in the band, as a share of its height.
    function share(face, band) {
      const span = face.high - face.low;
      return clamp((Math.min(face.high, band.hi) - Math.max(face.low, band.lo)) / span, 0, 1);
    }

    // How strongly a vein segment at this height glows: dormant outside the light, hottest right
    // at its front, settling to a steady burn below it.
    function veinGlow(height, band, free) {
      const below = band.hi - height;
      if (below <= 0 || height <= band.lo) return 0;
      let on = Math.min(1, below / 0.05);
      if (band.lo > -Infinity) on *= Math.min(1, (height - band.lo) / 0.3);
      const front = Math.exp(-below / 0.2);
      // Heat flows upwards along the lit veins.
      const flow = free ? 0.9 + 0.1 * Math.sin(height * 9 - clock * 2.4) : 1;
      return on * (0.58 + 0.42 * front) * flow;
    }

    function finishTime(now) {
      return finishing() ? clamp((now - finishAt) / finishMs, 0, 1) : 0;
    }

    // A soft pool of light, always fading out inside the canvas so its edge never shows.
    function halo(x, y, wanted, stops) {
      const radius = Math.min(wanted, size / 2 - 1);
      if (radius <= 0) return;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      for (let i = 0; i < stops.length; i += 2) gradient.addColorStop(stops[i], stops[i + 1]);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function trace(a, b, c) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
    }

    // The break, decided once as the finish begins (the shard holds still from then on), in
    // canvas units around the centre: a jagged crack up its length, from the bottom tip to the
    // top one; the two halves either side of it, hinged at the bottom tip; and a few splinters
    // that will fly off the crack.
    function breakShard(points, cx, cy) {
      const R = size * REACH;
      let top = points[TOP_TIP];
      let bottom = points[BOTTOM_TIP];
      let ax = top[0] - bottom[0];
      let ay = top[1] - bottom[1];
      const length = Math.hypot(ax, ay);
      if (length < R * 0.8) {
        // Turned end-on to the viewer: it splits top to bottom across the screen instead.
        top = [cx, cy - R * 0.7];
        bottom = [cx, cy + R * 0.7];
        ax = 0;
        ay = -1;
      } else {
        ax /= length;
        ay /= length;
      }
      const nx = -ay;
      const ny = ax;
      const sides = new Array(FACE_COUNT);
      for (let i = 0; i < FACE_COUNT; i++) {
        const tri = FACES[i].corners;
        const fx = (points[tri[0]][0] + points[tri[1]][0] + points[tri[2]][0]) / 3 - cx;
        const fy = (points[tri[0]][1] + points[tri[1]][1] + points[tri[2]][1]) / 3 - cy;
        sides[i] = fx * nx + fy * ny < 0 ? -1 : 1;
      }
      const crack = [];
      const joints = 10;
      for (let i = 0; i < joints; i++) {
        const t = i / (joints - 1);
        const zig = i === 0 || i === joints - 1 ? 0 : (i % 2 ? 1 : -1) * (0.3 + 0.7 * Math.random()) * R * 0.07;
        crack.push([
          bottom[0] - cx + (top[0] - bottom[0]) * t + nx * zig,
          bottom[1] - cy + (top[1] - bottom[1]) * t + ny * zig,
        ]);
      }
      const splinters = [];
      for (let i = 0; i < SPLINTERS; i++) {
        const at = crack[2 + Math.floor(Math.random() * (joints - 3))];
        const side = i % 2 ? 1 : -1;
        const lift = 0.15 + 0.75 * Math.random();
        const d = Math.hypot(1, lift);
        const spread = R * (0.06 + 0.07 * Math.random());
        const turn0 = Math.random() * TAU;
        splinters.push({
          x: at[0],
          y: at[1],
          dx: (side * nx + ax * lift) / d,
          dy: (side * ny + ay * lift) / d,
          reach: R * (0.55 + 0.6 * Math.random()),
          spin: (Math.random() < 0.5 ? -1 : 1) * (3 + 4 * Math.random()),
          shape: [0, 2.1 + 0.5 * (Math.random() - 0.5), 4.2 + 0.5 * (Math.random() - 0.5)].map(function (a) {
            const r = spread * (0.55 + 0.45 * Math.random());
            return [Math.cos(turn0 + a) * r, Math.sin(turn0 + a) * r];
          }),
        });
      }
      return { ax: ax, ay: ay, nx: nx, ny: ny, pivot: [bottom[0] - cx, bottom[1] - cy], sides: sides, crack: crack, splinters: splinters };
    }

    // Where a face's points go while the shard comes apart: each half swings open around the
    // bottom tip and drifts aside.
    function faceMotion(i, burst, R, cx, cy) {
      const e = 1 - Math.pow(1 - burst, 3);
      const side = split.sides[i];
      return {
        angle: side * 0.3 * e,
        ox: cx + split.pivot[0],
        oy: cy + split.pivot[1],
        tx: side * split.nx * R * 0.12 * e,
        ty: side * split.ny * R * 0.12 * e,
        alpha: Math.pow(1 - burst, 2.4),
      };
    }

    // The crack running up the shard while it heats (drawn up to `reach`, 0..1 of its length).
    function drawCrack(cx, cy, reach, alpha) {
      const joints = split.crack;
      const span = reach * (joints.length - 1);
      const whole = Math.floor(span);
      ctx.beginPath();
      ctx.moveTo(cx + joints[0][0], cy + joints[0][1]);
      for (let i = 1; i <= whole && i < joints.length; i++) ctx.lineTo(cx + joints[i][0], cy + joints[i][1]);
      if (whole < joints.length - 1) {
        const a = joints[whole];
        const b = joints[whole + 1];
        const t = span - whole;
        ctx.lineTo(cx + a[0] + (b[0] - a[0]) * t, cy + a[1] + (b[1] - a[1]) * t);
      }
      for (let pass = 0; pass < 3; pass++) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = pass === 0 ? 7 : pass === 1 ? 2.8 : 1.1;
        ctx.strokeStyle = pass === 0 ? seamStyles.haze : pass === 1 ? seamStyles.glow : seamStyles.core;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Splinters of black glass, lit on the edge, flung off the crack and turning as they go.
    function drawSplinters(cx, cy, burst) {
      const e = 1 - Math.pow(1 - burst, 2.2);
      const alpha = Math.pow(1 - burst, 1.3) * smoothstep(0, 0.05, burst);
      if (alpha < 0.01) return;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.9;
      ctx.fillStyle = splinterFill;
      ctx.strokeStyle = seamStyles.glow;
      for (let i = 0; i < split.splinters.length; i++) {
        const sp = split.splinters[i];
        const x = cx + sp.x + sp.dx * sp.reach * e;
        const y = cy + sp.y + sp.dy * sp.reach * e;
        const c = Math.cos(sp.spin * e);
        const s = Math.sin(sp.spin * e);
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const v = sp.shape[k];
          const px = x + v[0] * c - v[1] * s;
          const py = y + v[0] * s + v[1] * c;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function moved(p, m) {
      if (!m) return p;
      const c = Math.cos(m.angle);
      const s = Math.sin(m.angle);
      const x = p[0] - m.ox;
      const y = p[1] - m.oy;
      return [m.ox + x * c - y * s + m.tx, m.oy + x * s + y * c + m.ty];
    }

    // A mote is a fleck of ash, drawn into a short streak along its path only while a beat pulls
    // it in; grey far out, heating to an ember as it nears the shard.
    function drawMotes(front, cx, cy) {
      if (heart < 0.01 || !motion()) return;
      const rx = size * 0.46;
      const ry = size * 0.47;
      ctx.lineCap = "round";
      for (let i = 0; i < MOTE_COUNT; i++) {
        const mote = motes[i];
        if (mote.front !== front) continue;
        const alpha = 0.85 * heart * smoothstep(1, 0.82, mote.dist) * smoothstep(0.24, 0.42, mote.dist);
        if (alpha < 0.01) continue;
        const heat = smoothstep(0.75, 0.3, mote.dist);
        const ux = Math.cos(mote.angle);
        const uy = Math.sin(mote.angle);
        const x = cx + ux * mote.dist * rx;
        const y = cy + uy * mote.dist * ry;
        // Behind it: outwards, and back along its swirl.
        const trail = mote.speed * beat * size * 0.12;
        const back = -mote.swirl * mote.dist * 0.8;
        ctx.lineWidth = mote.size * (1 - 0.3 * heat);
        ctx.strokeStyle = rgba(mix(palette.ash, palette.ember, heat), alpha);
        ctx.beginPath();
        ctx.moveTo(x, y);
        // (A hair of length even at rest: a zero-length line would draw no dot at all.)
        ctx.lineTo(x + (ux - uy * back) * trail + 0.01, y + (uy + ux * back) * trail);
        ctx.stroke();
      }
    }

    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, size, size);
      if (!size) return;

      const free = motion();
      const fin = finishTime(now);
      const charge = free ? clamp(fin / CRACK_AT, 0, 1) : 0;
      const burst = free ? clamp((fin - CRACK_AT) / (1 - CRACK_AT), 0, 1) : 0;
      const fade = free ? 1 : 1 - fin; // reduced motion: the finish is a plain fade
      const R = size * REACH * (1 + 0.035 * beat + 0.05 * pulse);
      const breathe = free && !finishing() && phase === "download" ? 0.5 - 0.5 * Math.cos((clock * TAU) / RIFT_PERIOD) : 0;
      // Between two heartbeats the shard sinks back to embers, so each beat reads.
      const rest = free && phase === "decrypt" && !finishing() ? heart * (1 - beat) : 0;
      const glow = 1 + 0.5 * beat + 0.7 * pulse + 0.12 * breathe + 0.5 * charge - 0.25 * rest;
      // Heating up, the shard trembles (a pixel or two, never a flash).
      const shake = charge > 0 && burst === 0 ? 1.4 * charge * charge : 0;
      const cx = size / 2 + shake * Math.sin(clock * 83);
      const cy = size / 2 + shake * Math.cos(clock * 67);
      const band = lightBand(free);
      const filled = sweeping() ? 0.3 : lit;

      // The rift light the shard casts around itself grows with the download and with each beat.
      const pool = (0.08 + 0.3 * filled + 0.12 * heart) * glow * fade * (1 - burst);
      halo(cx, cy, R * (1.25 + 0.6 * filled), [0, rgba(palette.light, pool), 0.45, rgba(palette.wake, pool * 0.4), 1, rgba(palette.wake, 0)]);

      drawMotes(false, cx, cy);

      // Projection: the near side is slightly larger.
      function project(p) {
        const v = apply(rot, p);
        const scale = CAMERA / (CAMERA - v[2]);
        return [cx + v[0] * R * scale, cy - v[1] * R * scale, v[2]];
      }
      const points = CORNERS.map(project);
      if (finishing() && free && !split) split = breakShard(points, cx, cy);

      const motions = new Array(FACE_COUNT);
      const drawn = FACES.map(function (face, i) {
        const m = burst > 0 ? faceMotion(i, burst, R, cx, cy) : null;
        motions[i] = m;
        const tri = face.corners;
        return {
          index: i,
          face: face,
          normal: apply(rot, face.normal),
          depth: (points[tri[0]][2] + points[tri[1]][2] + points[tri[2]][2]) / 3,
          amount: share(face, band),
          alpha: fade * (m ? m.alpha : 1),
          motion: m,
          a: moved(points[tri[0]], m),
          b: moved(points[tri[1]], m),
          c: moved(points[tri[2]], m),
        };
      });
      drawn.sort(function (p, q) {
        return p.depth - q.depth;
      });

      // The light inside, strongest at the heart of the shard.
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
      core.addColorStop(0, rgba(palette.ember, 0.92));
      core.addColorStop(0.3, rgba(palette.light, 0.75));
      core.addColorStop(0.65, rgba(palette.deep, 0.62));
      core.addColorStop(1, rgba(palette.storm, 0.5));
      const coreStrength = Math.min(1.3, 0.9 + 0.35 * beat + 0.4 * pulse + 0.1 * breathe + 0.4 * charge - 0.25 * rest);

      function fillPart(poly, m) {
        if (poly.length < 3) return false;
        ctx.beginPath();
        for (let j = 0; j < poly.length; j++) {
          const q = moved(project(poly[j]), m);
          if (j) ctx.lineTo(q[0], q[1]);
          else ctx.moveTo(q[0], q[1]);
        }
        ctx.closePath();
        ctx.fill();
        return true;
      }

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const front = new Array(FACE_COUNT);
      const fronts = [[], []]; // where the light's level cuts the faces: [far, near]
      for (let k = 0; k < drawn.length; k++) {
        const item = drawn[k];
        const n = item.normal;
        const near = n[2] > 0;
        front[item.index] = near;
        if (item.alpha < 0.005) continue;
        const cut = band.hi < TOP ? crossing(item.face, band.hi) : null;
        if (cut) {
          const p = moved(project(cut[0]), item.motion);
          const q = moved(project(cut[1]), item.motion);
          fronts[near ? 1 : 0].push(p[0], p[1], q[0], q[1]);
        }
        trace(item.a, item.b, item.c);
        if (!near) {
          // Far faces, seen only where the near ones part.
          ctx.globalAlpha = item.alpha * 0.92;
          ctx.fillStyle = rgba(mix(palette.abyss, palette.glass, 0.12), 1);
          ctx.fill();
          if (item.amount > 0) {
            ctx.globalAlpha = item.alpha * item.amount * 0.35;
            ctx.fillStyle = rgba(palette.deep, 1);
            ctx.fill();
          }
          continue;
        }

        const lambert = Math.max(0, dot(n, LIGHT));
        // Obsidian: near black, lifted a little where the cold light falls.
        ctx.globalAlpha = item.alpha * 0.96;
        // Where the light is inside, the glass reads darker and redder, not grey.
        ctx.fillStyle = rgba(mix(palette.abyss, palette.glass, (0.1 + 0.52 * lambert) * (1 - 0.65 * item.amount)), 1);
        ctx.fill();
        if (item.amount > 0) {
          // The lit part of the facet, cut at the level; just under the level it runs hotter.
          ctx.globalAlpha = clamp(item.alpha * (0.45 + 0.2 * lambert) * coreStrength, 0, 1);
          ctx.fillStyle = core;
          const whole = item.amount >= 1;
          if (whole) ctx.fill();
          else fillPart(clipBand(item.face.points, band.lo, band.hi), item.motion);
          if (band.hi < TOP) {
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = item.alpha * 0.3 * glow;
            ctx.fillStyle = hotLayer;
            fillPart(clipBand(item.face.points, Math.max(band.lo, band.hi - 0.14), band.hi), item.motion);
            ctx.globalCompositeOperation = "source-over";
          }
          if (!whole || band.hi < TOP) trace(item.a, item.b, item.c);
        }
        // The rift behind backlights the silhouette in red.
        const rim = Math.pow(1 - n[2], 3);
        if (rim > 0.02) {
          ctx.globalAlpha = item.alpha * rim * (0.18 + 0.25 * filled) * glow;
          ctx.fillStyle = lightFill;
          ctx.fill();
        }
        // A cold glint sliding across the glass as it turns.
        const shine = 0.6 * Math.pow(Math.max(0, dot(n, HALF)), 26) + 0.08 * Math.max(0, n[1]);
        if (shine > 0.01 && !lean) {
          const pa = item.a[0] * GLINT[0] + item.a[1] * GLINT[1];
          const pb = item.b[0] * GLINT[0] + item.b[1] * GLINT[1];
          const pc = item.c[0] * GLINT[0] + item.c[1] * GLINT[1];
          const hi = Math.max(pa, pb, pc);
          const lo = Math.min(pa, pb, pc);
          const mx = (item.a[0] + item.b[0] + item.c[0]) / 3;
          const my = (item.a[1] + item.b[1] + item.c[1]) / 3;
          const mp = mx * GLINT[0] + my * GLINT[1];
          const sheen = ctx.createLinearGradient(
            mx + GLINT[0] * (hi - mp), my + GLINT[1] * (hi - mp),
            mx + GLINT[0] * (lo - mp), my + GLINT[1] * (lo - mp)
          );
          sheen.addColorStop(0, rgba(palette.cold, shine));
          sheen.addColorStop(0.45, rgba(palette.cold, shine * 0.25));
          sheen.addColorStop(1, rgba(palette.cold, 0));
          ctx.globalAlpha = item.alpha;
          ctx.fillStyle = sheen;
          ctx.fill();
        }
        // Edges: cold hairlines catching the light, warming where the light has risen; burning
        // before the split.
        const heat = Math.max(item.amount * 0.5, charge);
        ctx.globalAlpha = item.alpha;
        ctx.strokeStyle = rgba(mix(palette.cold, palette.light, heat), 0.07 + 0.2 * lambert + 0.12 * item.amount + 0.45 * charge);
        ctx.lineWidth = 0.75 + 0.6 * charge;
        ctx.stroke();
      }

      // Veins, batched by glow level and width: one path per batch. Every face fades alike, so
      // the whole network shares one alpha.
      const veinAlpha = fade * (motions[0] ? motions[0].alpha : 1);
      const projected = VEINS.points.map(project);
      const batches = [[], []]; // [far, near][width * LEVELS + level] -> polylines
      const glowBoost = (glow - 1) * 0.55 + 0.9 * charge - 0.15 * rest;
      for (let k = 0; k < VEINS.segments.length && veinAlpha > 0.02; k++) {
        const seg = VEINS.segments[k];
        const m = motions[seg.face];
        let g = veinGlow(seg.height, band, free);
        if (g > 0) g += glowBoost;
        else g = 0.9 * charge;
        const level = Math.round((clamp(g, 0, VEIN_MAX) / VEIN_MAX) * (LEVELS - 1));
        const near = front[seg.face] ? 1 : 0;
        const key = seg.width * LEVELS + level;
        const list = batches[near][key] || (batches[near][key] = []);
        const last = list.length ? list[list.length - 1] : null;
        const b = moved(projected[seg.b], m);
        if (last && last.end === seg.a && last.motion === m) {
          last.coords.push(b[0], b[1]);
          last.end = seg.b;
        } else {
          const a = moved(projected[seg.a], m);
          list.push({ coords: [a[0], a[1], b[0], b[1]], end: seg.b, motion: m });
        }
      }
      ctx.globalCompositeOperation = "lighter";
      if (!lean) strokeVeins(batches[0], 0.3 * veinAlpha, false);
      strokeVeins(batches[1], veinAlpha, true);
      // The level itself: a hot seam of light where it meets the glass.
      strokeFront(fronts[0], 0.3 * glow * fade, false);
      strokeFront(fronts[1], glow * fade, true);

      // The bottom tip, where the light gets in, ignites as soon as anything arrives.
      const tip = moved(points[BOTTOM_TIP], motions[BOTTOM_FACE]);
      const ignite = (sweeping() ? 0.5 : Math.min(1, lit * 10)) * fade * (1 - burst);
      if (ignite > 0.01) {
        halo(tip[0], tip[1], R * 0.32 * (0.8 + 0.4 * glow), [0, rgba(palette.ember, 0.55 * ignite), 0.4, rgba(palette.light, 0.22 * ignite), 1, rgba(palette.light, 0)]);
      }

      // Decrypting: the heart glows through the glass on every beat; heating up, it turns white.
      const heat = charge * charge * (1 - smoothstep(0, 0.15, burst));
      const heartGlow = heart * (free ? 0.25 + 0.75 * beat : 0.5) * fade * (1 - burst) + 0.5 * heat;
      if (heartGlow > 0.01) {
        halo(cx, cy, R * (0.6 + 0.22 * beat + 0.2 * heat), [0, rgba(mix(palette.ember, palette.foam, heat), 0.4 * heartGlow), 0.35, rgba(palette.light, 0.3 * heartGlow), 1, rgba(palette.light, 0)]);
      }
      // The crack runs up the shard as it heats, then the halves take it apart.
      const crackReach = smoothstep(0.15, 0.95, charge);
      if (split && free && crackReach > 0) drawCrack(cx, cy, crackReach, Math.pow(1 - burst, 3));

      if (burst > 0) {
        // Light floods out of the split: one swell along its length and a wider wash that
        // burns out (a single flash, then gone).
        const swell = (burst < 0.1 ? burst / 0.1 : Math.exp(-(burst - 0.1) * 2.2)) * Math.sqrt(1 - burst);
        const open = 1 - Math.pow(1 - burst, 3);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(split.ax, -split.ay));
        ctx.scale(0.07 + 0.42 * open, 1);
        const reach = size / 2 - 1;
        const beam = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
        beam.addColorStop(0, rgba(palette.foam, 0.95 * swell));
        beam.addColorStop(0.3, rgba(palette.ember, 0.7 * swell));
        beam.addColorStop(0.7, rgba(palette.light, 0.25 * swell));
        beam.addColorStop(1, rgba(palette.light, 0));
        ctx.fillStyle = beam;
        ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
        ctx.restore();
        halo(cx, cy, R * (0.9 + 1 * open), [0, rgba(palette.ember, 0.6 * swell), 0.4, rgba(palette.light, 0.32 * swell), 1, rgba(palette.wake, 0)]);
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      // Black splinters against the flood of light.
      if (burst > 0) drawSplinters(cx, cy, burst);
      drawMotes(true, cx, cy);
    }

    // The level's seam: segments of x1, y1, x2, y2 (all with the same alpha, since the shard is
    // whole while the level shows); a haze, a glow and a white-hot core, each one stroke.
    function strokeFront(list, alpha, near) {
      if (!list.length) return;
      ctx.beginPath();
      for (let j = 0; j < list.length; j += 4) {
        ctx.moveTo(list[j], list[j + 1]);
        ctx.lineTo(list[j + 2], list[j + 3]);
      }
      for (let pass = near ? 0 : 1; pass < 3; pass++) {
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.lineWidth = pass === 0 ? 6.5 : pass === 1 ? 2.6 : 1.1;
        ctx.strokeStyle = pass === 0 ? seamStyles.haze : pass === 1 ? seamStyles.glow : seamStyles.core;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Three strokes per batch (a wide haze, a glow, a hot core); additive light adds up in any
    // order, so each batch's path is built once. The far side gets the glow and the core only.
    function strokeVeins(batch, alpha, near) {
      ctx.globalAlpha = clamp(alpha, 0, 1);
      for (let key = 0; key < batch.length; key++) {
        const list = batch[key];
        if (!list) continue;
        const width = VEIN_WIDTHS[Math.floor(key / LEVELS)];
        const style = styles[key % LEVELS];
        ctx.beginPath();
        for (let j = 0; j < list.length; j++) {
          const coords = list[j].coords;
          ctx.moveTo(coords[0], coords[1]);
          for (let c = 2; c < coords.length; c += 2) ctx.lineTo(coords[c], coords[c + 1]);
        }
        for (let pass = near && style.lit && !lean ? 0 : style.lit ? 1 : 2; pass < 3; pass++) {
          ctx.lineWidth = width * (pass === 0 ? 7 : pass === 1 ? 3 : 1.15);
          ctx.strokeStyle = pass === 0 ? style.haze : pass === 1 ? style.glow : style.core;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---------- Pointer: drag to spin, flick for inertia, tap for a pulse ----------

    function onDown(e) {
      if (drag.active || destroyed) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {
        // Capture is a comfort, not a requirement.
      }
      drag.active = true;
      drag.id = e.pointerId;
      drag.x = drag.startX = e.clientX;
      drag.y = drag.startY = e.clientY;
      drag.startTime = drag.lastMove = e.timeStamp;
      drag.vx = drag.vy = 0;
      spinX = spinY = 0;
      axisSpin = 0;
      canvas.classList.add("is-dragging");
      schedule();
    }

    function onMove(e) {
      if (!drag.active || e.pointerId !== drag.id) return;
      // About a quarter turn across the shard's own width.
      const perPixel = TAU / (4 * Math.max(80, size * 0.8));
      const yaw = (e.clientX - drag.x) * perPixel;
      const pitch = (e.clientY - drag.y) * perPixel;
      // Once the shard is cracking it holds still: the crack is drawn where it was.
      if (!finishing()) rot = turn(rot, yaw, pitch);
      const dt = (e.timeStamp - drag.lastMove) / 1000;
      if (dt > 0) {
        drag.vy += (yaw / dt - drag.vy) * 0.5;
        drag.vx += (pitch / dt - drag.vx) * 0.5;
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.lastMove = e.timeStamp;
      schedule();
    }

    function onUp(e) {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.active = false;
      canvas.classList.remove("is-dragging");
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {
        // Already released.
      }
      const travel = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      const held = e.timeStamp - drag.startTime;
      if (travel < TAP_PX && held < TAP_MS) {
        tap(e.clientX, e.clientY);
      } else if (motion() && e.type !== "pointercancel" && e.timeStamp - drag.lastMove < 80) {
        // A flick keeps turning; a finger that stopped before lifting leaves it still.
        spinY = clamp(drag.vy, -14, 14);
        spinX = clamp(drag.vx, -14, 14);
      }
      schedule();
    }

    function tap(x, y) {
      if (motion()) pulse = 1;
      if (window.Plankton && typeof window.Plankton.bloom === "function") window.Plankton.bloom(x, y);
      schedule();
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ---------- Only draw while the shard can be seen ----------

    function onVisibility() {
      if (!document.hidden) schedule();
    }
    document.addEventListener("visibilitychange", onVisibility);

    const intersection = "IntersectionObserver" in window
      ? new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) {
          size = 0;
          schedule();
        }
      })
      : null;
    if (intersection) intersection.observe(canvas);

    const resizer = "ResizeObserver" in window
      ? new ResizeObserver(function () {
        resize();
        schedule();
      })
      : null;
    if (resizer) resizer.observe(canvas);
    function onWindowResize() {
      size = 0;
      schedule();
    }
    if (!resizer) window.addEventListener("resize", onWindowResize);

    function onMotionChange() {
      lastTime = 0;
      schedule();
    }
    if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", onMotionChange);

    // ---------- Controller ----------

    function setProgress(fraction) {
      progress = typeof fraction === "number" && Number.isFinite(fraction) ? clamp(fraction, 0, 1) : null;
      schedule();
    }

    function setPhase(next) {
      phase = next === "decrypt" ? "decrypt" : "download";
      schedule();
    }

    function settle() {
      clearTimeout(finishTimer);
      finishTimer = 0;
      clearTimeout(crackTimer);
      crackTimer = 0;
      const resolve = finishResolve;
      finishResolve = null;
      if (resolve) resolve();
    }

    function bloomAtCentre() {
      crackTimer = 0;
      if (destroyed || !bloomOnFinish || !window.Plankton || typeof window.Plankton.bloom !== "function") return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) window.Plankton.bloom(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    function finish() {
      if (destroyed) return Promise.resolve();
      if (finishPromise) return finishPromise;
      const free = motion();
      finishMs = free ? FINISH_MS : FINISH_REDUCED_MS;
      finishAt = performance.now();
      finishPromise = new Promise(function (resolve) {
        finishResolve = resolve;
        // The promise settles on the clock, not on frames: a hidden tab must not hold the video.
        finishTimer = setTimeout(settle, finishMs + 40);
      });
      // The world answers when the shard splits (at once under reduced motion).
      if (free) crackTimer = setTimeout(bloomAtCentre, FINISH_MS * CRACK_AT);
      else bloomAtCentre();
      schedule();
      return finishPromise;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      settle();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onWindowResize);
      if (reducedMotion.removeEventListener) reducedMotion.removeEventListener("change", onMotionChange);
      if (intersection) intersection.disconnect();
      if (resizer) resizer.disconnect();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    schedule();
    return { setProgress: setProgress, setPhase: setPhase, finish: finish, destroy: destroy };
  }

  window.Crystal = { mount: mount };
})();
