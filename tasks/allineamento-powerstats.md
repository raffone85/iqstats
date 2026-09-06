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

**Chiuso il 30 agosto 2026.** Il blocco era sospeso in attesa dei dati del titolare;
l'utente li ha forniti dopo che l'applicazione era gia' pubblica, e tutte e cinque le voci
sono state completate lo stesso giorno.

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
4. ~~**Scarica i miei dati ed elimina account.**~~ — **fatto il 30 agosto.** L'esportazione
   e' una rotta autenticata senza parametri (`/api/account/dati`) che restituisce un file
   JSON scaricabile con l'anagrafica dell'accesso, il profilo, il cliente di fatturazione,
   gli abbonamenti e i diritti: sono le sole quattro tavole con una colonna che punta a
   `auth.users`, verificato sui vincoli del database. L'eliminazione toglie la riga da
   `auth.users` e le quattro tavole seguono in cascata.
   *Misurato con un utente di prova, creato e cancellato:* l'esportazione risponde 200 con
   `Content-Disposition: attachment`, un profilo, un abbonamento, sette diritti e un
   cliente. Il modulo chiede di **scrivere il proprio indirizzo**, e con l'indirizzo
   sbagliato non cancella niente - riletto dopo il tentativo: utente, profilo, sette
   diritti, abbonamento e cliente tutti ancora al loro posto. Con quello giusto porta a
   `/?account=eliminato` e le cinque righe vanno tutte a zero, con i totali del livello
   dati tornati identici a prima della prova.
5. ~~**Assistenza e contatti.**~~ — **fatto il 30 agosto.** Canale Telegram in coda a ogni
   pagina di prodotto e in entrambe le pagine legali.

---

## Blocco 2 — il calendario, dove si entra

6. ~~**Scelta libera della data**, avanti e **indietro**.~~ — **c'era gia'**, verificato il
   6 settembre 2026. La barra si centra sulla data mostrata, con tre giorni indietro e tre
   avanti, e accanto c'e' un `input type="date"` che salta a qualunque giorno: il criterio
   «una gara di un mese fa in due tocchi» e' soddisfatto da un tocco sul campo e uno sulla
   data. *Misurato in produzione:* `/partite?date=2026-08-06` mostra **74 gare e 10
   competizioni**, con la barra centrata su quel giorno. Il piano descriveva uno stato
   superato, come per la voce 9.
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
   **Verificato il 6 settembre 2026, e la ragione del ritardo non era l'ora.** La riga non
   compariva mai perche' **non riconoscevamo le gare in corso**: la fonte non manda «live»
   ne' «inprogress», manda `1st_half`, `2nd_half` e `halftime`, e su sette giorni di
   calendario erano trentasette gare che finivano in `unknown`. Corretto il normalizzatore,
   il tabellone scrive «39 gare sono in corso. Il punteggio si aggiorna da solo ogni 2
   minuti» e il filtro Live passa da **zero righe a 78**. Lo stesso difetto teneva spenta la
   riga del dossier.

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
    esiste solo dove il dato regge, e dichiara dove non c'è. — **misura per lega e censimento
    di stagione fatti il 30 agosto, interfaccia non iniziata.** Il documento e'
    `docs/product/copertura-giocatori.md`, lo script `apps/web/scripts/verification/
    copertura-giocatori.mjs`. I dati per giocatore **non stanno nel nostro livello dati** e
    **non stanno nelle formazioni**; arrivano da `/api/v2/events/{id}/player-stats/`, e la
    fonte **non ha aggregati di stagione**: la somma la facciamo noi.
    **Su 83 campionati e 2.637 gare della stagione in corso, 1.854 coprono (70,3%)**: 42
    campionati per intero, 8 parziali, **13 a zero** — Europa League 0/80 fra questi.
    **La soglia per campionato e' lo strumento sbagliato:** la copertura si accende e si
    spegne nel tempo (Parva Liga tornata ad agosto, Europa League spenta a luglio), quindi
    **si decide sulla gara al momento della lettura**, e la classifica di stagione dichiara
    quante gare su quelle giocate ha davvero.
    **Il seguito operativo — probabili ammoniti e probabili marcatori — sta in
    `tasks/giocatori-cartellini-e-marcatori.md`**, con il segnale gia' misurato su 380 gare
    di Serie A: base del giallo 8,9% e fattore piu' forte 1,52x, base del gol 7,4% e fattore
    piu' forte 2,16x. Nessuna lettura in pagina prima della taratura.
    **Quella lettura e' in pagina dal 31 agosto** (`match-giocatori-section.tsx`, importato da
    `app/match/[id]/page.tsx`, fase 3 del documento del seguito): «interfaccia non iniziata»
    valeva per la **scheda del giocatore**, non per il dossier.
    **La scheda del giocatore e' fatta il 6 settembre 2026.** `/giocatori/[playerId]` con tre
    blocchi in quest'ordine — stagione in corso, stagione precedente, carriera — raggiunta dai
    nomi della rosa, che prima non portavano da nessuna parte.
    **Il contratto e' misurato:** `players/{id}/stats/` pagina a cinquanta e **taglia a
    duecento** qualunque `limit` piu' alto (su Neres `limit=500` rende comunque 200 righe su
    `count` 359; con `offset` le 359 arrivano in **due chiamate, 1,3 s**), e le righe **non
    portano data ne' competizione**: la separazione per stagione la fa la fonte con
    `?season_id=`, una chiamata per stagione.
    **Il contesto delle gare non viene dal nostro livello dati, ed e' misurato:** dei 359
    `event_id` di Neres, `app_match_read_model` ne riconosce **3** e `football.matches` **20**,
    perche' il read model dell'app tiene **solo la stagione in corso**. Da qui la forma a
    totali e non a elenco di gare, che resta la voce 22.
    *Misurato in pagina:* David Neres (1090) Serie A 26/27 tre gare e 38 minuti, Serie A 25/26
    diciassette gare, 925 minuti, 3 gol e 3 assist, carriera 359 gare, 18.219 minuti, 70 gol e
    cinque squadre; Alessandro Buongiorno (1085), infortunato e senza gare quest'anno, dichiara
    l'assenza invece di mostrare una griglia di zeri. Zero overflow e zero sotto AA a 375, 768,
    1024 e 1440 px; altezze 3.099 / 2.269 / 2.253 / 2.264 px.
    **Errore vero corretto nel documento di copertura:** `docs/product/copertura-giocatori.md`
    §1 diceva che i dati per giocatore non stanno nel nostro livello dati.
    `football.player_match_observations` ne ha **457.416 righe su 10.968 gare e 57 stagioni**,
    con sette colonne e **senza `goals`**.
    **La classifica di stagione e' fatta lo stesso giorno**, ed e' il punto 3 del §8 di quel
    documento: `/giocatori` per minuti, tiri, tiri in porta, falli, gialli e parate, raggiunta
    dalla rosa della scheda squadra sulla stessa competizione e stagione che quella sta gia'
    mostrando. La barra di navigazione resta a cinque voci, per la misura del 3 settembre.
    **La classifica dei marcatori non c'e', e la ragione e' misurata:**
    `football.player_match_observations` ha sette colonne e **non ha `goals`**, e nel livello
    dati non esiste nessuna tavola di episodi; alla fonte i gol costerebbero **una chiamata per
    gara, 380 per la sola Serie A**. La pagina lo dichiara invece di sostituirli con i tiri.
    **Due cose trovate misurando.** Il denominatore non puo' essere lo stato della gara: le 380
    gare di Serie A 26/27 in `football.matches` sono **tutte `scheduled`**, comprese le 24 gia'
    giocate che hanno le osservazioni; le gare giocate si contano sull'orario d'inizio. E i
    **pari merito sono il caso normale sui gialli**: in Serie A 25/26 il massimo e' **sette** e
    **nove giocatori su dieci** ci arrivano, quindi le posizioni sono condivise e non numerate
    una per una. Sui falli i valori si separano: 87, 71, 69, su 380 gare coperte su 380.
    *Misurato in pagina:* elenco delle competizioni 1,0 s e classifica 0,96 s sul livello dati
    locale, zero overflow e zero sotto AA a 375, 768, 1024 e 1440 px; il rimando dalla rosa
    costa **22 px** a 768, 1024 e 1440.
    **Una misura da non fidarsi:** a 375 px la scheda squadra non da' un'altezza stabile — lo
    stesso codice, due giri di fila, rende **29.086 e 23.693 px**. Le altre tre larghezze sono
    identiche fra i due giri, quindi il confronto prima-dopo a 375 su quella pagina non vale.
16. ~~**Combo e matrice esito × over/under.**~~ — **fatto il 6 settembre 2026.** Tre esiti per
    quattro linee, nella sezione Gol del dossier, dentro la porta dei mercati derivati.
    **Nessuna casella e' una moltiplicazione:** ognuna e' la somma delle caselle della griglia
    dei punteggi che soddisfano tutte e due le condizioni, sommate nella stessa passata che
    `mercatiGol` gia' faceva. Accanto a ogni quota sta di quanto si discosta dal prodotto delle
    due marginali, col suo verso: e' li' che la correlazione si dichiara, cella per cella.
    **Le due letture non sono indipendenti, ed e' misurato su 11.330 gare archiviate:** il
    pareggio con oltre 2,5 gol vale **6,63%** mentre il prodotto delle marginali dice
    **13,42%**, cioe' il doppio del vero; sopra 4,5 e' **1,31%** contro **3,63%**; la vittoria
    interna sopra 4,5 e' **7,60%** contro **6,13%**.
    **Il modello lo coglie.** Con gli attesi medi (1,510 e 1,185) la congiunta della griglia da'
    6,61% dove l'osservato e' 6,63%, e su tutte e dodici le caselle lo scarto massimo e'
    **0,57 punti**. E' un confronto aggregato sugli attesi medi, non gara per gara: va letto
    come tale, e non sostituisce una taratura fuori campione.
    Quattro prove in `test:projection-gol`, che sanno diventare rosse: col prodotto al posto
    della congiunta ne falliscono tre.
    **Difetto trovato guardando la cattura:** sotto i 760 px la tabella diventa una scheda per
    riga e il `thead` esce di scena, quindi i quattro numeri di ogni esito restavano senza la
    loro linea; ora ogni cella porta il suo `data-label`.
    *Costo in pagina:* **zero a porta chiusa**, e 811 px a 375, 690 a 768, 333 a 1024 e 1440
    quando si apre. Zero overflow e zero sotto AA a tutte e quattro le larghezze.
17. **Vetrina dei prossimi giorni.** Le letture più forti in arrivo. *Criterio:* accanto
    alla vetrina sta il **consuntivo completo**, non solo le riuscite: la loro versione
    mostra solo gli azzeccati fra l'88 e il 99 per cento, ed è selezione, non misura.
    — **meta' fatta il 6 settembre 2026, meta' ferma per una misura.**
    ~~Il consuntivo completo~~ e' pubblicato su `/metodo`, prima di «Cosa non fa IQstatS»:
    `apps/web/scripts/consuntivo-letture.ts` rifa' girare `candidateDiGara`, `baseDiLega` e
    `ordinaLetture` sulle gare chiuse e conta tutte le letture, prese e sbagliate. Primo
    giro su 1.200 gare: 547 con letture, **1.409 letture, 936 prese, 66,4% contro il 67,1%
    promesso**; per fascia 62,1 contro 58,6 (50-60%), 62,3 contro 64,4 (60-70%), 74,8 contro
    74,0 (70-80%), **72,9 contro 81,6 (80-90%)**. Due minuti e quattro secondi.
    **La vetrina e' pubblicata il 6 settembre 2026, e il criterio e' cambiato per tutti.**
    `npm run criterio-vetrina` ha confrontato cinque regole sulle stesse candidate di 1.200
    gare chiuse, contando la lettura in cima a ogni gara: la forza rendeva **63,3% su 65,1%
    promesso**, la regola nuova rende **77,3% su 76,6%** (intervallo di Wilson 73,7-80,6).
    La regola nuova e' **la piu' probabile dentro la fascia fino all'ottanta per cento**, dove
    il consuntivo dice che promesso e reso coincidono; a parita' di punto percentuale decide
    l'affidabilita', perche' col tetto le prime si schiacciano contro il tetto e ordinarle per
    il quarto decimale sarebbe ordinare rumore.
    **Il controllo che aveva bocciato la vetrina, ora contato:** le letture sopra sia alla base
    di lega sia alla storia della squadra scendono dal **44,3% al 26,1%**, e quelle oltre
    quaranta punti dalla frequenza delle squadre da 0,9% a **zero**.
    **Quello che il criterio non sistema, e sta scritto:** nella fascia 50-60% rende 41,8%
    contro il 59,4% promesso, su 55 letture. E' l'unica fascia dove la promessa non regge, e il
    consuntivo la mostra come mostra le altre.
    Il consuntivo rifatto con la regola nuova: **2.055 letture su 581 gare, 1.445 prese, 70,3%
    contro 71,1%**, e la fascia 80-90% non esiste piu'. La vetrina sta in cima a `/pronostici`,
    legge l'artefatto di `npm run vetrina-letture`, e le gare gia' cominciate escono da sole.
    **La storia di come si e' arrivati qui.** `scripts/vetrina-letture.ts`
    esiste e gira - 131 gare in arrivo in un giorno, 56 con una lettura, 14,8 s - ma la
    forza (`|probabilita - base| x affidabilita`) **seleziona per costruzione gli scostamenti
    piu' grandi**, e in cima finisce la coda degli errori del modello. Confrontate le sette
    letture di lato con la storia della squadra dallo stesso lato: **sei su sette stanno
    sopra sia alla base di lega sia alle sue gare**, due di quaranta e sessanta punti —
    Liaoning Tieren over 3,5 fuorigioco al 74% contro il 14% di lega e il **10% su dieci sue
    gare**; Valencia under 4,5 corner al 71% contro il 34% di lega e il **24% su ventuno**.
    Il consuntivo lo conferma da solo: la fascia 80-90%, dove la vetrina abita, promette 81,6
    e rende 72,9. **Deciso dall'utente il 6 settembre: lo script resta come strumento di
    misura, la pagina non si pubblica finche' il criterio della vetrina non regge.**
18. ~~**Generatore di multiple.**~~ — **fatto il 6 settembre 2026, dentro la singola gara.**
    Nella sezione Gol si scelgono due o piu' letture della stessa gara — esito, doppia
    chance, over/under, entrambe segnano — e la probabilita' che accadano insieme e' la
    **somma delle caselle della griglia** che le soddisfano tutte. Accanto sta il prodotto
    delle stesse letture prese una per una, con la differenza in punti.
    **I sette bersagli del motore restano fuori, ed e' misurato su 11.066 gare:** nella stessa
    gara tiri e tiri in porta stanno a **0,622**, tiri e parate a **0,556**, falli e gialli a
    **0,413**, tiri e corner a 0,339, e tiri e falli a **-0,173**, cioe' negativa. La loro
    congiunta non e' modellata: una combinazione fra bersagli diversi non avrebbe un numero
    onesto, e la pagina lo scrive invece di calcolarlo.
    **Fra gare diverse la correlazione non e' zero, ed e' piccola:** stessa competizione e
    stagione, su over 2,5, **+0,0354** fra gare dello stesso giorno (18.865 coppie) contro
    **+0,0149** fra giorni diversi (86.092), quindi l'effetto giornata netto vale circa
    **+0,02**. Le multiple fra gare diverse restano fuori da questa versione.
    *Provato con clic veri su Juventus-AC Milan a 375 px:* Pareggio 25,3%; Pareggio piu'
    Over 2,5 **7,1%**, con la nota che moltiplicando verrebbe 13,3%, **-6,2 punti**;
    aggiungendo Under 2,5 la pagina dichiara che le tre non possono accadere insieme. I chip
    portano `aria-pressed` e sono alti **44 px**.
    *Costo:* **+54 px a porta chiusa** alle quattro larghezze; il blocco misura 678 px a 375,
    502 a 768, 415 a 1024 e 1440 quando si apre. Zero overflow e zero sotto AA.
19. ~~**Assistente conversazionale.**~~ — **fatto il 6 settembre 2026, senza modello.** Su
    `/cerca` una parola sola resta una ricerca, una frase diventa una domanda: «come sta il
    Napoli» apre la scheda della squadra, «come arbitra Maresca» quella dell'arbitro, «che
    tempo fa» dichiara di non aver capito.
    **Nessun modello, e non e' una rinuncia: e' il criterio.** Un modello che scrive la
    risposta puo' sempre inventare una cifra e servirebbe una guardia da misurare; qui la
    domanda sceglie **quale** scheda mostrare, e i numeri escono da `profiloSquadra` e
    `profiloArbitro`, le stesse funzioni che disegnano le pagine. Inventare e' impossibile
    perche' niente viene scritto: viene solo scelto. L'avviso dice anche **come** puo'
    sbagliare, cioe' scegliendo la scheda sbagliata.
    *Verificato incrociando i numeri:* «come sta il Napoli» scrive «Gol fatti 1,5 su 39 gare»,
    e la stessa media interrogata sul livello dati da' 1,5 su 39.
    **Due difetti trovati provando domande vere e guardando la cattura:** «quanti falli fischia
    Orsato» cercava «falli orsato» e non trovava nessuno; e sotto la risposta la pagina
    scriveva «Nessun nome contiene "come sta il Napoli"», contraddicendo la risposta appena
    data. Corretti tutti e due, con una prova sul primo.

## Blocco 5 — i dati che loro non hanno

20. ~~**Scontri comuni**: le due squadre contro gli stessi avversari.~~ — **fatto il
    6 settembre 2026.** `scontri-comuni.ts` legge le gare delle due squadre contro le sole
    squadre che **entrambe** hanno affrontato in quella competizione, su tutte le stagioni
    archiviate; le loro gare dirette restano fuori, quelle sono il testa a testa. Nove
    metriche: gol fatti e subiti piu' i sette bersagli del motore. Il campo non e' tenuto
    fermo, e la sezione lo dichiara: per il lato c'e' gia' `lati.ts`.
    **La finestra e' larga per necessita', ed e' misurato:** nella sola stagione in corso la
    mediana degli avversari comuni e' **3** e il primo quartile **1**, cioe' a settembre la
    sezione non esisterebbe meta' delle volte; su tutte le stagioni archiviate la mediana e'
    **16**, il primo quartile **10**, e il **76% delle coppie** arriva a dieci. Minimo cinque
    avversari comuni (81% delle 6.314 coppie) e cinque gare per metrica, come `lati.ts`.
    **Una differenza si dichiara differenza solo se supera l'errore delle due medie messo
    insieme**, la stessa disciplina di `lati.ts`; le metriche che restano dentro l'errore
    stanno dietro un comando che le nomina.
    *Misurato in pagina* su NEC Nijmegen-Feyenoord (210836): 16 avversari comuni, 34 gare a
    testa, due metriche su nove oltre l'errore - falli, scarto 2,3, e fuorigioco, 0,6. Costo
    in altezza: +667 px a 375 (24.237 -> 24.904), +503 a 768, +493 a 1024, +476 a 1440; la
    porta sulle sette metriche dentro l'errore ne rende 336. Zero overflow, zero sotto AA.
    Due prove in `test:scontri-comuni` che ricontano a mano sul livello dati.
21. ~~**Frequenza storica della linea** per squadra, accanto alla base di lega.~~ —
    **fatto il 5 settembre 2026.** `baseDiSquadra` in `base-di-lega.ts`: stessa competizione,
    tutte le stagioni archiviate, gare della squadra **dal lato che giochera' in questa gara**,
    `having count(*) = 2`. Le linee di lato portano una squadra, quelle di totale entrambe
    col nome accanto.
    **Il minimo e' quindici e non trenta, ed e' misurato:** per squadra, competizione e lato
    la mediana e' **19 gare** e solo **25-27 coppie su 623 (4%)** arrivano a trenta; a quindici
    ne passa il **78%**, la stessa copertura che darebbe mescolare i due lati con il minimo di
    trenta, senza pero' mescolarli.
    *Misurato in pagina:* NEC Nijmegen-Feyenoord (210836) «lega 88% · NEC 78% su 18, Feyenoord
    79% su 19»; Aberdeen-Kilmarnock (211135) non ha ancora una base di lega e porta comunque
    la frequenza di squadra su tutte e quattro le letture. Costo in altezza sulla stessa
    pagina: +118 px a 375 e 768, +84 a 1024, +51 a 1440; zero overflow, zero sotto AA.
    Due prove nuove in `test:base-di-lega` che ricontano a mano sul livello dati.
22. ~~**Elenco gare per esteso** sotto ogni famiglia.~~ — **fatto il 6 settembre 2026.** Ogni
    card delle sette famiglie porta una porta con le gare che compongono le due medie
    osservate: giorno, avversario e valore, dalla piu' recente.
    **Costa zero richieste alla fonte e zero interrogazioni nuove al motore:** sono le stesse
    righe gia' lette per proiettare, elencate invece che mediate. L'unica lettura in piu' e'
    una sola per dossier, che traduce gli identificativi delle squadre in nomi.
    **Il filtro e' ripetuto e non condiviso, per una ragione misurata:** far calcolare la media
    da questa lista ne cambierebbe l'ordine di somma, e il motore ha una prova di parita' con
    Python che confronta quei numeri fino all'ultima cifra. A tenere insieme le due funzioni
    c'e' la prova «l'elenco e la media dicono la stessa cosa».
    *Verificato in pagina* su Juventus-AC Milan (210084): «osservato in casa 21,0 su 1 gara» e
    l'elenco scrive 21,0 contro il Parma; fuori casa 19,0 e l'elenco 19,0 contro il Torino.
    *Costo:* **+364 px a porte chiuse** alle quattro larghezze, 52 px per famiglia, e le sette
    porte nascondono **928 px** gia' oggi con due gare per famiglia: 564 px netti risparmiati a
    settembre, molti di piu' a stagione avanzata. Zero overflow e zero sotto AA a porte aperte
    e chiuse.
23. ~~**Taratura delle linee**: quando diciamo «over 7,5 al 71%», quante volte esce.~~ —
    **fatto il 6 settembre 2026, e la premessa del piano era sbagliata.** Il passaggio
    offline **esiste gia'**: `scripts/projection/models/lines.py` misura la calibrazione delle
    cinque soglie fuori campione, ha girato su tutti e sette i bersagli, e il suo numero e'
    **gia' dentro gli artefatti che l'app spedisce** —
    `totale.calibrazione_delle_linee_sui_due_lati` per le scale di lato,
    `totale.prova_fuori_campione.scarto_di_calibrazione_delle_linee` per quella del totale.
    `corner_kicks-linee.json` dice 0,0168 e l'artefatto dice 0,0168: stesso numero.
    Il read model lo portava gia' a meta': `scartoDiCalibrazioneDelleLinee` esisteva su
    `ProiezioneDiGara` dal giorno del totale e **nessuna riga dell'app lo leggeva**. Ora la
    card di ogni famiglia lo scrive accanto all'affidabilita', con i due numeri separati
    perche' il lato e il totale sono due scale.
    **Le misure, a decili di probabilita' e fuori campione:** di lato da **1,30** punti
    (fuorigioco) a **1,83** (tiri); sul totale da **2,00** (gialli) a **3,38** (falli), su
    2.745-3.000 gare di prova. Il totale sbaglia piu' dei lati su tutti e sette.
    *Misurato in pagina:* +243 px a 375 e +100 alle altre tre larghezze, zero overflow, zero
    sotto AA.

---

## Quello che non si fa, e perché

- **Token, ruota giornaliera, muro a pagamento sul dato**: nascondono il dato per venderlo.
- **Sistemi di puntata** (progressioni, martingale): sono metodi di scommessa, non
  intelligence, e il design system vieta le istruzioni di puntata.
- **Schedina scelta dal sistema al posto dell'utente.**
- **Vetrina dei soli pronostici riusciti.**
- **Altri sport**: esclusi dall'utente il 29 agosto 2026.
