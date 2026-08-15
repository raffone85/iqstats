# Compito 0 — ricognizione API per la calibrazione

**Eseguito il:** 22 luglio 2026 (Europe/Rome)  
**Stato:** completato — checkpoint umano richiesto prima del Compito A

## Perimetro e sicurezza

- La ricognizione è stata eseguita in sola lettura con la configurazione server-side
  locale di IQstatS.
- Gli artefatti non contengono credenziali né header di autorizzazione.
- Non sono stati modificati app, UI, modello, dataset o script di harvesting.

## Leghe e paginazione

`GET /api/v2/leagues/?limit=100` restituisce:

```text
{ count, next, previous, results }
```

- `count`: 72
- `results` con `limit=100`: 72
- `next`: `null`

Quindi la paginazione esiste e va seguita nel harvester, anche se il limite 100 copre
il catalogo osservato in questa ricognizione. La selezione del Compito A dovrà mantenere
solo campionati maschili regolari domestici; coppe, qualificazioni, amichevoli e
competizioni continentali/internazionali restano fuori scope.

## Eventi conclusi

La forma corretta del filtro è `league_id`, non `league`:

```text
GET /api/v2/events/?league_id={id}&status=finished&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
```

- Con `league_id=4`, `1` e `5` sono stati verificati rispettivamente match di Serie A,
  Premier League e Bundesliga, con `event_date` come timestamp della gara.
- Il parametro `league` è ignorato dal provider: ha restituito una lista eterogenea di
  2.209 eventi e non deve essere usato dal harvester.
- La lista eventi è paginata con `{ count, next, previous, results }`.

Campioni selezionati:

| Competizione | `league_id` | `match_id` | Stato |
| --- | ---: | ---: | --- |
| Serie A | 4 | 1456 | `finished` |
| Premier League | 1 | 383 | `finished` |
| Bundesliga | 5 | 207461 | `finished` |

## Statistiche per gara

La fonte canonica è:

```text
GET /api/v2/events/{id}/stats/
```

La risposta contiene:

```text
{ event_id, stats, shotmap, momentum, average_positions, xg_per_minute }
```

`stats` contiene `home`, `away`, `first_half` e `second_half`. I campi verificati per
ogni squadra sono:

```text
total_shots, shots_on_target, fouls, corner_kicks,
yellow_cards, goalkeeper_saves, offsides
```

Nei campioni Premier League e Bundesliga sono presenti tutti e sette i campi. Nel match
Serie A 1456 `offsides` manca sia in `home` sia in `away`: nel dataset dovrà restare
vuoto / `null`, mai trasformato in `0`. Il Compito B escluderà una metrica per lega se
le assenze superano il 20% dei match della lega.

`GET /api/v2/events/{id}/shotmap/` restituisce 404. Non è stato verificato un endpoint
più leggero che restituisca solo le statistiche di squadra: il Compito A dovrà chiamare
`stats/`, estrarre soltanto `stats.home` e `stats.away`, e conservare il payload raw per
audit e ripresa.

## Squadre, giocatori, allenatori e mercato

| Risorsa | Endpoint verificato | Evidenze utili |
| --- | --- | --- |
| Squadra | `GET /api/v2/teams/{id}/` | `id`, nome, paese, `venue_id` |
| Rosa | `GET /api/v2/players/?team_id={id}` | Paginata; il filtro `team_id` è operativo |
| Giocatore | `GET /api/v2/players/{id}/` | valore di mercato, contratto, disponibilità, attributi, punti di forza/debolezza, rating, potenziale, rischio infortunio e stipendio annuo |
| Allenatore | `GET /api/v2/managers/{id}/` | profilo tattico, modulo preferito, squadra corrente, W/D/L, possesso e metriche aggregate |
| Trasferimenti | `GET /api/v2/transfers/?team_id={id}` | Paginata; record strutturati con giocatore, club origine/destinazione, data, fee e tipo |
| Formazioni | `GET /api/v2/events/{id}/lineups/` | `lineups.home/away` con squadra, modulo, confidenza, titolari e panchina; `unavailable_players` è disponibile |

La rotta `GET /api/v2/coaches/{id}/` restituisce 404: usare `managers/{id}/`.

## Contenuti editoriali e indisponibilità

`GET /api/v2/social/` è disponibile e accetta almeno i filtri `team_id` e `league_id`.
Espone `type`, URL, testo, titolo, media, account, data di pubblicazione e collegamenti
ad entità. È un feed di contenuti testuali/multimediali: può alimentare UI o riferimenti,
ma non è una fonte strutturata per il modello.

Le rotte candidate `news/`, `articles/` e `injuries/` hanno restituito 404. Per le
indisponibilità usare le formazioni (`unavailable_players`) quando disponibili; non
dedurre infortuni dal testo del feed social.

## Artefatti salvati

- `leagues.json` — catalogo leghe autenticato, senza segreti.
- `sample-match-1456.json` — Serie A.
- `sample-match-383.json` — Premier League.
- `sample-match-207461.json` — Bundesliga.

## Decisione richiesta

Confermare la policy di harvesting:

1. `stats/` come unica fonte canonica; nessuna conversione delle assenze in zero.
2. `league_id` come filtro eventi obbligatorio.
3. Solo campionati maschili regolari domestici, con dataset e baseline sempre separati
   per `league_id`.

Dopo la conferma si potrà creare esclusivamente `scripts/calibration/buildDataset.ts`
per il Compito A.
