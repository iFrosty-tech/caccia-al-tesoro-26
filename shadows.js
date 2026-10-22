// Shadow theatre: the puppets behind the riddle-5 page ("theme": "ombre" in puzzles.json).
// While body carries data-theme="ombre" a fixed stage stands behind the page with four layers
// of hard black silhouettes (a town, a church, the puppeteer's hand) and the lamp's halo. The
// lamp follows the phone's tilt (or the pointer on a desk) and the page reads its position from
// two custom properties on body, --ombre-tx and --ombre-ty (about -1..1): style.css slides each
// layer by its depth and leans the card. Nothing here moves under prefers-reduced-motion.

(function () {
  "use strict";

  const THEME = "ombre";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const EASE = 0.08; // the lamp's inertia: how much of the distance to the target per frame
  const IDLE_AFTER = 2500; // ms without input before the lamp starts its slow sway
  const TILT_RANGE = 22; // degrees of tilt for the full range of the lamp

  let stage = null;
  let rafId = 0;
  let lastInput = 0;
  let orientationBase = null;
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  // Listeners added for the current stage, removed together on unmount.
  let teardown = [];

  // ---------- Silhouettes ----------

  function svgElement(viewBox, align) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("preserveAspectRatio", align);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    return svg;
  }

  function path(d, evenodd) {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", d);
    el.setAttribute("fill", "currentColor");
    if (evenodd) el.setAttribute("fill-rule", "evenodd");
    return el;
  }

  // A house standing on the floor (y = 240): pitched roof, window cutouts, an arched door.
  // `windows`: [dx, dy, width, height] from the top-left corner of the walls.
  function house(x, width, height, roof, windows, door) {
    const floor = 240;
    const top = floor - height;
    let d = "M" + x + " " + floor + "V" + top + "L" + (x + width / 2) + " " + (top - roof) + "L" + (x + width) + " " + top + "V" + floor + "Z";
    windows.forEach((w) => {
      d += "M" + (x + w[0]) + " " + (top + w[1]) + "h" + w[2] + "v" + w[3] + "h" + -w[2] + "Z";
    });
    if (door) {
      const cx = x + width / 2;
      d += "M" + (cx - 12) + " " + floor + "V" + (floor - 30) + "a12 12 0 0 1 24 0V" + floor + "Z";
    }
    return d;
  }

  // The far row: small houses across the whole stage.
  function farTown() {
    const svg = svgElement("0 0 1000 240", "xMidYMax slice");
    const d =
      house(40, 110, 80, 36, [[22, 26, 20, 24], [68, 26, 20, 24]], false) +
      house(170, 90, 64, 30, [[34, 22, 22, 22]], false) +
      house(290, 130, 92, 42, [[24, 30, 22, 26], [84, 30, 22, 26]], false) +
      house(450, 100, 70, 34, [[20, 24, 18, 22], [62, 24, 18, 22]], false) +
      house(760, 120, 86, 40, [[24, 28, 22, 26], [74, 28, 22, 26]], false) +
      house(900, 90, 66, 30, [[34, 22, 22, 22]], false);
    svg.append(path(d, true));
    return svg;
  }

  // The church: a tower with a bell opening, a round window and an arched door, its nave beside.
  function church() {
    const svg = svgElement("0 0 1000 240", "xMidYMax slice");
    const tower =
      "M560 240V92L600 36L640 92V240Z" +
      "M592 104a8 8 0 0 1 16 0V124H592Z" +
      "M600 148m-15 0a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z" +
      "M584 240V204a16 16 0 0 1 32 0V240Z" +
      "M640 240V150L700 118L760 150V240Z" +
      "M662 172a8 8 0 0 1 16 0V196H662Z" +
      "M722 172a8 8 0 0 1 16 0V196H722Z";
    const cross = "M598 10h4v30h-4ZM590 19h20v4h-20Z";
    svg.append(path(tower, true), path(cross, false));
    return svg;
  }

  // The near row: a few big houses, pure black against the paper, leaving the middle open.
  function nearTown() {
    const svg = svgElement("0 0 1000 240", "xMidYMax slice");
    const d =
      house(120, 180, 120, 60, [[32, 36, 30, 36], [118, 36, 30, 36]], true) +
      house(300, 140, 96, 50, [[30, 32, 26, 32], [84, 32, 26, 32]], false) +
      house(700, 170, 110, 56, [[30, 34, 28, 34], [112, 34, 28, 34]], true) +
      house(870, 130, 90, 46, [[26, 30, 24, 30], [80, 30, 24, 30]], false);
    svg.append(path(d, true));
    return svg;
  }

  // A hand, five fingers spread, wrist running off the bottom of its box.
  function hand() {
    const svg = svgElement("0 0 200 320", "xMidYMax meet");
    const palm = path("M62 320V178C62 150 76 134 98 128H140C160 136 166 152 166 178V320Z", false);
    const fingers = document.createElementNS(SVG_NS, "path");
    fingers.setAttribute(
      "d",
      "M86 140V48M110 140V26M134 140V44M156 150V82M74 170L26 118"
    );
    fingers.setAttribute("fill", "none");
    fingers.setAttribute("stroke", "currentColor");
    fingers.setAttribute("stroke-width", "25");
    fingers.setAttribute("stroke-linecap", "round");
    svg.append(palm, fingers);
    return svg;
  }

  function layer(className, content) {
    const el = document.createElement("div");
    el.className = "ombre-layer " + className;
    if (content) el.append(content);
    return el;
  }

  // ---------- Mount / unmount ----------

  function mount() {
    stage = document.createElement("div");
    stage.className = "ombre-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.append(
      layer("ombre-halo", null),
      layer("ombre-skyline ombre-far", farTown()),
      layer("ombre-skyline ombre-church", church()),
      layer("ombre-skyline ombre-near", nearTown()),
      layer("ombre-hand", hand()),
      layer("ombre-wave", hand())
    );
    document.body.append(stage);
    if (!reducedMotion.matches) startLamp();
  }

  function unmount() {
    teardown.forEach((off) => off());
    teardown = [];
    cancelAnimationFrame(rafId);
    rafId = 0;
    orientationBase = null;
    target.x = target.y = current.x = current.y = 0;
    document.body.style.removeProperty("--ombre-tx");
    document.body.style.removeProperty("--ombre-ty");
    if (stage) stage.remove();
    stage = null;
  }

  function listen(targetEl, type, handler, options) {
    targetEl.addEventListener(type, handler, options);
    teardown.push(() => targetEl.removeEventListener(type, handler, options));
  }

  // ---------- The lamp ----------

  function clamp(value) {
    return value < -1 ? -1 : value > 1 ? 1 : value;
  }

  function aim(x, y) {
    target.x = clamp(x);
    target.y = clamp(y);
    lastInput = performance.now();
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  // One frame: ease towards the target, or sway slowly when nobody has moved for a while.
  function frame(now) {
    rafId = 0;
    if (!stage || document.hidden) return;
    if (now - lastInput > IDLE_AFTER) {
      target.x = Math.sin(now / 4000) * 0.22;
      target.y = Math.cos(now / 5200) * 0.14;
    }
    current.x += (target.x - current.x) * EASE;
    current.y += (target.y - current.y) * EASE;
    document.body.style.setProperty("--ombre-tx", current.x.toFixed(4));
    document.body.style.setProperty("--ombre-ty", current.y.toFixed(4));
    rafId = requestAnimationFrame(frame);
  }

  function startLamp() {
    lastInput = performance.now();
    listen(document, "visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!rafId) {
        rafId = requestAnimationFrame(frame);
      }
    });

    if (coarsePointer.matches && typeof DeviceOrientationEvent !== "undefined") {
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        // iOS: the sensor opens only from inside a gesture; asked once, silently dropped if refused.
        const ask = () => {
          teardown = teardown.filter((off) => off !== offTouch && off !== offClick);
          offTouch();
          offClick();
          DeviceOrientationEvent.requestPermission()
            .then((state) => {
              if (state === "granted") listen(window, "deviceorientation", onOrientation, { passive: true });
            })
            .catch(() => {});
        };
        const offTouch = () => window.removeEventListener("touchend", ask);
        const offClick = () => window.removeEventListener("click", ask);
        window.addEventListener("touchend", ask, { passive: true });
        window.addEventListener("click", ask);
        teardown.push(offTouch, offClick);
      } else {
        listen(window, "deviceorientation", onOrientation, { passive: true });
      }
    } else {
      listen(
        window,
        "pointermove",
        (event) => {
          aim((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
        },
        { passive: true }
      );
    }
    rafId = requestAnimationFrame(frame);
  }

  // Tilt: the pose the phone is first held in is neutral, and the neutral pose drifts slowly
  // towards wherever it is held now, so a new grip never leaves the lamp stuck at one side.
  function onOrientation(event) {
    if (event.gamma == null || event.beta == null) return;
    let x = event.gamma;
    let y = event.beta;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    if (angle === 90) {
      x = event.beta;
      y = -event.gamma;
    } else if (angle === -90 || angle === 270) {
      x = -event.beta;
      y = event.gamma;
    }
    if (!orientationBase) orientationBase = { x: x, y: y };
    orientationBase.x += (x - orientationBase.x) * 0.004;
    orientationBase.y += (y - orientationBase.y) * 0.004;
    aim((x - orientationBase.x) / TILT_RANGE, (y - orientationBase.y) / TILT_RANGE);
  }

  // ---------- Theme watch ----------

  function onTheme() {
    const on = document.body.dataset.theme === THEME;
    if (on && !stage) mount();
    else if (!on && stage) unmount();
  }

  new MutationObserver(onTheme).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
  onTheme();
})();
