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
    puzzlesList: $("puzzles-list"),
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

  // Riddle cards stay dark until they scroll into view, then ignite.
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

  // ---------- Views ----------

  function showRegister() {
    stopAllAudio();
    document.body.classList.remove("is-playing");
    els.userBar.hidden = true;
    els.puzzlesSection.hidden = true;
    els.puzzlesList.replaceChildren();
    els.registerSection.hidden = false;
    els.usernameInput.focus();
  }

  async function showPuzzles(session) {
    stopAllAudio();
    els.registerSection.hidden = true;
    document.body.classList.add("is-playing");
    els.userName.textContent = session.username;
    els.userBar.hidden = false;
    els.puzzlesSection.hidden = false;
    els.puzzlesList.replaceChildren();
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
      if (err instanceof ApiError && err.code === "AUTH") {
        logout();
        els.registerError.textContent = err.message;
        return;
      }
      els.puzzlesStatus.textContent =
        err instanceof ApiError ? err.message : "Impossibile caricare gli enigmi.";
      return;
    }

    if (puzzles.length === 0) {
      els.puzzlesStatus.textContent = "Nessun enigma pubblicato per ora. Torna più tardi!";
      return;
    }
    els.puzzlesStatus.textContent = "";
    puzzles.forEach((puzzle, index) => {
      const card = renderPuzzle(puzzle, answers[puzzle.id] || "", session);
      els.puzzlesList.appendChild(card);
      ignite(card, index);
    });
  }

  function renderPuzzle(puzzle, savedAnswer, session) {
    const card = document.createElement("article");
    card.className = "card puzzle";

    const title = document.createElement("h2");
    title.textContent = String(puzzle.title || "");

    const text = document.createElement("p");
    text.className = "puzzle-text";
    text.textContent = String(puzzle.text || "");

    const form = document.createElement("form");
    form.className = "row";

    const inputId = "answer-" + puzzle.id;
    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.htmlFor = inputId;
    label.textContent = "Risposta";

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "text";
    input.maxLength = ANSWER_MAX;
    input.placeholder = "La tua risposta";
    input.value = savedAnswer;

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
        status.textContent = "Salvato ✓";
        status.className = "save-status ok";
        celebrate(card, button);
      } catch (err) {
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

    form.append(label, input, button);
    card.append(title, text);
    // Optional track, between the riddle and the answer.
    if (typeof puzzle.audio === "string" && puzzle.audio.trim() !== "") {
      card.append(renderAudioPlayer(puzzle.audio.trim(), String(puzzle.title || "")));
    }
    card.append(form, status);
    return card;
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

  function logout() {
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
      if (confirmed) logout();
    });

    const session = loadSession();
    if (session) {
      showPuzzles(session);
    } else {
      showRegister();
    }
  }

  init();
})();
