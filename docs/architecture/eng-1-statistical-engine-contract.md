# ENG-1 — Contratto eseguibile del motore statistico IQstatS

Data: 12 agosto 2026 · Stato: **proposta approvata nelle decisioni, in attesa del gate di
esecuzione**. Nessun codice scritto, nessun harvest eseguito.

Riferimenti: [piano migrazione](cardinale-frontend-migration-plan.md) ·
[changelog](cardinale-migration-CHANGELOG.md) ·
[catalogo endpoint](statsiq-football-endpoint-catalog.md) ·
output calibrazione in `scripts/calibration/output/`.

## 1. Obiettivo

Produrre letture statistiche proprietarie per sette metriche osservate
(tiri, tiri in porta, falli, cartellini gialli, corner, fuorigioco, parate) tramite
rating per metrica → λ attacco/difesa → **Binomiale Negativa** con dispersione
**calibrata da questo progetto**, e mostrarle come sezione "Giocate statistiche" nel
dossier `/match/[id]`.

Il motore è il differenziatore del prodotto: il modello gol/1X2 resta quello del provider
(`dc-blend-v1`) ed è già in produzione nel Verdetto.

## 2. Decisioni bloccate (grilling del 12 agosto 2026)

| # | Decisione | Esito |
| --- | --- | --- |
| Q1 | Fonte dei rating | Seed offline dallo storico + aggiornamento con la stagione corrente |
| Q2 | Copertura Europa prima di fine settembre | Prior storico **dichiarato**; la soglia governa etichetta e confidenza, non l'esistenza del blocco |
| Q3 | Stato dei rating | Artefatto generato in `scripts/`, app in **sola lettura** |
| Q4 | Budget GET | **Preflight che conta prima**, cap approvato dopo, con i numeri reali |
| Q5 | Superficie UI | Prima il dossier `/match/[id]`; `/pronostici` valutata a risultato visto |

### Soglie di campione — sono **per sezione**, non globali

- **Sette metriche squadra:** dato di stagione corrente solo quando **entrambe** le
  squadre hanno **≥2 gare in casa e ≥2 in trasferta** concluse nella stagione corrente.
- **Statistiche arbitrali:** dato di stagione corrente solo con **≥3 gare arbitrate**
  nella stagione corrente.
- **Tutto il resto invariato:** Verdetto 1X2, Over 2.5, BTTS, xG, H2H, anagrafica
  arbitro/stadio, `/oggi`, `/partite`. ENG-1 non tocca queste superfici.

### Stato sotto soglia (richiesta esplicita dell'utente)

Il blocco **non sparisce**. Sotto soglia mostra, a scopo informativo:

1. il dato di **carriera** (arbitro) o di **stagione precedente** (squadre), etichettato
   in modo esplicito come tale;
2. una **tabella separata** con avviso informativo `dati stagione precedente`;
3. una nota che dichiara **quando** arriva il dato di stagione corrente: dalla terza gara
   arbitrata per l'arbitro; al raggiungimento di 2 casa + 2 trasferta per le squadre.

Sopra soglia l'etichetta passa a `stagione corrente` e la confidenza sale.

## 3. Contratto dati

### 3.1 Seed storico — **zero GET**

| Input | Percorso | Contenuto |
| --- | --- | --- |
| Metriche team-gara | `scripts/calibration/data/dataset.csv` | 18.610 righe, 9.305 gare, 29 leghe, dal 2025-02-22 al 2026-06-28 |
| Chiave di join | `scripts/calibration/context/data/2026-07-23/events/{leagueId}/calibration.json` | `eventId → homeTeamId / awayTeamId` |
| Baseline per lega | `scripts/calibration/output/LEAGUE_BASELINES.generated.ts` | media e SD **separate home/away** per lega × metrica + `homeAwayRatio` |
| Dispersione | `scripts/calibration/output/MARKET_DISPERSION.generated.ts` | D globale e per lega, granularità `team` **e** `match` |

`dataset.csv` è indicizzato per **nome squadra**; i contratti CAL-4B forniscono i
`team_id`. Il join avviene su `match_id = eventId` + `side`, mai per stringa.

Righe con metrica `null` non entrano nell'aggiornamento di quella metrica e **non
diventano zero**.

### 3.2 Aggiornamento stagione corrente — GET misurati, non stimati

| Passo | Endpoint | Costo |
| --- | --- | --- |
| Stagione corrente per lega | `GET /leagues/{id}/season/` | 1 per lega, mai hardcodare la stagione |
| Gare concluse | `GET /events/?league_id&season_id&status=finished&limit=200` | 1-3 per lega |
| Metriche per gara | `GET /events/{id}/stats/` | **1 per gara conclusa** |
| Log arbitro | `GET /referees/{id}/matches/` | 1 per arbitro coinvolto |

Disciplina: massimo **2 richieste/secondo**, retry con backoff, manifest riprendibile,
nessun payload raw persistito, nessuna scrittura verso il provider.

## 4. Matematica

### 4.1 Rating per metrica

Ogni squadra ha, per ciascuna delle sette metriche, un rating **attacco** (quanto ne
produce) e **difesa** (quanto ne concede), aggiornato in modo sequenziale sulle gare
concluse in ordine cronologico. Il seed storico inizializza i rating; la stagione corrente
li aggiorna.

### 4.2 λ ancorato alle baseline calibrate

```
λ_home = baselineHome(lega, metrica) × forzaAttacco(casa) × debolezzaDifesa(trasferta)
λ_away = baselineAway(lega, metrica) × forzaAttacco(trasferta) × debolezzaDifesa(casa)
λ_total = λ_home + λ_away
```

`baselineHome` e `baselineAway` sono le **medie reali osservate** in
`LEAGUE_BASELINES.generated.ts`, separate per lega. Il vantaggio casalingo è quindi
**misurato**, non un moltiplicatore inventato: nessun `HOME_ADV` hardcodato entra nel
codice. Una lega senza baseline calibrata **non produce lettura**: dichiara copertura
assente.

### 4.3 Binomiale Negativa con dispersione calibrata

Data media `μ` e rapporto varianza/media `D` letto dagli artefatti CAL-3:

```
p = 1 / D            r = μ / (D − 1)
P(X = k) = Γ(k + r) / (Γ(r) · k!) · p^r · (1 − p)^k
```

- `D ≤ poissonFallbackThreshold` (1.05, dal file) → **Poisson**, che è il limite della NB
  per D→1. Nessuna soglia riscritta a mano: si legge dall'artefatto.
- Mercati **per squadra** → dispersione granularità `team`; mercati **totale gara** →
  granularità `match`. Le due non si mescolano.
- **Si usa il D globale per metrica, non l'override di lega.** Motivo tracciabile:
  `MODEL_VALIDATION.generated.ts` riporta che su 310 righe valutate fuori campione la NB
  globale vince 162 volte, Poisson 102 e l'override di lega **solo 46**. L'override di
  lega resta negli artefatti ma non entra nel motore.
- I valori numerici (D, soglie, baseline) sono **letti dagli artefatti generati**, mai
  ricopiati nel sorgente.

### 4.4 Impatto arbitrale

La tendenza arbitrale modula esclusivamente le metriche **disciplina** (falli, cartellini)
con un blend trasparente e versionato, mai come certezza, e solo al superamento della
soglia di 3 gare in stagione corrente. Sotto soglia si applica il comportamento della
sezione 2.

## 5. Artefatti prodotti

```
scripts/engine/                       ← nuovo, isolato come scripts/calibration/
  buildRatings.ts                     ← seed offline + aggiornamento, riprendibile
  output/
    RATINGS_STATE.generated.json      ← rating per squadra × metrica, con provenienza
    ENGINE_REPORT.json / .md          ← copertura, esclusioni, campioni, motivi
apps/web/src/server/iqstats/
  stat-engine.ts                      ← server-only, SOLA LETTURA dell'artefatto
```

Ogni record dell'artefatto porta `schemaVersion`, `formulaVersion`, `generatedAt`,
`source`, `sampleSize`, `season` e i motivi di ogni assenza.

L'app **non scrive mai** l'artefatto e **non chiama il provider** per calcolare i rating:
il modulo server legge il file e restituisce envelope con copertura esplicita, fail-closed.

## 6. Budget GET e checkpoint

**ENG-1A — preflight che conta (autorizzato con Q4).** Solo `/leagues/{id}/season/` e le
liste `/events/?…&status=finished`: nessuna statistica scaricata. Tetto **90 GET**, 2
richieste/secondo. Produce il numero **esatto** di gare concluse per lega e quindi il costo
reale del backfill.

**Checkpoint umano.** Si presenta il conteggio e si concorda il cap. Nessun
`/events/{id}/stats/` viene chiamato prima di questa approvazione.

**ENG-1B — backfill e aggiornamento.** Entro il cap approvato, riprendibile, con manifest.

## 7. Criteri di accettazione

- [ ] Il seed storico gira a **zero GET** e riconcilia squadre/gare senza join per stringa.
- [ ] Nessuna costante inventata nel sorgente: baseline, D e soglie provengono dagli
      artefatti CAL-3/CAL-4.
- [ ] Una lega senza baseline calibrata dichiara copertura assente, non stima.
- [ ] `null` resta `null`: mai convertito in `0`, mai imputato.
- [ ] Le soglie di sezione si comportano come da §2, con etichetta, avviso e nota
      "disponibile da…" verificabili a schermo.
- [ ] Il Verdetto, `/oggi` e `/partite` restano **byte-identici** nel comportamento.
- [ ] Nessun token, host provider o payload raw raggiunge il client o i log.

## 8. Verifica

`typecheck` + `lint` verdi · self-test della PMF Binomiale Negativa (somma delle
probabilità ≈ 1; convergenza a Poisson per D→1; media e varianza ricostruite entro
tolleranza) · riconciliazione indipendente del seed su una lega · smoke HTTP reale su
`:3200` · QA a 375/768/1024/1440 px, tastiera, contrasto, `prefers-reduced-motion` ·
grep-gate: nessun host provider fuori dai moduli server · aggiornamento del changelog.
Poi **fermarsi e mostrare** all'utente su `http://localhost:3200/match/{id}`.

## 9. Vincoli e azioni vietate

- Provider **solo server-side**; token esclusivamente da `.env.local`, mai in output.
- Nessuna scrittura sul database remoto, nessuno slice DATA nuovo: ENG-1 non ne dipende.
- Non si modificano gli expected: `expectedAdjustmentAllowed` resta `false`. Gli indici
  di contesto CAL-4C possono solo **ridurre** la confidenza o allargare la zona di
  incertezza, mai correggere una media.
- Nessun linguaggio di certezza, nessuna istruzione di puntata, nessun link bookmaker.
- I flag `allowedForAppIntegration=false` negli artefatti generati sono **stato storico al
  momento della generazione**; il gate umano del 1 agosto 2026 autorizza il consumo
  esclusivamente server-side degli output CAL-4 (`docs/workflow.md`, Fase 2). Il consumo
  qui descritto è di sola lettura e rientra in quell'autorizzazione.
