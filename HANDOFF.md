# BLOCCO EXECUTION — RIPRESA OBBLIGATORIA

> **STOP. Al riavvio non scrivere, modificare o cancellare codice applicativo, CSS o script di harvesting.**
>
> Il lavoro si trova a un checkpoint umano del **Compito 0 — ricognizione API per calibrazione della dispersione**. `scripts/calibration/discovery/NOTES.md` è stato presentato e attende esclusivamente la conferma della policy: `events/{id}/stats/` come fonte canonica e `offsides` assente normalizzato a `null`, mai a `0`.
>
> Non avviare il Compito A e non creare `buildDataset.ts` finché l’utente non conferma. Dopo la conferma, applicare l’organizzazione già richiesta con `planning-and-task-breakdown`, rispettare i checkpoint uno alla volta e limitarsi a `/scripts/calibration/`.
>
> Il refactor UI LineaX è una seconda pista, già pianificata ma **non approvata**: se l’utente sceglie di riprenderla, avviare prima `/ui-ux-designer` (fallback disponibile: `ui-ux-pro-max`), rileggere `tasks/plan.md` e ottenere la scelta tipografica. Non fare un restyling incrementale.

# LineaX — Handoff operativo consolidato

Aggiornato il 21 luglio 2026 dopo recupero semantico della sessione precedente e consolidamento del lavoro corrente.

## Provenienza e ordine delle fonti

1. `HANDOFF.md` precedente: stato immediato del refactor UI.
2. `CHAT_RECOVERY.md`: recupero completo del transcript della sessione originale (`019f7f6d-df94-7d33-9a15-1dfda7eb6486`, 291 messaggi e quattro compattazioni). È la fonte storica di decisioni non presenti nel vecchio handoff.
3. `ROADMAP.md`, `CLAUDE.md`, `PROJECT_RULES.md`, `ARCHITECTURE.md`, `DATABASE.md`, `UI_SYSTEM.md`, `WORKFLOW.md`, `PRODUCT_SCOPE.md` e `DATA_OPTA_ENDPOINT_CATALOG.md`: contratti progettuali.
4. `apps/lineax-web/AGENTS.md` e `apps/lineax-web/CLAUDE.md`: obbligatori prima di modificare l’app Next.js.
5. `tasks/plan.md`, `tasks/todo.md`, `tasks/calibrazione-dispersione.md` e gli artefatti discovery: stato dei task.

`chat_recovery.md` in minuscolo non esiste; il file valido è `CHAT_RECOVERY.md`. I caratteri devono essere gestiti come UTF-8.

## Stato esatto al termine di questa sessione

### Pista immediata — calibrazione della dispersione

- Sono stati importati dall’utente e committati nel repository radice:
  - `docs/mappa-endpoint-piano-struttura.md`
  - `tasks/calibrazione-dispersione.md`
- Commit effettuato: `b527a7a` — `docs: add calibration discovery task and endpoint map`.
- È stato eseguito **solo il Compito 0**, in sola lettura e con la configurazione server-side già esistente. Non sono stati creati harvester, analizzatori, file generati del modello o modifiche dell’app.
- Sono stati creati, non ancora committati:
  - `scripts/calibration/discovery/leagues.json`
  - `scripts/calibration/discovery/sample-match-383.json`
  - `scripts/calibration/discovery/sample-match-1456.json`
  - `scripts/calibration/discovery/sample-match-207461.json`
  - `scripts/calibration/discovery/NOTES.md`
- I quattro JSON sono stati validati con parsing JSON. `git diff --check` non ha rilevato errori di whitespace.
- Esiste nella radice workspace esterna un precedente `scripts/calibration/discovery/NOTES.md` che documenta una ricognizione bloccata da 401. Non confonderlo con la discovery verificata: il percorso canonico corrente è quello dentro questa radice progetto.

### Scoperte API verificate live

- `GET /api/v2/leagues/?limit=50` restituisce `{ count, next, previous, results }`: `count=72`, prima pagina da 50 e `next` con `offset=50`. Con `limit=100` arrivano tutte le 72 leghe e `next=null`.
- Il filtro eventi conclusi ha prodotto campioni in Premier League, Serie A e Bundesliga. L’oggetto usa `event_date`, non `date`.
- `GET /api/v2/events/{id}/stats/` è il contratto composto canonico: `{ event_id, stats, shotmap, momentum, average_positions, xg_per_minute }`. `stats` contiene `home`, `away`, `first_half`, `second_half`.
- `total_shots`, `shots_on_target`, `fouls`, `corner_kicks`, `yellow_cards` e `goalkeeper_saves` erano presenti nei tre campioni. `offsides` mancava nel match 1456: è opzionale e non può essere convertito in zero.
- `GET /api/v2/events/{id}/shotmap/` restituisce 404. Non è stato trovato un endpoint documentato più leggero per le sole statistiche; per ottimizzare l’harvester futuro si estrarranno soltanto `stats.home` e `stats.away` dopo la risposta.
- `GET /api/v2/events/{id}/odds/comparison/` espone un oggetto `markets`; nei campioni con quote: `1x2`, `double_chance`, over/under 1.5/2.5/3.5, `btts`, `draw_no_bet`, `total_red_cards`, `total_corners`, `corners_1x2`, `red_card`. Un evento storico può avere `markets: {}` e zero bookmaker: stato normale, non errore.
- Team e manager sono strutturati. Il dettaglio giocatore contiene anche `market_value_eur`, `contract_until`, `availability`, `wage_eur_annual`; i trasferimenti sono feed strutturati con club, data, fee e tipo. `social` fornisce testo/media e link strutturati a entità, ma non è emerso un endpoint news editoriale strutturato dedicato.
- La lista completa di schema, discrepanze, dimensioni dei payload, mercati ed evidenze è in `scripts/calibration/discovery/NOTES.md`; non duplicare né reinterpretare tali contratti nel codice.

### Ambiguità da conservare, non risolvere per supposizione

Il task allegato chiama il prodotto “statsIQ” e cita React/Vite, `bsdClient.ts` e `/lib/lines`; nell’albero disponibile non esistono tali file. L’app reale presente qui è LineaX, Next.js, e la discovery è stata autorizzata usando la configurazione server-side già esistente, senza esporre il token. Prima di portare gli output del Compito A verso codice di prodotto, confermare il repository/modulo di destinazione: non creare integrazioni in una posizione dedotta.

La skill `coding-principles` richiesta per la calibrazione non risultava installata nella sessione. Per questa fase non è stato scritto codice; per una fase con script applicare comunque principi equivalenti (responsabilità singola, input validati, nessun segreto/log sensibile, error handling e output riprendibili) e segnalare l’assenza della skill se persiste.

## Recupero storico — decisioni che non devono più andare perse

### Mandato e confini non negoziabili

- LineaX è un prodotto di data intelligence calcistica pre-match, enterprise, mobile-first, scalabile e manutenibile; non è una piattaforma di scommesse.
- Mai inventare dati, fonti, indisponibilità o analisi. Un valore assente va dichiarato assente, non stimato in silenzio.
- Ogni cifra mostrata richiede fonte, timestamp e freshness; i calcoli proprietari sono etichettati `LineaX model`, quelli provider `Data Opta`.
- Vietati link affiliati, CTA bookmaker, istruzioni di stake e linguaggio di certezza. Le quote restano indicatori informativi con rischio, limiti, timestamp e incertezza.
- Token provider, Groq, Stripe secret e Supabase service-role restano solo server-side. Supabase/RLS protegge i dati utente; logica privilegiata solo in Node server-side o backend controllato.
- Prima di una modifica: valutare impatto architettura, database, API, UX/UI, sicurezza e verifica; fare la modifica minima ma completa, senza duplicare logica di dominio.

### Prodotto, dati e AI

- Provider UI: soltanto **Data Opta**; il nome tecnico o token non appaiono nel browser o nella UI.
- API football v2 è canonica. v1, `internal`, altri sport e add-on a pagamento restano fuori dallo scope di lancio.
- Infortuni, indisponibili, probabili e ufficiali formazioni derivano da `events/{id}/lineups/`, non da `incidents`.
- Il chatbot Groq futuro è match-scoped: usa solo dati LineaX recuperati, con citazioni, output strutturato e guardrail contro fatti non disponibili.
- Il perimetro richiesto include Home, Match Center, expected stats premium, analisi AI, database squadre/giocatori, Smart Filter, alert, chatbot, premium e admin. Il dettaglio vincolante è in `PRODUCT_SCOPE.md`.

### Piattaforma e business

- Client di lancio: PWA web. Native iOS/Android è un’opzione futura; italiano prima, inglese/spagnolo dopo.
- Stack attivo: Next.js App Router, TypeScript, React 19 e Node.js in `apps/lineax-web`; l’app precedente Flutter rimane preservata in `apps/lineax`, ma non è il client attivo.
- Supabase è sistema di record per Auth, database, RLS, cache/catalogo ed entitlement; controllare dashboard/stato reale prima di dichiarare una migrazione eseguita.
- Piani approvati: prova da €1 per 8 giorni senza rinnovo, Insight €6,90/mese, Pro €12,90/mese, annuale €109,90/anno. Stripe Checkout/Customer Portal/webhook firmato restano da implementare nel boundary Node con Price ID verificati.

### Provider e asset

- `DATA_OPTA_ENDPOINT_CATALOG.md` raccoglie 64 endpoint REST v2 verificati e cinque endpoint immagine: `/img/team/{id}/`, `/img/league/{id}/`, `/img/player/{id}/`, `/img/manager/{id}/`, `/img/venue/{id}/`.
- Immagini reali di stadio, club, giocatori e manager arrivano dal provider. Un fallback generico è ammesso solo se dichiarato editoriale neutro e mai attribuito falsamente alla gara o entità.
- Il gateway rimane server-side; gli eventi reali sono paginati con `results`, non con array diretto.

### Direzione visiva e lezione operativa

- Il primo prototipo Figma e la grafica “AI dashboard” fredda/robotica sono stati rifiutati. Non usare Figma per imporre una nuova direzione.
- Baseline desiderata: mobile scura, cinematografica e editoriale; fotografia reale venue nel hero quando disponibile; gara protagonista, competizione, luogo, contesto verificato, tecnici, programma e moduli tecnici solo quando i dati sono reali.
- La palette prevista è navy quasi nero, vermiglio, blu e oro/avorio controllato; non costruire pile di card equivalenti.
- In precedenza sono state promesse pagine prima della verifica reale: non ripetere. Mostrare URL, build e controllo browser solo dopo avere un risultato funzionante.

## Stato del refactor UI, non approvato

L’utente ha respinto la composizione grafica e i font dei tentativi precedenti. Non descrivere l’interfaccia attuale come approvata, finale o pronta al rilascio.

Il piano strutturale, già richiesto e approvato come piano, è la fonte di verità:

- `tasks/plan.md`
- `tasks/todo.md`

Decisioni da attuare, non ancora implementate:

- Home = edizione quotidiana con una gara in evidenza, segnali reali disponibili e programma; non Match Center ridotto.
- Match Center = dossier progressivo: identità, contesto, confronto, storico e formazioni, con fonte/freshness e sezioni assenti senza dati.
- `Partite`, `Analisi`, `Statistiche` diventano route autonome solo con contratto dati/readd model reale. Vietati link o ancore fittizie.
- Prima shell, navigazione e primitive condivise; poi Home e Match Center. Non aggiungere un terzo layer CSS di override.
- Sostituire Georgia e serif di fallback. Geist resta per dati/controlli; la famiglia display va scelta dall’utente prima del Task 1: **sans editoriale contemporanea** oppure **display serif moderno e controllato**.

### File UI presenti e cautele

| File/modulo | Stato recuperato |
| --- | --- |
| `apps/lineax-web/app/page.tsx` | Home ristrutturata nei tentativi visuali; da ricomporre secondo piano, non rifinire marginalmente. |
| `apps/lineax-web/components/match-center.tsx` | Match Center con sezioni condizionali e provenienza; da ricomporre come dossier nel Task 4. |
| `apps/lineax-web/lib/data-opta.ts` | `MatchCenterContext` esteso con `venueImageUrl`, risolto server-side; nessun token client. |
| `apps/lineax-web/app/globals.css` | Contiene stili sperimentali; Task 2 deve consolidare token/shell prima di rifare le pagine. |
| `tasks/plan.md`, `tasks/todo.md` | Piano e checklist del refactor UI. |

Nel repository annidato `apps/lineax-web` risultano modificati `.gitignore`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `next.config.ts`, `package*.json` e vari moduli non tracciati (`app/account`, `app/api`, `app/auth`, `app/match`, `components`, `lib`, `proxy.ts`, immagini pubbliche). Trattarli come worktree esistente: non usare `git reset --hard`, `git checkout --` o `git clean`.

## Verifiche già eseguite

- Dopo l’ultimo tentativo UI, in `apps/lineax-web` hanno passato `npm run lint` e `npm run build`.
- Browser mobile 390×844 verificato con dati reali su Home e Match Center: niente console error, overlay di errore, overflow orizzontale o immagini rotte; navigazione Home → Match Center funzionante; moduli senza dati reali nascosti. È una verifica tecnica, non estetica.
- Nella discovery attuale, le API sono state chiamate in sola lettura, i file JSON sono parseabili e le credenziali non sono state registrate negli artefatti.

## Puntatori esatti per la prossima ripresa

### 1. Priorità immediata, fuori roadmap — checkpoint calibrazione

`tasks/calibrazione-dispersione.md` → **Compito 0** → checkpoint dopo `scripts/calibration/discovery/NOTES.md`.

Stato: note presentate, attesa la conferma utente della policy `stats/` + `offsides: null`. Solo dopo: **Compito A — Harvester dataset**, senza saltare i checkpoint successivi A → B → C → D e senza toccare l’app produzione.

### 2. Puntatore esatto ROADMAP — refactor UI LineaX

`ROADMAP.md` → **Milestone 1 — Local PWA foundation** → primo punto: “Next.js PWA shell, editorial UI tokens, routing and localization shell.”

Task esecutivo: `tasks/plan.md` → **Task 1: Contratto di navigazione e tipografia**. È bloccato dalla scelta tipografica dell’utente e richiede prima la skill UI; poi Task 2 → checkpoint fondazioni → Task 3 Home e Task 4 Match Center. Non costruire route secondarie prima dei rispettivi read model.

## Runbook e skill alla ripresa

- Radice progetto: `C:\Users\utente\Documents\Codex\2026-07-20\lineax-development-os-da-questo-momento-4`
- App attiva: `apps/lineax-web`
- Avvio locale: `npm run dev -- -p 3100`
- URL: `http://localhost:3100`; health: `http://localhost:3100/api/health`
- Per codice Next.js: leggere prima `apps/lineax-web/AGENTS.md` e la guida pertinente in `node_modules/next/dist/docs/`, poi usare `vercel:nextjs`; dopo modifiche TSX multiple usare `vercel:react-best-practices`.
- Per UI: `/ui-ux-designer` o `ui-ux-pro-max`, con preview mobile reale prima della consegna.
- Per calibrazione: `planning-and-task-breakdown` per l’ordine interno e comportamento a checkpoint “grilling”: presentare evidenze e una sola decisione aperta, attendendo conferma.
- Non chiedere né scrivere segreti. Non esporre token in browser, patch, log, documenti o commit.
