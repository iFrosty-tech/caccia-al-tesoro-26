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
- L'ordine nell'array decide la posizione mostrata sulla pagina dell'enigma ("I di II", "II di II"…).

### Sottotitolo e suggerimento (facoltativi)

Ogni enigma può avere due campi in più, scritti da te; se mancano (o sono vuoti) la pagina non mostra niente al loro posto:

- `subtitle`: una riga sotto il titolo, in corsivo.
- `hint`: un suggerimento nascosto sotto il testo, che il giocatore apre toccando **Serve un suggerimento?**. Anche qui puoi andare a capo con `\n`. Negli enigmi a tempo compare solo dopo l'apertura, insieme al testo.

```json
{ "id": "p1", "title": "Titolo", "subtitle": "Una riga sotto il titolo", "text": "Testo dell'enigma", "hint": "Un aiuto per chi è bloccato" }
```

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

### Enigmi a segnale (si aprono con una spunta nel foglio)

Un enigma può anche restare **sigillato finché non lo apri tu**, durante la caccia, mettendo una spunta nel Google Sheet. Il giocatore vede la scritta *Sigillato* (nessun conto alla rovescia); la pagina ricontrolla da sola ogni 30 secondi (e subito con **Controlla ora**) e si apre senza ricaricare appena la spunta c'è. Come per gli enigmi a tempo, i file sono pubblicati **solo cifrati** e il backend consegna la chiave (e accetta risposte) solo con la spunta messa.

Il foglio **`Unlocks`** ha due colonne, `puzzleId` e `unlocked`: una riga per enigma, con una casella di controllo nella colonna B. Spunta = aperto; casella vuota, riga mancante o foglio mancante = sigillato. Puoi anche togliere la spunta per richiuderlo.

1. Cifra i file con lo **stesso** script e la **stessa chiave** per tutti i file dell'enigma (ognuno riceve comunque un IV casuale suo):

   ```sh
   node tools/encrypt-media.mjs "/percorso/fuori/dal/repo/video.mp4" video/enigma-3.enc
   node tools/encrypt-media.mjs "/percorso/fuori/dal/repo/sstv.wav" audio/enigma-3.enc --key <chiave stampata sopra>
   ```

2. In Apps Script aggiungi la proprietà dello script `MEDIA_KEY_p3` con la chiave (come per `MEDIA_KEY_p2`).
3. In `Code.gs` l'enigma va in `FLAG_PUZZLES` (`p3` c'è già):

   ```js
   var FLAG_PUZZLES = {
     p3: { keyProperty: 'MEDIA_KEY_p3' }
   };
   ```

4. Ripubblica Apps Script come **nuova versione dello stesso deployment** (sezione 5).
5. Nell'editor Apps Script scegli la funzione **`setupUnlocks`** dal menu in alto e premi **Esegui**, una volta sola: crea il foglio `Unlocks` con la riga `p3` e la casella **non spuntata**. Rieseguirla non tocca le righe che ci sono già (né le spunte).
6. In [`puzzles.json`](puzzles.json) l'enigma ha `"gate": "flag"`; `download` offre un file da scaricare decifrato con il nome originale (qui il WAV per la decodifica SSTV, senza perdita di qualità); `theme: "green"` colora di verde la sua pagina:

   ```json
   {
     "id": "p3", "title": "Enigma 3", "text": "Testo dell'enigma",
     "video": "video/enigma-3.enc",
     "download": { "file": "audio/enigma-3.enc", "name": "enigma-3.wav", "type": "audio/wav" },
     "gate": "flag", "theme": "green"
   }
   ```

7. Fai push dei file `.enc` e di `puzzles.json`. Quando vuoi aprire l'enigma, spunta la casella `unlocked` della riga `p3` nel foglio **`Unlocks`**: entro mezzo minuto lo vedono tutti.

Prima di spuntare, controlla che la proprietà `MEDIA_KEY_p3` ci sia: senza, i giocatori vedono "Il video non è ancora pronto".

### Enigma 4 (video a segnale protetto)

L'enigma 4 funziona come l'enigma 3 (sigillato finché non spunti la sua casella), ma il video è riprodotto in modo protetto. Il file `video/enigma-4.enc` è già cifrato nel repository; la chiave **non** c'è e va solo nelle proprietà dello script.

1. In Apps Script aggiungi la proprietà dello script `MEDIA_KEY_p4` con la chiave dell'enigma 4.
2. `Code.gs` ha già `p4` in `FLAG_PUZZLES`: copia il file aggiornato nell'editor e ripubblica come **nuova versione dello stesso deployment** (sezione 5).
3. Nell'editor Apps Script esegui di nuovo **`setupUnlocks`**: aggiunge la riga `p4` con la casella **non spuntata** (le righe esistenti, come `p3`, e le loro spunte restano come sono).
4. Fai push di `video/enigma-4.enc` e di `puzzles.json`. Quando vuoi aprire l'enigma, spunta la casella `unlocked` della riga `p4` nel foglio **`Unlocks`**.

In [`puzzles.json`](puzzles.json) la protezione si attiva con due campi:

```json
{
  "id": "p4", "title": "Enigma 4", "text": "Testo dell'enigma",
  "video": "video/enigma-4.enc",
  "videoType": "video/mp4; codecs=\"avc1.640032, mp4a.40.2\"",
  "protect": true,
  "gate": "flag"
}
```

- `protect: true` attiva i deterrenti sulla sola pagina dell'enigma: niente menu del tasto destro, trascinamento o selezione sul video; download, picture-in-picture e trasmissione ad altri dispositivi disattivati; scorciatoie per gli strumenti per sviluppatori, salva, stampa e sorgente bloccate; il nome del giocatore in filigrana sul video; il video si mette in pausa e si copre quando la pagina va in secondo piano o (su computer) quando gli strumenti per sviluppatori sembrano aperti.
- `videoType` permette di riprodurre il video con Media Source Extensions, senza un indirizzo `blob:` del file intero da aprire o salvare. Il file deve essere un **MP4 frammentato** (per esempio `ffmpeg -i in.mp4 -c copy -movflags frag_keyframe+empty_moov+default_base_moof out.mp4`, poi cifrato con `tools/encrypt-media.mjs`) e i codec in `videoType` devono corrispondere a quelli del file. I browser senza Media Source Extensions (per esempio iPhone con iOS precedente al 17.1) riproducono il video nel modo normale.

> **Limiti, onestamente:** sono solo deterrenti. Per riprodurre un video il browser deve decifrarlo, quindi un giocatore determinato può comunque registrare lo schermo, fotografarlo, o prendere chiave e file cifrato dalla scheda Rete degli strumenti per sviluppatori. Il controllo degli strumenti per sviluppatori è una stima (finestra e pagina di dimensioni diverse): uno zoom del browser diverso dal 100% può farlo scattare, e non funziona se gli strumenti sono aperti in una finestra separata. Su iPhone, a schermo intero, il video passa al lettore di sistema e la filigrana non si vede.

### Pagina nascosta `/periodica/` (immagine cifrata)

La pagina [`periodica/`](periodica/index.html) mostra un'immagine solo a chi ha fatto l'accesso al sito; non è collegata da nessuna parte e chiede ai motori di ricerca di non indicizzarla (`noindex`). Chi non ha una sessione vede un invito ad accedere dalla pagina principale.

L'immagine è pubblicata **solo cifrata** (`periodica/tavola.enc`) e la pagina la disegna su un `<canvas>` con il nome del giocatore in filigrana: niente "Salva immagine", niente trascinamento, e l'immagine si nasconde quando la pagina perde il focus. Sono solo deterrenti: uno screenshot resta sempre possibile.

Il backend consegna la chiave con l'azione `getAssetKey` a qualunque giocatore loggato (nessun orario né spunta). Gli id ammessi sono in `OPEN_ASSETS` in `Code.gs`, separati dagli enigmi: `getPuzzleKey` non consegna mai queste chiavi. L'id resta `tavola` (`MEDIA_KEY_tavola`) anche se la cartella si chiama `periodica/`: rinominare la pagina non tocca il backend.

Per sostituire l'immagine (o cambiare chiave):

1. Convertila in WebP (qualità 80 basta, il file resta sotto il MB) e cifrala con una chiave nuova, partendo da un file fuori dal repo:

   ```sh
   node tools/encrypt-media.mjs "/percorso/fuori/dal/repo/tavola.webp" periodica/tavola.enc
   ```

2. In Apps Script aggiorna la proprietà dello script `MEDIA_KEY_tavola` con la chiave stampata.
3. Se hai cambiato `Code.gs`, ripubblica come **nuova versione dello stesso deployment** (sezione 5); cambiare solo la proprietà non richiede un nuovo deployment.
4. Fai push di `periodica/tavola.enc`. Finché file e chiave non coincidono, i giocatori vedono un messaggio di errore: aggiorna i due insieme.

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
