# Mappa funzionale del prodotto di riferimento

## Scopo e limite della mappatura

Questo documento registra la struttura funzionale osservata durante la navigazione di BioFootballBet per progettare IQstatS. Non descrive, replica o presume codice sorgente, infrastruttura, database, algoritmi proprietari o provider del sito di riferimento.

IQstatS deve riutilizzare soltanto il principio di navigazione: passare da una lista di segnali a una spiegazione statistica della singola gara, con interfaccia, contenuti e modelli propri.

## Architettura funzionale osservata

```text
Navigazione per famiglie di segnali
        |
        v
Dashboard delle partite
  - contesto temporale e competizione
  - squadre e mercato 1/X/2
  - movimenti, differenziali e segnali gol
        |
        v
Selezione di una partita
        |
        v
Dettaglio gara
  - testata e stato dell'incontro
  - segnali sintetici
  - schede per mercato, statistiche e pattern
        |
        v
Confronti casa/trasferta, forma, storico e dati mancanti
```

La dashboard e il livello di selezione: consente di individuare gare e segnali rapidamente. Il dettaglio e il livello di spiegazione: rende confrontabili quote, probabilita, statistiche e contesto della gara.

### Famiglie nella navigazione principale

Le voci osservate sono le seguenti; i nomi sono riportati come etichette del prodotto di riferimento, non come nomenclatura obbligatoria di IQstatS.

| Famiglia osservata | Ruolo funzionale dedotto |
| --- | --- |
| Differenziali Segni 12 | selezione per differenze sugli esiti principali |
| Anomalie Risultati Esatti | evidenza di scoreline anomale o interessanti |
| Differenziali Cris | aggregazione di differenziali proprietari |
| Multigol Cris | filtro su intervalli di gol |
| Ind. Gol Bio | indicatore sintetico sui gol |
| Partite GG/Over2.5 Bio | selezione combinata entrambe segnano / Over 2.5 |
| Partite X/Under2.5 Bio | selezione combinata pareggio / Under 2.5 |
| Indice GZ_ALL | indice aggregato di segnali |
| New Over PT | filtro relativo all'Over primo tempo |

In IQstatS queste diventano categorie configurabili di segnali e filtri; non vanno replicate formule o denominazioni proprietarie.

## Dashboard

Ogni riga di gara osservata combina:

- data e orario;
- paese e competizione;
- squadra casa e trasferta;
- quote 1/X/2 e relativa variazione, quando disponibili;
- segnali o differenziali evidenziati con colore;
- mercati principali Over/Under;
- accesso al dettaglio della partita.

### Responsabilita UX della dashboard

1. Ridurre una lista ampia a una lista leggibile e filtrabile.
2. Esporre metadati sufficienti per scegliere quale gara aprire.
3. Non trasformare un segnale in una certezza: mostrare sempre fonte, aggiornamento, copertura e assenze dati.
4. Trasferire il contesto selezionato al dettaglio, senza richiedere all'utente di ricominciare la ricerca.

## Dettaglio gara

Caso esplorato: Atletico-MG - Bahia, Brasile Serie A.

La gerarchia funzionale osservata e:

1. intestazione con competizione, giornata, squadre, stato, data e stadio;
2. indicatori sintetici per i segnali principali;
3. navigazione per famiglie statistiche;
4. pannelli di confronto casa/trasferta e dati di contesto;
5. forma recente, testa-a-testa e informazioni di campionato.

### Schede osservate

| Area | Contenuto funzionale da considerare in IQstatS |
| --- | --- |
| Riepilogo | probabilita, quote, classifica, forma, contesto e testa-a-testa |
| Asian | linee e prezzi asiatici, se coperti dalla fonte |
| Analisi 1X2 | probabilita, movimento e spiegazione del segnale esito |
| Risultati esatti | distribuzione scoreline e anomalie calcolate internamente |
| Analisi gol | Over/Under, GG/NG, tempi e multigol |
| Corner | conteggi, linee e confronti per squadra |
| Tiri / tiri in porta / parate | volume offensivo e dati portiere |
| Falli e cartellini | disciplina e linee correlate |
| Fuorigioco | frequenza e indicatori tattici disponibili |
| Possesso palla | possesso e confronto squadra/avversario |
| Ritardi | sequenze temporali e segnali derivati, se spiegabili |
| Prima sostituzione | pattern della prima sostituzione, se il feed li supporta |
| Data Mining | insight derivati con formula, fonte e versione dichiarate |

## Riepilogo prioritario per l'MVP

- Probabilita per 1/X/2, doppia chance, gol, Over/Under e multigol, solo se calcolabili e spiegabili.
- Confronto tra quota teorica, iniziale e corrente con timestamp e bookmaker quando la copertura lo consente.
- Classifica del campionato e forma recente.
- Medie squadra: possesso, tiri, tiri in porta, parate, corner e differenziale corner.
- Ultime partite con filtro casa/trasferta e paginazione.
- Matrice dei confronti nel campionato e lista testa-a-testa.

## Traduzione in IQstatS

```text
Provider esterni
        |
        v
Adapter e validazione server-side
        |
        v
Modelli interni: gara, quote, statistiche, storico
        |
        +--> motore segnali/calcoli con versione e periodo
        |
        v
API IQstatS
        |
        +--> dashboard (selezione)
        +--> dettaglio (spiegazione per schede)
```

La versione tecnica di questa traduzione e in `docs/architecture/target-architecture.md`.

## Principio UX

La dashboard deve guidare dalla scansione rapida al perche del segnale. Ogni valore derivato deve poter mostrare: fonte, data di acquisizione, periodo del campione, formula/versione e campi mancanti.
