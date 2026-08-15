# APP-3D — Contratto della piattaforma dati calcistica

## Stato e decisioni confermate

- **Stato:** proposta eseguibile in revisione umana; nessuna migrazione o chiamata
  remota è ancora stata eseguita in questo incremento.
- **Data:** 9 agosto 2026 (Europe/Rome).
- **Destinazione:** progettazione e verifica prima in locale; applicazione al progetto
  Supabase IQstatS esistente soltanto dopo un checkpoint separato su schema, volumi e
  costi.
- **Scope operativo:** campionati maschili regolari supportati e relativa stagione
  corrente osservata nel 2026/27. Per le competizioni a calendario annuale vale la
  stagione corrente dichiarata dalla fonte, anche quando l'etichetta è soltanto 2026.
- **Scope storico:** i dataset precedenti restano nel workstream di backtest sotto
  `scripts/calibration/`; non vengono importati automaticamente nel database di
  prodotto e non autorizzano expected adjustment.
- **Ordine:** APP-3D → preflight limitato → schema/migrazioni locali → checkpoint
  umano → migrazione e ingest remoto → read model database-backed → APP-6A.

## Obiettivo

Costruire un sistema di record calcistico utile all'utente corrente, veloce nelle
query della dashboard e del dossier e capace di sincronizzarsi senza duplicare dati o
presentare snapshot obsoleti come correnti. Il browser continua a consumare soltanto
le API IQstatS; fonte, credenziali, chiavi esterne e tabelle di ingest restano
server-side.

APP-3D non abilita ancora scritture remote. Definisce i contratti necessari affinché
schema, harvester e read model possano essere verificati prima del caricamento.

## Architettura dati

```text
Fonte server-side
      ↓
preflight e contratti normalizzati
      ↓
job di sync riprendibili e idempotenti
      ↓
schema football non esposto al client
      ↓
read model IQstatS con availability/provenance
      ↓
Route Handler autenticati → UI

Storico CAL-* ──→ scripts/calibration/ soltanto (backtest separato)
```

### Principi di capacità e velocità

1. Chiavi interne `bigint identity`; identificativi della fonte conservati soltanto
   lato server con vincolo univoco per risorsa.
2. `timestamptz` per ogni istante; testo con `check` per stati finiti; valori assenti
   restano `null` con motivo.
3. Upsert atomici a lotti, mai sequenza `SELECT` → `INSERT`; una risposta più vecchia
   non può sovrascrivere uno snapshot più recente.
4. Job concorrenti reclamati con `FOR UPDATE SKIP LOCKED`, transazioni brevi e lock
   advisory per impedire due sync simultanei dello stesso dominio/stagione.
5. Indici composti modellati sulle query reali: uguaglianze prima, intervalli/data per
   ultimi. Tutte le foreign key usate nei join ricevono un indice.
6. Paginazione database a cursore, non `OFFSET`, per liste profonde.
7. Snapshot change-only: se checksum e timestamp fonte non cambiano, non viene creata
   una nuova versione.
8. Nessun partizionamento preventivo delle tabelle ordinarie. Le quote potranno essere
   partizionate per mese soltanto se il preflight proietta un volume che lo giustifica.
9. Connection pooling in transaction mode per app e worker; nessuna connessione nuova
   per singola riga o richiesta.

## Schemi e famiglie di tabelle proposte

Lo schema `football` non viene esposto direttamente ad `anon` o `authenticated`.
L'accesso utente resta mediato dalle API con entitlement. Lo schema `private` contiene
soltanto coordinamento e audit dell'ingest.

| Famiglia | Tabelle proposte | Grana e regola |
| --- | --- | --- |
| Catalogo | `football.competitions`, `football.seasons` | una riga per entità corrente; stagione selezionata dalla fonte, non dal nome |
| Entità | `football.teams`, `football.venues`, `football.referees` | upsert change-aware; campi non verificati restano null |
| Gare | `football.matches` | una riga per gara; home/away, kickoff, stato e score con vincoli espliciti |
| Classifica | `football.standing_snapshots`, `football.standing_rows` | snapshot soltanto quando cambia; righe legate a competizione e stagione |
| Statistiche | `football.match_team_stats` | una riga per gara × squadra × periodo; sette metriche osservate nullable |
| Quote | `football.odds_snapshots`, `football.odds_quotes` | snapshot temporale change-only; corrente/precedente/movimento, mai apertura o chiusura inventate |
| Formazioni | `football.match_lineups`, `football.lineup_players`, `football.unavailable_players` | solo dati strutturati e copertura dichiarata |
| Persone e rosa | `football.players`, `football.managers`, `football.roster_memberships` | profili correnti con `capturedAt`; nessuna retrodatazione |
| Mercato | `football.transfers` | eventi strutturati e idempotenti; importi mancanti restano null |
| Ingest | `private.football_sync_runs`, `private.football_sync_jobs` | stato, cursore, tentativi, finestre e conteggi; nessun segreto o payload completo |

Contenuti social/editoriali, media binari e output di predizione della fonte restano
fuori dal primo database operativo. Possono ricevere un contratto futuro, ma non sono
dati macchina affidabili per APP-6A e non devono rallentare il caricamento utile.

## Envelope e provenance persistenti

Ogni read model ricostruito dal database deve poter produrre l'envelope IQstatS già
approvato. Le tabelle di dominio conservano quando pertinente:

- `captured_at` e `source_updated_at`;
- `availability_status`, `availability_reason` e `missing_fields`;
- checksum normalizzato per deduplicazione;
- `created_at` e `updated_at` del record IQstatS;
- stagione e versione del contratto;
- `sample_size`, periodo e versione formula soltanto per aggregati derivati.

I payload completi della fonte non vengono salvati nel database di prodotto. Fixture
sanificate e campioni di schema restano locali, limitati e auditabili.

## Politica di freschezza proposta

Le finestre sono il default APP-3D da validare nel preflight contro limiti e copertura
della fonte. `stale` inizia quando il dato supera la propria finestra; il client non
trasforma mai uno stale in dato corrente.

| Dominio | Classe | Refresh proposto | Stale servibile | Retention operativa |
| --- | --- | --- | --- | --- |
| competizioni e stagioni | warm | 24 ore | sì, con etichetta | permanente |
| squadre, venue e arbitri | warm | 24 ore; solo se referenziati | sì, con etichetta | stagione corrente |
| gare oltre 7 giorni | warm | 6 ore | sì | stagione corrente |
| gare tra 7 giorni e 24 ore | warm | 60 minuti | sì | stagione corrente |
| gare tra 24 ore e 2 ore | hot | 15 minuti | sì, con limite breve | stagione corrente |
| gare nelle 2 ore pre-kickoff | hot | 5 minuti | no oltre una finestra | stagione corrente |
| gare live | hot | 60 secondi | no | stagione corrente |
| gare concluse | cooling | +15 min, +2 ore, +24 ore; poi freeze | sì | permanente nel record finale |
| classifiche | warm | 6 ore e 60 minuti dopo finestre gara | sì, con etichetta | ultimo snapshot + cambi per giornata |
| statistiche live/finali | hot/cooling | 60 secondi live; stessa finalizzazione della gara | no live; sì finali | record finale permanente |
| formazioni/indisponibili | hot | 30 min nelle 24 ore precedenti; 5 min nelle 2 ore precedenti | no vicino al kickoff | stagione corrente |
| quote oltre 24 ore | warm | 60 minuti | no | change-only |
| quote tra 24 ore e 2 ore | hot | 15 minuti | no | change-only |
| quote nelle 2 ore pre-kickoff | hot | 5 minuti | no | change-only |
| quote live | non autorizzato | nessun refresh finché il contratto non è verificato | no | nessuna |
| rose, giocatori e manager | warm | 24 ore per entità attive | sì, con etichetta | stagione corrente |
| trasferimenti | warm/hot | 12 ore in finestra mercato, 24 ore altrimenti | sì | permanente come evento |

Per classifica e quote si persiste soltanto un cambiamento effettivo. Alla chiusura
della stagione i dati operativi diventano cold: rimangono disponibili per audit, ma
non vengono più sincronizzati e gli artefatti analitici continuano a vivere separati.

## Strategia di ingest

### Preflight DATA-0

- massimo 50 richieste `GET` e massimo due richieste al secondo;
- nessuna scrittura remota;
- inventario di competizioni regolari, stagione corrente, endpoint, paginazione,
  conteggi e timestamp;
- stima righe e dimensione per ciascuna famiglia;
- verifica che ogni dominio possa essere normalizzato senza salvare payload completi;
- report sanificato e checkpoint umano prima delle migrazioni remote.

**Esito verificato il 9 agosto 2026:** 50/50 richieste `GET`, tutte completate con
risposta utile, nessuna scrittura remota e nessuna risposta grezza persistita. Il
contratto macchina dichiara 145 operazioni GET nel perimetro versionato osservato e le
sonde coprono 15 domini normalizzabili. Tutti i 36 campionati della policy locale hanno
una stagione marcata corrente; 21 rispettano la finestra 2026/27, 12 l'anno solare
2026 e 3 espongono un'altra finestra corrente. Il perimetro fresco DATA-1 è quindi 33;
i 3 casi restano sospesi fino al rollover del catalogo o a conferma umana.

Le 36 finestre correnti dichiarano complessivamente 10.361 gare. Questo totale include
i 3 campionati sospesi e non è ancora il conteggio definitivo del perimetro DATA-1. Il
solo nucleo relazionale gare e indici è stimato in 20,2–60,7 MiB; quote, statistiche e
formazioni non vengono proiettate dall'unico campione perché la varianza sarebbe troppo
alta. Report e manifest sanificati vivono in
`scripts/app-ingestion/output/2026-08-09/`.

### Slice di caricamento

1. **DATA-1:** competizioni, stagioni, squadre, gare e classifiche.
2. **DATA-2:** statistiche finali e scheduler di finalizzazione.
3. **DATA-3:** quote change-only con cap e retention verificati.
4. **DATA-4:** formazioni, indisponibili, rose, giocatori e manager.
5. **DATA-5:** trasferimenti e domini aggiuntivi che superano il contratto dati.

Ogni slice deve completare schema, normalizzatore, ingest, QA, read model e verifica
prima della successiva. Un dominio assente non blocca quelli già validi e non produce
contenuto simulato.

## Sicurezza e accesso

- `anon` e `authenticated` non ricevono privilegi diretti sulle tabelle `football` o
  `private`.
- Le API IQstatS verificano sessione, entitlement e rate limit prima di interrogare il
  read model.
- Worker e Route Handler usano ruoli distinti con privilegi minimi; nessuna
  credenziale compare in tabelle, job, errori o log.
- Funzioni `security definer` sono ammesse solo nello schema non esposto, con
  `search_path=''`, controllo esplicito e `EXECUTE` revocato ai ruoli non necessari.
- BILL-3, webhook e risorse test esistenti sono fuori scope e restano invariati.

## Criteri di accettazione APP-3D

- [x] Il preflight conferma competizioni/stagioni correnti e stima volumi senza
  superare il tetto autorizzato.
- [ ] Ogni dominio ha grana, chiavi, freschezza, stale policy, retention e stato di
  assenza espliciti.
- [x] Lo schema locale proposto sostiene dashboard per data/lega/stato, dettaglio,
  classifica e statistiche senza scansioni complete.
- [x] Ingest riprendibile, batch upsert, deduplicazione e protezione da update fuori
  ordine sono specificati e testabili.
- [x] Storico CAL-* resta separato; nessun output modifica expected o UI.
- [ ] Il checkpoint umano approva schema, volume e destinazione prima di qualsiasi
  migrazione o caricamento remoto.

## Verifiche previste

1. parse e controllo incrociato del report DATA-0 con manifest e tetto richieste;
2. migrazione SQL applicata a un database locale vuoto e riapplicazione controllata;
3. test vincoli, FK, indici, privilegi, RLS/assenza accesso client e rollback
   transazionale dei dati sintetici;
4. `EXPLAIN (ANALYZE, BUFFERS)` su lista partite, dettaglio, classifica e coda job;
5. smoke ingest su una competizione e una finestra ridotta, quindi resume e replay;
6. riconciliazione conteggi sorgente → normalizzatore → database, null e zero inclusi;
7. scansione di file, log e bundle per pattern sensibili.

## Rischi e mitigazioni

| Rischio | Mitigazione |
| --- | --- |
| volume superiore alla capacità disponibile | preflight e stima per dominio; caricamento verticale e change-only |
| troppe chiamate nelle finestre live | scheduler adattivo, priorità hot/warm/cold e cap per run |
| snapshot stale mostrato come corrente | soglia per dominio e fail-closed per live/quote |
| duplicati o update fuori ordine | chiavi univoche, upsert atomico e confronto timestamp/checksum |
| coupling al payload della fonte | contratti IQstatS e fixture sanificate prima dello schema |
| query lente con la crescita | indici composti sulle query, keyset pagination e analisi piani |
| mescolanza prodotto/backtest | schema operativo separato e CAL-* confinato a `scripts/calibration/` |

## Checkpoint umano

Prima di DATA-0 occorre approvare questo contratto e il limite del preflight. Prima di
ogni migrazione o ingest remoto occorre un secondo checkpoint con stima di righe,
storage, tempi e costi. APP-6A inizia soltanto dopo che DATA-1 e DATA-2 espongono read
model verificati e freschi.
