# APP-3D / DATA-0 — preflight del provider

Questo workstream misura contratti e volumi correnti prima di creare lo schema dati
calcistico. Non è harvesting e non popola alcun database.

## Contratto operativo

- solo richieste `GET`;
- massimo 50 richieste per il run autorizzato del 9 agosto 2026;
- intervallo minimo di 550 ms tra richieste;
- nessuna scrittura remota o accesso al database remoto;
- risposte del provider mantenute soltanto in memoria;
- output locali limitati ad aggregati, copertura semantica, conteggi e stime;
- nessun identificativo remoto, indirizzo pubblico, metadato di richiesta o materiale
  di autenticazione negli output.

Il run usa la policy dei 36 campionati regolari già verificata dal workstream di
calibrazione, ma interpreta la stagione utile attraverso la stagione corrente esplicita
del catalogo: 2026/27 per i campionati cross-year e 2026 per quelli calendar-year.

## Comandi

```text
node --env-file=apps/web/.env.local scripts/app-ingestion/preflight.mjs --dry-run
node --env-file=apps/web/.env.local scripts/app-ingestion/preflight.mjs --execute
node scripts/app-ingestion/preflight.mjs --reaudit
```

Il dry-run non usa la rete. L'esecuzione reale rifiuta di sovrascrivere una directory
di output non vuota e applica un tetto richieste nel client stesso.
Il reaudit ricostruisce i riepiloghi dagli aggregati già salvati e non usa la rete.

## Output

Sotto `scripts/app-ingestion/output/2026-08-09/` vengono creati:

- `manifest.json`, con soli domini, stati, conteggi e dimensioni;
- `DATA-0-REPORT.json`, contratto macchina aggregato;
- `DATA-0-REPORT.md`, report di checkpoint umano.

Nessuna risposta grezza viene scritta su disco.

## DATA-1 locale

La migrazione proposta è
`infra/supabase/20260809_iqstats_football_data.sql`. Il contratto statico si verifica
con:

```text
node scripts/app-ingestion/validateData1Sql.mjs
```

`smoke-data-1.sql` prepara insert sintetici, controlli dei vincoli e piani reali, quindi
esegue sempre `rollback`. Il 9 agosto 2026 è stato eseguito dopo un reset completo del
database Supabase locale: zero errori, due piani completati e rollback verificato. Il
database remoto non è stato usato come fallback.

`benchmark-data-1.sql` riproduce in transazione il volume di 10.361 gare osservato in
DATA-0, aggiunge classifica e coda sintetiche, esegue quattro piani e misura l'ingombro,
poi annulla ogni dato con `rollback`.

Il report runtime sanificato è
`scripts/app-ingestion/output/2026-08-09/DATA-1-LOCAL-REPORT.md`.

`data1-contracts.mjs` normalizza catalogo, gare e classifiche senza conservare risposte
grezze. `test-data1-batch.sql` verifica il batch SQL su replay, update fuori ordine,
update più recente, snapshot change-only e privilegi; termina sempre con rollback.

Il piano dell'harvester locale si esegue senza rete e senza scritture con:

```text
npm run plan:data1-ingest
```

Il piano verificato copre 33 campionati freschi, mantiene 3 finestre in hold e stima
86–171 GET. L'esecuzione richiede un tetto approvato esplicito, non supera 2 richieste
al secondo, conserva le risposte soltanto in memoria e applica al database locale batch
normalizzati e idempotenti. La migrazione o l'ingest sul database remoto restano un
checkpoint separato.
