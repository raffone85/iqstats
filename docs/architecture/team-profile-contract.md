# TEAM-1 — contratto dati della scheda squadra `/squadre/[teamId]`

Data: 13 agosto 2026, 23:48 Europe/Rome. Stato: **proposta in attesa di conferma umana**.
Fonte delle evidenze: `scripts/app-discovery/output/2026-08-13-team-profile/`
(18 GET in sola lettura su un cap autorizzato di 30, ≤2 richieste/secondo, campione
AC Milan `team_id=63`, Serie A `league_id=4`, stagioni 1375 corrente e 358 precedente).

## 1. Decisione di fonte

L'utente ha chiesto **tutto dagli endpoint del provider**. Il contratto rispetta la
richiesta: nessun valore della scheda squadra viene letto dal dataset di calibrazione.
Gli artefatti CAL-* e ENG-1 restano confinati al dossier gara.

## 2. Evidenze verificate

| Endpoint | Esito verificato | Conseguenza |
| --- | --- | --- |
| `GET /teams/{id}/` | Restituisce **solo** `id`, `name`, `short_name`, `country`, `venue_id`. Nessun allenatore, nessun colore sociale | L'identità squadra si compone con `/venues/{id}/` e con l'allenatore derivato dalle gare |
| `GET /teams/{id}/squad/` | `{team_id, count, players[]}`; 42 giocatori con `id`, `name`, `short_name`, `position` (G/D/M/F), `jersey_number`, `nationality`, `date_of_birth` | Rosa disponibile. **Nessun dato di minuti, gol o valore**: quelli richiedono `/players/{id}/stats/`, un GET per giocatore |
| `GET /teams/{id}/fixtures/?status=finished` | **0 risultati** per il Milan al 13 agosto 2026 | L'endpoint copre una finestra ristretta attorno a oggi: **non è utilizzabile** per lo storico stagionale |
| `GET /teams/{id}/fixtures/?status=notstarted` | 1 gara con `home_coach_id`/`away_coach_id`, `venue_id`, `weather`, `head_to_head` | Fonte delle **prossime gare** e dell'**allenatore corrente** |
| `GET /events/?team_id=&season_id=&status=finished&limit=50` | **38 gare in una sola pagina**: 19 in casa, 19 in trasferta, filtro `team_id` rispettato, `next=null` | **Un solo GET** copre l'intera stagione di una squadra |
| `GET /leagues/{id}/standings/?season_id=` | `standings[]` con `position`, `played`, `won/drawn/lost`, `gf/ga/gd`, `pts`, **`xgf/xga/xgd/xg_games`**, **`form`** (stringa tipo `DDWWD`), `live`; header `grouped` per i formati a gironi | **Un solo GET** dà classifica, forma e xG stagionale |
| `GET /leagues/{id}/seasons/` | `{league_id, count, seasons[]}` — **non** `results`; Serie A: 62 stagioni, corrente 1375, precedente 358 | Le stagioni si risolvono qui, mai hardcodate |
| `GET /events/{id}/stats/` | `stats.home` e `stats.away` con **52 metriche** per squadra, non 7 | Vedi §3. Payload ~38 KB per gara |
| `GET /managers/{id}/` | Profilo con `tactical_profile`, `preferred_formation`, `matches_total`, `win_pct`, `avg_goals_scored/conceded`, `avg_possession`, `clean_sheet_pct`, `btts_pct`, `over_25_pct`, `stats_updated_at` | Blocco allenatore pronto, con freschezza dichiarata dalla fonte |
| `GET /venues/{id}/` | `name`, `city`, `capacity`, coordinate, dimensioni campo, `built_year` | Blocco stadio |
| `GET /leagues/{id}/top/{stat}/` | `leaders[]` con `rank`, `player_id`, `value`, `matches` | Marcatori/ammoniti della squadra si filtrano da qui, senza un GET per giocatore |
| `GET /events/{id}/player-stats/` | `{event_id, count, player_stats[]}`: **52 giocatori di entrambe le squadre in un solo GET**, 75 metriche each (`rating`, `minutes_played`, `expected_goals`, `expected_assists`, duelli, progressioni, valori normalizzati), con `team_id` per riga | **Fonte scelta per la rosa statistica.** Si filtra per `team_id` e si aggrega sulle stesse gare delle medie squadra |
| `GET /players/{id}/stats/` | Log **per-match paginato** (`count/next/previous/results`, 50 righe/pagina), non aggregato per stagione | **Scartato**: 42 giocatori = 42+ GET con paginazione, per gli stessi dati che `events/{id}/player-stats/` fornisce per gara |
| `GET /img/{kind}/{id}/` | Nessuna autenticazione, cache **365 giorni** (docs `static-data`), `204` se l'id è valido ma la foto manca | Foto rosa e stemmi via media proxy interno, kind `player` già supportato |

**Nessun endpoint restituisce statistiche di squadra già aggregate per stagione.** Non
esistono `/teams/{id}/stats/` né equivalenti: verificato sui docs e sull'`openapi.json`.
Le medie casa/trasferta vanno **calcolate da noi** aggregando le gare.

## 3. Metriche disponibili per gara e per squadra

`stats.home` / `stats.away` espongono 52 campi, fra cui:

- **Tiro:** `total_shots`, `shots_on_target`, `shots_off_target`, `blocked_shots`,
  `shots_inside_box`, `shots_outside_box`, `hit_woodwork`, `big_chances`,
  `big_chances_scored`, `big_chances_missed`, `expected_goals`, `xg`, `goals_prevented`.
- **Possesso e costruzione:** `ball_possession`, `passes`, `accurate_passes`,
  `pass_accuracy_pct`, `long_balls`, `crosses`, `dribbles`, `final_third_entries`,
  `touches_in_penalty_area`, `attack`, `dangerous_attack`.
- **Difesa:** `tackles`, `tackles_won`, `interceptions`, `clearances`, `recoveries`,
  `duels`, `ground_duels`, `aerial_duels`, `errors_lead_to_a_shot`, `dispossessed`.
- **Portiere:** `goalkeeper_saves`, `total_saves`, `big_saves`, `punches`, `high_claims`.
- **Disciplina e palle inattive:** `fouls`, `yellow_cards`, `offsides`, `corner_kicks`,
  `free_kicks`, `throw_ins`, `goal_kicks`.

Regola ereditata da ENG-1 e non negoziabile: **un campo assente resta `null`**, mai `0`.
`offsides` è già noto come opzionale.

## 4. Costo reale e strategia di sostenibilità

Il provider non impone quote per account: solo **10 richieste/secondo per IP, burst 110**
(`statsiq-football-endpoint-catalog.md` §0). Il vincolo non è la quota, è la **latenza**.

Costo di una scheda squadra completa, senza cache, a stagione piena:

| Blocco | GET | Note |
| --- | --- | --- |
| Identità + stadio | 2 | `teams/{id}/`, `venues/{id}/` |
| Classifica, forma, xG | 1 | `standings` |
| Prossime gare + allenatore | 1 | `fixtures?notstarted` |
| Elenco gare concluse | 1 | `events?team_id&season_id` |
| Rosa | 1 | `squad` |
| Allenatore | 1 | `managers/{id}` |
| **Medie casa/trasferta** | **1 per gara conclusa** | fino a ~38–50, ~38 KB ciascuna |
| **Rosa con statistiche** | **1 per gara conclusa** | `events/{id}/player-stats/`; stesso ciclo di gare, nessun GET per giocatore |

Totale a stagione piena: **~83 GET per ogni apertura di pagina** (due chiamate per gara
più i sette blocchi fissi). Insostenibile ripetuto a ogni visita.

**Strategia confermata dall'utente il 13 agosto 2026 — API come unica fonte, cache Next,
costo pagato una volta sola:**

1. **Cache per gara conclusa.** Le statistiche di una gara finita sono immutabili: si
   leggono dal provider una volta e restano valide. È qui che sta il 95% del costo.
2. **Cache dell'aggregato di squadra**, invalidata quando compare una nuova gara conclusa
   nell'elenco eventi (1 GET leggero per verificarlo).
3. **Caricamento progressivo.** La pagina risponde subito con i blocchi da 1 GET
   (identità, classifica, forma, prossime gare); il blocco medie casa/trasferta arriva
   dopo, con skeleton e stato esplicito, senza bloccare il resto.
4. **Campione dichiarato.** Se il numero di gare aggregate viene limitato, la UI dichiara
   sempre quante gare compongono la media e quali competizioni include.

Livello di cache **deciso: cache server-side di Next**, nessuna nuova infrastruttura. La
persistenza su Supabase — lo schema DATA-1 esiste già ed è pensato per questo — resta un
incremento successivo, non un prerequisito.

Chiavi di cache previste: `event-stats:{eventId}` e `event-player-stats:{eventId}`
(immutabili, gara conclusa), `team-season:{teamId}:{seasonId}` (invalidata quando cambia
il numero di gare concluse), `standings:{leagueId}:{seasonId}` (freschezza breve).

## 5. Gerarchia della pagina

Ordine mobile-first, dal "chi è" al "come gioca" al "chi la compone":

```text
/squadre/[teamId]
├── Testata            identità, stadio, competizione, posizione e forma recente
├── Rendimento         classifica, punti, gol fatti/subiti, xG stagionale
├── Casa vs trasferta  IL BLOCCO CENTRALE: medie a confronto, con campione
├── Prossime gare      calendario, avversario, luogo → link al dossier gara
├── Rosa               giocatori per ruolo, con foto, minuti, rating e contributo
├── Allenatore         profilo, modulo preferito, aggregati con freschezza
└── Metodo e fonti     endpoint, capturedAt, copertura, campi mancanti
```

**Filtri previsti** (nessuno obbligatorio, tutti con default sensato):

- **Stagione** — default: corrente se ha almeno una gara conclusa, altrimenti la
  precedente completa, dichiarando il ripiego.
- **Competizione** — default: tutte; il filtro isola il campionato dalle coppe, perché
  mescolarle distorce le medie.
- **Luogo** — casa / trasferta / entrambe: è il taglio principale del blocco centrale.
- **Metrica** — le 52 metriche non si mostrano tutte insieme: gruppi (Tiro, Possesso,
  Difesa, Disciplina, Portiere) con il gruppo Tiro aperto per primo.

## 6. Stati e onestà del dato

| Situazione | Comportamento |
| --- | --- |
| Stagione corrente senza gare concluse (caso reale del Milan oggi) | Il blocco medie dichiara "nessuna gara conclusa in questa stagione" e propone la stagione precedente, senza mescolarle |
| Metrica assente in una gara | Esclusa dalla media, con campione ridotto dichiarato; mai `0` |
| Campione sotto la soglia minima | La media si mostra con avviso di campione insufficiente, oppure non si mostra: soglia da fissare in implementazione |
| Allenatore | Derivato dalla prossima o ultima gara, con etichetta esplicita. **Verificato che `/managers/{id}/` può riportare un `current_team_id` diverso**: non presentarlo come "allenatore attuale" senza questa derivazione |
| Classifica assente (coppe, gironi) | Blocco Rendimento nascosto, non vuoto |

## 7. Criteri di verifica

1. `typecheck` e `lint` verdi.
2. Test dell'aggregatore con fixture reali della discovery: media casa/trasferta,
   esclusione dei `null`, campione dichiarato, nessuna somma fra competizioni filtrate.
3. Smoke HTTP su almeno due squadre: una con stagione corrente vuota (Milan) e una con
   gare concluse nella corrente.
4. Controllo responsive a 375, 768, 1024 e 1440 px, tastiera, contrasto,
   `prefers-reduced-motion`.
5. Conteggio dei GET realmente effettuati alla prima apertura e alla seconda (deve
   crollare grazie alla cache).

## 8. Decisioni chiuse e ancora aperte

**Chiuse dall'utente il 13 agosto 2026:**

1. Superficie: pagina dedicata `/squadre/[teamId]`, nomi squadra del dossier come link.
2. Fonte: esclusivamente endpoint del provider.
3. Blocchi: tutti e quattro, con gerarchia, filtri e priorità.
4. Rosa: **completa con statistiche per giocatore e foto**.
5. Cache: **cache server-side di Next**.

**Ancora aperte, da fissare in implementazione:**

1. Numero massimo di gare aggregate alla prima apertura, prima che la cache si scaldi.
2. Soglia minima di campione sotto la quale una media non si mostra.
3. Quali metriche della rosa mostrare in prima battuta: le 75 non stanno in una tabella
   mobile, serve una selezione per ruolo (portiere, difensore, centrocampista, attaccante).

## 9. Decisioni chiuse in implementazione — 14 agosto 2026

Le tre decisioni lasciate aperte al §8 sono state chiuse dall'utente prima di scrivere
codice. Il contratto eseguibile vive in `packages/shared/src/contracts/team.ts` e
`packages/shared/src/normalizers/team.ts`, coperto da `packages/shared/test/team.test.ts`.

### 9.1 Strategia delle metriche a due livelli

- **Nucleo:** le sette metriche ENG-1 (`ObservedMetric`), riusate senza modifiche. Sono
  il confronto principale casa/trasferta.
- **Corredo:** tutte le altre metriche osservate. Ognuna dichiara il proprio
  `group` (`shooting`, `possession`, `defence`, `goalkeeping`, `discipline`) e, con
  `supports`, **quale metrica del nucleo valida**. Il corredo non sostituisce il nucleo:
  lo spiega. Esempio: `shotsInsideBox`, `blockedShots`, `bigChances`, `expectedGoals`
  validano `shots`; `totalSaves`, `bigSaves`, `goalsPrevented` validano `goalkeeperSaves`.
- **Giocatori:** le 69 metriche di `events/{id}/player-stats/` sono aggregate
  individualmente per ogni tesserato (`PLAYER_METRIC_KEYS`), pronte per la futura pagina
  del calciatore. `SQUAD_ROLE_METRICS` fissa la selezione per ruolo mostrata nella rosa
  (portiere, difensore, centrocampista, attaccante), chiudendo il punto 3 del §8.

Catalogo risultante: 7 metriche di nucleo + 53 di corredo.

### 9.2 Soglia minima di campione

`TEAM_MINIMUM_SAMPLE = 3`. Sotto tre gare una media non si mostra: il valore resta
`unavailable` con reason `insufficient_coverage` e il campione effettivo resta dichiarato.
La stessa soglia si applica alla media dei rating per giocatore.

### 9.3 Evidenze nuove sui payload, non presenti al §3

Verificate sui 12 lati squadra dei sei file `event-stats-*`:

1. **Sei metriche sono oggetti `{value, total, pct}`**, non numeri: `crosses`, `dribbles`,
   `long_balls`, `aerial_duels`, `ground_duels`, `final_third_phase`. Sono esposte come
   coppia `<x>Attempted` (totale tentato) e `<x>Accuracy`/`Success`/`Won` (rapporto).
2. **L'aggregazione dei rapporti somma numeratori e denominatori**, non media le
   percentuali per gara. Prova reale: i cross in casa valgono 18/40 = **45%**, mentre la
   media dei tre `pct` per gara darebbe 50%.
3. **`tackles_won` non è un conteggio:** vale 33–94 dove `tackles` vale 12–17, in tutti e
   dodici i campioni. È esposto come `tacklesWonShare`, una quota.
4. **`total_tackles` è un duplicato esatto di `tackles`:** escluso dal catalogo.
5. **`pass_accuracy_pct` è ricalcolata** da `accurate_passes`/`passes`, che è il rapporto
   corretto sull'intero campione.
6. **`expected_goals` e `xg.actual` sono campi distinti e divergenti** in 3 lati su 12
   (es. 2,70 contro 2,91). Entrambi esposti, nessuno dei due presentato come alias
   dell'altro.
7. Metriche sparse verificate: `punches` 6/12, `through_balls` 6/12, `red_cards` 2/12,
   `high_claims` 8/12, `big_chances_scored` 8/12. Restano `null` e riducono il campione.

### 9.4 Discovery integrativa

`events/{id}/player-stats/` non aveva una fixture salvata. Autorizzata dall'utente e
spesa **1 GET** in sola lettura sull'evento 1453: 52 righe, 26 per squadra, 75 campi,
`rating` valorizzato su 31 righe su 52 (i non entrati restano `null`). Totale della
ricognizione TEAM-1: **13 GET su un cap di 30**. Output in
`scripts/app-discovery/output/2026-08-13-team-profile/event-player-stats-1.json`.

### 9.5 Stato del punto 1 del piano

Contratti e normalizzatori sono implementati e verificati: `typecheck` verde e 17 test
verdi su fixture reali della discovery, fra cui esclusione dei `null`, campione
dichiarato, soglia a tre gare e filtro per `team_id` sulle statistiche giocatore.
Riuso confermato: la lista gare di stagione passa da `normalizeMatchList` esistente; le
stagioni da `normalizeSeasonCatalog`, aggiunto in `normalizers/matches.ts`.
Il punto 2 del piano — gateway e cache Next — non è stato avviato.

## 10. Punto 2 del piano — gateway e cache, 14 agosto 2026

### 10.1 Metodi del gateway

Aggiunti a `apps/web/src/server/iqstats/gateway-core.ts`, che resta puro e testabile
con fixture (nessuna dipendenza da Next):

| Metodo | Costo a freddo | Note |
| --- | --- | --- |
| `getTeamProfile(teamId)` | 2 GET | `teams/{id}/` + `venues/{venueId}/`. Se lo stadio non risponde la testata resta disponibile e dichiara `venue` mancante |
| `getTeamFinishedMatches(teamId, seasonId)` | 1 GET (+catalogo) | `events/?team_id=&season_id=&status=finished&limit=50`; il rispetto del filtro `team_id` è verificato a runtime |
| `getTeamUpcomingMatches(teamId)` | 1 GET (+catalogo) | `teams/{id}/fixtures/?status=notstarted` |
| `getTeamSeasonSplits(teamId, query)` | 1 + N GET | una `events/{id}/stats/` per gara, concorrenza 4 |
| `getTeamSquadStats(teamId, query)` | 2 + N GET | rosa + una `events/{id}/player-stats/` per gara, **mai un GET per giocatore** |
| `getTeamManager(managerId)` | 1 GET | |
| `getSeasons(leagueId)` | 1 GET | risolve il filtro stagione |

**Cap deciso:** `TEAM_SEASON_MATCH_LIMIT = 20` gare aggregate alla prima apertura, le più
recenti, con il filtro competizione applicato **prima** del taglio. Chiude il punto 1 del
§8. Il limite è sovrascrivibile per richiesta e il campione resta sempre dichiarato.

Una statistica gara non disponibile non fa cadere il blocco: la gara esce dal campione e
l'envelope diventa `partial` con la copertura reale.

### 10.2 Cache

`apps/web/src/server/iqstats/cached-source.ts` decora `JsonSource` con `unstable_cache`.
`cacheComponents` non è attivo in `next.config.ts`, quindi il modello corretto per
Next 16.3 è `unstable_cache` + `revalidateTag`, non la direttiva `use cache`.

| Chiave | Freschezza | Motivo |
| --- | --- | --- |
| `event-stats:{id}`, `event-player-stats:{id}` | 30 giorni | gara conclusa, dati immutabili: qui sta il 95% del costo |
| `venue:{id}` | 30 giorni | |
| `team:{id}`, `team-squad:{id}`, `manager:{id}`, `seasons:{id}`, `competitions` | 1 giorno | |
| `standings:{leagueId}:{seasonId}` | 10 minuti | |
| `team-events:{teamId}`, `team-fixtures:{id}` | 5 minuti | è l'unica chiamata che deve accorgersi di una nuova gara conclusa |

L'aggregato `team-season:{teamId}:{seasonId}` **non ha una cache propria**: l'elenco gare
ha freschezza breve e le statistiche per gara sono cacheate singolarmente, quindi
l'aggregato si ricompone da solo quando compare una gara nuova, senza invalidazione
esplicita. Meno pezzi mobili, stesso effetto sui GET.

`getTeamGateway()` in `runtime.ts` è l'unico consumatore della sorgente cacheata e legge
**solo dal provider**, mai dal database DATA-1. Le rotte gara esistenti restano invariate,
non cacheate e `no-store`.

### 10.3 Verifiche eseguite

- `typecheck`, `typecheck:gateway`, `lint` e `build` di produzione verdi.
- `test:gateway`: **18 test verdi**, di cui 6 nuovi su fixture reali — composizione
  identità/stadio, degrado dello stadio assente, aggregazione con campione dichiarato,
  statistica gara mancante, filtro competizione applicato prima del taglio, e conteggio
  esatto delle richieste (8 per le medie su 6 gare, 4 per la rosa su 1 gara, zero
  chiamate a `/players/`).
- **Smoke contro il provider reale** (`npm run verify:team-gateway`, 16 GET in sola
  lettura, nessuna scrittura): il Milan conferma **0 gare concluse nella stagione
  corrente 1375** e 38 nella 358 con filtro `team_id` rispettato; con un limite di 4 gare
  i campioni sono 2 per lato e le medie restano `null` per soglia insufficiente, come
  progettato; la rosa risponde con 42 tesserati e 24 con statistiche su una gara.

La verifica del crollo dei GET alla seconda apertura (§7, criterio 5) richiede le rotte e
il dev server: appartiene al punto 3 del piano.

## 11. Punto 3 del piano — rotte API, 14 agosto 2026

Sei Route Handler, sullo stampo esatto delle rotte gara esistenti: `dynamic = "force-dynamic"`,
`requireFeature` prima di ogni lavoro, query validata senza scope impliciti, envelope
IQstatS e `Cache-Control: no-store` sulla risposta pubblica.

| Rotta | Feature | Query |
| --- | --- | --- |
| `GET /api/iqstats/v1/teams/{teamId}` | `matches.list.read` | nessuna |
| `GET /api/iqstats/v1/teams/{teamId}/splits` | `match.statistics.read` | `seasonId` obbligatorio, `leagueId` e `limit` facoltativi |
| `GET /api/iqstats/v1/teams/{teamId}/squad` | `match.statistics.read` | come sopra |
| `GET /api/iqstats/v1/teams/{teamId}/fixtures` | `matches.list.read` | nessuna |
| `GET /api/iqstats/v1/teams/{teamId}/manager` | `match.context.read` | nessuna |
| `GET /api/iqstats/v1/competitions/{leagueId}/seasons` | `matches.list.read` | nessuna |

**Nessuna feature nuova.** Introdurre chiavi `team.*` richiederebbe scritture di
entitlement sul database remoto, fuori dall'autorizzazione corrente: le rotte riusano le
feature esistenti più vicine per natura del dato.

`seasonId` è obbligatorio per volontà del contratto: le medie non si mescolano fra
stagioni. `leagueId` è il filtro competizione e non ha default implicito; `limit` è
limitato a 1–50 con default 20.

### 11.1 Allenatore derivato, con provenienza nel dato

`TeamManagerProfile` guadagna `derivedFromMatchId`. Il gateway non accetta più un
`managerId`: lo deriva dai `*_coach_id` della prossima gara della squadra e rifiuta con
`source_invalid_response` un profilo che non corrisponde. Senza gare in programma il
blocco è `unavailable` con `missingFields: ["manager"]`, non un allenatore inventato.

### 11.2 Verifiche

- `typecheck`, `typecheck:gateway`, `lint` verdi; `test:gateway` **22 test verdi**
  (4 nuovi: query stagionale, allenatore derivato con `derivedFromMatchId`, profilo
  allenatore non corrispondente rifiutato, assenza dichiarata); `packages/shared`
  17 test verdi.
- **Incidente e rimedio:** la `npm run build` del punto 2 è stata eseguita con il dev
  server vivo sulla stessa cartella `.next`, e in Next 16 build e dev la condividono: il
  compilatore del dev server ha iniziato a fallire su ogni file nuovo con
  `Jest worker encountered N child process exceptions`. Rimedio applicato, con assenso
  dell'utente: stop del processo sulla 3200, `Remove-Item -Recurse -Force apps/web/.next`,
  riavvio. **Regola operativa: non eseguire `next build` mentre il dev server è attivo.**
- **Smoke HTTP dopo il riavvio:** le sei rotte rispondono `401 {"code":"unauthenticated"}`,
  come le rotte gara esistenti, con zero errori nel log del dev server. La guardia
  precede la validazione della query: `teams/0` e `splits` senza `seasonId` restituiscono
  401 e non rivelano nulla sulla richiesta.
- **Resta scoperto:** il percorso dati end-to-end via HTTP e il conteggio dei GET alla
  seconda apertura (§7, criterio 5) richiedono una sessione autenticata. Verranno
  verificati con la pagina del punto 4, aperta dall'utente già autenticato.

## 12. Punto 4 del piano — pagina /squadre/[teamId], 14 agosto 2026

Pagina pubblica come il dossier gara, Server Component, dati letti dal gateway cacheato
lato server: nessun giro HTTP interno, nessun token nel client. Identità Cardinale,
mobile-first, gerarchia del §5 rispettata.

### 12.1 Risoluzione di competizione e stagione

Il contratto non diceva come ricavare lega e stagione dal solo `teamId`. Verificato sul
provider: **`/events/?team_id=&status=finished` è onorato anche senza `season_id`** e
restituisce lo storico completo, il più recente prima (Milan: 2298 gare dichiarate).

Regola adottata e dichiarata in pagina: **la competizione con più gare concluse fra le
ultime 50, a parità la più recente**. Verificata su due squadre reali: Milan → lega 4
stagione 358 con 38 gare; squadra 42 → lega 3 stagione 294 con 38 gare. Le amichevoli
precampionato, che sono le gare più recenti in assoluto, non vincono la selezione.
`MatchSummary` guadagna `seasonId` per rendere possibile il raggruppamento.

### 12.2 Caricamento progressivo

Testata, filtri, classifica, prossime gare e allenatore rispondono subito. Medie
casa/trasferta e rosa arrivano in streaming dentro `<Suspense>` con scheletro dichiarato,
come previsto dal §4.3: sono i due blocchi che costano una richiesta per gara.

### 12.3 Verifiche eseguite

- `typecheck`, `lint` verdi; `test:gateway` 22/22; `packages/shared` 17/17.
- **Smoke reale su `http://localhost:3200/squadre/63`, HTTP 200 con dati veri:**
  AC Milan, San Siro 75.817 posti; 5º posto, 70 punti, 38 giocate, xG 60,5–44,0, forma
  LWLLD; medie su **9 gare in casa e 11 in trasferta** (cap 20); rosa con 25 tesserati su
  42 nel campione, Maignan 20 presenze/1800 minuti/voto 7,33/67 parate, Leão 17 presenze,
  2 gol contro 4,53 xG; allenatore Amorim derivato dalla gara 219707.
- **Effetto cache misurato** su una squadra mai letta: prima apertura 4,67 s, successive
  2,12 s e 2,19 s. Il residuo è rendering in dev, non rete: la cache di Next ha prodotto
  **99 voci per 4,37 MB** in `.next/dev/cache/fetch-cache`, con le entry più grandi
  (~100 KB) corrispondenti ai payload `player-stats`. Criterio 5 del §7 soddisfatto.
- **Non regressione:** `/oggi`, `/partite` e `/match/1453` rispondono HTTP 200 dopo
  l'aggiunta di `seasonId` a `MatchSummary`.

### 12.4 Correzioni fatte dopo aver letto la pagina resa

1. L'etichetta ripeteva la competizione ("Serie A Serie A 25/26"): ora il nome stagione
   della fonte, che spesso contiene già la lega, non viene raddoppiato.
2. I filtri delle competizioni diverse da quella selezionata mostravano l'identificativo
   grezzo della stagione: ora le stagioni si risolvono per ogni lega presente nei filtri.
3. Un giocatore in distinta ma mai in campo mostrava una griglia di zeri veri e però
   illeggibili: ora dichiara "in distinta, mai in campo nel campione".

### 12.5 Restano aperti

- **QA visuale a 375/768/1024/1440 px, tastiera, contrasto e `prefers-reduced-motion`:**
  checkpoint umano, sul browser dell'utente.
- **Punto 5 del piano:** i nomi squadra del dossier `/match/[id]` non sono ancora link
  alla scheda.
- La `build` di produzione non è stata rieseguita: la regola del §11.2 vieta `next build`
  con il dev server attivo.

## 13. Revisione dell'utente sul punto 4 — 14 agosto 2026

Due rilievi dell'utente sulla pagina resa, entrambi accolti.

### 13.1 Campione: tutta la stagione, non venti gare

Il cap di 20 gare era una cautela sulla prima apertura. Poiché una gara conclusa è
immutabile e la cache la paga una volta sola, `TEAM_SEASON_MATCH_LIMIT` sale a 50, cioè
l'intera pagina di gare concluse che la fonte espone. Verificato: il Milan passa da
9+11 a **19 gare in casa e 19 in trasferta**, l'intera Serie A 25/26. La prima apertura
è rimasta 2,6 s perché le 20 gare già lette erano in cache: solo le 18 nuove sono state
scaricate.

### 13.2 Regola di selezione consapevole della stagione

**Difetto trovato grazie alla domanda dell'utente sulla nuova stagione.** La regola
"competizione con più gare concluse" avrebbe tenuto in vetrina la 25/26 fino a circa la
ventesima giornata della 26/27, perché la stagione vecchia resta più numerosa a lungo.

Regola nuova, in `apps/web/src/server/iqstats/team-selection.ts`, modulo puro e testato:

1. si individua il **campionato di riferimento**, quello che pesa di più nello storico
   della squadra — non quello con la gara più recente, altrimenti in estate vincerebbero
   le amichevoli;
2. dentro quel campionato vale la **stagione corrente** appena raggiunge
   `2 × TEAM_MINIMUM_SAMPLE = 6` gare concluse, così casa e trasferta arrivano entrambe
   al campione minimo; sotto soglia resta la precedente, **dichiarata in pagina** con il
   numero di gare già disputate;
3. la scelta esplicita dai filtri vince sempre sulla regola.

Il primo tentativo aveva un difetto colto dai test: la stagione corrente sotto soglia,
essendo la più recente, rientrava dal ripiego. Ora è esclusa esplicitamente.

Le statistiche della nuova stagione si popolano da sole: l'elenco gare della squadra ha
freschezza di cinque minuti, quindi una gara appena conclusa entra nel campione nel giro
di minuti, e la scheda passa alla stagione corrente alla sesta giornata.

### 13.3 Punto 5 del piano — collegamento dal dossier

I nomi delle due squadre nella testata di `/match/[id]` sono collegamenti a
`/squadre/[teamId]`, con sottolineatura dorata, focus visibile e `prefers-reduced-motion`
rispettato. Se la fonte non espone l'identificativo, il nome resta testo semplice.

### 13.4 Verifiche

`typecheck` e `lint` verdi; `test:gateway` **25 test verdi** (3 nuovi sulla regola di
selezione: amichevoli che non scavalcano il campionato, subentro della stagione corrente
solo con gare a sufficienza, filtro esplicito che vince); `packages/shared` 17 test verdi.
Smoke reale: `/match/1453` HTTP 200 espone `href="/squadre/63"` e `href="/squadre/67"`;
entrambe le schede rispondono HTTP 200.

Restano aperti la QA visuale a 375/768/1024/1440 px (checkpoint umano) e la build di
produzione, che va eseguita a dev server spento.

## 14. Lotto A — media totale, registro gare, filtri (14 agosto 2026)

Tre richieste dell'utente dopo la prima visione della scheda.

### 14.1 Media totale accanto a casa e trasferta

`TeamSeasonSplits` guadagna `overall`, aggregato su tutte le gare del campione, e
`TeamSplitScope` estende `TeamSide` con `"overall"`. Ogni metrica mostra tre valori:
casa, trasferta, totale. Il totale è la media di tutte le gare, **non la media delle due
medie**: con campioni sbilanciati le due cose differiscono, e il test lo dimostra su tre
gare in casa e due fuori (57/5 = 11,4 contro 10,58).

### 14.2 Registro gara per gara, con il valore dell'avversario

`TeamMatchMetrics` porta ora `playedAt`, `opponentName` e `opponentMetrics`: lo stesso
payload `events/{id}/stats/` contiene entrambi i lati, quindi il dato dell'avversario non
costa nulla in più. `TeamMatchLogEntry` espone i valori già risolti per la lettura — la
percentuale della singola gara per le metriche di rapporto, il conteggio per le altre.

**Il registro non si stampa in pagina.** Sessanta metriche per trentotto gare fanno 2.280
righe: la pagina pesava **2,67 MB e 22,5 s**. Ora ogni metrica apre un dettaglio che si
scarica su richiesta da `GET /api/squadre/{teamId}/registro?metric=&leagueId=&seasonId=`,
rotta pubblica come il proxy immagini, che riusa il gateway cacheato. Misurato: pagina
**393 KB**, registro **4,8 KB** per metrica, 38 gare con valori reali
(Milan–Cagliari 16 contro 25).

### 14.3 Filtri: tutto, ordinato

Nessuna competizione viene nascosta. L'ordine mette in cima le competizioni che pesano di
più nello storico e, dentro ciascuna, le stagioni più recenti: Serie A 25/26, Serie A
24/25, Coppa Italia 25/26, Coppa Italia 24/25, Club Friendlies. Ogni voce dichiara quante
gare la compongono, così una stagione parziale si riconosce a colpo d'occhio.

### 14.4 Verifiche

`typecheck` e `lint` verdi; `packages/shared` **19 test** (2 nuovi su media totale e
registro con valori avversario); `test:gateway` 25 test verdi. Smoke reale su
`/squadre/63` e sulla rotta del registro.

**Nota d'ambiente:** durante le prove il provider ha iniziato a rispondere con
`source_timeout` sulle revalidazioni in background. Il limite documentato è di 10
richieste al secondo per IP e le prove ripetute si sono sommate alle revalidazioni. Non
dipende dal codice; conviene diradare le prove sulla stessa pagina.

### 14.5 Build di produzione e misura reale

`next build` eseguita a dev server spento, come impone la regola del §11.2: **verde**, con
tutte le rotte nuove compilate — `/squadre/[teamId]`, le sei rotte `teams/*` e
`/api/squadre/[teamId]/registro`.

Misura su `next start`, che è la condizione vera:

| | prima apertura | successive | registro |
| --- | --- | --- | --- |
| tempo | 4,00 s | **0,147 s** | 1,32 s |
| peso | 340 KB | 328 KB | 4,8 KB |

Alla seconda apertura la pagina è **27 volte più veloce**: la cache regge quello che
prometteva. In dev gli stessi numeri erano 5–7 s, cioè quasi tutto costo di sviluppo, non
di prodotto. Il criterio 5 del §7 è soddisfatto con evidenza.

## 15. Lotto B — arbitri (14 agosto 2026)

### 15.1 Cosa espone davvero la fonte

- `GET /referees/{id}/` → un aggregato recente **con finestra non dichiarata** e i totali
  di carriera. Non esiste una stagione: chiamarla tale sarebbe inventare.
- `GET /referees/{id}/matches/` → `count: 0`. **Inutilizzabile.**
- `GET /referees/?league_id=&limit=100` → **42 arbitri in un solo GET** con nome e
  aggregati *della competizione*. È insieme anagrafica e metro di riferimento, e costa
  una richiesta invece di una per arbitro.

**Perimetri diversi, stesso arbitro:** Marco Guida vale 3,74 gialli su 35 gare nel
dettaglio complessivo e 4,00 su 16 gare nel catalogo di Serie A. La scheda usa il
catalogo di lega, perché è l'unico perimetro omogeneo al metro con cui viene confrontato.

### 15.2 I tre blocchi

1. **Chi è e come arbitra** — lettura a **due assi separati**, perché un arbitro può
   fischiare molto e ammonire poco: falli `lascia correre · in linea · fischia stretto`,
   cartellini `parco · in linea · facile al cartellino`. Ogni asse è ancorato alla media
   dei 42 arbitri della competizione, **dichiarata accanto al valore**. La soglia è il 5%
   di scostamento (`REFEREE_INLINE_TOLERANCE`) ed è dichiarata come scelta nostra.
2. **Con questa squadra** — calcolato da noi sulle gare già scaricate, **zero richieste in
   più**: gare arbitrate, falli e cartellini delle due squadre sotto quell'arbitro, a
   confronto con la media stagionale della squadra.
3. **Carriera** — gare, gialli e rossi di carriera, più l'aggregato recente dichiarato per
   quello che è.

### 15.3 Dove vivono

- **Scheda squadra:** blocco "Chi le ha fischiato contro", in streaming come statistiche e
  rosa, con gli arbitri ordinati per gare arbitrate.
- **Dossier gara:** il pannello arbitro esistente **perdeva credibilità** perché la sua
  "tendenza" nasceva da soglie decise a tavolino (≥5,0 "molto severo", ≥4,2 "esigente"…).
  Quella funzione è stata rimossa e sostituita dalla lettura ancorata alla lega. I numeri
  del pannello ora vengono dallo stesso perimetro del metro, con le gare dichiarate.

### 15.4 Verifiche

- `typecheck`, `typecheck:gateway`, `lint` verdi; `packages/shared` **23 test** (4 nuovi
  sugli arbitri, su fixture reali); `test:gateway` 25 test verdi; build di produzione
  verde.
- **Smoke reale.** `/squadre/63`: Marco Guida 5 gare col Milan, in linea su entrambi gli
  assi; Daniele Doveri 4 gare, "lascia correre" (23,70 contro 25,28) e "parco di
  cartellini" (3,32 contro 3,85), con il Milan a 7,3 falli contro una media di 10,1.
  `/match/1453`: pannello e lettura ora concordi su 4,00 gialli e 24,3 falli, 16 gare nel
  perimetro dichiarate.
- Discovery: 2 GET aggiuntivi, totale **15 su 30**. Fixture `referee-detail.json` e
  `referees-league.json`.

**Incidente di percorso, risolto:** lo script di discovery era stato lanciato da
`apps/web`, e usando percorsi relativi ha creato una directory duplicata riscaricando 21
payload. Directory rimossa, discovery rieseguita dalla radice corretta. **Lo script va
lanciato dalla radice del progetto.**

## 16. QA visuale e cambio di identità — 14 agosto 2026

### 16.1 Il difetto che ha aperto tutto

La QA visuale di TEAM-1, condotta con Playwright su quattro viewport, ha trovato la
pagina **pulita** su overflow (zero a 375/768/1024/1440), tastiera (ogni elemento
tabulabile con anello di focus) e `prefers-reduced-motion` (ogni durata a 0,01 ms). Ha
però scoperto un difetto che nessuno poteva vedere dal proprio browser: la pagina
rispondeva a `prefers-color-scheme` e **in modalità chiara il `body` diventava
`#F8FAFC` mentre i componenti dell'identità tenevano i loro colori fissi**. Wordmark,
`Accedi`, `← Partite` e i filtri competizione risultavano dorati su bianco, fra 1,17 e
2,07 di contrasto. Non era un difetto della scheda squadra: **30 combinazioni sotto AA
su `/squadre/63`, 17 su `/oggi`, 13 su `/partite`, 13 su `/match/1453`.**

### 16.2 Decisione dell'utente

Invece di forzare il tema scuro, l'utente ha scelto di **portare il prodotto sul chiaro**
e di rifare l'identità: nasce «carta e campo», dove il bordeaux resta la firma e il colore
smette di decorare per dichiarare il **verso** di un numero — verde sopra il riferimento,
mattone sotto. L'oro esce dal sistema. Il sistema completo è in
`design-system/iqstats-professional/MASTER.md`.

### 16.3 Cosa è stato toccato

Prima del reskin convivevano **tre sistemi di colore**: la palette blu «professional»
(`:root`), i token `--product-*` con il loro ribaltamento su `prefers-color-scheme`, e i
token Cardinale su `.product-shell`. Ora è **uno solo, chiaro**.

- I 14 token di `.product-shell` sono stati ridefiniti; `--card-gold*` è stato rinominato
  in `--card-brand*` su 66 occorrenze, perché un token che si chiama oro e vale bordeaux
  è un debito immediato.
- 61 colori cablati nelle superfici e 94 nelle pagine in vecchia veste sono stati
  tradotti sul sistema. **Zero colori fuori tabella sopravvivono nel foglio di stile.**
- Il blocco `@media (prefers-color-scheme: dark)` è stato rimosso.
- Space Grotesk → **Archivo** per i titoli. Inter e IBM Plex Mono restano.
- Ombre azzerate: la gerarchia si fa con filetti da 1 px.
- La hero è l'unico blocco ad alto contrasto: bordeaux sotto la foto, con i token del
  testo invertiti nello scope di `.oggi-hero-body`, così i figli restano invariati.
- Nuova firma visiva: **il filo del campione** (§ MASTER), 5,7 KB sulla pagina.

### 16.4 Verifiche

- `typecheck` e `lint` verdi; `test:gateway` **25 verdi**; `packages/shared` **23 verdi**;
  **build di produzione verde** a dev server spento, tutte le rotte compilate.
- **Contrasto: zero combinazioni sotto AA** su dieci pagine — `/`, `/oggi`, `/partite`,
  `/match/1453`, `/squadre/63`, `/metodo`, `/database`, `/giocate`, `/pronostici`,
  `/accedi` — e risultato **identico nei due `color-scheme`**, che è la prova che il tema
  è davvero unico.
- Zero overflow orizzontale e **zero controlli sotto 44 px** ai quattro viewport (i link
  di nav `Oggi` e `Piani`, larghi 31 px, hanno guadagnato `min-width`).
- Focus e `prefers-reduced-motion` invariati e verdi.

### 16.5 Lezione di metodo sulla misura

Il primo referto dichiarava 25 elementi senza focus e decine di testi sotto AA: **erano
artefatti della sonda, non difetti**. Tre correzioni sono state necessarie prima di poter
credere ai numeri, e vanno ricordate perché si ripresenteranno:

1. `element.focus()` **non** attiva `:focus-visible` in Chromium: il focus va guidato con
   `Tab` reale.
2. Contare la *presenza* di una transizione non dice nulla sotto `reduce`: va letta la
   **durata efficace** (qui 0,01 ms, cioè la guardia funziona).
3. Il fondo di un testo non si trova risalendo i genitori — la hero è dipinta da elementi
   **fratelli** — ma seguendo lo **stack di rendering** (`elementsFromPoint`), includendo
   l'elemento stesso. Un testo sopra una fotografia resta comunque non calcolabile e va
   verificato a vista.

**Misura di prodotto:** `/squadre/63` in `next start` pesa 396 KB e risponde in 0,54–0,83 s
a cache calda. Il confronto con i 328 KB e 0,147 s del §14.5 **non è alla pari**: la cache
`.next` è stata azzerata prima della build, e la misura precedente riguardava una risposta
in streaming. Il filo del campione spiega 5,7 KB dei 68 di differenza; **il resto non è
stato attribuito.**

### 16.6 Resta aperto

- **Il giudizio visivo dell'utente sulla nuova identità**: la QA strumentale dice che è
  leggibile ovunque, non che piace. È un checkpoint umano.
- `/account/billing` non è stato verificato dopo il cambio: richiede una sessione
  autenticata. I flussi di login e pagamento vanno riprovati.
- Gli override in `design-system/iqstats-professional/pages/` non citano colori e non
  sono stati toccati.
