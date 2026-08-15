# Architettura informativa di IQstatS

## Principio

IQstatS accompagna l'utente dalla selezione di una gara alla spiegazione dei dati che
la rendono interessante. La struttura osservata nel prodotto di riferimento ispira il
percorso, ma nomi, segnali, formule, contenuti e UI restano originali.

Ogni nodo della gerarchia dichiara fonte, aggiornamento, copertura e limiti. Nessuna
sezione è mostrata come disponibile se il suo contratto dati non è stato verificato.

## Navigazione primaria

Su mobile la navigazione inferiore può contenere al massimo cinque destinazioni; su
desktop le stesse destinazioni diventano rail o sidebar. Le impostazioni restano una
funzione secondaria, non una voce primaria.

```text
IQstatS
├── Partite                 /partite
│   ├── Oggi e calendario
│   ├── Filtri: data, paese, lega, disponibilità dati
│   └── Lista gare → /match/[matchId]
├── Segnali                 /segnali
│   ├── Viste configurabili per famiglie di segnali
│   ├── Ordinamento, spiegazione e limiti del segnale
│   └── Gara selezionata → /match/[matchId]
├── Database                /database
│   ├── Competizioni        /competizioni/[leagueId]
│   ├── Squadre             /squadre/[teamId]
│   └── Giocatori           /giocatori/[playerId]
├── Metodo                  /metodo
│   ├── Fonti e freschezza
│   ├── Copertura e campi mancanti
│   └── Versioni dei modelli e limiti
└── Impostazioni            /impostazioni (secondaria)
```

`/partite` è la home dell'MVP. Se una voce primaria non ha ancora un read model reale,
non viene resa navigabile nella UI di produzione.

## Dossier partita

Il dettaglio è una pagina progressiva, non una raccolta di card equivalenti. Le sezioni
seguono il bisogno dell'utente: capire la gara, confrontare un tema, verificare
l'evidenza.

```text
/match/[matchId]
├── Testata persistente
│   ├── competizione, data/ora, stato, luogo e squadre
│   ├── provenienza e timestamp del dato
│   └── azione di ritorno che conserva filtri e posizione della lista
├── Riepilogo                # contesto e segnali spiegabili
│   ├── disponibilità, quote e probabilità solo quando coperte
│   ├── forma, classifica, H2H e contesto di gara
│   └── avvisi su dati mancanti o non aggiornati
├── Mercati                  # 1X2, doppia chance, linee, scoreline
│   └── mostra solo mercati normalizzati e timestamp verificabili
├── Gol                      # over/under, entrambi segnano, tempi e multigol
│   └── formule IQstatS con versione e campione
├── Statistiche squadra      # confronto casa/trasferta
│   ├── tiri, tiri in porta e parate
│   ├── corner
│   ├── falli e cartellini
│   ├── fuorigioco
│   └── possesso
├── Contesto                 # rosa, allenatori, disponibilità e storico
│   └── sezioni condizionali a lineup, transfer e manager data
└── Metodo e fonti           # audit leggibile
    ├── fonte, acquiredAt, copertura e campione
    ├── campi mancanti
    └── formulaVersion per ogni insight derivato
```

Su mobile il dossier usa un selettore di sezione breve e scrollabile con stato attivo;
non una riga fissa di dieci tab. Su desktop può usare tab o navigazione laterale, ma
mantiene URL condivisibili e back navigation prevedibile.

## Regole di disponibilità

| Sezione | Dati minimi necessari | Comportamento senza dati |
| --- | --- | --- |
| Riepilogo | fixture normalizzata | pagina non disponibile con errore recuperabile |
| Mercati | snapshot normalizzati con timestamp | avviso di copertura, nessun prezzo fittizio |
| Gol / statistiche | `team_stat_snapshot` + metadati assenza | nascondere la metrica non coperta |
| Contesto | lineup, roster, manager o storico verificati | mostrare solo sottosezioni coperte |
| Metodo e fonti | metadati di acquisizione e formula | sempre disponibile per un dato mostrato |

## Regole di design da applicare

- Mobile-first; corpo testo almeno 16 px, controlli interattivi almeno 44 px e nessun
  overflow orizzontale.
- Contrasto testo 4.5:1, stato attivo non affidato al solo colore, focus da tastiera
  visibile e ordine dei titoli sequenziale.
- Grafici con legenda, valori accessibili al tocco/tastiera e alternativa tabellare.
- Loading oltre 300 ms con skeleton; stati empty/error con causa e azione di retry.
- Tooltip, colore e micro-animazioni non possono essere l'unico veicolo informativo;
  rispettare `prefers-reduced-motion`.
