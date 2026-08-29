# Allineamento dell'impianto a PowerStats — piano di lavoro

Deciso il **29 agosto 2026**: IQstatS adotta l'impianto di PowerStats sezione per sezione,
con i nostri dati. **Gli altri sport (tennis, basket, fantacalcio) restano fuori.**

La mappa di partenza è `docs/product/ricognizione-powerstats-e-biofootballbet.md`. La regola
di `AGENTS.md` vale su tutto: si prende la **funzione**, mai testi, etichette, colori,
marchio o formule.

**Come si legge questa lista.** Ogni voce ha un criterio di completamento verificabile. Una
voce è fatta solo quando il criterio è misurato, non quando il codice compila.

---

## Blocco 0 — già fatto il 29 agosto

| | Voce | Dove |
| --- | --- | --- |
| ✅ | Verifica predetto contro reale, per gara | `verifica.ts`, `verifica-section.tsx` |
| ✅ | Taratura degli intervalli accanto al conto | `taraturaDegliIntervalli` |
| ✅ | Filtri di stato sul calendario, con chi resta fuori dichiarato | `partite/page.tsx` |
| ✅ | Trend ultime cinque | `saltiDelTrend` |
| ✅ | Chi vince il confronto, gara per gara | `contese` |
| ✅ | Classifica di lega per lato, con il concesso | `classificaSquadre` |

---

## Blocco 1 — obblighi, prima della pubblicazione

Nessuna di queste pagine esiste oggi in `apps/web/src/app`. Con account e abbonamento
attivi non sono opzionali.

1. **Informativa privacy.** Titolare, dati raccolti, base giuridica, destinatari
   (Supabase, Stripe, Vercel, la fonte dati), conservazione, diritti, reclamo al Garante,
   archiviazione locale. *Criterio:* pagina raggiungibile, datata, e ogni affermazione
   tecnica verificata nel codice, non dedotta.
2. **Termini di servizio.** Che cosa è il servizio, che cosa non è, abbonamento e recesso.
   *Criterio:* pagina raggiungibile e coerente con quello che Stripe fa davvero.
3. **Avvertenze sul gioco.** Analisi statistiche e non consigli di scommessa, divieto ai
   minori di diciotto anni, avvertenza sul disturbo da gioco d'azzardo con numero verde.
   *Criterio:* visibili dove si mostrano letture, non solo in una pagina defilata.
4. **Scarica i miei dati ed elimina account.** *Criterio:* l'esportazione produce un file
   con i dati che abbiamo davvero, e l'eliminazione cancella per davvero.
5. **Assistenza e contatti.** *Criterio:* un recapito che funziona.

---

## Blocco 2 — il calendario, dove si entra

6. **Scelta libera della data**, avanti e **indietro**. Oggi ci sono sette giorni in avanti
   e nessun passato: la verifica costruita oggi è quasi irraggiungibile. *Criterio:* si
   arriva a una gara di un mese fa in due tocchi.
7. **Badge di copertura per campionato**, con la spiegazione accanto al nome della lega.
   *Criterio:* compare quando il campione della lega è sotto la soglia del motore, e dice
   perché.
8. **Punteggi che si muovono** sulle gare in corso. *Criterio:* una gara live cambia
   punteggio senza ricaricare, e la pagina dichiara ogni quanto si aggiorna.

## Blocco 3 — la navigazione

9. ~~Barra in basso sul telefono~~ — **c'era gia'** dal riordino di agosto (`.product-mobile-nav`,
   fissa sotto i 640 px). Il piano la dava per mancante: errore di chi ha scritto il piano,
   corretto il 30 agosto dopo averla misurata in pagina.
10. ~~**Cerca**: squadre e arbitri~~ — **fatto il 30 agosto**. Le gare restano fuori: si
    trovano dal calendario, che filtra gia' per giorno, campionato e stato, e un risultato
    che non porta a una scheda sarebbe rumore.
11. **Preferiti**: squadre e leghe salvate, in cima al calendario. *Criterio:* sopravvivono
    al ricaricamento e sono legati all'account, non al browser.
12. **Profilo strutturato**: abbonamento, fatturazione, preferenze, salvataggi, assistenza.
    *Criterio:* ogni voce porta a qualcosa che esiste.
13. **Installabile come app**: manifest, icone, scheda «installa». *Criterio:* si aggiunge
    alla schermata home e si apre a schermo pieno.
14. **Onboarding a passi** sulle funzioni nuove. *Criterio:* si può saltare e non ricompare.

## Blocco 4 — il prodotto

15. **Giocatori.** *Criterio:* prima si misura la copertura per giocatore; la sezione
    esiste solo dove il dato regge, e dichiara dove non c'è.
16. **Combo e matrice esito × over/under.** *Criterio:* nessuna probabilità composta senza
    dichiarare la correlazione fra le due linee.
17. **Vetrina dei prossimi giorni.** Le letture più forti in arrivo. *Criterio:* accanto
    alla vetrina sta il **consuntivo completo**, non solo le riuscite: la loro versione
    mostra solo gli azzeccati fra l'88 e il 99 per cento, ed è selezione, non misura.
18. **Generatore di multiple.** *Criterio:* la probabilità della combinazione dichiara la
    correlazione; senza quella, non si mostra un numero.
19. **Assistente conversazionale.** *Criterio:* risponde solo con numeri che la pagina
    saprebbe mostrare, e dichiara che può sbagliare.

## Blocco 5 — i dati che loro non hanno

20. **Scontri comuni**: le due squadre contro gli stessi avversari.
21. **Frequenza storica della linea** per squadra, accanto alla base di lega.
22. **Elenco gare per esteso** sotto ogni famiglia.
23. **Taratura delle linee**: quando diciamo «over 7,5 al 71%», quante volte esce. Richiede
    un passaggio offline sulle gare chiuse: gli artefatti non la portano.

---

## Quello che non si fa, e perché

- **Token, ruota giornaliera, muro a pagamento sul dato**: nascondono il dato per venderlo.
- **Sistemi di puntata** (progressioni, martingale): sono metodi di scommessa, non
  intelligence, e il design system vieta le istruzioni di puntata.
- **Schedina scelta dal sistema al posto dell'utente.**
- **Vetrina dei soli pronostici riusciti.**
- **Altri sport**: esclusi dall'utente il 29 agosto 2026.
