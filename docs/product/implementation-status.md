# Dove siamo — IQstatS

Ultimo aggiornamento: **22 agosto 2026, notte.** Misurato, non ricordato: ogni riga di
questa pagina è stata verificata contro la produzione, il database in linea o il disco.

Questa è **l'unica pagina che risponde alla domanda «a che punto siamo»**. Il piano con le
caselle sta in `tasks/plan.md`; il diario con tutte le misure sta in `tasks/todo.md`; il
funzionamento del motore sta in `docs/architecture/architettura-motore-proiezione.md`.

Produzione: `https://iqstats-indol.vercel.app` · `main` a `505b49a7` più il lavoro del
22 agosto non ancora committato.

---

## 1. Che cosa è vivo, per chi apre il sito

Tutte queste pagine rispondono **200** in produzione, verificate il 22 agosto:

| Pagina | Che cosa mostra | Stato |
| --- | --- | --- |
| `/` `/oggi` `/partite` | le gare, con filtri per data e campionato | viva |
| `/pronostici` `/giocate` | le liste derivate dalle gare | viva |
| `/match/[id]` | il dossier della gara: testata, riepilogo, quote, metodo e fonti | viva |
| `/match/[id]` → sezione proiezione | i sette bersagli previsti, con soglie e affidabilità, e **accanto il numero osservato** casa/trasferta | viva **solo dove c'è storia** (vedi §4) |
| `/squadre/[teamId]` | la scheda squadra | viva |
| `/database` `/metodo` | le pagine di servizio | viva |
| `/accedi` | accesso con codice a sei cifre via email | viva |
| `/account/billing` | i quattro piani, Checkout e Portale Stripe | viva, Stripe in **test mode** |

**Da dove arrivano i dati delle gare.** Non dal database: undici moduli server chiedono alla
fonte a ogni visita, con una cache breve in memoria (gare 120 s, contesto gara 300 s, elenco
campionati 3.600 s). Il gateway che leggerebbe da Postgres esiste ma in produzione **resta
spento**, perché accetta la connessione solo su indirizzo locale.

**L'unico automatismo in linea** è la sveglia su GitHub Actions
(`.github/workflows/sveglia-formazioni.yml`): chiama `POST /api/interno/rinfresca` per tenere
calda la cache delle formazioni nella fascia 11–21 UTC. Le ultime otto esecuzioni del 22
agosto sono tutte riuscite, in 9–17 secondi; gli intervalli reali sono di 14–34 minuti, non i
dieci nominali, perché GitHub ritarda i cron pianificati.

## 2. Che cosa c'è nel database in linea

Progetto Supabase `iqStats`, **175 MB su 500** del piano gratuito.

| Contenuto | Righe |
| --- | ---: |
| Statistiche per giocatore (`player_match_observations`) | 435.420 |
| Osservazioni squadra-gara del motore (`team_match_observations`) | 21.080 |
| Gare, squadre, arbitri, stagioni, competizioni | 10.540 · 588 · 680 · 55 · 29 |
| Accesso e abbonamenti (profili, piani, feature, entitlement) | 4 profili · 4 piani · 7 feature · 26 righe di matrice |
| Classifiche (`standing_rows`, `standing_snapshots`) | **0** |

Le tavole `football` in linea contengono **il perimetro del motore**, non quello del prodotto:
l'archivio DATA-1 del 9 agosto — 9.548 gare e 591 squadre — vive **solo sul PC**, nel
container locale, e nessuna pagina lo legge.

## 3. Che cosa gira sul tuo PC, e non altrove

| Cosa | Quando | Conseguenza se il PC è spento |
| --- | --- | --- |
| Passata notturna (`sync_nightly.ps1`) | 03:00, attività Windows | la storia del motore non avanza; la sezione proiezione resta ferma all'ultima notte utile |
| Archivio grezzo della fonte, dataset, quattordici modelli addestrati | a mano | niente, non servono all'app |
| Container `supabase_db_IQstatS` (205 MB) | sempre acceso | niente per la produzione: serve allo sviluppo e ai test |

**Che cosa fa la passata, in parole semplici.** Chiede alla fonte le partite finite, si segna
com'è andata ogni squadra — tiri, tiri in porta, corner, falli, ammoniti, fuorigioco, parate —
e archivia quelle righe. Serve al motore per dire «stasera questa squadra tirerà circa 17
volte», guardando com'è andata prima. **Non aggiorna i risultati che vedi in pagina**: quelli
arrivano in diretta dalla fonte.

Dal 22 agosto scrive su **due destinazioni**, il container locale e Supabase, con una riga di
giornale ciascuna: prima scriveva solo in locale e la produzione non avanzava mai.

## 4. Il motore di proiezione, in chiaro

Sette modelli **in produzione**, presenti nel pacchetto come artefatti verificati byte per
byte: tiri e falli con `ridge`, tiri in porta, corner, ammoniti, fuorigioco e parate con
`poisson_glm`. Altri sette restano validati ma non promossi.

**Due limiti che si vedono in pagina, e sono voluti:**

- serve almeno la **quarta giornata** di campionato: con meno di tre gare precedenti nella
  stagione in corso la sezione non compare, e la gara mostra il pannello di prima. A fine
  agosto quasi tutta l'Europa è in questa condizione;
- **senza arbitro designato** tre bersagli su sette ripiegano: mostrano il valore senza
  intervallo, senza linee e senza affidabilità.

## 5. Che cosa NON esiste ancora

Sono le voci aperte del tuo piano, in ordine di valore per chi usa l'app:

| Voce | Che cosa manca | Dove |
| --- | --- | --- |
| **APP-6B** | lo stesso confronto casa/trasferta **dove la proiezione non c'è** | `tasks/plan.md` fase 3 |
| **APP-7** | mercati e probabilità spiegabili | fase 4 |
| **APP-8** | gol, statistiche squadra e contesto, una famiglia alla volta | fase 4 |
| **APP-9** | pagine competizione, squadra e giocatore come viste sul database | fase 4 |
| **APP-10** | i segnali IQstatS versionati, con spiegazione e limiti | fase 4 |
| **DATA-2 → DATA-5** | statistiche gara, quote, formazioni e rose dentro il database del prodotto | fase 1A |
| **APP-3D** | il contratto dati operativo: freschezza, retention, ingest | fase 1 |
| **Fase 6** | il quality gate di rilascio | fase 6 |

**La proiezione vive solo dentro il dossier della gara**: non compare in `/partite`,
`/pronostici`, `/oggi` né sulla scheda squadra.

## 6. Come si verifica che non è rotto

Dalla radice: `npm run test:projection` (53) · `test:asof` (14) · `test:production` (20) ·
`test:snapshot` (16) · `test:match` (15).
Da `apps/web`: `test:projection-artefatti` (3) · `test:projection-store` (1, serve
`IQSTATS_DATABASE_URL`, altrimenti si salta) · `test:projection-osservato` (3) ·
`test:gateway` (25) · `test:stat-engine` (9) · `test:media` (4) · `test:auth` ·
`test:billing`, più `tsc --noEmit`, `eslint` e `build`.

## 7. Debiti dichiarati, non nascosti

- **Il nome della fonte è esposto**: `apps/web/src/app/api/matches/route.ts` importa
  `@/lib/bsd` e la risposta pubblica contiene `"source":"bsd"`. Il vincolo del progetto dice
  che quel nome non deve comparire in percorsi, moduli, log o interfaccia.
- **La quota del database**: 117 → 175 MB su 500 dopo una passata, perché ogni passata
  riscrive tutte le 453.000 righe invece delle poche cambiate. Da rimisurare dopo la notte
  del 23 agosto: se cresce ancora così, la quota finisce in meno di sei notti.
- **La passata gira solo a sessione aperta** e **non scrive un log**: dell'esecuzione delle
  03:00 si sa soltanto il codice di uscita.
- **Stripe è in test mode**: nessun pagamento reale è mai stato incassato.
- Il resto — copertura dell'intervallo ottimista, fascia EARLY non misurabile, divergenza del
  lato che addestra — è elencato con i numeri in
  `docs/architecture/architettura-motore-proiezione.md`.
