// Hidden page /arancione/: plays the finale's encrypted video to logged-in players only, once
// the final riddle has been opened.
//
// The video ships only as arancione.enc (AES-GCM, see tools/encrypt-media.mjs). The key comes
// from the backend action getAssetKey, which needs a valid session and answers "locked" until
// the organizer ticks the final riddle (p6) in the Unlocks sheet. The file is downloaded whole,
// decrypted in the browser and played from a blob URL with the browser's own controls.

(function () {
  "use strict";

  const STORAGE_KEY = "caccia-al-tesoro-session"; // same session as the main site (app.js)
  const ASSET_ID = "arancione";
  const ASSET_FILE = "arancione.enc";
  const ASSET_TYPE = "video/mp4";
  const IV_BYTES = 12;
  const REVEAL_FALLBACK = 5000; // show the player even if the metadata is slow to arrive

  const els = {
    film: document.getElementById("film"),
    notice: document.getElementById("notice"),
    title: document.getElementById("notice-title"),
    bar: document.getElementById("notice-bar"),
    bulbs: Array.prototype.slice.call(document.querySelectorAll("#notice-bar > i")),
    amount: document.getElementById("notice-amount"),
    text: document.getElementById("notice-text"),
    login: document.getElementById("notice-login"),
    retry: document.getElementById("notice-retry"),
  };

  const state = {
    loading: false,
    url: "", // blob URL of the decrypted video, once it exists
  };

  // ---------- Session (localStorage may be unavailable) ----------

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

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Nothing to clear.
    }
  }

  // ---------- API (same contract as app.js) ----------

  class ApiError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code || "";
    }
  }

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

  // ---------- Download and decryption ----------

  // Streams the file, reporting (received, total); total is 0 when the size is unknown.
  // no-cache revalidates, so a replaced arancione.enc is picked up together with its new key.
  async function download(url, onProgress) {
    let res;
    try {
      res = await fetch(url, { cache: "no-cache" });
    } catch (_) {
      throw new ApiError("Non riesco a scaricare il video. Controlla la rete e riprova.");
    }
    if (!res.ok) throw new ApiError("Non riesco a scaricare il video. Riprova tra poco.");
    // A compressed response reports its compressed size: progress is then indeterminate.
    const total = res.headers.get("Content-Encoding") ? 0 : Number(res.headers.get("Content-Length")) || 0;
    try {
      if (!res.body || typeof res.body.getReader !== "function") {
        const whole = new Uint8Array(await res.arrayBuffer());
        onProgress(whole.length, whole.length);
        return whole;
      }
      const reader = res.body.getReader();
      // Size known: the chunks go straight into one buffer, so the file is never held twice
      // (a phone short of memory reloads the page).
      let filled = total > 0 ? new Uint8Array(total) : null;
      const chunks = [];
      let received = 0;
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        const chunk = step.value;
        if (filled && received + chunk.length > filled.length) {
          // Longer than announced: on in pieces.
          chunks.push(filled.subarray(0, received));
          filled = null;
        }
        if (filled) filled.set(chunk, received);
        else chunks.push(chunk);
        received += chunk.length;
        onProgress(received, total);
      }
      if (filled) return received === filled.length ? filled : filled.subarray(0, received);
      const bytes = new Uint8Array(received);
      let offset = 0;
      chunks.forEach((chunk) => {
        bytes.set(chunk, offset);
        offset += chunk.length;
      });
      return bytes;
    } catch (_) {
      throw new ApiError("Il download si è interrotto. Controlla la rete e riprova.");
    }
  }

  // AES-256-GCM with the 12-byte IV in front; WebCrypto checks the trailing tag.
  async function decryptMedia(bytes, keyBase64) {
    const raw = Uint8Array.from(atob(keyBase64), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, IV_BYTES) }, key, bytes.subarray(IV_BYTES));
  }

  function canPlay() {
    return Boolean(
      window.crypto &&
        crypto.subtle &&
        typeof URL.createObjectURL === "function" &&
        typeof els.film.canPlayType === "function"
    );
  }

  // ---------- Notice panel ----------

  // options: title, text, busy (the bulbs chase), login, retry (button label, or nothing).
  function showNotice(options) {
    els.title.textContent = options.title;
    els.text.textContent = options.text || "";
    els.text.hidden = !options.text;
    els.bar.hidden = !options.busy;
    els.amount.hidden = true;
    resetBar();
    els.login.hidden = !options.login;
    els.retry.hidden = !options.retry;
    if (options.retry) els.retry.textContent = options.retry;
    els.notice.classList.toggle("is-busy", Boolean(options.busy));
    els.notice.hidden = false;
  }

  function hideNotice() {
    els.notice.hidden = true;
  }

  function resetBar() {
    els.bar.classList.remove("is-filling");
    els.bar.removeAttribute("role");
    els.bar.removeAttribute("aria-label");
    els.bar.removeAttribute("aria-valuemin");
    els.bar.removeAttribute("aria-valuemax");
    els.bar.removeAttribute("aria-valuenow");
    els.bar.setAttribute("aria-hidden", "true");
    els.bulbs.forEach((bulb) => bulb.classList.remove("is-lit"));
  }

  function formatMegabytes(bytes) {
    return (bytes / 1048576).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  // Known size: the bulbs fill up and the bar becomes a progressbar. Unknown: they keep chasing.
  function showProgress(received, total) {
    els.amount.hidden = false;
    if (total > 0) {
      const share = Math.min(1, received / total);
      const lit = Math.round(share * els.bulbs.length);
      els.bulbs.forEach((bulb, index) => bulb.classList.toggle("is-lit", index < lit));
      if (!els.bar.classList.contains("is-filling")) {
        els.bar.classList.add("is-filling");
        els.bar.removeAttribute("aria-hidden");
        els.bar.setAttribute("role", "progressbar");
        els.bar.setAttribute("aria-label", "Download del video");
        els.bar.setAttribute("aria-valuemin", "0");
        els.bar.setAttribute("aria-valuemax", "100");
      }
      els.bar.setAttribute("aria-valuenow", String(Math.floor(share * 100)));
      els.amount.textContent = formatMegabytes(received) + " di " + formatMegabytes(total) + " MB";
    } else {
      els.amount.textContent = formatMegabytes(received) + " MB";
    }
  }

  function showLoggedOut(expired) {
    showNotice({
      title: expired ? "Sessione scaduta" : "Solo per chi gioca",
      text: expired
        ? "Accedi di nuovo alla caccia, poi riapri questa pagina."
        : "Questa pagina si rivela soltanto a chi ha fatto l'accesso alla caccia.",
      login: true,
    });
  }

  function showSealed() {
    showNotice({
      title: "Ancora sigillato",
      text: "Questa pagina si apre più avanti nella caccia.",
      retry: "Controlla di nuovo",
    });
  }

  // ---------- Player ----------

  function play(media) {
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = URL.createObjectURL(new Blob([media], { type: ASSET_TYPE }));
    const film = els.film;
    let shown = false;
    let fallback = 0;

    function reveal() {
      if (shown) return;
      shown = true;
      clearTimeout(fallback);
      film.hidden = false;
      hideNotice();
    }

    film.addEventListener(
      "loadedmetadata",
      () => {
        // No "#t=" fragment on the blob URL (older iOS WebKit refuses it): a tiny seek paints
        // the first frame instead of a black box.
        if (film.paused && film.currentTime === 0) film.currentTime = 0.001;
        reveal();
      },
      { once: true }
    );
    film.addEventListener(
      "error",
      () => {
        if (!film.getAttribute("src")) return;
        clearTimeout(fallback);
        shown = true;
        film.hidden = true;
        const code = film.error ? " (codice " + film.error.code + ")" : "";
        showNotice({
          title: "Qualcosa si è perso nel buio",
          text: "Questo browser non riesce a riprodurre il video" + code + ". Prova con un altro browser.",
        });
      },
      { once: true }
    );
    film.src = state.url;
    // Some browsers hold back the metadata of a video nobody has pressed play on yet.
    fallback = setTimeout(reveal, REVEAL_FALLBACK);
  }

  // ---------- Flow ----------

  async function start() {
    if (state.loading) return;
    const session = loadSession();
    if (!session) {
      showLoggedOut(false);
      return;
    }
    if (!isConfigured()) {
      showNotice({ title: "Video non disponibile", text: "Il sito non è ancora collegato al server." });
      return;
    }
    if (!canPlay()) {
      showNotice({
        title: "Browser non adatto",
        text: "Questo browser non riesce a mostrare il video. Aggiornalo o prova con un altro.",
      });
      return;
    }

    state.loading = true;
    showNotice({ title: "Il video affiora…", busy: true });

    let plain = null;
    try {
      // The key first: while the page is still sealed, nothing is downloaded.
      const reply = await api("getAssetKey", { username: session.username, token: session.token, assetId: ASSET_ID });
      if (reply.locked) {
        showSealed();
        return;
      }
      let encrypted = await download(ASSET_FILE, showProgress);
      showNotice({ title: "Decifratura in corso…", busy: true });
      try {
        const opening = decryptMedia(encrypted, reply.key);
        // WebCrypto decrypts a copy of its own: the download can go as soon as it is handed over.
        encrypted = null;
        plain = await opening;
      } catch (_) {
        throw new ApiError("Il video non si lascia aprire. Avvisa l'organizzatore.");
      }
    } catch (err) {
      if (err && err.code === "AUTH") {
        clearSession();
        showLoggedOut(true);
      } else {
        showNotice({
          title: "Qualcosa si è perso nel buio",
          text: err instanceof ApiError ? err.message : "Non riesco a mostrare il video. Riprova tra poco.",
          retry: "Riprova",
        });
      }
      return;
    } finally {
      state.loading = false;
    }

    play(plain);
    plain = null;
  }

  els.retry.addEventListener("click", start);
  start();
})();
