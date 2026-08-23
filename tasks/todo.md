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

### Il metodo di proiezione: ricognizione e registri — 16 agosto 2026, sera

**L'utente ha consegnato il suo metodo** (`CLAUDE_CODE_BSD_PROJECTION_MASTER_PROMPT.md`,
non tracciato, nella root). Prima di eseguirlo si è verificato che cosa esisteva già: la
ricognizione era stata fatta due volte ma stretta a sette metriche, e la baseline che il
metodo chiede di battere è ENG-1, già in produzione e già misurata fuori campione.

**Tre decisioni dell'utente, una domanda per volta.**
1. **Architettura ibrida:** Python addestra, TypeScript prevede. Nessun microservizio.
   Un modello entra in produzione solo se batte la baseline fuori campione, è
   serializzabile, è riproducibile in TypeScript e passa un test di parità numerica.
2. **Nomi neutri in italiano:** il nome della fonte non compare in percorsi, moduli,
   commit, log o interfaccia. I nomi degli endpoint restano nel livello di integrazione.
3. **Politica di provenienza a cinque classi** (A osservato, B zero implicito verificato,
   C ricostruito, D ambiguo, E mancante), applicata prima di ogni media.

**La discovery è chiusa e non è costata una richiesta.** Tutto ciò che il metodo chiede di
campionare era già su disco: 9.305 payload di gara, 20.151 eventi con squadre e allenatori,
39 campioni reali delle altre entità.

- **9.305 gare, 29 leghe, dal 22 febbraio 2025 al 28 giugno 2026**, di cui **7.905 col
  pannello statistico completo**. **76 campi di squadra distinti** — non i sette usati
  finora — più 42 per tempo, **211.950 tiri** con posizione, xG e xG nello specchio,
  momentum su 8.252 gare, e 79 campi per giocatore-gara.
- **Scoperta strutturale:** una riga statistica compare per **entrambe** le squadre o per
  nessuna. Su 7.905 gare e 76 campi **non esiste una sola presenza asimmetrica**.
- Per **47 campi** l'assenza della riga non ha nemmeno un controesempio: significa «zero
  per entrambe». Leggerla come un buco sbaglia sempre nella stessa direzione — sui rossi
  dà 0,408 per squadra a gara invece di **0,093**, che è il valore reale del calcio.
- **Due alias verificati** senza differenze su 2.685 confronti: `total_tackles` =
  `tackles`, `total_saves` = `goalkeeper_saves`. Contarli entrambi gonfierebbe ogni
  aggregato.
- **Le formazioni previste storiche non esistono:** su una gara passata la fonte dà
  l'undici effettivo. Usarlo come feature pre-partita sarebbe contaminazione.

**Regole registrate:** gialli e rossi restano separati e un rosso non diventa mai due
gialli; `card_points` esiste solo al livello mercato con pesi configurabili e non tocca i
dati osservati; `MIN_PREVIOUS_MATCHES = 3`, il motore parte dalla quarta gara.

**Prodotti:** `docs/architecture/inventario-fonte.md`, `dizionario-metriche.md`,
`architettura-motore-proiezione.md`, `piano-validazione-modelli.md`,
`data/registro-metriche.json` (76 metriche: 12 in classe A, 47 in B, 10 in C, 7 in D) e
`data/registro-target.json` (**63 target**, di cui 4 subordinati alla ricostruzione dei
cartellini). Scanner riproducibili in `scripts/projection/discovery/`.

**Verifiche:** i tre script girano puliti sull'archivio completo; i quattro JSON sono
validi; nessun nome della fonte e nessun segreto nei file nuovi; `.venv` escluso dal
versionamento.

**Non ancora fatto:** la raccolta degli episodi (7.905 richieste) che sblocca la disciplina
come target, quella delle statistiche per giocatore e quella del dettaglio gara; il dataset
al momento di; i modelli.

### Dataset al momento di, baseline e primi modelli — 16 agosto 2026, sera

**Raccolta in corso, staccata dalla sessione.** Tre blocchi in sequenza, 27.915 richieste a
due al secondo, giornale a scrittura immediata e ripresa senza richieste duplicate. Un
primo lancio in sottofondo è stato interrotto a 4.336 gare senza perdere nulla: rilanciato
staccato, prosegue.

**`scripts/projection/dataset/build_observations.py`** — tavola delle osservazioni:
**18.610 righe squadra-gara × 67 metriche**, con la classe di provenienza accanto a ogni
valore. Esito: 71,2% osservato, 5,1% zero implicito verificato, 8,7% in attesa della
ricostruzione, 15,1% mancante nelle 1.400 gare senza pannello. Nessun mancante è diventato
zero. La chiave di join copre oggi l'81% delle gare e si completerà col terzo blocco.

**`scripts/projection/dataset/build_features.py`** — dataset «al momento di» per un target,
52 colonne di feature e le sei baseline obbligatorie. Controlli di contaminazione automatici
a ogni costruzione: righe doppie, feature identiche al bersaglio, prime gare con una media
che non potrebbe esistere. **Passano su tutti i target provati.**

**Due difetti trovati rileggendo il proprio codice e corretti:** codice morto, e — più
serio — medie di stagione e di lega calcolate a cavallo di due stagioni, contro la regola
del progetto. Ora le aggregazioni di stagione, lato e lega vivono dentro la stagione; gli
orizzonti «ultime 3, 5, 10» attraversano il confine e lo dichiarano nel nome.

**`scripts/projection/models/evaluate.py`** — validazione a finestra avanzante su cinque
origini, mai uno split casuale. Misura errore, distorsione, errore per lega, per lato e per
fascia, e la copertura reale dell'intervallo.

**Due correzioni di metodo sugli intervalli.** La dispersione va stimata sui residui del
modello e non sulla distribuzione grezza, altrimenti l'intervallo è troppo largo; e su una
distribuzione discreta l'intervallo resta conservativo per costruzione, quindi il livello
nominale si **calibra sul solo periodo di addestramento**. Copertura misurata dopo la
correzione: **80,7% contro l'80% dichiarato**.

**Risultati fuori campione, tre target, cinque origini ciascuno:**

| Target | Migliore baseline | Ridge | Vantaggio | Origini vinte |
| --- | ---: | ---: | ---: | :---: |
| Corner | 2,1685 | **2,1026** | +3,0% | 5/5 |
| Tiri totali | 3,7770 | **3,6233** | +4,1% | 5/5 |
| Tiri in porta | 1,8418 | **1,7833** | +3,2% | 5/5 |

**Tre fatti che orientano il seguito.** La media mobile delle ultime cinque è **la peggiore
di tutte le baseline** su ogni target: la «forma» recente costa accuratezza. Il gradient
boosting arriva **sempre terzo**, dietro ai due modelli lineari, e il suo intervallo copre
il 73% invece dell'80%. E i due modelli che vincono — ridge e Poisson regolarizzato — sono
esattamente quelli **esportabili in un artefatto riproducibile in TypeScript**.

**Non ancora fatto:** ablazioni per blocco, ricostruzione dei cartellini, blocco giocatori,
contratto di esportazione, test di parità Python ↔ TypeScript, registro dei modelli.

### La disciplina ricostruita e le prime ablazioni — 16 agosto 2026, notte

**La raccolta era morta** un minuto dopo l'handoff, alle 22:03:31, a 3.142 statistiche per
giocatore su 9.305. Rilanciata staccata con `Start-Process`, PID **9144**, riprende senza
richieste duplicate: il giornale ad aggiunta fa il suo lavoro.

**Il test del doppio conteggio è stato eseguito, e il verdetto è più severo della domanda.**
Il metodo isola un asse per volta: si guardano i soli lati squadra-gara in cui quell'asse è
presente e gli altri sono assenti. Su un gruppo di controllo di 13.918 lati, episodi e
pannello concordano al 97,5%.

| Conteggio aggregato | Lati con una seconda ammonizione | Se la si esclude | Se la si include |
| --- | ---: | ---: | ---: |
| gialli | 541 | 7,8% | **90,6%** |
| rossi | 539 | 0,2% | **99,8%** |

**Lo stesso episodio la fonte lo conta già due volte**, una nei gialli e una nei rossi.
Sommarlo di nuovo sarebbe la terza. I due conteggi aggregati **escono dal registro** e al
loro posto entrano le quattro nature separate; `yellow_cards` non è più l'aggregato ma
l'ammonizione semplice.

**Terzo asse, non previsto:** 1.765 cartellini senza identificativo del giocatore, con nome
e minuto convenzionali. Non sono cartellini alla panchina — quelli sono sei in tutto. Su 894
lati isolati il pannello concorda al 95,7% **se si escludono**: la fonte non li conta, e
neppure noi. Restano dichiarati in una colonna propria.

**Ricostruzione su 9.205 gare e 29 leghe**, provenienza C: ammonizione semplice 1,963 per
squadra a gara, rosso diretto 0,0649, seconda ammonizione 0,0394, panchina 0,0003. Espulsioni
totali 0,104. I `bench_cards` sono registrati ma **non ammessi come bersaglio**: sei
osservazioni non sono un bersaglio.

**Registri rigenerati:** 78 metriche (12 in A, 47 in B, **12 in C**, 7 in D), 61 target,
**nessuno più subordinato alla ricostruzione**. Osservazioni: 18.610 righe, 69 colonne, 5,73%
di classe C. Gli ammoniti guadagnano copertura: **18.410 righe con bersaglio noto** invece
di 15.810, perché gli episodi esistono anche dove il pannello manca.

**Ammoniti rimisurati** con la nuova definizione: dispersione esattamente 1,0, migliore
baseline di nuovo la media di lega nuda, Poisson regolarizzato **+1,3%**, 5 origini su 5.

**Ablazioni per blocco, cinque target, cumulativa e «lascia fuori uno».** Le righe si fissano
una volta sola sull'insieme completo, altrimenti i confronti non direbbero nulla. Costo
relativo dell'errore quando il blocco viene tolto dall'insieme completo, Poisson:

| Blocco | Tiri | Tiri in porta | Corner | Falli | Ammoniti |
| --- | ---: | ---: | ---: | ---: | ---: |
| avversario | **+5,83%** | **+2,45%** | **+2,55%** | **+3,56%** | +0,21% |
| base | +0,54% | +0,66% | +0,79% | +0,14% | −0,05% |
| forma | +0,19% | +0,03% | +0,02% | +0,05% | +0,11% |
| casa/trasferta | −0,01% | −0,02% | −0,02% | +0,01% | 0,00% |
| riposo | −0,01% | −0,01% | 0,00% | −0,01% | −0,02% |

**Un blocco solo porta il carico.** L'avversario vale da solo quasi tutto il vantaggio sul
volume di gioco. Casa/trasferta e giorni di riposo **non pagano su nessun target**, e su
quattro su cinque tolgono accuratezza. Sugli ammoniti perfino la media di squadra nella
stagione è superflua: toglierla migliora il modello.

**L'ipotesi dell'arbitro resta in piedi e non è ancora verificabile:** il blocco arbitro,
allenatore, contesto e giocatori richiede il dettaglio gara e le statistiche per giocatore,
ancora in raccolta. Lo script dichiara i blocchi non disponibili invece di ignorarli.

**Nuovi script:** `dataset/verify_cards.py`, `dataset/reconstruct_cards.py`,
`models/ablate.py`. Modificati: `discovery/build_registries.py`,
`dataset/build_observations.py`, `docs/architecture/dizionario-metriche.md`.

**Non ancora fatto:** ablazioni di arbitro, allenatore, contesto, giocatori e spaziale;
contratto di esportazione; test di parità Python ↔ TypeScript; registro dei modelli.

### Il ponte fra Python e TypeScript — 16 agosto 2026, notte

**Decisione dell'utente:** il predittore TypeScript nasce **fuori dall'applicazione**, in
`scripts/projection/`, e ci resta finché un modello non avrà superato backtest, baseline,
parità e controlli di contaminazione e non avrà raggiunto lo stato `validated` o
`production` nel registro dei modelli. Non un prototipo: codice tipizzato, deterministico,
senza dipendenze inutili, con import senza estensione, scritto per traslocare in
`apps/web/src/server/` senza riscritture. `apps/web` non è stato toccato.

**`models/export_model.py`** scrive l'artefatto versionato e, accanto, una **tavola di
riscontro** di duecento righe: feature grezze e i valori che Python ottiene da quelle righe.

**Una deviazione deliberata dal contratto scritto:** il checksum non vive dentro
l'artefatto ma in un file accanto, e copre i **byte** del file. Un checksum calcolato su
una riscrittura del JSON dipenderebbe da come i due linguaggi scrivono i numeri in virgola
mobile — l'unico punto in cui divergono senza avvisare. I byte non divergono.

**Tre moduli TypeScript**, uno per responsabilità: `artifact-schema.ts` (forma, coerenza,
caricamento con verifica dell'impronta), `feature-transform.ts` (ordine dichiarato, rifiuto
dei mancanti e dei non finiti, standardizzazione), `predictor.ts` (predittore lineare,
collegamento, taglio, quantili di Poisson e binomiale negativa calcolati per ricorrenza).

**Il test di parità passa su tre artefatti** — `yellow_cards__poisson_glm` con collegamento
logaritmico e intervallo di Poisson, `total_shots__ridge` e `fouls__ridge` con collegamento
identità, taglio a zero e intervallo binomiale negativo a due dispersioni diverse.
**19 prove su 19.** Scarto massimo su 600 righe:

| | Scarto massimo | Tolleranza dichiarata |
| --- | ---: | ---: |
| predittore lineare, relativo | **2,4e-16** | 1e-9 |
| valore atteso, assoluto | **3,6e-15** | 1e-6 |
| estremi dell'intervallo, assoluto | **0** | 1e-6 |

Sette ordini di grandezza dentro la tolleranza, e gli estremi dell'intervallo coincidono
esattamente: i quantili discreti calcolati per ricorrenza danno gli stessi interi di SciPy.

Le altre prove coprono i confini del contratto: feature mancante e feature non finita non
producono una previsione peggiore, non ne producono nessuna; elenco più corto dell'ordine
dichiarato; feature costante che si standardizza senza dividere per zero; taglio a zero;
artefatto con lunghezze incoerenti, schema sconosciuto e checksum sbagliato, tutti
rifiutati.

`npm run test:projection` compila con il `tsc` dell'applicazione — preso a prestito senza
modificarla — e lancia `node --test`. La cartella `build/` è esclusa dal versionamento.

**Cinque artefatti esportati e cinque validati.** `models/registry.py` scrive
`data/registro-modelli.json` calcolando lo stato da prove già scritte altrove, condizione
per condizione: batte la migliore baseline, vince la maggioranza delle origini, passa i
controlli di contaminazione, supera la parità, ha un intervallo calibrato.

| Modello | Errore | Vantaggio | Origini | Stato |
| --- | ---: | ---: | :---: | --- |
| `total_shots__ridge` | 3,6233 | +4,07% | 5/5 | validated |
| `fouls__ridge` | 2,8263 | +4,25% | 5/5 | validated |
| `shots_on_target__ridge` | 1,7833 | +3,18% | 5/5 | validated |
| `corner_kicks__ridge` | 2,1026 | +3,04% | 5/5 | validated |
| `yellow_cards__poisson_glm` | 1,0675 | +1,32% | 5/5 | validated |

**Il registro non promuove.** `production` resta una decisione umana: il registro la
prepara e non la prende, altrimenti la promozione diventa un effetto collaterale. Il test
di parità gira su tutti e cinque, **26 prove su 26**, e scrive il proprio esito in un file
che il registro cita come prova.

**Non ancora fatto:** ablazioni di arbitro, allenatore, contesto, giocatori e spaziale;
estensione agli altri 56 target; decisione umana di promozione.

### I blocchi che mancavano, e la selezione per bersaglio — 17 agosto 2026, mattina

**Prima di scrivere un costruttore si è guardato che cosa la fonte restituisce davvero.**
`discovery/scan_prematch.py` legge i due blocchi raccolti per ultimi — 9.205 dettagli gara
e 382.318 righe per giocatore — e misura copertura, tipi e distribuzione senza una sola
richiesta di rete.

**Quattro campi che il metodo chiede non esistono.** Spettatori, girone, gara di andata e
sostituzione: **zero per cento** su 9.205 gare. **Campo neutro è falso ovunque** e `has_xg`
pure: due costanti, non due feature. Il **derby** è vero in 55 gare, lo 0,6%.

**Meteo, terreno e distanza di viaggio esistono solo da metà aprile 2026:** 0% fino a
marzo, 18% ad aprile, 82% a maggio. Non sono un campo sparso, sono un campo **nuovo**: in
finestra avanzante cadrebbero tutti nell'ultima origine. Dichiarati non addestrabili.

**Le medie già pronte di arbitro e allenatore sono una fotografia di oggi**, non di prima
di quella gara: `avg_yellow_per_match`, `career_*`, `win_pct`, `preferred_formation`, con
tanto di `stats_updated_at`. Usarle nel dataset storico sarebbe contaminazione. Si
ricostruiscono dall'archivio: l'arbitro ha almeno tre gare precedenti nel **68,4%** delle
gare e cinque nel 57,3%; l'allenatore tre nell'**89,1%** dei lati.

**Il ruolo e la titolarità non esistono** nelle statistiche per giocatore: 79 campi, nessuno
dei due. Otto campi sono vuoti al 100%. Il blocco giocatori descrive quindi la rotazione,
non la formazione — ed è il limite del dato, non una scelta.

**Cinque blocchi nuovi**, tutti «al momento di»: arbitro (`build_features.py`, profilo
calcolato per gara e non per riga, perché le due righe di una gara condividono l'arbitro e
uno spostamento di una riga farebbe entrare il lato gemello), allenatore, contesto,
classifica ricostruita da punti e reti, rosa (`build_players.py`, 18.377 righe) e spaziale
(`build_shots.py`, **211.950 tiri**, sistema di coordinate verificato: sotto la soglia
dell'area l'xG medio è 0,148 e sopra 0,040). Da 52 a **113 colonne**, controlli di
contaminazione passati su tutti i target.

**La domanda sull'arbitro ha avuto la sua risposta, in due fasi decise dall'utente.**

*Fase A, misura pulita* sul sottoinsieme con almeno cinque gare precedenti (10.267 righe),
stesse righe e stesse origini con e senza il blocco: **+0,215%** Poisson e +0,177% ridge.
Ma il dato che conta è un altro: **in casa +0,134%, in trasferta +0,447%**. In trasferta
l'arbitro è il primo blocco di tutti, davanti all'avversario. Sul totale di gara, 1,6408 →
**1,6320**.

*Fase B, produzione* con restringimento verso la media di lega: il guadagno **cresce**
invece di diluirsi — ammoniti +0,244%, falli +0,411% — perché il restringimento aggiunge
2.500 righe senza togliere segnale. **La forza del prior è ininfluente:** fra k=3 e k=10 lo
scarto è 0,0004 di MAE contro una deviazione fra origini di 0,021.

**Ablazioni complete, cinque target, undici blocchi, 12.430 righe.** Costo dell'errore
togliendo il blocco, Poisson:

| Blocco | Tiri | Tiri in porta | Corner | Falli | Ammoniti |
| --- | ---: | ---: | ---: | ---: | ---: |
| avversario | **+2,667%** | +0,514% | +0,885% | **+3,790%** | +0,263% |
| base | +0,374% | +0,452% | +0,524% | +0,115% | +0,094% |
| classifica | +0,255% | +0,192% | **+0,577%** | −0,032% | +0,009% |
| arbitro | +0,008% | +0,051% | −0,038% | **+0,334%** | **+0,216%** |
| spaziale | +0,066% | **+0,260%** | +0,130% | +0,162% | +0,056% |
| giocatori | −0,006% | −0,085% | +0,101% | +0,065% | −0,151% |
| allenatore | −0,028% | −0,028% | +0,043% | +0,011% | +0,038% |
| casa/trasferta | +0,003% | +0,006% | −0,010% | 0,000% | 0,000% |
| riposo | −0,006% | −0,011% | −0,005% | 0,000% | −0,009% |

**Casa/trasferta e giorni di riposo escono definitivamente:** sotto lo 0,01% su tutti e
cinque, con segno negativo in metà dei casi, e con il doppio delle feature attorno.

**La selezione è per bersaglio, non globale**, come deciso dall'utente. `select_features.py`
misura costo **origine per origine**, importanza per permutazione senza riaddestrare,
errore per fascia di storico e costo di trasporto in produzione; scarta solo se il guadagno
è nullo, oppure piccolo **e** instabile **e** costoso da trasportare. Sui modelli lineari il
contributo di Shapley coincide con il termine lineare standardizzato: si riporta quello
invece di stimare per campionamento un numero noto in forma chiusa.

Nessun blocco è stato eliminato ovunque: l'arbitro resta sui due bersagli disciplinari, lo
spaziale su quattro su cinque, la rosa su tiri, corner e falli, la classifica su tre.

**Il manifesto potato batte l'insieme intero su quattro target su cinque**, e batte anche i
cinque modelli del registro:

| Target | Feature | MAE prima | MAE ora | Vantaggio su baseline | Origini |
| --- | :---: | ---: | ---: | ---: | :---: |
| Tiri | 61/111 | 3,6233 | **3,6012** | +4,84% | 5/5 |
| Falli | 79/111 | 2,8263 | **2,7868** | +4,82% | 5/5 |
| Corner | 79/111 | 2,1026 | **2,0729** | +4,18% | 5/5 |
| Tiri in porta | 69/111 | 1,7833 | **1,7680** | +3,64% | 5/5 |
| Ammoniti | 81/111 | 1,0675 | **1,0553** | +1,28% | 5/5 |

**Prodotti:** `data/manifesto-feature.json`; `discovery/scan_prematch.py`,
`dataset/build_players.py`, `dataset/build_shots.py`, `models/select_features.py`.
Modificati: `dataset/build_observations.py` (arbitro, stadio, turno, derby e gol nella
chiave), `dataset/build_features.py`, `models/ablate.py`, `models/evaluate.py`.

**Non ancora fatto:** il calcolo delle feature «al momento di» in TypeScript e la sua
parità; il registro dei modelli non è stato rigenerato sui modelli potati; l'affidabilità e
la gerarchia di ripiego; gli altri 56 target.

### Le feature «al momento di» arrivano in TypeScript — 17 agosto 2026, mattina

**L'ostacolo che bloccava l'integrazione è caduto.** Il predittore sapeva rifare il conto,
ma le feature esistevano solo in Python: ora esistono in tutti e due i linguaggi e i numeri
coincidono.

**Prima il contratto, poi il codice.** `docs/architecture/contratto-feature-al-momento-di.md`
stabilisce che cosa il lato che prevede riceve già calcolato — medie di lega, profilo
dell'arbitro, aggregati di rosa, tutto ciò che richiede un archivio che una singola gara non
ha — e che cosa calcola sul posto dalla storia delle due squadre.

**Tre insidie, tutte verificate contro la libreria che addestra prima di scrivere una riga:**
la finestra «ultime N» conta le **gare**, non i valori noti, quindi una gara senza pannello
occupa il suo posto e riduce il campione; la deviazione standard divide per n; la media
esponenziale **non salta** i valori ignoti — escono dalla somma ma il loro posto continua a
pesare nell'esponente. La formula è stata confrontata con pandas prima di essere tradotta:
scarto 4,4e-16.

**Quattro moduli, un gruppo per unità di calcolo**, in `scripts/projection/asof/`. Un
modello che dichiara 61 colonne non ne fa calcolare 113: `calcolo.ts` deduce i gruppi
necessari dalle colonne e chiama solo quelli. Una colonna che nessun gruppo produce ferma il
calcolo invece di restituire un vettore incompleto.

**Il campione di riscontro** (`models/export_asof.py`) scrive, per quaranta righe reali per
target, l'ingresso completo così come il predittore lo riceverà — 1.568-1.668 gare di storia
serializzate ciascuno — e le feature che Python ha calcolato da quell'ingresso. L'ingresso
porta il profilo dell'arbitro **non ristretto**: il restringimento è una regola di chi
prevede, e il test verifica anche quella.

**Test di parità: 12 prove su 12, cinque target.** Su 3.240 confronti per target, oltre il
90% è fra due numeri veri e non fra due assenze — il test lo pretende e lo dichiara.
L'unica divergenza trovata è stata corretta: senza prior di lega Python annulla il profilo
dell'arbitro, e ora anche TypeScript lo annulla invece di tenere il valore grezzo, che fra
leghe diverse non sarebbe confrontabile.

Il test del predittore continua a passare: **26 prove su 26**. Nuovo script `npm run
test:asof`. **`apps/web` non è stato toccato.**

**Non ancora fatto:** rigenerare il registro dei modelli sui modelli potati; affidabilità e
gerarchia di ripiego; il trasporto in produzione di ciò che si riceve già calcolato; gli
altri 56 target.

### L'effetto casa: di chi è davvero — 17 agosto 2026, pomeriggio

**Domanda dell'utente:** se una squadra in casa è più aggressiva e commette più falli, perché
il blocco casa/trasferta è stato scartato sui falli?

**La risposta ha richiesto di separare due cose che portavano lo stesso nome.** L'effetto
casa **della lega** è sempre stato nel modello: `lega_lato_media` e `baseline_lega` sono
calcolate per lato e stanno nel blocco `base`, che nessun target ha mai scartato. Il blocco
`casa_trasferta` conteneva un'altra cosa: lo **scostamento personale** di una squadra da
quell'effetto medio.

**`dataset/verify_home_away.py`, tre prove su 472 squadre-stagione.** L'effetto medio di
lega, casa meno trasferta: falli **−0,325**, ammoniti −0,234, tiri **+2,355**, tiri in porta
+0,788, corner +0,932. In casa si commettono **meno** falli, non di più: l'intuizione era
giusta sul fatto che il lato conti, sbagliata sul segno.

Lo scostamento personale, invece, non esiste:

| Metrica | sd fra squadre | sd attesa dal caso | varianza vera | ripetibilità metà su metà |
| --- | ---: | ---: | ---: | ---: |
| Falli | 1,278 | 1,324 | **0,0%** | −0,024 |
| Ammoniti | 0,476 | 0,470 | 2,3% | 0,011 |
| Tiri | 1,800 | 1,773 | 2,9% | 0,060 |

Sui falli la dispersione osservata è **minore di quella che il caso produce da solo**
mescolando le etichette. Non c'è niente da imparare, e una feature che pretende di
impararlo aggiunge solo varianza. Coerenza notevole con l'ablazione: i tiri, unica metrica
con un residuo di varianza vera, sono anche l'unico target che aveva tenuto il blocco.

**Ma c'era qualcosa di vero da cercare, e non era dove sembrava.** L'effetto casa **cresce
con la forza**: sugli ammoniti va da 0,127 delle squadre deboli a **0,395** delle forti,
correlazione con i punti per gara **−0,243**. Quello è un parametro solo, non uno per
squadra, e si può stimare.

**Nuovo blocco `interazione`**, quattro colonne: l'indicatore esplicito di lato, e il lato
moltiplicato per divario di classifica, scarto dalla lega e severità dell'arbitro. Un
modello lineare non può inventare un prodotto.

**Guadagno, stesse righe e stesse origini:** ammoniti **+0,151%**, tiri in porta +0,141%,
corner +0,072%, falli +0,061%, tiri +0,014%. Positivo su tutti e cinque, tenuto da tutti e
cinque. E `interazione_casa` risulta **la prima feature per importanza di permutazione** su
corner (1,52%), tiri in porta (1,09%) e ammoniti (0,29%): l'indicatore di lato, il segnale
più semplice di tutti, semplicemente **non c'era**.

**Un difetto della selezione, trovato e corretto.** Su `total_shots` il manifesto era sceso
a 39 feature e il modello peggiorava: la decisione blocco per blocco misura un contributo
*marginale*, e due blocchi che dicono la stessa cosa sembrano entrambi superflui finché non
si tolgono insieme. `select_features.py` ha ora un **passo di conferma**: se il set potato
perde contro l'insieme intero, reintegra il blocco più promettente finché il conto torna.
Su `total_shots` ha reintegrato `classifica`, da 39 a 45 colonne.

**Vantaggio sulla migliore baseline, manifesto definitivo:** falli **+4,81%**, tiri +4,71%,
corner +4,26%, tiri in porta **+3,85%**, ammoniti **+1,39%**, tutti 5 origini su 5,
copertura dell'intervallo 0,795–0,804 contro 0,80 dichiarato. Rispetto al manifesto senza
interazioni: meglio su quattro target, appena sotto sui tiri.

**Un fatto che resta:** l'errore è sistematicamente più alto sulla squadra in trasferta —
falli 2,863 contro 2,711, ammoniti 1,077 contro 1,031. Prevedere l'ospite è più difficile, e
non è un caso che sia proprio lì che l'arbitro conta di più.

**Il modulo e i ruoli non sono disponibili:** le formazioni non sono state raccolte, e le
statistiche per giocatore non portano né posizione né titolarità. Servirebbe la raccolta
delle formazioni, circa 9.200 richieste, da cui ricavare il modulo più usato nelle gare
precedenti — che sarebbe legittimo, perché guarda solo al passato.

### Il registro allineato e la regola della quarta giornata — 17 agosto 2026, sera

**Il registro descriveva i modelli di ieri.** Gli artefatti erano addestrati sulle 52
colonne precedenti mentre il manifesto ne prescriveva 45-88, e finché il registro non
descrive i modelli che si vogliono promuovere, promuovere è impossibile.

`export_model.py` non sapeva leggere il manifesto né citare il rapporto giusto: ora accetta
`--solo-manifesto` e `--suffisso-validazione`, e ogni artefatto **dichiara da dove vengono
le sue colonne** — due modelli con lo stesso nome e feature diverse sono due modelli
diversi. `registry.py` inciampava sui campioni `-riscontro-asof.json`: ora riconosce un
artefatto dallo schema e non dal nome.

**Dieci artefatti, non cinque:** entrambi i modelli riproducibili su tutti e cinque i
bersagli, perché la scelta di quale promuovere è una decisione umana e va fatta sui numeri.

| Bersaglio | Poisson | ridge | migliore | vantaggio | origini |
| --- | ---: | ---: | :---: | ---: | :---: |
| Tiri | 3,6177 | **3,6095** | ridge | +4,71% | 5/5 |
| Falli | 2,7924 | **2,7870** | ridge | +4,81% | 5/5 |
| Corner | **2,0764** | 2,0788 | Poisson | +4,26% | 5/5 |
| Tiri in porta | **1,7663** | 1,7669 | Poisson | +3,85% | 5/5 |
| Ammoniti | **1,0541** | 1,0602 | Poisson | +1,39% | 5/5 |

Su corner e tiri in porta i due sono appaiati alla terza cifra. Sugli ammoniti Poisson è
l'unico dei due a vincere tutte e cinque le origini.

**La domanda aperta sulla quarta giornata ha avuto la sua misura.** Il motore deve partire
da tre gare precedenti, e quel caso non era mai stato misurato davvero. Il perché è
quantificato: le righe con 3-4 gare precedenti sono **770 in tutto, ma 578 cadono in
agosto-settembre 2025** — l'inizio della stagione europea, che sta interamente
nell'addestramento. Nel periodo di prova ne restano **87**, con cui il MAE si stima a ±10%.

Correzione dell'utente, decisiva: **non si riaddestra su un campione ridotto per simulare
l'inizio stagione.** Ciò che scarseggia alla quarta giornata è lo storico *della squadra*,
non quello di addestramento. `validate_maturity.py` misura quindi con la stessa finestra
avanzante della validazione principale, stratificando l'errore per fascia.

**Il motore alla quarta giornata regge.** In fascia EARLY nessun ripiego batte il modello
oltre il rumore: gli scarti appaiati fra modello completo, modello ridotto e baseline con
restringimento stanno sotto 2,4 errori standard su tutti e cinque i bersagli. L'unico
metodo nettamente peggiore è la baseline dell'avversario, da 1,8 a 5,4 errori standard: con
tre gare il profilo dell'avversario è troppo rumoroso per essere il cardine.

**Ma tre gare non dicono la stessa cosa a tutte le metriche.** Il peso della miscela fra
modello e baseline, stimato sui treni dove le righe in fascia sono centinaia:

| Bersaglio | EARLY | DEVELOPING | MATURE |
| --- | :---: | :---: | :---: |
| Tiri | 0,75 | 0,95 | 1,00 |
| Tiri in porta | 0,75 | 1,00 | 1,00 |
| Corner | 0,90 | 1,00 | 1,00 |
| Ammoniti | 0,90 | 1,00 | 1,00 |
| Falli | 0,95 | 0,80 | 1,00 |

I tiri hanno bisogno del doppio di restringimento degli ammoniti. **Il congelamento non
costa nulla:** peso congelato contro peso ristimato a ogni origine, gli scarti sono nella
terza cifra (corner 2,0602 contro 2,0561, ammoniti 1,0173 contro 1,0173).

**L'ordine dei gradini di ripiego è misurato, non fisso.** Il metodo mette la baseline
dell'avversario prima di quella con restringimento; sui dati è vero solo sui tiri a storico
pieno, e mai in fascia EARLY. L'ordine sta nell'artefatto, fascia per fascia, con l'errore
che lo giustifica. Un test lo ha dimostrato trovando un errore vero: sotto il minimo di gare
i ripieghi venivano ordinati come a stagione inoltrata.

**L'affidabilità sintetica non è stata scritta, ed è una decisione, non una dimenticanza.**
La strada naturale — la stabilità dell'errore fra periodi — è misurabilmente inutilizzabile
dove serve: in fascia EARLY l'oscillazione osservata fra origini è **minore di quella che il
caso produce da solo** con ventisei righe per origine, quindi l'instabilità vera risulta
zero e la formula concluderebbe che la quarta giornata è la fascia più affidabile di tutte.

| Bersaglio | fascia | sd osservata | sd attesa dal caso | instabilità vera |
| --- | --- | ---: | ---: | ---: |
| Tiri | EARLY | 0,438 | 0,961 | **0** |
| Corner | EARLY | 0,425 | 0,575 | **0** |
| Ammoniti | EARLY | 0,153 | 0,183 | **0** |
| Ammoniti | MATURE | 0,030 | 0,021 | 0,021 |

La proiezione espone quindi le **componenti misurate** e il livello resta nullo. Le altre
strade valutate: la copertura dell'intervallo è calibrata a 0,80 ovunque per costruzione e
non distingue le fasce; il vantaggio sulla previsione banale vale 0,01-0,05, vero e
inutilizzabile.

**Nuovo modulo `production.ts`:** fascia, miscela, intervallo calibrato dentro la fascia,
gerarchia di ripiego, componenti dell'affidabilità. Il ripiego **non dichiara un
intervallo**, perché nessuno lo ha calibrato su quelle baseline. Lo schema dell'artefatto
rifiuta un peso fuori da zero e uno o una colonna di miscela che il modello non riceve.

**Verifiche: `test:projection` 41 su 41, `test:asof` 12 su 12, `test:production` 12 su 12.**

**Pubblicazione, su decisione dell'utente:** `main` invariato e in produzione;
`gara-giocata` spinto com'è; il motore su un ramo nuovo **`motore-proiezione`** nato da
`main`, così non eredita la gara giocata. Nessun merge fra i tre rami senza decisione
esplicita. I dati grezzi (636 MB) e i dataset derivati (275 MB) restano fuori dal
repository e **non sono in alcun backup**.

**Non ancora fatto:** l'affidabilità sintetica; il modello a feature ridotte come gradino
del ripiego, competitivo ma non distinguibile dal completo; il ponte verso l'applicazione
per ciò che il predittore riceve già calcolato; la distribuzione predittiva con le cinque
linee; gli altri 56 bersagli.

### Curve, discriminazione e i due bersagli nuovi — 19 agosto 2026, pomeriggio

**La curva di accuratezza entra nei rapporti di maturità.** Non più un errore medio soltanto,
ma la quota di righe entro ciascuna soglia — undici soglie da 0,5 a 8, con intervallo di
Wilson — misurata fuori campione, complessiva, per fascia e per lega. Aggiunta additiva:
schema del rapporto a `validazione-maturita/2`, nessun consumatore legge quella stringa.
**Non-regressione superata:** il MAE con peso congelato riproduce esattamente i valori
precedenti (corner EARLY 2,0602 · ammoniti EARLY 1,0173).

**L'analisi di discriminazione, su tutti e sette i bersagli.** La domanda è: che cosa separa
le gare in cui il modello azzecca da quelle in cui sbaglia? Risposta misurata, e in parte
scomoda.

**Le tre fasce di maturità non discriminano.** Su nessun bersaglio, a nessuna soglia: gli
intervalli di EARLY contengono sempre MATURE. Su falli e tiri in porta la fascia con meno
storico è persino migliore. Un punteggio costruito sulla fascia ripeterebbe l'errore già
scartato con la stabilità temporale.

**Ciò che discrimina è la statura della gara, non la disponibilità dei dati.** In ordine:
livello atteso della proiezione (da −6,0 a −9,9 punti, segno sempre negativo: più alta la
previsione, meno si azzecca), ampiezza dell'intervallo, lega, scarto dalla media di lega,
scarto fra le classifiche. **Non discriminano affatto:** storico della squadra,
dell'avversario e dei giocatori, allenatore, turno, giorni di riposo, qualità del confronto,
stabilità della rosa, periodo di prova. **L'arbitro serve con un solo numero e su un solo
bersaglio:** ammoniti medi dell'arbitro sugli ammoniti, −7,6 punti a 5,4 errori standard.

**Un errore vero trovato e corretto** in `discriminate.py`: la verifica di coerenza contava
come concorde solo uno scarto positivo, quindi scartava i discriminatori più forti perché
vanno in direzione opposta.

**Il motore si estende a fuorigioco e parate**, con la pipeline esistente e senza toccare i
cinque già validati. Fuorigioco Poisson MAE 1,0841, +4,84% sulla migliore baseline, 5 origini
su 5, 56 feature; parate ridge MAE 1,4752, +2,89%, 5 su 5, 70 feature. **Le parate sono
l'unico bersaglio che continua a mescolare con la baseline anche a storico pieno:** peso
MATURE 0,95. `MIN_PREVIOUS_MATCHES = 3` resta anche per i due nuovi: nessuna regola diversa
perché sono nuovi.

**Una cancellazione evitata:** `select_features.py` riscriveva il manifesto invece di
fonderlo, quindi `--target offsides` avrebbe azzerato le cinque voci esistenti. Corretto
prima di lanciarlo, perché il file è stato letto prima di essere usato.

### L'affidabilità prende un numero — 19 agosto 2026, sera

**La parità as-of falliva su `offsides`, e la causa non era di `offsides`.** Il lato
TypeScript non conosceva affatto la famiglia `interazione_casa*` — le quattro colonne
dell'effetto casa — e `gruppoDi` non le assegnava a nessun gruppo. I cinque bersagli validati
non lo mostravano perché i loro campioni di riscontro erano fermi al 17 agosto alle 09:54,
**precedenti** alla riselezione delle feature delle 16:34: verificavano 61-81 colonne mentre
gli artefatti ne dichiaravano 45-88. Aggiunto il gruppo `interazione` in `asof/gruppi.ts`,
rileggendo i fattori dai gruppi che li producono invece di ricalcolarli; rigenerati i cinque
campioni scaduti. Ora le colonne verificate coincidono **esattamente** con il manifesto su
tutti e sette.

**L'affidabilità è definita, ed è una decisione dell'utente.** È la probabilità, misurata
fuori campione, che lo scarto resti entro una **soglia assoluta specifica del bersaglio**,
esposta come punteggio 0-100 con fasce di lettura. La soglia non è scelta a mano: è l'errore
assoluto medio della migliore baseline arrotondato all'unità — sotto quella distanza il
modello vale più del non sapere nulla. Una regola sola per tutti e sette.

| Bersaglio | Migliore baseline | MAE | Soglia | Punteggio |
| --- | --- | ---: | :---: | ---: |
| Tiri | attacco contro concesso | 3,7880 | 4 | 62 |
| Tiri in porta | restringimento | 1,8370 | 2 | 63 |
| Corner | restringimento | 2,1687 | 2 | 55 |
| Falli | restringimento | 2,9278 | 3 | 61 |
| Ammoniti | lega | 1,0690 | 1 | 54 |
| Fuorigioco | lega | 1,1392 | 1 | 54 |
| Parate | lega | 1,5191 | 2 | 73 |

Il criterio era misurato solo sui cinque; esteso qui ai due nuovi. **La curva intera resta
nell'artefatto:** cambiare soglia domani non costa un riaddestramento.

**Il punteggio si legge dentro la fascia**, perché è lì che è misurato sulla miscela
congelata, e porta la sua incertezza binomiale: in EARLY è larga venti punti e non si
nasconde. **Sotto un ripiego il livello non si dichiara affatto** — nessuno lo ha misurato su
quella baseline. Lo schema rifiuta l'artefatto se il punteggio non viene dalla quota che
dichiara o se l'incertezza non lo contiene.

**Riesportazione puramente additiva su tutti e quattordici gli artefatti:** coefficienti,
intercetta, schema delle feature, calibrazione e metadati identici bit per bit; le tavole di
riscontro del predittore differiscono solo nel checksum. Nessun riaddestramento effettivo.

**Una prova falliva, ed era un'assunzione sbagliata del test, non del codice.** «A storico
maturo il valore atteso è quello del modello, senza miscela» valeva quando i bersagli erano
cinque, tutti con peso 1,00. Le parate no. Prima della riesportazione il test non lo vedeva,
perché i due bersagli nuovi non avevano ancora i parametri di maturità nell'artefatto e
venivano saltati. Ora verifica che si applichi **il peso dichiarato**, non che sia uno.

**Verifiche: `test:projection` 53/53, `test:asof` 14/14, `test:production` 17/17, registro 14
modelli su 14 `validated`.** I quattro artefatti nuovi sono passati da `experimental` a
`validated`.

**Registrata in architettura l'estensione `match-context-pace`** (§8ter): contesto e ritmo
della gara come **gruppo di feature del motore esistente**, non un motore nuovo, con ablazione
bersaglio per bersaglio, selezione target-specific, nessun peso a mano, e il vincolo che non
entra automaticamente nell'affidabilità. Il §8bis non dice più «affidabilità non definita»; la
definizione sta nel nuovo §8quater.

**Non ancora fatto:** lo strato condizionale dell'affidabilità, che entra solo se batte fuori
campione la costante per fascia; la costruzione di `match-context-pace`; quale modello passa a
`production`; se pubblicare `gara-giocata`; il ponte verso l'applicazione.

### Contesto e ritmo della gara, e l'affidabilità che cambia partita per partita — 19 agosto 2026, notte

**L'archivio conteneva già quasi tutto, e non era mai stato usato.** Fino a stasera le feature
leggevano dal pannello statistico la sola colonna del bersaglio più le quattro della severità
arbitrale. Possesso, territorio, duelli, contrasti, reti attese, occasioni nitide, palle
inattive: raccolti su 15.810 righe su 18.610, completi al 100% dove il pannello c'è, e fermi.

**`match-context-pace` è nato da lì**, spezzato in **sette famiglie** invece che in un blocco
unico, perché la selezione lavora per blocco e un blocco da 140 colonne entrerebbe o uscirebbe
tutto insieme. Trentasei metriche, quattro viste ciascuna — prodotto, concesso, e le stesse due
per l'avversario — da 117 colonne candidate a 257. Nessuna sotto la soglia di densità, e il
costo in copertura è **zero righe** su tiri e fuorigioco, 54 su 16.662 sugli ammoniti.

**Un errore vero, trovato prima di sprecare il calcolo.** `evaluate.py` teneva una **seconda
copia** dell'elenco dei prefissi delle feature e non conosceva i nuovi: il dataset aveva 257
colonne, l'ablazione ne vedeva 115, e nessun errore lo diceva. Le due liste ora sono allineate,
con scritto sopra perché la copia esiste e che cosa succede se divergono.

| Famiglia | Bersagli che la promuovono |
| --- | --- |
| `territorio` | tiri, tiri in porta, corner, ammoniti, parate |
| `intensita` | corner, parate |
| `incrociato` | tiri, parate |
| `ambiente_tiro` | parate |
| `ambiente_gol` | ammoniti |
| `circolazione` | nessuno |
| `inattive` | nessuno |

**Possesso, passaggi, accuratezza, palle lunghe, punizioni, rimesse e rinvii non servono a
niente, su nessuno dei sette.** È un risultato quanto gli altri: quella strada è percorsa.

**In produzione, per decisione dell'utente, solo dove pesa:** corner 2,0764 → **2,0637**
(+0,61%) e parate 1,4804 → **1,4699** (+0,71%, cinque origini su cinque). Il guadagno
end-to-end è quattro volte quello del singolo blocco nell'ablazione, perché la riselezione ha
tolto blocchi che facevano più danno che bene: sulle parate sono usciti `avversario`, `forma`,
`riposo`, `giocatori`, `arbitro`, `spaziale` e `contesto`. Le righe utilizzabili **aumentano**.
Sulle parate il modello migliore passa da ridge a poisson.

**L'affidabilità non è più una costante.** Una regressione logistica stima per la singola gara
la probabilità che lo scarto resti entro la soglia, da valore atteso, gare precedenti delle due
squadre e scarto normalizzato dalla lega. **Non si addestra sugli errori del proprio periodo di
addestramento**, dove sarebbero ottimisti: si addestra sugli errori fuori campione delle
origini precedenti e si valuta sulla successiva.

| Bersaglio | Esito | Guadagno di Brier |
| --- | --- | ---: |
| Tiri | promosso 4/4 | +1,26% |
| Tiri in porta | promosso 4/4 | +0,99% |
| Corner | promosso 3/4 | +0,49% |
| Falli | **costante** 2/4 | +0,35% |
| Ammoniti | promosso 4/4 | +0,74% |
| Fuorigioco | promosso 3/4 | +0,63% |
| Parate | promosso 4/4 | **+1,85%** |

**I falli sono passati da promossi a non promossi, ed è la correzione più istruttiva della
serata.** La prima misura usava `scarto_dalla_lega`, che non è fra le colonne che il modello
dei falli riceve: una condizione che in produzione non sarebbe mai arrivata. Ristretto
l'insieme a ciò che è davvero disponibile, i falli scendono a 2 origini su 4 e restano alla
costante.

**La lega è stata provata e scartata.** Batteva la costante su cinque bersagli, ma non batte
mai il condizionale semplice: da −0,12% a −0,76% su tutti e sette. Nessuna tabella di leghe
nell'artefatto, e la cautela dell'utente sugli estremi scelti dai dati era fondata.

**Il punteggio ora si muove davvero.** Su ammoniti e fuorigioco scende con meno storico — 55 a
41 e 55 a 35 — che è una distinzione che la costante non poteva esprimere. Sul ripiego resta
assente, e se una condizione manca si torna alla costante della fascia, mai a zero.

**Verifiche: `test:projection` 53/53, `test:asof` 14/14, `test:production` 20/20, registro 14
modelli su 14 `validated`.** La parità copre anche le 96 colonne nuove delle parate e le 52 dei
corner, verificate cifra per cifra su 40 righe reali per bersaglio.

**Deciso dall'utente e registrato:** la raccolta delle formazioni è **riaperta come blocco
separato**, con `PRE_LINEUP` e `CONFIRMED_LINEUP` come due istantanee distinte e il vincolo che
la formazione ufficiale non entri mai nel modello provvisorio. Non è ancora iniziata.

**Non ancora fatto:** il ponte verso l'applicazione — `production.ts` vive ancora in
`scripts/projection/` e `apps/web` non ne importa una riga; la distribuzione predittiva con le
cinque linee; le fasi B, C e D delle formazioni; quale modello passa a `production`; se
pubblicare `gara-giocata`.

### Il motore entra nell'applicazione, e il livello dati prende una tavola — 20 agosto 2026

**Il trasloco e' fatto e non e' costato una riga di modifica.** Gli otto moduli puri —
artefatto, trasformazione, predittore, produzione e i quattro dell'as-of — sono in
`apps/web/src/server/iqstats/projection/`. I test di parita' restano in
`scripts/projection/tests/`, perche' consumano i campioni di riscontro che Python produce
e appartengono al lato che ricerca: il loro `tsconfig` ora ha la radice del progetto come
radice del compilato. **53/53, 14/14, 20/20 prima e dopo**, piu' typecheck e lint di
`apps/web` puliti.

**Decisione dell'utente: la storia viene dal database, non dalla fonte a ogni richiesta.**
La ragione e' misurata. Ricostruire l'ingresso di una gara dalla fonte costerebbe circa
centoventi richieste per le due squadre, e le **medie di lega «al momento di» non sarebbero
comunque ricostruibili**: richiedono tutte le gare della competizione fino a quell'istante.
Lo schema `football` aveva gare, squadre, arbitri e classifiche, ma **nessuna tavola di
statistiche**.

**Due tavole nuove**, `football.team_match_observations` e
`football.player_match_observations`. La prima porta 46 colonne metriche — le sette
famiglie del pannello, la disciplina ricostruita dagli episodi, il profilo della mappa dei
tiri — piu' identita', contorno, reti, la classe di provenienza per singolo valore e lo
stato di ciascuna delle tre letture. La seconda esiste perche' i quindici `giocatori_*`
promossi su corner e falli si costruiscono dalle statistiche per giocatore, e senza quelle
non esistono.

**Un errore vero, trovato prima che costasse.** Il profilo della mappa dei tiri era
`numeric` a cinque decimali: sono quozienti e medie in doppia precisione, e il test di
parita' li confronta con scarto relativo 1e-9. Cinque decimali li arrotondano **senza dare
errore**. Ora sono `double precision`. Le tre metriche continue del pannello restano
`numeric(8,4)`: misurate, hanno al massimo due decimali.

**Un secondo errore vero, nella funzione di scrittura.** Era scritta con tabelle
temporanee e `search_path` vuoto — la scelta di sicurezza gia' fatta dalle altre funzioni
dello schema — e con `search_path` vuoto una temporanea non si risolve senza qualificarla.
Riscritta in CTE: il problema non c'e' piu' invece di essere aggirato.

**La divergenza sulla media di lega, misurata e dichiarata.** Il lato che addestra sposta
di una **riga** e non di una **gara**: le due righe di una gara stanno nello stesso gruppo,
quindi per una delle due la media di lega comprende la riga gemella, che e' informazione
della gara stessa.

| Grandezza | Righe identiche | Righe diverse | Scarto massimo |
| --- | ---: | ---: | ---: |
| `lega_lato_media` | 40 su 40 | 0 | 0 |
| `lega_lato_campione` | 40 su 40 | 0 | 0 |
| `lega_media` (fuorigioco) | 15 su 40 | 25 | 0,0287 su 2,05 |
| `rif_lega_ammoniti` | 15 su 40 | 25 | 0,0217 su 1,96 |
| `rif_lega_falli` | 15 su 40 | 25 | 0,0552 su 11,97 |

Le medie di lato sono pulite perche' il lato di campo separa le due righe in gruppi
diversi. Il livello dati esclude l'intera gara, che e' la semantica «al momento di» e sara'
comunque la realta' in produzione. **Il test verifica che riaggiungendo la riga gemella si
riottenga esattamente il numero di Python**: la differenza e' spiegata riga per riga, non
assorbita in una tolleranza. Correggere il lato che addestra vorrebbe dire ricostruire i
quattordici modelli, e non si fa senza decisione.

**`test:snapshot`, 16 prove.** Ricostruisce l'ingresso di quarantadue righe reali — sei per
bersaglio — dalle osservazioni e lo confronta con quello che Python ha esportato. Copertura
reale, contata dal test stesso perche' un test che salta in silenzio e' peggio di un test
che non c'e': **1.995 gare, 42 profili d'arbitro, 42 rose per 714 campi, 20.736 metriche di
contesto.** Il taglio temporale e' verificato prima di tutto il resto, gara per gara.

**Il lotto per il database e' prodotto e non tocca la fonte.** `export_observations_batch.py`
impacchetta le osservazioni gia' normalizzate — le stesse righe su cui i modelli sono stati
addestrati — con gli identificativi della fonte: **9.305 gare, 18.610 righe squadra-gara,
382.318 righe giocatore, 24 lotti, 125 MB, zero righe scartate**, 100 gare senza statistiche
per giocatore. La normalizzazione non e' stata riscritta in un secondo linguaggio, ed e'
deliberato.

**Non ancora fatto:** applicare la migrazione e caricare i lotti — Docker e' spento e non
c'e' un Postgres locale, quindi la migrazione **non e' mai stata eseguita da un motore**;
l'aggiornamento incrementale per le gare nuove, che richiede di estendere la raccolta
Python e un tetto di richieste autorizzato; il totale di gara, che richiede la dipendenza
fra i due processi; le cinque linee; le fasi B, C e D.

### Il totale di gara, le cinque linee, e la documentazione nuova della fonte — 20 agosto 2026, sera

**La dipendenza fra i due lati esiste, e' stabile, e non serve.** Confrontati fuori campione,
su quattro origini per bersaglio, due modi di costruire l'incertezza del totale: **A**
calibrazione diretta sui residui della somma, **B** composizione delle due marginali con la
correlazione misurata, attraverso una copula gaussiana. Il centro e' la somma in entrambi, per
vincolo dell'utente, quindi errore assoluto e scostamento non distinguono niente: distinguono
copertura, larghezza e Brier delle linee.

| Bersaglio | rho | Scost. copertura A | B | Brier A | B |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tiri | −0,249 | 0,0190 | 0,0197 | 0,23982 | 0,24012 |
| Tiri in porta | −0,067 | 0,0272 | 0,0308 | 0,21894 | 0,21918 |
| Corner | −0,180 | 0,0173 | 0,0162 | 0,22125 | 0,22148 |
| Falli | +0,072 | 0,0173 | 0,0165 | 0,23848 | 0,23837 |
| Ammoniti | +0,166 | 0,0149 | 0,0173 | 0,18362 | 0,18362 |
| Fuorigioco | −0,062 | 0,0195 | 0,0153 | 0,16791 | 0,16800 |
| Parate | −0,101 | 0,0180 | 0,0105 | 0,20608 | 0,20606 |

**Scarto massimo di Brier fra i due metodi su 28 combinazioni: 0,00058.** I tiri hanno la
correlazione piu' forte e piu' stabile e lì la composizione perde: la dispersione della somma
**contiene gia' la covarianza**.

**L'unica eccezione era apparente, e l'ho misurata invece di assumerla.** Sulle parate la
composizione copriva meglio in tutte e quattro le origini. Allargando la diretta alla stessa
larghezza, con il livello cercato sul solo treno: 0,7871 contro 0,7904, cioe' **due terzi del
vantaggio recuperati**. Il residuo e' granularita' — i quantili interi si muovono a scatti — non
dipendenza. Su due origini su quattro il livello non ha potuto muoversi affatto.

**Deciso: calibrazione diretta su tutti e sette.** `data/registro-totale.json` e §8quinquies.
Costo evitato: un generatore di numeri casuali dentro il predittore, da riprodurre in
TypeScript cifra per cifra, per 0,003 di copertura su un bersaglio.

**Tre errori veri nel confronto stesso, trovati prima che sporcassero la decisione.** Il
livello nominale era calibrato per A e non per B, il che faceva vincere A per costruzione: sul
fuorigioco il verdetto si e' ribaltato una volta corretto. Il campo della soglia riportava il
MAE del modello sotto il nome di soglia assoluta, che e' un'altra regola. E il modello dei
**falli** e' `ridge` nell'artefatto e `poisson_glm` nel manifesto: comanda l'artefatto, ed e' la
terza verita' scritta in due posti di questa settimana.

**Le cinque linee sui due lati, mai misurate prima.** Il termine di paragone e' la tabella che
il metodo vieta — la quota storica per posizione — e la distribuzione calibrata la batte su
tutti e sette, in 4 origini su 4 su cinque bersagli. Ma il margine va guardato: 4,0% sul
fuorigioco, 1,6% sulle parate, **0,15% sui tiri**. Scarto di calibrazione fra 0,0130 e 0,0183,
**migliore del totale**, che sta fra 0,020 e 0,034.

**Portato in produzione.** Gli artefatti hanno due blocchi nuovi, `totale` e `linee`;
riesportazione verificata **puramente additiva su tutti e quattordici**: zero chiavi cambiate,
zero rimosse. Il valore atteso del totale **non e' nell'artefatto**, ed e' voluto: e' la somma,
e conservarne una versione propria vorrebbe dire avere un terzo numero capace di contraddire i
due lati. `match.ts` compone casa, trasferta e totale con le cinque linee; `predictor.ts` ha le
due cumulate. **`test:match` 13/13**, con 280 coppie reali confrontate cifra per cifra contro
Python. Le cinque suite: **53/53, 14/14, 20/20, 16/16, 13/13**, typecheck e lint puliti.

**La documentazione nuova della fonte, letta e verificata chiamando l'API.** Il piano e'
Unlimited, provato due volte: nessuna intestazione `RateLimit` su chiamata autenticata, e
`odds/best/` e `odds/comparison/` rispondono 200 con 67 operatori invece del 403 previsto senza
il piano. Scritto in `docs/architecture/fonte-regole-e-limiti.md`.

**Una trappola vera, misurata:** `?status=upcoming` e `?status=live` **non filtrano niente** —
restituiscono 395.814 righe, che e' il totale senza filtro. Il rifiuto dei parametri sconosciuti
che la fonte dichiara vale per i **nomi**, non per i **valori**. Il vocabolario vero delle
risposte e' `notstarted`, `inprogress`, `finished`, `cancelled`, `postponed`, `unresolved`.

**Tre novita' nei payload che l'archivio non ha:** i quattro segnalatori di **xG stimato** —
e competizioni intere sono stimate da cima a fondo — verificato su 800 payload dove il blocco
`xg` ha la sola chiave `actual`; il campo **`rescinded`** sui cartellini revocati, zero
occorrenze su 8.022 cartellini archiviati, che `reconstruct_cards.py` non guarda e che la
sincronizzazione **deve** escludere per non far dire cose diverse a righe della stessa tavola;
e le **formazioni previste**, che ora esistono con `lineup_status` e confidenza fino a due
settimane prima, il che riapre davvero la FASE B.

**Non ancora fatto:** applicare la migrazione — Docker e' spento, non e' mai passata da un
motore vero; l'aggiornamento incrementale; l'affidabilita' del totale e la sua soglia assoluta;
la copertura ottimista su sei bersagli su sette, da correggere calibrando il livello per fascia;
la fascia EARLY, non misurabile in questo disegno.

### La migrazione incontra un motore vero — 20 agosto 2026, notte

**Il presupposto non reggeva, e si è visto alla prima interrogazione.** Il progetto in
linea non ha lo schema `football`: porta autenticazione, pagamenti e la sola
`private.api_rate_limits`, e nessuna delle cinque migrazioni del 9 agosto vi risulta
registrata. La frase «lo schema `football` aveva gare, squadre, arbitri e classifiche, ma
nessuna tavola di statistiche» era vera **nei file SQL**, non in un database. Applicare
la migrazione nuova da sola sarebbe fallita alla riga 311, sul `drop constraint` di
`private.football_sync_runs`.

**Il banco è un Postgres 17 locale**, che è anche l'unico posto che `runtime.ts` accetta
senza una dichiarazione esplicita: la connessione dev'essere su indirizzo locale, e si
apre con il ruolo `iqstats_app_reader` in sola lettura. Le sei migrazioni sono state
applicate in ordine su un motore vuoto; il ruolo se lo crea la terza.

**Sei verifiche, tutte superate.**

| Verifica | Esito |
| --- | --- |
| Struttura | 69 e 14 colonne, 8 indici, RLS su entrambe, 2 policy, zero privilegi ad `anon` e `authenticated` |
| I tipi corretti in precedenza | 7 campi del profilo tiri in `double precision`, 3 continue in `numeric(8,4)` |
| Vincolo riscritto | `DATA-6` accettato, valore fuori elenco rifiutato |
| La funzione non inventa | su riferimenti vuoti: **800 righe squadra e 15.987 giocatore rifiutate, zero scritte** |
| Caricamento dei 24 lotti | **18.570 scritte + 40 rifiutate = 18.610**, e **382.318 righe giocatore, zero rifiuti** |
| Idempotenza | riapplicati tutti e ventiquattro: impronta identica, `e8e2107a…` |

**La parità dal database, che è la prova che conta.** `test:projection-store` costruisce
l'ingresso leggendo da `ProjectionObservationStore` — le stesse interrogazioni che farà
l'applicazione — e lo confronta con Python: **42 righe, 1.995 gare, 20.736 metriche di
contesto, 42 profili d'arbitro, 42 rose per 714 campi.** Sono gli stessi numeri di
`test:snapshot`, per un'altra strada. Il test è stato **fatto fallire di proposito**
alterando una riga nel banco: se ne accorge sulla media di lega alla terza cifra, e il
ricarico dei lotti lo riporta verde riportando l'impronta a quella di prima.

**I riferimenti vengono dall'archivio, non dalla fonte.** `export_reference_local.py`
ricava gare, squadre, stagioni, arbitri e competizioni dai payload già raccolti: 9.285
gare sulle 9.305 dei lotti. Le venti mancanti sono le 40 righe rifiutate, e sono
dichiarate: dodici hanno una stagione che nessun payload associa a una competizione, otto
non nominano le squadre. Tutte senza pannello. **I nomi di competizione, stagione e
arbitro sono segnaposto marcati**: l'archivio non li porta, le tavole li vogliono non
nulli, il motore non li legge mai.

**Due cose che il manifesto dei lotti non dice.** Trentadue righe su 18.610, in venti
gare, non nominano né la squadra né l'avversaria, mentre il manifesto dichiara
`righe_scartate: 0`; e cento gare su 9.305 non hanno un payload di dettaglio archiviato.
Non toccano i modelli — sono righe senza pannello — ma il manifesto conta le righe
prodotte, non quelle utilizzabili.

**Un ostacolo tecnico risolto senza toccare il motore.** I moduli traslocati importano
senza estensione, e il caricatore di Node non li risolve; cambiarli romperebbe il build,
perché con `module: commonjs` un percorso che finisce in `.ts` non è ammesso. La
differenza si assorbe in `apps/web/test/risolutore-ts.mjs`, che vive nel lato che prova.

**Le cinque suite restano verdi:** 53/53, 14/14, 20/20, 16/16, 13/13. Typecheck e lint di
`apps/web` puliti. La sesta, `test:projection-store`, passa con il database e **salta**
senza.

**Non ancora fatto:** l'aggiornamento incrementale, che richiede un tetto di richieste
autorizzato; l'affidabilità del totale; la copertura ottimista da calibrare per fascia. E
resta aperto **dove vivrà il database in produzione**: oggi non esiste da nessuna parte, e
il progetto in linea non ha lo schema.

### La sincronizzazione, l'affidabilità del totale e una correzione che non funziona — 20 agosto 2026, notte

**La sincronizzazione incrementale esiste e il tetto è obbligatorio.**
`scripts/projection/harvest/sync_new_matches.py` non parte senza `--max-richieste`: una
raccolta senza tetto è una decisione che lo script non prende. Riusa rete, ritmo, giornale
e ripresa di `fetch_blocks.py`, quindi le tre proprietà — incrementale, idempotente,
riprendibile — sono ereditate e non riscritte. Quattro richieste per gara: il pannello e la
mappa dei tiri arrivano insieme da `/stats/`, poi episodi, statistiche per giocatore e
dettaglio. La normalizzazione **non** è stata riscritta: resta quella Python già validata.

**Sui filtri si usa il vocabolario delle risposte:** `status=finished`. La scoperta ha
trovato **1.171 gare nuove con 32 richieste**, in 21 competizioni sulle 29 seguite, dal 28
giugno — dove l'archivio si ferma — a oggi. Nessun conteggio è multiplo di 200: nessuna
lega è stata troncata a una pagina.

**I payload nuovi sono compatibili, verificato prima di scaricare tutto.** Un assaggio di
venti gare, zero errori, poi il confronto con l'archivio: le novità sono additive —
`xg_estimated` alla radice, `estimated` dentro `xg`, `through_balls` in più — e nessuna
delle metriche del motore è sparita. `errors_lead_to_a_shot` manca nel 50% dei lati nuovi
contro il **70%** dei vecchi: è assenza naturale, non un campo rimosso. Un primo controllo
diceva che sei metriche erano scomparse: era il controllo a essere sbagliato, perché
cercava chiavi piatte dove il registro dichiara percorsi annidati (`crosses.total`).

**I cartellini revocati sono esclusi**, come richiesto. Rigenerando i cartellini
l'archivio attuale resta **identico byte per byte**: zero occorrenze del campo, quindi la
regola non cambia una riga di ciò che c'è e serve solo perché le righe nuove non contino
cose diverse da quelle vecchie.

**L'affidabilità del totale, misurata sul totale.** Soglia dalla migliore baseline **del
totale** — quasi sempre la media di lega, il restringimento solo sui falli — curva
empirica propria con la griglia estesa oltre l'otto delle marginali.

| Bersaglio | Soglia | Punteggio | MAE modello | MAE baseline | Media dei due lati | Minimo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tiri | 5 | 61 | 4,595 | 4,730 | 62,7 | 39,2 |
| Tiri in porta | 3 | 66 | 2,466 | 2,508 | 63,2 | 39,4 |
| Corner | 3 | 63 | 2,676 | 2,696 | 55,6 | 30,3 |
| Falli | 4 | 55 | 4,115 | 4,313 | 61,2 | 37,3 |
| Ammoniti | 2 | 68 | 1,634 | 1,641 | 53,8 | 29,1 |
| Fuorigioco | 2 | 73 | 1,457 | 1,537 | 54,2 | 28,1 |
| Parate | 2 | 55 | 2,033 | 2,054 | 73,9 | 53,8 |

**Il divieto era giusto e ora è misurato:** la media dei due lati sbaglia in entrambe le
direzioni, −19 punti sul fuorigioco e +19 sulle parate; il minimo sbaglia sempre, fino a
−45. E va detto che **sul totale il modello batte la baseline di poco**: dallo 0,7% sui
corner al 5,2% sul fuorigioco.

**La copertura per fascia è stata provata e non funziona.** Non per come è scritta: per
mancanza di campione. Nel treno dell'ultima origine `EARLY` ha **21-36 righe** e
`DEVELOPING` **91-114**, contro 1.748-2.095 di `MATURE`; le fasce povere ripiegano sul
livello unico e `MATURE` è il 94-96% delle righe, quindi «per fascia» coincide quasi per
costruzione con «unico». Su tre bersagli guadagna fra 0,0004 e 0,0025, su due non cambia
nulla, su due perde fino a 0,0103, e nessuno vince più di una origine su tre. **Il livello
unico resta.** È la stessa parete della fascia EARLY: non è un metodo sbagliato, è un
campione che non c'è.

**La catena percorsa per intero, e riconciliata.** Raccolta: **4.604 richieste, zero
errori**, 1.171 gare. Normalizzazione con gli script già validati: **9.305 → 10.476 gare**
e **18.610 → 20.952 righe squadra-gara**, esattamente +1.171 e +2.342, colonne invariate,
gare senza chiave di join ferme a 12. Lotti riesportati: da 24 a 27. Caricamento nel banco:
**20.912 righe scritte + 40 rifiutate = 20.952**, il manifesto, e **431.935 righe
giocatore, zero rifiuti**. Le 40 rifiutate sono sempre le stesse venti gare senza squadra
o senza lega.

**Le sei suite restano verdi dopo la sincronizzazione** — 53/53, 14/14, 20/20, 16/16,
13/13, più `test:projection-store` — e `test:projection-store` riporta gli **stessi**
numeri di prima: 1.995 gare, 20.736 metriche di contesto, 714 campi di rosa. È la prova
che le gare nuove sono tutte posteriori e non hanno toccato la storia anteriore su cui i
campioni di riscontro sono costruiti.

**Non-regressione verificata su `total.py`**: l'aggiunta delle baseline alle paia di gara
è additiva, e il rapporto del totale del fuorigioco esce identico byte per byte.

### Il percorso proprio: dove vive il database del motore — 21 agosto 2026, mattina

**Decisione dell'utente: percorso proprio.** Delle tre strade — allineare DATA-1 al
perimetro del motore, dare alle osservazioni un percorso che scriva anche gare, squadre e
arbitri, o tenere separati i due livelli dati — è stata scelta la seconda. Due misure
prese prima della domanda hanno pesato: **DATA-1 non raccoglie arbitri affatto**
(`data1-harvest.mjs` e `data1-contracts.mjs` non nominano mai l'arbitro, e
`football.referees` era vuota), e il suo ciclo va **in avanti** dal catalogo delle
stagioni fresche, quindi le 9.305 gare storiche del motore non ci sarebbero arrivate
comunque.

**La sesta migrazione è passata sullo stack locale del progetto**, che aveva le cinque del
9 agosto e non la sesta. Applicata con `supabase migration up --local`; verificata: 69 e
14 colonne, 8 indici, RLS su entrambe, 2 policy, `DATA-6` accettato dal vincolo riscritto,
nessun privilegio ad `anon` o `authenticated`.

**L'innesto dei riferimenti non sovrascrive mai.**
`dataset/load_reference_and_batches.py` è nuovo: costruisce SQL su standard output — non
c'è un driver Python installato e `psql` è l'unico cliente disponibile ovunque — e ogni
inserimento è `on conflict do nothing`.

| Tavola | Esistenti | Innestate | Totale |
| --- | ---: | ---: | ---: |
| `competitions` | 36 | **0** | 36 |
| `seasons` | 36 | 27 | 63 |
| `teams` | 591 | 116 | 707 |
| `referees` | 0 | 673 | 673 |
| `matches` | 9.548 | 9.307 | 18.855 |

**Zero competizioni nuove: i perimetri non sono diversi, uno è contenuto nell'altro.** Le
29 del motore sono già tutte fra le 36 di DATA-1, quindi nessun nome di competizione
segnaposto è entrato nel database. I segnaposto scritti sono 27 nomi di stagione, 2 di
squadra e i 673 arbitri. Le 116 squadre e le 9.307 gare nuove confermano i numeri della
sessione scorsa: 467 squadre su 583 e 1.149 gare su 10.456 esistevano già.

**Le due guardie erano già nello schema e non ne ho aggiunte:** competizioni nuove con
`is_active = false`, che `app_competition_read_model` filtra; stagioni nuove con
`ingest_scope = 'held'`, che `app_match_read_model` filtra. Le due viste restano a 33 e
331 righe.

**Una fuga misurata, che va decisa e non nascosta.** `app_match_read_model` è passata da
**9.548 a 9.550**: due gare della Chinese Super League del 18 e 19 agosto — 588026 e
588027 — vere, con nomi e punteggi reali, in una stagione `product_current` che DATA-1 non
aveva ancora raccolto. Non sono segnaposto e non sono contaminazione, ma dicono che dove
la stagione è condivisa il percorso del motore **può** scrivere nel perimetro del prodotto.

**Il caricamento riconciliato col manifesto: 20.912 righe scritte + 40 rifiutate =
20.952**, e **431.935 righe giocatore, zero rifiuti.** Le 40 sono sempre le stesse venti
gare senza lega o senza squadra.

**Idempotenza dell'intero percorso, innesto compreso.** Riapplicati riferimenti e
ventisette lotti: **0 inserimenti** su tutte e cinque le tavole di riferimento, gli stessi
20.912 + 40 e 431.935, e impronta `655a292f30cae6f0872f9ecc9d02bbf8` **identica** prima e
dopo. Un primo tentativo di questa verifica era andato a vuoto in silenzio — la directory
corrente era `apps/web`, il percorso dello script non risolveva e `psql` ha letto un
ingresso vuoto chiudendo con 0 — ed è stato rifatto invece di essere creduto.

**La parità dal database, dal motore del progetto:** `test:projection-store` verde con
**42 righe, 1.995 gare, 20.736 metriche di contesto, 42 profili d'arbitro, 714 campi di
rosa** — gli stessi numeri del banco, con 8.399 gare di DATA-1 prive di osservazioni che
non spostano nulla, perché il calcolo legge `team_match_observations` e non `matches`.

**Le sei suite verdi:** 53/53, 14/14, 20/20, 16/16, 13/13 e `test:projection-store` 1/1.
Typecheck e lint di `apps/web` puliti.

**Due frasi stantie corrette in §8quinquies**, entrambe contraddette da misure scritte due
paragrafi sopra: «si corregge calibrando il livello per fascia» — provato, non paga — e
«l'affidabilità del totale non è ancora misurata» — misurata, ma vive nei sette rapporti
e non nel blocco `totale` degli artefatti.

**Non ancora fatto:** l'affidabilità del totale negli artefatti, che tocca il contratto e
attende una decisione; la pianificazione della sincronizzazione periodica; e la fuga delle
due gare della Chinese Super League, da decidere.

### L'affidabilità del totale entra negli artefatti — 21 agosto 2026, mattina

**Decisione dell'utente: portarla in produzione rispecchiando le marginali**, punteggio per
fascia compreso. Il blocco `totale.affidabilita` ha soglia assoluta, punteggio complessivo,
punteggio per fascia con la sua incertezza binomiale e la curva intera. Non ha lo strato
condizionale, perché sul totale non è stato misurato: il tipo è
`Omit<Affidabilita, 'condizionale'>`, che lo dichiara assente invece di lasciare un campo
sempre nullo.

**Il controllo è uno solo.** Soglia e punteggi si verificano in `verificaSogliaEPunteggi`,
che chiamano sia il bersaglio sia il totale: due verificatori paralleli sarebbero il quarto
posto dove la stessa regola può divergere.

**La fascia è la più povera dei due lati** — la storia più corta governa l'incertezza —
che è la stessa con cui il punteggio è stato misurato in `total_reliability.py`. Sotto un
ripiego non si dichiara.

**Il blocco entra in sette artefatti su quattordici**, e il cancello funziona: il rapporto
è di un modello solo per bersaglio (`total_shots` e `fouls` `ridge`, gli altri cinque
`poisson_glm`), e sull'altro modello dello stesso bersaglio viene rifiutato invece di
attribuirgli una misura che nessuno ha fatto su di lui. Su `shots_on_target` la fascia
EARLY non compare nel rapporto: non è misurabile, e il test sceglie la fascia più povera
fra quelle dichiarate invece di dare EARLY per scontata.

**Un arrotondamento scritto in due posti, trovato dal test di parità nuovo.** Sui falli in
fascia EARLY la quota è **0,525 esatti**: `round()` di Python arrotonda al pari e dà 52,
`punteggio_da` dell'esportatore fa `floor(x + 0,5)` e dà 53. Il test ha fatto rosso su
quella cifra. Corretto alla radice: `total_reliability.py` chiama `punteggio_da`. Il
rapporto dei falli rigenerato è **identico tranne quel punto**, zero chiavi aggiunte e zero
rimosse — il che conferma anche che i parametri predefiniti sono quelli usati in origine.
Gli altri sei rapporti non cambiano: il test li confrontava già tutti e falliva solo sui
falli.

**Sette artefatti su quattordici erano fermi a una versione precedente dell'esportatore.**
`corner_kicks__ridge`, `fouls__poisson_glm`, `goalkeeper_saves__ridge`, `offsides__ridge`,
`shots_on_target__ridge`, `total_shots__poisson_glm` e `yellow_cards__ridge` **non avevano
affatto la chiave `totale`** — assente, non nulla. Riesportandoli oggi hanno guadagnato 22
chiavi `.totale.*`, con dispersione e livello stimati sui propri residui,
`prova_fuori_campione` nulla e nessun blocco `linee`. Prima quei sette dichiaravano «la
somma e basta»; con quelle chiavi avrebbero prodotto intervallo e cinque linee sul totale
senza che nessuno le avesse misurate fuori campione.

**Era un cambiamento oltre il perimetro della decisione, e l'utente ha chiesto di
ripristinarli.** I sette sono tornati dalla copia di sicurezza, ciascuno con i suoi tre
file — artefatto, impronta e riscontro — perché l'impronta copre i byte e il riscontro
cita l'impronta: ripristinarne uno solo lascerebbe un artefatto che il caricamento
rifiuta. Verificato su tutti e quattordici: impronta del file uguale a quella dichiarata,
`checksum_artefatto` del riscontro uguale all'impronta, e la chiave `totale` presente
esattamente nei **sette** che hanno il rapporto e assente negli altri sette. Le cinque
suite restano 53/53, 14/14, 20/20, 16/16, 15/15.

**La riesportazione è additiva:** **2.328 chiavi aggiunte, zero rimosse, zero cambiate** sui
quattordici artefatti. Le uniche quattordici variazioni sono i `checksum_artefatto` dentro i
file di riscontro, che devono cambiare.

**Le sei suite verdi:** 53/53, 14/14, 20/20, 16/16, **15/15** (`test:match`, due test nuovi)
e `test:projection-store` 1/1 con gli stessi 42 righe, 1.995 gare, 20.736 metriche, 714
campi di rosa. Typecheck di `apps/web` pulito.

### La passata notturna e il giornale — 21 agosto 2026, pomeriggio

**Decisione dell'utente: una volta a notte**, e con una richiesta in più — quando le gare
nuove sono tante, la passata deve prendere **tutto** senza badare al tetto.

**Come sta in piedi senza riaprire una decisione chiusa.** Il tetto resta un argomento
obbligatorio di `sync_new_matches.py`, ma smette di poter troncare: il pianificatore lo
**calcola dalla scoperta**, `4 × gare + 50`. Con le 1.171 gare del 20 agosto sarebbero
4.734 richieste contro le 4.604 realmente usate. Con 80 gare sono 370. L'argomento
continua a essere esplicito, ma nessuna passata si ferma a metà per un numero scelto a
mano.

**Che cosa vuol dire «resta indietro di un giorno», visto che l'utente l'ha chiesto.** Fra
due passate le gare che finiscono durante il giorno non sono nel database. Nel momento
peggiore la storia del motore non contiene fino a ventiquattro ore di gare concluse, e
siccome le feature «al momento di» leggono le gare **anteriori** al calcio d'inizio, una
squadra che ha giocato ieri sera si proietta oggi senza quella gara — che è la più
informativa. Resta un residuo che la cadenza non toglie: le gare che finiscono **dopo**
l'orario della passata aspettano la notte dopo, quindi l'orario va messo dopo l'ultimo
fischio finale della sera.

**`scripts/projection/harvest/sync_nightly.ps1`**, nuovo: scoperta, tetto calcolato,
raccolta, i cinque script Python già validati, lotti, riferimenti, caricamento. La
normalizzazione non è stata riscritta.

**Nessuna troncatura silenziosa.** Se la scoperta esaurisce il proprio tetto la passata si
ferma: una scoperta troncata direbbe «zero gare nuove» dove ce ne sono, ed era l'unico modo
in cui questa catena poteva mentire senza dare errore. Stessa guardia sulla raccolta.

**Il giornale, come deciso: una riga per passata, fetta `DATA-6`.** Si apre `running`
**prima** della raccolta, perché una passata che fallisce a metà deve lasciare traccia. La
chiusura riuscita è l'ultima istruzione del SQL di caricamento e **non** del pianificatore:
se `psql` si ferma per un errore, `ON_ERROR_STOP` non ci arriva e la riga resta `running`,
che è la verità. Chiuderla da fuori direbbe «completata» comunque. Il fallimento lo scrive
il pianificatore in `trap`, con il motivo troncato a 200 caratteri.

**Provato sul database del progetto.** Riga 4 chiusa `completed` con **452.887 righe
osservate, 452.847 scritte, 40 rifiutate** — cioè 20.952 e 431.935, il manifesto — e 4.636
richieste su un tetto di 4.984. I conteggi salgono dentro la transazione di ogni lotto: un
lotto che non passa non è contato. Impronta invariata a `655a292f…` dopo il terzo
caricamento. La chiusura in fallimento è stata provata a parte, **apostrofo nel motivo
compreso** (`l'archivio`), e la riga di prova è stata cancellata: un fallimento inventato
non resta in un giornale.

**Due correzioni fatte perché altrimenti erano sbagliate.**

- **`Out-File` di PowerShell 5.1 non è una condotta di byte.** Un lotto è una riga sola da
  cinque megabyte. Il caricatore accetta `--sql <file>` e scrive lui: verificato
  **identico** al SQL prodotto su standard output.
- **La raccolta non lasciava traccia leggibile**: stampava il rendiconto e basta. Ora lo
  scrive anche in `harvest/data/raccolta-ultima.json`, come già fa la scoperta.

**Non ancora fatto:** registrare l'attività pianificata in Windows. È un'azione che resta
sulla macchina e non l'ho presa da solo.

### Il motore arriva in pagina — 21 agosto 2026, sera

**Il punto che mancava, e che nessuna misura avrebbe chiuso.** Il motore aveva quattordici
modelli validati e **nessuna pagina che lo chiamasse**: cercando chi importa
`projection/match.ts` dentro `apps/web/src` rispondevano solo altri file del motore. Zero.

**Una correzione a una cosa che avevo detto poche ore prima.** Avevo scritto che senza il
livello dati l'applicazione avrebbe mostrato «copertura assente». Falso: `runtime.ts:78`
dice che senza `IQSTATS_DATABASE_URL` l'applicazione usa `providerGateway()` e legge la
fonte **in diretta**, senza database. È per questo che dopo ogni commit tutto risultava
presente e aggiornato, e continuerà a esserlo. La frase giusta era più stretta: il motore
non ha una superficie in pagina, e non ha un database in linea.

**I sette modelli promossi, che era una decisione dell'utente.** Il registro dice
`production: scelto da una persona fra i validati: il registro non lo assegna`, quindi non
l'ho assegnato io. L'evidenza però decide da sola: **per tutti e sette i bersagli il
modello con il MAE migliore fuori campione è esattamente quello che porta la misura
completa della gara**. `ridge` su tiri e falli, `poisson_glm` sugli altri cinque.

| Bersaglio | Vince | MAE | Vantaggio | L'altro |
| --- | --- | ---: | ---: | --- |
| Tiri | `ridge` | 3,6095 | 4,71% | poisson 3,6177 · 4,50% |
| Tiri in porta | `poisson_glm` | 1,7663 | 3,85% | ridge 1,7669 · 3,82% |
| Corner | `poisson_glm` | 2,0637 | 4,75% | ridge 2,0681 · 4,55% |
| Falli | `ridge` | 2,7870 | 4,81% | poisson 2,7924 · 4,62% |
| Ammoniti | `poisson_glm` | 1,0541 | 1,39% | ridge 1,0602 · 0,82% · **4/5 origini** |
| Fuorigioco | `poisson_glm` | 1,0841 | 4,84% | ridge 1,0850 · 4,76% |
| Parate | `poisson_glm` | 1,4699 | 3,18% | ridge 1,4716 · 3,07% |

**Lo stato lo scrive l'esportatore, non la mia mano.** `export_model.py` aveva
`"stato": "experimental"` fisso: ora accetta `--stato`, e i sette sono stati **riesportati**
con `production`. Modificare a mano un artefatto ne avrebbe rotto l'impronta e tolto
all'esportatore il ruolo di unico scrittore. `registry.py` rigenerato: 7 `production`,
7 `validated`.

**Gli artefatti entrano nel pacchetto per import statico**, come già fa ENG-1 con
`ratings-state.generated.json`. `.vercelignore` esclude `scripts/`, quindi da lì non
sarebbero mai arrivati su Vercel. Vivono in `apps/web/src/server/iqstats/artefatti/`,
327 KB, e un test nuovo li confronta **byte per byte** con quelli generati da Python,
verifica l'impronta `.sha256` e pretende che siano esattamente i sette che il registro
dichiara `production`. La duplicazione c'è ed è rumorosa, non silenziosa.

**`projection-runtime.ts`, tre confini.** Connessione **propria**
(`IQSTATS_PROJECTION_DATABASE_URL`): usare quella generale farebbe passare *tutta*
l'applicazione al gateway ibrido, che il motore non ha nessun titolo per decidere.
Identificativi **risolti** da `source_id`, mai assunti. E **la gara da prevedere non deve
esistere nel database**: tutte le interrogazioni dello store sono per squadra, stagione,
arbitro e istante, mai per l'identificativo della gara — così una gara futura si proietta
dalla storia delle due squadre, e il taglio «al momento di» resta esatto perché quella riga
non esiste ancora.

**La sezione sostituisce ENG-1, non lo affianca.** Mostrano gli stessi sette bersagli: due
pannelli con due numeri diversi per «tiri in casa» sarebbero due verità sullo stesso
schermo. `MatchProjectionSection` riusa le classi del pannello esistente, quindi zero CSS
nuovo.

**Provato sul server vero, non solo compilato.**

| Gara | Esito |
| --- | --- |
| Chengdu Rongcheng - Shanghai Shenhua (23 gare in stagione) | sezione proiezione, **24 scale di soglie**, 4 badge di affidabilità, ENG-1 assente |
| Olympique de Marseille - RC Strasbourg (34 gare, ma tutte della stagione precedente) | proiezione assente, **ENG-1 come prima** |

Il secondo caso è la regola della quarta giornata che funziona: le 34 osservazioni del
Marsiglia sono tutte della stagione 317, la gara è nella 1311. Zero gare precedenti nella
stagione in corso.

**Una regressione trovata e corretta durante la prova.** Nel primo tentativo, sulla gara
senza storia **non compariva nessuna delle due sezioni**: il motore restituiva un oggetto
non nullo con zero bersagli mostrabili e la pagina non ripiegava. Ora `proiezioniDellaGara`
risponde `null` quando nessun bersaglio è completo.

**Due feature mancanti, misurate invece che immaginate.** Sui quattro bersagli che
ripiegavano: `contesto_turno` e `arbitro_gare_viste`.

- Il **turno** c'era e non lo leggevamo: la fonte dichiara `round_number` sull'evento —
  `build_observations.py:164` lo usa già — e `match-context.ts` mappava solo `round_name`,
  che su quella gara è nullo. Mappato: giornata 24 letta, e `corner_kicks` non ripiega più.
- L'**arbitro** manca davvero: per quella gara la fonte non lo dichiara perché non è ancora
  designato. Tre bersagli su sette (tiri in porta, falli, ammoniti) restano sul ripiego e
  mostrano il valore senza intervallo né linee né affidabilità, che è il comportamento
  giusto: nessuno ha calibrato quelle cose su una baseline.

**Sette suite verdi:** 53/53, 14/14, 20/20, 16/16, 15/15, `test:projection-artefatti` 3/3 e
`test:projection-store` 1/1. Typecheck e lint di `apps/web` puliti.

**Resta aperto:** il database del motore **non esiste in linea**. Interrogato il progetto
Supabase: solo `public.*` di autenticazione e pagamenti più `private.api_rate_limits`,
nessuno schema `football`. Finché non c'è, in produzione `IQSTATS_PROJECTION_DATABASE_URL`
resta non dichiarata e la pagina mostra ENG-1 come sempre: nessuna regressione, nessuna
proiezione. Lo schema pesa **192 MB** misurati, su un piano free da 500.

### Il livello dati in linea, e la proiezione in produzione — 21 agosto 2026, notte

**Il buco è chiuso.** Il database del motore adesso esiste in linea, e la proiezione si vede
su `iqstats-indol.vercel.app`.

**Le sei migrazioni sul progetto Supabase**, applicate in ordine con `ON_ERROR_STOP`: tutte
OK al primo colpo. Registrate in `supabase_migrations.schema_migrations` perché la CLI non
le riapplichi. Struttura verificata: `football.team_match_observations` con **69 colonne**,
le stesse del banco locale.

**Il caricamento riconcilia col manifesto**, dal file da 156 MB attraverso il pooler in
modalità Session:

| | |
| --- | ---: |
| osservazioni squadra-gara | 20.918 |
| righe giocatore | 432.060 |
| gare · squadre · arbitri | 10.459 · 583 · 673 |
| scritte / rifiutate | **452.978 / 40** |
| peso del database | **117 MB** su 500 del piano free |

Le 40 rifiutate sono sempre le stesse venti gare senza lega o senza squadra. Riga di
giornale `1 · DATA-6 · backfill · completed`, chiusa dall'ultima istruzione del SQL.

**117 MB e non 192**: la stima veniva dal container locale, che porta anche le 9.548 gare
di DATA-1 e gli indici cresciuti da tre ricariche. Misurato è meno della metà della quota.

**Il ruolo di sola lettura funziona in linea**: `set role iqstats_app_reader` e la tavola
si legge. È lo stesso ruolo con cui l'applicazione si collega.

**La latenza, misurata invece che temuta.** Il primo colpo contro il database in linea ha
impiegato 25,5 secondi e sembrava un disastro: era la compilazione a freddo del server di
sviluppo. A caldo sono **2,6-3,2 secondi**, contro i 2,3 del locale — il remoto costa circa
mezzo secondo. In produzione la pagina risponde in **4,9 secondi** sulla gara coperta e 3,4
su quella scoperta.

**In produzione, verificato interrogando il sito:**

| Gara | Esito |
| --- | --- |
| Chengdu Rongcheng - Shanghai Shenhua | sezione proiezione, 24 scale di soglie, ENG-1 assente. **Tiri: 17,0 · 11,6 · totale 28,7** |
| Olympique de Marseille - RC Strasbourg | ENG-1 come prima, proiezione assente (regola della quarta giornata) |

`IQSTATS_PROJECTION_DATABASE_URL` è dichiarata su Vercel come **Sensitive**, solo
Production, e il rilascio è stato rifatto perché la runtime la vedesse.

**Sulla password.** Non l'ho digitata in nessun modulo: il classificatore lo ha bloccato ed
è una regola che non si aggira. Vive solo in `.env.local`, che è ignorato da git, e nelle
variabili di Vercel. **È però passata dalla chat, quindi va rigenerata.**

**Da sistemare:** `npx skills add supabase/agent-skills` ha lasciato `.agents/`,
`.claude/skills/` e `skills-lock.json` non tracciati e **non ignorati**.

### La passata notturna arriva in produzione — 22 agosto 2026, sera

**Il divario, misurato prima di toccare qualcosa.** L'attività «IQstatS - sincronizzazione
notturna» aveva girato alle **03:00:01** con `LastTaskResult 0`, ma su
`IQSTATS_DATABASE_URL` = `127.0.0.1:54322`, il container locale. Locale a **20.948**
osservazioni, database in linea a **20.918**, fermo alla riga di giornale del backfill del
21 agosto (21:44 UTC): **30 righe di divario**, quindici gare per due lati, che non si
sarebbero chiuse da sole. Sull'ospite non esiste un `psql` — `command -v psql` non risponde
— e l'unico cliente è quello dentro `supabase_db_IQstatS`.

**Perché non serve un percorso incrementale.** Il caricamento completo sul remoto era già
misurato: riga 1 del giornale, `started_at` 21:40:53 → `completed_at` 21:44:01, **tre minuti
e sette secondi** per 453.018 righe. Il SQL è uno solo, già idempotente: il problema non era
generarne uno più piccolo, era farlo arrivare anche dall'altra parte.

**Che cosa è cambiato in `sync_nightly.ps1`.**

- Due destinazioni: `IQSTATS_DATABASE_URL` (locale) e `IQSTATS_REMOTE_DATABASE_URL` (in
  linea). Senza la seconda, la passata è identica a prima.
- Le connessioni si leggono dall'ambiente e, se non è dichiarato, da **`.env.local`**: il
  segreto resta in due posti soli — quel file e le variabili di Vercel — e si aggiorna in un
  posto solo quando la parola d'ordine viene rigenerata.
- Il remoto passa dallo stesso `psql` del container: `docker exec -e PGHOST -e PGPORT -e
  PGUSER -e PGDATABASE -e PGPASSWORD` inoltra le variabili **per nome**, quindi la parola
  d'ordine non compare mai negli argomenti né nei log. Il locale continua a passare dal
  socket interno con il solo utente e database, perché dentro il container l'ospite e la
  porta della sua connessione non risponderebbero.
- Una riga di giornale per destinazione. La chiusura riuscita resta in coda al SQL, il
  fallimento lo scrive chi pianifica con `where status = 'running'`: un locale riuscito e un
  remoto fallito restano **due verità distinte**.

**Verifiche sui rami, prima di lanciare.**

| Verifica | Esito |
| --- | --- |
| Parse dello script | OK |
| `Destinazione` su connessione con caratteri codificati | `pa%24s%3Aword` → `pa$s:word`, ospite, porta, utente e database corretti |
| Precedenza | l'ambiente vince su `.env.local`; chiave assente → `null` |
| Ramo non locale, contro il locale via `host.docker.internal:54322` | `ramo-remoto-ok`, porta 5432 dentro il container, 20.948 osservazioni lette |
| Ramo non locale, contro la produzione | pooler Session, utente `postgres.vthvi…`, `has_table_privilege(…,'insert') = t` |

**La prima passata a due destinazioni, 21:51–22:17 Europe/Rome.**

| | |
| --- | --- |
| Gare nuove | **66** in 29 competizioni, 32 richieste di scoperta |
| Richieste | **296** su un tetto di 514 (66 × 4 + 50 + 200), errori 0 |
| Giornale locale, riga 10 | `completed`, **23'07"**, 456.540 osservate / **456.500 scritte** / 40 rifiutate |
| Giornale in linea, riga 2 | `completed`, **25'48"** — si apre prima della raccolta — con gli **stessi** numeri |
| Parità | **21.080 osservazioni su entrambi**: +132 sul locale, +162 sul remoto, che recupera anche le quindici gare della notte — (15 + 66) × 2 |
| In linea, dopo | 10.540 gare, 680 arbitri, ultima gara giocata il 22 agosto alle 17:30 UTC |

Le 40 righe rifiutate sono sempre le stesse venti gare senza lega o senza squadra.

**Quello che costa, e non è ancora deciso.** Il database in linea è passato da **117 MB a
175 MB** su 500 del piano free, per 162 righe nuove: `player_match_observations` **101 MB**
con 435.420 righe vive e zero morte, `team_match_observations` **54 MB** con 21.080 vive e
**4.937 morte**, autovacuum passato alle 20:16 e 20:17 UTC. Ogni passata riscrive tutte le
453.000 righe, non le 162 cambiate, e l'autovacuum recupera lo spazio come riutilizzabile
senza restituirlo al filesystem. **Se la crescita fosse lineare — 58 MB a notte — la quota
finirebbe in meno di sei notti.** La previsione è che si stabilizzi intorno al doppio dello
spazio utile, perché gli upsert successivi riusano le pagine liberate: **è una previsione,
non una misura**, e si guarda il peso dopo la passata delle 03:00. Se cresce, la strada è
caricare soltanto i lotti che contengono gare nuove.

**Resta aperto.** L'attività pianificata **non scrive un log**: di stanotte sapevamo solo
`LastTaskResult 0`. E gira ancora soltanto a sessione aperta: `S4U` era stato rifiutato
perché la sessione non era amministratore.

### APP-6: il numero osservato accanto a quello previsto — 22 agosto 2026, notte

**La casella del piano ferma dal 2 agosto.** «Prima categoria statistica con confronto
casa/trasferta»: sotto il nome di ogni squadra, nella sezione delle giocate statistiche,
adesso c'è quanto ha prodotto **davvero** prima di quella gara — dallo stesso lato del campo,
nella stessa stagione — con il campione su cui poggia.

**La strada scartata, con il suo numero.** `getTeamSeasonSplits` esiste già e produce medie
casa/trasferta per gruppo di metriche, ma il commento del gateway lo dice e il codice lo
conferma: **una richiesta per gara**. Su una stagione avviata sono circa venti richieste per
squadra, **quaranta per dossier**, su una pagina che in produzione impiega già 4,9 secondi e
con un tetto di dieci richieste al secondo. Non è la strada.

**La strada presa.** Le righe servono già: `store.materiale(gara, lato)` legge tutte le
osservazioni delle due squadre fino all'istante del calcio d'inizio, ed è quello che il
motore usa per proiettare. L'osservato è una **riduzione su quelle stesse righe**: zero
richieste alla fonte, zero interrogazioni nuove, nessuna latenza aggiunta.

**Tre filtri, e ognuno sa diventare rosso.** `mediaOsservata` in `projection-store.ts` tiene
solo le righe dello **stesso lato** — una media che somma casa e trasferta non risponde alla
domanda «quanto produce in casa» — e della **stessa stagione**, perché mescolarne due dice di
che cosa parla la media solo a chi l'ha scritta. Un valore assente **esce dal campione** e non
diventa zero; senza nemmeno una gara utile la risposta è `null`, e in pagina non compare nulla.

**Il verde è stato fatto diventare rosso.** Tolto il filtro sul lato, `test:projection-osservato`
passa da 3/3 a **1 su 3**, con le due asserzioni giuste in rosso. Filtro ripristinato e
verificato.

**Reso e verificato sul server vero**, gara 211877, Śląsk Wrocław - Widzew Łódź (Ekstraklasa),
HTTP 200 in 8,5 s a freddo: sette metriche, ognuna con l'osservato su entrambi i lati.

| Metrica | Atteso casa | Osservato casa | Osservato trasferta |
| --- | ---: | ---: | ---: |
| Tiri | 14,5 | **12,5 su 2 gare** | 16,0 su 2 gare |
| Tiri in porta | 4,0 | 3,0 su 2 | 4,0 su 2 |
| Corner | 5,1 | 4,0 su 2 | 3,5 su 2 |
| Falli | — | 11,5 su 2 | 15,0 su 2 |
| Cartellini gialli | — | 0,5 su 2 | 3,5 su 2 |
| Fuorigioco | — | 2,5 su 2 | 0,5 su 2 |
| Parate | — | 4,0 su 2 | 3,0 su 2 |

**Il numero è stato controllato fuori dall'applicazione**, in SQL sul livello dati:
`casa 12.50 su 2` e `trasferta 16.00 su 2`, identici a quelli resi in pagina. Un numero che
si verifica solo con il codice che lo produce non è verificato.

**Due correzioni raccolte per strada.** `calcolo.ts` importava `Feature`, `IngressoFeature` e
`NomeGruppo` come valori invece che come tipi: con Next passava, con lo strip-types di Node il
modulo non si caricava affatto e nessun test poteva toccare quella catena. Ora sono `import
type`, e la catena del motore è raggiungibile dai test.

**Verifiche:** `test:projection-osservato` 3/3 · `test:projection-artefatti` 3/3 ·
`test:projection-store` 1/1 dal database locale · `test:gateway` 25/25 · `test:stat-engine`
9/9 · `test:media` 4/4 · dalla radice 53/53, 14/14, 20/20, 16/16, 15/15 · `tsc --noEmit` e
`eslint` a zero · `npm run build` pulita.

**Il limite, dichiarato e non aggirato.** L'osservato vive **dentro** la sezione della
proiezione: dove quella non c'è — sotto la quarta giornata, o fuori dalle competizioni
raccolte — non compare nemmeno il confronto. È APP-6B nel piano, e la strada non è chiamare la
fonte quaranta volte: è un read model.

**Misurato in produzione dopo il rilascio `6bc07c4d`, su sei gare.** Quattro hanno
previsione, consiglio e motore; due — entrambe **Club Friendlies** — non hanno nulla e lo
dichiarano: «questo campionato non ha una baseline calibrata da IQstatS: copertura assente,
nessun valore viene inventato», e la fonte non espone nemmeno il pronostico 1X2.

Due casi che spiegano quando l'osservato **non** compare pur essendoci la proiezione:

- **Stoiximan Super League, gara 219742**: proiezione presente, osservato assente su tutte
  e sei le metriche. Non è un difetto: la gara è nella stagione **23**, mentre le **16 righe
  in casa** e le **19 in trasferta** delle due squadre sono tutte della stagione **69**.
  L'osservato non mescola stagioni; la proiezione guarda anche più indietro. L'asimmetria è
  voluta, ma va conosciuta.
- **Super League svizzera, gara 211386**: sette metriche e **tredici osservati su
  quattordici**. La riga mancante è una squadra senza gare da quel lato nella stagione: tace
  invece di mostrare uno zero.
