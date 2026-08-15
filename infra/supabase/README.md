# Supabase IQstatS — stato e riproducibilità

## Destinazione di sviluppo

Il 2 agosto 2026 l'utente ha scelto il progetto Supabase Free esistente `iqStats`
(`vthvifvachyvamabotdo`, `eu-west-1`) come destinazione IQstatS. Non è stato creato
un secondo progetto e non sono stati sostenuti costi.

Prima della bonifica sono stati verificati zero utenti e zero righe in tutti gli
oggetti legacy. Sono stati rimossi schema, trigger e tabelle vuote LineaX. La Edge
Function legacy `data-proxy`, non eliminabile dal connettore disponibile, è stata
neutralizzata nella versione corrente: JWT obbligatorio, risposta `410` e nessun
accesso a rete, database o segreti.

## Sorgenti SQL locali

- `iqstats_commercial_foundation.sql` è lo snapshot canonico finale per bootstrap su
  una destinazione vuota o su un legacy verificato vuoto. Contiene preflight di
  sicurezza, schema commerciale, seed, funzioni, RLS, grants e rate limiting.
- `20260802_iqstats_api_rate_limits.sql` e
  `20260802_iqstats_rate_limit_rls.sql` documentano le migrazioni incrementali del rate
  limiting applicate dopo la fondazione sul progetto remoto già migrato.
- `20260802_iqstats_billing_owner_guard.sql` aggiunge il vincolo operativo che impedisce
  a un webhook di trasferire una subscription esistente a un altro utente. Queste
  migrazioni non vanno riapplicate dopo lo snapshot canonico.
- `20260809_iqstats_football_data.sql` è la migrazione locale proposta per DATA-1:
  schema server-only `football`, nucleo competizioni/stagioni/squadre/gare/classifiche,
  code di sincronizzazione riprendibili, read model e privilegi minimi. Non è stata
  applicata al database remoto e richiede il checkpoint APP-3D prima dell'applicazione.
  La copia generata dalla Supabase CLI vive sotto `supabase/migrations/`; il 9 agosto
  2026 è stata applicata, resettata e verificata soltanto sullo stack locale.
- `20260809_iqstats_data1_batch_ingest.sql` aggiunge checksum di entità e la funzione
  invoker-only di batch upsert DATA-1. Accetta esclusivamente il contratto normalizzato,
  protegge da aggiornamenti fuori ordine e inserisce snapshot classifica change-only.
  Replay, update obsoleto/più recente, privilegi e rollback sono verificati da
  `scripts/app-ingestion/test-data1-batch.sql` sul PostgreSQL locale.

Ledger remoto rilevante:

| Versione | Migrazione |
| --- | --- |
| `20260802081939` | `iqstats_migration_probe` — solo `select 1`, nessun oggetto |
| `20260802081949` | rimozione legacy vuoto |
| `20260802082011` | tabelle commerciali |
| `20260802082030` | funzioni billing/entitlement |
| `20260802082046` | catalogo, RLS e grants |
| `20260802082120` | indici/advisor remediation |
| `20260802085026` | rate limiting distribuito |
| `20260802085153` | RLS/invoker del rate limiting |
| `20260802154136` | owner immutabile delle subscription |

Le migrazioni sono forward-only. In produzione il rollback deve usare backup/restore
o una migrazione compensativa revisionata; non esiste uno script di drop automatico.

## Gate configurazione locale

Il file `.env.local` non è sorgente di migrazione e non viene mai copiato nei file
versionati. Al checkpoint del 2 agosto la configurazione locale di API e web è stata
verificata coerente con il progetto IQstatS senza esporne valori. Il runtime conserva
il controllo fail-closed tra URL, project ref e ruolo delle chiavi JWT legacy.
