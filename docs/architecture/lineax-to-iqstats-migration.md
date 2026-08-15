# Migrazione selettiva LineaX → IQstatS

## Stato e autorizzazione

- **Stato:** MIG-1 completata sul progetto Supabase IQstatS isolato; fondazione
  commerciale, RLS, grants, rate limit e matrice piani/funzionalità sono applicati.
- **Autorizzazione:** ricevuta dall'utente il 1 agosto 2026 per ispezionare e migrare
  selettivamente gli artefatti LineaX pertinenti.
- **Decisione di prodotto:** confermata dall'utente il 2 agosto 2026. Supabase gestisce
  dati/Auth/entitlement; Stripe gestisce i pagamenti; quattro piani sbloccano insiemi
  di funzionalità.
- **Gate corrente:** BILL-1 richiede prima la verifica read-only del connettore Stripe
  in test mode. Sono vietate chiave e risorse live.

La migrazione conserva decisioni di prodotto e contratti utili, ma non copia codice,
branding, payload o coupling LineaX. I contratti IQstatS, il gateway APP-2 e le regole
di disponibilità dati restano la fonte tecnica primaria.

## Evidenza recuperata

- Il recovery LineaX documenta Supabase Auth, profili, abbonamenti, entitlement,
  cache e catalogo endpoint, oltre a quattro piani Stripe.
- Il codice legacy contiene client Supabase SSR, callback Auth e refresh sessione.
- Esistono una Edge Function legacy per checkout e quattro asset piano.
- Il solo progetto Supabase remoto visibile è inattivo. Lo schema non è stato
  interrogabile per timeout e una Edge Function ancora attiva contiene logica e
  nomenclatura LineaX.
- Non esistono migrazioni SQL locali verificabili che dimostrino lo schema remoto.
- Il collegamento Stripe richiede nuova autenticazione; prodotti e prezzi correnti non
  sono quindi stati verificati.

Queste evidenze vietano di trattare il progetto legacy come destinazione IQstatS già
pronta o di dichiarare migrate tabelle e prezzi non ancora verificati.

## Decisione architetturale consigliata

1. Creare o selezionare un progetto Supabase dedicato esclusivamente a IQstatS.
   Non riutilizzare come produzione il progetto legacy con coupling LineaX.
2. Migrare nella prima fase soltanto Auth e stato commerciale: profilo, piano,
   cliente Stripe, abbonamento, entitlement ed eventi webhook idempotenti.
3. Mantenere il gateway calcistico APP-2 stateless con `Cache-Control: no-store` e
   TTL 0. Non migrare ora `data_cache`, cataloghi provider o snapshot storici.
4. Implementare Stripe nel runtime Node/Next.js server-side. La Edge Function Deno
   legacy è solo evidenza storica e non viene copiata.
5. Creare o verificare prodotti e prezzi Stripe in modalità test prima di usare il
   live mode. Gli entitlement cambiano soltanto dopo webhook firmato e idempotente.
6. Login, account e pricing richiedono il normale gate UI/UX prima dell'implementazione.
   La slice partita è stata invece autorizzata e implementata solo dopo UX-0; non usa
   codice, asset, testi, formule o coupling LineaX.

## Contratto dati iniziale

| Tabella | Scopo | Accesso |
| --- | --- | --- |
| `profiles` | profilo minimo collegato a `auth.users` | proprietario legge/aggiorna i campi ammessi |
| `plans` | catalogo IQstatS dei quattro piani | lettura autenticata; scrittura server/admin |
| `features` | catalogo stabile delle funzionalità controllabili | lettura autenticata; scrittura server/admin |
| `plan_features` | mapping piano → funzione, eventuale limite e versione | lettura autenticata; scrittura server/admin |
| `billing_customers` | mapping utente ↔ customer Stripe | proprietario legge; scrittura solo server |
| `subscriptions` | stato verificato di prova/abbonamento | proprietario legge; scrittura solo webhook/server |
| `entitlements` | capacità attive e scadenza | proprietario legge; scrittura solo server |
| `billing_events` | ID evento Stripe e stato di elaborazione | nessun accesso client; idempotenza e audit server |

Regole invarianti:

- chiavi utente riferite a `auth.users(id)` con comportamento di cancellazione
  esplicito;
- ID customer, subscription, price ed event Stripe univoci dove pertinenti;
- timestamp UTC e stato originale Stripe conservati senza trasformare assenza in
  valori predefiniti;
- nessun payload Stripe completo o segreto nel client, nei log o nelle tabelle
  esposte;
- RLS attiva su ogni tabella esposta e privilegi `GRANT` espliciti per ruolo;
- policy owner-scoped con `auth.uid()`, mai autorizzazione basata su
  `user_metadata` modificabile dall'utente;
- tabelle di audit e scritture privilegiate non esposte ad `anon` o
  `authenticated`.
- una chiave funzione viene autorizzata soltanto se esiste un entitlement attivo,
  non scaduto e derivato da `plan_features`; lo stato visivo del client non concede
  accesso.

## Contratto Stripe iniziale

Piani storici da verificare e ricreare con branding IQstatS, senza assumere che i
Price ID legacy siano corretti:

| Codice IQstatS | Modello storico da verificare |
| --- | --- |
| `trial_8_days` | pagamento singolo da €1, accesso per 8 giorni, nessun rinnovo |
| `insight_monthly` | €6,90 al mese |
| `pro_monthly` | €12,90 al mese |
| `pro_annual` | €109,90 all'anno |

Gli importi e i quattro codici sono il catalogo commerciale iniziale; resta da
approvare la matrice esatta delle funzionalità incluse in ciascun piano. Il database
deve supportare questa matrice senza hardcodarla nei componenti UI o nei Price ID.

Il server crea Checkout Session e Customer Portal usando esclusivamente codici piano
ammessi. Il webhook legge il raw body, verifica la firma, registra l'event ID prima
dell'elaborazione e aggiorna subscription/entitlement in modo idempotente. Success URL
o query client non concedono mai accesso premium.

Eventi minimi da coprire nel contratto eseguibile:

- `checkout.session.completed`;
- `invoice.paid` e `invoice.payment_failed`;
- aggiornamento e cancellazione della subscription;
- completamento asincrono del pagamento quando pertinente alla prova una tantum.

## Task e checkpoint

### MIG-0 — Inventario e contratto

**Accettazione:** fonti legacy e IQstatS riconciliate; coupling LineaX escluso;
contratto dati, limiti e gate documentati.

**Verifica:** confronto read-only di documenti, codice legacy, progetto Supabase e
connessione Stripe; nessuna scrittura remota.

### MIG-1 — Destinazione Supabase e migrazione ripetibile

**Accettazione:** progetto IQstatS isolato; migrazioni SQL versionate; RLS, privilegi,
vincoli e rollback documentati; cataloghi `plans`, `features` e `plan_features`
supportano quattro livelli commerciali senza autorizzazioni client-side.

**Verifica:** applicazione prima su ambiente di sviluppo, query di test per ruoli
`anon`, `authenticated` e server, Security/Performance Advisors senza rilievi aperti
critici.

**Gate umano:** approvazione di organizzazione, costo e progetto destinazione prima
della creazione o del ripristino remoto.

### AUTH-1 — Supabase SSR nell'app Next.js

**Accettazione:** client browser/server separati, session refresh tramite proxy,
callback PKCE, route protette dinamiche e nessuna secret key nel bundle.

**Verifica:** signup/sign-in/callback/logout, scadenza sessione, accesso negato e
scansione client.

### BILL-1 — Catalogo Stripe verificato

**Accettazione:** quattro codici piano mappati a prodotti/prezzi IQstatS in test mode;
modalità, valuta, importi e ricorrenza verificati.

**Verifica:** inventario Stripe read-only e confronto indipendente con questo
contratto; nessun Price ID copiato nei componenti client.

**Gate umano:** autenticare nuovamente la connessione Stripe e confermare i quattro
prezzi prima di creare o archiviare risorse.

### BILL-2 — Checkout, portal e webhook Node

**Accettazione:** checkout autenticato, portal owner-scoped, firma webhook e
idempotenza; entitlement scritto soltanto dal server.

**Verifica:** Stripe test clock/CLI o eventi test, replay dello stesso event ID,
pagamento riuscito/fallito, cancellazione e tentativi cross-user.

### RELEASE-1 — Gate separati di rilascio

- autenticazione e rate limiting sulle route pubbliche;
- remediation delle vulnerabilità dipendenze prima del deploy;
- lint, typecheck, test, build e scansione segreti/client;
- review RLS e webhook prima del passaggio al live mode.

## Decisioni ancora richieste

1. **Supabase:** nuovo progetto IQstatS isolato (consigliato) oppure ripristino e
   bonifica del progetto legacy, con rischio maggiore di coupling e dati residui.
2. **Stripe:** conferma dei quattro prezzi e autorizzazione a lavorare inizialmente in
   test mode dopo la nuova autenticazione.
3. **Entitlement:** matrice funzionalità incluse e limiti di ciascuno dei quattro
   piani.
4. **Scope UI:** autenticazione/account/pricing restano fuori da questa migrazione
   infrastrutturale finché non ricevono il gate UX previsto dal progetto.

## Stato esecutivo — 2 agosto 2026

- **Supabase risolto:** scelto il progetto Free `iqStats`; migrazioni applicate dopo
  verifica a zero utenti/righe legacy. RLS, grants, idempotenza, tipi TypeScript e
  Security Advisor sono verificati. La `data-proxy` legacy è neutralizzata con `410`
  e non fa rete; il gateway IQstatS non usa cache o snapshot.
- **Matrice approvata e migrata:** `trial_8_days` (€1/8 giorni, 7 feature),
  `insight_monthly` (€6,90/mese, 5 feature), `pro_monthly` (€12,90/mese, 7 feature),
  `pro_annual` (€109,90/anno, 7 feature). Nessun limite commerciale inventato; il
  rate limit operativo è distinto dagli entitlement.
- **Auth/BILL-2/ENT-1 implementati:** cookie SSR, PKCE callback, sign-out, route
  protette, Checkout/Portal owner-scoped, webhook raw-body firmato, funzione billing
  idempotente e rate limit distribuito.
- **E2E Auth/entitlement completato:** configurazione locale Supabase corretta, cookie
  SSR, negazione anonima, accesso Insight/Pro e logout verificati; nessun dato
  sintetico è rimasto remoto.
- **Gate ancora aperto:** il connettore Stripe deve essere confermato in test mode
  mediante lettura. La chiave locale live resta rifiutata. Nessun prodotto/prezzo
  Stripe è stato creato, nessun Price ID è stato scritto in Supabase e nessun deploy è
  autorizzato.
