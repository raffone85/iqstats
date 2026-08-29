# Ricognizione dei due prodotti di riferimento — PowerStats e BioFootballBet

Scritta il **29 agosto 2026**, navigando i due siti con il browser dell'utente, già
autenticato. Registra **struttura e comportamento**: quali sezioni esistono, cosa raccoglie
ciascuna, che gerarchia usa, dove mette il dato grezzo e dove la lettura.

**Regola che vale su tutto questo documento** (`AGENTS.md`): i due prodotti sono **fonte di
ispirazione funzionale**. Qui non si copiano testi, etichette, colori, marchi, asset né
formule proprietarie. Le poche frasi fra virgolette servono a identificare un elemento, non
a essere riusate in pagina.

---

## 1. Che cosa ho visto, e che cosa no

**PowerStats** (`powerstats.shop`), sessione con **piano gratuito**: dashboard, dettaglio
gara (Expected) con tutte e otto le schede, Generatore, l'elenco delle sezioni di
Statistiche, Classifiche, Profilo con le sue otto voci, Account e dati personali,
Informativa privacy, l'assistente AI, il pannello «Verifica» di una gara finita, il blocco
«Migliori Expected» e la spiegazione dei dati limitati.

**Non ho potuto vedere:** il contenuto del Generatore oltre i controlli (la schedina è
dietro il piano a pagamento), le tabelle di Classifiche (non hanno caricato le righe nei
miei tentativi), e le sotto-sezioni **Giocatori · Cerca · Preferiti**, che da indirizzo
diretto restano vuote. `/termini` risponde **404**: l'unica pagina legale raggiungibile è
`/privacy`.

**BioFootballBet** (`biofootballbet.it`): il dettaglio gara di Goiás–São Bernardo, aperto
nelle quattro sezioni chieste dall'utente — Tiri/Tiri in porta/Parate, Falli e cartellini,
Calci d'angolo, Fuorigioco. Il permesso dell'estensione è decaduto dopo la prima lettura,
quindi della resa grafica non ho catture; la struttura è completa.

---

## 2. PowerStats, pagina per pagina

### 2.1 Dashboard (`/`) — il calendario è la home

Due livelli di navigazione: gli **sport** in cima (calcio, tennis, basket, fantacalcio) e
una **barra fissa in basso** con quattro destinazioni — **Statistiche · Expected ·
Generatore · Classifiche**. In alto a destra due comandi: **Profilo** e **Assistente AI**.

Il corpo è il calendario del giorno:

- navigazione temporale: giorno precedente, «Oggi», giorno successivo, più **«Scegli una
  data»**;
- filtri di stato: **Tutte · Live · Da giocare · Finite**;
- selettore **Campionati**;
- un blocco **«Migliori Expected della settimana»**;
- le gare **raggruppate per campionato**, dalle leghe maggiori alle minori (Serie A, Premier,
  Liga… fino a Serie C per girone, K League, Chinese Super League, Saudi Pro League).

**La riga gara cambia faccia secondo lo stato**, ed è la cosa più intelligente della
dashboard: 1X2 in percentuale se da giocare, punteggio e stato se in corso, punteggio e un
pulsante **«Verifica»** se finita.

**Copertura dichiarata per campionato.** Accanto al nome della lega può comparire l'etichetta
«Dati limitati» con un comando che apre la spiegazione: quel campionato ha giocato poche
giornate, il campione è piccolo, la previsione è meno affidabile e migliora col tempo.

### 2.2 Expected (`/expected?…&fixtureId=…`) — il dossier gara

Testata: lega, data e ora, le due squadre, e il badge di copertura.

**Otto schede**: **Gol · Tiri · Corner · Falli · Offside · Combo · Suggerite · Analitiche**.
Ogni scheda è una griglia di riquadri con la **stessa forma**: nome del mercato in
maiuscoletto, la **selezione già scelta**, la percentuale.

| Scheda | Che cosa contiene |
| --- | --- |
| Gol | esito finale, doppia chance, over/under, goal/no goal, multigol partita / casa / ospite, risultato esatto, un **cluster di risultati** (tre punteggi insieme) |
| Tiri | totali match, in porta match, casa, ospite, in porta casa, in porta ospite, **«dominio tiri»** (chi tira di più, in percentuale) |
| Corner | totali, casa, ospite, **«dominio corner»** |
| Falli | un **riquadro arbitro** con nome, badge «ufficiale» e la dichiarazione che falli e cartellini sono calcolati sul suo storico; poi falli totali, cartellini match, falli casa/ospite, cartellini per singola squadra, «entrambe ammonite» |
| Offside | match, casa, ospite |
| Combo e Suggerite | coppie di mercati con la loro percentuale. **Le due schede mostrano le stesse sette righe identiche**: o è voluto, o è un difetto loro |
| Analitiche | la **matrice esito × over/under**, soglia per soglia, con tutte e sei le celle (1O, 1U, XO, XU, 2O, 2U) |

**Muro a pagamento**: gli Expected costano un **token**, con un token gratuito a settimana e
un conto alla rovescia per il prossimo; l'abbonamento li sblocca.

### 2.3 Verifica — predetto contro reale, per la singola gara

Si apre dal calendario, sulle gare finite. Intestazione «predetto vs reale», il risultato, e
un punteggio complessivo del tipo **«presi 14/25»**. Sotto, **un gruppo per famiglia** con il
suo punteggio parziale, e una riga per ogni previsione:

```
GOL   3/3 presi
Totali        2,9  (2–5)   →   3   ✓
squadra casa  1,4  (0–2)   →   0   ✓
squadra fuori 1,6  (1–3)   →   3   ✓

TIRI  1/3 presi
Totali       25,7  (21–31) →  37   ✗
```

Cioè: **valore atteso con il suo intervallo**, il valore reale, l'esito. È la cosa più onesta
che ho visto nei due prodotti.

### 2.4 «Migliori Expected» — la vetrina

Due schede, «prossimi 7 giorni» e «azzeccati». L'elenco degli azzeccati porta gara, data,
risultato, mercato, selezione, percentuale data e quota.

**Limite dichiarato, e va detto:** mostra **solo** i pronostici riusciti, con percentuali fra
88% e 99%. È una vetrina selettiva, non una misura: non dice quante volte, date quelle
percentuali, l'evento è poi uscito davvero.

### 2.5 Generatore

Una riga spiega il mestiere: si scelgono periodo, quota e numero di eventi, il sistema
sceglie i pronostici più probabili che arrivano a quella quota. Poi un «come funziona» a
scomparsa e **sette controlli**:

1. periodo (oggi, un giorno);
2. campionati, con il conto di quanti sono selezionati e quante partite comprendono;
3. mercati, con lo stesso tipo di conto;
4. **quote**: «le nostre» oppure «solo mercato», con la nota che le prime comprendono anche
   eventi che il mercato può non quotare;
5. numero di eventi, con un passo avanti/indietro;
6. **quota obiettivo**, con un'etichetta di rischio;
7. interruttore **«un solo esito per partita»**.

**Il pezzo meglio scritto di tutto il sito** sta sotto la quota obiettivo: una frase che
traduce la quota in probabilità media per evento — con quattro eventi a quota dieci, ogni
evento vale circa 1,78, cioè circa il 56%. Non costa dati: costa pensiero.

La schedina completa è dietro l'abbonamento.

### 2.6 Statistiche (`/calcio`) — il secondo livello

Selettore di lega e stagione in cima, e **nove voci**: **Squadre · Giocatori · Home ·
Arbitri · Calendario · Cerca · Confronto · Classifiche · Preferiti**. La sezione Squadre
parte da «seleziona una squadra» con l'elenco completo della lega.

### 2.7 Classifiche

Due controlli in cima — **come contare i numeri** e un selettore **media a partita / tutte**
— e le metriche raggruppate in quattro famiglie: **Attacco · Possesso & Passaggi · Difesa ·
Disciplina**.

### 2.8 Assistente AI

Un campo di domanda («chiedi a…») con:

- un **avviso di immaturità**: funzione nuova, può sbagliare, si segnalano gli errori
  dall'assistenza;
- **quattro scorciatoie di domanda**: pronostici per una partita o un giocatore, classifica
  di un campionato, statistiche di un giocatore, risultati di un giorno;
- un **disclaimer legale** in coda: analisi statistiche e non consigli di scommessa, vietato
  ai minori di diciotto anni, avvertenza sul disturbo da gioco d'azzardo con numero verde.

### 2.9 Profilo

Stato del piano in cima, poi **otto voci, ciascuna con una riga che dice cosa contiene**:
abbonamento; **token** (i propri token, una *ruota giornaliera*, l'acquisto); account e dati
personali; fatturazione; preferenze; **le mie schedine**; installazione della webapp;
assistenza. In fondo, l'uscita.

**Account e dati personali** apre con un blocco «privacy e dati» e due azioni — **scarica i
miei dati** e **informativa privacy** — poi la scheda dei dati, e in fondo modifica, cambio
password ed **eliminazione account**.

### 2.10 Privacy (`/privacy`)

Informativa GDPR datata, con titolare e recapito, e **undici sezioni numerate**: a chi si
rivolge, quali dati, base giuridica, con chi si condividono, trasferimenti fuori dall'Unione,
conservazione, diritti, come esercitarli, reclamo all'autorità, **archiviazione locale**,
modifiche. Dichiara l'uso di `localStorage` per sessione, preferenze e schedine salvate, e
**nessun cookie di profilazione o pubblicitario**.

### 2.11 Altri comportamenti trasversali

- **Onboarding a passi** sulle funzioni nuove, con «salta» e «avanti».
- **Invito a installare la webapp** sulla schermata home.
- Modali promozionali sulle funzioni chiuse, con «più tardi» e «non mostrare più».

---

## 3. BioFootballBet — la struttura del dossier gara

Tredici schede sopra il dossier: riepilogo, asian, analisi 1X2, risultati esatti, analisi
gol, calci d'angolo, tiri/tiri in porta/parate, falli e cartellini, fuorigioco, possesso
palla, ritardi, prima sostituzione, data mining. Nel menu di sito compaiono inoltre strumenti
di puntata (progressioni e sistemi) che **non ci riguardano**.

**Le quattro sezioni statistiche hanno tutte lo stesso impianto a cinque strati:**

1. **Differenziali in cima** (tiri e corner): media stagionale, media delle ultime cinque, e
   la **differenza esplicita** fra le due, per prodotto e per concesso, separate per lato.
2. **Due blocchi per squadra**: le medie della squadra dal suo lato accanto alle medie
   **concesse dall'avversaria dal suo lato**, con i gol nella stessa griglia.
3. **Elenco gare per esteso**: diciotto-venti righe con data, risultato e la metrica divisa
   fra casa e ospite. Nessun riassunto.
4. **Classifica di lega** su tutte le squadre, con le colonne prodotte e concesse **divise
   casa/trasferta** più i totali. Nei tiri aggiunge le parate dei due portieri.
5. **Scontri comuni** e **testa a testa** in fondo a ogni scheda.

**Quello che cambia da una scheda all'altra:**

- **Falli e cartellini** contiene la **scheda dell'arbitro**: carriera, una riga per stagione
  e competizione, le ultime cinque gare contro la media di carriera con la differenza, e le
  gare dirette nella stessa lega e stagione.
- **Corner** è l'unica con **la linea**: soglia, quota over e under, e la **percentuale
  storica di superamento** in casa e in generale.
- **Falli, corner e fuorigioco** hanno il **«1X2 della metrica»**: in quante gare la squadra
  quel confronto lo vince, lo pareggia o lo perde, in casa e in totale.
- **Tiri** porta tre metriche in una scheda, ciascuna col suo elenco gare.

---

## 4. Dove siamo noi

| Funzione | PowerStats | BioFootballBet | IQstatS |
| --- | --- | --- | --- |
| Calendario per giorno, filtri di stato | sì | — | `/partite` |
| Dossier gara | schede per famiglia | schede per famiglia | capitoli, con barra |
| Produce contro concede per lato | — | sì | sì, **con l'errore delle medie** |
| Trend ultime cinque | — | sì | sì, **solo se supera l'errore** |
| Chi vince il confronto gara per gara | come previsione | come frequenza | sì, **con campione e pareggi** |
| Classifica di lega per metrica | per gruppi | per lato, con concesso | sì, **per lato, con concesso** |
| Arbitro | riquadro nel dossier | scheda con carriera | scheda **col metro della sua lega e la dispersione** |
| Verifica predetto contro reale | **sì, per gara** | — | **manca** |
| Taratura delle percentuali | — | — | **manca, e non ce l'ha nessuno** |
| Frequenza storica della linea | — | sì (corner) | base **di lega**, non di squadra |
| Scontri comuni | — | sì | **manca** |
| Generatore di multiple | sì | — | **manca** |
| Combo e matrice esito × over/under | sì | — | **manca** |
| Giocatori | sì | — | **manca** |
| Cerca, preferiti | sì | — | **manca** |
| Assistente conversazionale | sì | — | **manca** |
| Badge di copertura in testata | sì, per lega | — | copertura dichiarata, ma **sparsa** |
| Avvertenze legali sul gioco | sì | — | **da verificare** |

---

## 5. Che cosa prendere, che cosa no

**Da prendere, in ordine di valore.**

1. **La taratura delle percentuali.** Nessuno dei due la mostra: PowerStats verifica la
   singola gara, BioFootballBet non verifica affatto. La domanda che conta è un'altra:
   *quando diciamo 70%, quante volte succede?* Con le nostre proiezioni salvate e le gare
   osservate si calcola, e diventa la riga più onesta del prodotto.
2. **La verifica predetto contro reale**, nella forma di PowerStats: atteso con intervallo,
   valore reale, esito, un punteggio per famiglia. È il mattone su cui poggia la taratura.
3. **Gli scontri comuni** di BioFootballBet: come sono andate le due squadre contro gli
   **stessi avversari**. È il confronto più solido quando i precedenti diretti sono pochi.
4. **La frequenza storica della linea** per la squadra, accanto alla nostra base di lega.
5. **La frase che traduce il numero**, dal Generatore: ogni percentuale dice anche cosa
   significa in pratica.
6. **Il badge di copertura in testata**, dal calendario di PowerStats: una dichiarazione sola
   e visibile invece di dieci note sparse.
7. **Le avvertenze legali** dell'assistente: analisi e non consigli, divieto ai minori,
   avvertenza sul gioco d'azzardo. Da verificare se ci servono, e dove.

**Da non prendere, e perché.**

- **Il muro a token e la ruota giornaliera**: nascondono il dato per venderlo, e il valore di
  questo prodotto è l'opposto.
- **I sistemi di puntata** di BioFootballBet: sono metodi di scommessa, non intelligence, e
  il design system vieta le istruzioni di puntata.
- **La schedina generata dal sistema**: contraddice la lettura personale che il prodotto
  vuole rendere possibile.
- **La vetrina dei soli pronostici azzeccati**: è selezione, non misura.
- **Le due schede con lo stesso contenuto** (combo e suggerite): o è un difetto, o è
  riempimento.

---

## 6. Ordine di lavoro proposto

1. **Verifica** predetto contro reale sulla gara finita — usa dati che abbiamo già.
2. **Taratura** aggregata per famiglia e per fascia di probabilità.
3. **Scontri comuni** nel dossier.
4. **Frequenza della linea** per squadra, accanto alla base di lega.
5. **Badge di copertura** in testata.

Le prime due sono il differenziale competitivo; le altre tre sono completamento.
