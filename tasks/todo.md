# Backlog verificabile — IQstatS

## Stato attuale

- [x] **CAL-0 — Discovery API.** Artefatti e note sanificate creati.
- [x] **Gate CAL-0 — Conferma umana.** Policy di harvesting approvata.
- [x] **CAL-1 — Harvester dataset.** Raccolta completa e verificata; checkpoint
  umano richiesto prima di CAL-2.
- [x] **CAL-2 — QA dataset.** Report qualità completato; il checkpoint umano
  precedente CAL-3 è stato soddisfatto.
- [x] **Gate CAL-2 — Conferma umana.** CAL-3 autorizzato il 22 luglio 2026 con le
  155 combinazioni lega/metrica ammesse e i caveat delle due Liga MX.
- [x] **CAL-3 — Dispersione e baseline.** Analisi completa e verificata sulle
  combinazioni ammesse dal QA.
- [x] **Gate CAL-3 — Conferma umana.** CAL-4 autorizzato il 22 luglio 2026.
- [x] **CAL-4A — Sanity e backtest.** Validazione locale, temporale e senza leakage
  delle dispersioni candidate.
- [x] **CAL-4B — Dataset contesto.** Acquisizione server-side riprendibile di eventi,
  rose, trasferimenti e allenatori entro un contratto point-in-time esplicito.
- [x] **CAL-4C — Indici contesto.** Stabilità, shift tattico e baseline neopromosse,
  senza modificare gli expected.
- [x] **Gate CAL-4 — Conferma umana.** Il 1 agosto 2026 sono stati autorizzati
  APP-0 e APP-1 con consumo CAL-4 solo server-side;
  `expectedAdjustmentAllowed` resta `false`.
- [x] **APP-0 — Matrice contratti MVP.** Matrice e discovery approvate dall'utente il
  1 agosto 2026 con opening, closing e forma dettagliata indisponibili.
- [x] **APP-0D — Discovery mirata MVP.** Lista/dettaglio, quote, forma, classifica e
  H2H verificati su due gare con 28 richieste complessive e nessuna modifica app.
- [x] **APP-1 — Contratti condivisi.** Tipi e normalizzatori puri verificati su
  fixture sanificate; APP-2 li consuma ora soltanto dal layer server dell'app.
- [x] **APP-2 — Gateway/API server-side.** Completato e verificato il 1 agosto 2026;
  UI, persistenza e integrazione CAL-4 restano escluse.
- [ ] **APP-3D — Piattaforma dati calcistica corrente.** Strategia locale → checkpoint
  → Supabase confermata; contratto proposto per campionati regolari supportati e
  stagione corrente 2026/27, con storico separato per backtest.
- [x] **MIG-0 — Inventario LineaX autorizzato.** Contratto di migrazione selettiva
  Auth/billing definito senza scritture remote e senza importare il proxy/cache legacy.
- [x] **MIG-1 — Fondazione Supabase IQstatS.** Progetto Free esistente selezionato,
  legacy vuoto bonificato e fondazione commerciale migrata con RLS/grants espliciti.
- [x] **AUTH-1 — Supabase SSR.** Cookie SSR, callback PKCE, session refresh, sign-out
  e route protette completati; E2E autenticato passato con pulizia remota a zero dati
  sintetici.
- [ ] **AUTH-2 — Accesso utente visibile.** La dashboard anonima non richiede più ID
  tecnici; `/accedi` collega la sessione con un codice email verificato lato server.
- [x] **BILL-1 — Catalogo Stripe IQstatS.** Quattro prodotti/prezzi riconciliati in
  test mode, mappati in Supabase e ricontrollati con lo script idempotente; nessuna
  chiave o risorsa live usata.
- [x] **BILL-2 — Checkout e webhook.** Runtime e test firmati completati per replay,
  upgrade/downgrade, revoca, cancellazione, ordine eventi e cross-user; consegna reale
  da Stripe CLI test osservata con HTTP 200.
- [x] **BILL-3 — UI Billing e Checkout Edge.** Funzione con JWT esplicito pubblicata;
  un Checkout autenticato Stripe test è stato completato con ritorno, webhook invariato
  e sette entitlement attivi.
- [x] **QF-1 — Chiusura qualitativa Checkout.** Dipendenze compatibili, audit,
  verifiche locali e smoke non transazionali conclusi prima dell'E2E finale.
- [x] **ENT-1 — Funzionalità per piano.** Matrice dei quattro piani ed enforcement
  lato server verificati con smoke autenticato cross-plan Insight/Pro.
- [x] **UX-0 — Direzione visiva.** Master validato con `ui-ux-pro-max`; ricerca locale,
  contrasto, focus, touch target, navigazione e reduced motion documentati negli
  override `/partite` e `/match`.
- [ ] **ENG-1 — Motore statistico.** Contratto in
  `docs/architecture/eng-1-statistical-engine-contract.md`. **Livello dati completato e
  verificato il 13 agosto 2026:** seed storico di 7.526 gare unito ai team id a zero GET,
  harvest della stagione corrente entro il cap approvato (409 GET nel run finale, 714 gare,
  zero gare senza statistiche), rating attacco/difesa per 460 squadre in 23 leghe.
  Sanity contro la classifica reale del Brasileirao superato. **Livello applicativo
  completato il 13 agosto 2026:** `apps/web/src/server/iqstats/stat-engine.ts` (server-only,
  PMF Binomiale Negativa con `lgamma` di Lanczos, fallback Poisson dalla soglia
  dell'artefatto, granularita' team/match separate, fail-closed) e sezione "Giocate
  statistiche" nel dossier `/match/[id]` con le soglie di sezione. Typecheck, lint e 9/9
  self-test verdi; smoke HTTP reale su `/match/7213` (stagione corrente) e `/match/1452`
  (dati stagione precedente). **Resta il checkpoint umano: QA visuale a
  375/768/1024/1440 px e decisione su `/pronostici`.**

## APP-0: Matrice dei contratti MVP

**Descrizione:** collegare ogni sezione MVP a endpoint, schema interno, freschezza,
missingness e stato UI.

**Criteri di accettazione:**

- [x] Dashboard, dettaglio, quote, statistiche, contesto e metodo hanno un read model
  tracciato con stato di evidenza.
- [x] Ogni campo dichiara fonte, timestamp, comportamento di assenza e, quando
  pertinente, campione e versione della formula.
- [x] Gli output CAL-4 restano server-side, non correggono gli expected e preservano
  `null` e motivi di indisponibilità.
- [x] Quote, forma, classifica e H2H hanno fixture sanificate; opening/closing e forma
  dettagliata restano indisponibili perché non esposti esplicitamente.

**Verifica:** confronto read-only di specifica, architettura, codice esistente, fixture
CAL-0 e output CAL-4 registrato in
`docs/architecture/mvp-data-contract-matrix.md`, più audit APP-0D in
`scripts/app-discovery/output/2026-08-01/REPORT.md`; checkpoint umano approvato il
1 agosto 2026.

**Dipendenze:** CAL-0, Gate CAL-4.  
**File probabili:** `docs/architecture/*`, `packages/shared/*`, `tests/fixtures/*`.  
**Scope:** M.

## APP-1: Contratti condivisi e normalizzazione

**Descrizione:** creare tipi IQstatS per fixture, availability, odds snapshot e team
stats senza esporre lo schema del provider.

**Criteri di accettazione:**

- [x] I tipi compilano in strict mode e distinguono `null`, dato assente e fallback.
- [x] I metadati `source`, `capturedAt`, `missingFields` e `formulaVersion` sono
  disponibili quando pertinenti.
- [x] Quote incomplete dichiarano copertura parziale; `event_id` esterni non diventano
  chiavi client; apertura, chiusura e forma dettagliata restano indisponibili.

**Verifica:** type-check strict e sette test di normalizzazione passati il 1 agosto
2026 usando fixture sanificate già acquisite, senza rete né modifiche all'app.

**Dipendenze:** APP-0.  
**File probabili:** `packages/shared/*`, `tests/*`.  
**Scope:** M.

## APP-2: Gateway e API dell'app

**Descrizione:** implementare adapter server-side, validazione input e errori
normalizzati per le prime rotte IQstatS.

**Contratto eseguibile:** `docs/architecture/app-2-gateway-contract.md`.

**Criteri di accettazione:**

- [x] Nessuna credenziale o header provider arriva al browser.
- [x] Errori, timeout e paginazione hanno un contratto esplicito.
- [x] Sette route IQstatS normalizzano catalogo, lista/dettaglio, quote, statistiche,
  classifica e H2H senza collegare la UI.

**Verifica:** type-check gateway, lint, build pulita, 8/8 test gateway, smoke errori
compilato, scansione chunk client e smoke live del match `7198` passati. Dettagli e
limiti di rilascio in `docs/architecture/app-2-gateway-contract.md`.

**Dipendenze:** APP-1.  
**File probabili:** `apps/api/*`, `apps/web/src/app/api/*`, `tests/*`.  
**Scope:** M.

## APP-3D: Piattaforma dati, freschezza e ingest

**Descrizione:** definire e verificare la piattaforma dati calcistica della stagione
corrente prima di qualunque scrittura remota. Il contratto eseguibile è
`docs/architecture/app-3d-football-data-platform-contract.md`.

**Decisioni confermate il 9 agosto 2026:**

- progettazione, migrazione e smoke prima in locale;
- destinazione remota sul progetto Supabase IQstatS esistente soltanto dopo checkpoint;
- campionati maschili regolari supportati e stagione corrente osservata nel 2026/27;
- competizioni a calendario annuale incluse tramite il flag corrente della fonte;
- storico già raccolto confinato al workstream di backtest CAL-*;
- APP-6A successiva a gare/classifiche e statistiche database-backed verificate.

**Criteri di accettazione:**

- [x] DATA-0 inventaria in sola lettura catalogo, stagioni correnti, endpoint,
  paginazione e volumi entro il tetto approvato.
- [ ] Gare, classifiche, statistiche, quote e contesto hanno grana, chiavi, freschezza,
  stale policy, retention e missingness distinti.
- [x] Lo schema locale usa contratti normalizzati, batch upsert, deduplicazione,
  protezione dagli update fuori ordine e code riprendibili.
- [x] Le query dashboard/dossier hanno indici verificati; client e ruoli autenticati
  non accedono direttamente alle tabelle di ingest.
- [ ] Report di volume e test locali ricevono conferma umana prima di migrazione o
  caricamento remoto.

**Verifica:** report DATA-0 sanificato; migrazione su database locale vuoto; test di
vincoli, FK, privilegi e replay; `EXPLAIN (ANALYZE, BUFFERS)` sulle query primarie;
smoke limitato, resume e riconciliazione fonte → contratto → database.

**Esito DATA-0 del 9 agosto 2026:** 50/50 GET completate, zero scritture remote, 145
operazioni GET inventariate e 15 domini sondati senza persistere payload o identificativi
remoti. La policy contiene 36 campionati: 33 sono già nel perimetro fresco, 3 restano
in hold per rollover/conferma. Le finestre osservate dichiarano 10.361 gare; nucleo
relazionale e indici stimati in 20,2–60,7 MiB. Report:
`scripts/app-ingestion/output/2026-08-09/DATA-0-REPORT.md`.

**Avanzamento DATA-1 del 9 agosto 2026:** le due migrazioni locali, il normalizzatore e
il batch server-only sono verificati. Contratto runtime: 8 tabelle dati, 2 tabelle
private, 19 indici, RLS su 10 tabelle, 2 viste invoker-safe e nessun grant client. Reset,
10.361 gare sintetiche, replay idempotente, update fuori ordine, snapshot change-only,
quattro piani e claim concorrente passano con rollback. Gli 8 test Node e il piano
offline passano; il runner propone 86–171 GET, cap 200 e 2 richieste/secondo per i 33
campionati freschi. DATA-1 resta aperto per ingest, resume e riconciliazione reali; il
database remoto non è stato letto né modificato.

**Dipendenze:** APP-2.  
**Esito DATA-1 del 9 agosto 2026:** ingest e resume reali locali completati entro 101/200
GET complessivi e senza accesso al database remoto. Le 33 stagioni fresche hanno gare
normalizzate; le classifiche mancanti o incomplete restano una limitazione di copertura
esplicita. Integrita' di chiavi, relazioni e righe riconciliata senza duplicati.
Report: scripts/app-ingestion/output/2026-08-09/DATA-1-RECONCILIATION-20260809T085116Z.json.
DATA-2 e APP-6A restano non avviati.
**File probabili:** `docs/architecture/*`, `infra/supabase/*`,
`scripts/app-ingestion/*`, `packages/shared/*`, `apps/web/src/server/iqstats/*`,
`tests/*`.  
**Scope:** M per ogni slice DATA-0…DATA-5; nessun blocco XL indivisibile.

## MIG-0: Inventario e contratto di migrazione

**Descrizione:** recuperare selettivamente decisioni, schemi e configurazioni
Supabase/Stripe dal progetto LineaX autorizzato, adattandoli ai contratti IQstatS.

**Criteri di accettazione:**

- [x] Artefatti locali e stato remoto disponibile sono distinti da assunzioni non
  verificabili.
- [x] Coupling, branding e cache provider LineaX sono esclusi dalla prima migrazione.
- [x] Contratto dati, RLS, Stripe, verifiche e gate sono documentati in
  `docs/architecture/lineax-to-iqstats-migration.md`.

**Verifica:** inventario read-only; progetto Supabase rilevato ma inattivo e schema
non dichiarato migrato; connessione Stripe rilevata ma da riautenticare; nessuna
scrittura remota.

**Dipendenze:** autorizzazione esplicita dell'utente ricevuta il 1 agosto 2026.  
**Scope:** S.

## MIG-1: Fondazione Supabase IQstatS

**Descrizione:** creare una destinazione IQstatS isolata e migrazioni ripetibili per
profilo, piano, cliente billing, subscription, entitlement ed eventi webhook.

**Criteri di accettazione:**

- [x] SQL versionato con vincoli, indici, privilegi e RLS espliciti.
- [x] Owner access verificato; scritture billing riservate al server.
- [x] Nessun catalogo/cache provider o dato LineaX importato.

**Verifica:** ambiente di sviluppo, test ruoli, advisors sicurezza/performance e
generazione tipi; checkpoint umano prima della destinazione di produzione.

**Dipendenze:** MIG-0, scelta/costo progetto approvati.  
**Scope:** M.

## AUTH-1: Supabase SSR

**Descrizione:** integrare Supabase Auth nell'app con cookie SSR, PKCE e session refresh
senza esporre segreti o modificare ancora la UI di prodotto.

**Criteri di accettazione:**

- [x] Client browser e server distinti; service role mai importata dal client.
- [x] Callback, sign-out e proxy gestiscono sessione e cache privata/no-store.
- [x] Route protette verificano identità e negano accesso anonimo.

**Verifica:** test auth locali, scadenza/callback/logout, lint, typecheck, build e
scansione bundle.

**Dipendenze:** MIG-1.  
**Scope:** M.

## AUTH-2: Accesso utente visibile

**Descrizione:** rendere utilizzabile il confine Auth già implementato, distinguendo
sessione anonima, piano non abilitato e indisponibilità della fonte prima del form gare.

**Criteri di accettazione:**

- [x] Lo stato anonimo spiega la causa e conduce a `/accedi?next=/partite`.
- [x] Il catalogo assente non degrada a un campo numerico `leagueId`.
- [x] Il form passwordless invia l'email soltanto dopo conferma esplicita, verifica un
  codice OTP a 6 cifre lato server e limita il ritorno a percorsi locali.
- [x] I template remoti “Magic link or OTP” e “Confirm sign up” usano `{{ .Token }}` e
  non contengono `{{ .ConfirmationURL }}`; salvati il 10 agosto 2026.
- [x] Dopo accesso, la dashboard usa esclusivamente nomi del catalogo verificato.

**Verifica del 9 agosto 2026:** typecheck, lint, build, 3/3 test autorizzazione,
12/12 test gateway e 4/4 test media verdi. Smoke HTTP locale: `/partite` e `/accedi`
rispondono `200`; lo stato anonimo contiene l'azione email, non contiene il filtro ID e
la pagina accesso contiene il solo input email. La correzione del 9 agosto 2026 sostituisce
il callback sul dispositivo con `POST /api/auth/email-code` e
`POST /api/auth/email-code/verify`: typecheck, lint, build, 7/7 test Auth, 12/12 test
gateway e 4/4 test media verdi; smoke HTTP `400/422/422` senza invii reali. Verifica
responsive a 375, 768, 1024 e 1440 px: nessun overflow orizzontale e controlli da 44 px.

**Aggiornamento del 10 agosto 2026:** i template email Supabase “Magic link or OTP” e
“Confirm sign up” sono stati riscritti in dashboard per inviare solo il codice
`{{ .Token }}` a 6 cifre e non contengono più `{{ .ConfirmationURL }}`; questo risolve
l'errore Safari «connessione al server non riuscita» causato dal magic link (l'app usa
`signInWithOtp` + `verifyOtp`, non esiste route di callback). QA visuale della slice
Partite/Piani (stati anonimi) eseguita a 375/768/1024/1440 px, tastiera, contrasto e
`prefers-reduced-motion`: nessun overflow, skip link e focus visibili. Resta da
confermare la verifica end-to-end (ricezione codice a 6 cifre e login) da parte
dell'utente. Per abilitare l'edit remoto è stata aggiunta una regola di permesso locale
in `.claude/settings.local.json` per le azioni del browser.

**Lunghezza OTP (10 agosto 2026):** Supabase generava OTP a **8 cifre** mentre l'app
valida esattamente **6** (`normalizeEmailCode` = `/^\d{6}$/` in
`apps/web/src/lib/auth/email-code.ts`), causando l'errore «codice non corretto». In
dashboard (Authentication → Sign In / Providers → Email) «Email OTP length» è stata
portata da 8 a 6 e salvata (scadenza OTP 3600 s). Un codice richiesto prima della
modifica resta a 8 cifre e non è valido: serve richiederne uno nuovo.

**Rate limit email (10 agosto 2026):** la verifica end-to-end è temporaneamente bloccata
dal limite di invio del mailer integrato Supabase, fisso a **2 email/ora** per progetto e
non modificabile in dashboard (Authentication → Rate Limits) finché non si configura un
SMTP personalizzato. Le altre soglie (token verifications 30/5 min, refresh 150/5 min) non
sono il collo di bottiglia. **Decisione dell'utente:** restare sul mailer integrato per ora
e riprovare quando la finestra oraria si libera; il passaggio a SMTP personalizzato
(es. Resend/Brevo) resta il prerequisito per il go-live con utenti reali. Nessun valore di
rate limit è stato modificato.

**Dipendenze:** AUTH-1, ENT-1.  
**Contratto:** `docs/product/access-experience-contract.md`.  
**Scope:** S.

## AUTH-3: Accesso a singolo utente e anti-condivisione

**Descrizione:** impedire che un account acquistato o di prova venga condiviso con terzi,
mantenendo l'accesso legato a un solo utente. Richiesta esplicita dell'utente il
10 agosto 2026; da progettare dopo la verifica end-to-end del login a codice.

**Base già presente:** accesso verificato lato server (RLS Supabase + entitlement per
richiesta) e login passwordless a codice OTP a 6 cifre.

**Opzioni da valutare con l'utente (nessuna implementata):**

- [ ] Sessione singola / binding al dispositivo: al nuovo login revoca le altre sessioni.
- [ ] Limite di sessioni o dispositivi concorrenti con revoca esplicita.
- [ ] Rilevazione multi-IP/dispositivo come segnale, non come blocco rigido.

**Vincoli:** alcune leve dipendono dal piano Supabase (attuale: Free); nessuna misura va
implementata senza scelta esplicita del livello e verifica UX.

**Dipendenze:** AUTH-2.  
**Scope:** M (da confermare).

## BILL-1/BILL-2: Stripe e entitlement

**Descrizione:** verificare il catalogo dei quattro piani in test mode e implementare
Checkout, Customer Portal e webhook Node firmato/idempotente.

**Criteri di accettazione:**

- [x] Importi, valuta, modalità e ricorrenza sono riconciliati con il contratto.
- [x] Il client invia soltanto un codice piano ammesso, mai un importo arbitrario.
- [x] Solo webhook verificati aggiornano subscription ed entitlement.

**Verifica:** eventi Stripe test, replay idempotente, pagamento riuscito/fallito,
cancellazione e tentativi cross-user; audit log privo di segreti.

**Esito del 2 agosto 2026:** il catalogo test è idempotente e mappato. Il Route Handler
ha accettato eventi localmente firmati con il segreto webhook e ha rifiutato firma
mancante/invalida, evento live, evento stale e trasferimento cross-user. Il guard owner
è applicato anche in Supabase. Il binario Stripe CLI è stato poi associato separatamente
tramite il flusso ufficiale in Chrome, il signing secret è stato sincronizzato senza
output e un evento fixture test è stato inoltrato al Route Handler: listener e server
hanno osservato HTTP 200. La suite firmata completa è rimasta verde dopo la rotazione e
la pulizia remota ha confermato zero artefatti temporanei. Non esiste ancora un endpoint
persistente perché non è stato autorizzato un URL pubblico; lo sviluppo locale usa il
listener temporaneo corretto.

**Dipendenze:** MIG-1, AUTH-1, riautenticazione Stripe e gate prezzi.  
**Scope:** M per ciascun blocco.

## BILL-3: UI Billing e Checkout Edge

**Descrizione:** pubblicare la pagina Billing IQstatS e l'Edge Function
`create-checkout-session`, mantenendo invariato il webhook Stripe/Supabase esistente.

**Criteri di accettazione:**

- [x] Il browser invia esclusivamente `planCode`; la funzione risolve il prezzo solo
  lato server, con JWT obbligatorio e Stripe test mode.
- [x] Il catalogo visuale deriva da una RPC a campi consentiti; gli utenti autenticati
  non possono leggere direttamente i mapping Stripe in `plans`.
- [x] La pagina e la funzione sono pubblicate in production; la pagina Billing risponde
  e il gateway rifiuta richieste senza JWT.
- [x] Un utente autenticato completa un Checkout Stripe test e il webhook esistente
  aggiorna gli entitlement.

**Verifica dell'8 agosto 2026:** typecheck e lint locali; build Vercel production
verde; route Billing production con HTTP 200; Edge Function con gate JWT verificato
senza creare alcuna Checkout Session. I secret sono stati salvati solo nella dashboard
Supabase e non sono presenti nei file o nel client. Il webhook non è stato modificato.

**Verifica del 9 agosto 2026:** corretto il passaggio esplicito del JWT ES256 a
`getClaims`; typecheck, lint e 2/2 test Billing verdi; pubblicata la nuova versione
della sola Edge Function con JWT obbligatorio. Un'unica Checkout Session autenticata
in Stripe test mode è stata completata e pagata; il browser è tornato alla pagina
Billing senza errori, il webhook esistente è rimasto invariato e ha processato
l'evento test, producendo sette entitlement attivi. Nessun cleanup remoto è stato
eseguito; le risorse test create dal checkpoint restano disponibili.

**Dipendenze:** BILL-1, BILL-2, AUTH-1.  
**Scope:** M.

## QF-1: Chiusura qualitativa Checkout pubblicato

**Descrizione:** aggiornare esclusivamente dipendenze compatibili e chiudere i
controlli locali/remoti non transazionali del flusso Billing, senza modificare il
webhook esistente né creare Sessioni Checkout.

**Criteri di accettazione:**

- [x] Gli aggiornamenti compatibili rimuovono gli avvisi audit di runtime e mantengono
  allineati browser, Next.js e funzione Edge.
- [x] Typecheck, lint, build e test locali non transazionali sono verdi; il controllo
  dei segreti non trova esposizioni nelle superfici Billing.
- [x] Il deploy production e lo smoke verificano pagina Billing e rifiuto JWT della
  funzione senza creare clienti, sessioni, eventi, retry o modifiche webhook.

**Verifica pianificata l'8 agosto 2026:** l'audit runtime ha rilevato un solo avviso
ad alta gravità, transitivo alla toolchain CSS. Le verifiche che creano utenti, eventi
o Sessioni Checkout restano fuori da QF-1 e richiedono un consenso separato.

**Verifica completata l'8 agosto 2026:** dipendenze compatibili aggiornate e
ricostruite da lockfile; audit con zero vulnerabilità. `next typegen`, typecheck,
lint, test Gateway/Auth/Billing e build production sono verdi. Sono pubblicate una
nuova versione della Edge Function con JWT obbligatorio e la produzione Vercel; la
pagina Billing ha risposto con HTTP 200, il browser non ha rilevato errori console e
la funzione ha respinto la chiamata senza JWT con HTTP 401. Nessuna sessione Checkout,
cliente, evento o retry Stripe è stata creata; il webhook è rimasto invariato e i token
Vercel temporanei sono stati revocati.

**Dipendenze:** BILL-3.  
**Scope:** M.

## ENT-1: Matrice piano → funzionalità

**Descrizione:** definire chiavi funzionalità stabili, associarle ai quattro piani e
produrre entitlement effettivi verificati su ogni route protetta.

**Criteri di accettazione:**

- [x] Ogni funzione premium ha una chiave unica, descrizione e comportamento senza
  accesso.
- [x] La matrice piano/funzione e gli eventuali limiti sono versionati in Supabase,
  non hardcodati nella UI.
- [x] Scadenza, downgrade, cancellazione e pagamento fallito revocano o riducono
  l'accesso in modo deterministico.

**Verifica:** test della matrice per tutti i quattro piani, tentativi cross-plan e
controllo che chiamate dirette alle route non aggirino la UI.

**Dipendenze:** MIG-1, BILL-1, BILL-2 e conferma umana della matrice.  
**Scope:** M.

## UX-0: Brief e sistema di design

**Descrizione:** usare `ui-ux-pro-max` per confermare stile, tipografia, palette,
densità e motion; documentare il master e gli override pagina.

**Criteri di accettazione:**

- [x] Il design system è approvato per la prima slice dal master e dagli override.
- [x] Sono definite regole mobile, desktop, contrasto, focus e reduced motion.

**Verifica:** ricerca `ui-ux-pro-max`, master e primi override verificati il 2 agosto
2026 prima della modifica visibile.

**Dipendenze:** nessuna.  
**File probabili:** `design-system/iqstats-professional/*`, `docs/product/*`.  
**Scope:** S.

## UX-1: Shell e navigazione primaria

**Descrizione:** implementare la gerarchia approvata con URL, stato attivo e back
navigation coerenti.

**Criteri di accettazione:**

- [x] Mobile usa una sola destinazione primaria mappata; desktop adatta la stessa IA.
- [x] Controlli da tastiera, focus e contenuto sotto barre fisse sono verificati.

**Verifica:** browser a 375, 768, 1024 e 1440 px senza overflow; skip link e ordine
tastiera verificati; `prefers-reduced-motion` e tema chiaro verificati il 2 agosto 2026.

**Dipendenze:** UX-0.  
**File probabili:** `apps/web/src/app/*`, `apps/web/src/components/*`.  
**Scope:** M.

## APP-4: Dashboard `/partite`

**Descrizione:** realizzare filtro e lista gare con dati normalizzati, stati e link al
dossier che preserva il contesto selezionato.

**Criteri di accettazione:**

- [x] Filtri data, lega e stato rispettano il contratto server-side; nazione e
  disponibilità restano assenti perché non mappate.
- [x] Accesso, input invalido, lista vuota, rate limit, errore e copertura parziale
  hanno stati distinti senza fallback demo.

**Verifica:** build, browser e navigazione/ritorno con filtri sono verificati; il
percorso felice autenticato dashboard → match reale è passato con envelope normalizzato
`no-store`, senza rilanciare l'E2E Auth/entitlement già concluso.

**Dipendenze:** APP-2 e UX-1. La slice è esplicitamente stateless: APP-3 resta un
gate distinto per cache/snapshot e non è stato avviato.  
**File probabili:** `apps/api/*`, `apps/web/*`, `tests/*`.  
**Scope:** M.

## APP-5: Dossier `/match/[matchId]`

**Descrizione:** creare testata persistente, riepilogo e pannello Metodo/fonti del
dettaglio partita.

**Criteri di accettazione:**

- [x] Il componente rende squadre, competizione, stato, timestamp e provenienza dal
  `MatchDetail` normalizzato; il percorso felice autenticato è stato osservato.
- [x] Le sezioni non caricate sono presentate come disponibilità, senza metriche o
  contenuto fittizio.

**Verifica:** return URL e stato accesso sono verificati nel browser; l'E2E con dati
autorizzati è passato insieme al percorso felice APP-4 e ha rimosso tutti gli artefatti
temporanei remoti.

**Estensione media stateless (9 agosto 2026):** gli stemmi delle due squadre usano ora
il proxy interno protetto `media/team/{id}` e il contratto
`docs/architecture/media-contract.md`. Tipo, ID, MIME type, redirect e limite binario
sono verificati lato server; `404` nasconde il solo elemento decorativo. Typecheck,
lint, build e 4/4 test media sono verdi. La verifica visuale richiede una normale
sessione autenticata con entitlement e non aggira il controllo di accesso; non sono
state introdotte cache, CDN o persistenza dei binari.

**Dipendenze:** APP-4.  
**File probabili:** `apps/web/*`, `apps/api/*`, `packages/shared/*`, `tests/*`.  
**Scope:** M.

## APP-6: Famiglie statistiche progressive

**Descrizione:** aggiungere una famiglia per volta: gol, tiri/parate, corner,
disciplina, fuorigioco, possesso e contesto.

**Criteri di accettazione:**

- [ ] Ogni famiglia ha read model, campione e comportamento missing verificati.
- [ ] Grafici e tabelle hanno alternativa accessibile e non basano significato sul solo
  colore.

**Verifica:** test di normalizzazione e review UI per ogni famiglia.

**Dipendenze:** APP-5, contratto specifico.  
**File probabili:** `apps/web/*`, `apps/api/*`, `packages/shared/*`, `tests/*`.  
**Scope:** M per famiglia.

## CAL-1: Harvester dataset

**Descrizione:** creare `scripts/calibration/buildDataset.ts` riprendibile per sole
leghe maschili regolari domestiche.

**Criteri di accettazione:**

- [x] Usa `league_id`, stagioni concluse, rate limit e retry.
- [x] CSV, manifest e raw payload sono incrementali; i null non diventano zero.

**Verifica:** type-check, dry run e checkpoint umano su manifest/log.

**Esito verificato (22 luglio 2026):** 36 leghe processate, 9.305 match,
18.610 righe team-gara, 9.305 raw JSON e 9.305 shard coerenti. Ventisette leghe
raggiungono il target, due restano sotto target e sette sono insufficienti per
assenza di storico. CAL-2 e CAL-3 sono stati completati nei checkpoint successivi.

**Dipendenze:** Gate CAL-0.  
**File probabili:** `scripts/calibration/*`.  
**Scope:** M.

## CAL-2: QA dataset

**Descrizione:** verificare grana team-gara, duplicate, coppie home/away, raw audit,
missingness per metrica e soglie 50/200 match.

**Criteri di accettazione:**

- [x] CSV e manifest coincidono per ogni `league_id`.
- [x] Metriche oltre 20% di assenze per lega sono escluse e riportate.

**Verifica:** report qualità e conferma umana.

**Esito verificato (22 luglio 2026):** 31/31 controlli d'integrità superati.
Ventisette leghe raggiungono il target, due restano sotto target e sette sono
insufficienti. Su 252 combinazioni lega/metrica, 155 restano utilizzabili, 49 sono
escluse per campione di lega insufficiente e 48 per missingness oltre il 20%.
Report: `scripts/calibration/output/DATASET_QUALITY.json` e
`scripts/calibration/output/DATASET_QUALITY.md`. Il gate successivo è stato approvato
e CAL-3 è ora completato.

**Dipendenze:** CAL-1.  
**File probabili:** `scripts/calibration/*`.  
**Scope:** S.

## CAL-3: Dispersione e baseline

**Descrizione:** calcolare media, SD e dispersione squadra/match, split casa/trasferta,
rapporto home/away e output generati.

**Criteri di accettazione:**

- [x] Le 155 combinazioni ammesse dal QA usano solo match completi home+away; media,
  varianza campionaria, SD e `D = varianza/media` sono calcolati a livello team-gara,
  home, away e totale match senza imputare i null.
- [x] Le baseline non aggregano `league_id` diversi; ogni record riporta campione,
  sorgente, data, caveat e rapporto home/away.
- [x] Le costanti conservano granularità team e match, applicano
  `D <= 1.05 -> 1.00` e attivano override per lega soltanto quando
  `|D_lega - D_globale| > 0.10` sul valore grezzo.
- [x] Le 97 combinazioni escluse restano fuori dai calcoli e sono elencate nel report
  con il motivo del QA; Liga MX Apertura e Clausura restano marcate sotto target.

**Verifica:** type-check strict; `--help`; smoke senza scritture su un sottoinsieme
reale; run completo; validazione indipendente di 155 inclusioni, 97 esclusioni,
conteggi campione, valori finiti, soglia Poisson, override, import degli output e
assenza di baseline inter-lega; checkpoint umano prima di CAL-4.

**Esito verificato (22 luglio 2026):** `analyze.ts` compila in strict mode; help e
protezione contro output parziali verificati; smoke su 12 match reali di Serie A
completato senza scritture; run completo con 18.610 righe e 9.305 match riuscito.
Una ricomputazione indipendente ha confrontato media, varianza, SD e dispersione per
tutte le 155 combinazioni. Gli output contengono sette metriche globali, 155 baseline
su 23 leghe, 65 override team e 83 override match; nessun pattern sensibile rilevato.
Report: `scripts/calibration/output/CALIBRATION_REPORT.json` e `.md`.

**Dipendenze:** CAL-2.  
**File probabili:** `scripts/calibration/analyze.ts`,
`scripts/calibration/output/CALIBRATION_REPORT.{json,md}`,
`scripts/calibration/output/MARKET_DISPERSION.generated.ts`,
`scripts/calibration/output/LEAGUE_BASELINES.generated.ts`.  
**Scope:** M.

## CAL-4A: Sanity check e backtest temporale

**Descrizione:** confrontare i D di Serie A con pilota e fonti accademiche, quindi
valutare fuori campione Poisson, D globale e override di lega senza usare quote o
informazione futura.

**Criteri di accettazione:**

- [x] Il sanity check applica la soglia `0.5` documentata, conserva fonti e distingue
  evidenza numerica, direzionale e non disponibile.
- [x] Lo split 70/30 avviene per date intere dentro la lega; media, D globale e D di
  lega sono stimati soltanto sul train.
- [x] NLL, intervallo appaiato al 95% e copertura centrale 80% sono riportati per
  metrica e granularità; il report dichiara che non è un backtest economico.

**Verifica:** type-check, self-test delle distribuzioni, smoke su Serie A, run completo
e ricomputazione indipendente di split/conteggi/NLL.

**Esito verificato (23 luglio 2026):** 23 leghe, 155 combinazioni ammesse e 310/310
righe metrica/granularità valutate fuori campione; nessuna metrica Serie A è sospetta
secondo il doppio confronto numerico disponibile. Tutte le verifiche previste sono
passate, incluse 14 dispersioni globali train, 930 NLL e 930 intervalli appaiati
ricomputati indipendentemente. Output: `MODEL_VALIDATION.json`, `.md` e
`MODEL_VALIDATION.generated.ts`; la costante vieta esplicitamente l'integrazione
nell'app prima del gate umano post-CAL-4.

**Dipendenze:** CAL-3.  
**File probabili:** `scripts/calibration/validateModel.ts`,
`scripts/calibration/output/MODEL_VALIDATION.{json,md}`.  
**Scope:** M.

## CAL-4B: Dataset di contesto

**Descrizione:** normalizzare e salvare in modo riprendibile eventi storici/correnti,
rose, trasferimenti e profili allenatore necessari agli indici.

**Criteri di accettazione:**

- [x] Ogni record riporta `asOf`, `capturedAt`, origine, copertura e assenze; nessun
  segreto o header è scritto o stampato.
- [x] Sono ammessi come inizio stagione soltanto snapshot entro 60 giorni dallo start;
  gli altri hanno stato escluso e motivo esplicito.
- [x] Harvester con `league_id`/`team_id`, paginazione, massimo due richieste al
  secondo, retry, salvataggio incrementale e manifest riprendibile.

**Verifica:** type-check, help, dry-run, smoke su una lega, resume e audit del manifest
prima del run completo.

**Esito verificato (23 luglio 2026):** dry-run su 23 leghe, smoke Serie A su due team,
resume a una richiesta e run completo superati. Lo snapshot `2026-07-23` contiene
4.185 contratti JSON validi e sanificati; 20.151 eventi, 445 contesti lega/squadra,
427 rose, 11.185 trasferimenti, 2.298 player integrativi e 500 manager. La copertura
valore rosa aggregata è 81,0%, ma 175 contesti sono sotto la soglia team dell'80%; 121
snapshot sono fuori dalla finestra temporale e sette coorti precedenti non sostengono
baseline neopromosse. Questi casi devono restare `null` con motivo in CAL-4C.

**Dipendenze:** CAL-4A, discovery CAL-0.  
**File probabili:** `scripts/calibration/buildContextDataset.ts`,
`scripts/calibration/context/data/*`.  
**Scope:** M.

## CAL-4C: Indici contesto e neopromosse

**Descrizione:** calcolare stabilità rosa, cambio/shift allenatore e baseline delle
neopromosse solo dove i contratti CAL-4B e la copertura storica lo consentono.

**Criteri di accettazione:**

- [x] Titolari al 60%, copertura minima 80% e formula stabilità 60/40 sono versionati;
  qualsiasi requisito assente produce `null` con motivo.
- [x] `tacticalShift` è tracciabile a coach ID, profilo e formazione; gli indici
  regolano soltanto la confidenza e `expectedAdjustmentAllowed` è sempre `false`.
- [x] Le baseline `promoted` usano team ID e match completi, sono separate per lega e
  riportano numero di squadre/match e metriche non disponibili.

**Verifica:** type-check, smoke, run completo, ricomputazione indipendente di campioni
e formule, import output e scansione pattern sensibili; checkpoint umano finale.

**Esito verificato (23 luglio 2026):** 445 team analizzati; 214 indici di stabilità
disponibili, 109 cambi allenatore e 61 shift tattici rilevati nei rispettivi campioni
calcolabili. Quindici leghe hanno baseline neopromosse disponibili e otto restano
`null`: sette per coorte precedente vuota/sotto soglia e la lega 23 per overlap team ID
interstagionale nullo. Le 155 baseline CAL-3 sono rimaste invariate e 105 baseline
metriche neopromosse sono state ricalcolate indipendentemente. Strict type-check,
self-test, smoke, full run, import delle costanti, scansione sensibili e assenza di file
temporanei sono passati. Il gate app resta chiuso.

**Dipendenze:** CAL-4B.  
**File probabili:** `scripts/calibration/contextIndex.ts`,
`scripts/calibration/output/CONTEXT_REPORT.{json,md}`,
`scripts/calibration/output/SQUAD_CONTEXT.generated.ts`,
`scripts/calibration/output/LEAGUE_BASELINES.generated.ts`.  
**Scope:** M.

## Gate finale

- [ ] Build, lint e test pertinenti passano.
- [ ] Nessun segreto è tracciato o servito al client.
- [ ] UI verificata a 375 / 768 / 1024 / 1440 px, con tastiera e reduced motion.
- [ ] Fonti, timestamp, formule, sample size e assenze sono leggibili nelle sezioni che
  mostrano dati reali.

### UI — stato al 14 agosto 2026

La QA visuale di TEAM-1 ha portato a un cambio di identità: «carta e campo» sostituisce
«Il Cardinale» e la veste blu, con un solo tema chiaro. Registro in
`docs/architecture/team-profile-contract.md` §16, sistema in
`design-system/iqstats-professional/MASTER.md`.

Verificato su dieci pagine (`/`, `/oggi`, `/partite`, `/match/1453`, `/squadre/63`,
`/metodo`, `/database`, `/giocate`, `/pronostici`, `/accedi`): zero combinazioni sotto
AA, zero overflow orizzontale, zero controlli sotto 44 px, ogni elemento tabulabile con
anello di focus, `prefers-reduced-motion` rispettato. Build di produzione verde.

Manca al gate: **il giudizio visivo dell'utente** sulla nuova identità.

### Accesso e pagamento — verificati il 14 agosto 2026

Con sessione autenticata reale (codice OTP via email, accettato al primo tentativo):

- **Login end-to-end verde.** `/api/auth/email-code/verify` risponde `200`, la sessione
  risulta attiva lato server, il rimando funziona.
- **`/account/billing` autenticata sana.** Catalogo di 4 piani dalla RPC `get_billing_catalog`,
  riquadro dell'abbonamento in corso. QA con sessione: zero combinazioni sotto AA (23),
  identico nei due `color-scheme`; zero overflow, zero controlli sotto 44 px, zero elementi
  senza anello di focus a 375/768/1024/1440.
- **Checkout non verificabile in locale, per progetto.** L'edge function
  `create-checkout-session` ammette solo l'`Origin` uguale a `IQSTATS_APP_URL`, che deve
  essere `https`: da `http://localhost:3200` il preflight CORS viene respinto. Va provato su
  un'origine https. Stripe è in modalità test su tutte le chiavi.
- **Difetto corretto:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  mancavano da `apps/web/.env.local`, quindi il client Supabase del browser non si costruiva e
  il Checkout falliva prima ancora di partire. Aggiunte; il bundle di produzione le include
  solo dopo una nuova build.

Da correggere, trovati e non toccati: `product-shell.tsx:38` cita ancora «Il Cardinale» nel
payoff del wordmark su ogni pagina; `product-shell.tsx:63` mostra «Accedi» anche a sessione
attiva; `account/billing/page.tsx:8` ha `checkoutAvailable` dichiarata fuori dal componente;
le route `/api/billing/checkout` e `/api/billing/portal` non sono chiamate da alcun client.

### `/pronostici` — dashboard delle gare filtrabile, 14 agosto 2026

La pagina segnaposto è diventata la vista di lavoro: tutte le gare in arrivo dal modello,
**oggi e tutte le competizioni come default**, filtrabili per finestra temporale, competizione,
mercato (esito favorito, over 2.5, gol/gol), probabilità minima e ordinamento. I filtri sono un
form GET: URL condivisibili e nessuna dipendenza da JavaScript. Il catalogo delle competizioni
nasce dalle gare già scaricate, quindi non costa richieste.

Verifiche: `typecheck` e `lint` verdi; prova funzionale dei filtri (oggi 15 gare, over 2.5 sopra
il 55% 21 gare, soglia non valida ignorata, competizione inesistente → stato vuoto); contrasto
zero sotto AA su elenco pieno e filtrato nei due `color-scheme`; zero overflow, zero controlli
sotto 44 px, zero elementi senza focus ai quattro viewport.

Limite dichiarato in pagina: l'elenco copre le prime 100 gare pubblicate dal modello, quindi
oggi «prossimi 7 giorni» e «tutte» coincidono. Restano fuori dal primo taglio, per mancanza di
un read model cross-gara: giocatori e arbitri.

### `/` — home a mattonelle, 14 agosto 2026

L'utente ha fornito due riferimenti grafici (`riferimentografica.jpg`, `riferimentografica1.jpg`
nella radice) e ha chiesto una pagina principale che sia il sommario navigabile dell'app,
mobile-first. Quattro decisioni chiuse con lui, una per volta, prima di scrivere codice:

1. **Struttura dai riferimenti, pelle «carta e campo».** Si prendono griglia di mattonelle con
   anteprima viva, freccia d'ingresso, barra fissa in basso; restano i colori, i caratteri e i
   filetti del sistema. Le dieci pagine già verificate non si rifanno. Ombre, accenti multipli,
   fondi fotografici e tema scuro dei riferimenti **non** entrano.
2. **La spiegazione del prodotto va nella pagina di accesso**, non su `/`: breve, decisa,
   completa, con la leggenda di come si leggono i dati e la legenda di cosa contiene ogni
   sezione. **Vincoli dell'utente: mai nominare il provider dei dati, mai esporre calcoli e
   formule applicate.** Da fare.
3. **`/` è la dashboard, aperta a tutti**, coerente col resto del prodotto che è già pubblico.
   L'invito all'accesso resta in testata. La vetrina di marketing precedente è stata smontata;
   copia integrale in `…\56474dac-…\scratchpad\vetrina-marketing-originale.page.tsx`.
4. **Griglia completa della mappa, sezioni future spente**: Giocatori, Arbitri e Le mie giocate
   compaiono non cliccabili, con una riga che dice cosa conterranno.

Fatto: `apps/web/src/app/page.tsx` riscritta; blocco `.home-*` in coda a `globals.css` con soli
token esistenti; `product-shell.tsx` con la voce **Home** in navigazione primaria (Database e
Le mie giocate escono dalla barra perché sono segnaposto, Metodo entra), payoff del wordmark
ripulito dal residuo «Il Cardinale».

Firma visiva: **il contatore di sezione** — ogni riquadro dichiara in monospazio quanto
contenuto ha adesso (`100 gare`, `27 competizioni`, `24 in campo`) oppure `in arrivo`. Lo stato
si legge dalla parola e dal filetto tratteggiato, mai dal solo colore. Il riquadro «Oggi» è
l'unico blocco ad alto contrasto, come la hero del sistema. La mattonella **Squadre** è anche
l'indice che mancava: i nomi vengono dalle gare già scaricate, quindi **zero richieste in più**
al provider — l'intera pagina vive su una sola chiamata già in cache.

Verifiche: `typecheck` e `lint` verdi; zero overflow, zero controlli sotto 44 px, zero elementi
senza anello di focus a 375/768/1024/1440. Le **8 combinazioni sotto AA** segnalate dalla sonda
sono tutte nel riquadro bordeaux e sono **falsi positivi**: la sonda misura contro la carta
perché il fondo è un gradiente (`gradient: true`, limite noto del §16.5). Rapporti reali
calcolati sui tre colori del gradiente: **da 5,93 a 17,02**, tutti sopra AA.

Corretti due difetti trovati guardando la pagina resa: il riquadro dichiarava «0 gare» mentre
mostrava una partita (ora «nessuna oggi»), e l'orario della prima gara utile non diceva il
giorno (ora «sab 15 ago alle 00:30»).

Aperti su questa superficie: il **giudizio visivo dell'utente**; registrazione classica e
accesso Google su Supabase — **Google richiede credenziali di un progetto Google Cloud che deve
generare l'utente**; «Accedi» resta visibile anche a sessione attiva, perché `ProductShell` non
legge la sessione.

### `/accedi` — presentazione e leggenda, 14 agosto 2026

La pagina di accesso è diventata anche la presentazione del prodotto, come deciso dall'utente.
Tre blocchi sotto il riquadro di accesso, che resta invariato nel funzionamento:

- **Apertura**: «I numeri di una partita, e quanto pesano», con un paragrafo che dice che cosa
  si raccoglie, che accanto a ogni valore c'è il campione su cui è calcolato, e che qui non ci
  sono consigli di giocata.
- **Come si leggono** — sei voci: la media, casa e trasferta, verde e mattone, il numero piccolo
  del campione, la lineetta dell'assenza, il filo del campione.
- **Le sezioni** — sette voci vive più tre spente, con lo stesso segno della home (filetto
  tratteggiato, superficie tenue). Chiude la promessa sui numeri: un dato mancante resta
  dichiarato mancante.

**Vincoli dell'utente rispettati e verificati:** il nome della fonte dati **non compare in
nessuna pagina né componente** (grep su `app/` e `components/`: zero occorrenze); nessun testo
espone calcoli o formule applicate. Anche `/metodo` parla di «fonte» in astratto e non descrive
alcuna formula.

Verifiche: `typecheck` e `lint` verdi; ai quattro viewport **zero overflow, zero contrasti sotto
AA, zero elementi senza focus, zero controlli sotto 44 px**.

Difetto preesistente corretto: `.button-link` non aveva altezza minima e il pulsante «Vai alla
home» misurava 23 px. Aggiunto `min-height: 44px` alla regola condivisa; `/partite`, che usa la
stessa regola, riverificata verde ai quattro viewport. Rimossa l'ombra blu residua da
`.auth-card`, che contraddiceva la regola «la carta non ha ombre, ha filetti».

### Revisione dell'utente — 15 agosto 2026

Cinque punti sollevati dall'utente guardando il prodotto, più uno trovato di conseguenza.

**1. Fonte e modello non si nominano più (regola nuova dell'utente).** Mai citare da dove
arrivano i dati, mai esporre calcoli e formule applicate. Erano esposti in **nove punti**, due
dei quali con la sigla della fonte in chiaro: `partite` e il piede del dossier gara scrivevano
«Fonte: provider BSD», `/oggi` ripeteva «Modello provider · <versione>» in tre punti, e
`/pronostici`, `/squadre/[teamId]`, `/metodo` citavano il provider nel testo. Tutti riscritti
mantenendo **freschezza e campione**, che `AGENTS.md` impone: si dice «aggiornato 7 g fa» e «su
21 gare», non da chi e con quale modello. Verifica: grep su `app/` e `components/` per il nome
della fonte, la sigla e la versione del modello → **zero occorrenze nel testo visibile**.

**2. La hero «rossa e ricalcata».** Non era un bug del codice: `/api/media/venue/542` risponde
404 perché **quello stadio non ha foto nella fonte**, e restava il solo gradiente, coperto da
righe verticali ogni 26 px che davano l'effetto ricalcato. Le righe sono state rimosse e il
fondo ora disegna **il campo visto dall'alto** — cerchio di centro e linea mediana, due
pseudo-elementi, nessuna immagine da scaricare. La stessa hero serve anche `/squadre/[teamId]`.

**Difetto introdotto e corretto durante il lavoro:** alleggerendo lo scrim, sulle schede dove la
foto **esiste** (Estádio Santa Cruz) il testo chiaro finiva su un cielo chiaro. Lo scrim è stato
rinforzato a `.88/.78/.93` e verificato a vista su entrambi i casi, con e senza foto.

**3. Registro delle statistiche filtrabile e leggibile.** Aprendo una metrica su
`/squadre/[teamId]` ora ci sono tre filtri — **Tutte · In casa · In trasferta**, con il conteggio
accanto — e il nome della squadra consultata è in bordeaux dentro ogni riga, con un'intestazione
che dichiara quale dei due numeri è il suo. Il filtro lavora sulle gare **già scaricate**: zero
richieste in più. Lo stato attivo non è affidato al solo colore, cambia anche il peso del bordo.
Prova reale su Botafogo-SP: 21 gare, 10 in casa, 11 in trasferta, il filtro riduce a 10.

**4. Testata a sessione attiva.** `ProductShell` ora è un componente server asincrono che legge
la sessione: a sessione attiva mostra iniziale, indirizzo e il pulsante **Esci**; altrimenti
resta «Accedi». L'uscita è una Server Action che chiude la sessione, invalida la cornice e
riporta alla home — **senza `revalidatePath` il router riusava la pagina in cache e la sessione
sembrava ancora aperta**, difetto trovato provandolo e corretto. Verificato: nessun cookie di
sessione residuo e testata tornata ad «Accedi» dopo ricarica dal server. Tutte e **undici le
rotte** rispondono 200 dopo il passaggio della cornice ad asincrona.

**5. Accesso con Google.** Decisione dell'utente: **codice via email + Google, nessuna
password**. Fatto lato applicazione: rotta di ritorno `/auth/callback` che scambia il codice
lato server, pulsante «Continua con Google», messaggi d'errore leggibili per rifiuto del
provider e scambio fallito. **Il provider non è ancora abilitato** — l'endpoint di
autorizzazione risponde `provider is not enabled` — quindi il pulsante **non viene mostrato**,
secondo la regola per cui una funzione appare solo se è davvero disponibile; la verifica sta in
`server/auth/providers.ts` con cache di 10 minuti.

**Configurazione completata il 15 agosto 2026.** Stato trovato: il campo Client IDs di Supabase
conteneva `MatchLab`, che non è un identificativo valido, e su Google Cloud **non esisteva alcun
progetto con quel nome**; l'unica credenziale OAuth presente apparteneva a un altro lavoro. È
stato quindi creato un **progetto Google Cloud dedicato**, con schermata di consenso intestata a
IQstatS, utenza **Esterno** e un client OAuth di tipo applicazione web che autorizza il ritorno
su `/auth/v1/callback` del progetto Supabase.

Divisione dei compiti rispettata: l'accettazione delle norme Google e l'inserimento del **client
secret** sono stati fatti dall'utente. Il segreto è stato trasferito tramite gli appunti con il
pulsante di copia di Google, **senza mai comparire in questa sessione né in alcun file**.

Verifiche: l'endpoint di autorizzazione è passato da `provider is not enabled` a **302 verso
accounts.google.com** con l'identificativo corretto; il pulsante «Continua con Google» è
comparso da solo in `/accedi` senza toccare il codice, e il percorso raggiunge la schermata di
accesso di Google **senza errore di indirizzo di ritorno**.

**Due limiti dichiarati.** L'app è in **modalità test**: possono entrare solo gli account
elencati come utenti di prova, e per aprirla a chiunque andrà pubblicata, con possibile verifica
da parte di Google. Inoltre la schermata di Google mostra il dominio tecnico di Supabase e non
il nome IQstatS: per cambiarlo serve un dominio personalizzato, che è una funzione a pagamento.

**Difetto scoperto provando dal telefono, e corretto.** Il primo accesso reale è fallito su
Safari con «connessione al server non riuscita». Due cause distinte, entrambe in
`Authentication → URL Configuration` di Supabase:

1. **La lista dei ritorni consentiti era completamente vuota** («No Redirect URLs»). Senza
   almeno una voce, Supabase ignora il ritorno richiesto e ripiega sempre sul Site URL. Sarebbe
   fallito anche dal computer, non solo dal telefono.
2. **Il Site URL puntava a `http://localhost:3000`**, una porta dove non gira nulla: il progetto
   usa la **3200**.

Corretti entrambi: Site URL portato su `http://localhost:3200`, e in lista `http://localhost:3200/**`
più `http://192.168.1.5:3200/**`, che è l'indirizzo di rete della macchina di sviluppo e serve a
provare l'accesso dal telefono sulla stessa Wi-Fi — `localhost`, dal telefono, significa il
telefono stesso. **Quell'indirizzo di rete va rimosso dalla lista prima della produzione.**

### Pubblicazione in produzione — 15 agosto 2026

L'accesso dal telefono restava fragile perché il sito viveva solo sulla macchina di sviluppo.
Decisione dell'utente: **pubblicare**. Stato trovato: il progetto Vercel `iqstats` esisteva già
con dominio `iqstats-indol.vercel.app`, ma **il codice online era sorpassato** — `/accedi` e
`/oggi` rispondevano 404, e nemmeno l'ultimo rilascio marcato «production» le conteneva.

Prima del rilascio: dev server fermato (mai `next build` con il dev attivo), **build locale
verde** con tutte le rotte. Verificate le variabili d'ambiente su Vercel: **c'erano già tutte**,
comprese `NEXT_PUBLIC_SUPABASE_*` — mancavano soltanto in locale, non online.

L'accesso alla CLI è stato completato con il flusso a codice dispositivo, autorizzandolo dal
browser già autenticato. Rilascio in produzione: build su Vercel verde, alias aggiornato.
**Verificato: `/`, `/accedi`, `/oggi`, `/pronostici`, `/partite`, `/metodo`, `/squadre/927`
rispondono tutte 200, e la home online è quella nuova a mattonelle.**

Supabase allineato al dominio pubblico: Site URL su `https://iqstats-indol.vercel.app` e terzo
ritorno consentito `https://iqstats-indol.vercel.app/**`. **Verificato sul sito pubblicato** che
il pulsante Google compare e che il ritorno richiesto è
`https://iqstats-indol.vercel.app/auth/callback`.

**Da verificare al prossimo giro:** `IQSTATS_APP_URL` su Vercel risale al 2 agosto e la Edge
Function del Checkout ammette solo un `Origin` uguale a quel valore. Se non corrisponde al
dominio attuale, il pagamento continuerà a essere rifiutato — stavolta però la causa sarebbe
solo quella, perché l'origine è finalmente https.

**Due inciampi risolti provando dal telefono.**

1. **Avviso di certificato non valido su Safari.** Il messaggio nominava
   `www.iqstats-indol.vercel.app`: il certificato del dominio Vercel non copre la variante con
   `www`, che Safari aggiunge da sé quando si digita un indirizzo. Misurato: senza `www` risponde
   200 con certificato valido, con `www` la connessione fallisce. L'indirizzo va aperto come
   `https://iqstats-indol.vercel.app`, senza prefisso.
2. **Accesso Google rifiutato.** Il messaggio d'errore mostrato in pagina era il nostro, quindi
   il ritorno funzionava: il rifiuto veniva da Google. Causa trovata in
   `Google Auth Platform → Pubblico`: l'app era in **stato Test con la lista degli utenti di
   prova vuota**, quindi *nessun account* poteva entrare, nemmeno quello del proprietario.
   Su decisione dell'utente l'app è stata portata **In produzione**: ora è aperta a chiunque
   abbia un account Google. Nessuna verifica richiesta da Google, perché chiediamo solo nome ed
   email — permessi non sensibili — e non c'è né un logo né una molteplicità di domini.
   Lo stato è reversibile dal pulsante «Torna al test».

**La causa vera, trovata nei log.** Dopo la pubblicazione l'accesso continuava a fallire. La
diagnosi è arrivata interrogando i log di autenticazione di Supabase, non per tentativi:

```
oauth2: "invalid_client" "The provided client secret is invalid."
500: Unable to exchange external code
```

**Il client secret salvato in Supabase era sbagliato fin dal primo tentativo delle 23:15 del 14
agosto.** L'errore riguardava solo il segreto e non l'identificativo: se anche l'ID fosse stato
errato Google avrebbe risposto che il client non esiste, quindi l'ID inserito era corretto.
Probabile causa: il campo conteneva già un valore residuo che non è stato svuotato prima di
incollare. Il segreto originale non era più recuperabile — Google non consente più di
rivisualizzarlo — quindi ne è stato generato uno nuovo dal pulsante «Add secret» e reinserito
dall'utente, con il campo svuotato prima.

**Esito verificato il 15 agosto alle 05:58:57 UTC:** nei log compaiono `/callback` e `/token`
senza errori e un evento `Login` con `provider: google` e `login_method: pkce`; in
`auth.users` risulta **un utente Google** con ultimo accesso allo stesso secondo. Accanto
restano i 3 utenti creati con il codice via email.

**Nota di metodo.** Le altre tre cose corrette lungo la strada — lista dei ritorni vuota, Site
URL sulla porta sbagliata, app in modalità test senza utenti di prova — erano difetti reali che
avrebbero bloccato l'accesso subito dopo, ma **nessuna delle tre era la causa di quel
fallimento**. Senza leggere i log si sarebbe continuato a correggere sintomi.

Verifiche di questo giro: `typecheck` e `lint` verdi a ogni passo; `/accedi` **zero** contrasti
sotto AA, zero overflow, zero controlli sotto 44 px, zero elementi senza focus ai quattro
viewport. Su `/oggi` e `/` le segnalazioni di contrasto sono **falsi positivi sul gradiente**
della hero: rapporti reali ricalcolati sui tre colori del fondo, **da 5,93 a 17,02**. Su
`/squadre/927` i «25 elementi senza focus» sono l'artefatto del §16.5: con `Tab` reale il
`summary` del registro ha `outline 2px solid` e `:focus-visible` attivo.

### Conteggi veri ed elenco partite — 15 agosto 2026

Revisione dell'utente sulla home: «nella card pronostici 100 partite, in partite 25, ma nella
sezione partite ce ne sono 166». Diagnosi: erano tetti travestiti da conteggi.

- `page.tsx` chiedeva le prime **100** letture e mostrava quel numero come se fosse un totale;
  le «25 competizioni» erano quelle presenti **dentro** quelle 100 letture, non quelle del giorno.
- `/partite` chiedeva una pagina sola con limite 200: oggi bastava, in un giorno più fitto no.

**Due semantiche diverse nella stessa fonte, verificate e non dedotte.** Su `/events/` il limite
superiore della data è **incluso**; su `/predictions/` è **escluso**. Prova diretta: J1 League,
15 agosto, `date_to` sul giorno stesso → **0 letture** contro **9 gare**; spostando il limite al
giorno dopo tornano tutte. Senza questa verifica il riquadro avrebbe detto «6 su 156».

**Il giorno del prodotto è quello italiano.** La fonte divide i giorni in ora universale, quindi
l'elenco di «oggi» conteneva gare che in Italia sono di domani (la prima era Tampa Bay–Rhode
Island alle 23:30 universali, cioè l'1:30 del giorno dopo) e perdeva le notturne che in Italia
appartengono a oggi. Ora entrambe le letture chiedono anche il giorno universale precedente e
filtrano su Roma: **156 gare e 29 competizioni** il 15 agosto, contro le 166 di prima.

Fatto:

- `server/iqstats/rome-day.ts` — nuovo, il taglio del giorno in un posto solo.
- `server/iqstats/matches.ts` — paginazione fino a esaurimento con freno a 5 pagine dichiarato
  in pagina, finestra su due giorni universali, filtro sul giorno italiano.
- `server/iqstats/predictions.ts` — nuova `getPredictionsByDate`, stesso perimetro.
- `server/iqstats/match-reading.ts` — nuovo: traduce le letture in direzioni («gara aperta»,
  «favorita», «molti gol attesi») e produce il riscontro delle gare concluse. Le soglie vivono
  solo lì e non si mostrano mai in pagina.
- `app/page.tsx` — conteggi del giorno con doppio numero: **113 su 156 gare lette**, che è la
  copertura del modello. In evidenza va la prossima gara **giocabile**: prima usciva quella
  dell'una di notte, per giunta rinviata.
- `app/partite/page.tsx` — stemmi delle competizioni, pannelli richiudibili per campionato con
  paese, numero gare e primo orario leggibili da chiusi, indice dei campionati in testa, e in
  ogni riga l'assaggio di lettura con il filo 1X2 e «Apri l'analisi». Tolta la dicitura
  «Fonte provider» dalla testata, sostituita dai conteggi.
- `app/oggi/page.tsx` — stesso perimetro giornaliero delle altre superfici.
- `globals.css` — blocchi `.partite-index`, `.partite-group` richiudibile, `.partite-read`.

Verifiche: `typecheck` e `lint` verdi a ogni passo; tutte le rotte 200. Sonda ai quattro
viewport su `/partite`: zero overflow, zero controlli sotto 44 px, zero contrasti sotto AA, zero
elementi senza focus. **Terzo falso positivo della sonda, da non rincorrere:** «animati sotto
reduce=20» — quei venti elementi hanno durata **0,01 ms**, cioè la regola globale di riga 183
funziona; la sonda conta le durate maggiori di zero.

Due difetti trovati guardando le schermate e corretti: il filo 1X2 sotto i nomi sembrava una
sottolineatura (spostato sotto la frase, come il filo del campione), e su 375 px la frase si
spezzava lettera per lettera accanto all'invito (ora vanno in colonna sotto i 700 px).

Deciso con l'utente e ancora da fare: dossier gara ampliato (formazioni, mercato come lettura
senza nomi di operatori, statistiche, quattro pronostici di cui due statistici, contesto
pre-gara), poi raccolta notturna e sezione riscontri, poi giocatori e arbitri. Il dettaglio sta
in `tasks/plan-partite-riscontri.md`.

### Gerarchia delle competizioni e pubblicazione — 15 agosto 2026

Con 156 gare al giorno, «la gara in evidenza» scelta per solo orario finiva su un'amichevole
(CD Toledo–S.S. Reyes). Verificato prima di decidere: il **valore delle rose esiste** nella
fonte (`market_value_eur`, per esempio Modrić 3,8 M€) ma **solo sulla scheda del singolo
giocatore**, una richiesta a testa: ~80 richieste per pesare le due rose di una gara, quindi
impraticabile all'apertura della pagina e rimandato alla raccolta notturna. La rosa di squadra
invece porta gratis **disponibilità e infortuni con data di rientro**, materiale per il dossier.

Deciso con l'utente: **gerarchia dichiarata delle competizioni adesso, peso economico poi.**

- `server/iqstats/competition-rank.ts` — nuovo. Sei livelli su tutte le **80** competizioni
  della fonte, ricavate dall'elenco reale e non a memoria: 1 mondiali ed europei e coppe dei
  campioni, 2 i cinque grandi campionati e le altre coppe continentali, 3 gli altri grandi
  campionati e le coppe nazionali maggiori, 4 le altre prime divisioni (valore predefinito),
  5 divisioni inferiori e coppe minori, 6 amichevoli. È una **scelta editoriale nostra**,
  dichiarata nel file, e non compare mai in pagina: decide soltanto quale gara sale in vetrina.
- `app/page.tsx` — `featuredMatch`: fra le gare ancora da giocare oggi vince il peso della
  competizione, a parità l'orario più vicino. In evidenza è comparsa **La Liga,
  Alavés–Getafe delle 19:30** al posto dell'amichevole.

Pubblicazione: dev server fermato, **build locale verde**, `npx vercel@latest --prod --yes`
dalla radice. Verificato **online**: `/`, `/oggi`, `/partite`, `/pronostici`, `/accedi`,
`/metodo` rispondono 200; la home mostra «156 gare» e «113 su 156»; `/partite` rende **156
righe** con pannelli per campionato, stemmi e assaggi di lettura. Dev server riavviato sulla
3200 dopo il rilascio.

### Dossier gara, primo taglio — 15 agosto 2026

Domanda dell'utente: «Alavés–Getafe non presenta foto stadio, foto allenatore ecc.?»
Verificato con misure dirette: **le immagini c'erano tutte** — stadio (2,1 MB), entrambi gli
allenatori, stemmi e logo competizione rispondono 200. Due cause distinte:

1. **La foto dello stadio era annegata dallo scrim** (`.88/.78/.93` su tutta l'altezza),
   rinforzato nella sessione precedente per salvare il contrasto. Ora lo scrim è direzionale:
   denso dove il testo c'è davvero (in alto e in basso), leggero al centro. Verificato a vista
   a 1440 e a 375, con foto e senza.
2. **Gli allenatori non erano mai stati previsti** in pagina.

Cosa è stato aggiunto al dossier, tutto da endpoint già disponibili:

- **In breve** — la gara in tre o quattro frasi, costruite solo da letture già fatte.
- **La lettura IQstatS** — quattro voci: chi vince, i gol, il gioco, la disciplina. Le prime due
  dagli esiti, le altre due dalle proiezioni del motore. Ogni voce dichiara la probabilità e,
  dove il mercato quota lo stesso esito, quanto gli assegna il mercato. Dove il motore non copre
  la competizione le due letture statistiche **non compaiono** e la loro assenza è dichiarata
  (verificato su J1: restano due letture, non quattro finte).
- **Modello e mercato** — 1X2, over 2.5 e gol/gol affiancati, con quota di consenso (mediana di
  70 operatori) e probabilità riportata a somma cento per togliere il margine. **Nessun operatore
  viene nominato, nessun collegamento esce dal sito**, come deciso.
- **Chi gioca** — formazioni previste o ufficiali, con la differenza detta a chiare lettere, la
  confidenza dichiarata quando è una previsione, e gli indisponibili.
- **Le due panchine** — foto, modulo abituale e come gioca la squadra di quell'allenatore
  (possesso medio, gol fatti e subiti), con il numero di gare alla guida.
- **Il contorno** — l'ex «Arbitro & Stadio» ora comprende meteo, chilometri di viaggio degli
  ospiti, derby e campo neutro, tutti già presenti nella risposta della gara.

Moduli nuovi: `odds.ts`, `lineups.ts`, `match-picks.ts`, `country-names.ts`; estesi
`match-context.ts` (allenatori, meteo, viaggio, stagione) e `match-reading.ts` (confronto col
mercato).

**Due violazioni del vincolo dell'utente trovate e chiuse:** il blocco statistico esponeva la
formula del motore («Binomiale Negativa, Poisson sotto soglia») e la sua versione; due punti
dichiaravano la soglia del 5% delle etichette arbitrali. Restano dichiarati freschezza,
campione e il fatto che l'etichetta è una scelta nostra — senza dire come si calcola.

**Prudenza sul limite della fonte:** il dossier fa otto richieste. Il limite è dieci al secondo
per indirizzo, quindi due lettori insieme lo sfonderebbero: le chiamate ora partono in **due
ondate**, prima ciò che regge la pagina e poi il contorno.

Corretto anche l'italiano: i paesi arrivavano in inglese («Vitoria-Gasteiz, Spain», «Japan»),
ora passano da una tabella chiusa di traduzioni; un paese sconosciuto resta com'è.

Verifiche: `typecheck` e `lint` verdi a ogni passo. Sonda ai quattro viewport su `/match`:
zero overflow, zero elementi senza focus. I **tre contrasti** segnalati sono il falso positivo
noto della hero (la sonda non vede lo scrim, che è un elemento separato): calcolo sul caso
peggiore — foto bianca sotto scrim `.86` — oltre 11:1. I **due tap target** erano invece un
difetto vero e preesistente: i nomi squadra sono collegamenti alti 24 px, ora portati a 44 px
di area toccabile senza spostare la riga.

Pubblicazione del dossier: dev server fermato, **build locale verde**, rilascio dalla radice.
Verificato **online**: `/`, `/oggi`, `/partite`, `/pronostici`, `/metodo`, `/accedi` e
`/match/213522` rispondono 200; nel dossier pubblicato compaiono tutti e sei i blocchi nuovi,
la foto dello stadio e le sei immagini degli allenatori. Sonda finale ai quattro viewport sul
dossier: **zero tap target sotto 44 px** dopo la correzione, zero overflow, zero elementi senza
focus, e i soli tre contrasti sono il falso positivo della hero. Controllo di conformità sul
reso: nessuna occorrenza della fonte, della formula del motore o del nome di un operatore.

### Nuova porta d'ingresso — 15 agosto 2026

L'utente ha allegato un riferimento grafico (una schermata di accesso di un altro prodotto) e ha
chiesto quello stile: **preciso, deciso, chiaro**. Il file `riferimentograficadashboardaccesso`
nella radice è rimasto a **zero byte**: l'immagine vera era nei Download, salvata alle 19:20.
Confermata dall'utente, con due istruzioni: **colori e stile nostri**, e **ogni pulsante deve
portare a qualcosa**. Perimetro dichiarato: tutto il prodotto.

Che cosa si prende dal riferimento (struttura, non identità: `AGENTS.md` vieta di copiare
testi, asset e brand del prodotto di riferimento): un blocco solo al centro, gerarchia verticale
marcata, campi alti, un'azione che domina a tutta larghezza, separatore con la parola in mezzo,
due azioni secondarie affiancate.

Che cosa **non** si prende: il verde e il viola — nel nostro sistema il verde significa «sopra il
riferimento» e non è un colore di marca — le ombre, i bagliori, e i campi **username e
password**, che non esistono in IQstatS: si entra con un codice di sei cifre o con Google.

Fatto su `/accedi`: riquadro chiaro al centro di un campo bordeaux (deciso dall'utente), segno
tondo in cima, «Bentornato.», sottotitolo che dichiara subito l'assenza di password, campo alto
56 px con etichetta in maiuscoletto, azione primaria piena, separatore «oppure», due azioni
secondarie collegate davvero: **Continua con Google** e **Abbonati** (porta ai piani). A sessione
attiva il riquadro cambia: «Vai alla home», più «Vedi le partite di oggi» e «Il tuo piano».

Corretto un residuo del vecchio tema: `.auth-card` aveva ancora un'**ombra blu**, vietata dal
sistema. Il blocco `.gate-*` non usa ombre: filetti, spazio e stacco di fondo.

Le due leggende sotto (come si leggono i dati, le sezioni) restano invariate.

Verifiche della porta d'ingresso: `typecheck` e `lint` verdi, **build verde**, sonda ai quattro
viewport su `/accedi` con **zero overflow, zero controlli sotto 44 px, zero elementi senza
focus**. L'unico contrasto segnalato è la nota sul fondo bordeaux: falso positivo del gradiente,
rapporto reale calcolato con l'opacità applicata **circa 8:1**. Pubblicato e verificato online:
`/`, `/accedi`, `/partite`, `/match/213522`, `/account/billing` rispondono 200 e la pagina
pubblicata contiene il riquadro nuovo con «Continua con Google» e «Abbonati». Dev server
riavviato sulla 3200.

**Nota sul rilascio:** il primo tentativo ha risposto «Not authorized» e il secondo, identico, è
andato a buon fine. Sembra un intoppo momentaneo della CLI, non un problema di credenziali: se
ricapita, ripetere prima di indagare.

### Il ritmo della porta d'ingresso esteso a tutto il prodotto — 15 agosto 2026, sera

Questa sezione è stata scritta il 16 agosto ricostruendo la sessione delle 19:55-21:26, che si
è interrotta da sola prima di poterla registrare. Il transcript è stato riletto per intero: i
fatti qui sotto vengono da lì e dalle misure rifatte adesso, non dalla memoria.

**Come si è interrotta.** La sessione è stata terminata dal sistema operativo (codice 137,
memoria esaurita) mentre lanciava la sonda di QA su `/squadre/2817`. Nessuna scrittura era in
corso: `typecheck`, `lint` e tutte le rotte sono risultati verdi al controllo successivo. Non è
andato perso lavoro, solo il racconto di quel lavoro.

**Le cinque decisioni chiuse in quella sessione.**

1. **Riquadri e azioni al ritmo del gate, righe di elenco compatte.** Il respiro si prende
   attorno alla lista, non dentro ogni riga: con oltre centocinquanta gare al giorno gonfiare
   la riga significherebbe perdere la pagina. Nascono qui i sei token del ritmo in
   `globals.css`: `--r-panel` 20 px, `--r-control` 14 px, `--r-inset` 10 px, `--h-action` 56 px,
   `--h-control` 44 px e `--pad-panel`.
2. **Sigla del paese a tre lettere** — ESP, ENG, NED — presa dalla stessa tabella chiusa di
   `country-names.ts`, con EUR e MON dove il paese non esiste. Un paese fuori tabella resta
   senza sigla invece di prenderne una inventata.
3. **Pulizia del CSS morto.** Le classi delle tre generazioni precedenti — `marketing-*`,
   `dashboard-*`, `intro-panel`, `metric-card`, `evidence-panel`, `principle-*`, `workflow-*`,
   `method-strip`, `detail-hero`, `auth-layout`, `auth-card`, `access-gate` — sono risultate a
   **zero occorrenze** in tutto il JSX. Con loro se ne sono andate le ombre blu vietate dal
   sistema. Il foglio è passato da **1.244 a 993 righe**.
4. **Stemmi e loghi di campionato su tutte le superfici**, riusando il proxy `/api/media/`
   e `VerifiedMediaImage` già esistenti: cinque buchi chiusi (home, pronostici, dossier,
   scheda squadra, elenco), nessuna dipendenza nuova.
5. **Un solo blocco ad alto contrasto per pagina.** Regola nata guardando `/metodo`, dove il
   pannello ripetuto affaticava la lettura: il blocco «Cosa non fa IQstatS» resta pieno perché
   è il protagonista di quella pagina, gli altri tornano su carta.

**Superfici portate al ritmo nuovo**, in quest'ordine: `/partite`, la home, `/pronostici`, il
dossier `/match/[id]`, `/oggi`, la scheda squadra, i piani in `/account/billing` e `/metodo`.
Su piani e metodo è stato corretto anche il gergo tecnico, che era il difetto più serio del
colore.

**Verifiche.** `typecheck` e `lint` verdi. Sonda ai quattro viewport, rifatta adesso su tutto
ciò che non era stato chiuso: **home, `/oggi`, `/pronostici` e scheda squadra a zero overflow,
zero controlli sotto 44 px, zero contrasti sotto AA**. Sul dossier i cinque contrasti trovati
ieri erano veri ed erano stati corretti alla radice — testo chiaro che ereditava i token
invertiti della hero fuori dal suo blocco — e la misura successiva è tornata a zero. Restano i
tre falsi positivi noti: i «25 elementi senza focus» della scheda squadra, gli «animati sotto
reduce» che durano 0,01 ms, e il contrasto sul gradiente della hero.

**Commit di sicurezza.** Il repository non aveva alcun commit: tutto il prodotto viveva come
file non tracciati, senza rete di sicurezza. Primo commit `1e5a12bc`, 761 file, con fuori i
dataset generati di `scripts/calibration` e la cache dei plugin perché rigenerabili. Controllo
esplicito prima di scrivere: nessun segreto nel commit, `.env.example` contiene solo nomi di
variabili vuoti.

**Non ancora fatto:** la sonda su `/partite`, `/metodo`, `/accedi` e i piani; la build di
produzione dopo l'estensione; la pubblicazione online. Il prodotto online è quindi ancora
quello di ieri sera alle 19:40, con la sola porta d'ingresso nuova.

### QA chiusa, dossier ampliato e la sveglia delle formazioni — 16 agosto 2026

**Il giro di QA è chiuso, tutto verde.** Sonda ai quattro viewport su `/metodo`, `/accedi`,
i piani e `/partite` — quest'ultima lanciata da sola, e si è chiusa in tre minuti invece di
non chiudersi in dieci. Zero overflow, zero controlli sotto 44 px, zero contrasti sotto AA,
zero elementi senza anello di focus. **Nessuna correzione di layout è risultata necessaria.**
L'unico rilievo su `/accedi` è il falso positivo noto: `.gate` ha solo un `linear-gradient`
e nessun `background-color`, quindi la sonda risale fino alla carta e misura 1,01 dove il
valore vero — ricalcolato a mano sul punto più chiaro del gradiente — è **8,3:1**.

**`MASTER.md` aggiornato.** Aggiunta la sezione «Un solo blocco ad alto contrasto per
pagina» (con la definizione di cosa sia un blocco pieno e il corollario: sceglierlo
significa decidere il protagonista della pagina) e la sezione «Il ritmo — sei token», con
la tabella dei sei token e la regola dei tre gradini di raggio. Corretto il paragrafo della
porta d'ingresso, che diceva «il secondo blocco del sistema»: ora dice che esaurisce la
quota della sua pagina. Due voci nuove negli anti-pattern.

**Censimento degli endpoint** in `docs/architecture/mappa-endpoint-sezioni.md`: per ognuno,
se è già in pagina, dove va, quanto costa. Due scoperte che cambiano il conto in meglio:
`/events/{id}/stats/` è **una richiesta** e porta anche mappa dei tiri, momentum, xG per
minuto e posizioni medie; `/odds/comparison/` è **una richiesta** e porta undici mercati,
di cui oggi ne usavamo due.

**Dossier — confronto con i mercati statistici.** La lettura «Il gioco» ora si confronta
con `total_corners`, che la fonte quota su diciassette linee: le soglie del motore sono
sempre `.5` e combaciano senza conversioni. Sulla disciplina il confronto **non si fa e si
dichiara**: dei cartellini esiste solo il mercato dei rossi, che il motore non proietta, e
accostare gialli a rossi sarebbe fuorviante. Costo: **zero richieste**, le quote erano già
in casa. Verificato sulla gara 210813: «Più di 8,5 corner · Attesi 10,8 · il mercato lo dà
al 70%», e sulla disciplina «su questo esito non esiste un mercato con cui confrontarsi».

**Correzione di correttezza in `odds.ts`:** la probabilità implicita si normalizzava
sull'intero mercato. Su un mercato a soglie come i corner, con diciassette linee insieme,
quella somma non è un insieme chiuso e il risultato conteneva il margine. Ora si normalizza
**per coppia di linea** (sopra e sotto la stessa soglia). Sui mercati a due o tre esiti il
comportamento è identico a prima.

**Dossier — classifica e forma.** Nuova sezione fra «Modello e mercato» e «Chi gioca»:
posizione su quante squadre, punti, giocate, V/N/P, reti, differenza (l'unico verso del
blocco, lo zero è il riferimento) e la forma come cinque gettoni.
**La stringa `form` della classifica non si usa:** il 16 agosto è risultata non allineata al
giocato — l'Alavés, reduce da un 3-0 vinto, la mostrava come `LWWDL`, e il Rayo, reduce da
una sconfitta, come `WWDDW` — e il suo ordine non è dichiarato. La forma viene dalle gare
davvero concluse (`getTeamForm`), dove ogni gettone porta data, avversario e punteggio.
Costo: **tre richieste in una terza ondata**, il dossier passa da otto a dodici, mai più di
sei per ondata.

**La sveglia delle formazioni.** Decisione: la rivalidazione lato server si innesca solo
quando arriva una visita, quindi da sola non basta a «essere già aggiornati quando ti
colleghi». Serve una sveglia esterna.
- `lineups.ts` è passato dalla mappa in memoria alla **cache condivisa di Next**: su più
  istanze una mappa vale solo per l'istanza che l'ha riempita, e il lavoro pianificato gira
  quasi sempre altrove.
- Nuova rotta di servizio `POST /api/interno/rinfresca`, protetta da segreto con confronto
  a tempo costante, chiusa se il segreto non è configurato. Rinfresca le gare che iniziano
  entro due ore (più mezz'ora indietro), a gruppi di cinque con pausa, tetto di sessanta.
- `.github/workflows/sveglia-formazioni.yml`, ogni dieci minuti nella fascia 11–21 UTC.
  **La fascia è limitata per una ragione di costo:** GitHub arrotonda ogni esecuzione a un
  minuto e il piano gratuito dà 2000 minuti al mese sui repository privati; ventiquattr'ore
  ne consumerebbero 4320.
- **Verificato:** 19 gare nella finestra, 19 rinfrescate, 13 già ufficiali. Segreto
  sbagliato 401, segreto assente 503.

**Verifiche:** `typecheck` verde, `lint` verde, **build di produzione verde**
(`BUILD_ID` `ks_WfWGDpC5vIg8oT9Lll`, dev fermato prima).

**Non ancora fatto:** il riquadro delle formazioni che si rinfresca da solo nel browser
(attenzione: `router.refresh()` rifà tutte le letture della pagina, non solo le formazioni
— serve una rotta che restituisca il solo blocco); le statistiche della gara conclusa con
mappa dei tiri e cronologia (la domanda sul disegno della mappa è rimasta aperta); il
pannello giocatore con filtraggio profondo; la sezione riscontri.

### Pubblicazione del ramo e la gara giocata — 16 agosto 2026, mattina

**Il segreto della sveglia è configurato e la catena è verificata da un capo all'altro.**
Segreto generato a 32 byte casuali, scritto come repository secret di Actions con `gh` e
inserito a mano dall'utente su Vercel (*Sensitive*, Production e Preview): non compare in
nessun file del progetto. Controllati prima del push anche i due presupposti che nessuno
aveva verificato: **non esiste un middleware** che intercetti `/api/interno/rinfresca` (il
manifest del build è vuoto) e sul progetto **non è attiva nessuna protezione dei deploy**.
A rilascio fatto: la rotta senza credenziali risponde **401** — se la variabile mancasse
risponderebbe 503 — e il workflow lanciato a mano ha chiuso con `risposta 200`,
`{"ok":true,"inWindow":0,...}`, zero gare in finestra alle 08:00 italiane, che è il
risultato giusto.

**`formazioni-e-sveglia` è su `main`** (commit di merge `a47dca85`; `3aa551c6` resta
intatto). Su `origin/main` c'era un commit non previsto dall'handoff — `b6bc460f`, una riga
di `README.md` — quindi il merge non poteva essere fast-forward: si è scelto il commit di
merge invece del rebase, per non riscrivere l'unica copia del lavoro.

**Il primo rilascio è fallito e non per colpa del codice.** Turbopack ha ricevuto tre
**404 da Google** sui `.woff2` del carattere Archivo: la cache di compilazione restaurata
conteneva un CSS con URL che Google non serve più. Verificato a mano che quelle URL sono
davvero sparite e che oggi il carattere risponde su indirizzi diversi e più corti. Rimedio:
**rilancio senza cache**, verde. Se si ripete, la soluzione stabile è ospitare noi i file
del carattere invece di scaricarli in compilazione — non fatto, fuori scope.

**La gara giocata.** Nuovo `server/iqstats/match-finished.ts` e
`components/match-finished-section.tsx`, agganciati al dossier fra «Classifica e forma» e
«Chi gioca». Due richieste in tutto e solo a gara conclusa, in una quarta ondata.
- **Otto statistiche in vista** (possesso, tiri, tiri in porta, xG, grandi occasioni,
  corner, falli, ammoniti) e **le altre trenta in un blocco richiudibile** — scelta
  dell'utente fra tre opzioni.
- **Due campi della fonte esclusi di proposito:** `expected_goals` vale `0.0` anche dove
  l'xG vero è 2,42 — è un campo non popolato e mostrarlo sarebbe spacciare uno zero per una
  misura — e la media voti è un giudizio, non un dato osservato.
- **Mappa dei tiri a due mezzi campi affiancati**, scelta dell'utente contro il campo
  intero e l'elenco senza campo: così nessun colore serve a distinguere le squadre e il
  verde resta libero di significare «sopra il riferimento». Cinque esiti distinti, area del
  pallino proporzionale all'xG (il raggio cresce con la radice).
- **Le coordinate della fonte sono metri dalla linea di porta**, non una scala arbitraria:
  verificato contando i tiri oltre i 16,5 metri, che coincidono esattamente con
  `shots_outside_box` di entrambe le squadre. Il campo si ferma al tiro più lontano della
  gara — con un minimo di trenta metri — ed è **lo stesso per le due squadre**, altrimenti
  il confronto fra le due metà mentirebbe.
- **Bug trovato e corretto in verifica:** «Fine gara» compariva prima dei gol del recupero,
  perché l'ordinamento ignorava il recupero sui fine tempo. Confermato corretto su tre gare
  diverse con episodi al 90'+4, 90'+6 e 90'+9.

**Verifiche:** sonda Playwright ai quattro viewport sul dossier di una gara conclusa —
**zero overflow orizzontale, zero controlli sotto 44 px** a 375, 768, 1024 e 1440.
`typecheck` verde, `lint` verde, **build di produzione verde** (`BUILD_ID`
`LXJgif4ofLnS70Nz-lKDG`, dev fermato prima). Nota di ambiente: fermare il dev server mentre
scrive `.next/dev/types/routes.d.ts` lascia il file troncato e la build successiva fallisce
con errori di sintassi in un file **generato**; si risolve cancellando `.next/dev`.
