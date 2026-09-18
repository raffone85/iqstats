# Filtro sui giocatori delle gare di oggi — piano

Deciso il **18 settembre 2026** su richiesta dell'utente, da una foto di un modulo di ricerca
di un altro prodotto: schede per bersaglio, cursori che l'utente regola da sé, «Cerca». **Si
prende la funzione, non i nomi né l'impaginazione.** Decisioni dell'utente: pagina a sé, e la
scheda del «graziato» si chiama **Probabili ammoniti**.

## Che cosa si costruisce

`/giocatori/oggi`: i giocatori delle gare di oggi non ancora iniziate, tutti i campionati,
lega facoltativa. Quattro schede: **Marcatori**, **Probabili ammoniti**, **Falli commessi**,
**Falli subiti**. Ogni scheda ha i suoi cursori, un modulo `GET` (funziona senza JavaScript,
l'indirizzo si condivide), e ogni riga dice **perché è qui**: quali soglie ha superato, con
valore e campione.

## Contratto dati — misurato, non supposto

| Serve | Da dove | Stato |
| --- | --- | --- |
| gare di oggi, lega, stagione | `/api/v2/events/` (`season_id` c'è nell'elenco) | già letto da `/partite` |
| per 90' di gol, gol attesi, tiri in porta, gialli, falli, falli subiti | rosa di stagione (`getTeamSquad`), righe per gara della fonte | in cache, zero traffico Supabase |
| gare dall'ultimo giallo | le stesse righe, dalla più recente | nuovo campo `appearancesSinceYellow` |

**Il giallo per riga perde il 4-5% dei gialli** rispetto agli episodi (misurato il 18/09 sulla
raccolta dal 20 agosto: 4,1% in agosto, 5,0% in settembre). Si usa, e il limite sta scritto.

## Che cosa non si costruisce, e perché

**Nessun filtro sul ritardo dal giallo.** Misurato il 18/09 su 162.934 casi dell'archivio
locale, etichetta dagli episodi, a parità di gialli per 90': chi è da più gare senza giallo
ne prende **meno**, non di più (terzile alto: 17,6% alla prima gara dopo il giallo, 12,3% dalla
nona in poi). Il fatto «ultimo giallo N gare fa» resta scritto nella riga, con la nota aperta
che il ritardo non lo rende più probabile. Decisione dell'utente.

## Criteri di accettazione

- Ogni numero porta il campione (minuti, presenze) e il valore grezzo accanto al corretto.
- Un'assenza non diventa zero; chi non ha mai fatto quella cosa non entra nella scheda.
- Nessun linguaggio di puntata; «probabili» è il nome della scheda, i numeri restano
  frequenze.
- 375/768/1024/1440 px senza overflow, controlli da 44 px, focus visibile, zero sotto AA.

## Verifica

Typecheck, eslint, `next build`; tempo della pagina misurato a freddo e a caldo; catture alle
quattro larghezze guardate. Checkpoint umano prima di pubblicare.
