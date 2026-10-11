// Treasure hunt frontend: plain JS, no build step.
// API_URL is defined in config.js (loaded before this file).

(function () {
  "use strict";

  const STORAGE_KEY = "caccia-al-tesoro-session";
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

  // Saved answer: the card flares and the sea blooms around the button.
  function celebrate(card, button) {
    card.classList.remove("saved");
    void card.offsetWidth; // restart the flare animation
    card.classList.add("saved");
    bloomAt(button);
  }

  // ---------- Audio player ----------

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

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return NO_TIME;
    const whole = Math.floor(seconds);
    const rest = whole % 60;
    return Math.floor(whole / 60) + ":" + (rest < 10 ? "0" : "") + rest;
  }

  // Filled 24x24 icon drawn from one path per shape.
  function icon(className, shapes) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "audio-icon " + className);
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

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "audio-toggle";
    toggle.setAttribute("aria-label", "Riproduci audio");
    toggle.append(
      icon("audio-icon-play", ["M8 5.8v12.4a1 1 0 0 0 1.53.85l9.9-6.2a1 1 0 0 0 0-1.7l-9.9-6.2A1 1 0 0 0 8 5.8z"]),
      icon("audio-icon-pause", [
        "M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 7 18.5z",
        "M13 5.5A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5z",
      ])
    );

    // The orb carries the light around the button: halo, ripples, searching arc.
    const orb = document.createElement("span");
    orb.className = "audio-orb";
    orb.append(toggle);

    const track = document.createElement("div");
    track.className = "audio-track";

    // The bar holds the seek range and the glint that travels along its played part.
    const bar = document.createElement("div");
    bar.className = "audio-bar";
    const glint = document.createElement("span");
    glint.className = "audio-glint";
    glint.setAttribute("aria-hidden", "true");

    // Disabled until the duration is known: there is nothing to seek before that.
    const seek = document.createElement("input");
    seek.type = "range";
    seek.className = "audio-seek";
    seek.min = "0";
    seek.max = "0";
    seek.step = "1";
    seek.value = "0";
    seek.disabled = true;
    seek.setAttribute("aria-label", "Posizione audio");

    const time = document.createElement("p");
    time.className = "audio-time";
    const elapsed = document.createElement("span");
    elapsed.textContent = "0:00";
    const total = document.createElement("span");
    total.textContent = NO_TIME;
    time.append(elapsed, total);

    const message = document.createElement("p");
    message.className = "audio-message";
    message.setAttribute("role", "status");

    // While the thumb is dragged the bar follows the finger, not the playback.
    let scrubbing = false;

    function showPosition(seconds) {
      const duration = audio.duration;
      const ratio = Number.isFinite(duration) && duration > 0 ? seconds / duration : 0;
      seek.value = String(seconds);
      bar.style.setProperty("--progress", Math.min(100, ratio * 100) + "%");
      elapsed.textContent = formatTime(seconds);
      seek.setAttribute("aria-valuetext", formatTime(seconds) + " di " + formatTime(duration));
    }

    function setLoading(loading) {
      player.classList.toggle("is-loading", loading);
      toggle.setAttribute("aria-busy", String(loading));
    }

    function seekTo(seconds) {
      const clamped = Math.max(0, Math.min(seconds, audio.duration || 0));
      audio.currentTime = clamped;
      showPosition(clamped);
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
      seekTo(audio.currentTime + direction * SEEK_STEP);
    });

    audio.addEventListener("loadedmetadata", () => {
      if (!Number.isFinite(audio.duration)) return;
      seek.max = String(Math.floor(audio.duration));
      seek.disabled = false;
      total.textContent = formatTime(audio.duration);
      showPosition(audio.currentTime);
    });

    audio.addEventListener("timeupdate", () => {
      if (!scrubbing) showPosition(audio.currentTime);
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
      showPosition(0);
    });

    audio.addEventListener("error", () => {
      // Ignore the error caused by stopAllAudio() dropping the source.
      if (!audio.getAttribute("src")) return;
      setLoading(false);
      player.classList.add("is-error");
      toggle.disabled = true;
      seek.disabled = true;
      message.textContent = "Impossibile caricare l'audio.";
    });

    bar.append(seek, glint);
    track.append(bar, time);
    player.append(audio, orb, track, message);
    return player;
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
    stopAllAudio();
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

  // New view: keyboard and screen reader focus land on its heading.
  function focusHeading(heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  function showRegister() {
    stopAllAudio();
    document.body.classList.remove("is-playing");
    els.userBar.hidden = true;
    els.puzzlesSection.hidden = true;
    forgetIgnites();
    els.puzzlesView.replaceChildren();
    els.registerSection.hidden = false;
    els.usernameInput.focus();
  }

  async function showPuzzles(session) {
    stopAllAudio();
    const loadId = ++game.loadId;
    Object.assign(game, {
      session: session,
      puzzles: null,
      answers: {},
      indexScroll: 0,
      rendered: false,
      freshId: "",
    });
    els.registerSection.hidden = true;
    document.body.classList.add("is-playing");
    els.userName.textContent = session.username;
    els.userBar.hidden = false;
    els.puzzlesSection.hidden = false;
    els.puzzlesView.replaceChildren();
    els.puzzlesStatus.textContent = "Caricamento enigmi…";

    let puzzles, answers;
    try {
      const results = await Promise.all([
        fetchPuzzles(),
        api("getMyAnswers", { username: session.username, token: session.token }),
      ]);
      puzzles = results[0];
      answers = results[1].answers || {};
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
    const tiles = puzzles.map((puzzle) => {
      const item = document.createElement("li");
      const tile = renderTile(puzzle);
      item.append(tile);
      list.append(item);
      return tile;
    });

    view.append(progress, list);
    els.puzzlesView.append(view);

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

    window.scrollTo(0, notice ? 0 : game.indexScroll);
    focusHeading(heading);
  }

  function renderTile(puzzle) {
    const answer = savedAnswer(puzzle.id);
    const tile = document.createElement("a");
    tile.className = "tile" + (answer ? " is-solved" : "");
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
    } else {
      clue.textContent = "ancora da svelare";
    }

    body.append(title, clue);
    tile.append(light, body, chevron("tile-arrow"));
    return tile;
  }

  // Riddle page: text, optional audio and the answer form, pre-filled with the saved answer.
  function renderRiddle(puzzle) {
    const session = game.session;
    const loadId = game.loadId;
    game.freshId = "";

    const view = document.createElement("div");
    view.className = "view riddle-view";

    const back = document.createElement("a");
    back.className = "back-link";
    back.href = "#/";
    back.append(chevron("back-arrow"), "Indizi");

    const card = document.createElement("article");
    card.className = "card puzzle";

    const title = document.createElement("h2");
    title.className = "riddle-title";
    title.textContent = String(puzzle.title || "");

    const text = document.createElement("p");
    text.className = "puzzle-text";
    text.textContent = String(puzzle.text || "");

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

    input.addEventListener("input", () => {
      status.textContent = "";
      status.className = "save-status";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      status.className = "save-status";
      status.textContent = "Salvataggio…";
      try {
        await api("saveAnswer", {
          username: session.username,
          token: session.token,
          puzzleId: puzzle.id,
          answer: input.value,
        });
        // Logged out while saving: this page and its state are gone.
        if (loadId !== game.loadId) return;
        // Same trim as the server, so the index shows exactly what was stored.
        const answer = input.value.trim();
        input.value = answer;
        game.answers[puzzle.id] = answer;
        game.freshId = answer ? String(puzzle.id) : "";
        status.textContent = "Salvato ✓";
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
      }
    });

    row.append(input, button);
    form.append(label, row, status);
    card.append(title, text);
    // Optional track, between the riddle and the answer.
    if (typeof puzzle.audio === "string" && puzzle.audio.trim() !== "") {
      card.append(renderAudioPlayer(puzzle.audio.trim(), String(puzzle.title || "")));
    }
    card.append(form);
    view.append(back, card);
    els.puzzlesView.append(view);
    ignite(card, 0);

    window.scrollTo(0, 0);
    focusHeading(title);
  }

  // ---------- Actions ----------

  // Handles both "Accedi" and "Registrati": the clicked button picks the action.
  async function onAuth(event) {
    event.preventDefault();
    els.registerError.textContent = "";
    // Browsers without SubmitEvent.submitter fall back to registration.
    const action = event.submitter && event.submitter.value === "login" ? "login" : "register";
    const username = els.usernameInput.value.trim();
    const password = els.passwordInput.value.trim();
    if (username.length < 2 || username.length > 30) {
      els.registerError.textContent = "Lo username deve avere tra 2 e 30 caratteri.";
      return;
    }
    if (password.length < 1 || password.length > 50) {
      els.registerError.textContent = "La password deve avere tra 1 e 50 caratteri.";
      return;
    }
    const buttons = els.registerForm.querySelectorAll("button");
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      const data = await api(action, { username: username, password: password });
      const session = { username: data.username, token: data.token };
      saveSession(session);
      els.usernameInput.value = "";
      els.passwordInput.value = "";
      showPuzzles(session);
    } catch (err) {
      els.registerError.textContent = err.message;
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
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
