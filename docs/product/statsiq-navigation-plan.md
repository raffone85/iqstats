# StatsIQ — piano strutturale e navigazione

Data: 10 agosto 2026. Nome app: **StatsIQ**. Identità visiva: **Il Cardinale**
(fondo caldo, oxblood + oro + avorio, serif editoriale, glow oro misurato, sfondi stadio).
Principio: **mobile-first**, dati **reali** (DATA-1 + provider server-side), ogni sezione
**"verdetto in alto → dettaglio a richiesta"**. Nessun contenuto simulato.

## Navigazione primaria (5 destinazioni, elegante e non affollata)

| Voce | Rotta | Scopo | Endpoint principali |
| --- | --- | --- | --- |
| **Oggi** | `/` | Cruscotto del giorno: migliori eventi, pronostici consigliati, live, in evidenza | `get_predictions`, `search_matches`, `get_live_scores` |
| **Partite** | `/partite` | Gare del giorno "oggi per prima", per competizione → dossier | DATA-1 (`listMatchesByDate`), `get_standings` |
| **Pronostici** | `/pronostici` | Modelli ML, value-scanner, giocate statistiche spiegate | `get_predictions`, quote, statistiche |
| **Database** | `/database` | Campionati, squadre, giocatori, arbitri, **stadi**, TV | catalogo DATA-1 + `get_team/player/venue/...` |
| **Le mie giocate** | `/giocate` | Schedine salvate, track-record, calibrazione | Supabase (utente) + settle da provider |

Secondarie (non primarie): **Metodo** (trasparenza fonti/modelli), **Piani** (`/account/billing`),
**Accedi**. World Cup come modulo stagionale quando pertinente.

## Dossier gara `/match/[id]` — profondità progressiva

Testata persistente con **sfondo stadio** (venue), poi tab per profondità:
`Verdetto → Mercati/Quote → Statistiche (xG, shotmap) → Formazioni → Arbitro & Stadio → Analyst`.
Ogni tab: sintesi leggibile in alto, dettaglio sotto. Sezioni condizionali alla copertura dati.

## Firma visiva che "fa la differenza"

- **Identità Il Cardinale** coerente su tutte le pagine (non un tema generico).
- **Sfondo stadio reale** scurito dietro testate e dossier (dal venue dell'API, via proxy).
- **Tipografia editoriale** serif + numeri mono, **provenienza come citazione**.
- **Movimento misurato**: scroll-reveal + glow oro, mai rumore; reduced-motion rispettato.
- **Loghi reali** squadra/competizione dal proxy interno; monogramma solo come fallback.

## Sequenza di costruzione (fasi verificabili)

1. **Core** — shell StatsIQ + identità Cardinale + navigazione; `/partite` "oggi per prima"
   (DATA-1 reale + loghi); `/match/[id]` dossier "verdetto prima".
2. **Oggi** — cruscotto migliori eventi del giorno + pronostici consigliati; sezione live.
3. **Pronostici** — modelli ML spiegati, value-scanner, giocate statistiche.
4. **Database** — campionati, squadre, giocatori, arbitri, stadi, TV (viste dettaglio).
5. **Le mie giocate** — schedine + track-record; gating piani reale.
6. **Arricchimenti & rifinitura** — shotmap/xG, movimenti quote, live avanzato, PWA, SEO.

Ogni fase: contratto dati → UI → `typecheck`/`lint` → QA responsive (375/768/1024/1440),
tastiera, contrasto, reduced-motion. Aggiornamento `tasks/todo.md` solo dopo le verifiche.

## Decisioni aperte

- **Rinominare** il prodotto in "StatsIQ" nella UI (wordmark) e, in un secondo momento,
  nel codebase (`iqstats-web` → invariato tecnicamente finché non serve). Da confermare.
- Sfondo stadio: confermare la sorgente immagine del venue (endpoint/campo) in Fase 1.
- Perimetro pronostici: mostrare i pronostici del provider come dato osservato (fonte +
  campione), senza spacciarli per certezze; nessun consiglio finanziario personalizzato.

## Aggiunte del 10 agosto (indicazioni utente)

**Gerarchia "dashboard-first" (voce Oggi).** La home è il vertice della gerarchia: aggrega
le gare del giorno e ne estrae i **migliori segnali** (motore segnali ispirato a
`lib/dashboard/match-hooks.ts` di StatsIQ: value, gol/BTTS, favorita, **arbitro**, derby,
equilibrio). Ogni card gara mostra il segnale più forte + verdetto sintetico → apre il
dossier. Da lista → dettaglio → profondità.

**Sfondo stadio per gara (animato).** Quando l'endpoint venue restituisce la foto dello
stadio della squadra di casa, applicarla come **sfondo scurito/atmosferico** dietro:
(a) la gara del giorno in evidenza sulla dashboard; (b) la testata di **ogni** dossier
`/match/[id]`. Ingresso **ben animato** (fade/parallax misurato, glow oro; reduced-motion
rispettato). Via proxy interno lato server; fallback elegante se l'immagine manca.

**Motore impatto arbitrale.** Dagli endpoint arbitri: media **gialli/falli per partita**
(con caveat carriera vs stagione, campione dichiarato). L'arbitro (a) è un **segnale**
in dashboard ("Arbitro esigente → rischio ammonizioni"); (b) **orienta i mercati
disciplina** (cartellini/falli): il λ disciplina della gara si combina con la tendenza
dell'arbitro (blend trasparente, versione formula esplicita), mai come certezza. Sezione
"Arbitro & Stadio" nel dossier. Riferimento: `refereeImpactEngine` di StatsIQ.

**Nota di scopo.** Prendere ispirazione da Il Cardinale (già parzialmente costruito) ma
puntare a un prodotto **più completo e migliore**: identità coerente ovunque, letture
"verdetto prima", trasparenza dei dati come brand.
