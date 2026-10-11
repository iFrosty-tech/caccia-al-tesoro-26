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

### Enigmi a tempo (video cifrato)

Un enigma può comparire subito sul sito ma aprirsi solo a un'ora precisa: fino ad allora il giocatore vede un conto alla rovescia, poi il video si scarica, si decifra nel browser e parte. Il repository è pubblico, quindi il video si pubblica **solo cifrato**: la chiave sta nelle proprietà dello script Apps Script e il backend la consegna solo quando il **suo** orologio ha superato l'ora di apertura (il timer del sito è solo estetico). Prima di quell'ora il backend rifiuta anche le risposte all'enigma.

1. Cifra il video (serve Node 20 o successivo, nessuna dipendenza) tenendo l'originale **fuori** dal repository:

   ```sh
   node tools/encrypt-media.mjs "/percorso/fuori/dal/repo/video.mp4" video/enigma-N.enc
   ```

   Lo script stampa solo la chiave (base64). Per riusare una chiave esistente aggiungi `--key <base64>`.
2. In Apps Script apri **Impostazioni progetto → Proprietà script → Aggiungi proprietà**: nome `MEDIA_KEY_<id>` (es. `MEDIA_KEY_p2`), valore la chiave stampata.
3. In `Code.gs` aggiungi l'enigma a `TIMED_PUZZLES`, con l'ora in UTC (20:30 in Italia d'estate = 18:30Z):

   ```js
   var TIMED_PUZZLES = {
     p2: { unlockAt: '2026-10-11T18:30:00Z', keyProperty: 'MEDIA_KEY_p2' }
   };
   ```

4. In [`puzzles.json`](puzzles.json) aggiungi l'enigma con `video` e la stessa ora in `unlockAt`:

   ```json
   { "id": "p2", "title": "Enigma 2", "text": "Testo dell'enigma", "video": "video/enigma-2.enc", "unlockAt": "2026-10-11T20:30:00+02:00" }
   ```

5. Ripubblica Apps Script come **nuova versione dello stesso deployment** (vedi sezione 5: **Gestisci deployment → ✏️ Modifica → Nuova versione**), così l'URL in `config.js` non cambia. Poi fai push del file `.enc` e di `puzzles.json`.

> **Attenzione:** non mettere **mai** nel repository (nemmeno per un commit poi annullato: resta nella cronologia) il video in chiaro o la chiave. Se succede, cifra di nuovo con una chiave nuova e aggiorna la proprietà dello script.

Il video viene scaricato per intero prima di partire: tienilo leggero (un MP4 H.264 da qualche decina di MB va bene; GitHub rifiuta file oltre 100 MB).

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
