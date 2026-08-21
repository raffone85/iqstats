# Piano di validazione dei modelli

Scritto il 16 agosto 2026. Definisce **come si stabilisce che un modello vale**, prima di
costruirne uno. Scriverlo dopo sarebbe scegliere il criterio conoscendo il risultato.

Riferimenti: [architettura del motore](architettura-motore-proiezione.md) ·
[dizionario delle metriche](dizionario-metriche.md) · `data/registro-target.json`.

## 1. La regola che viene prima di tutte

**Nessuno split casuale.** L'ordine temporale non si rompe mai: prevedere una gara di
ottobre usando gare di marzo è un esperimento senza valore, perché in produzione quelle
gare non esistono ancora.

Si usano, secondo il caso:

- **avanzamento a finestra crescente** — si addestra su tutto ciò che precede una data, si
  prevede il periodo successivo, si sposta la data in avanti;
- **origine mobile** — la stessa cosa ripetuta su più origini, per vedere se il vantaggio è
  stabile o è un caso;
- **stagione tenuta fuori** — una stagione intera mai vista, quando il campione lo permette.

Lo scarto fra addestramento e valutazione avviene **per date intere dentro la lega**: una
giornata non si spezza a metà.

## 2. Che cosa si misura, per ogni target

| Misura | Perché |
|---|---|
| Errore assoluto medio | quanto si sbaglia in media |
| Radice dell'errore quadratico medio | quanto pesano gli sbagli grossi |
| Distorsione | se si sbaglia sempre nella stessa direzione |
| Errore assoluto mediano | quanto si sbaglia nel caso tipico |
| Errore per lega | se il vantaggio viene da una lega sola |
| Errore casa e trasferta | se il modello capisce il campo |
| Errore per fascia di valore | se sbaglia solo sugli estremi |
| Copertura dell'intervallo | se l'intervallo dichiarato all'80% contiene davvero l'80% |
| Stabilità nel tempo | se il vantaggio regge su più origini |

Per i conteggi si aggiunge la verosimiglianza negativa, coerente con la distribuzione
scelta, come già fatto nella calibrazione esistente.

**Un modello che vince in media ma perde su metà delle leghe non ha vinto.**

## 3. Il confronto è sempre contro qualcosa

Ogni target ha le sette baseline elencate nell'architettura, compreso il motore già in
produzione dove copre la metrica. Il rapporto di validazione riporta il vantaggio rispetto
a **ciascuna**, non rispetto alla più debole.

## 4. Le ablazioni

Si misura quanto ciascun blocco cambia l'errore, aggiungendolo in ordine:

1. baseline
2. + avversario
3. + forma recente
4. + casa e trasferta
5. + giocatori
6. + formazione
7. + allenatore
8. + arbitro
9. + spaziali dalla mappa dei tiri
10. + contorno della gara

Un blocco che non migliora l'errore fuori campione **esce**, per quanto sensato sembri. Il
blocco dell'allenatore e quello dell'arbitro non si danno per buoni: si misurano.

Si rimuove una feature quando non migliora, quando peggiora la generalizzazione, quando è
troppo rada, quando è instabile fra le origini, o quando introduce contaminazione.

## 5. Le dipendenze fra target

Alcuni bersagli sono legati: i tiri ai tiri in porta, i tiri in porta avversari alle parate,
i falli e l'arbitro ai cartellini, la qualità e la posizione dei tiri all'xG, la formazione
al volume di squadra.

Per ognuno si confrontano tre strade — modello diretto, modello gerarchico, combinazione —
e **non si propaga mai** una previsione dentro un'altra se l'errore complessivo peggiora.

## 6. Il test di parità fra Python e TypeScript

È la condizione che decide se un modello può esistere in produzione.

- Si estraggono **almeno mille** record reali dal periodo di validazione.
- Si calcola la previsione in Python e in TypeScript **dallo stesso artefatto**.
- Tolleranza: differenza relativa entro `1e-9` sul predittore lineare e differenza assoluta
  entro `1e-6` sul valore atteso finale e sugli estremi dell'intervallo.
- Il test copre anche il ripiego: stessa scelta di ripiego nelle stesse condizioni.
- Se il test fallisce, il modello **non è promuovibile**, indipendentemente dal suo errore.

Il test vive fra i test dell'applicazione e gira a ogni cambio di artefatto.

## 7. Gli altri controlli automatici

Contaminazione e ordine temporale · finestre mobili · corrispondenza fra squadra e
avversario · corrispondenza fra giocatore e squadra · confini di stagione · cambi di
allenatore · gare doppie · dati mancanti e loro classe di provenienza · stato della
formazione, prevista o confermata · serializzazione e rilettura dell'artefatto · schema
della previsione · copertura dell'intervallo · comportamento del ripiego.

## 8. Il registro dei modelli

Per ogni target si conserva: identificativo, tipo, feature usate, intervallo di
addestramento, leghe incluse, dimensione del campione, metodo di validazione, errore e
distorsione, confronto con ciascuna baseline, calibrazione dell'intervallo, data di
creazione, versione dello schema e del codice, e stato.

Stati ammessi: `experimental` · `validated` · `production` · `disabled`.

**Un modello nuovo non sostituisce il precedente se non lo batte sui criteri qui sopra.**
La sostituzione è una decisione registrata, non un effetto collaterale di un addestramento.

## 9. Quando si dichiara che non si prevede

Se il campione è sotto il minimo, se la copertura dei dati è insufficiente, se l'intervallo
è così largo da non dire nulla, o se il modello non batte il ripiego: **si dichiara la
copertura assente**. È un esito legittimo del motore, non un guasto.

## 10. Criteri di accettazione del motore

Un target è accettabile in produzione quando:

- [ ] il dataset è costruito al momento di, senza contaminazione nota;
- [ ] il campione storico è sufficiente e dichiarato;
- [ ] esiste almeno una baseline e il modello la batte stabilmente fuori campione;
- [ ] errore e distorsione sono documentati per lega, lato e fascia di valore;
- [ ] l'intervallo di previsione è calibrato sulla copertura misurata;
- [ ] l'affidabilità deriva da evidenze, non da una costante scelta a mano;
- [ ] esiste il ripiego e il suo comportamento è testato;
- [ ] il modello è versionato e riproducibile;
- [ ] il test di parità fra Python e TypeScript passa.
