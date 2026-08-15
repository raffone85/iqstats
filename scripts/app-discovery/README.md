# APP-0D — Discovery mirata dei contratti MVP

## Autorizzazione e limite

Autorizzata dall'utente il 1 agosto 2026 per:

- lista e dettaglio gare;
- quote e movimento quote;
- forma;
- classifica;
- testa-a-testa.

Non è harvesting: il run usa soltanto richieste `GET`, un campione minimo di gare,
massimo due richieste al secondo, nessuna scansione di stagioni o paginazione massiva e
un tetto rigido di 30 richieste. Sono ammessi soltanto due follow-up di paginazione
prefissati per completare i 448 record quote di una singola gara quando la risposta è
limitata dal server a 200 record. Non modifica `apps/`, dataset o output CAL-4.

## Contratto di evidenza

Un campo viene dichiarato disponibile solo se compare esplicitamente nella risposta
dell'endpoint specifico o in un contratto normalizzato già verificato. Non sono ammessi:

- ricostruzione di apertura o chiusura da un singolo prezzo;
- inferenza del movimento dalla differenza tra valori non identificati temporalmente;
- sostituzione di campi mancanti con zero, stringhe segnaposto o dati dimostrativi;
- deduzione di forma, classifica o H2H da testo libero.

Per le quote il report deve enumerare tutti i mercati restituiti per ciascuna gara
campione e registrare separatamente la presenza esplicita di:

1. prezzo di apertura;
2. prezzo corrente o di chiusura;
3. movimento/delta e relativa direzione;
4. timestamp e bookmaker/sorgente;
5. linea, selezione e stato del mercato.

Se l'endpoint espone solo snapshot non etichettati, il report conserva l'evidenza ma
marca apertura, chiusura e movimento come non disponibili.

## Output autorizzati

- fixture JSON sanificate sotto `scripts/app-discovery/output/2026-08-01/`;
- manifest con path richiesto, stato HTTP, timestamp e conteggio richieste;
- `REPORT.md` e `REPORT.json` con schema, copertura, missingness e conclusioni;
- aggiornamento della matrice APP-0 e dei task soltanto dopo la verifica.

Token, header, base URL configurata e valori di `.env.local` non vengono salvati o
stampati. Le fixture eliminano ricorsivamente chiavi sensibili prima della scrittura.

## Criteri di accettazione

- [x] Il run resta entro 30 richieste complessive, incluse le ricognizioni preliminari,
  e usa al massimo tre gare campione.
- [x] Ogni dominio ha endpoint, stato, top-level schema e fixture oppure un motivo
  verificato di indisponibilità.
- [x] Tutti i mercati presenti nel campione sono enumerati senza selezione arbitraria.
- [x] Apertura, chiusura e movimento sono marcati disponibili solo quando espliciti.
- [x] Fixture e report non contengono pattern sensibili.
- [x] Nessun file sotto `apps/` viene modificato.

## Verifica

1. help e dry-run senza rete;
2. run completo limitato;
3. parse di ogni JSON e riconciliazione manifest/file;
4. scansione di chiavi e pattern sensibili;
5. confronto indipendente tra mercati nelle fixture e riepilogo del report;
6. checkpoint umano prima di APP-1.
