# Piano di esecuzione — IQstatS

## Obiettivo

Costruire IQstatS come applicazione originale di intelligence calcistica: dashboard per
selezionare gare, dossier per spiegarle, dati normalizzati server-side e modelli
trasparenti. La mappatura di BioFootballBet ispira la gerarchia funzionale, non viene
replicata.

## Decisioni architetturali

- Provider → adapter server-side → contratti IQstatS → API app → UI.
- Il modello di dispersione rimane isolato in `scripts/calibration/` fino al backtest.
- Ogni valore visualizzato dichiara origine, timestamp, copertura e limiti.
- Nessuna route o tab è resa disponibile senza read model reale.
- Desktop e mobile condividono gerarchia e URL; cambiano solo la presentazione della
  navigazione.

## Dipendenze

```text
Reference map + MVP
        ↓
API discovery ──→ shared contracts ──→ app API ──→ shell ──→ dashboard ──→ match dossier
        ↓                                                              ↑
calibration discovery → dataset → QA → baselines / model  ────────────┘
```

## Fasi

### Fase 0 — Discovery e gate dei dati

- [x] CAL-0: ricognizione API e artefatti sanificati.
- [x] Gate 0: conferma umana della policy di harvesting in
  `scripts/calibration/discovery/NOTES.md`.
- [x] APP-0: matrice dei contratti API necessari all'MVP, approvata dall'utente il
  1 agosto 2026 con i limiti in `docs/architecture/mvp-data-contract-matrix.md`.
- [x] APP-0D: discovery mirata di lista/dettaglio, quote, forma, classifica e H2H,
  completata il 1 agosto 2026 senza modificare l'app.

**Checkpoint APP-0 soddisfatto:** APP-1 può tipizzare quote corrente/precedente/
movimento, ma apertura, chiusura e forma dettagliata restano indisponibili perché non
esposte esplicitamente.

### Fase 1 — Fondazioni condivise

- [x] APP-1: tipi IQstatS, availability metadata e normalizzazione server-side,
  completati il 1 agosto 2026 senza collegare il package all'app.
- [x] APP-2: gateway/API app con validazione, errori e fixture sanificate, completato
  e verificato il 1 agosto 2026 entro `docs/architecture/app-2-gateway-contract.md`.
- [ ] APP-3D: contratto dati operativo, freschezza, retention e ingest. Il 9 agosto
  2026 l'utente ha confermato progettazione locale, stagione corrente 2026/27 dei
  campionati regolari supportati e storico confinato al backtest. La proposta
  eseguibile è in
  `docs/architecture/app-3d-football-data-platform-contract.md`; restano i checkpoint
  sul preflight e sulle scritture remote.

**Checkpoint:** un match reale percorre provider → contratto interno → API app senza
segreti o campi inventati.

**Checkpoint APP-1 soddisfatto:** i normalizzatori puri coprono catalogo, lista e
dettaglio gare, statistiche osservate, classifica, forma compatta W/D/L, H2H e 448
quote su undici mercati. Apertura, chiusura e forma dettagliata restano esplicitamente
indisponibili; una pagina quote incompleta dichiara copertura parziale. Type-check
strict e sette test su fixture sanificate sono passati. APP-2 richiede un nuovo gate
umano perché introduce il gateway esclusivamente server-side nell'app; il gate è stato
poi autorizzato e soddisfatto il 1 agosto 2026.

**Checkpoint APP-2 soddisfatto:** sette route dinamiche IQstatS attraversano il solo
confine server; match `7198` verificato live fonte → contratto → API con HTTP 200.
Validazione, timeout, paginazione limitata ed errori pubblici sono testati; lint e build
passano e i chunk client non contengono credenziali o campi raw cercati. Al checkpoint
APP-2 la UI era ancora dimostrativa e auth/vulnerabilità erano aperte; i checkpoint del
2 agosto 2026 hanno poi chiuso questi blocchi e la slice APP-4/APP-5. APP-3 resta il
gate distinto per cache/persistenza.

### Fase 1B — Migrazione selettiva Auth e billing

- [x] MIG-0: inventario autorizzato degli artefatti LineaX e contratto di migrazione
  in `docs/architecture/lineax-to-iqstats-migration.md`.
- [x] MIG-1: progetto Supabase IQstatS isolato e migrazioni SQL versionate per profili,
  piani, billing, subscription, entitlement e idempotenza webhook.
- [x] AUTH-1: Supabase SSR server/client, callback PKCE, session refresh, sign-out e
  route protette verificati con E2E autenticato, cookie SSR e logout, senza modifiche
  UI.
- [x] AUTH-2: accesso passwordless visibile e stato anonimo azionabile; eliminato il
  fallback che chiedeva un ID campionato tecnico quando il catalogo era protetto.
- [x] BILL-1: quattro piani IQstatS riconciliati idempotentemente in Stripe test mode
  e mappati in Supabase senza esporre identificativi o segreti.
- [x] BILL-2: Checkout, Customer Portal e webhook firmato/idempotente verificati con
  suite locale e con un evento test realmente inoltrato dal Stripe CLI autenticato.
- [x] BILL-3: UI Billing e `create-checkout-session` Edge Function pubblicate in
  production, con catalogo read-safe, JWT obbligatorio ed E2E autenticato Stripe test
  completato il 9 agosto 2026.
- [x] QF-1: chiudere la baseline qualitativa del checkout pubblicato: aggiornamenti
  compatibili delle dipendenze, controlli statici e smoke non transazionale in
  produzione. L'E2E autenticato Stripe test rimane un gate umano separato.
- [x] ENT-1: catalogo, matrice e enforcement server-side verificati a livello database
  e con smoke autenticato cross-plan Insight/Pro.

**Decisione di confine:** la migrazione non importa il proxy/cache provider LineaX.
Il gateway APP-2 resta stateless, `no-store` e TTL 0; cache e snapshot calcistici
restano nel gate APP-3. Il progetto Supabase legacy inattivo non diventa produzione
IQstatS senza scelta umana esplicita.

**Checkpoint MIG-0:** prima di scritture remote servono scelta del progetto Supabase
e conferma di eventuali costi; prima di modifiche Stripe serve riautenticazione e
conferma di importi/modalità. Auth/rate limiting e remediation dipendenze restano gate
di deploy separati.

### Fase 1A — Piattaforma dati calcistica corrente

- [x] DATA-0: preflight read-only completato con 50/50 GET, 36 campionati correnti,
  inventario di 145 operazioni e report sanificato; zero scritture remote.
- [x] DATA-1: schema locale e vertical slice competizioni, stagioni, squadre, gare e
  classifiche.
- [ ] DATA-2: statistiche gara, scheduler adattivo e finalizzazione dei record.
- [ ] DATA-3: quote change-only con frequenza e retention validate.
- [ ] DATA-4: formazioni, indisponibili, rose, giocatori e allenatori.
- [ ] DATA-5: trasferimenti e domini aggiuntivi soltanto dopo contratto verificato.

**Decisione del 9 agosto 2026:** il database di prodotto serve la stagione corrente
utile all'utente. Per le competizioni a calendario annuale vale la stagione corrente
dichiarata dalla fonte. I dataset storici CAL-* restano in `scripts/calibration/` come
backtest separato; non vengono importati automaticamente né autorizzano correzioni
degli expected.

**Checkpoint DATA-0:** nessuna scrittura remota prima della revisione umana del report
con stima righe, storage, tempi e costi. Il caricamento procede per slice complete e
riprendibili, non come dump indistinto di tutti i payload.

**Esito DATA-0 del 9 agosto 2026:** 33 campionati soddisfano il perimetro fresco
2026/27 o calendar-year 2026; 3 finestre correnti non conformi restano sospese. Le 36
finestre osservate dichiarano 10.361 gare e il nucleo relazionale è stimato in
20,2–60,7 MiB. I dettagli sono in
`scripts/app-ingestion/output/2026-08-09/DATA-0-REPORT.md`. Il prossimo lavoro locale è
DATA-1; migrazione e ingest sul database remoto restano non autorizzati.

**Avanzamento DATA-1 del 9 agosto 2026:** WSL, Docker Desktop per-user e Supabase CLI
versionata sono operativi. Le migrazioni locali contengono 8 tabelle `football`, 2
tabelle di sync private, 19 indici, RLS fail-closed, coda `SKIP LOCKED`, 2 read model e
batch upsert server-only. Reset, smoke, benchmark su 10.361 gare e test di replay,
snapshot change-only e update fuori ordine sono superati con rollback. Il normalizzatore
e il runner locale passano 8 test; il piano offline stima 86–171 GET per 33 campionati,
con cap proposto di 200 e massimo 2 richieste/secondo. DATA-1 resta aperto per ingest,
resume e riconciliazione reali. Nessun accesso al database remoto è stato usato.

**Esito DATA-1 del 9 agosto 2026:** l'ingest reale e il resume locale sono completati
entro 101/200 GET complessivi, al massimo due richieste al secondo, con zero scritture
al provider, zero accessi al database remoto e zero payload raw persistiti. Il database
locale contiene 36 competizioni e stagioni, 9.548 gare e 591 squadre per le 33 stagioni
fresche; le 3 finestre in hold restano escluse. Ventuno classifiche sono complete,
undici sono vuote/incomplete e una e' assente: la copertura mancante resta esplicita e
non viene sintetizzata. Chiavi, relazioni e conteggi delle righe sono riconciliati senza
duplicati. Report: scripts/app-ingestion/output/2026-08-09/DATA-1-RECONCILIATION-20260809T085116Z.json.
DATA-2, APP-6A e ogni lavoro sul database remoto restano fuori scope.

**Decisione confermata il 2 agosto 2026:** Supabase e Stripe sono parti permanenti di
IQstatS. Supabase gestisce dati, Auth e stato degli entitlement; Stripe gestisce i
pagamenti dei quattro piani. La matrice esatta piano → funzionalità resta un gate umano
prima di ENT-1 e del go-live.

**Checkpoint MIG-1 del 2 agosto 2026:** l'utente ha scelto il progetto Free `iqStats`
esistente. Dopo preflight a zero righe sono stati rimossi gli oggetti LineaX vuoti e
applicati profili, quattro piani, sette feature, billing, subscription, entitlement,
idempotenza, RLS/grants e rate limit distribuito. Gli advisor sicurezza sono puliti;
gli avvisi performance rimasti sono solo `unused_index` su tabelle ancora vuote.
L'endpoint Edge legacy non eliminabile è neutralizzato con `410` e JWT obbligatorio.
Il catalogo Stripe test è riconciliato e mappato sui quattro piani. La suite webhook
firmata verifica replay, upgrade/downgrade, pagamento fallito, cancellazione, ordine
eventi e rifiuto cross-user; il database impedisce anche il cambio owner di una
subscription esistente. La consegna dal vero Stripe CLI test è stata osservata con
HTTP 200. La chiave locale live resta correttamente rifiutata dal runtime.

**Checkpoint BILL-1/BILL-2 soddisfatto il 2 agosto 2026:** CLI associato tramite il
flusso ufficiale Stripe in Chrome, credenziale test verificata, signing secret locale
sincronizzato senza output e fixture Stripe test consegnata al Route Handler con HTTP
200. La suite billing firmata completa è passata dopo la rotazione; nessuna risorsa
live è stata usata e la pulizia remota è tornata a zero dati temporanei.

**Checkpoint BILL-3 soddisfatto il 9 agosto 2026:** la validazione della Edge Function
passa esplicitamente il JWT ES256 a `getClaims`, mantenendo il gate JWT e Stripe test
mode. Typecheck, lint e test Billing sono verdi; la nuova versione della sola funzione
è pubblicata. Un unico Checkout autenticato di prova una tantum è stato completato e
pagato, con ritorno alla pagina Billing, webhook esistente invariato, evento test
processato e sette entitlement attivi. Le risorse test del checkpoint restano presenti
perché il cleanup non è stato autorizzato.

### Fase 2 — Gerarchia e shell

- [x] UX-0: direzione visiva e design system validati con `ui-ux-pro-max`.
- [x] UX-1: shell, navigazione primaria e stati comuni implementati e verificati.
- [x] UX-2: override per dashboard e dossier partita definiti.

**Checkpoint:** gerarchia mobile/desktop, URL, back navigation e accessibilità sono
approvati prima delle pagine di contenuto.

**Esito UX-0/1/2 (2 agosto 2026):** master e override `/partite`/`/match` confermano
dashboard compatta originale, controlli ≥44 px, focus, skip link e reduced motion. La
shell usa una sola destinazione primaria mappata. Browser test a 375/768/1024/1440 px
senza overflow, con accesso/errore espliciti e ritorno che preserva i filtri.

### Fase 3 — Vertical slice MVP

- [x] APP-4: `/partite` con filtri, lista e stati di disponibilità, verificata nel
  percorso felice autenticato con dati normalizzati autorizzati.
- [x] APP-5: `/match/[matchId]` con testata, riepilogo e metodo/fonti, verificata nel
  percorso felice autenticato con contesto di ritorno preservato.
- [x] APP-5M: stemmi squadra del dossier tramite proxy media interno, entitlement e
  validazione binaria; nessuna persistenza o cache provider.
- [ ] APP-6: prima categoria statistica con confronto casa/trasferta.

**Checkpoint:** un utente apre una gara reale e può leggere dati, fonte, freschezza e
assenze fino al dettaglio, senza link fittizi.

**Checkpoint APP-4/APP-5 soddisfatto il 2 agosto 2026:** un entitlement Insight
temporaneo ha attraversato lista API, dashboard SSR, dettaglio API e dossier SSR sulla
gara autorizzata `7198`. Le risposte erano normalizzate e `no-store`; nessun payload
provider è stato persistito e utenti/eventi temporanei sono stati rimossi. APP-3 resta
non avviato.

### Fase 4 — Dossier e domini incrementali

- [ ] APP-7: mercati e probabilità solo quando normalizzati e spiegabili.
- [ ] APP-8: gol, statistiche squadra e contesto una famiglia alla volta.
- [ ] APP-9: competizioni, squadre e giocatori come viste database.
- [ ] APP-10: segnali IQstatS versionati, con spiegazione e limiti.

### Fase 5 — Calibrazione e validazione del modello

- [x] CAL-1: harvester riprendibile per leghe regolari domestiche.
- [x] CAL-2: checkpoint qualità dataset.
- [x] Gate CAL-2: autorizzazione umana a CAL-3 ricevuta il 22 luglio 2026.
- [x] CAL-3: dispersione, baseline casa/trasferta e report.
- [x] Gate CAL-3: CAL-4 autorizzato dall'utente il 22 luglio 2026.
- [x] CAL-4A: sanity check e backtest temporale della dispersione.
- [x] CAL-4B: dataset di contesto point-in-time, normalizzato e riprendibile.
- [x] CAL-4C: stabilità rosa, cambio allenatore e baseline neopromosse.
- [x] Gate CAL-4: il 1 agosto 2026 l'utente ha autorizzato APP-0 e APP-1 con uso
  futuro esclusivamente server-side degli output CAL-4. Non sono
  autorizzate modifiche degli expected né un'integrazione UI diretta.

#### Contratto CAL-3 approvato

- Input canonici: `scripts/calibration/data/dataset.csv` e decisioni di inclusione in
  `scripts/calibration/output/DATASET_QUALITY.json`; nessuna rete e nessuna
  configurazione privata.
- Unità: team-gara per la dispersione squadra; somma home+away per la dispersione
  match. Per una metrica entrano nei calcoli soltanto match completi su entrambi i
  lati; i null non sono imputati né convertiti in zero.
- Formula: media, varianza campionaria con denominatore `n - 1`, SD campionaria e
  `D = varianza / media`; risultati non definiti restano `null` e causano errore se
  riguardano una combinazione ammessa nel run completo.
- Split: per ogni combinazione lega/metrica ammessa, statistiche team complessive,
  home, away e match, più rapporto tra media home e media away.
- Aggregazione: le baseline sono sempre separate per `league_id`. Il riferimento
  globale di dispersione aggrega soltanto osservazioni complete appartenenti alle
  combinazioni ammesse e non è una baseline di lega.
- Costanti: conservare entrambe le granularità team e match; applicare
  `D <= 1.05 -> 1.00` nelle costanti generate. Un override per lega è attivo solo se
  la differenza assoluta dal D globale grezzo supera `0.10`.
- Output: report JSON e Markdown auditabili, tabella console,
  `MARKET_DISPERSION.generated.ts` e `LEAGUE_BASELINES.generated.ts`, tutti sotto
  `scripts/calibration/output/`.
- Verifica: type-check strict, help CLI, smoke su sottoinsieme reale senza scritture,
  run completo e controllo indipendente di conteggi, esclusioni, provenance,
  separazione delle leghe e parse/import degli output.

**Esito CAL-3 (22 luglio 2026):** 155 combinazioni analizzate e 97 escluse come da
QA; sette riferimenti globali di dispersione, 155 baseline distribuite su 23 leghe,
65 override team e 83 override match oltre soglia. Tutte le verifiche previste sono
passate; nessun output è stato integrato nell'app.

#### Contratto CAL-4 approvato

**CAL-4A — sanity check e backtest**

- Il sanity check confronta i D team di Serie A con il pilota documentato; per i
  corner usa anche Yip et al. (2024, DOI `10.1080/01605682.2024.2306170`) e per i
  cartellini Philipson (2026, DOI `10.1093/jrsssa/qnag014`). Una metrica è sospetta
  soltanto secondo la regola del task: scostamento oltre `0.5` sia dal pilota sia da
  un riferimento esterno numerico pertinente. L'assenza di letteratura numerica è
  dichiarata e non viene trasformata in conferma.
- Il backtest è esclusivamente distributivo, perché il dataset non contiene linee o
  quote di mercato: split cronologico 70/30 per date intere dentro ogni lega, stima
  di media e D sul solo train e valutazione sul test. Non è un backtest economico.
- Confronti: Poisson, Binomiale Negativa con D globale train e Binomiale Negativa con
  override di lega train. Metriche: negative log-likelihood media, differenza
  appaiata con intervallo al 95% e copertura dell'intervallo predittivo centrale 80%.
- Il test usa separatamente osservazioni team (media home/away, D team) e totale match
  (media match, D match). Nessun valore del test entra nella stima.
- Output previsti: `validateModel.ts`, `MODEL_VALIDATION.json/.md` e una costante di
  validazione che mantiene stato, caveat e gate umano senza integrare l'app.

**Esito CAL-4A (23 luglio 2026):** sanity Serie A senza metriche sospette secondo la
regola concordata; split cronologico per date intere su 23 leghe e 155 combinazioni,
con 310/310 righe metrica/granularità valutate. Il confronto distributivo ha prodotto
NLL, intervalli appaiati al 95% e copertura centrale 80% per Poisson, NB globale e NB
con override di lega. Type-check, help, self-test PMF, smoke Serie A, run completo,
ricomputazione indipendente di split/conteggi/D/NLL/intervalli, import degli output e
scansione sensibili sono passati. Nessun output è stato integrato nell'app; CAL-4B è
il prossimo blocco autorizzato.

**CAL-4B — acquisizione del contesto**

- Il provider resta server-side. Lo script salva solo contratti normalizzati e
  sanificati sotto `scripts/calibration/context/data/`, con rate limit, retry,
  manifest e ripresa; token, header e valori `.env.local` non sono letti o stampati.
- Gli eventi di lega ricostruiscono team ID, coach ID e coorti della stagione di
  calibrazione, della stagione precedente e della stagione corrente. Gli snapshot
  rosa/mercato sono ammessi come "inizio stagione" solo quando `asOf` cade entro 60
  giorni dallo start della stagione corrente; gli snapshot tardivi sono esclusi.
- La finestra mercato va da 60 giorni prima dello start stagione a `asOf`. Valori di
  mercato e profili allenatore sono snapshot catturati, mai retrodatati.
- Output previsto: `buildContextDataset.ts` e manifest con fonte, `capturedAt`,
  `asOf`, copertura, assenze e motivo di ogni esclusione.

**Contratto dati eseguibile CAL-4B:**

- Input locali: QA e report CAL-3 per limitare il lavoro alle 23 leghe con almeno
  una baseline; dataset/raw CAL-1 restano immutati. Input live server-side: catalogo
  leghe, eventi, rose, trasferimenti, dettaglio giocatore e manager.
- Grana e chiavi: un file evento per `leagueId × cohort` (`previous`,
  `calibration`, `current`); una rosa per `teamId`; trasferimenti e contesto squadra
  per `leagueId × teamId`; snapshot giocatore e manager per relativo ID.
- Persistenza: shard normalizzati sotto
  `scripts/calibration/context/data/{asOf}/`, manifest atomico e ripresa solo da
  contratti leggibili dello stesso snapshot. I raw del provider non vengono salvati.
- Provenance: ogni contratto riporta `schemaVersion`, risorsa generica, filtri,
  `capturedAt`, `asOf`, conteggi, campi mancanti e riferimenti agli shard collegati.
- Point-in-time: roster e valori sono snapshot correnti; la loro eleggibilità come
  inizio stagione richiede distanza assoluta dallo start corrente non superiore a
  60 giorni. I player dei trasferimenti assenti dalle rose ricevono, se disponibile,
  un dettaglio corrente separato; non vengono mai retrodatati.
- Allenatori: ultimo coach storico e coach corrente sono derivati dagli eventi; il
  filtro manager per squadra non determina il coach corrente. Profili mancanti
  restano `null` con motivo.
- Verifica prima del run completo: type-check, help, dry-run, smoke su una lega con
  numero di team limitato, seconda esecuzione di ripresa, audit di chiavi/grana,
  date, paginazione, copertura, provenance e pattern sensibili.

**Esito CAL-4B (23 luglio 2026):** snapshot `asOf=2026-07-23` completato e ripreso
con una sola richiesta al catalogo. Sono stati verificati 4.185 JSON: 69 contratti
evento con 20.151 eventi, 445 contesti lega/squadra, 427 rose uniche, 11.185 righe
trasferimento, 2.298 player integrativi e 500 manager. Le 23 coorti di calibrazione
riconciliano esattamente i match CAL-1; chiavi, date, join, paginazione, riferimenti,
resume e scansione sensibili sono passati. Limiti da propagare a CAL-4C: 121 contesti
fuori dalla finestra ±60 giorni, 175 con copertura valore rosa sotto 80%, 14 team con
trasferimenti sotto 80% di copertura valori e sette coorti precedenti vuote o sotto
80% per le baseline neopromosse. Undici shard player ridondanti dello smoke sono
stati rimossi dal full run canonico e registrati nel manifest.

**CAL-4C — indici e baseline neopromosse**

- Un titolare storico è un player ID presente in `average_positions` in almeno il
  60% dei match coperti della squadra; l'indice è calcolabile solo con almeno l'80%
  di copertura di match, rosa e valori di mercato richiesti.
- `squadStability` usa una formula versionata e trasparente: 60% continuità del valore
  di mercato e 40% continuità dei titolari, entrambe basate su turnover entrante e
  uscente; dati insufficienti producono `null`, non un fallback numerico.
- Il cambio allenatore confronta l'ultimo coach della stagione storica con il coach
  osservato negli eventi della stagione corrente. `tacticalShift` richiede cambio e
  distanza esplicita tra profilo tattico/formazione; assenze producono `null`.
- Le neopromosse sono identificate come team ID presenti nella stagione di
  calibrazione ma assenti nella precedente della stessa lega. Le relative baseline
  usano solo match completi e restano separate per `league_id`.
- Gli indici possono soltanto raccomandare cap della confidenza, badge "regime
  incerto" e allargamento della no-bet zone. `expectedAdjustmentAllowed` resta
  sempre `false`: gli snapshot point-in-time storici necessari a testare potere
  predittivo del contesto non sono disponibili.
- Output previsti: `contextIndex.ts`, `CONTEXT_REPORT.json/.md`,
  `SQUAD_CONTEXT.generated.ts` e `LEAGUE_BASELINES.generated.ts` arricchito con la
  voce `promoted` senza mescolare leghe.

**Esito CAL-4C (23 luglio 2026):** elaborati 445 contesti team in 23 leghe: 214
`squadStability` calcolabili e 231 `null` con motivo; cambio allenatore determinabile
per 369 team, con 109 cambi osservati; `tacticalShift` determinabile per 338 team e
rilevato in 61 casi. Sono disponibili 15 baseline neopromosse; otto restano
indisponibili: le sette coorti già insufficienti in CAL-4B più la lega 23, esclusa
perché le coorti precedente e di calibrazione hanno overlap team ID pari a zero.
L'audit indipendente ha preservato tutte le 155 baseline metriche CAL-3 e ricalcolato
105 baseline metriche neopromosse. Type-check strict, help, self-test, smoke, full run,
ricomputazione indipendente di formule/campioni, import TypeScript, scansione di 78.555
chiavi e controllo dei pattern sensibili sono passati. Gli output generati conservano
`allowedForAppIntegration=false` ed `expectedAdjustmentAllowed=false` come stato
storico al momento della generazione. Il gate umano successivo autorizza soltanto la
pianificazione APP-0/APP-1 e un futuro consumo server-side; non riscrive gli artefatti
né abilita correzioni degli expected.

**Verifica CAL-4:** type-check strict; help e dry-run/smoke; test sintetici interni
delle formule; riconciliazione indipendente train/test e NLL; audit del manifest e
dei contratti di contesto; conteggi e copertura; import degli output TypeScript;
scansione pattern sensibili. Nessuna build UI è richiesta finché l'app non cambia.

**Checkpoint:** nessuna baseline sospetta o metrica incompleta entra nell'app senza
evidenza, caveat e conferma umana.

### Fase 6 — Quality gate di rilascio

- [ ] Verifica test, build, sicurezza e assenza segreti.
- [ ] Verifica UI a 375 / 768 / 1024 / 1440 px, tastiera e reduced motion.
- [ ] Revisione delle fonti, timestamp, formule e stati missing/error.

## Rischi

| Rischio | Mitigazione |
| --- | --- |
| Payload o filtri provider incoerenti | Discovery, fixture, adapter tipizzato e test per contratto |
| UI che promette dati non disponibili | IA condizionale ai read model e stati espliciti |
| Modelli distorti da missingness | null non imputati, QA e gate tra calibrazione e app |
| Deriva verso copia del riferimento | usare solo flussi/gerarchia, design e nomenclatura originali |
| Segreti nei client o nei log | confine server-side, `.env.local` ignorati e verifica finale |
