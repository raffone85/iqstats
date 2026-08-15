# Contratti condivisi IQstatS

Questo package contiene i contratti di dominio e i normalizzatori puri approvati in
APP-1. Non effettua chiamate di rete e non legge credenziali. Da APP-2 è consumato
soltanto dal layer server dell'app Next.js; nessun componente UI lo importa.

## Contenuto

- envelope comuni con disponibilità, motivo, copertura e provenienza;
- envelope degli errori pubblici API senza dettagli della fonte;
- contratti per catalogo competizioni, lista e dettaglio gare;
- snapshot quote per gli undici mercati osservati nella discovery APP-0D;
- statistiche osservate, classifica, forma compatta W/D/L e H2H;
- normalizzatori dei payload sanificati in contratti IQstatS.

## Vincoli invarianti

- Un dato mancante resta `null` o `FieldValue` indisponibile: non diventa `0`.
- L'identificativo gara del contratto deriva dalla richiesta IQstatS, non
  dall'eventuale `event_id` incoerente di una lista del provider.
- Le quote espongono prezzo corrente, osservazione precedente, movimento e timestamp
  soltanto quando presenti nella fonte.
- Apertura e chiusura sono sempre `unavailable/not_exposed_by_source`: non vengono
  ricostruite dal primo o dall'ultimo prezzo osservato.
- La forma disponibile è soltanto la sequenza compatta W/D/L della classifica. Date,
  avversari e split casa/trasferta restano indisponibili.
- Gli indici CAL-4 potranno influire solo sulla confidenza lato server;
  `expectedAdjustmentAllowed` resta `false`.

## Verifica locale

```powershell
npm.cmd install --ignore-scripts
npm.cmd run typecheck
npm.cmd test
```

I test usano esclusivamente le fixture sanificate già acquisite da APP-0D e CAL-0;
non eseguono discovery, harvesting o richieste esterne.
