/**
 * Treasure hunt backend: Google Apps Script web app bound to a Google Sheet.
 *
 * Sheets (created automatically if missing):
 *   Users   -> username | token | createdAt | password
 *   Answers -> username | puzzleId | answer | updatedAt
 *
 * Actions (POST body is a JSON string, sent as text/plain to avoid CORS preflight):
 *   { action: "register",     username, password }
 *   { action: "login",        username, password }
 *   { action: "getMyAnswers", username, token }
 *   { action: "saveAnswer",   username, token, puzzleId, answer }
 *
 * There is intentionally no endpoint that lists other players' data.
 * Passwords are stored in plain text on purpose: secrecy is not a goal and the
 * admin can read or fix them directly in the sheet.
 */

var USERS_SHEET = 'Users';
var ANSWERS_SHEET = 'Answers';
var USERS_HEADERS = ['username', 'token', 'createdAt', 'password'];
var ANSWERS_HEADERS = ['username', 'puzzleId', 'answer', 'updatedAt'];

var USERNAME_MIN = 2;
var USERNAME_MAX = 30;
var PASSWORD_MIN = 1;
var PASSWORD_MAX = 50;
var ANSWER_MAX = 500;
var PUZZLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
var LOCK_TIMEOUT_MS = 10000;

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
  return { ok: true, username: user.username, answers: answers };
}

function saveAnswer(req) {
  var user = authenticate(req);
  var puzzleId = typeof req.puzzleId === 'string' ? req.puzzleId.trim() : '';
  if (!PUZZLE_ID_PATTERN.test(puzzleId)) {
    throw new UserError('Enigma non valido.');
  }
  var answer = typeof req.answer === 'string' ? req.answer.trim() : '';
  if (answer.length > ANSWER_MAX) {
    throw new UserError('Risposta troppo lunga (max ' + ANSWER_MAX + ' caratteri).');
  }

  return withLock(function () {
    var sheet = getSheet(ANSWERS_SHEET, ANSWERS_HEADERS);
    var rows = readRows(sheet);
    var key = user.username.toLowerCase();
    var now = new Date();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0].toLowerCase() === key && rows[i][1] === puzzleId) {
        // +2: one for the header row, one because sheet rows are 1-based.
        sheet.getRange(i + 2, 3, 1, 2).setValues([[safeCell(answer), now]]);
        return { ok: true, updatedAt: now.toISOString() };
      }
    }
    sheet.appendRow([safeCell(user.username), puzzleId, safeCell(answer), now]);
    return { ok: true, updatedAt: now.toISOString() };
  });
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

/** Prevents formula injection: values starting with = + - @ get an apostrophe prefix. */
function safeCell(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
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
