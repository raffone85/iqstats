# Architettura informativa di IQstatS

Aggiornato il **3 settembre 2026**, dopo le tre fasi del riordino frontend. Descrive la
struttura **reale**: ogni route qui elencata esiste nel repository, e nessuna route esistente
è omessa. La versione precedente descriveva `/segnali`, `/database`, `/competizioni/[leagueId]`,
`/giocatori/[playerId]` e `/impostazioni`, che non sono mai esistite.

## Principio

IQstatS accompagna l'utente dalla selezione di una gara alla spiegazione dei dati che la
rendono interessante. Ogni nodo della gerarchia dichiara fonte, aggiornamento, copertura e
limiti. Nessuna sezione è mostrata come disponibile se il suo contratto dati non è stato
verificato.

## Navigazione primaria — cinque destinazioni

Le stesse cinque voci su desktop e su mobile, dove diventano la barra inferiore. Il tetto è
cinque, e dal 3 settembre 2026 è di nuovo rispettato.

```text
IQstatS
├── Oggi              /            porta del giorno: gara in evidenza, calendario, tessere
├── Pronostici        /pronostici  le gare in arrivo lette dal modello
├── Squadre           /squadre     confronto fra squadre, elenco e schede
├── Arbitri           /arbitri     elenco degli arbitri con campione sufficiente
└── Metodo            /metodo      come si leggono i dati, e che cosa il prodotto non fa
```

**Cercare è un'azione, non una destinazione.** `/cerca` resta ed è raggiungibile dalla
testata di ogni pagina, con la lente accanto al blocco account. Non occupa una voce primaria
e non compare nella barra inferiore.

**Profilo e Piani** stanno nella subnav della testata, nascosta sotto i 1024 px, dove il
blocco account resta l'unica porta. **Privacy e Termini** stanno nel piede.

## Le altre route, tutte funzionanti

| Route | Che cos'è | Come ci si arriva |
| --- | --- | --- |
| `/partite` | L'elenco completo del giorno, con filtri lega, campionati preferiti, salto data e guida | Da Oggi e dal ritorno del dossier. **Non è in barra e non è stata rimossa**: i link e i bookmark esistenti continuano a funzionare |
| `/match/[id]` | Il dossier della gara | Da Oggi, Pronostici, Partite, Squadre, Arbitri |
| `/squadre/[teamId]` | Scheda squadra: rendimento, casa/trasferta, rosa, arbitri, allenatore, prossime gare | Da Squadre e dal dossier |
| `/arbitri/[refereeId]` | Scheda arbitro | Da Arbitri e dal dossier |
| `/expected` | Accostamento fra due squadre che non si incontrano; riusa cinque componenti del dossier | Dalle tessere di Oggi. **Mantenuta funzionante**: la direzione è farne uno strumento dell'area Squadre, senza migrazione distruttiva |
| `/cerca` | Ricerca per nome fra squadre e arbitri | Dall'azione nella testata |
| `/account`, `/account/billing` | Profilo, abbonamento, fatturazione, dati, cancellazione | Subnav e blocco account |
| `/accedi` | Porta d'ingresso, con impianto proprio | Dal pulsante «Accedi» |
| `/privacy`, `/termini` | Legali | Dal piede |

## Dossier partita — nove aree

`/match/[id]` non è una raccolta di card equivalenti: è una successione di aree, e
**un'area è una domanda dell'utente, non un elenco di funzioni**. Una funzione nuova entra
nell'area che risponde alla sua domanda; diventa un'area nuova solo se porta una domanda che
nessuna delle nove pone già.

```text
/match/[id]
├── Testata                 competizione, squadre, orario, stato, arbitro designato, punteggio live
├── 01 Insight              il verdetto, il segnale principale con la sua forza, il secondo,
│                           il candidato di valore, l'affidabilità, il campione, i conflitti
├── 02 Mercati              probabilità nostra e di mercato, quota, movimento, margine
├── 03 Gol                  attesi, over/under, entrambe segnano, multigol, primo e secondo tempo
├── 04 Proiezioni           le sette famiglie con intervallo, linea e affidabilità
├── 05 Trend                come si affrontano, ultime gare, contese, classifica e forma, ritardi
├── 06 Contesto             ritmo e intensità, stadio, meteo, viaggio, derby, campo neutro
├── 07 Giocatori            formazioni, poi chi può segnare e chi rischia il cartellino, panchine
├── 08 Arbitro              come fischia contro il metro della sua lega, campione, carriera
└── 09 Precedenti e metodo  testa a testa, previsto contro reale, taratura, analisi finale
```

**«La gara giocata» è una configurazione, non una decima area.** Quando la gara è conclusa,
tabellino, mappa dei tiri e cronologia salgono subito sotto la testata, seguiti dal conto di
quello che avevamo detto; il resto delle nove aree resta nello stesso ordine. Non è una voce
permanente della navigazione e non esiste su una gara da giocare.

**La barra dei capitoli** è sticky sotto la testata, scorre in orizzontale, usa ancore vere
che funzionano senza JavaScript, e **elenca solo le aree che su quella gara hanno davvero un
pannello**: un'area riservata mostra il suo riquadro d'accesso in pagina ma non compare fra
le destinazioni di chi non può aprirla.

## Tre livelli di lettura, senza un selettore

Non esiste un interruttore Quick/Analysis/Deep, e non deve esistere: costerebbe uno stato da
mantenere e romperebbe le ancore condivisibili.

- **Quick** è l'area Insight: un pannello, la risposta.
- **Analysis** è scorrere le aree, o saltarci con la barra dei capitoli.
- **Deep** sono gli accordion già dentro le aree: tabelle complete, distribuzioni, campioni,
  testa a testa, previsto contro reale.

## Regole di disponibilità

| Sezione | Dati minimi necessari | Comportamento senza dati |
| --- | --- | --- |
| Testata | fixture normalizzata | pagina non disponibile con errore recuperabile |
| Insight | almeno una fra verdetto, segnale, conflitto, lettura forte | l'area non compare, né in pagina né in barra |
| Mercati | quote normalizzate o letture con prezzo | avviso di copertura, nessun prezzo fittizio |
| Gol, Proiezioni | osservazioni del motore | si dichiara perché mancano, non si stima |
| Contesto | fixture | il riquadro dichiara le assenze una per una |
| Precedenti e metodo | metadati di acquisizione e formula | sempre disponibile per un dato mostrato |

## Regole di design

- Mobile-first; corpo testo almeno 16 px, controlli interattivi almeno 44 px e nessun
  overflow orizzontale del corpo pagina. Le barre interne che scorrono di lato — capitoli,
  scala del motore, tabelle larghe — hanno il proprio `overflow-x`.
- Contrasto testo 4.5:1, stato attivo non affidato al solo colore, focus da tastiera
  visibile e ordine dei titoli sequenziale.
- Grafici con legenda, valori accessibili al tocco/tastiera e alternativa tabellare.
- Loading oltre 300 ms con skeleton; stati empty/error con causa e azione di retry.
- Tooltip, colore e micro-animazioni non possono essere l'unico veicolo informativo;
  rispettare `prefers-reduced-motion`.
- Un'assenza si dichiara assenza e non diventa mai uno zero.
