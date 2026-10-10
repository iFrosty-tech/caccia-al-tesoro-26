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

  // ---------- Views ----------

  function showRegister() {
    els.userBar.hidden = true;
    els.puzzlesSection.hidden = true;
    els.puzzlesList.replaceChildren();
    els.registerSection.hidden = false;
    els.usernameInput.focus();
  }

  async function showPuzzles(session) {
    els.registerSection.hidden = true;
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
    puzzles.forEach((puzzle) => {
      els.puzzlesList.appendChild(renderPuzzle(puzzle, answers[puzzle.id] || "", session));
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
    card.append(title, text, form, status);
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
