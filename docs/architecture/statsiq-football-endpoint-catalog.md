# StatsIQ — catalogo endpoint calcio BSD v2 (verificato dai docs)

Data verifica: 10 agosto 2026. Fonte: `https://sports.bzzoiro.com/docs/football/`
(lette le versioni `.md` sezione per sezione). Solo **football (gratuito)**.
Base: `/api/v2/` · Auth: `Authorization: Token <chiave in .env.local>` (mai in output).
Nessun token/valore riportato qui.

> Questo catalogo è verificato a livello di campo dai docs e integra/aggiorna
> `statsiq-football-endpoint-map.md`. Usare per la mappa campi→fonte e per l'implementazione.

## 0. Convenzioni & limiti (operativi)

- **Paginazione:** `limit` (def 50, max 200) + `offset`. Envelope lista:
  `{ count, next, previous, results[] }`.
- **Date:** ISO-8601 UTC (`...+00:00`); filtri `date_from`/`date_to` = `YYYY-MM-DD`.
- **Status gara:** `upcoming` · `live` · `finished` · `cancelled` · `postponed`.
- **Quote:** decimali; `null` = mercato non ancora prezzato. Prob. implicite `0–1`.
- **Errori:** `{ error:true, status, detail }`. Codici: 400 param, 401 token, **402
  add-on a pagamento**, 404, **429 rate limit**, 503 modello offline.
- **Rate limit:** ⚠️ **nessuna quota per-account**; solo **10 req/s per IP (burst 110)**.
  → Il "budget GET" resta una **disciplina auto-imposta del progetto** (niente dump,
  chiamate circoscritte e loggate), non un tetto del provider.
- **Caching:** endpoint hot (events/leagues/teams) edge-cache ~5 s (`X-Cache-Status`);
  live 10–30 s; reference ~5 min; predictions ~2 min; immagini fino a 30 giorni.
- **ID:** usare gli id numerici BSD (stabili tra REST/MCP/WS/immagini); risolverli dai
  list/search, mai indovinarli.
- **Add-on a pagamento (fuori perimetro, rispondono 402):** Weight of Money
  (`get_money`/`get_money_history`/`list_money_movers`), Odds API tick-history, WebSocket
  live ($3/mo). **Non usare.**

## 1. Events & live — `/events/…`

- `GET /events/` — lista. Param: `league_id`, `season_id`, `team_id`, `team_name`,
  `status`, `date_from`/`date_to`, `limit`/`offset`.
- `GET /events/live/` — live compatto: score, period, `current_minute`, HT score,
  shootout; flag `live_websocket`, `websocket_plus`.
- `GET /events/{id}/` — **detail (statico)**: team (id+nome), coach, **referee**,
  **venue**, round/group, kickoff, score FT/HT/ET/pens, **weather**, pitch, attendance,
  **derby/neutral flags**, travel, highlights, **h2h summary**, `has_xg`,
  `previous_leg_event_id`.
- **Sub-resource** `/events/{id}/…`:
  | Endpoint | Restituisce |
  | --- | --- |
  | `/stats/` | team stats (possesso, tiri, **xG** per metà), **shotmap** per-tiro (x,y,xg,result), momentum, posizioni medie, xg-per-minuto |
  | `/lineups/` | XI confermato + panchina (`captain`); prima dell'ufficialità XI **AI-predetta** con confidence |
  | `/incidents/` | gol, cartellini, cambi, VAR (`period_second`, `rescinded`) |
  | `/player-stats/` | statistiche per-giocatore, categoria `Advanced` (big chances, xG on target, carry, GK) |
  | `/h2h/` | precedenti, W/D/L, gol, win rate |
  | `/odds/` | quote decimali consenso per mercato |
  | `/odds/comparison/` | griglia mercato × bookmaker |
  | `/polymarket/` | prob. implicite prediction-market (0–1) + liquidità |
  | `/prediction/` | probabilità modello per mercato (= `/predictions/{id}/`) |
  | `/metadata/` | colori maglia, fun facts, **anteprima AI** |
  | `/broadcasts/` | emittenti TV (`country_code`) |
  | `/social/` | tweet/video curati |

## 2. Leagues, seasons & standings — `/leagues/…`

- `GET /leagues/` (`country`, `is_women`, `include_inactive`) · `GET /leagues/{id}/`.
- `GET /leagues/{id}/seasons/` (tutte) · `GET /leagues/{id}/season/` (**corrente** —
  risolvere sempre la stagione così, non hardcodare). Season: `{id,name,year,start_date,
  end_date,is_current}`.
- `GET /leagues/{id}/standings/?season_id=` — righe: posizione, `team_id`, nome, PG,
  V/N/P, GF/GS, punti, **forma recente**; coppe → array `groups` (gestire entrambi).
- `GET /leagues/{id}/top/{stat}/` — **leaderboard**: `stat` ∈ `scorers`·`assists`·
  `yellowcards`·`redcards`·`fouls`; riga `{rank,player_id,player_name,position,team_id,
  team_name,value,matches}`.
- `GET /leagues/{id}/bestxi/{season_id}/[{round}]/` — miglior XI.
- `GET /leagues/{id}/venues/…` — stadi competizione (form torneo con host/round).

## 3. Teams, players & transfers — `/teams/…`, `/players/…`

- `GET /teams/` (`country_code`, `league_id`/`season_id`, `in_competition`, `is_women`,
  `name`). `GET /teams/{id}/` (venue, coach, colori, paese) · `/squad/` · `/fixtures/`
  (`date_from/to`,`league_id`,`status`) · `/social/`.
- `GET /players/` (`name`,`team_id`,`national_team_id`,`nationality_code`,`position` G/D/M/F).
  `GET /players/{id}/` (bio, market value, skills) · `/stats/` (log per-match) ·
  `/transfers/` · `/career/` · `/national-team/` · `/social/`.
- `GET /transfers/` (feed) · `GET /worldcup/squads/[{team_id}/]`.

## 4. Managers, referees & venues — `/managers/…`, `/referees/…`, `/venues/…`

- `GET /managers/` (`tactical_profile`,`team_style`,`min_matches`…). `/{id}/` (formazione
  preferita, stile, record) · `/career/` · `/matches/` · `/social/`.
- `GET /referees/` (`league_id`,`min_matches`). **`GET /referees/{id}/` → profilo +
  aggregati per-match (cartellini, falli, rigori)** ← severità arbitro pronta.
  `/referees/{id}/matches/` → log. I docs suggeriscono: combinare con mercato
  `total_red_cards` per la ricerca disciplina.
- `GET /venues/` (`city`,`min_capacity`,`team_id`). `/{id}/` (capienza, città,
  **coordinate**, home team) · `/competitions/`. Foto: `/img/venue/{id}/`.

## 5. Odds & predictions — `/odds/…`, `/predictions/…`

- `GET /odds/` — 1 riga per evento×mercato×outcome×bookmaker. Mercati: `1x2`,
  `over_under_15/25/35`, `btts`, `double_chance`, `draw_no_bet`, **`total_corners`**,
  **`total_red_cards`** (con `line`). Campi: `decimal_odds`, `previous_decimal_odds`,
  `implied_probability`, `movement` up/down, `is_max_quote`. Filtri utili: `event_id`,
  `market`, `is_max_quote`, `movement`, `updated_after`.
- `GET /odds/best/` — miglior prezzo per outcome (richiede `market`).
- `GET /bookmakers/`.
- `GET /predictions/` · `/predictions/{id}/` · `/events/{id}/prediction/` — **modello**:
  `match_result{prob_home/draw/away,predicted}`, `expected_goals{home,away}`,
  `over_under{prob_over_15/25/35}`, `btts{prob_yes}`, `score{most_likely}`,
  `draw_no_bet`, `corners{prob_over_85/95/105}`, `recommendations{favorite,favorite_prob,
  over_25,btts}`, `model{confidence 0–1, version}`. ⚠️ prob mercato **0–100**, confidence
  **0–1**. Filtri: `min_confidence`, **`recommended=true`**, `status`, `league_id`,
  `date_from/to` → utile per "migliori pick del giorno".

## 6. TV, broadcasts & social

- `GET /tv-channels/` · `/{id}/` · `/{id}/broadcasts/`.
- `GET /broadcasts/` (`event_id`,`country_code`,`channel_id`,scope,date).
- `GET /social/` (`type` tweet/video, entità, verificati, finestra) + shortcut per entità.

## 7. Image API — `/img/…` (senza auth)

- Football: `/img/{player|team|league|manager|venue}/{id}/`.
- Modificatori: `?bg=transparent` (tutti), `?sor=true` (solo player, ritaglio volto).
- Risposte: `200` PNG/WebP · `204` (id valido senza immagine, o id null) → placeholder ·
  `404` tipo sconosciuto. Cache fino a 30 giorni. Hotlink libero.

## Aggiornamenti al blueprint (dati verificati)

1. **Sfondo stadio HA una fonte reale:** `/img/venue/{id}/` — ed è già uno dei 5 `kind`
   del media proxy di questo progetto (`venue`). Quindi lo sfondo dossier/dashboard può
   venire dal proxy interno, non solo da asset statici (correzione al blueprint §copertura).
2. **Verdetto/favorita/gol/BTTS/score/corner + confidence** sono disponibili **pronti**
   da `/predictions/` (modello del provider) con flag `recommended`. Alternativa/comple­
   mento al nostro motore Elo→NegBinomiale (che resta il differenziatore per i mercati
   statistici). Da presentare sempre con fonte = "modello provider vX" quando si usa questo.
3. **Severità arbitro** = `/referees/{id}/` aggregati (cartellini/falli/rigori) — non serve
   ricalcolare dai log.
4. **Classifiche marcatori/assist/gialli/rossi/falli** = `/leagues/{id}/top/{stat}/`.
5. **Budget:** il provider non impone quota per-account (solo 10 req/s burst) → il cap è
   disciplina nostra; ogni GET va comunque loggato e circoscritto.
