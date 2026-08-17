# Dizionario delle metriche

Scritto il 16 agosto 2026. Risponde a una domanda sola: **di ogni numero che la fonte
restituisce, che cosa significa, quanto se ne ha, e quando un'assenza è un buco o un
dato.** L'elenco macchina-leggibile vive in `data/registro-metriche.json` e non si
duplica qui: questo documento spiega le regole che quel file applica.

Il catalogo degli endpoint resta in `statsiq-football-endpoint-catalog.md`. La mappa
verso le sezioni di prodotto resta in `mappa-endpoint-sezioni.md`.

Vincoli che governano ogni riga: la fonte non si nomina mai, i calcoli non si mostrano,
freschezza e campione si dichiarano sempre.

## Il campione misurato

Tutte le cifre di questo documento vengono da `scripts/projection/discovery/scan_archive.py`,
che ha letto l'archivio già scaricato **senza fare una sola richiesta**.

| | |
|---|---|
| Gare lette | **9.305** |
| Gare con pannello statistico completo | **7.905** (84,9%) |
| Leghe | 29 |
| Intervallo | 22 febbraio 2025 → 28 giugno 2026 |
| Campi di squadra distinti | **76** |
| Campi per tempo | 42, primo e secondo tempo separati |
| Tiri mappati | **211.950**, con 14 campi ciascuno |
| Gare con momentum | 8.252, e 8.137 con xG per minuto |

## La regola del pannello

**Una riga statistica compare per entrambe le squadre o per nessuna.** Su 7.905 gare e
76 campi non esiste **una sola** presenza asimmetrica. Non è una tendenza: è il formato.

Da qui discende la distinzione che governa tutto il resto:

- **Pannello assente** — la gara non ha statistiche di squadra. Sono 1.400 gare su 9.305.
  Questi valori sono ignoti e restano `null`, sempre. Non diventano mai zero.
- **Pannello presente, riga assente** — la gara ha le statistiche, ma quella metrica non
  compare. Qui l'assenza può avere un significato, e va verificata metrica per metrica.

## Le cinque classi di provenienza

Ogni valore che entra in un dataset porta con sé da dove viene. Versione della politica:
`2026-08-16.1`.

| Classe | Significato | Ammessa nei dataset validati |
|---|---|---|
| **A** | osservato direttamente | sì |
| **B** | zero implicito verificato dalla struttura della fonte | sì |
| **C** | ricostruito deterministicamente da un'altra risorsa | sì |
| **D** | ambiguo | no |
| **E** | mancante | no |

**La politica si applica prima di qualsiasi calcolo**: prima delle medie, delle ultime
tre, cinque e dieci, degli split casa/trasferta, dei valori concessi, delle medie
esponenziali e di ogni confronto fra le due squadre.

### Perché la classe B non è un'imputazione

Per 47 campi su 76, la riga assente non ha **nemmeno un controesempio**: dove la riga
compare, almeno una delle due squadre ha un valore diverso da zero. Mai una gara con
entrambe a zero. L'assenza è il modo in cui la fonte scrive «zero per entrambe».

La differenza è misurabile e non è piccola:

| Metrica | Media se l'assenza è un buco | Media se l'assenza è uno zero | Valore plausibile |
|---|---:|---:|---|
| Cartellini rossi | 0,408 | **0,093** | circa un rosso ogni dieci gare per squadra |
| Errori che portano a un gol | 0,600 | **0,158** | raro per definizione |
| Parate su rigore | 0,508 | **0,024** | rarissimo |
| Grandi occasioni | 2,309 | **2,145** | |

Leggere l'assenza come un buco non produce un'incertezza: produce un errore
**sistematico e sempre nella stessa direzione**, perché scarta esattamente le gare in cui
il valore era zero. Per questo la classe B è marcata all'origine come *zero implicito
verificato dalla struttura della fonte*, resta tracciabile fino al record e non viene mai
confusa con un valore osservato.

### Che cosa cade in ogni classe

- **Classe A — 12 campi.** Dieci sempre presenti nel pannello: tiri totali, tiri in porta,
  tiri fuori, tiri respinti, corner, calci di punizione, rimesse dal fondo, rimesse
  laterali, e l'xG col suo campo interno. Più i due alias verificati.
- **Classe B — 47 campi.** Dal possesso ai passaggi, dai duelli ai contrasti, dalle grandi
  occasioni alle parate difficili, comprese le espansioni `valore / totale / percentuale`
  di cross, duelli aerei, duelli a terra, dribbling, palle lunghe e ultimo terzo.
- **Classe C — 12 campi.** Otto con assenza ambigua ma valore ricostruibile da un'altra
  risorsa: falli, fuorigioco, parate, contrasti, legni, gol evitati, tiri dentro e fuori
  area. Più le **quattro nature della disciplina**, già ricostruite dagli episodi, che
  hanno preso il posto dei due conteggi aggregati del pannello.
- **Classe D — 7 campi.** Ambigui e senza via di ricostruzione: i passaggi filtranti e le
  sei metriche che esistono solo nel pannello in diretta (attacchi, attacchi pericolosi,
  palla al sicuro e le loro percentuali).

## Gli alias verificati

Due coppie di campi sono **lo stesso numero con due nomi**: nessuna differenza su 2.685
confronti ciascuna.

| Nome ridondante | Nome conservato |
|---|---|
| `total_tackles` | `tackles` |
| `total_saves` | `goalkeeper_saves` |

Il registro li conserva entrambi con il collegamento esplicito, ma solo il nome conservato
entra nei dataset: contarli due volte gonfierebbe qualunque aggregato.

## La disciplina: gialli e rossi restano separati

Un rosso **non** si trasforma mai in due gialli. Il rosso ha un significato diverso per la
disciplina di squadra, per il comportamento del singolo, per la severità dell'arbitro e
per la fisionomia della gara.

Nell'archivio la riga dei rossi manca nel 77,3% delle gare, e non è ricostruibile dal solo
pannello. Gli episodi però distinguono `yellow`, `red` e `yellowRed`, e marcano anche i
cartellini alla panchina. Da lì si ricostruiscono quattro conteggi distinti, misurati su
**9.205 gare e 29 leghe** da `scripts/projection/dataset/reconstruct_cards.py`:

| Metrica | Da dove | Media per squadra a gara |
|---|---|---:|
| `yellow_cards` | episodi con cartellino giallo, panchina esclusa, **seconda ammonizione esclusa** | 1,963 |
| `red_cards_direct` | espulsione diretta, panchina esclusa | 0,0649 |
| `second_yellow_red` | espulsione per seconda ammonizione | 0,0394 |
| `bench_cards` | cartellini a panchina e staff, fuori dai conteggi di squadra | 0,0003 |

Espulsioni totali: 0,104 per squadra a gara, coerente con l'ordine di grandezza noto.
La provenienza è **C** su tutte e quattro. Una gara i cui episodi non sono stati acquisiti
resta di classe **E**: non sapere non è zero. I `bench_cards` esistono ma nell'archivio
sono sei in tutto: la metrica è registrata e **non è ammessa come bersaglio**.

### Il test del doppio conteggio: eseguito, e il verdetto cambia le definizioni

Il test prescritto è stato eseguito da `scripts/projection/dataset/verify_cards.py` isolando
un asse per volta. Il risultato è netto in tutte e due le direzioni:

| Conteggio aggregato del pannello | Lati di controllo | Accordo | Lati con una seconda ammonizione | Se la si esclude | Se la si include |
|---|---:|---:|---:|---:|---:|
| gialli | 13.918 | 97,5% | 541 | **7,8%** | **90,6%** |
| rossi | 2.791 | 99,6% | 539 | **0,2%** | **99,8%** |

**Lo stesso episodio è già contato due volte dalla fonte:** una volta nel conteggio
aggregato dei gialli e una volta in quello dei rossi. Sommare la seconda ammonizione a uno
dei due la conterebbe una terza volta.

Per questo i due conteggi aggregati **escono dal registro** e sono sostituiti dalle quattro
nature separate. `yellow_cards` non è più l'aggregato del pannello ma l'ammonizione
semplice: la definizione è cambiata, e con essa il bersaglio.

### I cartellini che la fonte non attribuisce

**1.765 cartellini** non hanno identificativo del giocatore, portano il nome convenzionale
di giocatore ignoto e un minuto convenzionale. Non sono cartellini alla panchina: quelli
sono marcati a parte e sono sei. Su 894 lati squadra-gara isolati, il conteggio aggregato
del pannello concorda con gli episodi **al 95,7% se questi cartellini si escludono** e al
2,3% se si includono: la fonte non li conta nell'aggregato, e neppure noi. Restano
dichiarati nella colonna `unattributed_cards` di `cartellini.csv` invece di sparire.

### La metrica di mercato è un'altra cosa

`card_points` esiste **solo** al livello mercato e non tocca i dati statistici originali.
Pesi predefiniti: giallo 1, seconda ammonizione 2, rosso diretto 2, panchina 0 — quindi
tre gialli e un rosso fanno cinque punti. Restano **configurabili**, perché il conteggio
della seconda ammonizione, del rosso diretto e dei cartellini alla panchina cambia da un
mercato all'altro.

> **I pesi si applicano alle quattro nature separate, mai ai conteggi aggregati della
> fonte.** Il test qui sopra ha accertato che quegli aggregati contengono già la seconda
> ammonizione: usarli come base della somma pesata la conterebbe due volte.

## Il campo minimo per prevedere

`MIN_PREVIOUS_MATCHES = 3`. Il motore diventa operativo dalla quarta gara: per prevedere
la quarta usa la prima, la seconda e la terza; dalla quinta usa tutto lo storico
precedente. Tre gare sono il campione **minimo**, non una finestra massima.

Non servono tre gare in casa e tre in trasferta: bastano tre gare precedenti in tutto. Gli
split casa/trasferta si usano comunque, ma con il loro campione reale e con un'incertezza
maggiore quando il campione è piccolo.

## Che cosa è osservato dopo la gara e che cosa esiste prima

Tutte le 76 metriche di squadra sono osservate **a gara conclusa**. Entrano nelle feature
soltanto se lette da gare con data anteriore al calcio d'inizio di quella da prevedere.
Sulla gara stessa il rischio di contaminazione è massimo: è la definizione del problema.

Esistono invece **prima** del calcio d'inizio, e sono candidate dirette: arbitro designato
con le sue medie già aggregate, allenatore con profilo tattico e modulo, classifica con
xG a favore e subiti, stadio, meteo con temperatura e vento, condizione del terreno,
spettatori attesi, derby, campo neutro, distanza di viaggio, turno e precedenti aggregati.

## Il limite che nessun dato risolve

**Le formazioni previste storiche non sono ricostruibili.** Su una gara passata la fonte
restituisce l'undici effettivamente sceso in campo, non quello previsto il giorno prima.
Usarlo come feature pre-partita sarebbe contaminazione travestita da informazione. Il
blocco giocatori si costruisce sulle rose e sui minutaggi delle gare precedenti, non sulla
formazione prevista; la confidenza della formazione prevista si usa solo in previsione, mai
in addestramento.

## Dove guardare

| File | Contenuto |
|---|---|
| `data/registro-metriche.json` | le 78 metriche con classe, copertura, distribuzione e rischio |
| `scripts/projection/dataset/output/cartellini.csv` | i quattro conteggi per squadra-gara, più i non attribuiti |
| `scripts/projection/dataset/output/verifica-cartellini.json` | il test del doppio conteggio, asse per asse |
| `data/registro-target.json` | i target ammessi, con baseline, modelli candidati e fallback |
| `scripts/projection/discovery/output/inventario-campi.json` | la misura grezza da cui tutto deriva |
| `scripts/projection/discovery/output/inventario-entita.json` | i campi delle altre entità |
