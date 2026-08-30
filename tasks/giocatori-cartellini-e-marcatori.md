# Probabili ammoniti e probabili marcatori — piano

Deciso il **30 agosto 2026** su richiesta dell'utente. È il primo pezzo concreto della voce 15
del piano di allineamento (`tasks/allineamento-powerstats.md`): la sezione Giocatori nasce da
qui, non da una scheda anagrafica.

Lo spunto sono quattro immagini portate dall'utente: schede a quattro blocchi, ognuno con un
titolo breve e due righe che dicono perché quel giocatore rischia il cartellino. **Si prende la
funzione**, come impone `AGENTS.md`: non il blu, non il giallo, non l'impaginazione, non i
titoli, che sono testi e marchio di un altro prodotto.

La misura di copertura che regge tutto questo è `docs/product/copertura-giocatori.md`.

---

## 1. Che cosa si costruisce

Due letture nel dossier della gara, dalla comparsa della formazione probabile in poi:

- **Chi rischia il cartellino** — pochi giocatori nominati, ciascuno con il numero che lo ha
  messo lì e la frequenza osservata, non un aggettivo.
- **Chi può segnare** — stessa forma, stessa regola.

Ogni blocco porta **accanto** il motivo per cui è stato scelto e i numeri che lo giustificano.
È la regola del progetto, e qui pesa più che altrove: si sta nominando una persona.

## 2. Che cosa non si costruisce, e perché

**I blocchi di racconto tattico.** «Volpato entra dentro, Cinquegrano sale: deve scegliere e
può arrivare in ritardo» è osservazione umana su come si muovono due giocatori. Non sta in
nessun campo della fonte — non esistono tracciamento posizionale, marcature né azioni
individuali. Generarla significherebbe inventarla, e inventare è vietato.

**Le percentuali composte** su più giocatori insieme, finché la correlazione non è dichiarata:
vale la stessa regola delle voci 16 e 18 del piano.

**`ai_score`, `rating`, `potential`, `market_value_eur`, `wage_eur_annual`**: numeri altrui
calcolati con metodi che non conosciamo, o non statistiche affatto.

## 3. Contratto dati — misurato il 30 agosto, non supposto

| Serve | Da dove | Stato misurato |
| --- | --- | --- |
| chi scende in campo | `/api/v2/events/{id}/lineups/` | `predicted` da ~10 giorni prima, `confirmed` a formazioni ufficiali, `unavailable` a 14 giorni |
| passato del giocatore | `/api/v2/players/{id}/stats/` | righe per gara, 271 per un titolare di Serie A |
| numeri della gara | `/api/v2/events/{id}/player-stats/` | 100% dei campi che servono, sulle righe di chi ha giocato |
| metro dell'arbitro | `/api/v2/referees/` | 1.350 arbitri, con `avg_yellow_per_match` e `avg_fouls_per_match` |
| contesto | `/api/v2/events/` | `is_local_derby` sull'evento |

Campi usati, tutti presenti sul 100% delle righe giocate in Serie A: `minutes_played`, `fouls`,
`was_fouled`, `yellow_card`, `total_tackle`, `won_tackle`, `duel_won`, `duel_lost`,
`total_shots`, `shots_on_target`, `goals`, `key_pass`. **`expected_goals` è nullo esattamente
quando i tiri sono zero**, quindi vale zero e non è mai mancante.

**Dove la sezione può esistere:** solo dove la fonte copre. Al 30 agosto, sulla stagione in
corso, 42 campionati su 63 sono coperti per intero e 13 sono a zero — Europa League 0/80 fra
questi. La copertura si accende e si spegne nel tempo, quindi **non si scrive un elenco di
leghe ammesse**: si chiede la gara, e se il dato non c'è si dichiara assente.

## 4. Il segnale esiste? Misurato su 28 campionati

**254.743 casi**, 28 campionati, dalla raccolta locale `harvest/data/` — 10.716 gare già sul
disco, nessuna richiesta di rete. Il passo del giocatore è calcolato **solo sulle gare
precedenti** dentro la stessa stagione, con almeno novanta minuti alle spalle. Riproducibile
con `.venv/Scripts/python.exe scripts/projection/dataset/build_player_base.py`.

### 4.0 L'errore che ha invalidato la prima misura

La prima misura leggeva il giallo dal campo `yellow_card` delle righe per giocatore.
**È un sottoinsieme.** Sulle stesse 395 gare di Serie A, `/events/{id}/incidents/` attribuisce
il giallo a **1.470 giocatori**, il campo ne dichiara **907**: ne mancano **564, il 38,4%**, e
in qualche gara mancano tutti. Le righe non inventano mai — 906 dei 907 stanno anche negli
episodi — ma perdono. Con quell'etichetta la Serie A risultava all'8,0% invece che all'11,8%,
e due campionati risultavano all'1,8% e al 2,3%, che è impossibile.

**Il giallo si legge dagli episodi.** I gol invece combaciano — 938 dalle righe contro 961
dagli episodi, la differenza sono gli autogol — e restano presi dalle righe.

Gli episodi portano anche il minuto: **il 50,3% dei gialli arriva dopo il 60'** (mediana su 28
campionati). Il blocco «dopo l'ora di gioco» delle immagini di riferimento è misurabile.

### 4.1 Cartellino — base mediana 13,4% per giocatore in campo

| Fattore | Gruppo più basso | Gruppo più alto | Cresce sempre in |
| --- | ---: | ---: | --- |
| contrasti per 90 | 0,67x | **1,25x** | 14 leghe su 26 |
| falli per 90 | 0,69x | 1,17x | 10 leghe su 26 |
| gialli per 90 | 0,85x | 1,16x | 16 leghe su 28 |
| media gialli dell'arbitro | 0,91x | 1,01x | **2 leghe su 25** |

Le quote sono rispetto alla base del campionato stesso, non a una media generale.

**Il segnale del cartellino è debole e non tiene fuori dalla lega dove lo si guarda.** Il
fattore migliore porta da 13,4% a circa 17%: il candidato più esposto **non prende il giallo
quattro volte su cinque**. E nessun fattore cresce in modo ordinato in più di sedici campionati
su ventotto: metà delle volte i gruppi si scavalcano.

**L'arbitro, per giocatore, non è un segnale**: 1,01x nel gruppo più severo, e cresce in ordine
in due campionati su venticinque. Non significa che l'arbitro non conti — conta **per la
squadra**, dove il repository lo modella già (`yellow_cards__poisson_glm`, in produzione): un
arbitro più severo dà più cartellini alla gara, ma spalmati su ventidue giocatori il singolo
quasi non se ne accorge. C'è anche un limite di misura: la media dell'arbitro qui è calcolata
dentro la stagione con almeno cinque gare, e per molti arbitri sono poche — va rifatta
mettendo insieme più stagioni prima di dichiararla morta.

**Il derby non regge.** Su Serie A da sola dava 1,68x, ma su 121 casi. Su nove campionati con
almeno cento casi la mediana è **1,10x**: era rumore.

**Un blocco delle immagini si fonda su un fattore che non regge.** «Ha subito quattro falli e
provocato due gialli: chi esce su di lui rischia» usa i falli subiti, che non predicono il
giallo di quel giocatore. Potrebbero predire il giallo di *chi lo affronta*: quantità diversa,
non ancora misurata, sta fra le domande aperte.

### 4.2 Gol — base mediana 8,0% per giocatore in campo

| Fattore | Gruppo più basso | Gruppo più alto | Cresce sempre in |
| --- | ---: | ---: | --- |
| xG per 90 | 0,26x | **2,28x** | 24 leghe su 26 |
| tiri per 90 | 0,24x | 2,19x | **26 leghe su 26** |
| tiri in porta per 90 | 0,41x | 2,18x | **26 leghe su 26** |
| gol per 90 | 0,58x | 2,17x | 22 leghe su 22 |

**Il marcatore si prevede bene, e ovunque.** Il gruppo più alto segna circa **il doppio** della
base del suo campionato — dall'8,0% a circa il 18% — e il più basso un quarto. I tiri per 90
crescono in ordine in **tutti e ventisei** i campionati misurati: è il segnale più solido di
tutto il progetto per giocatore.

I quattro fattori dicono in gran parte la stessa cosa e **non vanno sommati** come se fossero
indipendenti.

### 4.3 Campi vuoti che sembrano dati

`fouls` è **zero su tutte le righe** in due campionati (identificativi 47 e 82), e su meno di un
terzo delle righe in un terzo. Lo script lo dichiara con `falli_utilizzabili`: dove è falso,
il blocco sui falli non si mostra, non si mostra a zero.

## 5. Le fasi

Nessuna fase comincia prima che la precedente sia verificata.

### Fase 1 — il retrospettivo su più leghe — **fatta il 30 agosto**

28 campionati, 254.743 casi, dalla raccolta locale. Esito nel §4:
`scripts/projection/dataset/output/giocatori-base.json`.
*Verifica:* lo script si ferma con un `AssertionError` se Wilson o i quantili si rompono —
provato mutando il raggio dell'intervallo, che fa scattare l'asserzione. Dichiara da sé i
fattori con troppi pari merito e i campi vuoti.

**Esito che cambia il piano:** il gol regge ovunque, il cartellino no. La sezione dei marcatori
può proseguire; quella dei cartellini ha un segnale debole e incostante, e non deve promettere
più di quello che ha. Le due sezioni **non sono la stessa funzione con bersaglio diverso**,
come sembrava all'inizio.

### Fase 1b — decisa dall'utente il 30 agosto: **frequenza prima, probabilità dopo**

I blocchi mostrano una frequenza osservata con il suo campione — «sta nel gruppo che poi prende
il giallo il 17% delle volte, su N casi» — non una probabilità. È vero da subito e non ha
bisogno di taratura. *Criterio:* nessun blocco senza il suo campione accanto.

### Fase 2 — la stima, e la sua taratura

La stima più semplice che regge, non la più elegante. *Criterio di accettazione, e non è
negoziabile:* **taratura misurata su un periodo tenuto fuori dall'addestramento**, diviso per
data e non a caso. Quando la stima dice 20%, fra i casi che lei ha messo al 20% ne devono
uscire circa venti su cento. Se non succede, **la sezione non esiste**: è la voce 23 del piano
applicata a se stessa, e la taratura è la cosa che nessun concorrente ha.
*Verifica che sa diventare rossa:* la stessa misura applicata a una stima volutamente storta
deve fallire il controllo. Se non fallisce, il controllo non vale.

### Fase 3 — la lettura in pagina

Solo qui si progetta, e con la skill `taste`. Ogni blocco: chi, il numero che lo ha scelto, la
frequenza osservata, il campione. Nessun blocco senza numero. Nessun colore fuori dal sistema.
La formazione dichiarata come **probabile** finché è `predicted`, e ridisegnata quando diventa
`confirmed`.
*Verifica:* 375, 768, 1024 e 1440 px, tastiera, contrasto, `prefers-reduced-motion`, e la
cattura guardata, non solo le misure.

### Fase 4 — il consuntivo

Come la voce 17 del piano: accanto alla lettura sta **quanto ha preso e quanto ha sbagliato**,
non solo le volte che ha indovinato.

## 6. Checkpoint umani

1. **Prima della fase 2**: l'utente vede i rapporti delle altre leghe e decide se il segnale
   basta.
2. **Prima della fase 3**: l'utente vede la taratura e decide se la lettura si può mostrare.
3. **Prima di pubblicare**: come sempre, nessun passaggio su `main` senza richiesta.

## 7. Domande aperte, da misurare e non da decidere

1. I falli subiti da un giocatore predicono il giallo di **chi lo affronta**? Serve unire le
   righe delle due squadre della stessa gara. È l'unico modo per recuperare il blocco delle
   immagini che oggi non regge.
2. ~~Il derby regge?~~ **Chiuso il 30 agosto: no.** 1,10x di mediana su nove campionati con
   almeno cento casi. Il 1,68x della Serie A era rumore su 121 casi.
3. ~~Il minuto conta?~~ **Chiuso: sì, e si misura.** Il 50,3% dei gialli arriva dopo il 60'.
4. ~~La posizione in campo cambia la frequenza di base?~~ **Chiusa il 30 agosto: sì, ed è il
   fattore più forte e più costante che abbiamo.** Misura per esteso nel §10.
5. L'arbitro rifatto **su più stagioni** invece che dentro una sola, e ristretto verso la media
   della sua lega: 1,01x oggi può essere rumore di stima, non assenza di effetto.
6. Il secondo giallo e l'espulsione: gli episodi separano `yellow`, `yellowRed` e `red`; il
   `yellowRed` compare 26 volte su 395 gare di Serie A, campione troppo sottile per una lettura
   a sé.

## 8. Rischi dichiarati

- **Si nominano persone.** Un blocco che dice «rischia il giallo» accanto a un nome deve
  reggere il numero che lo giustifica, sempre.
- **La copertura della fonte si spegne senza preavviso**, come è successo all'Europa League a
  luglio. La sezione deve sparire da sola quando il dato manca, non mostrare un vuoto.
- **La formazione probabile è di un altro**, dichiarata `beta`. Se sbaglia gli undici, la
  lettura è costruita su giocatori che non giocheranno: va detto in pagina finché è `predicted`.
- **Il campione di agosto è corto.** Serie A ha 15 gare in questa stagione: le medie per
  giocatore vanno prese dalla stagione precedente finché quella in corso non regge da sola.

---

## 9. Quanto campione serve — misurato il 30 agosto

Domanda dell'utente: se un campionato ha giocato due giornate, si usano quelle due, e le
medie si solidificano andando avanti? **Sì, e si misura.** Separando i casi per minuti già
giocati dal giocatore, mediana su 28 campionati:

| Gare alle spalle | Gol, gruppo alto | Gol, scarto alto−basso | Giallo, scarto |
| --- | ---: | ---: | ---: |
| 1-3 | 1,95x | 1,50x | 0,40x |
| 3-6 | 2,04x | 1,71x | 0,48x |
| 6-12 | 2,24x | 2,04x | 0,51x |
| 12-24 | 2,50x | 2,35x | 0,68x |
| oltre 24 | 3,03x | 2,95x | 0,73x |

Riproducibile con `--stabilita`.

**Il segnale esiste già dalla seconda gara** — il gruppo che tira di più segna quasi il doppio
della base anche con una sola gara alle spalle — e quasi raddoppia il suo scarto a stagione
inoltrata. Non c'è quindi una soglia sotto la quale non si mostra niente.

**C'è però una conseguenza per la pagina, e non è negoziabile:** il campione si scrive accanto
al numero. «Su 2 gare» e «su 24 gare» non pesano uguale, e chi legge deve poterlo vedere senza
chiederlo.

---

## 10. Il ruolo in campo — misurato il 30 agosto 2026

Il ruolo non stava da nessuna parte: né nelle settantacinque colonne delle righe per giocatore
sul disco, né nelle quattordici della tavola del motore. Sta sulla rosa della squadra, e fra
rosa e profilo si è scelta la rosa: **591 chiamate invece di 21.346**, una per squadra invece
di una per giocatore, per lo stesso campo. Le rose stanno in
`scripts/projection/harvest/data/squads/`, raccolte da
`scripts/projection/harvest/fetch_squads.py`; la misura si rifà con
`build_player_base.py --ruolo`.

**Copertura: 224.836 casi su 254.743, l'88,3%.** Per lega va da un minimo del 70,3% a un
massimo del 99,2%, con mediana 88,5%. Chi manca ha cambiato squadra o ha smesso: la rosa è
quella di oggi. **`None` non è una quinta classe di ruolo** e i casi senza ruolo restano
contati a parte, non spalmati sugli altri.

### 10.1 Il cartellino

| Ruolo | Frequenza mediana | Sulla base della sua lega |
| --- | ---: | ---: |
| Difensore | 16,5% | **1,22x** |
| Centrocampista | 14,3% | 1,04x |
| Attaccante | 10,6% | 0,76x |
| Portiere | 5,9% | 0,42x |
| senza ruolo noto | 13,2% | 0,94x |

Base mediana di lega 13,4%. **L'ordine difensore, centrocampista, attaccante, portiere regge
in 26 campionati su 27**; il difensore sta sopra l'attaccante in **27 su 27** e il portiere è
ultimo in 26 su 27.

**È il fattore più forte del cartellino, e per distacco.** Il migliore misurato prima erano i
contrasti per 90: 1,25x, e cresceva in ordine in 14 leghe su 26. Il ruolo dà 1,22x fra i
difensori contro 0,76x fra gli attaccanti, cioè **1,61x fra i due estremi di movimento**, e
regge quasi ovunque. Si conosce inoltre **prima della prima partita**, mentre un per-novanta
ha bisogno di novanta minuti alle spalle.

### 10.2 E infatti i contrasti erano il ruolo travestito

Lo stesso fattore, misurato **dentro un ruolo solo**:

| Fattore, dentro il ruolo | Difensori | Centrocampisti | Attaccanti |
| --- | --- | --- | --- |
| contrasti per 90 | 1,12x, ordina in 3/28 | 1,50x, in 11/28 | 1,04x, in 2/28 |
| falli per 90 | 1,40x, in 10/28 | 1,57x, in 15/28 | 1,54x, in 3/28 |

**Fra i difensori i contrasti quasi non dicono più niente**: da 1,25x a 1,12x. Buona parte di
quello che «contrasti per 90» misurava era il ruolo, ed è la risposta alla domanda che aveva
aperto questa misura. **I falli invece sopravvivono**: 1,40x fra i difensori e 1,57x fra i
centrocampisti, quindi portano qualcosa di proprio oltre al ruolo.

**Un limite di lettura, dichiarato.** Dividere per ruolo taglia il campione di tre o quattro
volte, e la crescita ordinata su cinque gruppi è un criterio severo che con meno casi si
soddisfa meno spesso: il crollo da 14/26 a 3/28 è in parte potenza statistica e non solo
segnale. Il restringimento del rapporto, da 1,25x a 1,12x, **non** è un effetto della potenza:
quello misura la grandezza dell'effetto, e si è ristretto davvero.

### 10.3 Il gol

| Ruolo | Frequenza mediana | Sulla base della sua lega |
| --- | ---: | ---: |
| Attaccante | 18,4% | **2,26x** |
| Centrocampista | 8,9% | 1,10x |
| Difensore | 3,6% | 0,45x |
| Portiere | 0,0% | 0,00x |

Base mediana 8,0%. **L'ordine attaccante, centrocampista, difensore, portiere regge in 27
campionati su 27**, senza una sola eccezione.

Il ruolo vale quanto i tiri per 90 (2,19x, 26/26) ma **non è un secondo fattore da sommare**:
un attaccante tira di più, e le due cose dicono in gran parte la stessa cosa. La lettura
giusta è che il ruolo dà la base da cui partire, disponibile dal minuto zero, e i tiri la
correggono quando c'è storia.
