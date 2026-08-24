# Piano di costruzione — IQstatS

Scritto il 23 agosto 2026. **Questo è il piano attivo.** `tasks/plan.md` resta lo storico
delle fasi 0-6; `docs/product/implementation-status.md` dice che cosa esiste oggi.

---

## 1. Perché sembra un casino: la diagnosi, non l'impressione

**La navigazione costruita non è quella progettata.** L'architettura informativa prevede
quattro destinazioni primarie; l'app ne ha dieci, e quattro fanno quasi la stessa cosa.

| Progettato in `information-architecture.md` | Costruito davvero |
| --- | --- |
| Partite | `/partite` **e** `/oggi` **e** `/pronostici` **e** `/giocate` |
| Segnali | **non esiste** |
| Database → Competizioni · Squadre · Giocatori | `/database` e `/squadre/[teamId]`; competizioni e giocatori **non esistono** |
| Metodo | `/metodo` |

**Il dossier gara è cresciuto al contrario.** L'architettura prevede sei sezioni in ordine
— Riepilogo, Mercati, Gol, Statistiche squadra, Contesto, Metodo. Quello che esiste ha il
riepilogo, un pezzo di mercati, il motore di proiezione e la classifica. **Mancano
interamente Gol e Statistiche squadra**, che sono il cuore del prodotto secondo la mappa
funzionale.

**La causa.** Fra il 19 e il 22 agosto il lavoro è andato tutto sul motore di proiezione,
che nel piano originale stava in fondo. Il motore funziona e sta in produzione, ma ha
occupato il posto che spettava alle sezioni di dati osservati.

## 2. La decisione, presa il 23 agosto guardando le foto

**Decaduta la proposta di degradare la proiezione a riga di supporto.**

Il §2 diceva di far diventare la proiezione una nota dentro le sezioni osservate. Le
cinquanta schermate in `../foto-frontend-iqstats/` dicono l'opposto e l'utente ha
confermato: la proiezione **è** il prodotto, ma organizzata **per famiglia statistica**,
una card per bersaglio invece di un pannello unico con sette numeri dentro. Ogni card
porta l'atteso per squadra, il totale, la griglia delle linee con le probabilità sopra e
sotto, e la linea più marcata evidenziata.

Il contratto dati che il motore già produce — atteso casa/trasferta/totale, cinque linee
con O/U, affidabilità fuori campione — **è già quello che serve**. Cambia
l'impaginazione, non il motore.

**Il prodotto di riferimento nelle foto è PowerStats.** Se ne prende la struttura
funzionale. Non il verde, non la mascotte, non i testi, non il nome: `AGENTS.md` lo
vieta e la decisione sul tema è stata confermata il 23 agosto — resta «carta e campo».

## 3. La gerarchia, confermata dall'utente il 23 agosto

**Navigazione per entità**, non per gara. La dashboard è l'indirizzo di chi apre l'app.

```text
/  Dashboard                              gare di oggi, gara in evidenza, le porte
│
├── Partite          /partite             calendario con filtro campionato (opzionale:
│   │                                     di default le gare di oggi di tutti i campionati)
│   └── Gara         /match/[matchId]     si apre tutto: il dossier completo
├── Arbitri          /arbitri             Analisi (medie · indici · storico) e Classifiche
├── Squadre          /squadre             Confronto · Dettagli · Classifiche
├── Giocatori        /giocatori
├── Expected         /expected            simulatore: due squadre qualsiasi + arbitro scelto
└── Metodo           /metodo
```

`/oggi` è confluita in `/partite`; `/giocate` e `/database`, che erano vuote, rimandano
alla dashboard. **`/pronostici` è rimasta**: mostra le letture del modello in elenco e
nessun'altra pagina lo fa. È fuori dalla barra, si raggiunge dalla dashboard. La barra
resta sotto le cinque voci previste dall'architettura informativa: le entità si
raggiungono dalle tessere della dashboard, come nelle foto.

**Expected ha un mestiere solo, ed è diverso dal dossier**: accoppiare due squadre che
non si incontrano, con l'arbitro scelto a mano. È un simulatore. La gara in calendario si
legge da `/match/[matchId]`.

```text
/match/[matchId]
├── Testata
├── Riepilogo            forma, classifica, H2H, contesto
├── Gol                  xG per squadra, 1X2 e doppia chance, O/U, GG/NG,
│                        gol esatti per squadra, risultati più probabili, multigol
├── Tiri                 attesi per squadra e totali, di cui in porta e in area, O/U
├── Corner               attesi e O/U, match e per squadra
├── Falli e cartellini   falli e gialli attesi, O/U, gialli per squadra, scheda arbitro
├── Fuorigioco           attesi e O/U
├── Statistiche squadra  le famiglie osservate, casa/trasferta, con campione
├── Giocatori            minuti, tiri, falli, cartellini
├── Arbitro              profilo del designato
└── Metodo e fonti       fonte, freschezza, campione, formula
```

## 4. Che cosa fare, in ordine, e che cosa costa

L'ordine non è per gusto: prima ciò che si costruisce **con i dati che abbiamo già**, poi
ciò che richiede raccolta nuova.

**Misurato sul database in linea il 23 agosto, e corregge il §4 scritto la mattina
stessa.** `football.team_match_observations` ha **21.158 righe** dal 22 febbraio 2025 al
23 agosto 2026, su **590 squadre**, **29 competizioni** e **681 arbitri**. Le colonne
sono molte di più di quelle che il motore usa:

| Colonna | Righe piene | Serve a |
| --- | ---: | --- |
| `goals_for`, `goals_against` | 20.998 | la sezione Gol |
| `expected_goals` | 18.340 | xG: **c'era già**, non va costruito |
| `total_shots`, `shots_on_target` | 18.320 · 18.330 | Tiri |
| `shots_inside_box`, `shots_outside_box` | 18.310 | **tiri in area**: c'erano già |
| `big_chances`, `ball_possession`, `crosses_total`, `tackles`, `interceptions`, `dribbles_total`, `long_balls_total` | 18.308–18.340 | la tabella delle statistiche squadra |
| `corner_kicks`, `fouls`, `yellow_cards`, `red_cards_direct`, `offsides`, `goalkeeper_saves` | 17.392–20.920 | Corner, Falli, Fuorigioco |
| `referee_id` | 18.596 | l'area Arbitri |

**Manca davvero**, e non c'è colonna: **rigori**, **cross accurati**, **key passes**,
**attacchi e attacchi pericolosi**. Prima di prometterli va verificato se la fonte li dà.

`football.player_match_observations` ha **437.059 righe** su **10.482 gare** e **21.019
giocatori**, ma solo `player_source_id`: **nessun nome e nessun gol**. L'area Giocatori,
oggi, mostrerebbe numeri senza nomi.

| # | Lavoro | Dati necessari | Stato dei dati | Perché adesso |
| --- | --- | --- | --- | --- |
| ~~**1**~~ | ~~**Riordino della navigazione**~~ **fatto il 23 agosto**, vedi sotto | nessuno | — | — |
| ~~**2**~~ | ~~**Sezione Gol nel dossier**~~ **fatta il 23 agosto**, vedi sotto | `expected_goals` | **già in linea** | — |
| ~~**3**~~ | ~~**Scala doppia e linea accesa**~~ **fatta il 23 agosto**, vedi sotto — **card per famiglia con la fascia colorata compresa**, chiusa lo stesso giorno | il motore, già in produzione | **già pronto** | — |
| ~~**4**~~ | ~~**Area Arbitri**~~ **fatta il 23 agosto**, anagrafica compresa | `referee_id` + anagrafica | **tutto in linea** | — |
| ~~**5**~~ | ~~**Area Squadre**~~ **fatta il 24 agosto**, vedi sotto — resta fuori lo storico delle gare giocate | osservazioni squadra-gara | **già in linea** | — |
| **6** | **Ritardi** (da quante gare una squadra non subisce gol, non prende un cartellino, non supera una linea) | osservazioni squadra-gara | **già in linea** | Si calcola sulle righe che il motore già legge |
| **7** | **Nomi dei giocatori**, poi l'area Giocatori | anagrafica giocatore | **assente**: la tavola ha solo `player_source_id` | 437.059 righe inutilizzabili finché non hanno un nome. Blocca il punto 8 |
| **8** | **Gol per giocatore** e marcatori | gol per giocatore | **assenti** dalla tavola | Sono negli episodi già archiviati: si ricostruiscono come è stato fatto per i cartellini |
| **9** | **Expected** come simulatore: due squadre qualsiasi più arbitro scelto | tutto quanto sopra | — | Ultima: senza le sezioni non c'è niente da simulare |

### Punto 1, chiuso il 23 agosto

- La barra ha **tre voci** — Home, Partite, Metodo — perché sono le tre pagine che
  esistono. Le entità stanno sulle tessere della dashboard e entrano nella barra quando
  la loro pagina esiste: una voce che apre il vuoto è peggio di una voce che non c'è.
- `/oggi` → `/partite`, `/giocate` → `/`, `/database` → `/`: **308 permanente**,
  verificato con `curl` su tutte e tre. `/oggi` mostrava le gare del giorno, che
  `/partite` già mostra come default; `/giocate` e `/database` erano segnaposto vuoti.
- La **tessera protagonista** della dashboard non porta più a un elenco: apre il dossier
  della gara in evidenza, `/match/[id]`, che è dove «si apre tutto». Se oggi non c'è una
  gara leggibile ripiega sul calendario.
- Tessera **Expected** aggiunta, dichiarata in arrivo, con scritto il suo mestiere: due
  squadre qualsiasi più l'arbitro scelto, non il dossier di una gara in calendario.
- Il ritorno del dossier diceva «← Oggi» in tre punti: ora dice «← Partite».
- La scheda squadra si dichiarava nella sezione `database`, ritirata: ora è `teams`, che
  non ha una voce in barra. Nessuna voce risulta attiva mentre la si legge, ed è voluto.
- **Verificato**: `tsc --noEmit`, `eslint` e `build` puliti; suite tutte verdi
  (53 · 14 · 20 · 16 · 15 dalla radice, cinque su cinque da `apps/web`); i tre rimandi
  provati con `curl`; dashboard e dossier riletti in pagina.
- **Non verificato**: il rendering a 375 px. Il ridimensionamento della finestra non ha
  preso e non ho insistito.

`/pronostici` **non è stato ritirato**: ha 385 righe di contenuto vero e nessun'altra
pagina mostra le letture del modello in elenco. È uscito dalla barra e si raggiunge dalla
dashboard. Se il suo posto sarà dentro `/partite`, si decide quando `/partite` avrà le
sezioni nuove, non prima.

### Punto 2, chiuso il 23 agosto

La sezione **Gol** e' nel dossier, sopra le giocate statistiche: gol attesi per squadra e
totali con il loro intervallo, 1X2, doppia chance, Over/Under su quattro linee, entrambe
segnano, gol esatti per squadra, i cinque risultati piu' probabili, multigol di partita e
di squadra. Nessuna richiesta nuova alla fonte e nessun modello addestrato.

**Come nascono i numeri.** Dai gol attesi osservati (`expected_goals`) nelle gare gia'
giocate della stagione: quanto una squadra ne produce dal suo lato, per quanto
l'avversaria ne concede dal proprio, misurati contro la media della competizione. Il
vantaggio del campo non e' un coefficiente: sta nei due metri di lega, diversi perche'
misurati sui due lati. Da li' due Poisson e una griglia sola, percorsa una volta: ogni
mercato e' una somma diversa sulle stesse caselle.

**Un difetto trovato e corretto in corso d'opera, con i numeri.** La prima versione, senza
ancoraggio, su Go Ahead Eagles - ADO Den Haag dava **4,55 gol attesi** alla squadra di casa,
vittoria al **95%** e Over 4,5 al **59%**, con **una gara per lato**: non era una previsione
ardita, era una gara sola moltiplicata per un'altra gara sola. Corretto con la regressione
verso la media di lega — quattro gare di ancoraggio — la stessa gara da' **1,94** e **1,74**,
esito 43/22/35, Over 2,5 al **71%**. Il test `una gara sola non diventa una stagione` esiste
per quel caso, ed e' stato **fatto fallire** rimettendo l'ancoraggio a zero: dava 6,00.

**Due limiti dichiarati in pagina, non solo nel codice.** I gol delle due squadre sono
trattati come indipendenti, quindi i risultati bassi in parita' sono sottostimati e la
probabilita' del pareggio va letta come un minimo. E con poche gare il numero resta vicino
alla media della competizione: a una gara la squadra pesa per un quinto, a dieci per il 71%.

**Copertura, misurata il 23 agosto.** Il metro di lega esiste in **27 competizioni correnti
su 28**: l'unica esclusa e' la Nigeria Premier Football League, 758 righe e **zero**
`expected_goals`. Delle **466 squadre** in stagione, **383 (82%)** hanno almeno una gara in
casa con xG, ma solo **118 (25%)** ne hanno almeno quattro; la media e' **3,4**.

**La sezione non dipende dai modelli**, quindi compare anche dove i sette bersagli non
arrivano. `proiezioniDellaGara` ora risponde con `bersagli` vuoto invece che `null` quando
ha i gol ma non i modelli, e il dossier sceglie di conseguenza.

**Verificato**: `tsc --noEmit`, `eslint`, `build` puliti; dieci prove nuove in
`test:projection-gol`, registrate in `apps/web/package.json`; tutte le altre suite verdi
(53 · 14 · 20 · 16 · 15 dalla radice, cinque su cinque da `apps/web`); la sezione riletta
nell'HTML servito su una gara vera.

**Non verificato**: il rendering a 375 px e l'aspetto in pagina. Il ridimensionamento della
finestra non ha preso e l'estensione del browser si e' disconnessa a meta' controllo.

### Punto 3, chiuso il 23 agosto: la scala doppia e la regola dell'accensione

**Da dove nasce.** L'utente ha chiesto perche', su Red Bull Bragantino - Gremio, il modello
sembrasse consigliare Over 8,5 al 54% invece di Under 9,5 al 56%. La risposta e' che **non
consigliava niente**: `match-projection-section.tsx` accendeva la **terza soglia delle
cinque per posizione**, `Math.floor(linee.length / 2)`, qualunque cosa dicesse. Un indice di
posizione letto come una raccomandazione. Nella stessa riga la lettura piu' marcata non era
quella accesa.

Va anche detto che nella domanda **8,2 era l'osservato, non l'atteso**: l'atteso era 9,3, e
9,3 sta in mezzo fra 8,5 e 9,5. Le due letture non si contraddicevano: dicevano la stessa
cosa da due lati. La pagina ora scrive «osservato» e «atteso» accanto ai due numeri, perche'
la confusione nasceva anche da li'.

**Che cosa c'e' adesso.**

- **Entrambi i lati su ogni soglia**, come nel materiale di riferimento: `O 65% U 35%`.
  Prima se ne mostrava uno solo e il confronto fra due linee richiedeva il complemento a
  mente.
- **La linea accesa segue una regola dichiarata**: si accende la soglia su cui il verso e'
  piu' deciso — la distanza da cinquanta — **fra le tre vicine al valore atteso**. Le due
  estreme non si accendono mai: con un atteso di 9,3 «Over 6,5 al 75%» e' vero e inutile,
  perche' la sua forza viene dalla distanza e non da un'informazione. A ridosso del previsto
  il verso e' quasi una moneta.
- **La seconda accensione**, tratteggiata, quando un'altra vicina dista meno di tre punti:
  sotto quella soglia il modello non sa distinguerle, e sceglierne una fingerebbe una
  precisione che non ha.
- **Ogni accensione porta la sua frase**, con i numeri: quale linea, perche' quella, quali
  sono state scartate e perche'. Senza, una casella accesa resta un consiglio implicito.

**Sulla stessa gara, prima e dopo.** Gremio fuori casa, tiri, atteso 9,3: prima si accendeva
**8,5 al 54%**, quasi una moneta; ora **Over 7,5 al 65%**, con scritto che 8,5 (54%) e 9,5
(56%) stanno troppo a ridosso del previsto. Bragantino in casa, atteso 17,0: accende **Over
15,5 al 59%** e, tratteggiata, **Under 17,5 al 57%**, che le sta a due punti.

**Un difetto trovato rileggendo la pagina vera**: la frase elencava fra le soglie «troppo a
ridosso» anche quella che poi accendeva come seconda, contraddicendosi. Corretto: si nominano
solo le scartate.

**Verificato**: sette prove nuove in `test:linea-scelta`, registrate in `package.json`, e
**fatte fallire** rimettendo il criterio posizionale — quattro su sette diventano rosse, fra
cui il caso Gremio. `tsc`, `eslint` e `build` puliti; tutte le suite verdi; la scala riletta
sulla gara 7231.

### Punto 3, il seguito: le card per famiglia, chiuse il 23 agosto

Le sette famiglie erano righe dentro un pannello unico. Ora sono **sette card, ognuna con
la sua fascia piena in testata**, come nelle foto. L'utente ha scelto la fascia piena
sapendo che cosa costava, e il costo è stato **scritto nel master invece che aggirato**:

- **Un errore mio, corretto misurando.** Avevo detto — e il piano lo ripeteva — che una
  testata colorata chiedeva colori fuori dalla tavolozza. Falso: `MASTER.md` ha già
  `--card-brand` `#6E1522` con l'etichetta «brand, **testate**». Fuori dalla tavolozza era
  solo il colore **diverso per famiglia**.
- **Le regole toccate sono due, non una.** «Il colore dichiara un verso» prende
  un'eccezione nominata: le sette famiglie, dove il colore dichiara un'identità che è anche
  **scritta** accanto, quindi nessuna informazione vive solo nel colore. E «un solo blocco
  ad alto contrasto per pagina» prende una deroga limitata al dossier, che passa da uno a
  otto blocchi. Entrambe stanno in `MASTER.md` con la data e il perché.
- **Le sette tinte, con il contrasto misurato** del testo `#FBF7F3` sopra la fascia: tiri
  bordeaux `#6E1522` **10,99**, tiri in porta tabacco `#7A4E1D` **6,71**, falli indaco
  `#3E3A8C` **9,00**, corner petrolio `#1F5673` **7,47**, gialli senape `#7A5C00` **5,87**,
  parate prugna `#5B3A6E` **8,66**, fuorigioco grafite `#403E3A` **10,01**. Il minimo è
  5,87 contro il 4,5 di AA. Nessuna tinta entra negli intervalli del verde (162°) e del
  mattone (8°), che dicono un verso.
- **Nome e tinta stanno nella stessa tabella** in `match-projection-section.tsx`: due
  tabelle separate divergerebbero al primo bersaglio nuovo, e una famiglia senza tinta
  prenderebbe il bordeaux in silenzio, cioè due card dello stesso colore.
- **La fascia è alta 43 px**, quanto una riga di titolo: è la condizione a cui la deroga
  regge. E a 375 px se ne vede **una alla volta**, perché una card è alta più di uno
  schermo: il rischio «sette fasce che gridano insieme» non si materializza.

**Un difetto vero, precedente e trovato solo perché i 375 px non erano mai stati
guardati.** `ul.engine-rows` era una griglia con colonna implicita `auto`, che si dimensiona
sul contenuto invece che sul contenitore: nella sezione Gol la colonna risolveva a **348 px**
dentro un contenitore di **278**, e la pagina andava in **overflow orizzontale** —
`scrollWidth` 387 contro un viewport di 371. Corretto con `grid-template-columns:
minmax(0, 1fr)`, una riga che vale per tutti e quattro i chiamanti di `.engine-rows`: dopo,
`scrollWidth` **360** su **375**, nessun overflow.

**Verificato**: `tsc --noEmit`, `eslint` e `build` puliti; suite verdi — 53 · 14 · 20 · 16 ·
15 · 9 dalla radice, 61 da `apps/web` con due che si saltano senza connessione; le sette
card rilette in pagina a **1440 px** e a **375 px**, con le tinte lette da
`getComputedStyle` e non dedotte dal codice.

**Non verificato**: 768 e 1024 px. `resize_window` dell'estensione risponde «riuscito» e
lascia la finestra a 1366 — misurato, `window.outerWidth` non cambia. I 375 px sono stati
misurati con un iframe della stessa origine largo 375, dove le media query rispondono al
viewport dell'iframe.

### Le soglie impossibili, chiuse il 23 agosto

**Trovate guardando la pagina a 375 px, non leggendo il codice.** `soglieDi` in `match.ts:88`
centra cinque soglie su `Math.round(atteso) - 0,5` senza pavimento: dove l'atteso è basso le
prime finiscono sotto zero. Sul dossier 7231 erano **5 scale su 21**, con **6 soglie
negative** — cartellini gialli su entrambi i lati, fuorigioco su entrambi (due sole sul
Bragantino: `-1,5 -0,5 0,5 1,5 2,5`), parate in casa.

**Non era uno slot sprecato, era una lettura falsata.** La regola dell'accensione confronta
**le tre centrali**: sul fuorigioco del Bragantino le tre erano `-0,5`, `0,5` e `1,5`, e la
più decisa è `-0,5` **al 100%** — una casella accesa su un evento certo, che spingeva fuori
l'unica soglia vera.

**Corretto dove il numero si mostra, non nel motore, e la ragione è misurata.** Il primo
tentativo ha filtrato in `soglieDi`: `test:match` è diventato rosso su **5 prove su 15** —
`goalkeeper_saves`, `offsides`, `yellow_cards` — perché **le stesse cinque soglie le
costruisce Python** (`total.py:312`) e il campione di riscontro le confronta una per una.
Togliere le negative al motore vuol dire rigenerare i campioni di riscontro e gli artefatti
di calibrazione: è una decisione sul modello, e resta aperta. Il filtro vive in
`soglieReali`, dentro `linea-scelta.ts`, e la pagina lo applica **prima** di disegnare la
scala e **prima** di scegliere che cosa accendere.

**La pagina lo dice.** Dove si vedono meno di cinque soglie, il testo della sezione spiega
perché: le altre cadrebbero sotto zero, e un conteggio non scende sotto zero.

**Verificato**: due prove nuove in `test:linea-scelta`, che passa da 7 a **9**, e **fatte
fallire** togliendo il filtro — due rosse su nove, fra cui quella che mostra la regola
accendere `-0,5`. `test:match` torna **15 su 15**, quindi la parità con Python è intatta.
`tsc`, `eslint` e `build` puliti. Pagina riletta: **157 soglie, zero negative**, contro le
sei di prima.

### Punto 5, chiuso il 24 agosto: l'Area Squadre

**La decisione che teneva fermo tutto il resto: su quale finestra poggiano le statistiche.**
L'utente ha scelto gli **ultimi 365 giorni** per le descrittive e il Confronto; le
classifiche restano dentro competizione e stagione, dove la finestra non si sceglie.

**I numeri che hanno deciso**, misurati sul container locale. Sui tiri per gara la
variabilità **dentro** la stessa squadra vale `sd = 4,86`, la differenza vera **fra** squadre
`sd = 2,15`. Con le 7,1 gare medie della stagione corrente l'errore della media è **1,84**,
cioè l'**85%** della differenza che si vorrebbe misurare, e **281 squadre su 590** non
arrivano nemmeno a cinque gare. Con le **30,9** gare medie dei 365 giorni l'errore scende a
**0,87**, il 40% della differenza vera, e le squadre sopra soglia salgono a **534 su 590**.
La finestra è **scritta in pagina** con la prima e l'ultima gara che la compongono, perché
scavalca il confine di stagione e chi legge deve saperlo.

**Venti bersagli, dieci aperti e dieci a richiesta**, come ha chiesto l'utente. I dieci
principali sono i sette del motore più gol fatti, subiti e attesi: le stesse parole che il
dossier e il metro usano già. I dieci di dettaglio — possesso, tiri in area, grandi
occasioni, passaggi e precisione, cross, dribbling, contrasti, intercetti, duelli — stanno
**nella stessa riga del database**, quindi non costano una richiesta in più: costano una riga
di tabella ciascuno. Stanno dentro un menù richiudibile perché venti righe aperte insieme non
si leggono.

**Il Confronto porta il suo errore, ed è il pezzo che vale.** Due medie diverse non sono due
squadre diverse: ogni riga dice se lo scarto supera **due errori standard**, e quando non li
supera lo scrive. Su FC Cincinnati contro Inter Miami i **gol fatti** differiscono di 0,67
con errore ±0,37 e **non reggono**; i **gol attesi** di 0,53 con errore ±0,22 e **reggono**.
Fra due letture si sceglie quella che regge, non quella con il numero più alto.

**Che cosa c'è in pagina.** `/squadre` con Classifiche e Confronto, filtro per competizione e
per bersaglio; nella scheda squadra, sotto «Dove sta nel campionato», la sezione «Che cosa fa
in una gara» con le stesse venti voci e il campione di ciascuna — sul Corinthians i tiri
poggiano su 42 gare, i gialli su 41, il fuorigioco su 39.

**`Squadre` entra nella barra**, che arriva a cinque voci, il tetto dichiarato
dall'architettura informativa. Segue il precedente di Arbitri: una voce entra quando la sua
pagina esiste.

**Zero CSS nuovo.** `details.squad-group`, `.squad-metric-*` e `.squad-stat` esistevano già
nella scheda squadra. Niente verde e niente mattone: qui «più falli» non è meglio né peggio.

**Un difetto mio, corretto rileggendo la pagina.** La differenza usciva con due decimali dove
le medie ne avevano uno — medie 13,6 e 14,7, differenza «1,05» — e chi sottraeva non
ritrovava il numero. Ora le tre quantità della riga si leggono con le stesse cifre, e lo
scarto stampato è quello fra i due numeri stampati; il criterio «regge» resta sulla
differenza vera.

**Verificato**: `tsc --noEmit`, `eslint` e `build` puliti; diciotto suite verdi — 53 · 14 ·
20 · 16 · 15 · 9 dalla radice, 3 · 2 · 5 · 10 · 9 · 9 · 4 · 25 · 7 · 2 · 3 · 3 da
`apps/web`. Le tre prove nuove di `test:team-stats` sono state **fatte fallire**: **89 contro
53** togliendo la finestra dei 365 giorni, **21 contro 58** togliendo il filtro di stagione,
`expected false / actual true` abbassando la soglia dei due errori standard. Le pagine
rilette nell'HTML servito.

**Non verificato**: l'aspetto in pagina a qualunque larghezza. Il browser guidato
dall'assistente non rende le pagine — resta sul fallback di `app/loading.tsx` con il
contenuto presente nel DOM ma dentro un `div hidden`, e il marcatore Suspense nel body è
`$~` — mentre le stesse pagine si vedono normalmente in un browser comune, verificato
dall'utente sulla produzione. È un limite dello strumento, non del prodotto.

**Resta fuori**: lo **storico delle gare giocate** nella scheda squadra, che il punto 5
elencava fra i Dettagli.

### Punto 4, chiuso il 23 agosto: l'area Arbitri

**Il blocco che nessuno aveva visto.** Il piano diceva «680 arbitri raccolti e mai
mostrati». Misurato: **tutti e 681 senza nome**, anche sul database in linea — 681 righe
`Arbitro NNNN (segnaposto locale)`, zero paesi. Il segnaposto e' voluto in
`export_reference_local.py:178`, perche' al motore il nome non serve. Una classifica di
«Arbitro 2433» non e' una pagina, quindi il punto 4 non era un lavoro di interfaccia: era
un'anagrafica mancante.

**Raccolta.** `scripts/projection/harvest/fetch_referees.py`, che riusa il client gia'
esistente: **1.333 arbitri** con nome e paese, e i nostri **681 coperti tutti, zero
scoperti**. Le medie che la fonte pubblica **non si usano**: restano nel loro elenco. Le
nostre si calcolano sulle nostre osservazioni, con il campione accanto.

Lo script **non tocca il database**: l'aggiornamento e' un passo separato. Applicato prima
sul container locale, poi **sul database in linea con la conferma esplicita dell'utente**:
**681 righe scritte, zero segnaposto rimasti, 678 con il paese, 54 paesi distinti**,
verificato da due canali diversi. La passata usa `on conflict (source_id) do nothing`,
quindi i nomi non tornano segnaposto.

**Un secondo segnaposto, trovato solo perche' la verifica e' stata fatta sul database
giusto.** Scritti i nomi degli arbitri, la stessa interrogazione in linea rispondeva
«Competizione 38» dove in locale diceva «Segunda Division»: **29 competizioni su 29 senza
nome**, mentre le squadre ce l'avevano gia' (587 su 590). L'area Arbitri mostra il nome
della competizione a ogni riga, quindi in produzione sarebbe stata illeggibile. I nomi
esistevano gia' nel container locale e sono stati copiati da li', senza chiamare la fonte:
**36 competizioni aggiornate, zero segnaposto rimasti**.

Restano segnaposto **55 stagioni** e **3 squadre**: nessuna delle due compare nell'area
Arbitri, quindi non bloccano, ma sono lo stesso debito e vanno chiuse quando una pagina le
mostrera'.

**Gli indici, progettati e non copiati.** Le foto mostrano tre indici centrati su cento con
una scala a cinque fasce, da «permissivo» a «severo»: sono formule del prodotto di
riferimento e `AGENTS.md` vieta di copiarle. Qui la posizione si dice **come posizione**:
«ammonisce piu' del 97% dei colleghi di questa competizione, su 31 con almeno cinque gare».
Nessuna soglia decisa a tavolino, e la scala e' la distribuzione vera, che si muove con i
dati invece di restare ferma.

**Due regole che tengono onesto il conto.** Una gara entra solo se abbiamo **entrambe** le
righe (`having count(*) = 2`): con una sola, falli e cartellini della gara sarebbero
dimezzati senza che si veda. E un arbitro entra da **cinque gare** in su: sotto, una media
racconta la serata e non il direttore.

**Che cosa c'e' in pagina.** `/arbitri` con le 25 competizioni che superano la soglia, tre
letture (gialli, falli, espulsioni) e la classifica; `/arbitri/[refereeId]` con medie,
metro della competizione, posizione fra i colleghi, scomposizione contro casa e contro
l'ospite, e lo storico delle gare. Ogni blocco porta la sua frase: dove lo squilibrio fra i
due lati e' dentro il rumore lo dice, dove non lo e' lo quantifica.

**La connessione e' una sola.** Stava dentro `projection-runtime.ts` e serviva al motore;
ora vive in `lettura.ts` e la usano entrambi. Nessuna variabile nuova, un pool solo.

**Verificato**: cinque prove d'integrazione in `test:arbitri`, che si **saltano** senza
connessione e passano con — e **fatte fallire** abbassando la soglia delle gare minime, tre
su cinque diventano rosse. `tsc`, `eslint`, `build` puliti; tutte le altre suite verdi;
indice e scheda riletti in pagina con nomi, medie e posizioni veri.

**Non verificato**: l'aspetto a 375 px, e lo stato HTTP della pagina «non trovato» sulla
build di produzione — in sviluppo il contenuto e' giusto ma lo stato resta 200.

## 5. Che cosa NON fare

Ognuna di queste è già stata valutata con un numero, non è un'opinione.

- **Non riaddestrare i quattordici modelli** e non correggere la divergenza del lato che
  addestra: costa la ricostruzione completa e sposta lo 0,5–1,4% su una media di lega.
- **Non aggiungere altri bersagli** al motore: sette bastano, e non sono il prodotto.
- **Non chiamare la fonte per gli aggregati.** `getTeamSeasonSplits` costa **una richiesta
  per gara**, circa quaranta per dossier, su una pagina che già impiega 4,9 secondi. Ogni
  aggregato passa dal livello dati.
- **Non aprire una pagina senza il suo read model**: è la regola già scritta in
  `AGENTS.md`, ed è il motivo per cui `/competizioni` e `/giocatori` non esistono ancora.
- **Non toccare il design system** né inventare CSS: le sezioni nuove riusano le classi del
  dossier.
- **Non spostare la passata notturna** fuori dal PC finché il prodotto non è pronto: sui
  minuti gratuiti di GitHub i conti non tornano, ed è un problema di infrastruttura, non di
  prodotto.
- **Non passare Stripe in live** prima della fase 6 del piano storico.
- **Non aprire un fronte nuovo prima di aver chiuso quello in corso**: è ciò che ha portato
  qui.

## 6. Debiti aperti, da chiudere quando toccano il percorso

- Il nome della fonte compare in `apps/web/src/app/api/matches/route.ts` (`@/lib/bsd`) e nel
  campo `"source":"bsd"` della risposta pubblica: va tolto quando si mette mano a quella rotta.
- ~~Il peso del database~~ **sciolto il 23 agosto**: dopo la passata autonoma il database
  in linea è a **179 MB su 500**, cioè +4 rispetto ai 175 del giorno prima. Non cresce di
  58 MB a notte e la quota non è a rischio.
- La passata notturna non scrive un log e gira solo a sessione aperta.
- La proiezione non compare sotto la quarta giornata né fuori dalle 29 competizioni raccolte.
- ~~La cartella delle schermate dentro il repository~~ **sciolto il 23 agosto**: le **50
  immagini**, **23 MB** di schermate di un prodotto di terzi, sono state spostate fuori
  dalla radice in `../foto-frontend-iqstats/`. La riga `foto frontend app iqstats/` resta
  in `.gitignore` come rete se rientrassero.
- L'area Arbitri chiede **indici** che le foto mostrano già costruiti (disciplinare,
  rigori, generale, con una scala a cinque fasce). Sono formule del prodotto di
  riferimento: `AGENTS.md` vieta di copiarle. Vanno progettate, con la loro scala e la
  loro giustificazione, prima di costruire la pagina.
