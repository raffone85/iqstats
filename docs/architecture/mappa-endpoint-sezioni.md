# Mappa endpoint → sezioni del prodotto

Scritta il 16 agosto 2026. Risponde a una domanda sola: **di tutto ciò che la fonte
espone, che cosa è già in pagina, che cosa manca e dove va.** Il catalogo tecnico degli
endpoint resta in `statsiq-football-endpoint-catalog.md`: qui non si duplica, si assegna
una destinazione.

Vincoli che governano ogni riga: la fonte non si nomina mai in pagina, i calcoli non si
mostrano, freschezza e campione si dichiarano sempre, un'assenza resta un'assenza.

## Il vincolo che decide tutto: dieci richieste al secondo

Il tetto è **per secondo**, non per pagina: il modo di rispettarlo è **spezzare in
ondate**, non rinunciare ai dati. Il dossier oggi fa otto richieste in due ondate.
La regola pratica: **nessuna ondata sopra sei**, così resta margine per il traffico
concorrente di altri visitatori.

Due scoperte del 16 agosto cambiano il conto in meglio:

- **`/events/{id}/stats/` è una richiesta sola e porta cinque cose**: le oltre cinquanta
  metriche di squadra, le stesse divise per tempo, la **mappa dei tiri** tiro per tiro
  (posizione, xG, xG nello specchio, parte del corpo, situazione, esito), il **momentum**
  minuto per minuto e l'**xG cumulato**. Statistiche e mappa dei tiri non sono due
  richieste: sono una.
- **`/events/{id}/odds/comparison/` è una richiesta sola e porta undici mercati**, corner
  e cartellini compresi. Il confronto con i mercati statistici **costa zero**: le quote
  sono già in casa, oggi si usano solo per l'1X2 e i gol.

## Già in pagina

| Endpoint | Che cosa dà | Dove |
|---|---|---|
| `/events/` | elenco gare del giorno | `/partite`, `/oggi`, home |
| `/events/{id}/` | dettaglio gara, con i precedenti dentro | dossier (testata, contorno, testa a testa) |
| `/events/{id}/odds/comparison/` | undici mercati | dossier (modello e mercato) — **usato solo in parte** |
| `/events/{id}/lineups/` | undici confermato o previsto con confidenza | dossier (chi gioca) |
| `/events/{id}/stats/` | statistiche di squadra | scheda squadra (medie) — **usato solo in parte** |
| `/events/{id}/player-stats/` | statistiche per giocatore | scheda squadra (rosa) |
| `/predictions/` | modello della fonte | dossier (verdetto), `/pronostici` |
| `/leagues/` | catalogo competizioni | ovunque, con stemmi |
| `/leagues/{id}/standings/` | classifica con forma e xG | scheda squadra |
| `/leagues/{id}/seasons/` | stagioni | risoluzione stagione corrente |
| `/referees/` e `/referees/{id}/` | metro dell'arbitro | dossier (contorno), scheda squadra |
| `/managers/{id}/` | profilo allenatore | dossier (le due panchine) |
| `/venues/{id}/` | stadio | dossier, `/oggi` |
| `/teams/{id}/`, `/squad/`, `/fixtures/` | squadra, rosa, calendario | scheda squadra |
| `/img/…` | stemmi, loghi, volti, stadi | tutte le superfici, via proxy interno |

## Da usare adesso, a costo quasi nullo

| Endpoint | Che cosa dà | Dove va | Costo |
|---|---|---|---|
| *(già scaricato)* `total_corners` | 17 linee da 3,5 a 16,5 | confronto sulla lettura «Il gioco» | **0** |
| *(già scaricato)* `/stats/` shotmap | ogni tiro con xG ed esito | mappa dei tiri della gara conclusa | **0** oltre alla richiesta stats |
| *(già scaricato)* `/stats/` momentum e xG cumulato | l'andamento della gara | come si è svolta la gara conclusa | **0** |
| `/events/{id}/stats/` nel dossier | le due colonne di statistiche | gara conclusa | 1, solo a gara conclusa |
| `/events/{id}/incidents/` | gol, cartellini, cambi, VAR al minuto | cronologia della gara conclusa | 1, solo a gara conclusa |
| `/leagues/{id}/standings/` nel dossier | posizione, punti, forma delle due squadre | classifica e forma | 1, cache lunga |

Conto del dossier dopo queste aggiunte: **dieci richieste a gara futura, dodici a gara
conclusa**, in tre ondate da non più di sei. Sotto il tetto.

## Da usare con la raccolta notturna

Non stanno in una pagina che deve rispondere in fretta: troppe richieste, o dati che
cambiano di rado.

| Endpoint | Che cosa dà | Perché di notte |
|---|---|---|
| `/leagues/{id}/top/{stat}/` | marcatori, assist, gialli, rossi, falli | cinque richieste per competizione, ma cambiano una volta a giornata |
| `/players/{id}/` | valore di mercato, bio | esiste solo per singolo giocatore: circa ottanta richieste per due rose |
| `/players/{id}/stats/`, `/career/`, `/transfers/` | storia del giocatore | stesso motivo |
| `/leagues/{id}/bestxi/` | miglior undici | una per competizione e giornata |
| `/referees/{id}/matches/` | log gara per gara dell'arbitro | serve solo per ricalcolare, e il metro arriva già aggregato |

## Da valutare, non urgenti

| Endpoint | Che cosa dà | Nota |
|---|---|---|
| `/broadcasts/`, `/tv-channels/` | dove si vede la gara | utile in pagina gara, ma non è intelligence: una richiesta in più per un servizio |
| `/odds/best/` | miglior prezzo per esito | **da non usare**: porterebbe a nominare un operatore |
| `/bookmakers/` | elenco operatori | **da non usare**, stesso motivo |
| `/social/` | tweet e video | fuori dal perimetro: non è un dato misurabile |
| `/transfers/` | mercato | fuori dal perimetro attuale |
| `/venues/{id}/competitions/`, `/venues/` | stadi per competizione | nessuna sezione lo chiede oggi |
| `/worldcup/squads/` | rose mondiali | fuori stagione |

## Da non usare

- **Peso del denaro, storico tick delle quote, canale live**: add-on a pagamento, la
  fonte risponde 402.
- **Punteggi in tempo reale**: il prodotto non è un livescore, e la sezione riscontri
  legge il risultato a gara chiusa.

## Il cambio di prospettiva sui mercati

Fino al 16 agosto il mercato era **solo un termine di paragone**: si mostrava accanto
alla nostra lettura. Da adesso è anche **un ingresso delle proiezioni**: undici mercati
già scaricati, ognuno con la probabilità implicita ripulita dal margine, sono un segnale
che il motore può leggere invece di ignorare.

Un avvertimento tecnico che vale prima di usarli così: la probabilità implicita si può
ripulire dal margine solo dentro un **insieme chiuso di esiti**. Sui mercati a due o tre
esiti il codice lo fa già. Su `total_corners`, che espone diciassette linee in un unico
mercato, la somma grezza non è un insieme chiuso: **va normalizzata coppia per coppia**
(over e under della stessa linea), altrimenti la percentuale mostrata contiene il margine
di chi quota e sovrastima di qualche punto.
