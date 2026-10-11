# Caccia al Tesoro

Sito statico (GitHub Pages) per una caccia al tesoro: i giocatori si registrano con username e password, rispondono agli enigmi e possono modificare le risposte quando vogliono. Le risposte finiscono in un Google Sheet tramite una Web App di Google Apps Script.

- Ogni giocatore vede solo le proprie risposte.
- L'amministratore legge tutte le risposte direttamente nel foglio.
- Le password sono salvate in chiaro (è un gioco tra amici, la segretezza non è un obiettivo): l'amministratore le vede nel foglio `Users`.

## 1. Backend: Google Sheet + Apps Script

1. Crea un nuovo Google Sheet (vuoto).
2. Apri **Estensioni → Apps Script**.
3. Sostituisci il contenuto di `Code.gs` con quello del file [`apps-script/Code.gs`](apps-script/Code.gs) e salva.
4. Clicca **Esegui il deployment → Nuovo deployment**, tipo **App web**:
   - **Esegui come:** Me
   - **Chi ha accesso:** Chiunque
5. Autorizza l'accesso quando richiesto e copia l'**URL dell'app web** (finisce con `/exec`).
6. Incollalo in [`config.js`](config.js) al posto di `PASTE_APPS_SCRIPT_URL_HERE`.

I fogli `Users` (`username`, `token`, `createdAt`, `password`) e `Answers` vengono creati automaticamente alla prima richiesta. Su un foglio `Users` già esistente la colonna `password` viene aggiunta da sola.

## 2. Pubblicare il sito su GitHub Pages

Nel repository GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, cartella `/ (root)`. Dopo un paio di minuti il sito è online all'indirizzo indicato nella stessa pagina.

## 3. Pubblicare gli enigmi

Modifica [`puzzles.json`](puzzles.json) e fai push su `main`:

```json
[
  { "id": "p1", "title": "Titolo", "text": "Testo dell'enigma" }
]
```

- `id` deve essere unico e non va cambiato dopo la pubblicazione (le risposte sono legate all'id). Usa solo lettere, numeri, `-` e `_`.
- Nel `text` puoi andare a capo con `\n`.

Dopo l'accesso il giocatore vede la raccolta degli indizi (quanti enigmi ha risolto e le risposte salvate); ogni enigma ha una sua pagina all'indirizzo `…/#/enigma/<id>` (es. `#/enigma/p1`), che puoi anche condividere direttamente: chi non ha ancora fatto l'accesso ci arriva subito dopo il login.

### Audio (facoltativo)

Un enigma può avere una traccia audio, che compare con un player tra il testo e la risposta:

1. Metti il file nella cartella [`audio/`](audio/), preferibilmente MP3 a 128–160 kbps (pesa poco sulla rete mobile dei giocatori).
2. Aggiungi il campo `audio` all'enigma, con il percorso relativo:

```json
{ "id": "p1", "title": "Titolo", "text": "Testo dell'enigma", "audio": "audio/enigma-1.mp3" }
```

Senza il campo `audio` l'enigma resta solo testo. I file WAV sono troppo pesanti (decine di MB): convertili prima in MP3, per esempio con ffmpeg:

```sh
ffmpeg -i in.wav -codec:a libmp3lame -b:a 160k -ar 44100 audio/enigma-N.mp3
```

## 4. Vedere le risposte

Apri il Google Sheet, foglio **`Answers`**: una riga per giocatore ed enigma (`username`, `puzzleId`, `answer`, `updatedAt`). Ogni modifica aggiorna la stessa riga.

## 5. Aggiornare il codice Apps Script

Dopo aver modificato `Code.gs`, per mantenere lo **stesso URL** usa **Esegui il deployment → Gestisci deployment → ✏️ Modifica → Versione: Nuova versione → Esegui il deployment**. Un "Nuovo deployment" genererebbe invece un URL diverso da reinserire in `config.js`.

## 6. Limitazioni

- Dopo **Esci**, cancellando i dati del browser o cambiando dispositivo, il giocatore rientra con **Accedi** usando username e password: l'account e le risposte non si perdono.
- Password dimenticata: l'amministratore la legge (o la cambia) nella colonna `password` del foglio **`Users`**.
- Gli utenti registrati prima dell'introduzione delle password hanno la colonna `password` vuota e non possono usare **Accedi** finché l'amministratore non ne scrive una.
- Quando scrivi a mano una password nel foglio, mettici davanti un apostrofo se sembra un numero o una data (es. `'007`), altrimenti Sheets la converte (`7`) e il login fallisce.
- Per liberare uno username, l'amministratore cancella la riga corrispondente nel foglio **`Users`** (le risposte già date restano in `Answers` e verranno riassociate a chi si registra di nuovo con quel nome).
