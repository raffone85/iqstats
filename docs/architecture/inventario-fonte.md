# Inventario della fonte e dell'archivio

Scritto il 16 agosto 2026. Risponde a: **che cosa è raggiungibile, che cosa è già in casa,
e che cosa costerebbe prendere il resto.**

Il catalogo dei campi endpoint per endpoint resta in
`statsiq-football-endpoint-catalog.md`, verificato sui documenti della fonte il 10 agosto.
La destinazione di prodotto di ogni endpoint resta in `mappa-endpoint-sezioni.md`.
**Qui non si duplica nessuno dei due:** si dichiara la disponibilità reale e il costo.

## La superficie raggiungibile

La sessione di lavoro espone **34 strumenti** verso la fonte, oltre all'accesso REST già
usato dall'applicazione. Coprono gare, squadre, giocatori, competizioni, classifiche,
quote, allenatori, arbitri, stadi e contenuti.

Tre di quegli strumenti appartengono a un componente aggiuntivo a pagamento — il peso del
denaro e il suo storico — e rispondono `402`. **Restano fuori dal motore statistico**, come
già stabilito nel catalogo.

**Superato il 20 agosto 2026.** Le regole di frequenza, gli stati della gara, i limiti e
le novità dei payload stanno ora in [regole e limiti della fonte](fonte-regole-e-limiti.md),
scritte dalla documentazione corrente e verificate chiamando l'API. In sintesi: nessuna
quota giornaliera su questo piano, raffica di 25 richieste al secondo per indirizzo sugli
endpoint in cache, e la disciplina del progetto resta **due richieste al secondo** per le
raccolte e **nessuna ondata sopra sei** nelle pagine — ora per non disturbare, non per
rispettare un tetto.

## Che cosa è già in casa — zero richieste

Nessuna delle cifre qui sotto è stimata: vengono dalla scansione dei file.

| Archivio | Contenuto | Percorso |
|---|---|---|
| Statistiche di gara | **9.305 payload** completi: 76 campi di squadra, statistiche per tempo, mappa dei tiri, momentum, posizioni medie, xG per minuto | `scripts/calibration/data/raw/` |
| Estratto tabellare | 18.610 righe squadra-gara su sette metriche, 29 leghe, dal 22 febbraio 2025 al 28 giugno 2026 | `scripts/calibration/data/dataset.csv` |
| Anagrafica delle gare | **20.151 eventi** con data, stagione, squadre e **allenatori** delle due panchine | `scripts/calibration/context/data/2026-07-23/events/` |
| Rose, trasferimenti, allenatori, giocatori | 427 rose, 11.185 trasferimenti, 500 allenatori, 2.298 giocatori, 445 contesti squadra | stesso snapshot |
| Campioni reali di ogni altra entità | 39 payload: dettaglio gara, precedenti, quote, confronto quote, classifica, statistiche per giocatore, rosa, calendario, allenatore, arbitro, stadio, stagioni, marcatori | `scripts/app-discovery/output/` |
| Baseline e dispersione calibrate | medie e SD casa/trasferta per lega × metrica, dispersione squadra e gara | `scripts/calibration/output/` |
| Rating del motore in produzione | rating attacco e difesa per squadra × metrica | `scripts/engine/output/` |

**Conseguenza:** la ricognizione richiesta dal metodo di proiezione è stata completata
**senza una sola richiesta**, e il dataset storico di squadra si può costruire allo stesso
costo.

## Che cosa manca, e quanto costa

Tre blocchi non sono nell'archivio. Ognuno costa **una richiesta per gara**.

| Blocco | Che cosa sblocca | Richieste |
|---|---|---|
| Episodi della gara | cartellini distinti per natura — giallo, rosso diretto, seconda ammonizione, panchina — e quindi la disciplina come target | 7.905 |
| Statistiche per giocatore | 79 campi per giocatore-gara: il blocco giocatori, i minutaggi, la quota di contributo, e il controllo incrociato sui cartellini | 9.305 |
| Dettaglio della gara | arbitro designato, stadio, meteo, terreno, spettatori, derby, campo neutro, distanza di viaggio | 9.305 |

A due richieste al secondo: circa **66 minuti** il primo blocco, **78 minuti** ciascuno
degli altri due. Sono raccolte notturne, riprendibili, con manifest — mai richieste fatte
mentre un visitatore aspetta una pagina.

## Che cosa resta fuori

- **Peso del denaro e storico tick delle quote:** a pagamento, rispondono `402`.
- **Punteggi in tempo reale:** il motore è pre-partita.
- **Migliore quota per esito ed elenco operatori:** porterebbero a nominare un operatore.
- **Contenuti social:** non è un dato misurabile.
- **Formazioni previste storiche:** non esistono. Su una gara passata la fonte dà l'undici
  effettivo. Vedi il limite dichiarato nel dizionario delle metriche. **Per il futuro il
  quadro è cambiato:** `/events/{id}/lineups/` dichiara `lineup_status` e serve una
  formazione prevista con la sua confidenza fino a due settimane prima del calcio
  d'inizio. Il dettaglio è in [regole e limiti della fonte](fonte-regole-e-limiti.md).

## Regole che valgono per ogni raccolta

- La fonte si legge **solo lato server**; nessuna chiave compare in codice, log, documenti
  o output.
- Il nome della fonte non compare in percorsi, moduli, messaggi di commit, log o
  interfaccia. I nomi reali degli endpoint restano confinati al livello di integrazione.
- Ogni raccolta è **riprendibile**, con manifest, salvataggio incrementale e ritentativi
  con attesa crescente.
- Il conteggio delle richieste si rifà a ogni blocco nuovo e si dichiara prima di
  eseguirlo.
