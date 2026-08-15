# Report APP-0D — Discovery contratti MVP

## Esito

Discovery completata e pronta per revisione umana. Sono state effettuate 28 richieste
complessive: 10 ricognizioni preliminari e 18 richieste canoniche, tutte GET e sotto il
limite 30. Il campione usa due gare; nessun file dell'app o output CAL-4 è stato
modificato.

## Risultato per dominio

| Dominio | Stato | Evidenza |
| --- | --- | --- |
| Lista gare | verificato | Endpoint lista con filtri data, lega e stato; paginazione e campi gara espliciti. |
| Dettaglio gara | verificato | Endpoint dettaglio con squadre, kickoff, stato, punteggio, metadati e H2H. |
| Quote correnti | verificato sul campione concluso | 448/448 record riconciliati con il confronto, 11 mercati e 16 bookmaker. |
| Movimento quote | parziale | Campo esplicito per tutti i record; movimento non vuoto e precedente presenti in 347/448. |
| Apertura quote | non disponibile | Nessun campo esplicito opening/initial. `previous_decimal_odds` è solo l'osservazione precedente. |
| Chiusura quote | non disponibile | Nessun campo closing; l'ultimo prezzo di una gara finita non è etichettato come chiusura. |
| Gara futura campione | copertura assente | Lista quote vuota; gli 11 campi compatti sono tutti `null`. |
| Classifica | verificato | 20 righe con stagione e statistiche esplicite. |
| Forma | parziale | `standings.form` presente 20/20 come sequenza W/D/L; mancano date, avversari e split casa/trasferta. |
| H2H | verificato | Endpoint dedicato con aggregati e partite recenti; coincide con il blocco nel dettaglio gara. |

## Mercati osservati nella gara conclusa

| Mercato | Record | Esiti | Linee | Bookmaker | Precedente | Movimento non vuoto | Apertura | Chiusura |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- |
| `double_chance` | 48 | 12, 1X, X2 | — | 16 | 48/48 | 48/48 | no | no |
| `over_under_15` | 32 | over, under | 1.5 | 16 | 32/32 | 32/32 | no | no |
| `over_under_25` | 32 | over, under | 2.5 | 16 | 32/32 | 32/32 | no | no |
| `over_under_35` | 32 | over, under | 3.5 | 16 | 32/32 | 32/32 | no | no |
| `btts` | 32 | no, yes | — | 16 | 32/32 | 32/32 | no | no |
| `red_card` | 6 | no, yes | — | 3 | 6/6 | 6/6 | no | no |
| `1x2` | 45 | AWAY, DRAW, HOME | — | 15 | 45/45 | 45/45 | no | no |
| `draw_no_bet` | 26 | AWAY, HOME | — | 13 | 26/26 | 26/26 | no | no |
| `total_corners` | 154 | over, under | 4.5, 5.5, 6.5, 7.5, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5 | 12 | 70/154 | 70/154 | no | no |
| `corners_1x2` | 33 | AWAY, DRAW, HOME | — | 11 | 24/33 | 24/33 | no | no |
| `total_red_cards` | 8 | over, under | 0.5, 1.5 | 2 | 0/8 | 0/8 | no | no |

La copertura di movimento non va confusa con uno storico completo. I campi espliciti
sono `decimal_odds`, `previous_decimal_odds`, `movement` e `updated_at`.
IQstatS può quindi mostrare prezzo corrente, osservazione precedente e direzione
dell'ultima variazione quando presenti. Non può mostrare apertura o chiusura con il
contratto attuale.

## Caveat identificativo

Le route specifiche della gara restituiscono l'ID IQstatS richiesto, mentre la lista
dettagliata quote restituisce un diverso `event_id`. I 448 record coincidono comunque
uno a uno con il confronto su mercato, esito, linea, bookmaker, prezzo, movimento e
timestamp. APP-1 deve conservare il match ID richiesto come contesto server-side e non
esporre o usare il campo della lista quote come chiave IQstatS.

## Endpoint candidati non disponibili

Le route calcio `pregame` e `team-stats` hanno restituito 404. Non vengono usate
come fallback. La forma dettagliata resta non coperta; la sola sequenza W/D/L della
classifica è disponibile.

## Verifica

- tre pagine quote: 200 + 200 + 48 = 448, senza duplicati;
- confronto quote: 448 record, zero differenze su prezzo, movimento e timestamp;
- 11/11 mercati restituiti enumerati;
- H2H dedicato e H2H nel dettaglio identici per entrambe le gare;
- fixture JSON leggibili e nessuna chiave sensibile non redatta o pattern header/token;
- nessuna modifica sotto `apps/`.

## Gate APP-1

Possono entrare nei contratti condivisi lista/dettaglio gara, classifica e H2H. Quote
correnti, precedente e movimento entrano con disponibilità per singolo record. Apertura,
chiusura e forma dettagliata restano `unavailable` finché un endpoint esplicito non le
espone; non devono essere ricostruite.
