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

## 4. Il segnale esiste? Misurato, Serie A 2025/26

380 gare, 11.920 righe con minuti sopra zero, **9.253 casi** con almeno cinque gare alle
spalle. La media del giocatore è calcolata **solo sulle gare precedenti** a quella da prevedere:
includere la gara stessa gonfierebbe ogni numero qui sotto. Riproducibile con
`node scripts/verification/segnali-cartellini.mjs 4 2025-08-01 2026-05-31`.

### 4.1 Cartellino — frequenza di base 8,9%

| Fattore, calcolato prima della gara | Dal gruppo più basso al più alto | Rapporto |
| --- | --- | ---: |
| gialli per 90 del giocatore | 6,5% → 13,5% | **1,52x** |
| contrasti per 90 | 4,7% → 11,2% | 1,27x |
| media gialli dell'arbitro | 6,2% → 11,1% | 1,26x |
| falli per 90 | 5,7% → 10,3% | 1,16x |
| derby (121 casi) | 8,9% → 14,9% | 1,68x |
| duelli persi per 90 | **non monotono**, sale e poi riscende | — |
| falli subiti per 90 | 7,9% – 10,0% – 8,0% | **nessun segnale** |

**Il segnale è vero ma modesto.** Il fattore più forte da solo porta da 8,9% a 13,5%. Anche
combinando i tre indipendenti, il candidato più a rischio starà **attorno al 20%**, non al 60%:
quattro volte su cinque non prenderà il giallo. La sezione deve dirlo, o promette una certezza
che i numeri non sostengono.

**Il derby è il rapporto più alto ma il campione più piccolo**: 121 casi. Va rimisurato su più
stagioni prima di appoggiarci un blocco.

**Una delle immagini si fonda su un fattore che qui non regge.** «Ha subito quattro falli e
provocato due gialli: chi esce su di lui rischia» usa i falli subiti. Misurato: i falli subiti
da un giocatore **non predicono il giallo di quel giocatore**. Predicono forse il giallo di
*chi lo affronta*, che è una quantità diversa e non ancora misurata — sta fra le domande
aperte, non fra le cose smentite.

### 4.2 Gol — frequenza di base 7,4%

| Fattore, calcolato prima della gara | Dal gruppo più basso al più alto | Rapporto |
| --- | --- | ---: |
| xG per 90 | 1,5% → 16,0% | **2,16x** |
| tiri per 90 | 1,5% → 16,0% | 2,16x |
| tiri in porta per 90 | 2,3% → 15,9% | 2,14x |
| gol per 90 | 4,2% → 15,2% | 2,05x |
| grandi occasioni sbagliate per 90 | il valore è zero per quasi tutti | inutilizzabile |
| derby | 7,4% → 8,3% | 1,11x, niente |

**Il marcatore si prevede meglio dell'ammonito**, e di parecchio: il quinto più alto per xG
segna dieci volte più spesso del quinto più basso. I quattro fattori dicono in gran parte la
stessa cosa e non vanno sommati come se fossero indipendenti.

## 5. Le fasi

Nessuna fase comincia prima che la precedente sia verificata.

### Fase 1 — il retrospettivo, su più leghe *(fatto per la Serie A)*

Estendere la misura del §4 ad almeno cinque campionati coperti per intero, di dimensione e
stile diversi. *Criterio:* i rapporti reggono fuori dalla Serie A, o si dichiara che il segnale
è specifico e la lettura vale solo dove è stato misurato.
*Verifica:* lo script si ferma con un `AssertionError` se il calcolo dei gruppi si rompe, e
segnala da sé quando un fattore ha troppi pari merito per essere diviso in cinque.

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
   righe delle due squadre della stessa gara.
2. Il derby regge su più stagioni, o i suoi 121 casi sono rumore?
3. Il minuto conta? Le immagini insistono sul «dopo il 60'», e la fonte ha gli incidenti di
   gara (`/api/v2/events/{id}/incidents/`) che non è ancora stato guardato.
4. La posizione in campo cambia la frequenza di base? Un difensore centrale e un attaccante non
   hanno la stessa esposizione al giallo.
5. Il secondo giallo e l'espulsione: `red_card` compare sullo 0,4% delle righe, campione troppo
   sottile per una lettura a sé.

## 8. Rischi dichiarati

- **Si nominano persone.** Un blocco che dice «rischia il giallo» accanto a un nome deve
  reggere il numero che lo giustifica, sempre.
- **La copertura della fonte si spegne senza preavviso**, come è successo all'Europa League a
  luglio. La sezione deve sparire da sola quando il dato manca, non mostrare un vuoto.
- **La formazione probabile è di un altro**, dichiarata `beta`. Se sbaglia gli undici, la
  lettura è costruita su giocatori che non giocheranno: va detto in pagina finché è `predicted`.
- **Il campione di agosto è corto.** Serie A ha 15 gare in questa stagione: le medie per
  giocatore vanno prese dalla stagione precedente finché quella in corso non regge da sola.
