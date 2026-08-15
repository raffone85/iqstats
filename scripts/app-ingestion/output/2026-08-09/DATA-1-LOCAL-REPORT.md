# DATA-1 — Verifica locale e piano di ingestione

## Esito

La base DATA-1 è pronta per il primo caricamento reale esclusivamente locale. Le due
migrazioni sono state applicate da zero su Supabase locale con PostgreSQL 17.6. Il
database remoto non è stato letto o modificato e il database locale contiene ancora
zero righe reali.

Il contratto comprende 8 tabelle dati, 2 viste invoker-safe, 2 tabelle private di sync,
19 indici e una funzione batch accessibile soltanto al ruolo server. RLS è attiva sulle
10 tabelle e i ruoli client non hanno accesso diretto.

## Normalizzazione e batch

Il normalizzatore puro copre catalogo corrente, gare e classifiche. Preserva i campi
mancanti come `null`, distingue lo zero reale, assegna la freschezza adattiva e produce
checksum stabili senza restituire payload grezzi. La suite conta 8 test superati.

Il test SQL del batch verifica:

- replay senza duplicare gare o snapshot classifica;
- rifiuto di un aggiornamento fuori ordine;
- accettazione di un aggiornamento più recente;
- snapshot classifica inserito soltanto al cambio;
- privilegi server-only e rollback finale.

## Smoke, benchmark e sicurezza

Smoke e benchmark sono stati rieseguiti sull'ultima versione delle migrazioni. Il
benchmark transazionale contiene 10.361 gare, 20 righe di classifica e 1.000 job,
esegue quattro query misurate, usa quattro nodi indice e acquisisce 25 job atomicamente.
L'ingombro osservato è 5,88 MiB per gare e indici e 6,23 MiB per il nucleo minimale.
Tutto è stato annullato: restano zero righe sintetiche. Gli advisor riportano zero
errori, zero warning e zero foreign key senza indice.

## Piano di caricamento locale

Il runner DATA-1 è stato verificato soltanto in modalità piano, quindi con zero rete e
zero scritture. Per i 33 campionati freschi stima 86–171 GET, con hard cap raccomandato
di 200 e massimo 2 richieste al secondo. Le 3 finestre non conformi restano in hold.

Durante l'esecuzione autorizzata le risposte rimangono in memoria, vengono normalizzate
e applicate in batch idempotenti al solo PostgreSQL locale. Il runner registra i run,
si arresta al tetto approvato e produce un report aggregato sanificato.

## Gate successivo

Serve approvazione esplicita per un nuovo massimo di 200 GET verso il provider. Questa
approvazione non comprende migrazioni o scritture sul database remoto. Dopo ingest,
resume/replay e riconciliazione locale, verrà presentato un nuovo checkpoint su righe,
storage, tempi e costi prima di qualsiasi destinazione remota.
