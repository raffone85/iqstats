# Dove siamo — IQstatS

Ultimo aggiornamento: **6 settembre 2026, sera.** Misurato, non ricordato: ogni riga con un
numero è stata verificata oggi contro la produzione, il database in linea o il disco. Dove
una riga non è stata rimisurata oggi, lo dice.

Questa è **l'unica pagina che risponde alla domanda «a che punto siamo»**. Il piano con le
caselle sta in `tasks/plan.md`; l'allineamento a PowerStats, con le misure di ogni voce, sta
in `tasks/allineamento-powerstats.md`; il funzionamento del motore sta in
`docs/architecture/architettura-motore-proiezione.md`.

Produzione: `https://iqstats-indol.vercel.app` · `main` a `0868e5c7`.

**Perché questa pagina è stata riscritta.** La versione precedente era ferma al 23 agosto e
dichiarava **«non ancora pubblicata»** la sezione Gol, la sezione proiezione, `/arbitri` e
`/arbitri/[refereeId]`: tutte e quattro rispondono 200 in produzione da giorni. Un documento
che dice il falso costa più di un documento che non esiste, perché chi lo legge ci crede.

---

## 1. Che cosa è vivo, per chi apre il sito

Verificate in produzione il 6 settembre con una richiesta ciascuna: **diciassette indirizzi, diciassette risposte 200**, comprese le quattro pagine di dettaglio (`/match/210084`, `/squadre/62`, `/arbitri/1830`, `/giocatori/1090`) e `/account`.

| Pagina | Che cosa mostra | Stato |
| --- | --- | --- |
| `/` | la dashboard: gara di oggi in evidenza e le porte del prodotto | viva |
| `/partite` | le gare del giorno, calendario con giorni avanti e indietro, salto a una data qualsiasi, filtri lega e stato | viva |
| `/pronostici` | **la vetrina delle letture in arrivo** più le gare lette dal modello | viva |
| `/match/[id]` | il dossier della gara, venti capitoli | viva |
| `/match/[id]` → **Gol** | gol attesi, 1X2, doppia chance, over/under, gol/nogol, multigol, risultati, **matrice esito × linea** e **più letture insieme** | viva |
| `/match/[id]` → **Proiezioni** | i sette bersagli con soglie, intervalli, affidabilità, osservato per lato e **le gare che fanno ogni media** | viva |
| `/match/[id]` → **In campo** | tabellino e cronologia **anche a gara in corso**, dal 6 settembre | viva |
| `/squadre` | classifiche di competizione e confronto fra due squadre | viva |
| `/squadre/[teamId]` | la scheda squadra, con il selettore di stagione | viva |
| `/arbitri` | competizioni con arbitri, tre letture e la classifica | viva |
| `/arbitri/[refereeId]` | medie, metro dei colleghi, posizione, storico, con il selettore di stagione | viva |
| `/giocatori` | la classifica di stagione per minuti, tiri, falli, cartellini e parate | viva |
| `/giocatori/[playerId]` | la scheda del calciatore: stagione in corso, precedente, carriera | viva |
| `/cerca` | ricerca di squadre e arbitri, e **l'assistente** quando la domanda è una frase | viva |
| `/expected` | i gol attesi, raggiunta dalla dashboard | viva |
| `/metodo` | il metodo, con **il consuntivo completo delle letture** | viva |
| `/accedi`, `/privacy`, `/termini`, `/account` | accesso, pagine legali, profilo e fatturazione | vive |

**La barra ha cinque voci** — Oggi, Pronostici, Squadre, Arbitri, Metodo — e resta a cinque:
il 3 settembre erano sei e su telefono andavano su due righe, coprendo il fondo della pagina.
`/giocatori`, `/cerca` ed `/expected` si raggiungono da dentro le pagine, non dalla barra.

**Da dove arrivano i dati.** Da tutte e due le parti, e non è più come ad agosto:

- **dalla fonte, a ogni visita**, il calendario, il dossier, le quote e le formazioni, con una
  cache breve in memoria (gare 120 s, contesto 300 s, campionati 3.600 s);
- **dal nostro livello dati in linea** il motore, gli arbitri, le classifiche di squadra e di
  giocatore, la copertura e la vetrina. La versione precedente diceva che il gateway Postgres
  «in produzione resta spento»: **è falso dal 4 settembre**, e si verifica in un colpo solo —
  `/giocatori` in produzione scrive «557 gare con il dato», che è una lettura del database.

**L'unico automatismo in linea** resta la sveglia su GitHub Actions
(`.github/workflows/sveglia-formazioni.yml`), che chiama `POST /api/interno/rinfresca` per
tenere calda la cache delle formazioni. *Non rimisurata oggi: gli ultimi numeri sono del 22
agosto.*

## 2. Che cosa c'è nel database in linea

Progetto Supabase `iqStats`, schema `football` a **210 MB**, misurato il 6 settembre.

| Contenuto | Righe |
| --- | ---: |
| Statistiche per giocatore (`player_match_observations`) | **457.416** su 10.968 gare, 21.667 giocatori, 57 stagioni |
| Osservazioni squadra-gara del motore (`team_match_observations`) | **22.132**, dal 22 febbraio 2025 al 5 settembre 2026 |
| Tiri per gara (`team_match_shots`) | **19.739** |
| Gare, squadre, arbitri, stagioni, competizioni | 11.066 · 599 · 696 · 57 · 29 |
| Classifiche (`standing_rows`) | **0** |

**Le statistiche per giocatore non hanno i gol.** Le sette colonne sono minuti, tiri, tiri in
porta, falli, gialli, rossi e parate: nessuna tavola di episodi, quindi una classifica
marcatori da qui non si può fare, e alla fonte costerebbe una chiamata per gara — trecentottanta
per la sola Serie A. `/giocatori` lo dichiara invece di sostituire i gol con i tiri.

## 3. Che cosa gira sul tuo PC, e non altrove

*Sezione non rimisurata oggi: vale quanto scritto il 23 agosto.*

| Cosa | Quando | Conseguenza se il PC è spento |
| --- | --- | --- |
| Passata notturna (`sync_nightly.ps1`) | 03:00, attività Windows | la storia del motore non avanza |
| Archivio grezzo, dataset, modelli addestrati | a mano | niente, non servono all'app |
| Container `supabase_db_IQstatS` | sempre acceso | niente per la produzione: serve allo sviluppo e alle misure |

Dal 22 agosto la passata scrive su **due destinazioni**, il container locale e Supabase.

## 4. Il motore di proiezione, in chiaro

Sette modelli **in produzione**, verificati byte per byte contro l'uscita di Python da
`test:projection-artefatti`: tiri e falli con `ridge`, tiri in porta, corner, ammoniti,
fuorigioco e parate con `poisson_glm`.

**I limiti che si vedono in pagina, e sono voluti:**

- serve storia nella **stagione in corso**: dove non c'è, la sezione non compare e la gara
  mostra il motore di base;
- **senza arbitro designato** tre bersagli su sette ripiegano: valore senza intervallo, senza
  linee e senza affidabilità;
- le letture in cima **si fermano all'ottanta per cento**: sopra quella soglia, su 1.200 gare
  chiuse, il modello promette 81,5% e rende 74,7%.

## 5. Che cosa NON esiste ancora

L'allineamento a PowerStats (`tasks/allineamento-powerstats.md`) ha **ventitré voci, e una
sola resta davvero aperta**. Contate leggendo il corpo di ogni voce, non la barratura del
titolo: cinque erano chiuse nei fatti ma il piano non lo diceva, e due di quelle — la scelta
libera della data e il punteggio che si muove — sono state chiuse oggi con la loro misura.

| Voce | Che cosa manca |
| --- | --- |
| **7** | il *perché* accanto alla copertura di una gara: la targhetta dice «Solo calendario» ma non dice cosa manca. Il badge per campionato, che la voce chiedeva, è stato **scartato con una misura**: direbbe «Serie A sì» su una gara che dirà no |
| **11, 12, 14** | chiuse a metà: preferiti, guida e schermata home vivono **su questo dispositivo**. Legarli all'account chiede una tavola nuova sul livello dati in linea, cioè una scrittura da autorizzare |

**Fuori dall'allineamento**, i debiti veri sono nel §7.

## 6. Come si verifica che non è rotto

Da `apps/web`: **quarantasette suite, tutte verdi** il 6 settembre con il livello dati
collegato. Le più grosse: `test:gateway` 25, `test:projection-gol` 19, `test:affronto` 17,
`test:arbitro-scheda` 15, `test:dossier` 15, `test:ritmo-tempi` 11, `test:arbitri` 10.
Più `tsc --noEmit`, `eslint` e `next build`.

**Molte suite si saltano senza connessione al livello dati** e lo dicono: per eseguirle tutte
serve `IQSTATS_PROJECTION_DATABASE_URL`, che **non sta in `.env.local`** e si ricava dal
container locale. Senza, quelle prove risultano «saltate» e non «passate»: è una differenza
che conta, ed è il motivo per cui una prova è rimasta rossa dal 5 settembre senza che nessuno
la vedesse.

## 7. Debiti dichiarati, non nascosti

- **Il nome della fonte è ancora esposto**, verificato oggi: `/api/matches` risponde con
  `"source":"bsd"` e `apps/web/src/app/api/matches/route.ts` importa `@/lib/bsd`. Il vincolo
  del progetto dice che quel nome non deve comparire in percorsi, moduli, log o interfaccia.
- **La vetrina legge un artefatto**, non calcola a richiesta: una lettura costa una proiezione
  e un giorno di calcio sono oltre cento gare, cioè quindici secondi. Finché nessuno rigenera
  `vetrina-letture.json`, la sezione invecchia; le gare già cominciate escono da sole e se non
  ne resta nessuna la sezione non compare.
- **La passata gira solo a sessione aperta** e non scrive un log.
- **Stripe è in test mode**. *Non rimisurato oggi.*
- **Due numeri della stessa gara non coincidono**: la riga dei tiri dice 6-2, la mappa sotto
  conta 6 e 3. Sono due campi diversi della stessa risposta della fonte, e la differenza va
  misurata prima di dichiarare quale ha ragione.
- Il resto — copertura dell'intervallo, fascia EARLY, divergenza del lato che addestra — è in
  `docs/architecture/architettura-motore-proiezione.md`.
