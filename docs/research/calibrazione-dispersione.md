# TASK — Calibrazione MARKET_DISPERSION su dati storici reali

## Contesto
PWA IQstatS (React 18 + Vite + TypeScript strict + Tailwind v4). Tutte le chiamate API
passano da `bsdClient.ts` (token in env, MAI in chiaro nel codice o nei log).
Il modulo `/lib/lines` calcola P(Over)/P(Under) con Binomiale Negativa e ha bisogno
del parametro di dispersione D = varianza/media per metrica, oggi impostato su valori
pilota (n=12 gare). Obiettivo: ricalibrarlo su un campione ampio.

## Regole non negoziabili
- Solo script di analisi in `/scripts/calibration/` — NESSUNA modifica all'app di produzione.
- Token sempre via env/bsdClient.ts. Il nome del provider non compare in output destinati alla UI.
- Mai inventare o imputare valori mancanti: escludere e segnalare.
- Procedi a step con checkpoint: 0 → conferma → A → conferma → B → conferma → C → D.
- I "Fatti verificati" sotto sono una baseline osservata da un altro agente il
  2026-07-21: confermali con la ricognizione del Compito 0 prima di fidarti;
  in caso di conflitto vince ciò che osservi tu dall'API reale (documentandolo).

## Fatti verificati sull'API (2026-07-21, non ridiscutere)
- Endpoint leghe: restituisce **72 leghe, paginate** (limit=50, campo `next` da seguire).
- Molte "leghe" sono coppe/qualificazioni/amichevoli: per la calibrazione usare SOLO
  i campionati regolari (es. Serie A id=4, Premier id=1, Bundesliga id=5, Ligue 1 id=6,
  Champions id=7 opzionale come categoria separata). Escludere FA Cup, Coppa Italia,
  qualificazioni mondiali, amichevoli: dinamiche diverse che sporcano la dispersione.
- Ricerca gare: filtri league, status=finished, date_from/date_to (YYYY-MM-DD).
  La Serie A ha ~40 gare finite/mese nei mesi pieni.
- Statistiche reali per gara: endpoint shotmap dell'evento → oggetto `stats.home` /
  `stats.away` con i campi ESATTI:
  `total_shots`, `shots_on_target`, `fouls`, `corner_kicks`, `yellow_cards`,
  `goalkeeper_saves`, `offsides`.
- ⚠️ `offsides` è ASSENTE in ~8% delle gare: applicare la regola "escludi la metrica
  dal calcolo di quella gara"; se assente in >20% del campione di una lega, escludere
  la metrica per quella lega e segnalarlo nel report.

## COMPITO 0 — Ricognizione diretta dell'API (PRIMA di tutto)
Prima di scrivere l'harvester, esplora l'API dal vivo usando il token via env
(`bsdClient.ts` o richieste dirette con lo stesso header di autenticazione):
1. Interroga l'endpoint delle leghe e salva la risposta grezza (sanificata: MAI
   il token nei file o nei log) in `/scripts/calibration/discovery/leagues.json`.
2. Prendi 2-3 gare finite di leghe diverse e salva le risposte complete dello
   shotmap in `/scripts/calibration/discovery/sample-match-*.json`.
3. Confronta gli schemi reali con i "Fatti verificati" qui sotto: conferma nomi
   campi, paginazione, formati data. Se trovi discrepanze o campi utili in più
   (es. statistiche extra, endpoint più efficienti tipo un batch/stats senza
   shotmap completo), documentale in `/scripts/calibration/discovery/NOTES.md`
   e adatta i compiti successivi di conseguenza.
4. Se esiste un endpoint che restituisce le sole statistiche di squadra SENZA
   il payload shotmap/momentum/posizioni (molto più leggero), preferiscilo
   per l'harvester: riduce traffico e tempi.
5. Esplora anche gli endpoint su GIOCATORI, ALLENATORI e MERCATO (esistono:
   dettaglio giocatore con valore di mercato e trasferimenti; dettaglio
   allenatore con profilo tattico, moduli e stile di pressing; dettaglio
   squadra con rosa attuale). Documenta in NOTES.md quali campi sono
   disponibili e affidabili: servono per il Compito D.
6. Cerca rotte NEWS / CALCIOMERCATO / contenuti editoriali (l'MCP espone
   social items con tweet ufficiali, highlights ed editoriali; l'API REST
   potrebbe avere endpoint dedicati a notizie, trattative, infortuni).
   Per ciascuna documenta: struttura, filtri disponibili (per squadra/lega/
   data), e se le notizie di mercato/infortuni sono STRUTTURATE (campi
   macchina-leggibili) o solo testo libero. NON integrarle nel modello:
   mappale soltanto — testo libero = solo UI/contenuti; dati strutturati =
   candidati per il Compito D (stabilità rosa) e per flag infortuni.
Checkpoint: presenta NOTES.md e attendi conferma prima di passare al Compito A.

## COMPITO A — Harvester dataset
Script `/scripts/calibration/buildDataset.ts`:
1. Recupera tutte le leghe (gestendo la paginazione) e filtra i campionati regolari.
2. Per ogni lega: gare finished dell'ultima stagione completa (target ≥200 gare/lega,
   minimo assoluto 50 — sotto, marca la lega come "campione insufficiente").
   Campiona su TUTTE le giornate disponibili, non solo le ultime (bias fine stagione).
3. Per ogni gara: estrai i 7 campi per squadra (home/away) dallo shotmap.
4. Rate limiting: max ~2 richieste/secondo, retry con backoff su errori 5xx,
   salvataggio incrementale (riprendibile se interrotto).
5. Output: `/scripts/calibration/data/dataset.csv` con schema:
   `league_id,match_id,date,team,side,shots,sot,fouls,corners,yellows,saves,offsides`
   (celle vuote per campi assenti, mai 0 al posto di null).

## COMPITO B — Calcolo dispersione + medie di lega casa/trasferta
Script `/scripts/calibration/analyze.ts` che dal CSV calcola, per lega e globale:
- μ, SD, D = varianza campionaria/μ, sia a livello SQUADRA (una riga per team-gara)
  sia a livello MATCH (somma home+away).
- **Split casa/trasferta**: per ogni lega × metrica, μ, SD e D calcolati
  SEPARATAMENTE per side=home e side=away (i valori casa e trasferta differiscono
  sistematicamente: servono come ancore per lo shrinkage degli expected in
  `/lib/lines`, dove lo split della singola squadra su ~5 gare è instabile).
- Calcola anche il rapporto home/away per metrica (es. falli casa vs trasferta):
  utile come fattore correttivo di default quando una squadra ha pochi dati.
- Escludi metriche con >20% di gare mancanti (segnala nel report).
- Output 1: tabella leggibile in console (per lega × metrica × side: n, μ, SD,
  D_squadra, più D_match sul totale).
- Output 2: file `/scripts/calibration/output/MARKET_DISPERSION.generated.ts` con la
  costante pronta, commenti con n gare e data, e questa regola: se D ≤ 1.05 → valore 1.00
  (fallback Poisson, gestito da dispersionToSize che restituisce null).
- Output 3: file `/scripts/calibration/output/LEAGUE_BASELINES.generated.ts` con,
  per lega × metrica: `{ home: { mean, sd }, away: { mean, sd }, match: { mean, sd } }`
  — le ancore di lega per lo shrinkage bayesiano degli expected.

## COMPITO C — Sanity check contro il pilota
Confronta i D di Serie A con i valori pilota reali (12 gare, maggio 2026):
tiri D_sq≈2.33 · tiri in porta≈1.40 · falli≈0.97–1.20 · corner≈1.25 ·
cartellini≈0.45–0.64 (sotto-disperso, atteso <1) · parate≈1.36–1.62.
E con la letteratura: corner Serie A ≈1.25 (Yip et al. 2024), cartellini <1
(Philipson 2026). Se una metrica devia di >0.5 dal pilota E dalla letteratura,
segnalala come sospetta invece di scriverla nella costante.

## COMPITO D — Indici di contesto: rosa, mercato, allenatore
Usando gli endpoint giocatori/allenatori/squadre esplorati al Compito 0, script
`/scripts/calibration/contextIndex.ts` che per ogni squadra dei campionati
regolari calcola A INIZIO STAGIONE (e aggiornabile):
1. **Indice di stabilità rosa**: % del valore di mercato totale ceduto e
   acquistato nell'ultima finestra; conteggio titolari usciti/entrati (titolare =
   presente nelle average positions di ≥60% delle gare della stagione precedente).
   Output: `squadStability` 0–1 (1 = rosa confermata).
2. **Flag cambio allenatore** + delta profilo tattico: se il nuovo tecnico ha
   stile di pressing/modulo molto diverso dal precedente (dai campi del dettaglio
   allenatore), flag `tacticalShift: true`.
3. **Baseline neopromosse**: estendi il dataset alla stagione precedente e
   calcola il profilo medio delle squadre alla prima stagione nella lega
   (per metrica: μ e SD casa/trasferta). Output in LEAGUE_BASELINES come
   voce `promoted`.
REGOLA D'USO (da rispettare, non reinterpretare): questi indici NON modificano
direttamente gli expected — alimentano il sistema di CONFIDENZA di /lib/lines:
squadStability bassa o tacticalShift → cap alla confidenza (mai "Alta"),
badge "regime incerto", zona no-bet allargata. Un'eventuale promozione a
correttori degli expected va PRIMA validata nel backtest (misurare se l'indice
ha potere predittivo sull'errore del modello), mai applicata a sentimento.
Output: `/scripts/calibration/output/SQUAD_CONTEXT.generated.ts`.
1. dataset.csv completo
2. Tabella per-lega in console/markdown (con split casa/trasferta)
3. MARKET_DISPERSION.generated.ts (globale + oggetto opzionale per-lega, attivando
   il valore per-lega solo se |D_lega − D_globale| > 0.10)
4. LEAGUE_BASELINES.generated.ts (medie/SD casa, trasferta e match per lega ×
   metrica: le ancore per lo shrinkage degli expected, inclusa la voce
   `promoted` con il profilo medio delle neopromosse)
5. SQUAD_CONTEXT.generated.ts (stabilità rosa, flag cambio allenatore/shift
   tattico per squadra — alimenta la confidenza, non gli expected)
6. Report breve: n gare per lega, metriche escluse, anomalie, rapporti home/away
