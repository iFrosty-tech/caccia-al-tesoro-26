// Bioluminescent sea: a plankton field drawn on a fixed canvas behind the page.
// Particles drift on a slow current, light up where a finger or pointer passes,
// and an invisible wanderer keeps the sea alive when nobody touches it.
// Exposes window.Plankton.bloom(x, y) for bursts of light (viewport coordinates), and
// window.Plankton.setTheme(name) to tint the sea for a themed page ("" is the night sea).

(function () {
  "use strict";

  window.Plankton = { bloom: function () {}, setTheme: function () {} };

  const canvas = document.getElementById("sea");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = Math.PI * 2;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let count = 0;
  let px, py, pvx, pvy, glow, size, hue, phase;
  let rafId = 0;
  let lastTime = 0;
  let clock = 0;
  let lastViewport = { w: 0, h: 0 };

  // Pointer segment travelled since the previous frame, consumed by step().
  const pointer = { x: 0, y: 0, prevX: 0, prevY: 0, active: false, moved: false };
  const wanderer = { x: 0, y: 0, prevX: 0, prevY: 0 };

  // Two kinds of plankton per palette (light and wake), plus the colour of a fresh flare.
  // The tints mirror the --light-rgb and --wake-rgb tokens of each theme in style.css.
  const PALETTES = {
    "": { light: "102, 246, 255", wake: "30, 139, 255", flare: "#d9fdff", near: "#5fc8ff", far: "#3a86e8" },
    green: { light: "109, 255, 180", wake: "24, 196, 110", flare: "#dcffec", near: "#5fe8a0", far: "#2fae6a" },
  };
  let palette = PALETTES[""];

  // Pre-rendered halos: drawing a sprite is far cheaper than shadowBlur.
  let haloLight = makeHalo(palette.light);
  let haloWake = makeHalo(palette.wake);

  function setTheme(name) {
    const next = PALETTES[name] || PALETTES[""];
    if (next === palette) return;
    palette = next;
    haloLight = makeHalo(palette.light);
    haloWake = makeHalo(palette.wake);
    // The still frame of reduced motion is redrawn; the moving sea takes it on its next frame.
    if (reducedMotion.matches) start();
  }

  function makeHalo(rgb) {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const g = sprite.getContext("2d");
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(" + rgb + ", 0.9)");
    gradient.addColorStop(0.18, "rgba(" + rgb + ", 0.45)");
    gradient.addColorStop(0.5, "rgba(" + rgb + ", 0.08)");
    gradient.addColorStop(1, "rgba(" + rgb + ", 0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    return sprite;
  }

  function isSmallScreen() {
    return Math.min(window.innerWidth, window.innerHeight) < 700;
  }

  function resize() {
    width = window.innerWidth;
    // Extra height on phones covers the strip revealed when the URL bar retracts.
    height = window.innerHeight + (isSmallScreen() ? 140 : 0);
    lastViewport = { w: window.innerWidth, h: window.innerHeight };
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const cap = isSmallScreen() ? 700 : 1100;
    count = Math.min(cap, Math.round((width * height) / 700));
    px = new Float32Array(count);
    py = new Float32Array(count);
    pvx = new Float32Array(count);
    pvy = new Float32Array(count);
    glow = new Float32Array(count);
    size = new Float32Array(count);
    hue = new Uint8Array(count);
    phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      px[i] = Math.random() * width;
      py[i] = Math.random() * height;
      size[i] = 0.6 + Math.random() * 1.1;
      hue[i] = Math.random() < 0.55 ? 1 : 0;
      phase[i] = Math.random() * TAU;
    }
  }

  // Smooth, slowly changing current built from a few sines.
  function flowAngle(x, y, t) {
    return (
      Math.sin(x * 0.0021 + t * 0.00012) * 1.3 +
      Math.cos(y * 0.0017 - t * 0.0001) * 1.1 +
      Math.sin((x + y) * 0.0009 + t * 0.00007)
    );
  }

  // Excite and drag particles near the segment a -> b.
  function disturb(ax, ay, bx, by, radius, strength) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy || 1;
    const r2 = radius * radius;
    for (let i = 0; i < count; i++) {
      let s = ((px[i] - ax) * dx + (py[i] - ay) * dy) / lengthSq;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const cx = ax + dx * s - px[i];
      const cy = ay + dy * s - py[i];
      const d2 = cx * cx + cy * cy;
      if (d2 > r2) continue;
      const falloff = 1 - Math.sqrt(d2) / radius;
      const lit = falloff * strength;
      if (lit > glow[i]) glow[i] = lit;
      pvx[i] += dx * 0.035 * falloff;
      pvy[i] += dy * 0.035 * falloff;
    }
  }

  function bloom(x, y) {
    if (reducedMotion.matches) return;
    const radius = isSmallScreen() ? 180 : 240;
    for (let i = 0; i < count; i++) {
      const dx = px[i] - x;
      const dy = py[i] - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      glow[i] = Math.max(glow[i], 0.4 + falloff * 0.6);
      pvx[i] += (dx / d) * falloff * 5;
      pvy[i] += (dy / d) * falloff * 5;
    }
  }

  function moveWanderer(t) {
    wanderer.prevX = wanderer.x;
    wanderer.prevY = wanderer.y;
    wanderer.x = width * (0.5 + 0.44 * Math.sin(t * 0.00011 + 1.4 * Math.sin(t * 0.00003)));
    wanderer.y = height * (0.5 + 0.42 * Math.sin(t * 0.000083 + 2.1 + Math.cos(t * 0.00004)));
  }

  function step(dt) {
    clock += dt;
    const k = dt / 16.67;
    const decay = Math.pow(0.966, k);
    const drag = Math.pow(0.95, k);

    moveWanderer(clock);
    disturb(wanderer.prevX, wanderer.prevY, wanderer.x, wanderer.y, isSmallScreen() ? 55 : 75, 0.55);

    if (pointer.moved) {
      disturb(pointer.prevX, pointer.prevY, pointer.x, pointer.y, isSmallScreen() ? 60 : 80, 1);
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      pointer.moved = false;
    }

    for (let i = 0; i < count; i++) {
      const a = flowAngle(px[i], py[i], clock);
      const speed = 0.16 + size[i] * 0.06;
      pvx[i] = pvx[i] * drag + Math.cos(a) * speed * (1 - drag);
      pvy[i] = pvy[i] * drag + Math.sin(a) * speed * (1 - drag);
      px[i] += (pvx[i] + Math.cos(a) * speed) * k;
      py[i] += (pvy[i] + Math.sin(a) * speed) * k;
      if (px[i] < -10) px[i] += width + 20;
      else if (px[i] > width + 10) px[i] -= width + 20;
      if (py[i] < -10) py[i] += height + 20;
      else if (py[i] > height + 10) py[i] -= height + 20;
      glow[i] *= decay;
    }
  }

  function draw(fade) {
    // Fade previous frame toward transparency: short luminous trails,
    // while the CSS background of the page shows through.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, " + fade + ")";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < count; i++) {
      const g = glow[i];
      const twinkle = 0.5 + 0.5 * Math.sin(clock * 0.0012 + phase[i]);
      const rest = 0.14 + twinkle * 0.16;
      const s = size[i];
      if (g > 0.04) {
        const halo = s * (10 + g * 16);
        ctx.globalAlpha = Math.min(1, g * 0.9);
        ctx.drawImage(hue[i] ? haloLight : haloWake, px[i] - halo / 2, py[i] - halo / 2, halo, halo);
      }
      ctx.globalAlpha = Math.min(1, rest + g);
      ctx.fillStyle = g > 0.3 ? palette.flare : hue[i] ? palette.near : palette.far;
      const core = s * (1 + g * 0.8);
      ctx.fillRect(px[i] - core / 2, py[i] - core / 2, core, core);
    }
    ctx.globalAlpha = 1;
  }

  function frame(time) {
    const dt = lastTime ? Math.min(time - lastTime, 50) : 16.67;
    lastTime = time;
    step(dt);
    draw(0.2);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    stop();
    if (reducedMotion.matches) {
      // One quiet still frame: a dim starfield with no motion.
      ctx.clearRect(0, 0, width, height);
      clock = 0;
      draw(1);
      return;
    }
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
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

  // Pointer events stop once a touch turns into a scroll, so touch is tracked too.
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") trackPoint(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener("pointerleave", releasePoint, { passive: true });
  document.addEventListener("mouseleave", releasePoint, { passive: true });
  window.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (t) {
      releasePoint();
      trackPoint(t.clientX, t.clientY);
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
      if (window.innerWidth === lastViewport.w && Math.abs(window.innerHeight - lastViewport.h) < 140) return;
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

  window.Plankton = { bloom: bloom, setTheme: setTheme };

  resize();
  start();
})();
