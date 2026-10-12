// Treasure hunt frontend: plain JS, no build step.
// API_URL is defined in config.js (loaded before this file).

(function () {
  "use strict";

  const STORAGE_KEY = "caccia-al-tesoro-session";
  const KNOWN_KEY = "caccia-al-tesoro-known";
  const ANSWER_MAX = 500;

  const $ = (id) => document.getElementById(id);
  const els = {
    configWarning: $("config-warning"),
    userBar: $("user-bar"),
    userName: $("user-name"),
    logoutBtn: $("logout-btn"),
    registerSection: $("register-section"),
    registerForm: $("register-form"),
    usernameInput: $("username-input"),
    passwordInput: $("password-input"),
    passwordToggle: $("password-toggle"),
    confirmInput: $("confirm-input"),
    confirmError: $("confirm-error"),
    authSubmit: $("auth-submit"),
    authStatus: $("auth-status"),
    registerError: $("register-error"),
    puzzlesSection: $("puzzles-section"),
    puzzlesStatus: $("puzzles-status"),
    puzzlesView: $("puzzles-view"),
  };

  // Game state for the current login: riddles and saved answers are fetched once, then kept here.
  const game = {
    session: null,
    puzzles: null, // null while loading
    answers: {},
    loadId: 0, // bumped on every login/logout so a stale load cannot render
    indexScroll: 0, // where the player left the index
    rendered: false, // the index entrance plays once per login
    freshId: "", // riddle just saved: its tile flares when the index comes back
    viewId: 0, // bumped whenever a view is left, so its late async results are dropped
    clockOffset: 0, // server clock minus this device's clock, learned from getPuzzleKey
    unlockAt: {}, // unlock times confirmed by the server, by riddle id
    unlocked: {}, // riddles whose key the server has already handed out
    sealed: {}, // flag riddles the server still keeps closed, by riddle id
  };

  // ---------- Session storage (localStorage may be unavailable) ----------

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const session = raw ? JSON.parse(raw) : null;
      if (session && typeof session.username === "string" && typeof session.token === "string") {
        return session;
      }
    } catch (_) {
      // Ignore: treated as logged out.
    }
    return null;
  }

  function saveSession(session) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (_) {
      // Session will only last for this page load.
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Nothing to clear.
    }
  }

  // Set once this device has logged in or registered: the form then opens on "Accedi".
  function hasPlayedHere() {
    try {
      return localStorage.getItem(KNOWN_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function rememberPlayedHere() {
    try {
      localStorage.setItem(KNOWN_KEY, "1");
    } catch (_) {
      // The next visit simply opens on "Registrati" again.
    }
  }

  // ---------- API ----------

  function isConfigured() {
    return typeof API_URL === "string" && /^https:\/\//.test(API_URL);
  }

  // text/plain keeps this a "simple" CORS request: Apps Script cannot answer preflights.
  async function api(action, payload) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action: action }, payload)),
      });
    } catch (_) {
      throw new ApiError("Connessione non riuscita. Controlla la rete e riprova.");
    }
    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new ApiError("Risposta del server non valida.");
    }
    if (!data || !data.ok) {
      throw new ApiError((data && data.error) || "Errore sconosciuto.", data && data.code);
    }
    return data;
  }

  class ApiError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code || "";
    }
  }

  async function fetchPuzzles() {
    const res = await fetch("puzzles.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const puzzles = await res.json();
    return Array.isArray(puzzles) ? puzzles : [];
  }

  // ---------- Light effects (visual only) ----------

  // Riddle cards and index tiles stay dark until they scroll into view, then ignite.
  const igniter =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("lit");
              igniter.unobserve(entry.target);
            });
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.15 }
        )
      : null;

  function ignite(card, index) {
    card.style.setProperty("--i", String(Math.min(index, 4)));
    if (igniter) igniter.observe(card);
    else card.classList.add("lit");
  }

  // A view is being replaced: stop watching its cards.
  function forgetIgnites() {
    if (igniter) igniter.disconnect();
  }

  // The sea blooms around an element (plankton.js skips it under reduced motion).
  function bloomAt(element) {
    if (!window.Plankton) return;
    const rect = element.getBoundingClientRect();
    window.Plankton.bloom(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // A riddle page may bring its own palette ("theme" in puzzles.json); the sea takes it too.
  const THEMES = ["green"];

  function applyTheme(name) {
    const theme = THEMES.indexOf(name) >= 0 ? name : "";
    if (theme) document.body.dataset.theme = theme;
    else delete document.body.dataset.theme;
    if (window.Plankton && window.Plankton.setTheme) window.Plankton.setTheme(theme);
  }

  // Saved answer: the card flares and the sea blooms around the button.
  function celebrate(card, button) {
    card.classList.remove("saved");
    void card.offsetWidth; // restart the flare animation
    card.classList.add("saved");
    bloomAt(button);
  }

  // ---------- Riddle media: audio and video players ----------

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SEEK_STEP = 5; // seconds per arrow key press
  const NO_TIME = "–:––";
  const START_WINDOW = 0.5; // seconds: a play this close to 0 counts as starting the track

  // Every rendered track, so only one plays at a time and views can silence them.
  const tracks = new Set();

  // Stops every track and drops its download before its card is removed.
  function stopAllAudio() {
    tracks.forEach((audio) => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    });
    tracks.clear();
  }

  // Teardown registered by the current view: timers, downloads, blob URLs.
  const leaveHandlers = [];

  function onLeave(handler) {
    leaveHandlers.push(handler);
  }

  // The current view is going away: silence it and drop everything it still has running.
  function leaveView() {
    game.viewId++;
    stopAllAudio();
    while (leaveHandlers.length) {
      try {
        leaveHandlers.pop()();
      } catch (_) {
        // One failing teardown must not keep the others from running.
      }
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return NO_TIME;
    const whole = Math.floor(seconds);
    const rest = whole % 60;
    return Math.floor(whole / 60) + ":" + (rest < 10 ? "0" : "") + rest;
  }

  // Filled 24x24 icons, one path per shape.
  const ICONS = {
    play: ["M8 5.8v12.4a1 1 0 0 0 1.53.85l9.9-6.2a1 1 0 0 0 0-1.7l-9.9-6.2A1 1 0 0 0 8 5.8z"],
    pause: [
      "M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 7 18.5z",
      "M13 5.5A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5z",
    ],
    // A ring turning back on itself, its head pointing the way it came.
    replay: [
      "M12 5.25A7.75 7.75 0 1 1 5.29 9.13a1 1 0 0 1 1.73 1A5.75 5.75 0 1 0 12 7.25z",
      "M8.1 5.64l4.15-2.9a.75.75 0 0 1 1.18.61v5.8a.75.75 0 0 1-1.18.61L8.1 6.86a.75.75 0 0 1 0-1.22z",
    ],
    enterFullscreen: [
      "M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9a1 1 0 0 1 0 2H6v3a1 1 0 0 1-2 0z",
      "M20 9V5.5A1.5 1.5 0 0 0 18.5 4H15a1 1 0 0 0 0 2h3v3a1 1 0 0 0 2 0z",
      "M4 15v3.5A1.5 1.5 0 0 0 5.5 20H9a1 1 0 0 0 0-2H6v-3a1 1 0 0 0-2 0z",
      "M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15a1 1 0 0 1 0-2h3v-3a1 1 0 0 1 2 0z",
    ],
    exitFullscreen: [
      "M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4a1 1 0 0 1 0-2h3V4a1 1 0 0 1 2 0z",
      "M15 4v3.5a1.5 1.5 0 0 0 1.5 1.5H20a1 1 0 0 0 0-2h-3V4a1 1 0 0 0-2 0z",
      "M9 20v-3.5A1.5 1.5 0 0 0 7.5 15H4a1 1 0 0 0 0 2h3v3a1 1 0 0 0 2 0z",
      "M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20a1 1 0 0 1 0 2h-3v3a1 1 0 0 1-2 0z",
    ],
    // An arrow sinking into a tray.
    download: [
      "M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 12.6V4a1 1 0 0 1 1-1z",
      "M5 15a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V16a1 1 0 0 1 1-1z",
    ],
  };

  function icon(className, shapes) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "media-icon " + className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    shapes.forEach((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  // ---------- Waiting and success marks ----------

  // The site's loader: a glint of light runs down a small wake and its head flares, with the
  // operation named beside it. Callers announce it through their own role="status" region.
  const LOADER_WAKE = "M2 13 C 10 15, 16 6, 25 7.5 S 40 6, 46 2.5";

  function svgShape(tag, className, attributes) {
    const shape = document.createElementNS(SVG_NS, tag);
    shape.setAttribute("class", className);
    Object.keys(attributes).forEach((name) => shape.setAttribute(name, attributes[name]));
    return shape;
  }

  function wakeLoader(text) {
    const loader = document.createElement("span");
    loader.className = "loader";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "loader-wake");
    svg.setAttribute("viewBox", "0 0 48 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.append(
      svgShape("path", "loader-trail", { d: LOADER_WAKE }),
      svgShape("path", "loader-haze", { d: LOADER_WAKE, pathLength: "1" }),
      svgShape("path", "loader-glint", { d: LOADER_WAKE, pathLength: "1" }),
      svgShape("circle", "loader-speck loader-speck-near", { cx: "13", cy: "8.5", r: "0.9" }),
      svgShape("circle", "loader-speck loader-speck-far", { cx: "34", cy: "4", r: "0.8" }),
      svgShape("circle", "loader-head", { cx: "46", cy: "2.5", r: "1.9" })
    );
    const label = document.createElement("span");
    label.className = "loader-text";
    label.textContent = text;
    loader.append(svg, label);
    return loader;
  }

  // Saved: a small ring of light with a check drawing itself inside.
  function checkBadge() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "check-badge");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.append(
      svgShape("circle", "badge-ring", { cx: "10", cy: "10", r: "8.25" }),
      svgShape("path", "badge-check", { d: "M6.3 10.3 8.9 12.9 13.8 7.7", pathLength: "1" })
    );
    return svg;
  }

  // The orb: a round button of wake light inside a span that carries its halo, ripples and arc.
  function orbButton(orbClass, buttonClass, icons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "orb-button " + buttonClass;
    icons.forEach((name) => button.append(icon("icon-" + name, ICONS[name])));
    const orb = document.createElement("span");
    orb.className = "orb " + orbClass;
    orb.append(button);
    return { orb: orb, button: button };
  }

  // The wake shared by both players: seek range, a glint running along its played part,
  // elapsed/total times. `kind` prefixes the classes so each player can address its own.
  function createWake(media, kind, label) {
    const bar = document.createElement("div");
    bar.className = kind + "-bar wake-bar";
    const glint = document.createElement("span");
    glint.className = kind + "-glint wake-glint";
    glint.setAttribute("aria-hidden", "true");

    // Disabled until the duration is known: there is nothing to seek before that.
    const seek = document.createElement("input");
    seek.type = "range";
    seek.className = kind + "-seek wake-seek";
    seek.min = "0";
    seek.max = "0";
    seek.step = "1";
    seek.value = "0";
    seek.disabled = true;
    seek.setAttribute("aria-label", label);

    const time = document.createElement("p");
    time.className = kind + "-time media-time";
    const elapsed = document.createElement("span");
    elapsed.textContent = "0:00";
    const total = document.createElement("span");
    total.textContent = NO_TIME;
    time.append(elapsed, total);

    // While the thumb is dragged the bar follows the finger, not the playback.
    let scrubbing = false;

    function showPosition(seconds) {
      const duration = media.duration;
      const ratio = Number.isFinite(duration) && duration > 0 ? seconds / duration : 0;
      seek.value = String(seconds);
      bar.style.setProperty("--progress", Math.min(100, ratio * 100) + "%");
      elapsed.textContent = formatTime(seconds);
      seek.setAttribute("aria-valuetext", formatTime(seconds) + " di " + formatTime(duration));
    }

    function seekTo(seconds) {
      const clamped = Math.max(0, Math.min(seconds, media.duration || 0));
      media.currentTime = clamped;
      showPosition(clamped);
    }

    seek.addEventListener("input", () => {
      scrubbing = true;
      showPosition(Number(seek.value));
    });

    seek.addEventListener("change", () => {
      scrubbing = false;
      seekTo(Number(seek.value));
    });

    // Arrow keys jump a few seconds: one-second steps are too fine for a long track.
    seek.addEventListener("keydown", (event) => {
      const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      seekTo(media.currentTime + direction * SEEK_STEP);
    });

    media.addEventListener("loadedmetadata", () => {
      if (!Number.isFinite(media.duration)) return;
      seek.max = String(Math.floor(media.duration));
      seek.disabled = false;
      total.textContent = formatTime(media.duration);
      showPosition(media.currentTime);
    });

    media.addEventListener("timeupdate", () => {
      if (!scrubbing) showPosition(media.currentTime);
    });

    bar.append(seek, glint);
    return { bar: bar, seek: seek, time: time, showPosition: showPosition };
  }

  // Custom controls over a hidden <audio>: play/pause, seek bar, elapsed/total time.
  function renderAudioPlayer(src, title) {
    const player = document.createElement("div");
    player.className = "audio-player";
    player.setAttribute("role", "group");
    player.setAttribute("aria-label", title ? "Audio di " + title : "Audio dell'enigma");

    // preload="metadata": only the duration is fetched until the player presses play.
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.hidden = true;
    audio.src = src;
    tracks.add(audio);

    const control = orbButton("audio-orb", "audio-toggle", ["play", "pause"]);
    const toggle = control.button;
    toggle.setAttribute("aria-label", "Riproduci audio");

    const track = document.createElement("div");
    track.className = "audio-track";
    const wake = createWake(audio, "audio", "Posizione audio");

    const message = document.createElement("p");
    message.className = "audio-message";
    message.setAttribute("role", "status");

    function setLoading(loading) {
      player.classList.toggle("is-loading", loading);
      toggle.setAttribute("aria-busy", String(loading));
    }

    toggle.addEventListener("click", () => {
      if (!audio.paused) {
        audio.pause();
        return;
      }
      if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setLoading(true);
      const playing = audio.play();
      // Older browsers return nothing; a refused play() (autoplay policy, abort) just stays paused.
      if (playing) playing.catch(() => setLoading(false));
    });

    // Only one track at a time: starting this one pauses the others.
    audio.addEventListener("play", () => {
      tracks.forEach((other) => {
        if (other !== audio) other.pause();
      });
      // The riddle's voice begins: the sea answers once, not on every resume.
      if (audio.currentTime < START_WINDOW) bloomAt(toggle);
      player.classList.add("is-sounding");
      toggle.setAttribute("aria-label", "Metti in pausa");
    });

    audio.addEventListener("pause", () => {
      setLoading(false);
      player.classList.remove("is-sounding");
      toggle.setAttribute("aria-label", "Riproduci audio");
    });

    audio.addEventListener("waiting", () => setLoading(true));
    audio.addEventListener("playing", () => setLoading(false));
    audio.addEventListener("canplay", () => setLoading(false));

    // Finished: rewind so the next press starts from the top.
    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      wake.showPosition(0);
    });

    audio.addEventListener("error", () => {
      // Ignore the error caused by stopAllAudio() dropping the source.
      if (!audio.getAttribute("src")) return;
      setLoading(false);
      player.classList.add("is-error");
      toggle.disabled = true;
      wake.seek.disabled = true;
      message.textContent = "Impossibile caricare l'audio.";
    });

    track.append(wake.bar, wake.time);
    player.append(audio, control.orb, track, message);
    return player;
  }

  // ---------- Video player ----------

  const IDLE_DELAY = 2500; // ms without touch, mouse or keys before fullscreen controls step aside

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return;
    try {
      const done = exit.call(document);
      if (done && typeof done.catch === "function") done.catch(() => {});
    } catch (_) {
      // Already out of fullscreen.
    }
  }

  // The audio player's twin over a <video>: a veil and a big orb rest on the picture while it
  // is still, the orb and wake sit below it (over it in fullscreen).
  function renderVideoPlayer(src, title) {
    const player = document.createElement("div");
    player.className = "video-player";
    player.setAttribute("role", "group");
    player.setAttribute("aria-label", title ? "Video di " + title : "Video dell'enigma");

    // preload="auto": the decrypted file is already in memory.
    const video = document.createElement("video");
    video.className = "riddle-video";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    video.src = src;
    tracks.add(video);

    const picture = document.createElement("div");
    picture.className = "video-stage video-frame";
    const veil = document.createElement("span");
    veil.className = "video-veil";
    veil.setAttribute("aria-hidden", "true");

    // Only a target for pointers (taps on the picture already play): the bar button is the control.
    const big = orbButton("video-big-orb", "video-big", ["play", "replay"]);
    big.button.tabIndex = -1;
    big.button.setAttribute("aria-hidden", "true");
    const center = document.createElement("span");
    center.className = "video-orb";
    center.append(big.orb);
    picture.append(video, veil, center);

    const controls = document.createElement("div");
    controls.className = "video-controls";
    const control = orbButton("video-bar-orb", "video-toggle", ["play", "pause", "replay"]);
    const toggle = control.button;
    toggle.setAttribute("aria-label", "Riproduci video");

    const track = document.createElement("div");
    track.className = "video-track";
    const wake = createWake(video, "video", "Posizione video");
    track.append(wake.bar, wake.time);

    const fullscreen = document.createElement("button");
    fullscreen.type = "button";
    fullscreen.className = "video-fullscreen";
    fullscreen.setAttribute("aria-label", "Schermo intero");
    fullscreen.append(
      icon("icon-enter-fullscreen", ICONS.enterFullscreen),
      icon("icon-exit-fullscreen", ICONS.exitFullscreen)
    );

    controls.append(control.orb, track, fullscreen);
    player.append(picture, controls);

    function setLoading(loading) {
      player.classList.toggle("is-loading", loading);
      toggle.setAttribute("aria-busy", String(loading));
    }

    function togglePlay() {
      if (!video.paused) {
        video.pause();
        return;
      }
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setLoading(true);
      const playing = video.play();
      if (playing) playing.catch(() => setLoading(false));
    }

    // Fullscreen and playing: the controls step aside after a moment without activity.
    let idleTimer = 0;
    function wakeControls() {
      clearTimeout(idleTimer);
      player.classList.remove("is-idle");
      if (player.classList.contains("is-fullscreen") && !video.paused) {
        idleTimer = setTimeout(() => player.classList.add("is-idle"), IDLE_DELAY);
      }
    }

    toggle.addEventListener("click", togglePlay);

    // A tap on the picture plays or pauses; while the fullscreen controls are hidden it only
    // brings them back (read before the player's own pointerdown wakes them).
    let tapWakes = false;
    picture.addEventListener("pointerdown", () => {
      tapWakes = player.classList.contains("is-idle");
    });
    picture.addEventListener("click", () => {
      if (tapWakes) {
        tapWakes = false;
        return;
      }
      if (!player.classList.contains("is-error")) togglePlay();
    });
    // Mouse presses must not move focus onto the hidden big orb.
    big.button.addEventListener("mousedown", (event) => event.preventDefault());

    ["pointermove", "pointerdown", "keydown"].forEach((type) => player.addEventListener(type, wakeControls));

    // Element fullscreen keeps our controls; iPhone only has the video's native fullscreen.
    const requestFullscreen = player.requestFullscreen || player.webkitRequestFullscreen;
    const canFullscreen =
      typeof requestFullscreen === "function" && Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    fullscreen.hidden = !canFullscreen && typeof video.webkitEnterFullscreen !== "function";
    let locked = false;

    fullscreen.addEventListener("click", () => {
      if (fullscreenElement() === player) {
        exitFullscreen();
        return;
      }
      try {
        if (canFullscreen) {
          const entering = requestFullscreen.call(player);
          if (entering && typeof entering.catch === "function") entering.catch(() => {});
        } else {
          video.webkitEnterFullscreen();
        }
      } catch (_) {
        // Refused (no metadata yet, or not allowed here): the player stays inline.
      }
    });

    // A wide clip turns the phone sideways; desktops and browsers that refuse simply don't.
    function lockLandscape() {
      const orientation = screen.orientation;
      if (!orientation || typeof orientation.lock !== "function" || video.videoWidth < video.videoHeight) return;
      try {
        orientation.lock("landscape").then(
          () => {
            locked = true;
          },
          () => {}
        );
      } catch (_) {
        // Orientation lock unsupported.
      }
    }

    function releaseOrientation() {
      if (!locked) return;
      locked = false;
      try {
        screen.orientation.unlock();
      } catch (_) {
        // Already released with fullscreen.
      }
    }

    // A class, not :fullscreen: an unknown prefixed pseudo-class would drop a whole selector list.
    function onFullscreenChange() {
      const active = fullscreenElement() === player;
      if (active === player.classList.contains("is-fullscreen")) return;
      player.classList.toggle("is-fullscreen", active);
      fullscreen.setAttribute("aria-label", active ? "Esci da schermo intero" : "Schermo intero");
      if (active) lockLandscape();
      else releaseOrientation();
      wakeControls();
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    onLeave(() => {
      clearTimeout(idleTimer);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      if (fullscreenElement() === player) exitFullscreen();
      releaseOrientation();
    });

    // The picture keeps the clip's own shape (16:9 until the metadata says otherwise).
    video.addEventListener("loadedmetadata", () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        picture.style.setProperty("--ratio", video.videoWidth + " / " + video.videoHeight);
      }
    });

    // Only one medium at a time: starting the video pauses the riddle audio, and vice versa.
    video.addEventListener("play", () => {
      tracks.forEach((other) => {
        if (other !== video) other.pause();
      });
      // The picture comes alive (or starts over): the sea answers once, not on every resume.
      if (video.currentTime < START_WINDOW || player.classList.contains("is-ended")) bloomAt(big.orb);
      player.classList.remove("is-ended");
      player.classList.add("is-sounding", "is-started");
      toggle.setAttribute("aria-label", "Metti in pausa");
      wakeControls();
    });

    video.addEventListener("pause", () => {
      setLoading(false);
      player.classList.remove("is-sounding");
      toggle.setAttribute("aria-label", "Riproduci video");
      wakeControls();
    });

    video.addEventListener("waiting", () => setLoading(true));
    video.addEventListener("playing", () => setLoading(false));
    video.addEventListener("canplay", () => setLoading(false));

    // The last frame stays under the veil with a replay orb; the next play starts over.
    video.addEventListener("ended", () => {
      player.classList.add("is-ended");
      wake.showPosition(video.duration);
      bloomAt(big.orb);
    });

    // Seeking back from the end turns the replay orb into a play orb again.
    video.addEventListener("seeking", () => {
      player.classList.toggle("is-ended", video.ended);
    });

    video.addEventListener("error", () => {
      // Ignore the error caused by leaving the page and dropping the source.
      if (!video.getAttribute("src")) return;
      setLoading(false);
      player.classList.add("is-error");
      toggle.disabled = true;
      fullscreen.disabled = true;
      wake.seek.disabled = true;
    });

    return player;
  }

  // ---------- Locked riddles: countdown or seal, then the encrypted video ----------

  // The media is published encrypted (IV || ciphertext || tag); only the server hands out the
  // key: a timed riddle after its unlock time (the countdown here is cosmetic), a flag riddle
  // once the organizer ticks its box in the sheet.
  const IV_BYTES = 12;
  const RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000]; // network/server hiccups, growing
  const MIN_KEY_INTERVAL = 1000; // never ask for the key more than once a second
  const SEAL_POLL = 30000; // a sealed riddle asks the server again this often

  function hasVideo(puzzle) {
    return typeof puzzle.video === "string" && puzzle.video.trim() !== "";
  }

  // "gate": "flag" in puzzles.json: opened by the organizer, not by the clock.
  function isFlagGated(puzzle) {
    return puzzle.gate === "flag";
  }

  // A flag riddle the server still keeps closed (as of the login, or the riddle page's last check).
  function isSealed(puzzle) {
    const id = String(puzzle.id);
    return isFlagGated(puzzle) && !game.unlocked[id] && Boolean(game.sealed[id]);
  }

  // Optional encrypted file to keep (e.g. a WAV to decode elsewhere): { file, name, type } or null.
  function downloadSpec(puzzle) {
    const spec = puzzle.download;
    if (!spec || typeof spec.file !== "string" || !spec.file.trim()) return null;
    const file = spec.file.trim();
    return {
      file: file,
      name: optionalText(spec.name) || file.split("/").pop().replace(/\.enc$/, ""),
      type: optionalText(spec.type) || "application/octet-stream",
    };
  }

  // This device's clock, corrected by the last server sync.
  function serverNow() {
    return Date.now() + game.clockOffset;
  }

  function unlockTime(puzzle) {
    const id = String(puzzle.id);
    if (game.unlocked[id]) return 0;
    if (game.unlockAt[id]) return game.unlockAt[id];
    const time = Date.parse(puzzle.unlockAt);
    return Number.isFinite(time) ? time : 0;
  }

  function remainingMs(puzzle) {
    return Math.max(0, unlockTime(puzzle) - serverNow());
  }

  // Milliseconds until the corrected clock ticks over to the next whole second.
  function untilNextSecond() {
    return 1000 - (((serverNow() % 1000) + 1000) % 1000) + 10;
  }

  function pad(number) {
    return (number < 10 ? "0" : "") + number;
  }

  // "08:01:22"; a day or more away, "2g 03:04:05". Rounded up, so 00:00:00 means "now".
  function formatCountdown(ms) {
    const total = Math.ceil(ms / 1000);
    const days = Math.floor(total / 86400);
    const clock =
      pad(Math.floor(total / 3600) % 24) + ":" + pad(Math.floor(total / 60) % 60) + ":" + pad(total % 60);
    return days > 0 ? days + "g " + clock : clock;
  }

  // "Si svela alle 20:30", or with the day when it is not today.
  function unlockLabel(time) {
    const date = new Date(time);
    const hour = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    if (new Date(serverNow()).toDateString() === date.toDateString()) return "Si svela alle " + hour;
    const day = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    return "Si svela " + day + " alle " + hour;
  }

  function formatMegabytes(bytes) {
    return (bytes / 1048576).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  // Index: locked tiles count down together; at zero a tile becomes an ordinary riddle.
  function startTileClocks(clocks) {
    if (clocks.length === 0) return;
    let timer = 0;
    function tick() {
      let waiting = false;
      clocks.forEach((clock) => {
        if (!clock.tile.classList.contains("is-locked")) return;
        const left = remainingMs(clock.puzzle);
        if (left > 0) {
          clock.time.textContent = formatCountdown(left);
          waiting = true;
          return;
        }
        clock.tile.classList.remove("is-locked");
        clock.clue.replaceChildren("ancora da svelare");
      });
      if (waiting) timer = setTimeout(tick, untilNextSecond());
    }
    onLeave(() => clearTimeout(timer));
    timer = setTimeout(tick, untilNextSecond());
  }

  // Streams the file, reporting (received, total); total is 0 when the size is unknown.
  async function download(url, signal, onProgress) {
    const res = await fetch(url, { signal: signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    // A compressed response reports its compressed size: progress is then indeterminate.
    const total = res.headers.get("Content-Encoding") ? 0 : Number(res.headers.get("Content-Length")) || 0;
    if (!res.body || typeof res.body.getReader !== "function") {
      const whole = new Uint8Array(await res.arrayBuffer());
      onProgress(whole.length, whole.length);
      return whole;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.length;
      onProgress(received, total);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.length;
    });
    return bytes;
  }

  // AES-256-GCM with the 12-byte IV in front; WebCrypto checks the trailing tag.
  async function decryptMedia(bytes, keyBase64) {
    const raw = Uint8Array.from(atob(keyBase64), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, IV_BYTES) }, key, bytes.subarray(IV_BYTES));
  }

  function canDecrypt() {
    return Boolean(window.crypto && crypto.subtle && typeof URL.createObjectURL === "function");
  }

  // Download progress: a title, a wake of light filling up, and the amount received.
  function progressMeter(label) {
    const box = document.createElement("div");
    box.className = "reveal-loader";
    box.hidden = true;
    const title = document.createElement("p");
    title.className = "reveal-loader-title";
    const bar = document.createElement("div");
    bar.className = "reveal-bar";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", label);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    const amount = document.createElement("p");
    amount.className = "reveal-amount";
    box.append(title, bar, amount);

    function show(received, total) {
      if (total > 0) {
        const percent = Math.min(100, Math.round((received / total) * 100));
        bar.classList.remove("is-indeterminate");
        bar.style.setProperty("--progress", String(Math.min(1, received / total)));
        bar.setAttribute("aria-valuenow", String(percent));
        amount.textContent = percent + "% · " + formatMegabytes(received) + " di " + formatMegabytes(total) + " MB";
      } else {
        bar.classList.add("is-indeterminate");
        bar.removeAttribute("aria-valuenow");
        amount.textContent = formatMegabytes(received) + " MB";
      }
    }
    return { box: box, title: title, show: show };
  }

  // A file to keep: fetched and decrypted only when asked for, then handed to the browser as a
  // download under its original name. `signal` aborts it and `keepUrl` frees its blob on leave.
  function renderDownload(spec, keyBase64, signal, keepUrl) {
    const box = document.createElement("div");
    box.className = "riddle-media riddle-download";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary download-button";
    button.append(icon("download-icon", ICONS.download), "Scarica il file");

    // Shown once the file is ready: a real link, so a tap can save it again (or for the first
    // time, where the browser held back the automatic download).
    const link = document.createElement("a");
    link.className = "btn-secondary download-button download-save";
    link.hidden = true;
    link.append(icon("download-icon", ICONS.download), "Salva di nuovo");
    // Old iOS ignores "download": the file then opens in a new tab, where it can be shared.
    if ("download" in HTMLAnchorElement.prototype) link.download = spec.name;
    else link.target = "_blank";

    const name = document.createElement("p");
    name.className = "download-name";
    name.textContent = spec.name;

    const meter = progressMeter("Download di " + spec.name);
    const message = document.createElement("p");
    message.className = "reveal-message";
    message.setAttribute("role", "status");

    function fail(text) {
      meter.box.hidden = true;
      button.hidden = false;
      button.disabled = false;
      message.textContent = text;
      message.classList.add("is-error");
    }

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      if (!canDecrypt()) {
        fail("Questo browser non riesce ad aprire il file: prova con un browser aggiornato.");
        return;
      }
      button.disabled = true;
      button.hidden = true;
      message.textContent = "";
      message.classList.remove("is-error");
      meter.box.hidden = false;
      meter.title.textContent = "Il file sta affiorando…";
      meter.show(0, 0);

      let bytes;
      try {
        bytes = await download(spec.file, signal, meter.show);
      } catch (_) {
        if (!signal.aborted) fail("Download non riuscito. Controlla la rete e riprova.");
        return;
      }
      if (signal.aborted) return;
      meter.title.textContent = "Decifratura in corso…";
      let plain;
      try {
        plain = await decryptMedia(bytes, keyBase64);
      } catch (_) {
        if (!signal.aborted) fail("Impossibile aprire il file: la chiave non corrisponde. Avvisa l'organizzatore.");
        return;
      }
      if (signal.aborted) return;
      bytes = null;

      link.href = URL.createObjectURL(new Blob([plain], { type: spec.type }));
      keepUrl(link.href);
      plain = null;
      meter.box.hidden = true;
      link.hidden = false;
      message.textContent = "File pronto. Se il download non è partito, tocca «Salva di nuovo».";
      link.click();
    });

    box.append(mediaLabel("Il file dell'enigma"), button, link, name, meter.box, message);
    return box;
  }

  // Locked riddle: a countdown (timed) or a seal (flag) until the server hands out the key, then
  // download, decrypt and play the video. `onReveal` shows the riddle text and the answer form
  // once the riddle is open.
  function renderLockedStage(puzzle, onReveal) {
    const viewId = game.viewId;
    const session = game.session;
    const id = String(puzzle.id);
    const title = String(puzzle.title || "");
    const flag = isFlagGated(puzzle);
    const alive = () => viewId === game.viewId;

    const stage = document.createElement("div");
    stage.className = "reveal";

    const lock = document.createElement("div");
    lock.className = "reveal-lock";
    const clock = document.createElement("p");
    clock.className = "countdown";
    const when = document.createElement("p");
    when.className = "countdown-when";
    lock.append(clock, when);

    // A flag riddle has no time to count down to: a seal, re-checked on its own and on demand.
    let checkButton = null;
    let checked = null;
    if (flag) {
      lock.classList.add("reveal-seal");
      clock.classList.add("is-sealed");
      clock.textContent = "Sigillato";
      when.textContent = "Si svela al segnale dell'organizzatore. Resta pure qui: la pagina si apre da sola.";
      const row = document.createElement("div");
      row.className = "seal-row";
      checkButton = document.createElement("button");
      checkButton.type = "button";
      checkButton.className = "btn-secondary seal-check";
      checkButton.textContent = "Controlla ora";
      checked = document.createElement("p");
      checked.className = "seal-checked";
      row.append(checkButton, checked);
      lock.append(row);
    } else {
      clock.setAttribute("role", "timer");
    }

    const meter = progressMeter("Download del video");
    const loader = meter.box;
    const loaderTitle = meter.title;
    const showProgress = meter.show;

    const message = document.createElement("p");
    message.className = "reveal-message";
    message.setAttribute("role", "status");

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn-secondary reveal-retry";
    retry.textContent = "Riprova";
    retry.hidden = true;

    stage.append(lock, loader, message, retry);

    let timer = 0;
    let attempt = 0;
    let requesting = false;
    let manualCheck = false;
    let lastRequest = 0;
    let retryAction = null;
    let video = null;
    const blobUrls = [];
    const abort = new AbortController();

    function onVisible() {
      // Back on the page: a sealed riddle looks again at once instead of waiting for its poll.
      if (document.hidden || !flag || lock.hidden || requesting) return;
      clearTimeout(timer);
      requestKey();
    }
    document.addEventListener("visibilitychange", onVisible);

    onLeave(() => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      abort.abort();
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
      blobUrls.length = 0;
    });

    function keepUrl(url) {
      blobUrls.push(url);
    }

    function schedule(fn, delay) {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    }

    function say(text, isError) {
      message.textContent = text;
      message.classList.toggle("is-error", Boolean(isError));
    }

    function showProblem(text, action) {
      say(text, true);
      retryAction = action;
      retry.hidden = !action;
    }

    retry.addEventListener("click", () => {
      const action = retryAction;
      showProblem("", null);
      say("Un attimo…", false);
      if (action) action();
    });

    if (checkButton) {
      checkButton.addEventListener("click", () => {
        if (requesting) return;
        clearTimeout(timer);
        manualCheck = true;
        requestKey();
      });
    }

    // The check button carries the loader while a request is out, so the seal never jumps.
    function setChecking(active) {
      if (!checkButton) return;
      checkButton.disabled = active;
      checkButton.classList.toggle("is-pending", active);
      if (active) checkButton.replaceChildren(wakeLoader("Controllo…"));
      else checkButton.textContent = "Controlla ora";
    }

    // `checkedNow`: the server has just answered, so the last check time is fresh.
    function showSeal(checkedNow) {
      lock.hidden = false;
      loader.hidden = true;
      showProblem("", null);
      if (checkedNow) {
        const time = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        checked.textContent = "Ultimo controllo alle " + time;
      }
      if (manualCheck) say("Ancora sigillato. La pagina continua a controllare da sola.", false);
      manualCheck = false;
      schedule(requestKey, SEAL_POLL);
    }

    function showCountdown() {
      lock.hidden = false;
      loader.hidden = true;
      tick();
    }

    function tick() {
      const left = remainingMs(puzzle);
      clock.textContent = formatCountdown(left);
      clock.classList.toggle("is-long", left >= 86400000);
      if (left > 0) {
        when.textContent = unlockLabel(unlockTime(puzzle));
        schedule(tick, untilNextSecond());
        return;
      }
      if (!hasVideo(puzzle)) {
        // Nothing encrypted to fetch: the riddle simply opens.
        lock.hidden = true;
        onReveal();
        return;
      }
      when.textContent = "Ci siamo…";
      // A request is already out, or one just came back still locked: look again shortly.
      if (requesting || Date.now() - lastRequest < MIN_KEY_INTERVAL) {
        schedule(tick, MIN_KEY_INTERVAL);
        return;
      }
      requestKey();
    }

    async function requestKey() {
      if (requesting) return;
      requesting = true;
      setChecking(true);
      lastRequest = Date.now();
      const sentAt = lastRequest;
      let data;
      try {
        data = await api("getPuzzleKey", { username: session.username, token: session.token, puzzleId: id });
      } catch (err) {
        if (alive()) onKeyError(err);
        return;
      } finally {
        requesting = false;
        if (alive()) setChecking(false);
      }
      if (!alive()) return;
      attempt = 0;
      if (data.locked) {
        if (flag) {
          game.sealed[id] = true;
          say("", false);
          showSeal(true);
          return;
        }
        // The server's clock wins; measure it at the middle of the round trip.
        const serverTime = Date.parse(data.serverNow);
        if (Number.isFinite(serverTime)) game.clockOffset = serverTime - (sentAt + Date.now()) / 2;
        const unlockAt = Date.parse(data.unlockAt);
        if (Number.isFinite(unlockAt)) game.unlockAt[id] = unlockAt;
        say("", false);
        showCountdown();
        return;
      }
      game.unlocked[id] = true;
      delete game.sealed[id];
      const key = String(data.key || "");
      if (hasVideo(puzzle)) loadVideo(key);
      else openRiddle(key);
    }

    function onKeyError(err) {
      manualCheck = false;
      if (err instanceof ApiError && err.code === "AUTH") {
        logout();
        els.registerError.textContent = err.message;
        return;
      }
      // Only the opening sync failed: the countdown keeps going on this device's clock.
      if (!flag && !lock.hidden && remainingMs(puzzle) > 0) return;
      if (err.code === "NOT_CONFIGURED" || err.code === "BAD_REQUEST") {
        // The seal is lifted (or the riddle is unknown): the problem replaces it.
        if (flag) lock.hidden = true;
        showProblem(err.code === "NOT_CONFIGURED" ? "Il video non è ancora pronto, riprova tra poco." : err.message, requestKey);
        return;
      }
      // Network, busy or server hiccup: try again on its own, waiting a little longer each time.
      const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
      attempt++;
      say(err.message + " Nuovo tentativo tra " + Math.round(delay / 1000) + " s…", true);
      schedule(requestKey, delay);
    }

    async function loadVideo(keyBase64) {
      clearTimeout(timer);
      lock.hidden = true;
      showProblem("", null);
      if (!canDecrypt()) {
        showProblem("Questo browser non riesce ad aprire il video: prova con un browser aggiornato.", null);
        return;
      }
      loader.hidden = false;
      loaderTitle.textContent = "Il video sta affiorando…";
      showProgress(0, 0);

      let bytes;
      try {
        bytes = await download(puzzle.video.trim(), abort.signal, showProgress);
      } catch (_) {
        if (!alive()) return;
        loader.hidden = true;
        showProblem("Download del video non riuscito. Controlla la rete e riprova.", () => loadVideo(keyBase64));
        return;
      }
      if (!alive()) return;

      loaderTitle.textContent = "Decifratura in corso…";
      let plain;
      try {
        plain = await decryptMedia(bytes, keyBase64);
      } catch (_) {
        if (!alive()) return;
        loader.hidden = true;
        showProblem("Impossibile aprire il video: la chiave non corrisponde. Avvisa l'organizzatore.", requestKey);
        return;
      }
      if (!alive()) return;
      bytes = null;

      const objectUrl = URL.createObjectURL(new Blob([plain], { type: "video/mp4" }));
      keepUrl(objectUrl);
      plain = null;
      loader.hidden = true;
      mountVideo(objectUrl);
      openRiddle(keyBase64);
    }

    function mountVideo(objectUrl) {
      // No "#t=" fragment on the blob URL: older iOS WebKit fails to resolve it and refuses the
      // source. A tiny seek after the metadata paints the first frame instead of a black box.
      const player = renderVideoPlayer(objectUrl, title);
      const frame = player.querySelector(".video-frame");
      video = player.querySelector("video");
      video.addEventListener("loadedmetadata", () => {
        if (video.paused && video.currentTime === 0) video.currentTime = 0.001;
      }, { once: true });
      video.addEventListener("error", () => {
        // Ignore the error caused by leaving the page and dropping the source.
        if (!video.getAttribute("src")) return;
        const code = video.error ? " (codice " + video.error.code + ")" : "";
        showProblem("Questo browser non riesce a riprodurre il video" + code + ".", null);
      });
      stage.insertBefore(mediaLabel("Guarda l'enigma"), message);
      stage.insertBefore(player, message);
      say("", false);
      // The riddle surfaces: the frame lights up and the sea blooms around it.
      requestAnimationFrame(() => {
        if (!alive()) return;
        stage.classList.add("is-revealed");
        bloomAt(frame);
      });
    }

    // Open: the file to keep (with the same key), then the riddle text and the answer form.
    function openRiddle(keyBase64) {
      lock.hidden = true;
      if (!video) {
        say("", false);
        stage.classList.add("is-revealed");
      }
      const spec = downloadSpec(puzzle);
      if (spec) stage.insertBefore(renderDownload(spec, keyBase64, abort.signal, keepUrl), message);
      onReveal();
    }

    if (flag) {
      if (isSealed(puzzle)) {
        showSeal(false);
      } else {
        lock.hidden = true;
        say(hasVideo(puzzle) ? "Apertura del video…" : "Apertura dell'enigma…", false);
      }
      requestKey();
    } else if (remainingMs(puzzle) > 0) {
      showCountdown();
      // Sync with the server clock (or open straight away if this device is running late).
      if (hasVideo(puzzle)) requestKey();
    } else {
      lock.hidden = true;
      say("Apertura del video…", false);
      requestKey();
    }
    return stage;
  }

  // ---------- Router ----------

  // "#/" (or no hash) is the index of clues, "#/enigma/<id>" a riddle page.
  const RIDDLE_ROUTE = /^#\/enigma\/(.+)$/;

  function riddleHref(id) {
    return "#/enigma/" + encodeURIComponent(id);
  }

  // Id of the riddle named by the current hash, or "" for the index.
  function routeRiddleId() {
    const match = RIDDLE_ROUTE.exec(location.hash);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch (_) {
      return match[1];
    }
  }

  // Rewrites the hash without a history entry (replaceState never fires hashchange).
  function replaceRoute(hash) {
    try {
      history.replaceState(null, "", hash || location.pathname + location.search);
    } catch (_) {
      // Sandboxed or file:// pages: a stale hash only affects the next login.
    }
  }

  function onRouteChange() {
    // Logged out or still loading: the route is applied once the riddles arrive.
    if (!game.session || !game.puzzles) return;
    renderRoute();
  }

  function renderRoute() {
    if (els.puzzlesView.querySelector(".index-view")) game.indexScroll = window.scrollY;
    leaveView();
    forgetIgnites();
    els.puzzlesView.replaceChildren();
    if (game.puzzles.length === 0) {
      els.puzzlesStatus.textContent = "Nessun enigma pubblicato per ora. Torna più tardi!";
      return;
    }
    els.puzzlesStatus.textContent = "";

    const id = routeRiddleId();
    if (!id) {
      renderIndex("");
      return;
    }
    const puzzle = game.puzzles.find((candidate) => String(candidate.id) === id);
    if (puzzle) {
      renderRiddle(puzzle);
      return;
    }
    replaceRoute("#/");
    renderIndex("Questo enigma non esiste: ecco i tuoi indizi.");
  }

  // ---------- Views ----------

  function savedAnswer(id) {
    const value = game.answers[id];
    return value == null ? "" : String(value).trim();
  }

  function visuallyHidden(text) {
    const span = document.createElement("span");
    span.className = "visually-hidden";
    span.textContent = text;
    return span;
  }

  // Thin stroked chevron; the back link mirrors it in CSS.
  function chevron(className) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "chevron " + className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M9.5 5.5 16 12l-6.5 6.5");
    svg.appendChild(path);
    return svg;
  }

  // Tab title per view: "Indizi · Caccia al Tesoro", "Enigma 1 · Caccia al Tesoro".
  const SITE_TITLE = "Caccia al Tesoro";

  function setPageTitle(page) {
    document.title = page ? page + " · " + SITE_TITLE : SITE_TITLE;
  }

  // New view: keyboard and screen reader focus land on its heading.
  function focusHeading(heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  function showRegister() {
    leaveView();
    document.body.classList.remove("is-playing");
    els.userBar.hidden = true;
    els.puzzlesSection.hidden = true;
    forgetIgnites();
    els.puzzlesView.replaceChildren();
    els.registerSection.hidden = false;
    setPageTitle("");
    // A device that has never played opens on "Registrati", afterwards on "Accedi".
    setAuthMode(hasPlayedHere() ? "login" : "register");
    if (els.passwordToggle.getAttribute("aria-pressed") === "true") togglePasswordVisibility();
    els.usernameInput.focus();
  }

  async function showPuzzles(session) {
    leaveView();
    const loadId = ++game.loadId;
    Object.assign(game, {
      session: session,
      puzzles: null,
      answers: {},
      indexScroll: 0,
      rendered: false,
      freshId: "",
      clockOffset: 0,
      unlockAt: {},
      unlocked: {},
      sealed: {},
    });
    els.registerSection.hidden = true;
    document.body.classList.add("is-playing");
    els.userName.textContent = session.username;
    els.userBar.hidden = false;
    els.puzzlesSection.hidden = false;
    els.puzzlesView.replaceChildren();
    els.puzzlesStatus.replaceChildren(wakeLoader("Caricamento enigmi…"));

    let puzzles, answers, locked;
    try {
      const results = await Promise.all([
        fetchPuzzles(),
        api("getMyAnswers", { username: session.username, token: session.token }),
      ]);
      puzzles = results[0];
      answers = results[1].answers || {};
      locked = Array.isArray(results[1].locked) ? results[1].locked.map(String) : null;
    } catch (err) {
      if (loadId !== game.loadId) return;
      if (err instanceof ApiError && err.code === "AUTH") {
        logout();
        els.registerError.textContent = err.message;
        return;
      }
      els.puzzlesStatus.textContent =
        err instanceof ApiError ? err.message : "Impossibile caricare gli enigmi.";
      return;
    }
    if (loadId !== game.loadId) return;

    game.answers = answers;
    game.puzzles = puzzles.filter((puzzle) => puzzle && puzzle.id != null);
    // Flag riddles the server lists as closed (all of them, if it lists none: an older backend).
    game.puzzles.forEach((puzzle) => {
      const id = String(puzzle.id);
      if (isFlagGated(puzzle) && (!locked || locked.indexOf(id) >= 0)) game.sealed[id] = true;
    });
    renderRoute();
  }

  // Index: how many clues are collected, then one tile per riddle.
  function renderIndex(notice) {
    const puzzles = game.puzzles;
    const view = document.createElement("div");
    view.className = "view index-view";

    if (notice) {
      const note = document.createElement("p");
      note.className = "route-notice";
      note.setAttribute("role", "status");
      note.textContent = notice;
      view.append(note);
    }

    const solved = puzzles.filter((puzzle) => savedAnswer(puzzle.id) !== "").length;
    const progress = document.createElement("header");
    progress.className = "progress";

    const heading = document.createElement("h2");
    heading.className = "progress-title";
    heading.textContent = "Indizi raccolti";

    const count = document.createElement("p");
    count.className = "progress-count";
    const shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    const found = document.createElement("span");
    found.className = "progress-found";
    found.textContent = String(solved);
    shown.append(found, " / " + puzzles.length);
    count.append(visuallyHidden(solved + " su " + puzzles.length), shown);

    // One segment per riddle, in order: the collected ones glow.
    const line = document.createElement("div");
    line.className = "progress-line";
    line.setAttribute("aria-hidden", "true");
    puzzles.forEach((puzzle) => {
      const segment = document.createElement("span");
      if (savedAnswer(puzzle.id) !== "") segment.className = "is-lit";
      if (String(puzzle.id) === game.freshId) segment.classList.add("is-fresh");
      line.append(segment);
    });

    progress.append(heading, count, line);

    const list = document.createElement("ol");
    list.className = "tiles";
    const clocks = [];
    const tiles = puzzles.map((puzzle) => {
      const item = document.createElement("li");
      const tile = renderTile(puzzle, clocks);
      item.append(tile);
      list.append(item);
      return tile;
    });

    view.append(progress, list);
    els.puzzlesView.append(view);
    startTileClocks(clocks);

    // The tiles ignite on the first visit; afterwards the index simply comes back lit.
    tiles.forEach((tile, index) => {
      if (!game.rendered) {
        tile.classList.add("ignite");
        ignite(tile, index);
      }
      if (tile.dataset.id === game.freshId) tile.classList.add("saved");
    });
    game.rendered = true;
    game.freshId = "";

    setPageTitle("Indizi");
    window.scrollTo(0, notice ? 0 : game.indexScroll);
    focusHeading(heading);
  }

  // A riddle still waiting for its time gets a live countdown, registered in `clocks`; one
  // waiting for the organizer's signal stays sealed.
  function renderTile(puzzle, clocks) {
    const answer = savedAnswer(puzzle.id);
    const sealed = !answer && isSealed(puzzle);
    const locked = sealed || (!answer && remainingMs(puzzle) > 0);
    const tile = document.createElement("a");
    tile.className = "tile" + (answer ? " is-solved" : "") + (locked ? " is-locked" : "");
    tile.href = riddleHref(puzzle.id);
    tile.dataset.id = String(puzzle.id);

    const light = document.createElement("span");
    light.className = "tile-light";
    light.setAttribute("aria-hidden", "true");

    const body = document.createElement("span");
    body.className = "tile-body";

    const title = document.createElement("h3");
    title.className = "tile-title";
    title.textContent = String(puzzle.title || "");

    const clue = document.createElement("span");
    clue.className = "tile-clue";
    if (answer) {
      clue.append(visuallyHidden("Indizio raccolto: "), answer);
    } else if (sealed) {
      clue.append(visuallyHidden("Enigma chiuso, "), "ancora sigillato");
    } else if (locked) {
      const time = document.createElement("span");
      time.className = "tile-countdown";
      time.textContent = formatCountdown(remainingMs(puzzle));
      clue.append(visuallyHidden("Enigma chiuso, "), "si svela tra ", time);
      clocks.push({ puzzle: puzzle, tile: tile, clue: clue, time: time });
    } else {
      clue.textContent = "ancora da svelare";
    }

    body.append(title, clue);
    tile.append(light, body, chevron("tile-arrow"));
    return tile;
  }

  // Optional organizer-written text field: "" when absent or blank.
  function optionalText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  const ROMAN = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];

  function toRoman(number) {
    let rest = Math.floor(number);
    let out = "";
    ROMAN.forEach(([value, letters]) => {
      while (rest >= value) {
        out += letters;
        rest -= value;
      }
    });
    return out;
  }

  // "I di II": where this riddle sits in puzzles.json, read as "Enigma 1 di 2".
  function riddlePosition(puzzle) {
    const total = game.puzzles.length;
    const place = game.puzzles.indexOf(puzzle) + 1;
    const position = document.createElement("p");
    position.className = "riddle-position";
    const shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    const current = document.createElement("span");
    current.className = "riddle-position-current";
    current.textContent = toRoman(place);
    shown.append(current, " di " + toRoman(total));
    position.append(visuallyHidden("Enigma " + place + " di " + total), shown);
    return position;
  }

  // Small label over a player, so it reads as the riddle itself and not decoration.
  function mediaLabel(text) {
    const label = document.createElement("p");
    label.className = "media-label";
    label.textContent = text;
    return label;
  }

  // Optional hint, folded away until the player asks for it.
  function renderHint(hint) {
    const details = document.createElement("details");
    details.className = "riddle-hint";
    const summary = document.createElement("summary");
    summary.append("Serve un suggerimento?", chevron("hint-arrow"));
    const body = document.createElement("p");
    body.className = "riddle-hint-text";
    body.textContent = hint;
    details.append(summary, body);
    return details;
  }

  // Riddle page: title, optional subtitle, text, optional media and hint, then the answer
  // form, pre-filled with the saved answer.
  function renderRiddle(puzzle) {
    const session = game.session;
    const loadId = game.loadId;
    game.freshId = "";

    const view = document.createElement("div");
    view.className = "view riddle-view";

    const theme = optionalText(puzzle.theme);
    if (theme) {
      applyTheme(theme);
      onLeave(() => applyTheme(""));
    }

    const nav = document.createElement("div");
    nav.className = "riddle-nav";
    const back = document.createElement("a");
    back.className = "back-link";
    back.href = "#/";
    back.append(chevron("back-arrow"), "Indizi");
    nav.append(back, riddlePosition(puzzle));

    const card = document.createElement("article");
    card.className = "card puzzle";

    const head = document.createElement("header");
    head.className = "riddle-head";
    const title = document.createElement("h2");
    title.className = "riddle-title";
    title.textContent = String(puzzle.title || "");
    head.append(title);
    const subtitleText = optionalText(puzzle.subtitle);
    if (subtitleText) {
      const subtitle = document.createElement("p");
      subtitle.className = "riddle-subtitle";
      subtitle.textContent = subtitleText;
      head.append(subtitle);
    }

    const text = document.createElement("p");
    text.className = "puzzle-text";
    text.textContent = String(puzzle.text || "");
    // No text yet (a riddle that is only audio or video): no empty paragraph either.
    if (!text.textContent.trim()) text.classList.add("is-empty");

    const hintText = optionalText(puzzle.hint);
    const hint = hintText ? renderHint(hintText) : null;

    const form = document.createElement("form");
    form.className = "answer-form";

    const inputId = "answer-" + puzzle.id;
    const label = document.createElement("label");
    label.className = "answer-label";
    label.htmlFor = inputId;
    label.textContent = "La tua risposta";

    const row = document.createElement("div");
    row.className = "row";

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "text";
    input.maxLength = ANSWER_MAX;
    input.autocomplete = "off";
    input.placeholder = "Scrivi qui la soluzione";
    input.value = savedAnswer(puzzle.id);

    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Salva";

    const status = document.createElement("p");
    status.className = "save-status";
    status.setAttribute("role", "status");

    // Typing clears the last outcome, but never the loader of a save still on its way.
    input.addEventListener("input", () => {
      if (button.disabled) return;
      status.textContent = "";
      status.className = "save-status";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      button.classList.add("is-pending");
      status.className = "save-status is-pending";
      status.replaceChildren(wakeLoader("Salvataggio…"));
      // The input stays editable while saving: keep what was actually sent.
      const submitted = input.value;
      try {
        await api("saveAnswer", {
          username: session.username,
          token: session.token,
          puzzleId: puzzle.id,
          answer: submitted,
        });
        // Logged out while saving: this page and its state are gone.
        if (loadId !== game.loadId) return;
        // Same trim as the server, so the index shows exactly what was stored.
        const answer = submitted.trim();
        game.answers[puzzle.id] = answer;
        game.freshId = answer ? String(puzzle.id) : "";
        // Left the page while saving: refresh the index if it is showing.
        if (!card.isConnected) {
          if (els.puzzlesView.querySelector(".index-view")) renderRoute();
          return;
        }
        if (input.value === submitted) input.value = answer;
        status.replaceChildren(checkBadge(), "Salvato");
        status.className = "save-status ok";
        celebrate(card, button);
      } catch (err) {
        if (loadId !== game.loadId) return;
        if (err instanceof ApiError && err.code === "AUTH") {
          logout();
          els.registerError.textContent = err.message;
          return;
        }
        status.textContent = err.message;
        status.className = "save-status error";
      } finally {
        button.disabled = false;
        button.classList.remove("is-pending");
      }
    });

    row.append(input, button);
    form.append(label, row, status);
    card.append(head, text);
    // Optional track, between the riddle and the answer.
    if (typeof puzzle.audio === "string" && puzzle.audio.trim() !== "") {
      const media = document.createElement("div");
      media.className = "riddle-media";
      media.append(mediaLabel("Ascolta l'enigma"), renderAudioPlayer(puzzle.audio.trim(), String(puzzle.title || "")));
      card.append(media);
    }
    // Timed, flag or video riddle: only the countdown or seal (then the video) shows until it
    // is revealed.
    if (hasVideo(puzzle) || isFlagGated(puzzle) || remainingMs(puzzle) > 0) {
      text.hidden = true;
      form.hidden = true;
      if (hint) hint.hidden = true;
      card.append(
        renderLockedStage(puzzle, () => {
          text.hidden = false;
          form.hidden = false;
          if (hint) hint.hidden = false;
        })
      );
    }
    if (hint) card.append(hint);
    card.append(form);
    view.append(nav, card);
    els.puzzlesView.append(view);
    // A dedicated page shows its riddle at once; only the player's own light wakes up after.
    requestAnimationFrame(() => card.classList.add("lit"));

    setPageTitle(String(puzzle.title || "").trim() || "Enigma");
    window.scrollTo(0, 0);
    focusHeading(title);
  }

  // ---------- Actions ----------

  // "login" or "register": what the single submit button (and Enter) does.
  function authMode() {
    return els.registerForm.dataset.mode === "login" ? "login" : "register";
  }

  function modeInputs() {
    return els.registerForm.querySelectorAll('input[name="auth-mode"]');
  }

  // Switches the form between "Accedi" and "Registrati", keeping what was typed.
  function setAuthMode(mode) {
    const register = mode === "register";
    els.registerForm.dataset.mode = register ? "register" : "login";
    modeInputs().forEach((radio) => {
      radio.checked = radio.value === els.registerForm.dataset.mode;
    });
    els.authSubmit.textContent = register ? "Registrati" : "Accedi";
    // Password managers offer a saved password on login and a new one on registration.
    els.passwordInput.autocomplete = register ? "new-password" : "current-password";
    els.confirmInput.disabled = !register;
    showConfirmError("");
    els.registerError.textContent = "";
  }

  function showConfirmError(text) {
    els.confirmError.textContent = text;
    if (text) els.confirmInput.setAttribute("aria-invalid", "true");
    else els.confirmInput.removeAttribute("aria-invalid");
  }

  // One button shows or hides both password fields.
  function togglePasswordVisibility() {
    const show = els.passwordToggle.getAttribute("aria-pressed") !== "true";
    els.passwordToggle.setAttribute("aria-pressed", String(show));
    els.passwordInput.type = show ? "text" : "password";
    els.confirmInput.type = show ? "text" : "password";
  }

  // Disables the form's controls while a request is out (inputs stay as typed); the submit
  // button carries the loader, so nothing around it moves.
  function setAuthPending(pending) {
    const login = authMode() === "login";
    if (pending) {
      // The button says it short enough for a 320 px screen; the live region says it whole.
      els.authSubmit.replaceChildren(wakeLoader(login ? "Accesso in corso…" : "Registrazione…"));
      els.authStatus.textContent = login ? "Accesso in corso…" : "Registrazione in corso…";
    } else {
      els.authSubmit.textContent = login ? "Accedi" : "Registrati";
      els.authStatus.textContent = "";
    }
    els.authSubmit.classList.toggle("is-pending", pending);
    els.authSubmit.disabled = pending;
    els.passwordToggle.disabled = pending;
    modeInputs().forEach((radio) => {
      radio.disabled = pending;
    });
  }

  // The mode toggle decides the action: "Accedi" logs in, "Registrati" creates the account.
  async function onAuth(event) {
    event.preventDefault();
    if (els.authSubmit.disabled) return;
    els.registerError.textContent = "";
    showConfirmError("");
    const action = authMode();
    const username = els.usernameInput.value.trim();
    const password = els.passwordInput.value.trim();
    if (username.length < 2 || username.length > 30) {
      els.registerError.textContent = "Lo username deve avere tra 2 e 30 caratteri.";
      els.usernameInput.focus();
      return;
    }
    if (password.length < 1 || password.length > 50) {
      els.registerError.textContent = "La password deve avere tra 1 e 50 caratteri.";
      els.passwordInput.focus();
      return;
    }
    // Same trim as the password, so stray spaces never count as a mismatch.
    if (action === "register" && els.confirmInput.value.trim() !== password) {
      showConfirmError("Le due password non coincidono: riscrivila uguale.");
      els.confirmInput.focus();
      return;
    }
    setAuthPending(true);
    try {
      const data = await api(action, { username: username, password: password });
      const session = { username: data.username, token: data.token };
      saveSession(session);
      rememberPlayedHere();
      els.usernameInput.value = "";
      els.passwordInput.value = "";
      els.confirmInput.value = "";
      showPuzzles(session);
    } catch (err) {
      els.registerError.textContent = err.message;
    } finally {
      setAuthPending(false);
    }
  }

  // Keeps the hash, so a deep link survives an expired session and opens after the next login.
  function logout() {
    game.loadId++;
    game.session = null;
    game.puzzles = null;
    game.answers = {};
    clearSession();
    els.registerError.textContent = "";
    showRegister();
  }

  // ---------- Init ----------

  function init() {
    if (!isConfigured()) {
      els.configWarning.hidden = false;
      return;
    }
    els.registerForm.addEventListener("submit", onAuth);
    modeInputs().forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.checked) setAuthMode(radio.value);
      });
    });
    els.passwordToggle.addEventListener("click", togglePasswordVisibility);
    els.confirmInput.addEventListener("input", () => showConfirmError(""));
    els.logoutBtn.addEventListener("click", () => {
      // Ask first so a misclick does not log the player out.
      const confirmed = window.confirm("Vuoi uscire? Potrai rientrare con username e password.");
      if (!confirmed) return;
      // A deliberate exit forgets the current riddle: the next login opens the index.
      replaceRoute("");
      logout();
    });
    window.addEventListener("hashchange", onRouteChange);

    const session = loadSession();
    if (session) {
      showPuzzles(session);
    } else {
      showRegister();
    }
  }

  init();
})();
