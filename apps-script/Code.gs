/**
 * Treasure hunt backend: Google Apps Script web app bound to a Google Sheet.
 *
 * Sheets (created automatically if missing):
 *   Users   -> username | token | createdAt | password
 *   Answers -> username | puzzleId | answer | updatedAt
 *   Unlocks -> puzzleId | unlocked   (created by running setupUnlocks() once from the editor)
 *   Visits  -> username | assetId | firstSeenAt | lastSeenAt | visits
 *
 * Actions (POST body is a JSON string, sent as text/plain to avoid CORS preflight):
 *   { action: "register",     username, password }
 *   { action: "login",        username, password }
 *   { action: "getMyAnswers", username, token }
 *   { action: "saveAnswer",   username, token, puzzleId, answer }
 *   { action: "getPuzzleKey", username, token, puzzleId }
 *   { action: "getAssetKey",  username, token, assetId }
 *   { action: "checkFinalAnswer", username, token, answer }
 *
 * The final solution (FINAL_SOLUTION script property) is typed on the index once p6 is open:
 * checkFinalAnswer answers { ok, correct } and stores a correct answer under puzzleId "final".
 * Timed riddles (TIMED_PUZZLES) ship their media encrypted in the public repo. The AES key
 * lives only in Script Properties (Project Settings -> Script properties, e.g. MEDIA_KEY_p2):
 * getPuzzleKey hands it out only once this server's clock has passed unlockAt, and
 * saveAnswer refuses a riddle that is still locked.
 *
 * Flag riddles (FLAG_PUZZLES) work the same way, but open when the organizer ticks the
 * riddle's checkbox in the Unlocks sheet (column B of its row). A missing sheet or row, or an
 * unticked box, keeps the riddle locked. getMyAnswers lists the flag riddles still locked, so
 * the index can show them closed. A new flag riddle needs its MEDIA_KEY_<id> property, a new
 * version of the deployment and one more run of setupUnlocks() to add its row.
 *
 * Open assets (OPEN_ASSETS) are encrypted files that are not riddles, such as the image or the
 * video of a hidden page: getAssetKey hands their key to any logged-in player. An asset with
 * afterFlag stays closed ({ ok, locked: true }) until that riddle's box is ticked in Unlocks, so
 * it opens together with the riddle; without afterFlag there is no time or flag gate. An asset
 * with afterAllSolved stays closed until the logged-in player has answered every riddle
 * correctly, checked against the answers in the SOLUTIONS script property (never in the repo).
 * They have their own allow-list, apart from the riddle gates: getPuzzleKey never returns their key.
 * Every key handed out is logged in the Visits sheet, one row per player and asset, so the
 * organizer sees who reached the hidden page, when first and how often.
 *
 * There is intentionally no endpoint that lists other players' data.
 * Passwords are stored in plain text on purpose: secrecy is not a goal and the
 * admin can read or fix them directly in the sheet.
 */

var USERS_SHEET = 'Users';
var ANSWERS_SHEET = 'Answers';
var USERS_HEADERS = ['username', 'token', 'createdAt', 'password'];
var ANSWERS_HEADERS = ['username', 'puzzleId', 'answer', 'updatedAt'];
var VISITS_SHEET = 'Visits';
var VISITS_HEADERS = ['username', 'assetId', 'firstSeenAt', 'lastSeenAt', 'visits'];

var USERNAME_MIN = 2;
var USERNAME_MAX = 30;
var PASSWORD_MIN = 1;
var PASSWORD_MAX = 50;
var ANSWER_MAX = 500;
var PUZZLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
var LOCK_TIMEOUT_MS = 10000;

// Riddles released at a fixed time. unlockAt is public; the key is in Script Properties.
var TIMED_PUZZLES = {
  p2: { unlockAt: '2026-10-11T18:30:00Z', keyProperty: 'MEDIA_KEY_p2' }
};

// Riddles released by the organizer's tick in the Unlocks sheet; the key is in Script Properties.
var FLAG_PUZZLES = {
  p3: { keyProperty: 'MEDIA_KEY_p3' },
  p4: { keyProperty: 'MEDIA_KEY_p4' },
  p5: { keyProperty: 'MEDIA_KEY_p5' },
  p6: { keyProperty: 'MEDIA_KEY_p6' }
};
var UNLOCKS_SHEET = 'Unlocks';

// Encrypted files open to every logged-in player; the key is in Script Properties.
// afterFlag: the asset stays closed until that flag riddle is ticked in Unlocks.
var OPEN_ASSETS = {
  tavola: { keyProperty: 'MEDIA_KEY_tavola' },
  arancione: { keyProperty: 'MEDIA_KEY_arancione', afterFlag: 'p6' },
  'reveal-trailer': { keyProperty: 'MEDIA_KEY_reveal_trailer', afterAllSolved: true, afterFinal: true }
};

// Script Property holding the final solution typed on the index once p6 is open: a JSON string
// or array of accepted answers (e.g. "parola" or ["parola", "la parola"]), or plain text. Kept out
// of the public repo. A correct answer is stored in Answers under FINAL_ANSWER_ID; an asset with
// afterFinal opens only for a player whose stored final answer still matches.
var FINAL_SOLUTION_PROPERTY = 'FINAL_SOLUTION';
var FINAL_ANSWER_ID = 'final';
var FINAL_GATE_PUZZLE = 'p6';

// Script Property holding the correct answers as JSON, e.g. {"p1": "luna", "p2": ["mare", "il mare"]}.
// Kept out of the public repo. An asset with afterAllSolved opens only for a player whose answer
// matches for EVERY riddle listed there; missing or invalid JSON keeps it closed.
var SOLUTIONS_PROPERTY = 'SOLUTIONS';
var UNLOCKS_HEADERS = ['puzzleId', 'unlocked'];

/** Error whose message is safe to show to the player. */
function UserError(message, code) {
  this.message = message;
  this.code = code || 'BAD_REQUEST';
}

function doPost(e) {
  var result;
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var req = JSON.parse(body);
    switch (req.action) {
      case 'register':
        result = register(req);
        break;
      case 'login':
        result = login(req);
        break;
      case 'getMyAnswers':
        result = getMyAnswers(req);
        break;
      case 'saveAnswer':
        result = saveAnswer(req);
        break;
      case 'getPuzzleKey':
        result = getPuzzleKey(req);
        break;
      case 'getAssetKey':
        result = getAssetKey(req);
        break;
      case 'checkFinalAnswer':
        result = checkFinalAnswer(req);
        break;
      default:
        throw new UserError('Azione non valida.');
    }
  } catch (err) {
    if (err instanceof UserError) {
      result = { ok: false, error: err.message, code: err.code };
    } else {
      console.error(err);
      result = { ok: false, error: 'Errore del server. Riprova tra poco.', code: 'SERVER' };
    }
  }
  return json(result);
}

function doGet() {
  return json({ ok: true, message: 'Backend attivo. Usa POST.' });
}

// ---------- Actions ----------

function register(req) {
  var username = normalizeUsername(req.username);
  var password = normalizePassword(req.password);
  return withLock(function () {
    var sheet = getSheet(USERS_SHEET, USERS_HEADERS);
    if (findUserRow(sheet, username)) {
      throw new UserError('Username già in uso', 'USERNAME_TAKEN');
    }
    var token = Utilities.getUuid();
    sheet.appendRow([safeCell(username), token, new Date(), safeCell(password)]);
    return { ok: true, username: username, token: token };
  });
}

/** Returns the existing token, so every device of the same player shares it. */
function login(req) {
  var username = normalizeUsername(req.username);
  var password = normalizePassword(req.password);
  var sheet = getSheet(USERS_SHEET, USERS_HEADERS);
  var row = findUserRow(sheet, username);
  if (!row) {
    throw new UserError('Username non trovato.', 'NOT_FOUND');
  }
  // Rows created before passwords existed have an empty cell until the admin fills it in.
  if (!row[3] || row[3] !== password) {
    throw new UserError('Password sbagliata.', 'BAD_PASSWORD');
  }
  return { ok: true, username: row[0], token: row[1] };
}

function getMyAnswers(req) {
  var user = authenticate(req);
  var sheet = getSheet(ANSWERS_SHEET, ANSWERS_HEADERS);
  var rows = readRows(sheet);
  var key = user.username.toLowerCase();
  var answers = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0].toLowerCase() === key) {
      answers[rows[i][1]] = rows[i][2];
    }
  }
  return {
    ok: true,
    username: user.username,
    answers: answers,
    locked: lockedFlagPuzzles(readUnlockFlags())
  };
}

function saveAnswer(req) {
  var user = authenticate(req);
  var puzzleId = typeof req.puzzleId === 'string' ? req.puzzleId.trim() : '';
  if (!PUZZLE_ID_PATTERN.test(puzzleId)) {
    throw new UserError('Enigma non valido.');
  }
  // The final answer is written only by checkFinalAnswer, after it matched FINAL_SOLUTION.
  if (puzzleId === FINAL_ANSWER_ID) {
    throw new UserError('Enigma non valido.');
  }
  var gate = puzzleGate(puzzleId, new Date(), readUnlockFlags);
  if (gate && gate.locked) {
    throw new UserError('Questo enigma non è ancora stato svelato.', 'LOCKED');
  }
  var answer = readAnswer(req);
  var now = upsertAnswer(user.username, puzzleId, answer);
  return { ok: true, updatedAt: now.toISOString() };
}

/**
 * Checks the final solution typed on the index, once p6 is open: { ok, correct }. A correct
 * answer is stored under FINAL_ANSWER_ID, which the afterFinal gate of the trailer reads back.
 */
function checkFinalAnswer(req) {
  var user = authenticate(req);
  var flags = readUnlockFlags();
  if (flags[FINAL_GATE_PUZZLE] !== true) {
    throw new UserError("L'enigma finale non è ancora stato svelato.", 'LOCKED');
  }
  var answer = readAnswer(req);
  if (!answer) {
    throw new UserError('Scrivi la soluzione prima di inviarla.');
  }
  var accepted = parseAccepted(PropertiesService.getScriptProperties().getProperty(FINAL_SOLUTION_PROPERTY));
  if (!accepted) {
    throw new UserError('La soluzione finale non è ancora pronta, riprova tra poco.', 'NOT_CONFIGURED');
  }
  if (accepted.indexOf(normalizeAnswer(answer)) === -1) {
    return { ok: true, correct: false };
  }
  upsertAnswer(user.username, FINAL_ANSWER_ID, answer);
  return { ok: true, correct: true };
}

/** The trimmed answer of a request, refused when longer than ANSWER_MAX. */
function readAnswer(req) {
  var answer = typeof req.answer === 'string' ? req.answer.trim() : '';
  if (answer.length > ANSWER_MAX) {
    throw new UserError('Risposta troppo lunga (max ' + ANSWER_MAX + ' caratteri).');
  }
  return answer;
}

/** Writes the player's answer to a riddle in Answers, replacing an earlier one; returns the time. */
function upsertAnswer(username, puzzleId, answer) {
  return withLock(function () {
    var sheet = getSheet(ANSWERS_SHEET, ANSWERS_HEADERS);
    var rows = readRows(sheet);
    var key = username.toLowerCase();
    var now = new Date();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0].toLowerCase() === key && rows[i][1] === puzzleId) {
        // +2: one for the header row, one because sheet rows are 1-based.
        sheet.getRange(i + 2, 3, 1, 2).setValues([[safeCell(answer), now]]);
        return now;
      }
    }
    sheet.appendRow([safeCell(username), puzzleId, safeCell(answer), now]);
    return now;
  });
}

/**
 * Returns the media key of a gated riddle, or locked while it is still hidden: a timed riddle
 * adds its unlock time and the server time, a flag riddle has no time to count down to.
 */
function getPuzzleKey(req) {
  authenticate(req);
  var puzzleId = typeof req.puzzleId === 'string' ? req.puzzleId.trim() : '';
  return puzzleKeyResponse(
    puzzleId,
    new Date(),
    function (name) {
      return PropertiesService.getScriptProperties().getProperty(name);
    },
    readUnlockFlags
  );
}

/** Pure core of getPuzzleKey: clock, property reader and flag reader are injected for tests. */
function puzzleKeyResponse(puzzleId, now, readProperty, readFlags) {
  var gate = puzzleGate(puzzleId, now, readFlags);
  if (!gate) {
    throw new UserError('Enigma non valido.');
  }
  if (gate.locked) {
    if (!gate.unlockAt) return { ok: true, locked: true };
    return { ok: true, locked: true, unlockAt: gate.unlockAt, serverNow: now.toISOString() };
  }
  var key = readProperty(gate.keyProperty);
  if (!key || !String(key).trim()) {
    throw new UserError('Il video non è ancora pronto, riprova tra poco.', 'NOT_CONFIGURED');
  }
  return { ok: true, locked: false, key: String(key).trim() };
}

/**
 * Returns the media key of an open asset to any logged-in player, and logs the visit; an asset
 * whose riddle is still closed answers locked (not logged: nobody has seen it).
 */
function getAssetKey(req) {
  var user = authenticate(req);
  var assetId = typeof req.assetId === 'string' ? req.assetId.trim() : '';
  var readProperty = function (name) {
    return PropertiesService.getScriptProperties().getProperty(name);
  };
  var response = assetKeyResponse(
    assetId,
    readProperty,
    readUnlockFlags,
    function () {
      return playerSolvedAll(
        user.username,
        readRows(getSheet(ANSWERS_SHEET, ANSWERS_HEADERS)),
        parseSolutions(readProperty(SOLUTIONS_PROPERTY))
      );
    },
    function () {
      return playerSolvedFinal(
        user.username,
        readRows(getSheet(ANSWERS_SHEET, ANSWERS_HEADERS)),
        parseAccepted(readProperty(FINAL_SOLUTION_PROPERTY))
      );
    }
  );
  if (response.locked) return response;
  // Logged before the key leaves: whoever sees the asset is in the sheet.
  recordVisit(user.username, assetId);
  return response;
}

/** Upserts the player's row in Visits: first visit kept, last visit and count updated. */
function recordVisit(username, assetId) {
  withLock(function () {
    var sheet = getSheet(VISITS_SHEET, VISITS_HEADERS);
    var rows = readRows(sheet);
    var key = username.toLowerCase();
    var now = new Date();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0].toLowerCase() === key && rows[i][1] === assetId) {
        var visits = (parseInt(rows[i][4], 10) || 0) + 1;
        // +2: one for the header row, one because sheet rows are 1-based.
        sheet.getRange(i + 2, 4, 1, 2).setValues([[now, visits]]);
        return;
      }
    }
    sheet.appendRow([safeCell(username), assetId, now, now, 1]);
  });
}

/**
 * Pure core of getAssetKey: property reader, flag reader and the "player solved" checks are
 * injected for tests.
 */
function assetKeyResponse(assetId, readProperty, readFlags, readAllSolved, readFinalSolved) {
  if (!PUZZLE_ID_PATTERN.test(assetId) || !Object.prototype.hasOwnProperty.call(OPEN_ASSETS, assetId)) {
    throw new UserError('Contenuto non valido.');
  }
  var asset = OPEN_ASSETS[assetId];
  if (asset.afterFlag) {
    var flags = readFlags ? readFlags() : {};
    if (flags[asset.afterFlag] !== true) return { ok: true, locked: true };
  }
  if (asset.afterFinal && !(readFinalSolved && readFinalSolved() === true)) {
    return { ok: true, locked: true };
  }
  if (asset.afterAllSolved && !(readAllSolved && readAllSolved() === true)) {
    return { ok: true, locked: true };
  }
  var key = readProperty(asset.keyProperty);
  if (!key || !String(key).trim()) {
    throw new UserError('Il contenuto non è ancora pronto, riprova tra poco.', 'NOT_CONFIGURED');
  }
  return { ok: true, key: String(key).trim() };
}

/**
 * { locked, keyProperty, unlockAt? } for a timed or flag riddle, or null if it is not gated.
 * readFlags() returns { puzzleId: true } for ticked rows; it is called only for flag riddles.
 */
function puzzleGate(puzzleId, now, readFlags) {
  var timed = timedPuzzleState(puzzleId, now);
  if (timed) {
    return { locked: timed.locked, unlockAt: timed.unlockAt, keyProperty: TIMED_PUZZLES[puzzleId].keyProperty };
  }
  if (!Object.prototype.hasOwnProperty.call(FLAG_PUZZLES, puzzleId)) return null;
  var flags = readFlags ? readFlags() : {};
  return { locked: flags[puzzleId] !== true, keyProperty: FLAG_PUZZLES[puzzleId].keyProperty };
}

/** Ids of the flag riddles whose box is not ticked yet. */
function lockedFlagPuzzles(flags) {
  return Object.keys(FLAG_PUZZLES).filter(function (id) {
    return flags[id] !== true;
  });
}

/** { locked, unlockAt } for a timed riddle at the given time, or null if it is not timed. */
function timedPuzzleState(puzzleId, now) {
  if (!Object.prototype.hasOwnProperty.call(TIMED_PUZZLES, puzzleId)) return null;
  var unlockAt = new Date(TIMED_PUZZLES[puzzleId].unlockAt);
  return { locked: now.getTime() < unlockAt.getTime(), unlockAt: unlockAt.toISOString() };
}

// ---------- Solutions ----------

/**
 * { puzzleId: [normalized accepted answers] } from the SOLUTIONS property, or null when it is
 * missing, not valid JSON, empty, or has a riddle without any usable answer.
 */
function parseSolutions(raw) {
  if (!raw || !String(raw).trim()) return null;
  var data;
  try {
    data = JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  var ids = Object.keys(data);
  if (!ids.length) return null;
  var solutions = {};
  for (var i = 0; i < ids.length; i++) {
    var accepted = Array.isArray(data[ids[i]]) ? data[ids[i]] : [data[ids[i]]];
    var normalized = accepted
      .filter(function (value) {
        return typeof value === 'string' || typeof value === 'number';
      })
      .map(normalizeAnswer)
      .filter(function (value) {
        return value !== '';
      });
    if (!normalized.length) return null;
    solutions[ids[i]] = normalized;
  }
  return solutions;
}

/**
 * Normalized accepted answers from a property holding a JSON string or array, or plain text;
 * null when it is missing or has no usable answer.
 */
function parseAccepted(raw) {
  if (raw === null || raw === undefined || !String(raw).trim()) return null;
  var data;
  try {
    data = JSON.parse(String(raw));
  } catch (_) {
    data = String(raw);
  }
  var accepted = (Array.isArray(data) ? data : [data])
    .filter(function (value) {
      return typeof value === 'string' || typeof value === 'number';
    })
    .map(normalizeAnswer)
    .filter(function (value) {
      return value !== '';
    });
  return accepted.length ? accepted : null;
}

/** True when the player's stored final answer matches one of the accepted ones. */
function playerSolvedFinal(username, answerRows, accepted) {
  if (!accepted) return false;
  var key = String(username).trim().toLowerCase();
  return answerRows.some(function (row) {
    return (
      String(row[0]).trim().toLowerCase() === key &&
      String(row[1]) === FINAL_ANSWER_ID &&
      accepted.indexOf(normalizeAnswer(row[2])) !== -1
    );
  });
}

/** Lowercase, no accents, punctuation as spaces, single spaces: "  L'Àncora! " -> "l ancora". */
function normalizeAnswer(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when the player has, for every riddle in solutions, an answer matching one of the accepted
 * ones. answerRows are Answers rows ([username, puzzleId, answer, ...]).
 */
function playerSolvedAll(username, answerRows, solutions) {
  if (!solutions) return false;
  var key = String(username).trim().toLowerCase();
  if (!key) return false;
  var mine = {};
  answerRows.forEach(function (row) {
    if (String(row[0]).trim().toLowerCase() === key) mine[String(row[1])] = normalizeAnswer(row[2]);
  });
  return Object.keys(solutions).every(function (id) {
    return Object.prototype.hasOwnProperty.call(mine, id) && solutions[id].indexOf(mine[id]) !== -1;
  });
}

// ---------- Unlocks sheet ----------

/**
 * Run once from the Apps Script editor (select setupUnlocks, then Run): creates the Unlocks
 * sheet with one unticked checkbox per flag riddle. Safe to run again: existing rows, and
 * boxes already ticked, are left alone. Not built with getSheet(): its plain-text column
 * format would turn the checkbox values into text.
 */
function setupUnlocks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(UNLOCKS_SHEET) || ss.insertSheet(UNLOCKS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, UNLOCKS_HEADERS.length).setValues([UNLOCKS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  var present = {};
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (row) {
      present[String(row[0]).trim()] = true;
    });
  }
  Object.keys(FLAG_PUZZLES).forEach(function (id) {
    if (present[id]) return;
    var row = sheet.getLastRow() + 1;
    // Plain text keeps the id as typed; insertCheckboxes leaves the box unticked (FALSE).
    sheet.getRange(row, 1).setNumberFormat('@').setValue(id);
    sheet.getRange(row, 2).insertCheckboxes();
  });
}

/** { puzzleId: true } for every ticked row of the Unlocks sheet; {} when the sheet is missing. */
function readUnlockFlags() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UNLOCKS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return {};
  return unlockFlags(sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues());
}

/** Pure core of readUnlockFlags: the first row of each id decides; TRUE typed as text counts too. */
function unlockFlags(rows) {
  var flags = {};
  var seen = {};
  rows.forEach(function (row) {
    var id = String(row[0]).trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    var cell = row[1];
    if (cell === true || /^(TRUE|VERO)$/i.test(String(cell).trim())) flags[id] = true;
  });
  return flags;
}

// ---------- Helpers ----------

function authenticate(req) {
  var username = normalizeUsername(req.username);
  var token = typeof req.token === 'string' ? req.token : '';
  var sheet = getSheet(USERS_SHEET, USERS_HEADERS);
  var row = findUserRow(sheet, username);
  if (!row || !token || row[1] !== token) {
    throw new UserError('Sessione non valida. Accedi di nuovo.', 'AUTH');
  }
  return { username: row[0] };
}

function normalizeUsername(value) {
  var username = typeof value === 'string' ? value.trim() : '';
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    throw new UserError(
      'Lo username deve avere tra ' + USERNAME_MIN + ' e ' + USERNAME_MAX + ' caratteri.'
    );
  }
  return username;
}

function normalizePassword(value) {
  var password = typeof value === 'string' ? value.trim() : '';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new UserError(
      'La password deve avere tra ' + PASSWORD_MIN + ' e ' + PASSWORD_MAX + ' caratteri.'
    );
  }
  return password;
}

/** Returns the [username, token, createdAt, password] row matching case-insensitively, or null. */
function findUserRow(sheet, username) {
  var key = username.toLowerCase();
  var rows = readRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0].toLowerCase() === key) return rows[i];
  }
  return null;
}

/** Reads all data rows (without header) as trimmed-of-escape strings. */
function readRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return values.map(function (row) {
    return row.map(function (cell) {
      return cell instanceof Date ? cell : unescapeCell(String(cell));
    });
  });
}

function getSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.setFrozenRows(1);
  }
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    // Set up only missing columns: a fresh sheet, or a column added in a later version.
    if (current[i] !== '') continue;
    sheet.getRange(1, i + 1).setValue(headers[i]);
    // Plain-text format keeps values like "007" from being turned into numbers.
    // Columns named *At hold dates and keep the default format.
    if (!/At$/.test(headers[i])) {
      sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    }
  }
  return sheet;
}

/**
 * Forces a literal text cell with an apostrophe prefix (stripped by Sheets): prevents formula
 * injection and keeps values like "007" from being parsed as numbers, which the '@' column
 * format alone does not prevent on appendRow/setValues.
 */
function safeCell(value) {
  return "'" + value;
}

/** Defensive inverse of safeCell, in case the apostrophe is returned by the sheet. */
function unescapeCell(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new UserError('Server occupato, riprova tra qualche secondo.', 'BUSY');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
