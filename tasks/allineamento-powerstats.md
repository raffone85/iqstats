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

Con account e abbonamento attivi non sono opzionali.

**Sospeso per decisione dell'utente, 30 agosto 2026.** Le voci 1, 2 e 5 chiedono un
titolare del trattamento e un recapito che risponda; l'utente non ha partita IVA e ha
scelto di rimandare a dopo la costruzione. Non serve una partita IVA per essere titolare
— basta una persona fisica con nome e recapito — ma la decisione e' sua e il blocco
resta fermo. **Finche' non si pubblica non e' un obbligo attivo.**

Nota di ricognizione, 30 agosto: sul prodotto di riferimento la privacy policy **non e'
una pagina propria**, e' un documento generato su un servizio esterno e collegato dal
piede; i termini invece sono una pagina sul loro dominio.

1. **Informativa privacy.** Titolare, dati raccolti, base giuridica, destinatari
   (Supabase, Stripe, Vercel, la fonte dati), conservazione, diritti, reclamo al Garante,
   archiviazione locale. *Criterio:* pagina raggiungibile, datata, e ogni affermazione
   tecnica verificata nel codice, non dedotta.
2. **Termini di servizio.** Che cosa è il servizio, che cosa non è, abbonamento e recesso.
   *Criterio:* pagina raggiungibile e coerente con quello che Stripe fa davvero.
3. ~~**Avvertenze sul gioco.**~~ — **fatto il 30 agosto**, ed e' l'unica voce del blocco che
   non dipendeva dai dati del titolare. In coda a **ogni** pagina di prodotto, dentro lo
   shell: analisi statistiche e non consigli di scommessa, divieto ai minori di diciotto
   anni, dipendenza patologica e Telefono Verde Nazionale **800 55 88 22**, gratuito e
   anonimo, lunedi'-venerdi' 10-16, Istituto Superiore di Sanita'. **Il numero e' verificato
   alla fonte**, non scritto a memoria. Non accanto a ogni singola lettura: in un dossier da
   diciassette capitoli la stessa frase ripetuta diventa rumore. *Misurato:* presente a 375,
   768, 1024 e 1440 px, nessun overflow.
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
   punteggio senza ricaricare, e la pagina dichiara ogni quanto si aggiorna. —
   **costruito il 30 agosto, verifica a meta'.** `AggiornamentoLive` su calendario e dossier:
   con gare in corso rende la dichiarazione e chiama `router.refresh()` al ritmo di
   `MATCHES_TTL_MS`, cioe' 120 s, che e' quanto dura la copia della fonte; chiedere piu'
   spesso restituirebbe gli stessi numeri.
   *Verificato:* con **zero** gare in corso (161 gare del 30 agosto: 123 da giocare, 37
   finite, 0 live) la riga non compare e in venti secondi d'ascolto **zero** richieste alla
   pagina, quindi nessun timer armato a vuoto.
   **Non verificato:** che il punteggio cambi davvero senza ricaricare. Alle 10:18 non c'era
   nessuna gara in corso e la prima era alle 12:00. **Si misura con una gara in corso**,
   aprendo il dossier di quella gara e contando le richieste alla pagina in quattro minuti:
   devono essere due.

## Blocco 3 — la navigazione

9. ~~Barra in basso sul telefono~~ — **c'era gia'** dal riordino di agosto (`.product-mobile-nav`,
   fissa sotto i 640 px). Il piano la dava per mancante: errore di chi ha scritto il piano,
   corretto il 30 agosto dopo averla misurata in pagina.
10. ~~**Cerca**: squadre e arbitri~~ — **fatto il 30 agosto**. Le gare restano fuori: si
    trovano dal calendario, che filtra gia' per giorno, campionato e stato, e un risultato
    che non porta a una scheda sarebbe rumore.
11. ~~**Preferiti**: campionati in cima al calendario~~ — **fatto il 30 agosto, a meta'.**
    Sopravvivono al ricaricamento (misurato: il campionato scelto era ancora in cima al
    giro successivo) ma restano **su questo dispositivo**, e la pagina lo dichiara.
    Legarli all'account richiede una tabella nuova sul livello dati in linea: si fa quando
    l'utente autorizza quella scrittura, non prima.
12. **Profilo strutturato**: abbonamento, fatturazione, preferenze, salvataggi, assistenza.
    ~~*Criterio:* ogni voce porta a qualcosa che esiste.~~ — **fatto il 30 agosto.**
    `/account` con cinque voci reali (chi sei, abbonamento, fatturazione, preferenze,
    schermata home) e quattro assenze dichiarate per nome. *Misurato con una sessione vera,
    su utente di prova creato e cancellato:* cinque voci e quattro assenze a 375, 768, 1024
    e 1440 px, nessun overflow, e il portale su un utente senza pagamenti mostra l'avviso
    del 409 senza lasciare la pagina.
    **Errore trovato:** `/api/billing/portal` esisteva e funzionava ma **nessuna pagina lo
    chiamava**: metodo di pagamento, ricevute e disdetta erano irraggiungibili. Ora c'e' il
    collegamento.
    **Secondo errore, trovato misurando:** a 375 px la porta del profilo in testata restava
    **senza nome accessibile** (stringa vuota), perche' l'etichetta era nascosta e l'avatar
    e' `aria-hidden`; ed e' l'unica porta su telefono. Ora ha `aria-label` e l'etichetta
    resta visibile anche sotto i 640 px.
    **Discrepanza dichiarata:** l'architettura informativa chiama questa funzione
    `/impostazioni`, il codice usa `/account`; vince il codice, il documento va sanato.
13. ~~**Installabile come app**: manifest, icone, scheda «installa».~~ — **fatto il 30 agosto.**
    Manifesto, quattro icone disegnate con i token del wordmark, e una scheda che compare
    solo dove c'e' qualcosa da installare. *Misurato:* Chrome legge il manifesto, zero
    errori, tre icone, e manda `beforeinstallprompt`; prima non scaricava nemmeno il file.
    **Errore trovato e corretto:** Next trasmette a flusso i tag di `generateMetadata` e li
    appende in fondo al `<body>`, dove `rel="manifest"` viene ignorato. Spegnere il flusso
    costava 5,81-8,77 s di primo byte su `/squadre/276` contro 1,16-1,59 s: il manifesto e'
    dichiarato in `layout.tsx`, che React issa in `head` a costo zero.
    **Resta all'utente:** l'aggiunta vera alla schermata home dal telefono.
14. ~~**Onboarding a passi** sulle funzioni nuove. *Criterio:* si può saltare e non
    ricompare.~~ — **fatto il 30 agosto.** Tre passi in cima al calendario, in linea e non
    a velo: il giorno all'indietro, la stella dei preferiti, la riga che dichiara cosa si
    trovera' aprendo la gara. *Misurato con clic veri:* i tre passi si succedono, all'ultimo
    «Salta» sparisce e resta «Ho capito», sia «Salta» sia «Ho capito» scrivono la memoria e
    la guida non torna al ricaricamento; togliendo la memoria torna, quindi la prova sa
    diventare rossa. Nessun overflow a 375, 768, 1024 e 1440 px.
    **Resta su questo dispositivo**, come i preferiti e l'invito a installare.

## Blocco 4 — il prodotto

15. **Giocatori.** *Criterio:* prima si misura la copertura per giocatore; la sezione
    esiste solo dove il dato regge, e dichiara dove non c'è. — **misura fatta il 30 agosto,
    interfaccia non iniziata.** Il documento e' `docs/product/copertura-giocatori.md`, lo
    script che la rifa' e' `apps/web/scripts/verification/copertura-giocatori.mjs`.
    In breve: i dati per giocatore **non stanno nel nostro livello dati** e **non stanno
    nelle formazioni**; arrivano da `/api/v2/events/{id}/player-stats/`, che l'app non usa
    ancora. Su **72 gare** e **2.990 righe**, il **68,5%** ha minuti sopra zero e **65 gare
    su 72 (90,3%)** portano statistiche: **una gara su dieci non ne porta nessuna**.
    **Tre campionati su ventidue sono a zero** (National League, Liga Portugal 2, Club
    Friendlies) e la **Conference League e' coperta cinque volte su sette**.
    **Prossimo passo prima di qualunque interfaccia:** rifare la misura con un campione
    **per lega** e fissare li' la soglia. Nessuna soglia decisa a tavolino.
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
