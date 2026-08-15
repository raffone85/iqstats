# Blueprint di migrazione — Frontend "Il Cardinale" → backend IQstatS

Data: 10 agosto 2026 · Stato: **proposta, in attesa di approvazione** (nessun codice app
ancora toccato). Fondato su ricerca multi-agente read-only (workflow
`cardinale-migration-blueprint-research`, 6 agenti, 0 errori). Fonti primarie:
app di riferimento `C:\Users\utente\Documents\StatsIQ` (lettura autorizzata) e questo
repo `apps/web`.

## 1. Obiettivo e decisioni bloccate

- **Strategia scelta dall'utente:** *backend di questo progetto invariato* + *frontend
  Cardinale sopra*, **look & UX identico**; cambia solo il nome (→ **IQstatS**) e ciò che
  serve per i guardrail (chip fonte/freschezza, stati "copertura assente").
- **Vincoli fermi (utente):** **Supabase, Stripe, Vercel restano quelli di questo
  progetto**, invariati (si rivedranno in futuro). I servizi/segreti di Cardinale **non**
  si importano.
- **Regola di lavoro:** ai punti cruciali si salva un **changelog** su file; ogni fetta è
  build-green (`typecheck` + `build` + verifiche) prima di procedere.

## 2. Correzioni alle assunzioni iniziali (perché la ricerca era necessaria)

1. **"La seam è un solo file" è FALSO.** `lib/bff/client.ts` è importato solo da ~6
   moduli, ma esistono **~15 copie inline di `bsdGet`/`bsdFetch`** e **~30 route
   handler** che leggono `BSD_API_BASE`/`BSD_API_TOKEN` **direttamente**. Un port ingenuo
   reintroduce chiamate live non autorizzate in **~35 punti**. → serve un **nuovo client
   di compatibilità** che i servizi importano, **non** una patch di `client.ts`.
2. **Default host live nascosti.** `client.ts` fa fallback a `http://testserver/api/v2`;
   `live`, `slips/settle`, `slips/refresh` fanno fallback al **vero host**
   `https://sports.bzzoiro.com/api/v2`. Con env non settata, il codice **colpisce il
   provider reale in silenzio**. Fail-closed obbligatorio.
3. **I font veri di Cardinale NON sono serif.** Il layout reale usa **Space Grotesk**
   (`--font-outfit`, display) + **Inter** (`--font-inter`, body) + **IBM Plex Mono**
   (`--font-mono`, dati). Il serif del mockup `cardinale.html` è solo un fallback in
   `.theme-cardinale`. "Identico" ⇒ si seguono i font reali.
4. **In questo repo NON c'è `learnai-academy`.** Questo repo è già `iqstats-web` /
   `@iqstats/shared` (Next **16.3**, React 19.2.8). Il "rename" è in realtà una
   **riconciliazione branding** dell'identità mista di Cardinale
   (`StatsIQ` nel manifest, `Il Cardinale` nel title, `cardinale-cache-v2` nel SW,
   themeColor `#120C0B` vs manifest `#131313`) → **IQstatS**.
5. **DATA-1 copre solo 3 domini:** *competizioni*, *partite* (lista/dettaglio/punteggi/
   stato/kickoff), *classifiche*. Tutto il resto su cui è costruita la UX di Cardinale
   (proiezioni, xG, severità arbitro, stat-picks, formazioni, predictions ML, polymarket,
   worldcup, TV, e ogni scheda team/player/manager/venue/arbitro) ha **zero copertura
   DB**. ⇒ "identico look & UX" è raggiungibile come **guscio visivo**, ma molti pannelli
   partono **honest-empty** o **provider-gated**.

## 3. Architettura target

```
Cardinale UI (pagine + componenti, look identico, brand → IQstatS)
        │  import
        ▼
lib/bff/* (servizi Cardinale, portati come SORGENTE)
        │  import  ← QUI si sostituisce il fondo
        ▼
lib/compat/iqstats-client.ts   ← NUOVO, unico punto di accesso dati
        │  delega
        ▼
backend INVARIATO di questo repo:
  - v1 gateway  /api/iqstats/v1/*  (hybrid: DATA-1 DB + provider-gated)
  - page-api.ts (fetch server-side RSC, cookie-forwarded)
  - media proxy /api/iqstats/v1/media/[kind]/[entityId] + <VerifiedMediaImage>
  - auth OTP 6 cifre, proxy.ts (getClaims), Stripe/billing, entitlements + rate-limit
```

Principi:
- **Shell:** si **fondono i visual di Navbar/BottomNav di Cardinale dentro
  `<ProductShell>`** (si mantiene lo shell per-pagina + API `activeSection`). **Non** si
  sposta la nav in `layout.tsx` (romperebbe le pagine esistenti).
- **Token:** si importa il blocco `@theme` + `.theme-cardinale` **in modo additivo**
  (classe scoperta) accanto alle classi `.product-*`/`.dashboard-*` esistenti, così nulla
  si rompe durante la transizione.
- **Auth/sessione/billing:** si tiene **tutto** di questo repo (OTP 6 cifre, `getClaims`,
  `proxy.ts` con esclusione `api/billing/webhook`, Stripe test-mode). Si **scarta**
  `middleware.ts` di Cardinale e il suo magic-link.
- **Onestà dati:** ogni pannello legge la `DataEnvelope` (availability/missingFields) e
  rende stati *partial*/*unavailable* espliciti; **mai** zeri o numeri sintetizzati.

## 4. La seam reale e il compatibility layer

- **Nuovo file `apps/web/src/lib/compat/iqstats-client.ts`** (server-only): espone le
  funzioni che i servizi Cardinale usavano da `bsd`/`bsdGet`, ma delega al v1
  gateway/`page-api` di questo repo. **Fail-closed**: se una capacità non è coperta,
  ritorna envelope vuota/honest-empty, **mai** fabbrica e **mai** chiama il provider fuori
  dal gateway.
- **Media:** un adapter mappa `TeamLogo/LeagueLogo/…` di Cardinale a `<VerifiedMediaImage>`
  → `/api/iqstats/v1/media/[kind]/[entityId]`. Niente `<img src="sports.bzzoiro.com/…">`,
  niente `images.remotePatterns` per bzzoiro.
- **CI grep-gate:** build fallisce se compare un `fetch` verso `BSD_API_BASE` /
  `sports.bzzoiro.com` fuori dal gateway. È la rete di sicurezza contro la regressione dei
  ~35 punti.

## 5. Copertura backend attuale (dalla ricerca)

**Contratti v1 esistenti** (tutti `DataEnvelope`, `no-store`, con feature-gate):

| Route v1 | Fonte | Feature-gate |
| --- | --- | --- |
| `GET /competitions` | DATA-1 DB (fallback provider capped) | `matches.list.read` |
| `GET /matches?date&leagueId&status` | DATA-1 DB | `matches.list.read` |
| `GET /matches/[id]` | DATA-1 DB (currentMinute/derby sempre null) | `matches.detail.read` |
| `GET /competitions/[id]/standings?seasonId` | DATA-1 DB (xG=null, form `unavailable`) | `match.history.read` |
| `GET /matches/[id]/odds` | **provider-only**, budget 5×200 | `odds.snapshot.read` |
| `GET /matches/[id]/statistics` | **provider-only** (7 metriche osservate) | `match.statistics.read` |
| `GET /matches/[id]/h2h` | **provider-only** | `match.history.read` |
| `GET /media/[kind]/[id]` | provider media proxy (logo, 5 kind) | `matches.detail.read` |

**DATA-1 copre:** competizioni; partite lista/dettaglio (team, punteggi, stato, kickoff,
round, venue/referee **id**, `has_complete_standings`, provenienza/freschezza);
classifiche (posizione, PG/V/N/P, GF/GS/DR, punti, `compactForm` W/D/L).
**DATA-1 NON copre:** xG (sempre `null`), form dettagliata, odds, statistiche gara, h2h,
`currentMinute`/`neutralGround`/`localDerby`, filtro `live`, immagini (solo via proxy),
e ogni endpoint di dettaglio entità (team/player/manager/venue/referee/predictions/
lineups/incidents/shotmap/money).

## 6. Matrice di copertura per pagina (prima ondata)

| Pagina Cardinale | Stato iniziale | Fonte |
| --- | --- | --- |
| `/` (Oggi) | DATA-1 parziale + honest-empty | v1 matches+competitions; verdetto/segnali/arbitro/picks → empty |
| `/partite` | **DATA-1 now** — 1ª fetta | v1 matches (+competitions); pick upcoming → empty |
| `/trend` | **DATA-1 now** — 2ª fetta | v1 matches?status=finished (over2.5/BTTS/avgGoals derivati) |
| `/campionati` | DATA-1 now | v1 competitions |
| `/campionati/[id]` | DATA-1 (classifica) + provider-gated | v1 standings; **rimuovere fetch BSD diretta della pagina** |
| `/match/[id]` | DATA-1 (shell+classifica) + provider-gated (odds/stats/h2h) + honest-empty (resto) | v1 matchDetail/standings/odds/statistics/h2h |
| `/giocate-statistiche` | honest-empty | modello = fan-out provider + priors (vietati) |
| `/arbitri`, `/referee/[id]` | honest-empty → provider-gated dopo | nessuna copertura DB; logo via proxy |
| `/team/[id]` | frammento DATA-1 + provider-gated | v1 standings (posizione/punti/forma-availability) |
| `/player/[id]`, `/manager/[id]`, `/venues*` | honest-empty → provider-gated | nessuna copertura DB |
| `/scanner`,`/predictions`,`/backtest`,`/track-record` | honest-empty | modello + fan-out + priors |
| `/live` | honest-empty/disabilitata | DB senza filtro live; `/api/live` = N+1 non autorizzato |
| `/analyst`, ChatTab, AiAnalysisModal | fuori scope | AI Groq/Gemini + intel provider |
| `/my-bets`, `/autobet` | fuori scope (feature nuova) | slips su Supabase/cron di Cardinale |
| `/worldcup*`, `/canali-tv*` | honest-empty/omesse | provider-only |
| `/login` | sostituita | `/accedi` (OTP 6 cifre) di questo repo |
| PWA + `/offline` | port additivo | statico, brand → IQstatS |

## 7. Dati inventati da RIMUOVERE prima/duante il port (regola "niente dati finti")

- `lib/mocks/match-207461.mock.ts` — `PreMatchIntelligence` interamente fabbricato
  ("Projection Engine (mock)"). Dead code ma importabile → **eliminare/escludere**.
- `lib/bff/lineup-xstats.service.ts` — `DEFAULT_SEASON_AVG`, `LEAGUE_BASELINES`,
  `DEFAULT_BASELINES` (shrinkage + fallback quando sample=0).
- `lib/bff/referee.service.ts` — `fetchGlobalBenchmark()` fallback (avgYellow 4.5 ecc.).
- `lib/bff/match.service.ts` — `LEAGUE_AVG_FOULS_TOTAL=24.0`, `LEAGUE_AVG_YELLOWS_TOTAL=3.5`.
- `app/api/live/route.ts` — xG di default 1.3/1.1.
- `lib/adapters/standings.adapter.ts` — `buildPlaceholderRow()` (zeri come record reale).
- Etichette sintetiche `Team {id}` / `Torneo {id}` → preferire `—`/`Sconosciuto`.

Regola: **strip**, non semplice tag "affidabilità bassa". Dove manca il dato →
"dati non disponibili".

## 8. Conflitti d'integrazione e risoluzioni

| Area | Risoluzione |
| --- | --- |
| Shell (layout globale vs ProductShell) | Fondere Navbar/BottomNav di Cardinale **dentro** ProductShell; non toccare `layout.tsx` |
| Token/palette (2 sistemi) | Import **additivo** `@theme` + `.theme-cardinale` in `globals.css` |
| Font | Aggiungere 3 `next/font/google` in `layout.tsx` esponendo `--font-outfit/-inter/-mono` |
| Auth (magic-link vs OTP) | **Tenere OTP 6 cifre**; riscrivere eventuale login/my-bets su `<EmailAccessForm>` |
| Sessione (`middleware.ts` vs `proxy.ts`) | Tenere `proxy.ts` (Next 16.3), preservare esclusione webhook; **scartare** `middleware.ts` |
| Supabase client/env | Tenere `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `getClaims`; riscrivere riferimenti a `*_ANON_KEY` |
| `/partite`, `/match/[id]`, `/auth/callback`, `/api/matches` | **Tenere** le versioni di questo repo; **ri-skinnare**, non rimpiazzare il data layer |
| `/login` | Standardizzare su `/accedi` (+ redirect opzionale) |
| `next.config` | Tenere `transpilePackages`/`turbopack.root`/`allowedDevOrigins`; **non** aggiungere host immagini bzzoiro |
| PWA | Port additivo: manifest rebrand IQstatS, `sw.js` (precache corretta, `/opta-logo.svg` assente), `PwaRegister`, `/offline`, icone, themeColor riconciliato |
| Versioni | Standard su 16.3.0/React 19.2.8; portare **sorgente**, non `package.json`/lockfile 16.2.6 |
| Billing/cron | Stripe di questo repo **intatto**; slips eventuali = feature nuova su Supabase+cron di questo repo |
| AI | Fuori scope; se in futuro, solo GROQ di questo repo, prompt vincolati a DATA-1, output etichettato |

## 9. Do-not-import (solo NOMI, mai valori)

Segreti/servizi di Cardinale da **non** importare: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (di Cardinale),
`GEMINI_API_KEY`, `GROQ_API_KEY` (di Cardinale), `BSD_API_BASE`, `BSD_API_TOKEN`,
`BSD_MCP_TOKEN`, `CRON_SECRET`, `API_TOKEN`, `USE_MOCK`. Restano quelli di **questo**
repo (Supabase/Stripe/Vercel).

## 10. Risk register (priorità)

1. **CRITICO** — port ingenuo reintroduce live GET non autorizzati (~35 siti). *Mitig.:*
   compat client unico + CI grep-gate.
2. **ALTO** — default host live nascosti. *Mitig.:* mai portare `client.ts`/wrapper inline;
   fail-closed.
3. **ALTO** — dati inventati (priors/mock) mostrati come reali. *Mitig.:* strip + honest-empty.
4. **ALTO** — collisione shell (layout globale vs ProductShell). *Mitig.:* fondere in ProductShell.
5. **ALTO** — mismatch auth/Supabase. *Mitig.:* tenere OTP/`getClaims`/`proxy.ts`.
6. **ALTO** — Match Center fa ~20 fetch client + polling 60s → 403/429. *Mitig.:*
   consolidare in fetch server via `page-api`, togliere polling; seminare entitlement.
7. **MEDIO** — budget GET provider ⇒ dati parziali/assenti a runtime. *Mitig.:* rendere
   partial/unavailable.
8. **MEDIO** — convenzioni Next 16.3 (proxy, async cookies/headers). *Mitig.:* portare
   sorgente, riverificare su `node_modules/next/dist/docs`.
9. **MEDIO** — media solo 5 kind logo; foto stadio senza fonte backend. *Mitig.:* asset
   statici o honest-empty; nessun host bzzoiro.
10. **MEDIO** — allucinazioni AI (se portata). *Mitig.:* fuori scope iniziale.
11. **MEDIO** — slips/cron di Cardinale senza casa. *Mitig.:* fuori scope; eventuale
   feature nuova su Supabase/cron di questo repo.
12. **BASSO** — branding incoerente negli asset. *Mitig.:* pass unico → IQstatS.

## 11. Piano a fasi verificabili

- **Fase 0 — Fondamenta (nessun dato).** Riconciliazione branding → IQstatS; 3 `next/font`
  in `layout.tsx` (`--font-outfit/-inter/-mono`); import additivo token `.theme-cardinale`
  in `globals.css`; fondere visual Navbar/BottomNav in `<ProductShell>`. Nessun cambio al
  data layer, nessuna nuova rete.
  *Verifica:* `typecheck` + `build` verdi; `/partite`,`/metodo`,`/account/billing`,`/accedi`
  ancora funzionanti; auth ok; grep pulito (nessun host BSD/bzzoiro introdotto).
- **Fase 1 — Compatibility layer.** `lib/compat/iqstats-client.ts` (delega a v1/page-api,
  fail-closed) + media adapter → `<VerifiedMediaImage>` + CI grep-gate. *Verifica:* test
  unit (envelope/honest-empty, zero fetch provider; URL proxy corretti); build verde.
- **Fase 2 — Prima pagina reale: `/partite` su DATA-1.** UX match-list di Cardinale
  (DateBar, tab stato, filtro lega, MatchRow+logo) su v1 matches+competitions via compat,
  **fusa** nel `/partite` canonico. Pick/verdetto → honest-empty. *Verifica:* rende da DB,
  entitlement+rate-limit attivi, zero GET provider; script di verifica esteso.
- **Fase 3 — Classifiche & competizioni su DATA-1.** `/campionati` + `/campionati/[id]`
  Classifica su v1 standings; **rimuovere** la fetch BSD diretta della pagina `[id]`;
  opzionale `/trend` DATA-1-native. *Verifica:* xG/form come `unavailable`, non zero.
- **Fase 4 — Match Center shell su DATA-1.** Header + shell + tab Classifica&forma da v1;
  consolidare fan-out client in fetch server; togliere polling. Resto honest-empty.
- **Fase 5 — Arricchimento provider-gated.** Abilitare odds/statistiche/h2h via route v1
  esistenti (entitlement+budget, stati partial); logo ovunque; eventuali nuove route v1
  (classifiche/arbitro/venue/team) **senza** priors.
- **Fase 6 — Decisioni differite.** AI (omessa o solo GROQ vincolata), slips (feature
  nuova su Supabase/cron di questo repo), worldcup/canali-tv/scanner, PWA additiva,
  redirect `/login→/accedi`. Stripe intatto.

## 12. Dettaglio Passo 0 (prima esecuzione, dopo approvazione)

File che verranno toccati (additivo, non distruttivo):
- `apps/web/src/app/layout.tsx` — 3 `next/font/google` + variabili CSS.
- `apps/web/src/app/globals.css` — blocco token `.theme-cardinale`/`@theme` (scoped).
- `apps/web/src/components/product-shell.tsx` — nav a 5 voci + visual Cardinale
  (Oggi/Partite/Pronostici/Database/Le mie giocate), bottom bar mobile.
- (branding wordmark IQstatS)
- **Changelog:** `docs/architecture/cardinale-migration-CHANGELOG.md` (creato al Passo 0,
  aggiornato a ogni punto cruciale).

Criteri di uscita Passo 0: `typecheck` + `build` verdi; QA 375/768/1024/1440, tastiera,
contrasto, `prefers-reduced-motion`; pagine e auth esistenti intatte; grep-gate pulito.
Aggiornamento `tasks/todo.md` solo dopo le verifiche.
