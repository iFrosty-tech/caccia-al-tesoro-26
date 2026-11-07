(function () {
  "use strict";

  const data = window.CROSSWORD;
  const STORAGE_KEY = "cruciverba-finale-v1";
  const SENTINEL = "​";
  const STEP = { across: [0, 1], down: [1, 0] };
  const DIRECTION_LABEL = { across: "orizzontale", down: "verticale" };
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2.2;

  const gridEl = document.getElementById("grid");
  const viewport = document.getElementById("viewport");
  const keys = document.getElementById("keys");
  const currentRef = document.getElementById("current-ref");
  const currentText = document.getElementById("current-text");
  const cluesEl = document.querySelector(".clues");

  const cells = new Map(); // "r,c" -> { r, c, el, letterEl, markEl, value, words: { across, down } }
  const words = new Map(); // id -> word from the data, plus cells (keys) and clueEl
  const highlightOf = new Map(); // word id -> { key, index }
  const order = []; // word ids in clue-list order
  const state = { wordId: null, pos: 0, zoom: 1 };

  const keyOf = (r, c) => r + "," + c;

  function normalizeLetters(text) {
    const plain = (text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    return plain.replace(/[^A-Z]/g, "");
  }

  function normalizeLetter(text) {
    const letters = normalizeLetters(text);
    return letters ? letters[letters.length - 1] : "";
  }

  // ---- Build -------------------------------------------------------------

  function build() {
    gridEl.style.gridTemplateColumns = "repeat(" + data.width + ", var(--cell))";
    gridEl.style.gridTemplateRows = "repeat(" + data.height + ", var(--cell))";

    data.cells.forEach(function (pair) {
      const r = pair[0];
      const c = pair[1];
      const el = document.createElement("div");
      el.className = "cell";
      el.style.gridRow = String(r + 1);
      el.style.gridColumn = String(c + 1);
      const letterEl = document.createElement("span");
      letterEl.className = "letter";
      const markEl = document.createElement("span");
      markEl.className = "mark";
      el.append(letterEl, markEl);
      el.addEventListener("click", function () { onCellClick(keyOf(r, c)); });
      gridEl.appendChild(el);
      cells.set(keyOf(r, c), { r: r, c: c, el: el, letterEl: letterEl, markEl: markEl, value: "", words: {} });
    });

    data.words.forEach(function (w) {
      const step = STEP[w.direction];
      const wordCells = [];
      for (let i = 0; i < w.length; i++) {
        const key = keyOf(w.row + i * step[0], w.col + i * step[1]);
        cells.get(key).words[w.direction] = w.id;
        wordCells.push(key);
      }
      words.set(w.id, Object.assign({}, w, { cells: wordCells, clueEl: null }));
      order.push(w.id);
    });

    const numbered = new Set();
    data.words.forEach(function (w) {
      const key = keyOf(w.row, w.col);
      if (numbered.has(key)) return;
      numbered.add(key);
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(w.number);
      cells.get(key).el.prepend(num);
    });

    data.highlights.forEach(function (h) {
      highlightOf.set(h.word, { key: keyOf(h.row, h.col), index: h.index });
    });

    buildClues("across", document.getElementById("clues-across"));
    buildClues("down", document.getElementById("clues-down"));
  }

  function buildClues(direction, listEl) {
    order.forEach(function (id) {
      const w = words.get(id);
      if (w.direction !== direction) return;
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clue";
      const num = document.createElement("span");
      num.className = "clue-num";
      num.textContent = String(w.number);
      const text = document.createElement("span");
      text.className = "clue-text";
      text.textContent = w.clue;
      const len = document.createElement("span");
      len.className = "clue-len";
      len.textContent = "(" + w.length + ")";
      button.append(num, text, len);
      button.addEventListener("click", function () {
        selectWord(id, firstEmptyPos(id));
        const box = viewport.getBoundingClientRect();
        if (box.top < 0 || box.bottom > window.innerHeight) {
          viewport.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        focusKeys();
      });
      li.appendChild(button);
      listEl.appendChild(li);
      w.clueEl = button;
    });
  }

  // ---- State -------------------------------------------------------------

  function firstEmptyPos(id) {
    const w = words.get(id);
    const pos = w.cells.findIndex(function (key) { return !cells.get(key).value; });
    return pos === -1 ? 0 : pos;
  }

  function activeKey() {
    return state.wordId === null ? null : words.get(state.wordId).cells[state.pos];
  }

  function selectWord(id, pos) {
    const previous = state.wordId === null ? null : words.get(state.wordId);
    if (previous) {
      previous.cells.forEach(function (key) { cells.get(key).el.classList.remove("in-word"); });
      previous.clueEl.classList.remove("is-active");
    }
    const oldKey = activeKey();
    if (oldKey) cells.get(oldKey).el.classList.remove("is-active");

    state.wordId = id;
    state.pos = Math.max(0, Math.min(pos, words.get(id).length - 1));
    const w = words.get(id);
    w.cells.forEach(function (key) { cells.get(key).el.classList.add("in-word"); });
    w.clueEl.classList.add("is-active");
    if (previous !== w) revealClue(w.clueEl);
    placeCursor();

    currentRef.textContent = w.number + " " + DIRECTION_LABEL[w.direction];
    currentText.textContent = w.clue + " (" + w.length + ")";
    keys.setAttribute("aria-label", w.number + " " + DIRECTION_LABEL[w.direction] + ": " + w.clue
      + ", " + w.length + " lettere, casella " + (state.pos + 1));
  }

  function placeCursor() {
    const key = activeKey();
    const cell = cells.get(key);
    cell.el.classList.add("is-active");
    keys.style.transform = "translate(" + cell.el.offsetLeft + "px, " + cell.el.offsetTop + "px)";
    scrollWithin(viewport, cell.el, 12);
  }

  // Scroll only the given container, never the page, until el is inside it.
  function scrollWithin(container, el, margin) {
    const box = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (rect.left < box.left + margin) container.scrollLeft -= box.left + margin - rect.left;
    if (rect.right > box.right - margin) container.scrollLeft += rect.right - (box.right - margin);
    if (rect.top < box.top + margin) container.scrollTop -= box.top + margin - rect.top;
    if (rect.bottom > box.bottom - margin) container.scrollTop += rect.bottom - (box.bottom - margin);
  }

  // On wide screens the clue column scrolls on its own; elsewhere the page does,
  // and the page should stay on the grid.
  function revealClue(clueEl) {
    if (cluesEl.scrollHeight > cluesEl.clientHeight + 1) scrollWithin(cluesEl, clueEl, 8);
  }

  function selectCell(key, preferred) {
    const cell = cells.get(key);
    const direction = cell.words[preferred] !== undefined ? preferred
      : (preferred === "across" ? "down" : "across");
    const id = cell.words[direction];
    selectWord(id, words.get(id).cells.indexOf(key));
  }

  function currentDirection() {
    return state.wordId === null ? "across" : words.get(state.wordId).direction;
  }

  function setPos(pos) {
    const oldKey = activeKey();
    if (oldKey) cells.get(oldKey).el.classList.remove("is-active");
    state.pos = pos;
    placeCursor();
  }

  function setValue(key, letter) {
    const cell = cells.get(key);
    if (cell.value === letter) return;
    cell.value = letter;
    cell.letterEl.textContent = letter;
    Object.keys(cell.words).forEach(function (direction) { refreshWord(cell.words[direction]); });
    save();
  }

  // A word lights its highlighted cell as soon as every cell holds a letter,
  // right or wrong: the light never says whether the word is correct.
  function refreshWord(id, initial) {
    const w = words.get(id);
    const complete = w.cells.every(function (key) { return cells.get(key).value; });
    w.clueEl.classList.toggle("is-filled", complete);
    const h = highlightOf.get(id);
    if (!h) return;
    const cell = cells.get(h.key);
    const wasLit = cell.el.classList.contains("is-lit");
    cell.el.classList.toggle("is-lit", complete);
    cell.markEl.textContent = complete ? String(h.index) : "";
    if (complete && !wasLit && !initial) {
      cell.el.classList.remove("switching-on");
      void cell.el.offsetWidth;
      cell.el.classList.add("switching-on");
    }
  }

  // ---- Editing -----------------------------------------------------------

  function typeLetter(letter) {
    if (state.wordId === null) return;
    setValue(activeKey(), letter);
    const w = words.get(state.wordId);
    if (state.pos < w.length - 1) setPos(state.pos + 1);
  }

  function backspace() {
    if (state.wordId === null) return;
    const key = activeKey();
    if (cells.get(key).value) {
      setValue(key, "");
    } else if (state.pos > 0) {
      setPos(state.pos - 1);
      setValue(activeKey(), "");
    }
  }

  function move(direction, sign) {
    if (state.wordId === null) return;
    const key = activeKey();
    const cell = cells.get(key);
    if (direction !== currentDirection() && cell.words[direction] !== undefined) {
      selectCell(key, direction);
      return;
    }
    const step = STEP[direction];
    const next = keyOf(cell.r + sign * step[0], cell.c + sign * step[1]);
    if (cells.has(next)) selectCell(next, direction);
  }

  function nextWord(step) {
    const index = state.wordId === null ? -1 : order.indexOf(state.wordId);
    const id = order[(index + step + order.length) % order.length];
    selectWord(id, firstEmptyPos(id));
  }

  function toggleDirection() {
    const key = activeKey();
    if (!key) return;
    const other = currentDirection() === "across" ? "down" : "across";
    if (cells.get(key).words[other] !== undefined) selectCell(key, other);
  }

  function onCellClick(key) {
    if (key === activeKey()) {
      toggleDirection();
    } else {
      selectCell(key, currentDirection());
    }
    focusKeys();
  }

  function focusKeys() {
    keys.value = SENTINEL;
    keys.focus({ preventScroll: true });
    keys.setSelectionRange(1, 1);
  }

  keys.addEventListener("keydown", function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const handlers = {
      ArrowLeft: function () { move("across", -1); },
      ArrowRight: function () { move("across", 1); },
      ArrowUp: function () { move("down", -1); },
      ArrowDown: function () { move("down", 1); },
      Backspace: backspace,
      Delete: function () { if (activeKey()) setValue(activeKey(), ""); },
      Tab: function () { nextWord(event.shiftKey ? -1 : 1); },
      Enter: function () { nextWord(1); },
      " ": toggleDirection,
    };
    if (handlers[event.key]) {
      event.preventDefault();
      handlers[event.key]();
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      const letter = normalizeLetter(event.key);
      if (letter) typeLetter(letter);
    }
  });

  // Mobile keyboards often skip keydown details, so typing also arrives here,
  // sometimes several letters at once (paste, swipe typing, word suggestions).
  keys.addEventListener("input", function (event) {
    const typed = keys.value.replace(SENTINEL, "");
    if (event.inputType && event.inputType.indexOf("delete") === 0) {
      backspace();
    } else {
      normalizeLetters(typed).split("").forEach(typeLetter);
    }
    keys.value = SENTINEL;
    keys.setSelectionRange(1, 1);
  });

  // ---- Size and zoom -----------------------------------------------------

  function resize() {
    const style = getComputedStyle(viewport);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const narrow = window.matchMedia("(max-width: 959px)").matches;
    const fitWidth = (viewport.clientWidth - padX) / data.width;
    const fitHeight = (window.innerHeight * (narrow ? 0.7 : 1) - 210 - padY) / data.height;
    const fit = narrow ? fitWidth : Math.min(fitWidth, fitHeight);
    const base = Math.max(narrow ? 30 : 22, Math.min(40, fit));
    const size = Math.round(base * state.zoom * 0.91);
    const gap = Math.max(2, Math.round(size * 0.1));
    gridEl.style.setProperty("--cell", size + "px");
    gridEl.style.setProperty("--gap", gap + "px");
    if (activeKey()) placeCursor();
  }

  function zoomBy(factor) {
    state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom * factor));
    resize();
  }

  document.getElementById("zoom-in").addEventListener("click", function () { zoomBy(1.2); });
  document.getElementById("zoom-out").addEventListener("click", function () { zoomBy(1 / 1.2); });
  window.addEventListener("resize", resize);

  // ---- Saving (this browser only) ----------------------------------------

  function save() {
    const letters = {};
    cells.forEach(function (cell, key) { if (cell.value) letters[key] = cell.value; });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(letters));
    } catch (error) {
      // Storage can be unavailable (private mode, blocked site data): keep playing without it.
    }
  }

  function restore() {
    let letters = {};
    try {
      letters = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (error) {
      letters = {};
    }
    Object.keys(letters).forEach(function (key) {
      const cell = cells.get(key);
      const letter = normalizeLetter(letters[key]);
      if (cell && letter) {
        cell.value = letter;
        cell.letterEl.textContent = letter;
      }
    });
    order.forEach(function (id) { refreshWord(id, true); });
  }

  document.getElementById("clear").addEventListener("click", function () {
    if (!window.confirm("Cancellare tutte le lettere dello schema?")) return;
    cells.forEach(function (cell, key) { setValue(key, ""); });
  });

  build();
  restore();
  resize();
})();
