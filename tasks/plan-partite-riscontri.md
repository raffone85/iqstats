# Piano — precisione dei conteggi, elenco partite, dossier gara, riscontri

Data: 15 agosto 2026. Nasce dalla revisione dell'utente sulla home e sull'elenco partite.
Nessuna riga di codice prima delle decisioni in fondo.

## 1. Diagnosi misurata (non ipotesi)

Misure prese oggi, 15 agosto, sul server locale in porta 3200 e sulla fonte.

| Superficie | Cosa dichiara | Cosa è vero | Perché |
| --- | --- | --- | --- |
| Home, riquadro Pronostici | «100 gare» | tetto artificiale | `getUpcomingPredictions(100)`: il 100 è il limite della richiesta, non un conteggio |
| Home, riquadro Partite | «25 competizioni» | oggi sono 32 | il numero nasce dalle sole 100 gare di cui sopra, non dal giorno |
| Home, riquadro Oggi | conteggio del giorno | vero ma tagliato | conta solo dentro le stesse 100 gare |
| `/partite` | elenco del giorno | 166 gare, 32 competizioni | richiesta con limite 200: oggi basta, in un sabato più fitto no |
| `/oggi` | vetrina | limite 50, mostra 16 | altro tetto arbitrario |

Copertura della fonte, verificata: le gare del 15 agosto sono **166**; le letture del
modello nella finestra 15–16 agosto sono **124**. Le due grandezze non coincidono e non
devono essere confuse: esistono gare senza lettura, e la differenza va dichiarata.

Paginazione della fonte: le pagine tornano al massimo 50 elementi per richiesta quando il
limite non è dichiarato; con limite esplicito la pagina è servita intera fino ad almeno
200. Il campo di continuazione esiste ed è la via corretta: **si pagina fino a esaurire**,
non si alza un numero a caso.

## 2. Il dossier gara è povero perché usiamo poco di quello che c'è

Prova sul caso citato dall'utente, Mito Hollyhock – Gamba Osaka (evento 212200, J1).
Oggi la pagina mostra: verdetto 1X2, over 2.5, gol/gol, gol attesi, arbitro non designato,
stadio, due precedenti del 2011 e del 2012. Nient'altro.

Cosa la fonte espone **già** per quella stessa gara e che non chiediamo:

- **Formazioni previste**, con modulo (4-4-2 contro 4-2-3-1), undici e panchina, e una
  confidenza dichiarata per lato (0,70 e 0,51). Per le gare vicine diventano confermate.
- **Mercato**: 9 famiglie di quote, 71 operatori, 1.361 quotazioni, con quotazione
  migliore, movimento (in accorciamento o in allargamento) e orario di aggiornamento.
- **Mercati del modello che scartiamo**: over 1.5 e over 3.5, esito senza pareggio,
  corner oltre 8.5 / 9.5 / 10.5.
- **Contesto già dentro la risposta della gara**, a costo zero: meteo e temperatura,
  chilometri di trasferta (473), derby, campo neutro, spettatori, stato del campo.
- **Classifica e forma** delle due squadre, calendario recente, rosa, allenatori.
- Per le gare concluse: statistiche di gara, cronologia degli episodi, mappa dei tiri con
  gol attesi per singola conclusione dove disponibile.

Il motore statistico interno copre 23 competizioni e la J1 non è tra quelle: la frase
«copertura assente» su quella gara è corretta e va mantenuta.

## 3. Elenco partite: cosa manca

1. **Stemma della competizione**: il proxy interno serve già le immagini di competizione
   (verificate 200 su sei campionati diversi). Manca solo l'uso in pagina.
2. **Un pannello per campionato, richiudibile**, con l'intestazione che resta leggibile da
   chiusa: stemma, nome, paese, numero di gare, primo orario.
3. **Un indice in testa** che elenca i campionati del giorno e porta al pannello: con 32
   competizioni la barra di scorrimento non basta.

## 4. Riscontri: previsione contro risultato

Sezione nuova, per le gare concluse. La fonte conserva le letture passate interrogandole
per data, quindi lo storico è ricostruibile; i risultati arrivano dall'elenco gare. Il
legame è l'identificativo della gara.

Impianto proposto:

- una riga per gara conclusa: che cosa era stato letto, che cosa è successo, esito;
- un riepilogo che dichiara **campione** e **freschezza**, come ovunque nel prodotto;
- lettura per fasce di probabilità, che è l'unico modo onesto di dire «quanto ci si può
  fidare»: sulle gare date al 60–70 per cento, quante ne sono uscite;
- nessuna percentuale di «successo» senza il campione accanto, nessuna gara senza lettura
  conteggiata come errore.

## 5. Decisioni chiuse con l'utente il 15 agosto 2026

1. **La home parla del giorno, con il doppio numero.** «113 su 156 gare lette»: il rapporto
   è la copertura del modello, non un errore da nascondere.
2. **Si pagina fino a esaurimento**, con freno di sicurezza dichiarato in pagina se scatta.
3. **Si verifica tutto ciò che gli endpoint restituiscono**, non il solo esito.
4. **Raccolta notturna completa**, con lo stato dell'ultima raccolta dichiarato.
5. **Il mercato si mostra come lettura**: probabilità implicita e movimento, nessun nome di
   operatore e nessun collegamento esterno. Scelta presa su delega dell'utente.
6. **Ordine di consegna:** verità dei conteggi ed elenco → dossier gara → riscontri →
   giocatori e arbitri.
7. **Ogni numero è accompagnato dalla direzione in prosa**, senza esporre soglie né formule.

## 6. Due semantiche diverse nella stessa fonte (verificato, non dedotto)

- `/events/` — `date_to` **incluso**: la richiesta del 15 restituisce le gare del 15.
- `/predictions/` — `date_to` **escluso**: stessa competizione, stesso giorno, zero letture;
  spostando il limite al giorno dopo tornano tutte. Prova: J1 League, 15 agosto, 0 contro 9.

Il giorno del prodotto è quello italiano, quindi entrambe le letture chiedono anche il
giorno universale precedente e filtrano su Roma. Prima di questa correzione l'elenco del
giorno conteneva gare che in Italia appartengono al giorno dopo (166 contro 156 reali).

## 7. Dossier gara — perimetro chiesto dall'utente

Blocchi: letture sulle statistiche (tiri, falli, cartellini, comportamento arbitrale); una
previsione IQstatS composta da **quattro pronostici, due dei quali statistici** (corner,
tiri, tiri in porta, falli, cartellini), costruita confrontando le due squadre dove i dati
esistono per entrambe; le quote lette come probabilità e direzione; le metriche profonde di
contesto (stile offensivo e difensivo, passaggi, blocchi difensivi, possesso, meteo, derby,
classifica) e ogni altro fattore pre-gara ricavabile filtrando gli endpoint.

**Stato al 15 agosto 2026 (primo taglio consegnato):** fatti il sommario in breve, le quattro
letture IQstatS, il confronto con il mercato senza nominare operatori, le formazioni, le
panchine con i profili degli allenatori e il contorno con meteo, viaggio e derby. Restano da
fare: classifica e forma delle due squadre, statistiche della gara conclusa con mappa dei tiri
e cronologia, confronto fra le letture statistiche e i mercati di corner e cartellini che la
fonte quota già, e il peso economico delle rose.

**Nodi ancora aperti su questo blocco:**

1. Il motore interno copre 23 competizioni su 29 di oggi. Fuori da quelle i due pronostici
   statistici non hanno base: si nasconde il blocco, o si costruisce la lettura dalle gare
   recenti delle due squadre (una richiesta per gara, quindi solo via raccolta notturna)?
2. Quali quattro pronostici, e con quale ordine di importanza.
3. Possesso, passaggi e stile non esistono come dato pre-gara: sono aggregati che vanno
   costruiti dalle gare concluse. Dipendono dalla raccolta notturna.
