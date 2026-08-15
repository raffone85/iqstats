# APP-0 — Matrice dei contratti dati MVP

## Stato e perimetro

- **Stato:** approvata dall'utente il 1 agosto 2026; APP-1 e APP-2 completati entro i
  limiti documentati. Il package è collegato soltanto al layer server, non alla UI.
- **Data:** 1 agosto 2026 (Europe/Rome).
- **Scope originario APP-0:** definizione dei read model IQstatS e della loro evidenza
  locale, senza chiamate provider o modifiche app. Le annotazioni APP-2 registrano
  l'implementazione successiva; persistenza e rigenerazione CAL-4 restano escluse.
- **Gate CAL-4:** l'utente ha autorizzato APP-0 e APP-1 con uso
  futuro esclusivamente server-side degli output. Il report generato resta un artefatto
  immutabile con `allowedForAppIntegration=false`; la decisione umana successiva non ne
  riscrive la storia.
- **Vincolo modello:** `expectedAdjustmentAllowed=false` resta invariato. Gli indici di
  contesto possono soltanto limitare la confidenza, dichiarare un regime incerto e
  allargare la no-bet zone.

Questa matrice traduce il flusso MVP in contratti IQstatS. Le sette route autorizzate
in `docs/architecture/app-2-gateway-contract.md` sono implementate; le altre restano
proposte non disponibili.

## Livelli di evidenza

| Stato | Significato operativo |
| --- | --- |
| `verificato-locale` | Esiste una fixture sanificata o un output canonico già verificato. |
| `parziale` | Alcuni campi o una rotta sono osservati, ma manca una fixture completa per il read model MVP. |
| `non-mappato` | Il dominio non ha ancora schema ed evidenza sufficienti; la UI resta non disponibile. |
| `vietato-mvp` | Il dato non può entrare nell'MVP con l'evidenza corrente. |

Un endpoint o una sezione non passa a `disponibile` finché schema, fixture, freschezza,
missingness e verifica non sono tutti documentati.

## Envelope comune IQstatS

Ogni risposta dati usa gli stessi quattro blocchi logici:

| Blocco | Campi minimi | Regola |
| --- | --- | --- |
| `data` | read model oppure `null` | Nessun payload provider grezzo raggiunge il client. |
| `availability` | `status`, `reason`, `missingFields`, `coverage` quando pertinente | Un campo mancante non diventa `0`, `"--"` o un valore dimostrativo. |
| `provenance` | `sourceKind`, `capturedAt`, `sourceUpdatedAt` se presente, `asOf` se pertinente | Il client mostra un'etichetta generica e leggibile; il nome del provider resta server-side. |
| `calculation` | `formulaVersion`, `sampleSize`, `period` quando il dato è derivato | Assente per dati puramente osservati; obbligatorio per aggregati e segnali. |

### Vocabolario di disponibilità

- `available`: contratto completo e dato presente;
- `partial`: contratto valido con campi mancanti dichiarati;
- `unavailable`: copertura assente o dominio non supportato;
- `stale`: dato valido ma oltre la politica di freschezza del dominio;
- `error`: acquisizione o validazione fallita, senza sostituzione dimostrativa.

Motivi normalizzati iniziali: `not_mapped`, `not_supported`, `not_captured`,
`provider_unavailable`, `validation_failed`, `insufficient_coverage`,
`outside_point_in_time_window`, `stale_snapshot`, `not_exposed_by_source`,
`not_applicable`.

## Matrice MVP

| Domanda utente / sezione | Read model IQstatS e route proposta | Evidenza locale | Freschezza richiesta | Missingness e stato UI | Stato / prossimo passo |
| --- | --- | --- | --- | --- | --- |
| Quali competizioni posso filtrare? | `CompetitionSummary[]` — `GET /api/iqstats/v1/competitions` | `discovery/leagues.json`: 72 record, paginazione osservata | `capturedAt`; politica cache da decidere in APP-3 | Catalogo assente: filtro lega disabilitato con motivo; mai elenco inventato | route APP-2 implementata e testata |
| Quali gare sono disponibili per data, paese e lega? | `MatchList` — `GET /api/iqstats/v1/matches?date&leagueId&status&limit&offset` | Fixture APP-0D: lista conclusa e futura; filtri `league_id`, data, stato e limite verificati | `capturedAt` obbligatorio; `sourceUpdatedAt` se disponibile; TTL distinto per live/programmate da decidere | Lista vuota, errore e copertura parziale sono stati differenti; nessun fallback demo | route APP-2 per data/lega e stati non-live; paese/disponibilità ancora non mappati |
| Che gara ho aperto? | `MatchDetail` — `GET /api/iqstats/v1/matches/{matchId}` | Due fixture dettaglio APP-0D con squadre, kickoff, stato, punteggio, metadati e H2H | Timestamp fonte e cattura; stato normalizzato | Senza ID, squadre o kickoff validi il dossier non è disponibile; venue/season possono essere `null` con motivo | route APP-2 implementata, fixture e live `7198` verificati |
| Quali quote e movimenti sono confrontabili? | `OddsSnapshot[]` — `GET /api/iqstats/v1/matches/{matchId}/odds` | APP-0D: 448 record riconciliati, 11 mercati e 16 bookmaker nella gara conclusa; gara futura senza quote | `updated_at` dell'ultima variazione più `capturedAt` IQstatS; bookmaker, mercato, esito e linea obbligatori | Corrente disponibile; precedente/movimento per record; apertura e chiusura sempre `unavailable` perché non esplicite; nessun prezzo demo | route APP-2 implementata; massimo cinque pagine, cap esplicitamente `partial` |
| Cosa è successo statisticamente nella gara? | `ObservedMatchStats` — `GET /api/iqstats/v1/matches/{matchId}/statistics` | Tre fixture sanificate `sample-match-*.json`; fonte canonica `events/{id}/stats/` | `capturedAt`; eventuale timestamp fonte; correzioni post-gara ammesse dalla futura policy cache | Ogni metrica è `number|null`; `offsides` assente resta `null` e compare in `missingFields` | route APP-2 implementata e testata per sette metriche |
| Come confrontare casa/trasferta e forma recente? | `TeamStatSample` / `FormSnapshot` — route statistiche con `side`, `period`, `limit` validati server-side | `standings.form` espone 20/20 sequenze W/D/L; nessun endpoint calcio verificato per date, avversari o split casa/trasferta | `capturedAt`, intervallo campione e `sampleSize` obbligatori quando disponibili | La sequenza compatta è distinta dalla forma dettagliata; quest'ultima resta `unavailable` | `parziale` per W/D/L, `non-mappato` per il read model dettagliato |
| Qual è la classifica e lo storico H2H? | `StandingSnapshot` e `HeadToHeadSample` — route dedicate | Fixture APP-0D: 20 righe classifica; H2H dedicato con aggregati e partite recenti, identico al blocco dettaglio | Timestamp, stagione, periodo e campione obbligatori | Assenza H2H o classifica dichiarata; nessuna posizione o storico sintetico | route APP-2 separate implementate e testate |
| Il contesto rosa/allenatore è affidabile? | `TeamContextSnapshot` — `GET /api/iqstats/v1/matches/{matchId}/context` | Snapshot CAL-4B e `CONTEXT_REPORT` CAL-4C verificati | `asOf=2026-07-23`, `capturedAt`, finestra point-in-time e copertura | 231 stabilità e 8 baseline restano `null` con motivo; snapshot correnti mai retrodatati | contratto APP-1; futuro consumo soltanto server-side e senza expected adjustment |
| Quale segnale o probabilità posso mostrare? | `DerivedInsight[]` — route futura `/signals` | CAL-4 valida la distribuzione, non un backtest economico e non il calcolo completo degli expected | Versione modello, input `asOf`, campione e timestamp obbligatori | Senza expected verificati il segnale è `unavailable`; vietate probabilità demo o correzioni “a sentimento” | `vietato-mvp` con l'evidenza attuale; CAL-4 può solo fornire caveat/confidence policy |
| Da dove viene ogni valore? | `MethodMetadata`, incorporato in ogni risposta e aggregato in `/metodo` | Regole canoniche in workflow, report e manifest | Segue il dato a cui si riferisce | Metodo sempre raggiungibile per ogni dato mostrato | envelope e metadati APP-1; endpoint `/metodo` ancora assente |
| Chi può accedere e a quali funzioni? | `SessionSummary`, `SubscriptionSummary`, `EntitlementSet` — Supabase Auth/dati + Stripe server-side | MIG-1 applicata il 2 agosto 2026; matrice 5/7 feature, RLS, entitlement, auth boundary e rate limit verificati; E2E Auth/entitlement passato; catalogo Stripe test riconciliato; webhook verificato con firma, replay e consegna reale dal CLI test | Scadenza sessione, periodo subscription e validità entitlement obbligatori | Accesso anonimo o funzione non inclusa: negazione esplicita lato server; nessun unlock basato sulla UI | AUTH-1, ENT-1, BILL-1 e BILL-2 completati; UI stateless e percorso APP-4/APP-5 verificati; nessun dato provider persistito |

Il filtro dashboard `market` rimane disabilitato finché `OddsSnapshot` non è
verificato. La disponibilità dati può invece essere filtrata usando i metadati IQstatS,
senza esporre dettagli del provider.

## Campi minimi dei read model

### `CompetitionSummary`

- `id`, `name`, `country`, `active`, `currentSeason`;
- `availability` e `provenance` dall'envelope comune;
- nessuna assunzione che un record del catalogo sia un campionato ammesso: la policy di
  selezione resta server-side.

### `MatchSummary` e `MatchDetail`

- `id`, `kickoffAt`, `status` normalizzato;
- `competition: { id, name, country }`;
- `homeTeam` e `awayTeam`: ID e nome entrambi obbligatori per rendere la riga;
- `score: { home, away } | null`, senza trattare `null` come `0-0`;
- `sectionAvailability` per `odds`, `statistics`, `form`, `standings`, `headToHead`,
  `context`, `signals`;
- `venue`, `season` e altri dettagli possono essere `null` con motivo;
- envelope comune completo.

### `ObservedMatchStats`

- `matchId`, `teamId`, `side` (`home` o `away`);
- `shots`, `shotsOnTarget`, `fouls`, `corners`, `yellowCards`, `goalkeeperSaves`,
  `offsides`, ciascuno `number|null`;
- `missingFields` conserva l'assenza reale per lato e metrica;
- un aggregato aggiunge `sampleSize`, `period`, `formulaVersion`, media e dispersione
  solo se il relativo contratto è disponibile.

### `OddsSnapshot`

- `matchId`, mercato e selezione normalizzati, linea se pertinente;
- prezzo decimale corrente, bookmaker normalizzato, `capturedAt` e `updatedAt` fonte;
- `previousDecimalOdds` è soltanto l'osservazione precedente all'ultima variazione,
  non il prezzo di apertura;
- `movement` conserva `SHORTENING`, `DRIFTING` o stato invariato esplicito;
- `openingDecimalOdds` e `closingDecimalOdds` restano `null` con motivo
  `not_exposed_by_source`: nessun campo opening/closing è presente;
- l'ID restituito dalla lista quote non coincide con il match ID delle route evento:
  APP-1 conserva il match ID richiesto come contesto server-side e non espone la chiave
  esterna della lista.

### `TeamContextSnapshot`

- chiavi `leagueId`, `teamId`, `asOf` e versione formula;
- `squadStability`, `coachChanged`, `tacticalShift`, `regimeUncertain` con disponibilità
  e motivo individuali;
- copertura rosa/valore/trasferimenti e limite point-in-time;
- eventuale baseline `promoted` solo nella stessa lega e solo quando disponibile;
- `expectedAdjustmentAllowed` deve essere sempre `false` nel contratto client e server.

## Evidenze riutilizzabili e gap

| Dominio | Evidenza sanificata/canonica | Utilizzo consentito |
| --- | --- | --- |
| Catalogo leghe | `scripts/calibration/discovery/leagues.json` | Fixture iniziale del normalizzatore competizioni. |
| Eventi/coorti | `scripts/calibration/context/data/2026-07-23/events/` | Evidenza di schema normalizzato storico; non feed live dell'app. |
| Statistiche gara | `scripts/calibration/discovery/sample-match-*.json` | Fixture del normalizzatore delle sette metriche osservate. |
| Validazione distribuzione | `scripts/calibration/output/MODEL_VALIDATION.json` | Metadati e caveat server-side; non prova economica. |
| Contesto squadre | `scripts/calibration/output/CONTEXT_REPORT.json` | Snapshot analitico con `null`, coperture e motivi preservati. |
| Lista/dettaglio, quote, forma, classifica, H2H | `scripts/app-discovery/output/2026-08-01/` e relativo `REPORT.md` | Contratti APP-1 entro i limiti documentati; opening/closing e forma dettagliata restano indisponibili. |

Le grandi costanti generate sotto `scripts/calibration/output/` non devono essere
importate nel browser. APP-1 ha definito tipi piccoli; APP-2 dovrà usare un adapter
server-side che espone soltanto i record richiesti.

## Debito residuo del prototipo storico

Questi punti restano in file legacy non consumati dalla slice UI attuale:

1. `DashboardMatch` vive in `apps/web/src/lib/dashboard.ts`, non in
   `packages/shared` e non usa l'envelope comune.
2. La sorgente è esposta come nome provider o `demo`, mentre il contratto client deve
   usare categorie IQstatS generiche.
3. Quote mancanti e orari invalidi usano stringhe `"--"`; devono diventare `null` con
   `availability.reason`.
4. L'endpoint storico `/api/matches` conserva un fallback dimostrativo e non viene usato
   da `/partite` né da `/match/[matchId]`.
5. La slice attuale usa `/api/iqstats/v1/matches` con data, lega e stato; paese e
   disponibilità restano non mappati.

## Criteri di accettazione APP-0

- [x] Dashboard, dettaglio, quote, statistiche, contesto e metodo sono associati a un
  read model IQstatS e a uno stato di evidenza.
- [x] Fonte, timestamp, freschezza, campione/formula e comportamento di assenza sono
  definiti quando pertinenti.
- [x] I vincoli CAL-4 e la separazione server/browser sono espliciti.
- [x] Il prototipo è confrontato con il contratto senza modificarlo.
- [x] Quote, forma, classifica e H2H dispongono di fixture sanificate; apertura,
  chiusura e forma dettagliata sono esplicitamente escluse finché non esposte dalla
  fonte.
- [x] La matrice ha ricevuto conferma umana prima di implementare APP-1.

## Verifica eseguita e checkpoint

Verifica documentale read-only:

- fonti canoniche di prodotto e architettura rilette;
- route e tipi esistenti inventariati;
- fixture CAL-0, output CAL-4 e discovery APP-0D confrontati senza harvesting massivo
  o rigenerazione della calibrazione;
- nessun valore mancante convertito in zero e nessuna frequenza di refresh inventata.

**Decisione applicata il 1 agosto 2026:** questa matrice è stata la base di APP-1.
`openingDecimalOdds`, `closingDecimalOdds` e forma dettagliata restano indisponibili;
APP-1 ha definito lista/dettaglio gara, classifica, H2H e quote corrente/precedente/
movimento con disponibilità per singolo record. Type-check strict e sette test su
fixture sanificate sono passati; il prossimo gate è APP-2.
