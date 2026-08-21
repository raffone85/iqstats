# Il contratto delle feature «al momento di»

Scritto il 17 agosto 2026. Definisce che cosa il lato che prevede deve ricevere e che cosa
deve calcolare, perché la stessa riga produca in TypeScript gli stessi numeri che produce
in Python. È la specifica che il test di parità verifica.

Riferimenti: [architettura del motore](architettura-motore-proiezione.md) ·
[dizionario delle metriche](dizionario-metriche.md) · `data/manifesto-feature.json`.

## La divisione: che cosa si calcola e che cosa si riceve

Il calcolo in TypeScript vede **una gara per volta**. Non ha l'archivio, non ha la lega,
non ha la storia di tutti gli arbitri. Quindi:

| Origine | Chi lo produce | Perché |
|---|---|---|
| Storia della squadra e dell'avversario | **si riceve**, si calcola sopra | sono poche decine di gare, e le medie sono la parte che deve coincidere |
| Storia dell'allenatore | **si riceve**, si calcola sopra | stessa forma della storia di squadra |
| Medie di lega «al momento di» | **si riceve già calcolata** | richiede tutte le gare della lega: non è ricostruibile da una gara |
| Profilo dell'arbitro | **si riceve già calcolato** | richiede tutte le gare di quell'arbitro |
| Aggregati di rosa | **si riceve già calcolato** | richiede le statistiche per giocatore di ogni gara precedente |
| Profilo spaziale per gara | **si riceve per gara**, si media sopra | i tiri di una gara sono un dato di quella gara |

Ciò che si riceve già calcolato deve essere prodotto dal livello dati **con la stessa
regola** del Python, e questo è dichiarato nell'artefatto: il predittore non può
verificarlo da solo.

## Le primitive, e le insidie che nascondono

Tutte le medie sono **spostate di una gara**: la gara da prevedere non entra mai. Le tre
primitive vanno replicate alla lettera, perché la libreria usata in Python non fa la cosa
ingenua.

**Media su finestra.** Si prendono le **ultime N gare precedenti**, comprese quelle il cui
valore è ignoto, e si fa la media dei soli valori noti fra quelle. Non si prendono «le
ultime N gare con valore noto»: una gara senza pannello statistico occupa il suo posto
nella finestra e riduce il campione. Il campione reale è dichiarato nella colonna che lo
accompagna.

**Deviazione standard.** Divisore `n`, non `n-1`. Con un solo valore noto la deviazione è
zero, non indefinita.

**Media esponenziale.** Mezza vita 4 gare, quindi `alfa = 1 - 2^(-1/4)`. I valori ignoti
**non sono saltati**: escono dalla somma ma il loro posto continua a contare
nell'esponente. Per una serie `x` di gare precedenti, dalla più vecchia alla più recente:

```
peso_i  = (1 - alfa)^(ultima - i)
media   = somma(peso_i * x_i, sui soli i noti) / somma(peso_i, sui soli i noti)
```

Saltare i valori ignoti darebbe un numero diverso, e la differenza non è nell'ultima cifra.

## I confini

- **Stagione.** Le aggregazioni di stagione, di lato e di lega vivono **dentro** la
  stagione. Gli orizzonti «ultime 3, 5, 10» attraversano il confine e lo dichiarano nel
  nome. La classifica e il profilo spaziale vivono dentro la stagione.
- **Ordine.** Le gare si ordinano per istante del calcio d'inizio e, a parità, per
  identificativo. L'ordine deve essere lo stesso nei due linguaggi, altrimenti le finestre
  non coincidono.
- **Lato.** Le medie di lato usano le sole gare precedenti giocate dallo stesso lato.
- **Minimo.** `MIN_PREVIOUS_MATCHES = 3` per la squadra e per l'avversario: sotto quella
  soglia non si prevede con il modello del target, si scende nella gerarchia di ripiego.

## I gruppi

Ogni target abilita solo i gruppi che il manifesto ha promosso per lui. Nessun gruppo si
calcola «per sicurezza»: quello che non serve non entra e non costa.

| Gruppo | Che cosa produce | Che cosa richiede |
|---|---|---|
| `base` | medie di lega e di squadra nella stagione, restringimento, scarto normalizzato | storia di squadra, medie di lega |
| `avversario` | profilo dell'avversario e valori concessi, confronto fra le due | storia dell'avversario |
| `forma` | ultime 3, 5, 10 e media esponenziale | storia di squadra |
| `casa_trasferta` | split di lato e forza relativa | storia di squadra |
| `riposo` | giorni dall'ultima gara | storia di squadra |
| `classifica` | punti e reti nella stagione, scarto con l'avversario | storia di entrambe |
| `contesto` | turno, derby, gare ravvicinate | calendario |
| `arbitro` | severità, campione, scarto dalla lega | profilo dell'arbitro |
| `giocatori` | composizione della rosa | aggregati di rosa |
| `spaziale` | dentro e fuori area, distanza, qualità, prodotto e concesso | profilo dei tiri per gara |

## L'arbitro in produzione: si risponde sempre

Il profilo dell'arbitro si **restringe** verso la media di lega con peso `n / (n + k)`,
dove `n` è il numero di gare precedenti di quell'arbitro e `k` la forza del prior. Un
arbitro sconosciuto non blocca la previsione: prende il prior della competizione, e il
record dichiara `arbitro_disponibile = 0` e `arbitro_campione = 0`. Nelle competizioni in
cui l'arbitro non è mai indicato — sono quattro nell'archivio — vale lo stesso.

`k` è stato validato in backtest su ammoniti e falli con k pari a 3, 5 e 10: le differenze
sono di 0,0004 di errore assoluto medio contro una deviazione fra origini di 0,021. **Non
esiste un k migliore da difendere**; resta 5, e resta un parametro dichiarato
nell'artefatto, non un numero nascosto nel codice.

## Da dove arriva, in produzione

Scritto il 20 agosto 2026. Ciò che il calcolo «riceve già calcolato» viene dalle
osservazioni squadra-gara conservate nel database dell'applicazione, non dalla fonte a
ogni richiesta: `apps/web/src/server/iqstats/projection-store.ts` legge le righe,
`projection/snapshot.ts` le compone.

- **medie di lega** e **profilo dell'arbitro**: si calcolano dalle stesse righe, con lo
  stesso taglio temporale, e non si conservano da nessuna parte;
- **aggregati di rosa**: si calcolano dalle statistiche per giocatore delle sole gare
  precedenti della stagione; a parità di minuti l'ordine è quello di prima apparizione
  nella risposta della fonte, conservato nella colonna `source_ordinal`, perché è
  l'ordine che decide chi sta negli undici di riferimento;
- **profilo spaziale per gara**: si conserva in doppia precisione, non in decimali
  contati: sono quozienti e medie, e cinque decimali li arrotonderebbero senza dare
  errore.

La politica di provenienza si applica **in lettura**, prima di qualunque media: la classe
di ogni valore sta nella colonna `value_provenance`, e un valore di classe ambigua o
mancante resta ignoto.

Una divergenza è nota e misurata: le medie di lega non separate per lato comprendono, sul
lato che addestra, la riga gemella della gara stessa. Il livello dati esclude l'intera
gara. Numeri e conseguenze stanno nel §9bis dell'[architettura](architettura-motore-proiezione.md).

## La parità

Python esporta, accanto all'artefatto, un **campione di riscontro «al momento di»**: per un
numero dichiarato di righe reali, l'ingresso completo così come il predittore lo riceverà,
e le feature che Python ha calcolato da quell'ingresso. Il test confronta colonna per
colonna.

Tolleranze, le stesse già in uso per il predittore: scarto relativo `1e-9` sulle grandezze
derivate, scarto assoluto `1e-6` sui valori attesi. Una feature che in Python è ignota
deve essere ignota anche in TypeScript: un valore mancante non diventa mai zero, e una
previsione con una feature mancante non si produce affatto.
