# Architettura proposta

## Principio

Separare acquisizione dati, normalizzazione, calcolo e presentazione. Il client usa solo l'API dell'app; i provider esterni e le credenziali restano server-side.

```text
Provider BSD e altre fonti autorizzate
    |
    v
API gateway / adapter --> validazione --> database / cache
    |                                      |
    |                                      v
    +--> calcoli condivisi <--------- snapshot quote e statistiche
                    |
                    v
              API dell'app
                    |
                    v
       dashboard di selezione + dettaglio esplicativo
```

## Collegamento con la struttura osservata

La mappatura di riferimento non viene trattata come una prescrizione tecnica. Fornisce una separazione funzionale che IQstatS implementa con componenti propri:

| Livello osservato | Responsabilita in IQstatS | Confine tecnico |
| --- | --- | --- |
| Navigazione per segnali | definire categorie, filtri e ordinamenti | UI + query API |
| Dashboard partita | mostrare metadati, stato fonte, segnali e mercati disponibili | API feed normalizzato |
| Selezione gara | mantenere l'identificativo e il contesto del filtro | routing + contratto fixture |
| Dettaglio riepilogo | spiegare quote, forma, classifica e storico | API dettaglio + snapshot |
| Schede statistiche | rendere confrontabili gruppi omogenei di dati | endpoint/modello statistiche |
| Insight e anomalie | calcolare valori riproducibili e tracciabili | motore calcoli versionato |

Questo permette alla dashboard di svolgere il ruolo di scrematura e al dettaglio quello di spiegazione, senza dipendere dalla struttura interna del prodotto di riferimento.

## Domini dati

- `competition`, `season`, `team`, `fixture`;
- `odds_snapshot`, `market_line`, `price_movement`;
- `team_stat_snapshot`, `form_snapshot`, `head_to_head`;
- `derived_metric`, `signal`, `model_version`.

## Contratti principali

La matrice operativa dei read model MVP, con stato dell'evidenza e comportamento dei
dati mancanti, è in `docs/architecture/mvp-data-contract-matrix.md`.

- Il provider e adattato in modelli interni, mai esposto direttamente alla UI.
- Le statistiche mantengono `source`, `capturedAt`, `sampleSize` e `missingFields`.
- Le metriche derivate mantengono `formulaVersion` e periodo usato.
- Le quote mantengono timestamp, bookmaker e mercato normalizzato.
- Ogni endpoint puo dichiarare copertura parziale: assenza dati, ritardo di aggiornamento e campo non supportato non devono apparire come zeri o valori certi.

## Persistenza e cache

Supabase è parte dell'architettura di prodotto come sistema di record per Auth,
profili, dati applicativi, catalogo piani, stato degli abbonamenti ed entitlement.
Stripe è il sistema di record dei pagamenti; il database conserva soltanto lo stato
necessario e verificato tramite webhook firmati e idempotenti.

La prima integrazione live dei dati calcistici resta distinta: gateway stateless,
`Cache-Control: no-store` e TTL 0. Persistenza identità/billing non autorizza cache o
snapshot provider. Cache a breve durata per gare e snapshot persistenti per analisi,
audit e backtest richiedono ancora il gate APP-3 specifico del dominio dati.

## Pagamenti ed entitlement

- Quattro piani Stripe compongono il catalogo commerciale IQstatS.
- Ogni piano abilita un insieme esplicito e versionato di funzionalità tramite
  `features` e `plan_features` in Supabase.
- Lo stato effettivo per utente è rappresentato da entitlement con provenienza,
  validità e scadenza; la matrice funzionalità/piano deve ricevere conferma umana prima
  del go-live.
- Checkout e Customer Portal vivono nel boundary Node/Next.js server-side.
- Il webhook Stripe è l'unica autorità che attiva, rinnova, riduce o revoca accessi.
- La UI può spiegare o nascondere una funzione, ma ogni route protetta verifica
  nuovamente l'entitlement lato server.

## Decisioni validate e ancora aperte

Validate da CAL-0, APP-0D, APP-1 e APP-2:

- ricerca gare con `league_id`, data e stato, dettaglio gara e campionati brasiliani;
- statistiche osservate, classifica e H2H;
- confronto quote su tutti i mercati presenti nel campione, con prezzo corrente,
  osservazione precedente, ultimo movimento e timestamp espliciti;
- apertura e chiusura quote non sono esposte e restano indisponibili; l'ultimo prezzo
  di una gara conclusa non viene reinterpretato come closing.
- tipi condivisi e normalizzatori puri in `packages/shared`, verificati in strict mode
  su fixture sanificate e collegati soltanto al layer server dell'app;
- sette route dinamiche IQstatS con input limitati, errori normalizzati, timeout,
  paginazione esplicita e risposte `no-store`; match `7198` verificato live attraverso
  fonte, normalizzatore e API app.

Ancora aperte prima delle fasi pertinenti:

- frequenza di refresh per ciascun dominio e politica di fallback (APP-3);
- forma dettagliata con date, avversari e split casa/trasferta, non coperta dalla sola
  sequenza W/D/L presente in classifica.

Completati il 2 agosto 2026: progetto Supabase isolato e migrazioni commerciali,
matrice dei piani, autorizzazione server-side, AUTH-1, ENT-1, BILL-1 e BILL-2. L'E2E
autenticato ha verificato cookie SSR, negazione anonima, accesso Insight/Pro e logout;
il catalogo Stripe test è riconciliato e il webhook ha superato suite firmata e
consegna reale dal CLI test. Pulizia remota e audit produzione sono senza rilievi.
Questi risultati non autorizzano cache o snapshot provider (APP-3).

La prima slice UI stateless è ora `/partite → /match/[matchId]`: Server Components
richiedono solo le API IQstatS e propagano esclusivamente il cookie della richiesta
all'endpoint interno. Dati, accesso e errori restano nel contratto normalizzato; non
esiste più un fallback demo nella UI. APP-3 resta invariato: nessuna cache o persistenza
provider è stata introdotta. Il percorso felice autenticato APP-4/APP-5 è verificato.
