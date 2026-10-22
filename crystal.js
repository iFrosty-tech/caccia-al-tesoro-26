// Faceted crystal: the loading object of a video riddle, drawn on a small canvas. Twenty glass
// facets light up one at a time, from the bottom, as the download arrives; decryption makes the
// lit crystal breathe; the finished crystal cracks open in a bloom of light before the video.
// The player can spin it with a finger while waiting. Colours come from the theme tokens on
// body, read once at mount.
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
  const PHI = (1 + Math.sqrt(5)) / 2;

  // Camera distance in crystal radii: a mild perspective, enough to feel the volume.
  const CAMERA = 3.4;
  // One light, upper left and in front of the crystal.
  const LIGHT = normalize([-0.45, 0.7, 0.6]);
  const FACE_COUNT = 20;
  const IDLE_SPIN = 0.25;
  const DECRYPT_SPIN = 0.9;
  const BREATH_PERIOD = 1.1;
  const FINISH_MS = 650;
  const FINISH_REDUCED_MS = 300;
  const TAP_MS = 250;
  const TAP_PX = 8;

  // Icosahedron: twelve corners on three golden rectangles, twenty triangles between them.
  const CORNERS = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ].map(normalize);
  const TRIANGLES = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // Each face keeps its outward normal and the order in which it lights up: by the height of
  // its centre, lowest first (then around the axis), so the light rises through the crystal.
  const FACES = TRIANGLES.map(function (tri) {
    const a = CORNERS[tri[0]];
    const b = CORNERS[tri[1]];
    const c = CORNERS[tri[2]];
    const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    let normal = normalize(cross(sub(b, a), sub(c, a)));
    if (dot(normal, centre) < 0) normal = [-normal[0], -normal[1], -normal[2]];
    return { corners: tri, normal: normal, height: centre[1], angle: Math.atan2(centre[2], centre[0]), rank: 0 };
  });
  FACES.slice()
    .sort(function (p, q) {
      return Math.abs(p.height - q.height) > 1e-6 ? p.height - q.height : p.angle - q.angle;
    })
    .forEach(function (face, i) {
      face.rank = i;
    });

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
  // crystal's current orientation.
  function turn(rot, yaw, pitch) {
    return multiply(rotY(yaw), multiply(rotX(pitch), rot));
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function decay(rate, dt) {
    return 1 - Math.exp(-rate * dt);
  }

  // ---------- Colours from the theme tokens ----------

  const DEFAULTS = {
    light: [102, 246, 255],
    deep: [11, 106, 224],
    sheen: [190, 252, 255],
    foam: [233, 254, 255],
    abyss: [3, 6, 11],
  };

  function readPalette() {
    const style = getComputedStyle(document.body);
    return {
      light: channels(style.getPropertyValue("--light-rgb"), DEFAULTS.light),
      deep: channels(style.getPropertyValue("--wake-deep-rgb"), DEFAULTS.deep),
      sheen: channels(style.getPropertyValue("--sheen-rgb"), DEFAULTS.sheen),
      foam: channels(style.getPropertyValue("--foam-rgb"), DEFAULTS.foam),
      abyss: hexChannels(style.getPropertyValue("--abyss"), DEFAULTS.abyss),
    };
  }

  function channels(value, fallback) {
    const parts = String(value).split(",").map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback;
  }

  function hexChannels(value, fallback) {
    const match = String(value).trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const n = parseInt(match[1], 16);
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

  // ---------- One mounted crystal ----------

  function mount(container, options) {
    if (!container || !document.createElement("canvas").getContext) return idle();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return idle();
    canvas.className = "crystal-canvas";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const palette = readPalette();
    const bloomOnFinish = !options || options.bloom !== false;

    let size = 0;
    let dpr = 1;
    // A gentle starting tilt, so no face sits flat towards the viewer.
    let rot = turn([1, 0, 0, 0, 1, 0, 0, 0, 1], 0.5, 0.42);
    let progress = null; // fraction received, or null while the total is unknown
    let lit = 0; // the fraction currently shown, eased towards the target
    let phase = "download";
    let breath = 0; // blend into the decrypt breathing
    let pulse = 0; // energy of a tap, fading
    let spinY = 0; // angular velocities around the screen axes, rad/s
    let spinX = 0;
    let finishAt = 0;
    let finishMs = 0;
    let finishTimer = 0;
    let finishResolve = null;
    let finishPromise = null;
    let destroyed = false;
    let visible = true;
    let rafId = 0;
    let lastTime = 0;
    let clock = 0;
    const drag = { active: false, id: 0, x: 0, y: 0, startX: 0, startY: 0, startTime: 0, lastMove: 0, vx: 0, vy: 0 };

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

    // Frames run only while something moves: always under free motion (the idle spin), only on
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
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
      lastTime = now;
      clock += dt;
      step(dt);
      draw(now);
      if (animating()) schedule();
      else lastTime = 0;
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      size = Math.round(rect.width);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.max(1, Math.round(size * dpr));
      if (canvas.width !== px) canvas.width = px;
      if (canvas.height !== px) canvas.height = px;
    }

    function step(dt) {
      if (!drag.active) {
        if (motion()) {
          // Friction: the spin given by a flick settles back onto the idle turn.
          const restY = phase === "decrypt" ? DECRYPT_SPIN : IDLE_SPIN;
          spinY += (restY - spinY) * decay(2.2, dt);
          spinX += (0 - spinX) * decay(2.2, dt);
        } else {
          spinY = 0;
          spinX = 0;
        }
        if (spinY || spinX) rot = turn(rot, spinY * dt, spinX * dt);
      }
      lit += (target() - lit) * decay(7, dt);
      const wantBreath = phase === "decrypt" && motion() && !finishing() ? 1 : 0;
      breath += (wantBreath - breath) * decay(5, dt);
      pulse *= Math.exp(-5 * dt);
    }

    // How lit each face is right now: a staircase along the rank, with the current face as a
    // ramp; with no total known, a band of light travels up through the facets instead.
    function facetAmounts() {
      const amounts = new Array(FACE_COUNT);
      const sweep = progress === null && !finishing() && phase !== "decrypt";
      const band = ((clock / 1.6) % 1) * 1.6 - 0.3;
      for (let i = 0; i < FACE_COUNT; i++) {
        const rank = FACES[i].rank;
        if (sweep) {
          amounts[i] = motion() ? Math.max(0, 1 - Math.abs(rank / (FACE_COUNT - 1) - band) / 0.3) : 0.35;
        } else {
          amounts[i] = clamp(lit * FACE_COUNT - rank, 0, 1);
        }
      }
      return amounts;
    }

    function finishEase(now) {
      if (!finishing()) return 0;
      const t = clamp((now - finishAt) / finishMs, 0, 1);
      if (!motion()) return t;
      return (1 - Math.exp(-5 * t)) / (1 - Math.exp(-5));
    }

    // A soft pool of light, always fading out inside the canvas so its edge never shows.
    function halo(x, y, wanted, inner, outer) {
      const radius = Math.min(wanted, size / 2);
      if (radius <= 0) return;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, inner);
      gradient.addColorStop(0.4, outer);
      gradient.addColorStop(1, rgba(palette.light, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      if (!size) return;

      const centre = size / 2;
      const fin = finishEase(now);
      const breathing = breath * Math.sin((clock * TAU) / BREATH_PERIOD);
      const radius = size * 0.3 * (1 + 0.03 * breathing) * (1 + 0.06 * pulse);
      const glow = 1 + 0.25 * breathing + 0.8 * pulse;
      const fade = motion() ? 1 - fin * fin : 1 - fin;
      const amounts = facetAmounts();
      let litSum = 0;
      for (let i = 0; i < FACE_COUNT; i++) litSum += amounts[i];
      const litMean = litSum / FACE_COUNT;

      // The pool of light the crystal casts around itself grows with the download.
      const haloAlpha = (0.05 + 0.3 * litMean) * glow * fade;
      halo(centre, centre, radius * (1 + 0.7 * litMean), rgba(palette.light, haloAlpha), rgba(palette.light, haloAlpha * 0.35));
      if (fin > 0 && motion()) {
        // The crack: a bloom that swells past the crystal and burns out.
        const bloom = Math.sin(fin * Math.PI) * 0.6;
        halo(centre, centre, radius * (1 + 0.7 * fin), rgba(palette.foam, bloom), rgba(palette.light, bloom * 0.5));
      }

      // Project the corners; the near side is slightly larger.
      const points = CORNERS.map(function (corner) {
        const v = apply(rot, corner);
        const scale = CAMERA / (CAMERA - v[2]);
        return { x: centre + v[0] * radius * scale, y: centre - v[1] * radius * scale, z: v[2] };
      });

      // Painter's order: far faces first, drawn faintly as glass seen through the near ones.
      const drawn = FACES.map(function (face, i) {
        const normal = apply(rot, face.normal);
        const a = points[face.corners[0]];
        const b = points[face.corners[1]];
        const c = points[face.corners[2]];
        return { face: face, normal: normal, depth: (a.z + b.z + c.z) / 3, amount: amounts[i] };
      });
      drawn.sort(function (p, q) {
        return p.depth - q.depth;
      });

      const flyOut = motion() ? radius * 0.12 * fin : 0;
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      for (let i = 0; i < drawn.length; i++) {
        const item = drawn[i];
        const n = item.normal;
        const front = n[2] > 0;
        const dx = n[0] * flyOut;
        const dy = -n[1] * flyOut;
        const a = points[item.face.corners[0]];
        const b = points[item.face.corners[1]];
        const c = points[item.face.corners[2]];
        ctx.beginPath();
        ctx.moveTo(a.x + dx, a.y + dy);
        ctx.lineTo(b.x + dx, b.y + dy);
        ctx.lineTo(c.x + dx, c.y + dy);
        ctx.closePath();

        if (!front) {
          ctx.fillStyle = rgba(mix(palette.deep, palette.light, item.amount), (0.08 + 0.14 * item.amount) * fade);
          ctx.fill();
          ctx.strokeStyle = rgba(palette.sheen, 0.07 * fade);
          ctx.stroke();
          continue;
        }

        const lambert = Math.max(0, dot(n, LIGHT));
        const rim = Math.pow(1 - n[2], 2.5);
        // Dark glass: abyss lifted towards the deep wake where the light falls.
        ctx.fillStyle = rgba(mix(palette.abyss, palette.deep, 0.2 + 0.5 * lambert), 0.94 * fade);
        ctx.fill();
        if (item.amount > 0) {
          ctx.fillStyle = rgba(palette.light, (0.5 + 0.4 * lambert) * item.amount * fade);
          ctx.fill();
          // Light from inside: brightest at the heart of the facet.
          const cx = (a.x + b.x + c.x) / 3 + dx;
          const cy = (a.y + b.y + c.y) / 3 + dy;
          const reach = Math.max(Math.hypot(a.x - cx, a.y - cy), Math.hypot(b.x - cx, b.y - cy), Math.hypot(c.x - cx, c.y - cy));
          const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, reach));
          inner.addColorStop(0, rgba(palette.foam, (0.35 + 0.3 * lambert) * item.amount * glow * fade));
          inner.addColorStop(1, rgba(palette.foam, 0));
          ctx.fillStyle = inner;
          ctx.fill();
        }
        if (rim > 0.02) {
          ctx.fillStyle = rgba(palette.sheen, 0.26 * rim * fade);
          ctx.fill();
        }
        ctx.strokeStyle = rgba(palette.sheen, (0.16 + 0.3 * item.amount) * fade);
        ctx.stroke();
      }
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
      canvas.classList.add("is-dragging");
      schedule();
    }

    function onMove(e) {
      if (!drag.active || e.pointerId !== drag.id) return;
      // About a quarter turn across the crystal's own width.
      const perPixel = TAU / (4 * Math.max(80, size * 0.8));
      const yaw = (e.clientX - drag.x) * perPixel;
      const pitch = (e.clientY - drag.y) * perPixel;
      rot = turn(rot, yaw, pitch);
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
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      const held = e.timeStamp - drag.startTime;
      if (moved < TAP_PX && held < TAP_MS) {
        tap(e.clientX, e.clientY);
      } else if (motion() && e.type !== "pointercancel" && e.timeStamp - drag.lastMove < 80) {
        // A flick keeps turning; a finger that stopped before lifting leaves it still.
        spinY = clamp(drag.vy, -14, 14);
        spinX = clamp(drag.vx, -14, 14);
      }
      schedule();
    }

    function tap(x, y) {
      pulse = 1;
      if (window.Plankton && typeof window.Plankton.bloom === "function") window.Plankton.bloom(x, y);
      schedule();
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ---------- Only draw while the crystal can be seen ----------

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
      const resolve = finishResolve;
      finishResolve = null;
      if (resolve) resolve();
    }

    function finish() {
      if (destroyed) return Promise.resolve();
      if (finishPromise) return finishPromise;
      finishMs = motion() ? FINISH_MS : FINISH_REDUCED_MS;
      finishAt = performance.now();
      finishPromise = new Promise(function (resolve) {
        finishResolve = resolve;
        // The promise settles on the clock, not on frames: a hidden tab must not hold the video.
        finishTimer = setTimeout(settle, finishMs + 40);
      });
      if (bloomOnFinish && window.Plankton && typeof window.Plankton.bloom === "function") {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) window.Plankton.bloom(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
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
