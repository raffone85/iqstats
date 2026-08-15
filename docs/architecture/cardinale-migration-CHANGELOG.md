# Changelog migrazione "Il Cardinale" → IQstatS

Registro dei punti cruciali della migrazione (richiesto dall'utente). Ogni voce elenca
scope, file toccati, decisioni e verifiche. Nessun segreto in questo file.

Riferimenti: [blueprint](cardinale-frontend-migration-plan.md).

---

## Fase 0 — Fondamenta (shell + identità Cardinale + nav 5 voci) — 10 agosto 2026

**Scope:** portare l'identità "Il Cardinale" sullo **chrome dello shell** (header, nav,
bottom bar, font, wordmark) senza toccare il data layer né rompere le pagine esistenti.
Il corpo delle pagine resta chiaro/leggibile (reskin completo nelle fasi 2-4).

**Decisione tecnica:** i testi delle pagine attuali sono scuri su fondo chiaro; ribaltare
subito il `body` a scuro li renderebbe illeggibili. Perciò il Passo 0 è **chrome-only
Cardinale** (dark warm header/nav su canvas chiaro), non un reskin totale.

**File toccati:**
- `apps/web/src/app/layout.tsx` — aggiunti 3 `next/font/google` (Space Grotesk →
  `--font-outfit`, Inter → `--font-inter`, IBM Plex Mono → `--font-mono`), classi
  variabili su `<html>`. Verificata la guida locale `01-app/.../13-fonts.md`.
- `apps/web/src/app/globals.css` — (a) body font → `var(--font-inter)` con fallback;
  (b) blocco additivo "Fase 0 — Il Cardinale" in coda: token `--card-*` su `.product-shell`
  + override chrome (header/wordmark/mark/nav/subnav/signin) + bottom nav a 5 colonne
  Cardinale. Non modifica le classi di pagina esistenti.
- `apps/web/src/components/product-shell.tsx` — wordmark → **IQstatS**; nav primaria a
  **5 voci** (Oggi/Partite/Pronostici/Database/Le mie giocate); secondarie
  (Metodo/Piani) + Accedi a destra; `activeSection` esteso (retro-compatibile con
  matches/method/billing/account); bottom bar mobile a 5 voci.
- `apps/web/src/app/pronostici/page.tsx`, `.../database/page.tsx`, `.../giocate/page.tsx`
  — pagine placeholder minime ("sezione in costruzione", nessun dato simulato) affinché la
  nav a 5 voci abbia destinazioni reali (niente 404).

**Vincoli rispettati:** Supabase/Stripe/Vercel invariati; nessun segreto Cardinale
importato; nessuna chiamata provider introdotta; nessun dato inventato.

**Verifiche (10 agosto 2026):**
- `typecheck` (tsc --noEmit) → **verde**; `lint` (eslint) → **verde**.
- Dev server :3100 (DATA-1 locale): `/metodo`, `/pronostici`, `/database`, `/giocate`,
  `/partite` → **HTTP 200**. `next/font` compilato e self-hosted (classi
  `space_grotesk`/`inter`/`ibm_plex_mono` presenti su `<html>`, nessun errore di rete/compile).
- Shell reso: wordmark **IQstatS** + tagline, 5 voci primarie + secondarie + Accedi con
  href corretti (verificato via albero di accessibilità).
- grep-gate: nessun host BSD/bzzoiro/`testserver` introdotto nei file toccati.
- **Da completare quando la Browser pane sarà visualizzata:** screenshot QA visiva a
  375/768/1024/1440, contrasto e `prefers-reduced-motion` (struttura e regole CSS già
  predisposte: nav desktop ≥641px, bottom bar 5 col <640px, subnav nascosta <1024px,
  focus-visible ereditato, reduced-motion globale attivo).

---

## Dashboard "Oggi" su dati provider reali — 11 agosto 2026

**Contesto:** stack locale DATA-1 (Docker/Supabase) spento in sessione → percorso "dati
gratis" bloccato. L'utente ha autorizzato l'uso del provider ("hai il token BSD, hai
tutto"). Verificati i docs BSD sezione per sezione (→ `statsiq-football-endpoint-catalog.md`).

**Discovery live circoscritta (loggata):** ~5 GET provider via tool MCP per verificare il
percorso dati: `list_leagues` (80 leghe reali), `get_predictions` (356 pronostici reali,
modello `dc-blend-v1`; `recommended` raramente true → filtro dava 0), `search_matches`.
Nessun dump; nessun segreto in output.

**Costruito (prima fetta reale della dashboard):**
- `apps/web/src/server/iqstats/predictions.ts` — modulo **server-only** che riusa il client
  blindato `ProviderClient` (token da `BSD_API_TOKEN` in `.env.local`, allowlist `/api/v2/`,
  timeout). Fetch `/predictions/?upcoming=true`, normalizzazione, **TTL cache 120 s**,
  **fail-closed** (fonte assente/errore → lista vuota con motivo, mai dati inventati).
- `apps/web/src/app/oggi/page.tsx` — Server Component, dashboard **Oggi** in identità
  Cardinale piena (fondale scuro full-viewport). Hero "gara del giorno" (match a più alta
  confidence) con sfondo stadio atmosferico animato + verdetto (favorita %, Over 2.5) + chip
  segnale + provenienza + CTA dossier. Griglia "Migliori segnali del giorno". Stato **empty
  onesto**. `null` → "n/d", mai zeri. Disclaimer "letture del modello, non certezze".
- `globals.css` — blocco scoped `.oggi-*` (Cardinale scuro, Ken Burns + glow, reduced-motion
  coperto dalla regola globale). `product-shell.tsx` — voce nav "Oggi" → `/oggi`.

**Verifiche (11 agosto 2026):** `typecheck` + `lint` **verdi**. Dev `next dev` :3200
(`.env.local`): `GET /oggi` **200**, HTML con dati **reali** (hero SK Rapid Wien vs Paide,
Conference League, "favorita 86%", chip "Over 2.5 · 69%"; card Crvena Zvezda/NEC/CSKA
Sofia), fonte "Modello provider · dc-blend-v1", nessun errore.

**Guardrail:** provider **solo server-side**, token mai esposto al client né in output;
chiamate **cache-limitate**; fail-closed; nessun dato inventato. Uso provider autorizzato
esplicitamente dall'utente.

**Aperto:** QA visiva a occhio (Browser pane non compositava; l'utente può aprire
`http://localhost:3200/oggi`); dossier `/match/[id]` provider-backed; motore proprio
Elo→NegBinomiale con baseline calibrate (differenziatore).

### Step "loghi + stadio reali" — 11 agosto 2026

- `apps/web/src/app/api/media/[kind]/[entityId]/route.ts` — **proxy immagini pubblico**
  (senza entitlement) per superfici pubbliche. L'Image API del provider è **no-auth**:
  nessun token coinvolto, host provider non esposto al client. Riusa `getIqstatsMedia`
  (allowlist kind team/league/player/manager/venue, id positivo, cap 5MB, origin lock);
  `Cache-Control: public, max-age=86400`; 404 su immagine assente (204/404 provider).
- `apps/web/src/server/iqstats/match-context.ts` — `getMatchContext(eventId)` da
  `/events/{id}/` (venueId, refereeId, isLocalDerby; utile anche al dossier). Client
  blindato, TTL 300 s, fail-closed → null.
- `oggi/page.tsx` — helper `Crest` (monogramma base + `VerifiedMediaImage` che si nasconde
  su errore → logo reale se presente, monogramma se assente). Loghi su hero e card; sfondo
  hero = foto **venue** reale (`/api/media/venue/{id}`) con **fallback atmosferico** se
  assente. 1 GET aggiuntivo (match detail della sola gara in evidenza), cache-limitato.
- `globals.css` — layer hero (`.oggi-hero-venue` + `.oggi-hero-scrim`, z-index rivisti),
  stili `.oggi-crest-img`/`.oggi-crest-sm`/`.oggi-card-crests`.

**Verifiche (11 agosto 2026):** `typecheck` + `lint` verdi. Dev :3200:
`GET /api/media/team/1411` → **200 image/png (13 KB)** (logo reale); `GET
/api/media/venue/861` → **404** → fallback gradiente (stadio senza foto). `/oggi` include
54 riferimenti logo reali + bg venue. Provider solo server-side, nessun token esposto.

### Step "dossier /match/[id]" — 11 agosto 2026

Sostituito il vecchio dossier (gated/DB, giù) con un **dossier provider-backed pubblico** in
identità Cardinale, "verdetto prima". Forme sondate (1 GET ciascuna): `/venues/{id}/`
(name/city/country/capacity), `/referees/{id}/` (avg_yellow/red/fouls_per_match, matches).

- `predictions.ts` — `getMatchPrediction(eventId)` da `/events/{id}/prediction/` (verdetto
  singola gara; TTL cache; fail-closed).
- `match-context.ts` — consolidato: `getMatchDetail` (teams, venue, referee, kickoff, status,
  score, round, derby, **head_to_head** — niente GET extra per l'H2H), `getReferee`,
  `getVenue`. `/oggi` ora usa `getMatchDetail`.
- `app/api/media/[kind]/[entityId]` — riusato (loghi/stadio del dossier).
- `match/[id]/page.tsx` — riscritto: testata con **sfondo stadio** (reuse `.oggi-hero*`) +
  loghi; **Verdetto** (favorita derivata dal max 1X2, barre 1X2, Over2.5/BTTS/xG, confidenza,
  fonte); **Arbitro & Stadio** (media gialli/falli/rossi + tendenza con caveat carriera;
  nome/città/capienza stadio); **Testa a testa** (V/N/P, gol medi, ultime gare). Honest-empty
  ovunque; `null` → "n/d"; disclaimer "letture, non certezze".
- `globals.css` — blocco `.dossier-*` (Cardinale scuro).

**Verifiche (11 agosto 2026):** `typecheck` + `lint` verdi. Dev :3200 `GET /match/223320`
→ **200** con dati reali: SK Rapid Wien **favorita al 86%** (1X2 86/10/4), arbitro **Denys
Shurman 7.00 gialli/gara → "molto severo"**, **Allianz Stadion, Vienna** (28.345 posti),
H2H 1-0-0 · 5.0 gol medi. Nessun errore. Fino a 4 GET/gara, tutti cache-limitati (TTL
300 s), provider solo server-side.

### Step "/partite Cardinale (oggi-per-prima + calendario)" — 12 agosto 2026

Risolve il feedback utente: NON serve scegliere un campionato per vedere gare; default =
gare di oggi di **tutti** i campionati + calendario; blu vecchio → Cardinale.

- `src/server/iqstats/matches.ts` — `getMatchesByDate(dateIso, leagueId?)` da `/events/?date_from&
  date_to&limit=200` + `getLeaguesIndex()` (id→nome/paese da `/leagues/?limit=100`, perché la lista
  `/events/` espone solo `league_id`). Client blindato, TTL cache (gare 120 s / leghe 1 h),
  fail-closed.
- `src/components/league-select.tsx` — client `<select>` filtro lega **opzionale** (naviga a
  `?leagueId=`; elenca solo leghe con gare quel giorno).
- `src/app/partite/page.tsx` — **riscritta** in Cardinale scuro: default oggi (Europe/Rome), tutte
  le leghe, **raggruppate per competizione** (nome dall'indice), **date bar** prossimi 7 giorni
  (`?date=`), righe con orario/stato/punteggio + loghi (`VerifiedMediaImage`) → link `/match/{id}`.
  Empty onesto. searchParams `date`/`leagueId` validati.
- Placeholder `pronostici`/`database`/`giocate` — riskinnati da `.data-state` (blu) a Cardinale
  (`.oggi-backdrop` + `.oggi-empty`).
- `globals.css` — blocco `.partite-*`.

**Verifiche (12 agosto 2026):** `typecheck` + `lint` verdi. Dev :3200 `GET /partite` → **200**:
**62 gare** del giorno su più campionati (Liga Profesional, Copa Sudamericana/Libertadores,
Conference League, UEFA Super Cup, Club Friendlies…), date bar 7 giorni, dropdown con le sole
leghe presenti. Nessun errore. Provider solo server-side, cache-limitato.
Memoria applicata: `matches-default-today-all-leagues.md`.

---

## Step 3 — motore statistico (ENG-1) — 12-13 agosto 2026

**Contratto eseguibile:** [`eng-1-statistical-engine-contract.md`](eng-1-statistical-engine-contract.md).

**Decisioni bloccate (grilling, 5 domande):** seed rating dallo storico + aggiornamento
stagione corrente; prior storico dichiarato con soglia che governa etichetta/confidenza e
non l'esistenza del blocco; stato rating come artefatto generato in `scripts/` letto in
sola lettura dall'app; budget GET deciso dopo un preflight che conta; superficie UI =
sezione nel dossier `/match/[id]`, `/pronostici` valutata a risultato visto.

**Soglie per sezione (non globali):** 7 metriche squadra → 2 gare in casa + 2 in trasferta
per entrambe le squadre; statistiche arbitrali → 3 gare arbitrate in stagione corrente.
Sotto soglia il blocco resta e mostra carriera / stagione precedente etichettate, con nota
esplicita su quando arriva il dato corrente. Verdetto, `/oggi` e `/partite` invariati.

**ENG-1A — preflight (12 agosto 2026):** `scripts/engine/preflight.ts`, **59/90 GET**, max
2 req/s, nessuna statistica scaricata (conteggi dal campo `count` della lista paginata con
`limit=1`). Correzione applicata dopo il primo giro: `/leagues/{id}/season/` restituisce
`{league_id, season:{…}}`, la stagione è annidata.

Esito: 18/29 leghe hanno gare concluse, **1.578 in totale**. Di queste, 546 appartengono a
leghe (28 Nigeria 25/26, 20 Liga MX Clausura 2026) la cui stagione "corrente" secondo il
provider è **già presente nel dataset storico CAL-1**: escluderle evita GET a informazione
nulla. Backfill utile = **1.032 GET** (fascia A anno solare 809 + fascia B Europa appena
avviata 223). Undici leghe europee di punta (Premier, Serie A, Liga, Bundesliga, Ligue 1,
Championship…) hanno **0 gare concluse**: si appoggiano al prior storico fino a settembre.

Anomalia aperta, non risolta per supposizione: lega 53 Botola dichiara 63 gare concluse in
25/26 mentre CAL-1 ne conta 224 nello stesso periodo. Copertura dubbia, da verificare o
escludere prima dell'uso.

**Checkpoint umano:** approvazione del cap prima di qualunque `GET /events/{id}/stats/`.

### ENG-1B — harvest e rating (13 agosto 2026, verificato)

**Cap approvato dall'utente:** 1.100 GET, fasce A+B, duplicati esclusi, Botola inclusa con
verifica.

**Due riduzioni di scope emerse da verifica, non da stima:**

1. Leghe 26, 49, 52, 82 rimosse dall'harvest: prive di baseline calibrata CAL-3 (scartate
   dal QA CAL-2), quindi il motore non produrrebbe comunque letture. **318 GET evitati**;
   il run era gia' partito ed e' stato fermato e riavviato (riprendibile, nulla perso).
2. **Lega 53 Botola — bug di correttezza risolto.** Il provider dichiara "corrente" la
   stagione 1085 (25/26), 63 gare dal 2025-09-12 al 2026-02-25. Verifica: quella stagione
   e' **conclusa il 28 giugno 2026** ed e' gia' interamente nel seed CAL-1 (224 gare), di
   cui le 63 esposte sono un **sottoinsieme esatto** (63/63 event id in comune). Contarle
   come stagione corrente avrebbe raddoppiato quelle osservazioni e fatto scattare
   l'etichetta "stagione corrente" su dati conclusi da sei mesi. Shard rimosso, lega
   esclusa dall'harvest corrente. Il suo storico resta valido nel seed.

**Esito harvest:** 409 GET nel run finale, **714 gare** raccolte su 12 leghe, **zero gare
senza statistiche**. Totale ENG-1 su tutta la sessione ≈ 740 GET, dentro il cap.

**File nuovi:**
- `scripts/engine/preflight.ts` — conteggio ENG-1A.
- `scripts/engine/harvest.ts` — harvest riprendibile, cap e throttle a 2 req/s, filtro
  `--leagues=` per lo smoke.
- `scripts/engine/buildRatings.ts` — fase offline, nessuna rete.
- `scripts/engine/data/current/*.json` — 11 shard normalizzati (nessun payload raw).
- `scripts/engine/output/RATINGS_STATE.generated.json`, `ENGINE_REPORT.json` (325 KB).

**Modello implementato.** Il "Elo" del riferimento StatsIQ e' in realta' un rapporto
`1500 × media / baseline`: e' stato reimplementato come modello moltiplicativo esplicito
attacco/difesa centrato su 1, **ancorato alle medie reali home/away per lega** di
`LEAGUE_BASELINES.generated.ts`. Conseguenza diretta: **nessun moltiplicatore di vantaggio
casalingo inventato** entra nel codice, a differenza dell'`HOME_ADV` hardcodato del
riferimento. Campione piccolo gestito con shrinkage dichiarato (`K = 6`,
`formulaVersion = eng-1-multiplicative-shrunk-v1`): la stagione corrente e' tirata verso il
prior storico, il prior storico verso la media di lega. `null` mai convertito in zero.

**Dispersione:** si usa il D **globale** per metrica, non l'override di lega, perche'
`MODEL_VALIDATION` riporta NB globale vincente su 162/310 righe contro 46 dell'override.
Scelta registrata nell'artefatto (`leagueOverrideUsed: false`) con la motivazione.

**Verifiche eseguite:** smoke su lega 13 (12 gare, 0 errori, medie coerenti con le baseline,
`offsides` mancanti conservati come `null`); join del seed su **7.526 gare** e 460 squadre;
sanity contro la classifica reale del Brasileirao **senza che il motore l'abbia mai vista** —
Flamengo (2ª) difesa tiri 0.908, Palmeiras (1ª) 0.972, Chapecoense (20ª) 1.212, ordinamento
corretto; neopromossa Chapecoense con campione storico 0 che ricade sulla sola stagione
corrente, senza prior inventato.

**Limite dichiarato:** 1.779 gare storiche restano senza team id perche' appartengono alle 6
leghe prive di contratti CAL-4B; sono le stesse 6 senza baseline calibrata, quindi il motore
non le servirebbe comunque. Nessuna lega servibile ha seed incompleto.

### ENG-1C — modulo server e sezione dossier (13 agosto 2026, verificato)

**Artefatto deployabile.** `.vercelignore` esclude `scripts/` dal build: l'app non puo'
leggere ne' i rating ne' le costanti di calibrazione in produzione. `buildRatings.ts` ora
include nell'artefatto anche le **baseline usate** (medie reali home/away per lega/metrica)
e la **dispersione globale** team/match con la soglia di fallback, e ne scrive una copia in
`apps/web/src/server/iqstats/data/ratings-state.generated.json`. Il modulo server la importa
staticamente: **nessuna costante di modello ricopiata nel sorgente**, nessun accesso a rete.
Rigenerazione offline a zero GET: numeri identici alla run precedente (15.052 osservazioni
storiche, 1.302 correnti, 460 squadre, 23 leghe, 181 arbitri).

**`apps/web/src/server/iqstats/stat-engine.ts` (NUOVO, server-only).** PMF Binomiale
Negativa da media e dispersione (`p = 1/D`, `r = μ/(D−1)`) calcolata in spazio logaritmico
con `lgamma` di Lanczos in TypeScript puro, senza dipendenze. Fallback a Poisson sotto
`poissonFallbackThreshold` **letto dall'artefatto** (1.05). Granularita' separate: mercati
per squadra usano il D `team`, il totale gara il D `match`; non si mescolano.
`λ_home = baselineHome × attacco(casa) × difesa(trasferta)`, simmetrico per away,
`λ_total = λ_home + λ_away`. Fail-closed con motivo esplicito: `invalid_input`,
`league_not_calibrated`, `team_rating_missing`, `no_metric_covered`; le metriche prive di
baseline finiscono in `missingMetrics` invece di essere stimate.

**Soglie di sezione applicate alla lettera.** Squadre: etichetta `stagione corrente` solo
con ≥2 casa e ≥2 trasferta per **entrambe**; sotto soglia il blocco resta, con avviso
`dati stagione precedente` e la nota che dichiara quando arriva il dato corrente. Arbitro:
sopra le 3 gare arbitrate il dato corrente e' esposto e modula **solo** falli e cartellini
(`eng-1-referee-blend-v1`, peso `n/(n+6)`, fattore limitato a 0.75–1.25); sotto soglia
`yellowsPerMatch`/`foulsPerMatch` restano `null` e vale il pannello di carriera esistente.

**UI.** `apps/web/src/components/stat-engine-section.tsx` rende la sezione "Giocate
statistiche" nel dossier, sotto il Verdetto, in identita' Cardinale (token `--card-*`,
classi `.dossier-panel`/`.dossier-src` riusate, nuove `.engine-*` mobile-first con
`overflow-wrap` sui nomi squadra). Il componente non calcola nulla: riceve l'envelope.

**Verifiche.** `typecheck` e `lint` verdi. Self-test 9/9 (`npm run test:stat-engine`):
`lgamma` su valori noti, massa della PMF ≈ 1, media e varianza ricostruite (`Var = D·μ`),
convergenza NB → Poisson per D → 1, complementarita' Over/Under, arbitro che tocca solo
falli e cartellini, fail-closed sui tre motivi. Smoke HTTP reale su `:3200`:
`/match/7213` (Santos–Athletico, Brasileirao) HTTP 200 con `Stagione corrente ·
Brasileiro Serie A 2026`, tiri 13.5 / 10.4, tendenza arbitrale su 16 gare;
`/match/1452` (Lecce–Genoa, Serie A) HTTP 200 con `Dati stagione precedente` e la nota
"2 casa + 2 trasferta, ora 0/0". Verdetto, `/oggi` e `/partite` non sono stati toccati.

**Iterazione dopo la prima visione dell'utente (13 agosto 2026).** La sezione mostrava solo
la faccia Over, quindi non si leggeva da che parte pendesse la stima. Ora ogni riga espone
**Over e Under** con il lato più probabile in evidenza. Due correzioni di sostanza emerse
qui: (1) la linea non è più quella immediatamente sopra il valore atteso — che avrebbe reso
l'Under favorito quasi sempre, un segnale finto — ma la **più vicina all'atteso**, che cade
da entrambi i lati; (2) quando le due percentuali mostrate coincidono (es. 50%/50%) **nessun
lato viene evidenziato**, perché sarebbe un segnale che il modello non dà. Il testo resta
privo di linguaggio di puntata: "lettura probabilistica, non un consiglio di giocata".
Verificato su `/match/1452`: Under in evidenza su tiri, falli, corner, parate e fuorigioco,
Over sui cartellini, nessuna evidenza sui tiri in porta a 50/50.

**Linee per squadra (13 agosto 2026).** Su richiesta dell'utente ogni metrica è ora letta
**tre volte** — squadra di casa, squadra in trasferta, totale gara — ciascuna con valore
atteso, linea più vicina all'atteso e le due facce. Le linee per squadra usano la
dispersione `team`, il totale quella `match`: le granularità restano separate come da
contratto. `floor(atteso) + 0.5` è per costruzione la linea .5 più vicina, quindi la regola
è la stessa per tutte e tre le voci. Verificato su `/match/7213`.

**Scala a cinque soglie (13 agosto 2026).** Su richiesta dell'utente ogni voce espone ora
**cinque soglie** — la centrale più due per lato — invece di una sola. `StatLine` porta
`isCentral`; `homeLines`/`awayLines`/`totalLines` sostituiscono le linee singole. Le soglie
sotto 0.5 vengono **omesse**, non spostate: una metrica con atteso basso mostra meno di
cinque gradini invece di soglie inesistenti. Ogni gradino mostra il **lato più probabile**
(l'altro è il complemento a 100%, dichiarato in nota) e a parità di percentuale mostrate
non indica alcun lato. Il self-test aggiunge ordinamento della scala, monotonia decrescente
dell'Over, unicità della centrale e verifica che la centrale sia davvero la .5 più vicina
all'atteso: 9/9 verdi. Verificato su `/match/7213`: Santos tiri 13.5 →
11.5 O 61% · 12.5 O 53% · **13.5 U 54%** · 14.5 U 61% · 15.5 U 68%.

**Nota d'ambiente:** durante il lavoro il dev server ha iniziato a rispondere HTTP 500 su
**tutte** le rotte con `Module not found: Can't resolve
'@vercel/turbopack-next/internal/font/google/font'`. Non dipende dal codice (rete verso
Google Fonts verificata a 200): è cache Turbopack corrotta. Rimedio: fermare il server,
rimuovere `apps/web/.next`, riavviare. Dopo la pulizia, HTTP 200.

**Da completare al checkpoint umano:** QA visuale a 375/768/1024/1440 px, tastiera,
contrasto e `prefers-reduced-motion` sul browser dell'utente; decisione su `/pronostici`.
