// Hidden page: shows the encrypted riddle image to logged-in players only.
//
// The image ships only as tavola.enc (AES-GCM, see tools/encrypt-media.mjs). The key comes from
// the backend action getAssetKey, which needs a valid session. The decrypted image is drawn on a
// canvas with the player's name watermarked into the pixels: there is never an image element,
// a blob URL or a file to "Save as".
//
// Everything below the decryption is a deterrent, not protection. A page cannot block OS
// screenshots, screen recording, a phone camera or the devtools of a determined player; it can
// only make casual saving and sharing awkward and leave the sharer's name on every copy.

(function () {
  "use strict";

  const STORAGE_KEY = "caccia-al-tesoro-session"; // same session as the main site (app.js)
  const ASSET_ID = "tavola";
  const ASSET_FILE = "tavola.enc";
  const ASSET_TYPE = "image/webp";
  const IV_BYTES = 12;
  const GUTTER = 12; // CSS px of dark sea kept around the image
  // iOS Safari refuses canvases above ~16.7 million pixels; stay well under it.
  const MAX_CANVAS_PIXELS = 12000000;

  const els = {
    board: document.getElementById("board"),
    notice: document.getElementById("notice"),
    title: document.getElementById("notice-title"),
    bar: document.getElementById("notice-bar"),
    text: document.getElementById("notice-text"),
    login: document.getElementById("notice-login"),
    retry: document.getElementById("notice-retry"),
  };

  const state = {
    username: "",
    bitmap: null, // decoded image, kept only to redraw on resize and after the veil lifts
    veiled: false,
    loading: false,
    frame: 0,
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

  // ---------- Decryption ----------

  async function downloadAsset(signal) {
    let res;
    try {
      // no-cache revalidates, so a replaced tavola.enc is picked up together with its new key.
      res = await fetch(ASSET_FILE, { cache: "no-cache", signal: signal });
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      throw new ApiError("Non riesco a scaricare la tavola. Controlla la rete e riprova.");
    }
    if (!res.ok) throw new ApiError("Non riesco a scaricare la tavola. Riprova tra poco.");
    return new Uint8Array(await res.arrayBuffer());
  }

  // AES-256-GCM with the 12-byte IV in front; WebCrypto checks the trailing tag.
  async function decryptMedia(bytes, keyBase64) {
    const raw = Uint8Array.from(atob(keyBase64), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, IV_BYTES) }, key, bytes.subarray(IV_BYTES));
  }

  function canShow() {
    return Boolean(
      window.crypto &&
        crypto.subtle &&
        typeof window.createImageBitmap === "function" &&
        els.board.getContext &&
        els.board.getContext("2d")
    );
  }

  // ---------- Notice panel ----------

  function showNotice(options) {
    els.title.textContent = options.title;
    els.text.textContent = options.text || "";
    els.text.hidden = !options.text;
    els.bar.hidden = !options.busy;
    els.login.hidden = !options.login;
    els.retry.hidden = !options.retry;
    els.notice.classList.toggle("is-busy", Boolean(options.busy));
    els.notice.hidden = false;
  }

  function hideNotice() {
    els.notice.hidden = true;
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

  // ---------- Drawing ----------

  // Layout viewport, not visual: it stays put while the player pinch-zooms.
  function viewportSize() {
    const root = document.documentElement;
    return {
      width: Math.max(1, root.clientWidth - GUTTER * 2),
      height: Math.max(1, root.clientHeight - GUTTER * 2),
    };
  }

  function draw() {
    state.frame = 0;
    const bitmap = state.bitmap;
    if (!bitmap || state.veiled) return;

    // Contain fit in CSS pixels.
    const view = viewportSize();
    const fit = Math.min(view.width / bitmap.width, view.height / bitmap.height);
    const cssWidth = Math.max(1, Math.floor(bitmap.width * fit));
    const cssHeight = Math.max(1, Math.floor(bitmap.height * fit));

    // Backing store: at least the screen's pixel density, and up to the image's own resolution,
    // so small text stays sharp when the player pinch-zooms; capped for mobile canvas limits.
    const dpr = window.devicePixelRatio || 1;
    let backingWidth = Math.max(cssWidth * dpr, Math.min(bitmap.width, cssWidth * 4));
    let backingHeight = backingWidth * (bitmap.height / bitmap.width);
    const area = backingWidth * backingHeight;
    if (area > MAX_CANVAS_PIXELS) {
      const shrink = Math.sqrt(MAX_CANVAS_PIXELS / area);
      backingWidth *= shrink;
      backingHeight *= shrink;
    }

    const canvas = els.board;
    canvas.width = Math.round(backingWidth);
    canvas.height = Math.round(backingHeight);
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    drawWatermark(ctx, canvas.width, canvas.height, canvas.width / cssWidth, cssWidth);
  }

  // The player's name, tiled diagonally into the image pixels, faint enough to read through.
  function drawWatermark(ctx, width, height, scale, cssWidth) {
    const label = state.username;
    if (!label) return;
    const fontSize = Math.min(22, Math.max(13, cssWidth / 24)) * scale;
    ctx.save();
    ctx.font = "600 " + fontSize + "px Figtree, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const stepX = ctx.measureText(label).width + fontSize * 3;
    const stepY = fontSize * 4.5;
    const reach = Math.hypot(width, height) / 2 + stepX;
    const shadow = Math.max(1, scale);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6);
    let row = 0;
    for (let y = -reach; y <= reach; y += stepY, row++) {
      const shift = row % 2 ? stepX / 2 : 0;
      for (let x = -reach - shift; x <= reach; x += stepX) {
        // A dark and a light pass keep the name visible on both pale and dark areas.
        ctx.fillStyle = "rgba(3, 6, 11, 0.12)";
        ctx.fillText(label, x + shadow, y + shadow);
        ctx.fillStyle = "rgba(233, 254, 255, 0.16)";
        ctx.fillText(label, x, y);
      }
    }
    ctx.restore();
  }

  function scheduleDraw() {
    if (!state.bitmap || state.frame) return;
    state.frame = requestAnimationFrame(draw);
  }

  // ---------- Veil: the image hides while the page is not in front of the player ----------

  function veil() {
    if (!state.bitmap || state.veiled) return;
    state.veiled = true;
    const canvas = els.board;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    canvas.classList.add("is-veiled");
    showNotice({ title: "La tavola è al buio", text: "Torna su questa pagina per rivederla." });
  }

  function unveil() {
    if (!state.bitmap || !state.veiled || document.hidden) return;
    state.veiled = false;
    els.board.classList.remove("is-veiled");
    hideNotice();
    draw();
  }

  // ---------- Deterrents (none of these can stop a screenshot) ----------

  function guardPage() {
    ["contextmenu", "dragstart", "selectstart"].forEach((type) => {
      document.addEventListener(type, (e) => e.preventDefault());
    });
    document.addEventListener("keydown", (e) => {
      const key = (e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "s" || key === "p")) e.preventDefault();
    });
    window.addEventListener("blur", veil);
    window.addEventListener("focus", unveil);
    window.addEventListener("pagehide", veil);
    window.addEventListener("pageshow", unveil);
    window.addEventListener("beforeprint", veil);
    document.addEventListener("visibilitychange", () => (document.hidden ? veil() : unveil()));
    window.addEventListener("resize", scheduleDraw);
    window.addEventListener("orientationchange", scheduleDraw);
  }

  // ---------- Flow ----------

  async function reveal() {
    if (state.loading) return;
    const session = loadSession();
    if (!session) {
      showLoggedOut(false);
      return;
    }
    if (!isConfigured()) {
      showNotice({ title: "Tavola non disponibile", text: "Il sito non è ancora collegato al server." });
      return;
    }
    if (!canShow()) {
      showNotice({
        title: "Browser non adatto",
        text: "Questo browser non riesce a mostrare la tavola. Aggiornalo o prova con un altro.",
      });
      return;
    }

    state.loading = true;
    state.username = session.username;
    showNotice({ title: "La tavola affiora…", busy: true });

    // Key and file travel together; a refused key cancels the download.
    const download = new AbortController();
    let encrypted = null;
    let plain = null;
    try {
      const filePromise = downloadAsset(download.signal);
      filePromise.catch(() => {}); // handled below; avoids an unhandled rejection after abort
      let reply;
      try {
        reply = await api("getAssetKey", { username: session.username, token: session.token, assetId: ASSET_ID });
      } catch (err) {
        download.abort();
        throw err;
      }
      encrypted = await filePromise;
      try {
        plain = await decryptMedia(encrypted, reply.key);
        state.bitmap = await createImageBitmap(new Blob([plain], { type: ASSET_TYPE }));
      } catch (_) {
        throw new ApiError("La tavola non si lascia leggere. Avvisa l'organizzatore.");
      }
    } catch (err) {
      if (err && err.code === "AUTH") {
        clearSession();
        showLoggedOut(true);
      } else {
        showNotice({
          title: "Qualcosa si è perso nel buio",
          text: err instanceof ApiError ? err.message : "Non riesco a mostrare la tavola. Riprova tra poco.",
          retry: true,
        });
      }
      return;
    } finally {
      // Only the decoded bitmap is kept; the decrypted bytes are wiped and released.
      if (plain) new Uint8Array(plain).fill(0);
      plain = null;
      encrypted = null;
      state.loading = false;
    }

    // The watermark uses the site's body face; fall back silently if it cannot load.
    try {
      if (document.fonts && document.fonts.load) await document.fonts.load("600 16px Figtree");
    } catch (_) {
      // system-ui is fine.
    }

    state.veiled = false;
    els.board.hidden = false;
    hideNotice();
    draw();
    // A page opened in the background starts veiled until the player looks at it.
    if (document.hidden) veil();
  }

  guardPage();
  els.retry.addEventListener("click", reveal);
  reveal();
})();
