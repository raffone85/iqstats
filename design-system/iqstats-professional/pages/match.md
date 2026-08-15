# Override pagina — Dossier partita

## Scopo

`/match/[matchId]` espone l'identità della gara e il suo audit minimo. È raggiungibile
solo da un ID numerico e conserva il ritorno alla dashboard con i filtri validati.

## Gerarchia e comportamento

1. Azione di ritorno testuale e prevedibile.
2. Testata: competizione, squadre, stato, orario, risultato soltanto se osservato.
3. Copertura del dossier: presenta disponibilità di quote, statistiche, forma,
   classifica, H2H, contesto e segnali senza simulare le rispettive metriche.
4. Metodo e fonti: origine normalizzata, acquisizione, copertura e campi mancanti.
5. Accesso, not found, rate limit e indisponibilità sono stati autonomi, con nessun
   contenuto precedente o dimostrativo mantenuto sullo schermo.

## Layout

- Mobile: ordine Casa → score/stato → Trasferta leggibile da tastiera e screen reader,
  una colonna per i fatti e la disponibilità.
- Desktop: testata su tre colonne e griglia di disponibilità su due colonne.
- Le etichette di disponibilità usano testo oltre al colore. Nessuna tab lunga fissa.
