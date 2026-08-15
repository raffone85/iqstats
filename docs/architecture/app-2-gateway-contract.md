# APP-2 — Contratto eseguibile del gateway e delle API IQstatS

## Stato e contesto ripristinato

- **Stato:** completato e verificato il 1 agosto 2026.
- **Dipendenza soddisfatta:** APP-1 è completato e verificato in `packages/shared`.
- **Provenienza del contesto:** l'handoff temporaneo post-CAL-4 resta la fonte storica
  dei vincoli. I checkpoint correnti in `docs/workflow.md`, `tasks/plan.md` e
  `tasks/todo.md` lo superano per lo stato operativo: APP-0, APP-1 e APP-2 sono ora
  completati; APP-3 è il prossimo gate.
- **Modalità di ripristino:** confronto incrementale/diff del checkpoint con il
  workspace; nessuna discovery, acquisizione o analisi già completata viene ripetuta.

## Obiettivo

Esporre le prime API IQstatS come Backend for Frontend Next.js, collegando il provider
soltanto lato server ai normalizzatori condivisi. Le route restituiscono esclusivamente
contratti IQstatS e non payload, URL, header o nomi tecnici del provider.

APP-2 non collega le route alla UI, non sostituisce i dati dimostrativi, non introduce
cache o persistenza e non integra gli output CAL-4. Queste decisioni restano nei gate
successivi della roadmap.

I Route Handler sono endpoint HTTP pubblici per natura. APP-2 non inventa una policy
di autenticazione: prima di qualsiasi deploy accessibile occorre il gate auth già
registrato come decisione aperta nell'architettura. I limiti di input e paginazione
ridimensionano l'abuso accidentale, ma non sostituiscono autenticazione e rate limit.

## Route autorizzate

| Route IQstatS | Input pubblico | Risorsa server-side | Normalizzatore |
| --- | --- | --- | --- |
| `GET /api/iqstats/v1/competitions` | nessuno | catalogo leghe paginato | `normalizeCompetitionCatalog` |
| `GET /api/iqstats/v1/matches` | `date`, `leagueId`, `status?`, `limit?`, `offset?` | lista eventi con `league_id` | `normalizeMatchList` |
| `GET /api/iqstats/v1/matches/{matchId}` | ID intero positivo | dettaglio evento | `normalizeMatchDetail` |
| `GET /api/iqstats/v1/matches/{matchId}/odds` | ID intero positivo | lista quote evento paginata | `normalizeOddsPages` |
| `GET /api/iqstats/v1/matches/{matchId}/statistics` | ID intero positivo | dettaglio + statistiche evento | `normalizeObservedMatchStats` |
| `GET /api/iqstats/v1/matches/{matchId}/h2h` | ID intero positivo | H2H evento | `normalizeHeadToHead` |
| `GET /api/iqstats/v1/competitions/{leagueId}/standings` | `seasonId` intero positivo | classifica lega/stagione | `normalizeStandingTable` |

La prima slice della lista richiede sempre `date=YYYY-MM-DD` e `leagueId`: il gateway
non permette una richiesta eventi priva del filtro `league_id`, perché il filtro
generico già osservato può restituire migliaia di record eterogenei. `countryId` e
`dataAvailability` non sono accettati finché non esiste una mappatura verificata.

Gli stati lista inizialmente ammessi sono `not_started`, `finished`, `postponed` e
`cancelled`. Lo stato aggregato `live` non viene tradotto in un solo stato esterno,
perché ometterebbe intervallo, primo/secondo tempo e altri stati live verificati.

## Contratto dati e limiti invarianti

- Le risposte di successo usano `DataEnvelope<T>` di `@iqstats/shared`.
- `sourceKind` è una categoria IQstatS generica; identità e URL del provider non sono
  esposti al client.
- `capturedAt`, `sourceUpdatedAt`, `missingFields` e copertura restano espliciti.
- Un dato mancante resta `null` o `unavailable`; uno zero viene preservato solo quando
  è realmente presente nella fonte.
- Le quote espongono soltanto prezzo corrente, osservazione precedente, movimento e
  timestamp espliciti. Apertura e chiusura sono sempre
  `unavailable/not_exposed_by_source`.
- La forma è soltanto la sequenza compatta W/D/L della classifica. Date, avversari e
  split casa/trasferta restano indisponibili.
- L'ID gara nel contratto è l'ID richiesto alla route IQstatS; l'`event_id` osservato
  nella lista quote non diventa una chiave client.
- `expectedAdjustmentAllowed` resta `false`; nessun expected o probabilità viene
  corretto usando CAL-4.

## Paginazione, timeout e rete

- Solo richieste `GET`, `cache: no-store` e timeout fisso di 8 secondi per richiesta.
- Catalogo: pagine da 100, massimo tre pagine; un catalogo oltre il cap è `partial`.
- Lista gare: una pagina per richiesta client, `limit` da 1 a 100 e `offset` da 0 a
  10.000; totale e presenza pagina successiva restano nel read model.
- Quote di una singola gara: pagine da 200, massimo cinque pagine. Il normalizzatore
  confronta record acquisiti e totale dichiarato; il cap produce `partial`, mai un
  risultato apparentemente completo.
- Il client server-side costruisce soltanto path `/api/v2/` autorizzati e rifiuta URL
  assoluti o origini diverse dalla base configurata.

Questi limiti servono richieste puntuali dell'app e non costituiscono harvesting.

## Errori pubblici

Le route non propagano body, stack, URL o messaggi del provider. Il corpo usa
`ApiErrorEnvelope` con `data: null`, availability e uno dei codici:

| Codice | HTTP | Retry | Significato pubblico |
| --- | ---: | --- | --- |
| `invalid_request` | 400 | no | parametro assente, duplicato o fuori contratto |
| `not_found` | 404 | no | risorsa richiesta non disponibile |
| `source_not_configured` | 503 | no | configurazione server-side assente/non valida |
| `source_rate_limited` | 503 | sì | fonte temporaneamente limitata |
| `source_timeout` | 504 | sì | timeout della fonte |
| `source_unavailable` | 502 | sì | errore HTTP o di rete della fonte |
| `source_invalid_response` | 502 | sì | risposta non JSON o non normalizzabile |
| `internal_error` | 500 | no | errore inatteso senza dettagli sensibili |

Tutte le risposte impostano `Cache-Control: no-store`. APP-3 deciderà eventuali TTL,
snapshot e persistenza; APP-2 non anticipa quella scelta.

## Verifica e criteri di accettazione

- test dei validatori su input validi, mancanti, duplicati e fuori limite;
- test del client con fetch finta per header server-side, timeout, status e risposta
  non JSON, senza stampare credenziali;
- test del gateway sulle fixture sanificate APP-0D/CAL-0 per tutte le route;
- riconciliazione quote: 448 record, undici mercati, 347 osservazioni precedenti,
  opening/closing sempre indisponibili e paginazione incompleta `partial`;
- smoke dei Route Handler con sorgente iniettata o server locale senza rete esterna;
- scansione del bundle/confine per segreti e payload grezzi;
- lint e build Next.js dopo le modifiche TypeScript.

## Checkpoint successivo

### Esito verificato

- `packages/shared`: type-check strict e 7/7 test passati.
- `apps/web`: type-check mirato gateway, lint e 8/8 test passati.
- Build Next.js 16.2.11 eseguita in una copia temporanea pulita, senza file `.env`:
  compilazione e TypeScript passati; tutte le sette route IQstatS risultano dinamiche.
- Smoke compilato: tre richieste invalide restituiscono `400 invalid_request`; senza
  configurazione la route catalogo restituisce `503 source_not_configured`. Tutte
  hanno `data: null` e `Cache-Control: no-store`.
- Smoke live controllato: `GET /api/iqstats/v1/matches/7198` ha attraversato fonte,
  normalizzatore e Route Handler con HTTP 200, ID `7198`, competizione `9` e
  `sourceKind=external-data`. La verifica conclusiva ha usato due GET mirate; contando
  il tentativo sul server preesistente e lo smoke di recovery, APP-2 ha generato al
  massimo sei GET live, senza paginazione o harvesting.
- Scansione dei chunk client pulita per nomi variabile di credenziali, header,
  host della fonte, campi raw quote ed `event_id`.
- Nessun file TSX/UI è stato modificato; nessun output CAL-4 è stato importato.

### Limiti di rilascio

- `npm audit --omit=dev` segnala tre vulnerabilità `high`: `next` diretta e `postcss`/
  `sharp` transitive. Non è stato applicato un aggiornamento automatico fuori scope;
  la risoluzione è necessaria prima di un deploy.
- Il processo di sviluppo preesistente sulla porta 3100 ha mostrato risposte
  intermittenti anche su `/api/health`; non è stato fermato o riavviato. Le verifiche
  canoniche sono state quindi eseguite su build e server temporanei puliti.
- La copia di build temporanea non contiene `.env` o segreti, ma il runtime ha bloccato
  la sua rimozione ricorsiva. Percorso da eliminare quando consentito:
  `C:\Users\utente\AppData\Local\Temp\IQstatS-app2-build-baf96f000ab542aea8118ff665771c64`.

APP-2 è completato. La UI resta invariata. APP-3 richiede una decisione esplicita su
cache/persistenza; autenticazione e audit dipendenze restano gate di rilascio distinti.

**Risoluzione successiva (2 agosto 2026):** il gate dipendenze è chiuso con Next
16.2.12, PostCSS 8.5.25 e Sharp 0.35.3; audit produzione a zero vulnerabilità, 13 test,
lint, typecheck e build puliti. Auth ed entitlement sono ora implementati e le route
negano l'accesso anonimo prima del provider; resta aperto soltanto lo smoke autenticato
con le env Supabase IQstatS corrette. Il gateway conserva `no-store` e TTL 0.
