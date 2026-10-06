# QZ

**QZ** è un motore di esercitazione gratuito e open source per quiz ed esami di certificazione.
Funziona come **un unico file HTML**: doppio clic su `exam.html`, nessun server, nessun account, nessuna installazione.
Porti le tue domande (un file di testo per esame) e QZ ti dà simulazioni a tempo, modalità studio, ripasso a ripetizione dilazionata, statistiche e molto altro.

🇬🇧 [Read in English](README.md) · 📘 [Guida utente](docs/USER-GUIDE.md) (in inglese) · 🧩 [Formato degli esami](docs/EXAM-FORMAT.md) · 🏗️ [Architettura](docs/ARCHITECTURE.md) · 🤝 [Contribuire](CONTRIBUTING.md)

![QZ — scegli un esame](docs/img/picker.png)

---

# Parte 1 — Le basi

## A cosa serve?
- Prepararsi a una certificazione (informatica, finanza, lingue, teoria della patente…) con la propria raccolta di domande.
- Insegnanti e formatori che vogliono consegnare agli allievi un quiz pronto, utilizzabile anche offline.
- Chiunque voglia un posto privato e senza pubblicità dove esercitarsi: **le tue risposte non lasciano il tuo dispositivo** a meno che tu non scelga di sincronizzarle.

## Provalo in 30 secondi
1. Scarica il repository (pulsante verde **Code** → *Download ZIP*) e decomprimilo.
2. Fai doppio clic su **`exam.html`**. Scegli l'esame *Engine Demo* e premi **Avvia sessione**.
3. Fatto. (Preferisci il web? Quando GitHub Pages è attivo l'app è servita su `https://<utente>.github.io/<repo>/`.)

| Scegli un esame | Studia con le spiegazioni | Funziona sul telefono |
|---|---|---|
| ![dashboard](docs/img/dashboard.png) | ![domanda](docs/img/question.png) | ![mobile](docs/img/question-mobile.png) |

## Cosa puoi fare
- **Tanti modi di esercitarti** — simulazioni a tempo, l'intero archivio, un argomento alla volta, le domande sbagliate, quelle segnate, quelle mai viste e il *ripasso a ripetizione dilazionata* che ripropone ciò che stai per dimenticare.
- **Modalità studio o modalità esame** — verifichi subito ogni risposta e leggi la spiegazione, oppure rispondi liberamente e rivedi alla fine. Puoi sempre spostarti tra le domande.
- **Ogni tipo di domanda** — scelta singola e multipla, vero/falso, ordinamento, abbinamento, risposte numeriche e scenari a più parti, con testo formattato, codice, tabelle, formule e immagini.
- **I tuoi progressi** — storico dei punteggi, precisione per argomento, domande più difficili, note e segnalibri su ogni domanda.
- **I dati restano tuoi** — salvati nel browser; file di backup, codice di trasferimento o Gist GitHub privato (facoltativi) per passare da un dispositivo all'altro.
- **Tema chiaro e scuro, interfaccia in italiano e inglese**, scorciatoie da tastiera e palette comandi (`Ctrl/⌘ + K`).
- **Installabile e offline** — si può installare come app e continua a funzionare senza internet.

## Portare i tuoi esami in QZ
Hai tre strade semplici:
1. **Scrivi un file** — un esame è un file di testo chiamato `qualcosa.exam` (vedi [il formato](docs/EXAM-FORMAT.md)). Mettilo accanto a `exam.html` e premi **Cerca esami** nella pagina iniziale (Chrome/Edge ricordano la cartella).
2. **Importa** — usa **Importa una cartella…** oppure *Opzioni → I miei esami → Importa o crea da file*. QZ capisce `.exam`, CSV, Markdown e testo semplice come questo:
   ```
   1. Quale protocollo risolve i nomi in indirizzi?
   A) FTP
   B) DNS
   C) SMTP
   Risposta: B
   Spiegazione: DNS associa i nomi agli indirizzi IP.
   ```
   Un editor guidato mostra ciò che è stato capito e ti lascia correggere i problemi prima di salvare.
3. **Costruiscilo nell'editor** — *Nuovo esame vuoto* offre un modulo con validazione in tempo reale.

Gli esami creati nel browser si possono esportare in `.exam`, CSV, Markdown o carte **Anki**.

## La privacy in un paragrafo
QZ non ha server né tracciamento. Domande, risposte, note e statistiche sono salvate nel browser (IndexedDB). Nulla viene caricato se non premi tu un pulsante di sincronizzazione. Fai ogni tanto un backup (*Opzioni → Backup*): cancellare i dati del browser cancella anche i progressi.

---

# Parte 2 — Nel dettaglio

## Modalità di esercitazione
| Modalità | Cosa fa |
|---|---|
| Modalità definite dall'esame | Le decide l'autore dell'esame: casuale, *bilanciata* (prima una domanda per argomento) o *ponderata* (numero fisso per gruppi di argomenti), con tempo e soglia propri. |
| Intero archivio / per argomento | Tutte le domande, oppure un solo argomento. |
| Ripasso a ripetizione dilazionata | Scatole di Leitner (intervalli di 0, 1, 3, 7, 21 giorni): una risposta giusta fa salire la domanda di scatola, una sbagliata la riporta alla scatola 0. |
| I miei errori / Segnate / Mai viste | Domande con l'ultima risposta errata, segnate da te, o mai affrontate. |
| Per difficoltà | Quando l'esame etichetta le domande come facili / medie / difficili. |
| Risultati di ricerca | Cerchi nell'archivio (testo, argomento, tipo, stato) e ti eserciti esattamente su ciò che hai trovato. |

## Realismo e punteggio (tutto facoltativo)
- Credito parziale per domande a risposta multipla, ordinamento, abbinamento e scenari.
- Penalità per risposte errate o mancanti (una frazione dei punti della domanda): il totale non scende mai sotto zero.
- Pesi per domanda (`points`) e domande **obbligatorie** che devono essere completamente giuste per superare l'esame.
- Pause limitate, *orologio rigido* che continua a scorrere a pagina chiusa, indicatore di ritmo e risultato stampabile (stampa → *Salva come PDF*).
- Timer: totale, per domanda o nessuno. La navigazione tra le domande **non** viene mai limitata.

## I tuoi dati
- **Profili** — più persone o obiettivi sullo stesso dispositivo, ciascuno con progressi separati.
- **Archiviazione** — IndexedDB (quota ampia), con ripiego su `localStorage`/memoria; le scritture avvengono subito e di nuovo quando la pagina viene nascosta.
- **Backup** — scarichi un backup completo, ricevi un promemoria ogni *N* giorni, oppure scegli un file (Chrome/Edge) che QZ riscrive dopo ogni sessione conclusa.
- **Sincronizzazione tra dispositivi** — copia/incolla di un *codice di trasferimento*, oppure Gist GitHub privato (il token resta sul tuo dispositivo e non finisce mai nei backup). I progressi vengono uniti, mai sovrascritti.

## Trovare gli esami sul disco
La pagina iniziale ha il pulsante **Cerca esami**. In Chrome/Edge chiede la cartella degli esami una volta sola, la ricorda e la rilegge a ogni pressione; le schede sono costruite dai file stessi. In tutti i browser **Importa una cartella…** copia tutti i file `.exam` di una cartella in *I miei esami*. I file non leggibili sono elencati con il motivo. Dopo il riavvio del browser Chrome può chiedere di nuovo il permesso: premi il pulsante.

## Versioni degli esami e qualità
- Gli esami possono avere un **registro delle modifiche**: chi studia vede le novità quando la versione cambia.
- Una domanda può essere rivista (`rev` — torna nel ripasso) o **ritirata** (resta nel file ma non viene più proposta).
- Chi studia può **segnalare** una domanda sbagliata; le segnalazioni restano sul dispositivo finché non le esporti.
- QZ individua le domande deboli dalle tue risposte: troppo facili o difficili, chiave di risposta sospetta, distrattori che nessuno sceglie, problemi strutturali (opzioni duplicate, «tutte le precedenti»).

## Tastiera
`1–6` o `A–F` scelgono · `←` `→` si sposta · `Invio` verifica / avanti · `M` segna · `X` cancella la risposta · `R` segnala · `P` pausa · `Ctrl/⌘ + K` palette comandi · `/` cerca · `?` aiuto scorciatoie · `Esc` chiude le finestre.

## Per chi sviluppa
QZ è HTML, CSS e JavaScript semplici: nessun framework, nessuna dipendenza a runtime. I sorgenti stanno in `src/` e vengono uniti nel singolo `exam.html` da `node tools/build.js`.

```bash
git clone https://github.com/fucc74/ExamSimulator.git && cd ExamSimulator
npm ci                      # solo strumenti di sviluppo: Playwright, axe-core, pixelmatch
npm run build               # rigenera exam.html, exams.js, sw.js
npm test                    # test unitari (senza browser)
npx playwright install chromium && npm run e2e   # test nel browser
npm run audit               # accessibilità + budget di prestazioni
npm run pack                # sito statico in dist/ (pronto per GitHub Pages)
```

| Percorso | Contenuto |
|---|---|
| `src/js/` | Moduli numerati: motore (`00`–`70`), interfaccia (`80`–`88`) e avvio (`90`) |
| `src/styles/`, `src/template.html` | Stili e guscio HTML |
| `tools/` | Build, generatore del catalogo, validatore degli esami, convertitore del vecchio formato, packer |
| `tests/` | Test unitari (`node:test`), test end-to-end nel browser, audit, regressione visiva |
| `*.exam` | File d'esame — **dati**, non codice |
| `docs/` | [Guida utente](docs/USER-GUIDE.md), [formato esami](docs/EXAM-FORMAT.md), [API](docs/API.md), [architettura](docs/ARCHITECTURE.md) |

`exam.html`, `exams.js` e `sw.js` sono **generati** e inclusi nel repository, così l'app funziona subito dopo il download. La CI fallisce se non sono aggiornati: esegui `npm run build` prima del commit.

### Integrazione continua e pubblicazione
`.github/workflows/ci.yml` gira a ogni push e pull request: file generati aggiornati, test unitari, validazione degli esami, test nel browser su Chromium/Firefox/WebKit, emulazione mobile, audit di accessibilità e prestazioni, regressione visiva.
`.github/workflows/pages.yml` pubblica il sito su GitHub Pages: nel repository vai su *Settings → Pages → Source: GitHub Actions* una volta sola, poi ogni push su `main` pubblica.
La regressione visiva richiede immagini di riferimento create sulla stessa macchina che le controlla: lancia a mano il workflow CI con *update_visual_baseline* spuntato, scarica l'artefatto `visual-regression` e fai il commit di `tests/visual-baseline/`.

### Estendere QZ
Eventi, tipi di domanda e modalità di studio personalizzati sono descritti in [docs/API.md](docs/API.md). Nuove lingue: aggiungi un dizionario accanto a `src/js/10-i18n.js` e `11-i18n-v3.js` (un test unitario fallisce se manca una chiave).

---

## Contribuire
Segnalazioni di bug, nuovi esami, traduzioni e codice sono tutti benvenuti: vedi [CONTRIBUTING.md](CONTRIBUTING.md). Buoni primi contributi: una nuova lingua dell'interfaccia, un esame di esempio nel tuo campo, una correzione di accessibilità.

## Sul contenuto degli esami
QZ è il motore; gli esami sono file di dati separati. Chi condivide un esame è responsabile di averne il diritto: non pubblicare domande copiate da materiale protetto da copyright o riservato.

## Licenza
QZ è rilasciato con licenza **GNU General Public License v3.0** — vedi [LICENSE](LICENSE).
Identificatori interni come `ExamSim.register(...)` e le chiavi di archiviazione `examsim` mantengono il nome originale per compatibilità con i file d'esame e i progressi già salvati.
