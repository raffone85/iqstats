# Audit della documentazione football v2 e mappatura IQstatS

## Scopo e metodo

Audit eseguito il 9 agosto 2026 sulla documentazione ufficiale visibile nel browser:
panoramica football, autenticazione, convenzioni, eventi/live, campionati/stagioni,
squadre/giocatori/trasferimenti, manager/arbitri/impianti, quote/previsioni,
broadcast/social, guida immagini, guide applicative, riferimento WebSocket, pagina
legacy e explorer OpenAPI football.

L'audit è documentale e sanificato:

- nessun token è stato inserito nel browser o riportato in questo documento;
- nessun payload del provider è stato conservato;
- nessuna richiesta dati autenticata è stata eseguita;
- nessuna lettura o scrittura è stata effettuata sul database remoto;
- gli endpoint sono indicati soltanto come path relativi, senza indirizzi pubblici;
- DATA-2, DATA-3, DATA-4, DATA-5 e APP-6A non vengono avviati da questo audit.

## Esito sintetico

Il riferimento OpenAPI football v2 espone **64 operazioni GET** in 15 famiglie. La
superficie è sufficiente per costruire progressivamente IQstatS, ma disponibilità di
un endpoint, copertura effettiva dei dati e disponibilità di un contratto IQstatS sono
tre condizioni distinte. La UI non deve dipendere direttamente da questi payload.

DATA-1 copre localmente soltanto il nucleo competizioni, stagioni, squadre, gare e
classifiche. Le sette route IQstatS esistenti continuano invece a leggere dal gateway
live dopo il controllo di autorizzazione. Manca ancora l'adattatore che colleghi i read
model PostgreSQL locali alle route applicative.

## Divergenze accertate rispetto al workspace

### 1. L'inventario DATA-0 da 145 GET non è un conteggio football-only

`footballGetInventory()` in `scripts/app-ingestion/preflight.mjs` include ogni path che
contiene `/api/v2/`. Nello schema operativo complessivo osservato nel browser risultano:

- 145 GET con un segmento `/api/v2/`;
- 64 GET sotto la radice football v2;
- 81 GET sotto radici v2 specifiche di altri sport.

Il totale storico di DATA-0 è quindi riproducibile, ma l'etichetta “Inventario GET
calcistico” è troppo ampia. Il report generato resta evidenza storica e non viene
riscritto; per le decisioni IQstatS va usato il conteggio football-only di 64.

### 2. “Nessun limite di richieste” richiede una precisazione

La documentazione dichiara nessuna quota per account, ma mantiene un limite burst per
IP di 10 richieste al secondo, con burst 110 e risposta 429 oltre soglia. Raccomanda
inoltre di non interrogare le liste live più spesso di ogni 10 secondi. Il throttling
locale a massimo due richieste al secondo resta compatibile e prudente.

### 3. Le classifiche a gruppi non sono normalizzate da DATA-1

Il contratto documentato distingue:

- competizioni a girone unico: array `standings`;
- coppe o tornei: collezione `groups`, da renderizzare separatamente.

`normalizeStandingSnapshot()` accetta soltanto un array `standings` e una stagione.
Le classifiche a gruppi sono quindi una lacuna reale del normalizzatore, non copertura
assente da trasformare automaticamente in tabella vuota.

### 4. Gli stati gara OpenAPI sono più granulari dei mapper locali

La pagina introduttiva usa gli aggregati `upcoming`, `live`, `finished`, `cancelled` e
`postponed`. L'OpenAPI dell'elenco eventi espone anche stati di fase come primo tempo,
intervallo, secondo tempo, supplementari e rigori, oltre a ritardo e in corso.

- APP-2 traduce intenzionalmente solo non iniziata, conclusa, rinviata e annullata.
- DATA-1 riconosce `live` e `inprogress`, ma non tutte le varianti di fase documentate;
  tali varianti possono diventare `unknown`.

Prima di usare il database per gare live serve un enum IQstatS esaustivo e testato,
senza comprimere fasi diverse in un valore ambiguo.

### 5. Il client provider non distingue 402 e 503

Il riferimento ufficiale separa:

- 401: token assente o non valido;
- 402: token valido, ma add-on richiesto;
- 429: limite temporaneo;
- 503: funzionalità temporaneamente non disponibile.

`ProviderClient` distingue oggi soltanto 404 e 429; gli altri errori non-OK diventano
`source_unavailable`. In particolare, un 402 viene esposto come errore temporaneo e
ritentabile, anche se richiede una decisione di prodotto o abilitazione e non un retry.

### 6. I media esistono alla fonte, ma manca il contratto media IQstatS

La documentazione conferma risorse immagine derivate dall'ID per:

- campionati;
- squadre;
- giocatori;
- manager;
- impianti.

La risposta è 200 quando l'immagine esiste, 204 quando l'entità non ha immagine e 404
solo per un tipo sconosciuto. La guida esterna suggerisce hotlink e placeholder, ma i
vincoli IQstatS prevalgono: niente URL diretti della fonte, niente placeholder e niente
costruzione client-side da identificativi esterni. Occorre prima un contratto media
server-side con disponibilità esplicita e una policy di proxy/cache.

### 7. Altre incompatibilità da non perdere

- Array di xG per tiro e posizioni medie possono essere vuoti invece che assenti: vuoto
  e non disponibile non sono equivalenti.
- Le previsioni usano scale numeriche non uniformi tra probabilità di mercato e
  confidenza modello. Vanno normalizzate per campo, mai con una regola globale.
- Le previsioni del provider non autorizzano expected o segnali IQstatS:
  `expectedAdjustmentAllowed` resta sempre `false`.
- Il feed trasferimenti può includere operazioni annunciate con data futura; una vista
  “ultimi trasferimenti” deve applicare un limite temporale esplicito.
- Cache della fonte diverse per dominio non sostituiscono `capturedAt`, `freshUntil`,
  completezza e limiti di copertura del contratto IQstatS.
- Il canale WebSocket è un add-on distinto dal REST, con massimo dieci sottoscrizioni
  concorrenti per socket. Non è parte del perimetro applicativo attualmente approvato.
- Social, broadcast e contenuti editoriali restano fuori dal database operativo
  iniziale.

## Inventario football v2 verificato

| Famiglia | GET | Ambito principale |
| --- | ---: | --- |
| bookmakers | 1 | dizionario operatori e consenso sintetico |
| broadcasts | 2 | associazioni evento-canale |
| events | 15 | lista, live, dettaglio e sottorisorse gara |
| players | 7 | profilo, statistiche, carriera e trasferimenti |
| leagues | 10 | catalogo, stagioni, classifiche, ranking e impianti |
| managers | 5 | profilo, carriera, gare e social |
| odds | 3 | feed, migliori prezzi e dettaglio quota |
| predictions | 2 | feed e dettaglio previsioni esterne |
| referees | 3 | profilo e storico gare |
| social | 2 | feed editoriale e dettaglio |
| teams | 5 | profilo, rosa, calendario e social |
| transfers | 1 | feed trasferimenti globale |
| tv-channels | 3 | canali e palinsesto |
| venues | 3 | impianti e competizioni ospitate |
| worldcup | 2 | convocazioni specialistiche torneo 2026 |
| **Totale** | **64** | solo football v2 |

## Mappatura verso le slice dati IQstatS

| Superficie documentata | Slice proposta | Stato IQstatS verificato | Decisione |
| --- | --- | --- | --- |
| campionati, stagione corrente, stagioni | DATA-1 | acquisiti localmente | riusare i contratti normalizzati |
| elenco/dettaglio gare | DATA-1 | gare locali disponibili | collegare solo dopo un adattatore DB verificato |
| squadre base referenziate dalle gare | DATA-1 | acquisite localmente | nessun media ancora |
| classifiche piatte | DATA-1 | snapshot locali, con limiti espliciti | esporre soltanto snapshot completi |
| classifiche a gruppi | correzione DATA-1 | normalizzatore assente | nuovo contratto prima dell'ingest |
| statistiche evento, incidenti, statistiche giocatore | DATA-2 | non iniziata | campionare e formalizzare prima dello storage |
| feed quote, migliori prezzi, confronti | DATA-3 | non iniziata | change-only e retention da validare |
| rose, giocatori, formazioni, manager | DATA-4 | non iniziata | distinguere confermato, previsto e assente |
| trasferimenti | DATA-5 | non iniziata | gestire date future e campi mancanti |
| arbitri, impianti, broadcast, social, convocazioni speciali | DATA-5 | non iniziata | introdurre soltanto con caso prodotto approvato |
| H2H evento | slice da decidere | disponibile solo nel gateway live | non persistere senza contratto e freshness policy |
| previsioni esterne | esclusa dagli expected IQstatS | nessuna route IQstatS dedicata | non alimentare expected o segnali |
| WebSocket live | workstream separato | non iniziato | richiede contratto, add-on e resilienza dedicati |
| immagini | contratto media separato | non iniziato | proxy server-side; niente URL diretti |

## Stato delle route IQstatS esistenti

| Route IQstatS | Fonte attuale | Read model locale | Blocco corrente |
| --- | --- | --- | --- |
| competizioni | gateway live dopo autorizzazione | DATA-1 disponibile | adattatore DB assente |
| lista gare | gateway live dopo autorizzazione | `match_read_model` disponibile | adattatore DB assente |
| dettaglio gara | gateway live dopo autorizzazione | nucleo DATA-1 disponibile | copertura dettaglio da definire |
| classifica | gateway live dopo autorizzazione | `current_standing_rows` disponibile | gruppi e snapshot incompleti |
| statistiche gara | gateway live dopo autorizzazione | assente | DATA-2 non iniziata |
| quote gara | gateway live dopo autorizzazione | assente | DATA-3 non iniziata |
| H2H gara | gateway live dopo autorizzazione | assente | contratto di persistenza non deciso |

Il messaggio “Accesso richiesto” osservato nella pagina Partite deriva dal controllo
autenticazione/entitlement che precede il gateway. Il token provider non risolve questo
stato utente e non deve essere spostato nel client.

## Appendice A — tutte le 64 operazioni GET football v2

### Bookmakers e broadcast

- `/api/v2/bookmakers/`
- `/api/v2/broadcasts/`
- `/api/v2/broadcasts/{id}/`

### Eventi e live

- `/api/v2/events/`
- `/api/v2/events/live/`
- `/api/v2/events/{id}/`
- `/api/v2/events/{id}/broadcasts/`
- `/api/v2/events/{id}/h2h/`
- `/api/v2/events/{id}/incidents/`
- `/api/v2/events/{id}/lineups/`
- `/api/v2/events/{id}/metadata/`
- `/api/v2/events/{id}/odds/`
- `/api/v2/events/{id}/odds/comparison/`
- `/api/v2/events/{id}/polymarket/`
- `/api/v2/events/{id}/prediction/`
- `/api/v2/events/{id}/social/`
- `/api/v2/events/{id}/stats/`
- `/api/v2/events/{id}/player-stats/`

### Giocatori

- `/api/v2/players/`
- `/api/v2/players/{id}/`
- `/api/v2/players/{id}/career/`
- `/api/v2/players/{id}/national-team/`
- `/api/v2/players/{id}/social/`
- `/api/v2/players/{id}/stats/`
- `/api/v2/players/{id}/transfers/`

### Campionati e stagioni

- `/api/v2/leagues/`
- `/api/v2/leagues/{id}/`
- `/api/v2/leagues/{id}/bestxi/{season_id}/`
- `/api/v2/leagues/{id}/bestxi/{season_id}/{round_number}/`
- `/api/v2/leagues/{id}/season/`
- `/api/v2/leagues/{id}/seasons/`
- `/api/v2/leagues/{id}/seasons/{season_id}/venues/`
- `/api/v2/leagues/{id}/standings/`
- `/api/v2/leagues/{id}/top/{stat}/`
- `/api/v2/leagues/{id}/venues/`

### Manager

- `/api/v2/managers/`
- `/api/v2/managers/{id}/`
- `/api/v2/managers/{id}/career/`
- `/api/v2/managers/{id}/matches/`
- `/api/v2/managers/{id}/social/`

### Quote e previsioni

- `/api/v2/odds/`
- `/api/v2/odds/best/`
- `/api/v2/odds/{id}/`
- `/api/v2/predictions/`
- `/api/v2/predictions/{id}/`

### Arbitri, social e squadre

- `/api/v2/referees/`
- `/api/v2/referees/{id}/`
- `/api/v2/referees/{id}/matches/`
- `/api/v2/social/`
- `/api/v2/social/{id}/`
- `/api/v2/teams/`
- `/api/v2/teams/{id}/`
- `/api/v2/teams/{id}/fixtures/`
- `/api/v2/teams/{id}/social/`
- `/api/v2/teams/{id}/squad/`

### Trasferimenti, TV, impianti e convocazioni

- `/api/v2/transfers/`
- `/api/v2/tv-channels/`
- `/api/v2/tv-channels/{id}/`
- `/api/v2/tv-channels/{id}/broadcasts/`
- `/api/v2/venues/`
- `/api/v2/venues/{id}/`
- `/api/v2/venues/{id}/competitions/`
- `/api/v2/worldcup/squads/`
- `/api/v2/worldcup/squads/{team_id}/`

## Gate consigliato successivo

Prima di aggiungere altri dati all'app:

1. correggere e testare l'inventario del preflight affinché distingua football v2 dagli
   altri sport senza riscrivere il report storico;
2. formalizzare gli stati gara granulari e le classifiche a gruppi;
3. decidere se la prossima slice sia l'adattatore database-backed per il nucleo DATA-1
   oppure DATA-2 per statistiche finali;
4. definire separatamente il contratto media server-side;
5. mantenere il database remoto, APP-6A e ogni nuova ingestione fuori scope finché il
   relativo contratto e le verifiche non siano approvati.
