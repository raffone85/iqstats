# StatsIQ — mappa endpoint calcio (BSD/bzzoiro), sanificata

Data: 10 agosto 2026. Fonte: documentazione provider (panoramica) + set di strumenti
MCP del provider + rotte BFF del vecchio progetto StatsIQ (riferimento dell'utente).
Nessun token, URL completo o payload grezzo è riportato qui.

## Fatti generali (dalla doc)

- **Calcio = gratuito** (altri sport a pagamento). Perimetro di lavoro: solo calcio.
- Base: `{PROVIDER_BASE}/football/api/v2/<endpoint>`. Auth: header `Authorization: Token …`
  (`BSD_API_TOKEN`, solo lato server). Paginazione `limit`/`offset`, timestamp ISO 8601,
  quote decimali, stati: upcoming/live/finished/cancelled/postponed. Rate limit → HTTP 429.
- Il provider si usa SOLO server-side (adapter → contratti IQstatS/StatsIQ). Mai al client.

## Endpoint per dominio (nome MCP → uso app)

**Cataloghi & struttura**
- `list_leagues` → leghe/competizioni supportate. `list_seasons` / `get_season` → stagioni.
- `get_standings` → classifica lega/stagione (con forma compatta W/D/L).

**Gare**
- `search_matches` → calendario/lista gare filtrabile (data, lega, stato). `get_live_scores` → risultati live.
- `get_match_detail` → dettaglio gara (squadre, stato, orario, **venue/stadio**, arbitro).
- `get_match_lineups` → formazioni. `get_match_shotmap` → mappa tiri + **xG**.
- `get_match_incidents` → eventi (gol, cartellini, cambi). `get_match_h2h` → testa a testa.

**Squadre / giocatori / staff**
- `get_team_detail`, `get_team_squad`, `get_team_fixtures`.
- `get_player_detail`, `get_player_stats`. `get_manager_detail`. `list_referees`.

**Pronostici & modelli**
- `get_predictions` → **pronostici ML** (per gara). xG derivabile da shotmap/statistiche.

**Quote & mercato**
- `compare_odds`, `get_best_odds`, `list_bookmakers`, `get_polymarket_odds`.
- Movimenti: `get_money`, `get_money_history`, `list_money_movers`.

**Stadi & contorno**
- `get_venue`, `list_venues` → stadio (nome, città; **immagine di sfondo: sorgente da
  confermare** — `/img/venue/{id}/` o campo immagine del venue; il vecchio StatsIQ usava
  lo sfondo stadio, quindi esiste una sorgente da verificare in fase di build).
- `list_broadcasts`, `list_tv_channels`, `list_social_items`.

**Ricerca**
- `search_teams`, `search_players`, `search_managers`, `search_matches`.

**Media (immagini)** — vedi `provider-media-endpoints.md`
- `/img/team/{id}/`, `/img/league/{id}/`, `/img/player/{id}/` (PNG/WebP), via **proxy interno**.

## Nota di copertura

Per l'MVP StatsIQ i dati "core" (leghe, stagioni, gare, classifiche, squadre) sono già nel
DB locale **DATA-1**. Quote, statistiche gara, shotmap, pronostici, movimenti e media
restano su chiamata provider server-side quando la sezione lo richiede (con budget GET
dedicato e autorizzazione esplicita, mai dump indiscriminato).
