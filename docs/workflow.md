# Workflow operativo di IQstatS

## Obiettivo

Questo workflow coordina nello stesso progetto quattro linee di lavoro: mappatura del
prodotto di riferimento, contratti API, calibrazione dei modelli e costruzione della UI.
Serve a evitare pagine senza dati reali, dati non spiegabili e integrazioni dirette tra
provider e browser.

## Percorso obbligatorio

```text
Riferimento funzionale e MVP
        ↓
Discovery API e contratto normalizzato
        ↓
Checkpoint umano sui dati
        ├── Workstream calibrazione
        │       ↓ dataset → QA → dispersione → backtest
        └── Workstream prodotto
                ↓ IA → design system → shell → vertical slice → dossier
        ↓
Verifica tecnica, UX e trasparenza dei dati
```

## Fase 0 — orientamento e decisione

1. Leggere `AGENTS.md`, questo workflow e `tasks/plan.md`.
2. Leggere `docs/product/mvp-spec.md`, `reference-map.md` e
   `information-architecture.md`.
3. Usare BioFootballBet soltanto per osservare gerarchie e casi d'uso pubblici. Non
   copiare implementazione, asset, formule, testi o naming proprietario.
4. Scrivere una decisione soltanto quando modifica scope, contratto o design system.

**Gate:** l'MVP, la fonte dati e la sezione da realizzare sono espliciti.

## Fase 1 — API prima della UI

Per ogni funzionalità, creare una scheda di contratto contenente:

```text
domanda utente → endpoint/fixture → schema IQstatS → missingness/freshness
→ calcolo derivato → stato UI → verifica
```

La matrice canonica APP-0 è
`docs/architecture/mvp-data-contract-matrix.md`. Un dominio marcato `non-mappato`
non autorizza chiamate provider o contenuto UI: richiede una discovery mirata e una
fixture sanificata oppure una riduzione esplicita dello scope.

La discovery APP-0D è registrata in
`scripts/app-discovery/output/2026-08-01/REPORT.md`. Per le quote sono disponibili
prezzo corrente, osservazione precedente, ultimo movimento e timestamp per singolo
record; apertura e chiusura non sono campi espliciti e restano indisponibili. Non
dedurre una chiusura dall'ultimo prezzo di una gara conclusa.

1. Esplorare la rotta con credenziali solo server-side.
2. Salvare fixture sanificate e documentare paginazione, filtri, assenze e status.
3. Convertire il payload in un tipo interno, con `source`, `capturedAt`,
   `missingFields` e, per i calcoli, `formulaVersion` e `sampleSize`.
4. Esporre al client solo l'API IQstatS: mai l'header o il payload provider grezzo.

**Regola attuale verificata:** gli eventi usano `league_id`; `league` non è un filtro
affidabile. Consultare `scripts/calibration/discovery/NOTES.md` prima di nuovo codice
di acquisizione.

## Fase 2 — checkpoint della calibrazione

Il workstream calibrazione è rigorosamente sequenziale:

```text
CAL-0 discovery → conferma umana → CAL-1 harvester → conferma umana
→ CAL-2 QA dataset → conferma umana → CAL-3 dispersione
→ conferma umana → CAL-4 backtest e contesto
```

**Checkpoint calibrazione (aggiornato il 1 agosto 2026):** CAL-3 e tutti i blocchi CAL-4 sono
completati. Il sanity Serie A non ha trovato metriche sospette; il backtest
distributivo ha valutato 310/310 righe metrica/granularità senza quote o informazione
futura. Lo snapshot `2026-07-23` sostiene 445 contesti team: 214 indici di stabilità,
109 cambi allenatore osservati e 61 shift tattici; i restanti casi sono `null` con
motivo quando copertura o point-in-time non bastano. Quindici leghe hanno baseline
neopromosse disponibili; otto sono escluse, inclusa la lega 23 per overlap team ID
interstagionale nullo. Le 155 baseline CAL-3 sono state preservate. Gli artefatti
generati conservano `allowedForAppIntegration=false` ed
`expectedAdjustmentAllowed=false` come stato storico. Il 1 agosto 2026 il gate umano
ha autorizzato APP-0 e APP-1 con un futuro consumo esclusivamente
server-side; `expectedAdjustmentAllowed` resta `false` e nessun output di calibrazione
è ancora integrato nell'app.

**Checkpoint APP-1 soddisfatto il 1 agosto 2026:** matrice e discovery mirata sono
approvate. Il package condiviso normalizza lista/dettaglio, statistiche osservate,
classifica, forma compatta W/D/L, H2H e quote corrente/precedente/movimento con
copertura esplicita. Apertura, chiusura e forma dettagliata restano indisponibili senza
ricostruzioni. Il package non è collegato all'app; il prossimo gate è APP-2, gateway e
API esclusivamente server-side.

**APP-2 autorizzato il 1 agosto 2026:** il contratto eseguibile è
`docs/architecture/app-2-gateway-contract.md`. Sono autorizzati gateway e Route Handler
server-side con fixture e test; restano esclusi collegamento alla UI, persistenza,
harvesting e integrazione degli output CAL-4.

**Checkpoint APP-2 soddisfatto il 1 agosto 2026:** sette route dinamiche IQstatS sono
implementate e verificate; il match `7198` percorre fonte → normalizzatore → API app
con contratto generico e senza segreti client. Apertura, chiusura e forma dettagliata
restano indisponibili. APP-3 è il prossimo gate per cache/persistenza; prima di un
deploy, auth e vulnerabilità npm erano ancora aperte al checkpoint APP-2 ma sono state
chiuse nei checkpoint verificati del 2 agosto 2026.

**Checkpoint APP-3D / DATA-0 del 9 agosto 2026:** l'utente ha confermato la
strategia locale → checkpoint → Supabase IQstatS, lo scope sui campionati maschili
regolari supportati e la stagione corrente osservata nel 2026/27. Le competizioni a
calendario annuale seguono il flag di stagione corrente della fonte; lo storico CAL-*
resta confinato al backtest. Il contratto proposto definisce schema server-only,
freschezza adattiva, retention, batch upsert e slice DATA-0…DATA-5 in
`docs/architecture/app-3d-football-data-platform-contract.md`. DATA-0 è stato eseguito
entro l'autorizzazione: 50 GET completate, zero scritture, 36 campionati con stagione
corrente e 10.361 gare dichiarate. Il perimetro fresco include 21 stagioni 2026/27 e 12
calendar-year 2026; 3 finestre correnti restano sospese. Il nucleo relazionale è stimato
in 20,2–60,7 MiB. La migrazione e l'ingest remoti conservano un checkpoint separato su
schema, volumi, tempi e costi; il prossimo incremento locale è DATA-1.

**Checkpoint locale DATA-1 del 9 agosto 2026:** schema, indici, RLS, coda, read model e
batch upsert sono formalizzati nelle due migrazioni DATA-1. Dopo l'installazione
autorizzata di WSL, Docker Desktop e CLI Supabase, reset, smoke, privilegi, advisor,
benchmark su 10.361 gare e test replay/update fuori ordine sono superati con rollback.
Normalizzatore e runner passano 8 test; il piano offline stima 86–171 GET, con cap
proposto di 200 e massimo 2 richieste/secondo sui 33 campionati freschi. Il database
locale resta vuoto: il prossimo checkpoint è l'approvazione delle letture necessarie
all'ingest reale locale. Nessuna migrazione o lettura del database remoto è stata
eseguita.

**Checkpoint DATA-1 locale completato il 9 agosto 2026:** l'ingest reale e il resume
locale hanno usato 101/200 GET complessivi al massimo di due richieste al secondo,
senza scritture al provider, accessi al database remoto o persistenza di payload raw.
Il perimetro conserva 33 stagioni fresche e 3 in hold; tutte le stagioni fresche hanno
gare normalizzate e l'integrita' locale non presenta duplicati o relazioni incoerenti.
La copertura classifiche e' parziale e dichiarata: 21 complete, 11
vuote/incomplete e una assente. Il report sanificato e' in
scripts/app-ingestion/output/2026-08-09/DATA-1-RECONCILIATION-20260809T085116Z.json.
DATA-2, APP-6A e il database remoto restano fuori scope.

**Checkpoint MIG-1 del 2 agosto 2026:** autorizzato il progetto Supabase Free
`iqStats`; zero utenti e zero righe legacy verificati prima della bonifica. La
fondazione IQstatS contiene profili, quattro piani, sette feature, clienti billing,
subscription, entitlement, eventi idempotenti e rate limit distribuito. RLS, grants,
test transazionali e Security Advisor sono puliti. Il gateway provider resta
stateless, `no-store` e TTL 0. AUTH-1 ed ENT-1 sono tecnicamente completati: l'E2E
autenticato ha verificato cookie SSR, negazione anonima, matrice Insight/Pro, logout e
pulizia remota a zero dati sintetici. BILL-1 è chiusa in Stripe test mode: quattro
prodotti/prezzi sono riconciliati idempotentemente e i riferimenti sono mappati soltanto
in Supabase. BILL-2 ha superato la verifica locale con eventi firmati, replay,
upgrade/downgrade, revoca, cancellazione e tentativo cross-user; la proprietà delle
subscription è ora immutabile anche nel database. La chiave Stripe live locale resta
vietata e nessuna risorsa live è stata usata.

**Checkpoint BILL-1/BILL-2 soddisfatto il 2 agosto 2026:** il binario Stripe CLI è
stato associato dal flusso ufficiale Chrome, verificato con credenziale test e usato
per inoltrare un evento fixture al Route Handler locale. Listener e applicazione hanno
entrambi osservato HTTP 200; il signing secret del listener è stato sincronizzato in
`.env.local` senza stamparlo. La suite firmata completa è rimasta verde dopo la
rotazione e la pulizia Supabase ha confermato zero artefatti temporanei. Nessuna risorsa
live è stata usata.

**Checkpoint BILL-3 dell'8 agosto 2026:** la pagina Billing mobile-first è pubblicata
in production insieme alla Edge Function `create-checkout-session` con JWT obbligatorio.
Il catalogo viene esposto agli utenti solo tramite RPC con campi consentiti e il grant
diretto su `plans` è stato rimosso; prezzo e chiave Stripe restano lato server e Stripe
rimane in test mode. Il deploy production ha completato build e TypeScript; lo smoke
ha osservato HTTP 200 sulla pagina Billing e rifiuto JWT della funzione, senza creare
Checkout Session, eventi Stripe o retry. Il webhook esistente non è stato modificato.
L'E2E autenticato di pagamento resta un checkpoint umano separato.

**Checkpoint QF-1 dell'8 agosto 2026:** aggiornati i pacchetti compatibili Next.js,
React e Supabase, la toolchain è ricostruita dal lockfile e l'audit locale non riporta
vulnerabilità. `next typegen`, typecheck, lint, test Gateway/Auth/Billing e build
production sono verdi. La nuova versione di `create-checkout-session` mantiene JWT
obbligatorio e Stripe test mode; il deploy Vercel production e lo smoke browser della
pagina Billing hanno superato rispettivamente HTTP 200 e zero errori console, mentre
la chiamata Edge senza JWT è stata rifiutata con HTTP 401. Nessun Checkout, cliente,
evento o retry Stripe è stato creato; webhook invariato e token Vercel temporanei
revocati. Resta separato l'E2E autenticato che crea una Checkout Session Stripe test.

**Checkpoint E2E BILL-3 del 9 agosto 2026:** autorizzazione umana ricevuta. Il primo
preflight autenticato ha rilevato che `getClaims()` non consumava il bearer token
ES256; nessuna risorsa Stripe era stata creata. La funzione è stata corretta passando
il JWT esplicitamente, verificata con typecheck, lint e test Billing e ripubblicata con
JWT obbligatorio. Un solo Checkout di prova una tantum è stato completato e pagato in
Stripe test mode; il ritorno alla pagina Billing è riuscito senza errori, il webhook
preesistente è rimasto byte-per-byte invariato, ha processato l'evento test e ha
prodotto sette entitlement attivi. Il cleanup non era autorizzato e le risorse test
del checkpoint restano presenti.

- Tutto vive in `scripts/calibration/`.
- `stats/` è la fonte canonica; `offsides` assente resta `null`.
- Le baseline non mescolano mai `league_id` diversi.
- Dataset, raw payload, manifest e risultati devono essere riprendibili e auditabili.

## Fase 3 — architettura informativa e design

Prima di una pagina o di una modifica visuale:

1. Verificare che la pagina esista nella gerarchia in
   `docs/product/information-architecture.md` e che abbia un contratto dati.
2. Applicare `ui-ux-pro-max`: leggere il master, cercare o creare un override della
   pagina e usare la checklist UX prima della consegna.
3. Definire ordine mobile, ordine desktop, URL/deep link, stato attivo, loading, empty,
   error e assenza dati prima del JSX.
4. Implementare una slice verticale completa, non tutte le card o tutte le API insieme.

La ricerca `ui-ux-pro-max` è disponibile nel runtime locale con Python ed è stata
eseguita per UX-0 il 2 agosto 2026. Il master e gli override documentano contrasto
WCAG, touch target ≥44 px, mobile-first, massimo cinque voci di navigazione primaria,
focus visibile, no overflow orizzontale e reduced motion. Se Python non fosse
disponibile in una sessione futura, applicare queste stesse regole come fallback senza
presentarlo come approvazione estetica definitiva.

## Fase 4 — slice di prodotto

L'ordine di costruzione è:

1. Shell, navigazione e token comuni.
2. `/partite`: filtro e lista con dati reali o stato esplicito.
3. `/match/[matchId]`: testata, riepilogo e trasparenza fonte.
4. Una famiglia di statistiche per volta, solo dopo il read model corrispondente.
5. Database entità e segnali solo dopo che la navigazione verso la gara mantiene il
   contesto e i filtri.

Ogni slice richiede lint/build, test proporzionati e controllo a 375, 768, 1024 e
1440 px. Per UI verificare anche tastiera, contrasto, stati asincroni e riduzione del
movimento.

**Checkpoint UX-1 del 2 agosto 2026:** UX-0, shell e override `/partite`/`/match` sono
verificati. La slice stateless usa esclusivamente le API IQstatS, non il provider e non
usa fallback demo; a 375, 768, 1024 e 1440 px non ha overflow orizzontale. Accesso,
assenza, rate limit e indisponibilità sono stati espliciti. Il percorso felice
autenticato `/partite → /match/[matchId]` è verificato con una gara autorizzata,
envelope normalizzati `no-store`, contesto di ritorno e pulizia dei dati temporanei.
APP-4 e APP-5 sono chiuse; APP-3 non è stato avviato.

## Checkpoint e regola di arresto

Fermarsi e chiedere conferma quando:

- la discovery o la QA espone una decisione che influenza dati/modello;
- una nuova sezione richiede dati non mappati;
- un cambiamento modifica gerarchia, direzione visiva o scope MVP;
- una credenziale, una persistenza o un'azione esterna richiede nuova autorità.

Non fermarsi per dettagli implementativi normali: documentare l'evidenza, applicare il
contratto esistente e verificare il risultato.
