# Architettura del motore di proiezione pre-partita

Scritto il 16 agosto 2026. Stato: **architettura decisa, dataset e modelli non ancora
costruiti.** Nessun modello è in produzione per effetto di questo documento.

Riferimenti: [dizionario delle metriche](dizionario-metriche.md) ·
[inventario della fonte](inventario-fonte.md) ·
[contratto del motore statistico esistente](eng-1-statistical-engine-contract.md) ·
`data/registro-metriche.json` · `data/registro-target.json`.

## 1. Obiettivo e perimetro

Produrre, prima del calcio d'inizio, una proiezione numerica per il maggior numero
possibile di metriche che abbiano storico sufficiente — con intervallo di previsione,
affidabilità derivata dall'errore misurato, e la dichiarazione onesta di quando **non** si
prevede.

Il motore non sostituisce quello esistente: lo **sfida**. Il motore in produzione (rating
attacco e difesa → λ ancorato alle medie reali di lega → binomiale negativa con dispersione
calibrata) è già una delle baseline obbligatorie, ed è già stato misurato fuori campione.
Un modello nuovo entra in produzione solo se lo batte.

## 2. La divisione del lavoro

**Python fa ricerca. TypeScript prevede.**

| Fase | Dove | Che cosa |
|---|---|---|
| Ricognizione e preparazione dati | Python, `scripts/projection/` | dizionario, registri, dataset as-of |
| Costruzione delle feature | Python | orizzonti, medie mobili, aggiustamenti |
| Addestramento e selezione | Python | modelli candidati, confronto con le baseline |
| Backtest temporale | Python | walk-forward, errore per segmento |
| Interpretabilità | Python | importanza per permutazione, SHAP |
| Calibrazione degli intervalli | Python | copertura misurata |
| Esportazione | Python | artefatto versionato |
| **Inferenza di produzione** | **TypeScript, dentro l'applicazione** | lettura dell'artefatto e calcolo della proiezione |

Nessun microservizio, nessuna API separata, nessun nuovo rilascio. L'ambiente Python è
locale (`.venv`, escluso dal versionamento) e non esiste a runtime.

## 3. Il cancello di promozione

Un modello può essere **sperimentato** liberamente, anche complesso. Entra in produzione
solo se supera **tutte e quattro** queste condizioni:

1. batte stabilmente la baseline fuori campione, non su una finestra fortunata;
2. è serializzabile in un artefatto deterministico;
3. la stessa previsione è riproducibile in TypeScript;
4. esiste un test che verifica la parità numerica fra Python e TypeScript entro una
   tolleranza dichiarata.

Un modello nettamente superiore ma non riproducibile in TypeScript **non viene scartato in
silenzio**: resta `experimental` nel registro, e accanto si documenta la perdita di
accuratezza del migliore modello esportabile, la possibilità di distillarlo in un modello
più semplice e la possibilità di un formato interoperabile. Nessuna di queste strade
introduce un servizio Python a runtime.

## 4. Il contratto di esportazione

Un artefatto per modello, versionato, con almeno:

```
model_id · model_version · target · feature_schema · transformations
coefficients | tree_structure | parameters · intercept · preprocessing
calibration · prediction_interval_parameters · training_metadata
validation_metrics · checksum · schema_version
```

L'applicazione **legge** l'artefatto e non lo scrive mai. Il `checksum` è la garanzia che
il file letto in produzione sia quello validato. Il `feature_schema` è la garanzia che le
feature calcolate in TypeScript siano le stesse, nello stesso ordine, con le stesse
trasformazioni.

### Come è stato realizzato, e la sola deviazione

Realizzato il 16 agosto 2026. `scripts/projection/models/export_model.py` scrive
l'artefatto in `models/output/artefatti/<model_id>.json`, e accanto una tavola di riscontro
con duecento righe di feature grezze e i valori che Python ottiene da quelle righe.

**Il `checksum` non vive dentro l'artefatto ma in un file accanto** — `<model_id>.json.sha256`
— e copre i byte del file. È l'unica deviazione dal contratto scritto sopra, ed è
deliberata: un checksum calcolato su una riscrittura del JSON dipenderebbe da come Python e
TypeScript scrivono i numeri in virgola mobile, che è esattamente il punto in cui i due
linguaggi divergono senza avvisare. I byte non divergono. L'artefatto conserva il campo
`checksum` con algoritmo, ambito e nome del file, così che il riferimento resti dentro
l'artefatto.

Il lato che legge vive in `scripts/projection/`, **fuori dall'applicazione**, ed è scritto
per traslocare in `apps/web/src/server/` senza modifiche: moduli tipizzati, funzioni pure,
import senza estensione, nessuna dipendenza oltre alla libreria standard.

| File | Che cosa fa |
|---|---|
| `artifact-schema.ts` | forma dell'artefatto, verifiche di coerenza, caricamento con controllo dell'impronta |
| `feature-transform.ts` | ordine dichiarato, rifiuto dei valori mancanti e non finiti, standardizzazione |
| `predictor.ts` | predittore lineare, collegamento, taglio, quantili di Poisson e binomiale negativa |
| `asof/contratto.ts` | che cosa il calcolo riceve e con quali garanzie |
| `asof/aggregati.ts` | le primitive delle medie «al momento di» |
| `asof/gruppi.ts` | un calcolatore per gruppo di feature |
| `asof/calcolo.ts` | dalle colonne dichiarate ai soli gruppi necessari |
| `tests/parity.test.ts` | il test di parità sul predittore e i confini del contratto |
| `tests/asof.test.ts` | il test di parità sul calcolo delle feature |

Il calcolo delle feature «al momento di» ha il suo contratto separato in
[contratto-feature-al-momento-di.md](contratto-feature-al-momento-di.md): dice che cosa si
riceve già calcolato — medie di lega, profilo dell'arbitro, aggregati di rosa — e che cosa
si calcola sul posto dalla storia delle due squadre. Un modello che dichiara quaranta
colonne non ne fa calcolare centotredici: i gruppi si deducono dalle colonne.

Il trasloco dentro l'applicazione avviene solo quando un modello ha superato il backtest,
battuto la baseline, superato la parità e i controlli di contaminazione, e ha raggiunto lo
stato `validated` o `production` nel registro dei modelli.

## 5. Il dataset «al momento di»

Regola non negoziabile: **per ogni gara storica, le feature contengono soltanto ciò che era
noto prima del calcio d'inizio.** Il risultato osservato di quella gara è il bersaglio, mai
un ingresso.

- Le metriche di squadra sono osservate a fine gara: entrano solo da gare con data
  anteriore.
- La politica di provenienza si applica **prima** di qualsiasi media, media mobile, split
  casa/trasferta o valore concesso.
- Ogni feature porta il proprio campione reale; un campione piccolo non viene nascosto,
  viene dichiarato.
- `MIN_PREVIOUS_MATCHES = 3`: il motore parte dalla quarta gara di ciascuna squadra. Tre
  gare sono il minimo, non una finestra massima.
- Controlli automatici contro la contaminazione, eseguiti a ogni costruzione: nessuna
  feature con data uguale o successiva al calcio d'inizio, nessun identificativo di gara
  ripetuto, nessuna riga che attraversi il confine di stagione senza dichiararlo.

## 6. Le famiglie di feature

Si generano come **candidate**, non come certezze: entrano solo quelle che la validazione
promuove.

- **Orizzonti:** ultime 3, 5, 10, stagione corrente, stagione precedente con decadimento,
  solo casa, solo trasferta.
- **Forme:** media, mediana, media esponenziale, deviazione standard, coefficiente di
  variazione, percentile, tendenza recente, per novanta minuti, quota sul totale di
  squadra, valori concessi, scarto dalla media di lega, forza relativa.
- **Confronto fra le due squadre:** quanto una produce contro quanto l'altra concede, sullo
  stesso orizzonte e sullo stesso lato del campo. Nessun peso fissato a mano: il contributo
  si apprende e si valida.
- **Contorno:** arbitro con le sue medie, allenatore con profilo e modulo, classifica con
  xG a favore e subiti, giorni di riposo, congestione, derby, campo neutro, distanza di
  viaggio, meteo, terreno, turno.
- **Spaziali:** dalla mappa dei tiri — profilo dentro e fuori area, distanza media, quota
  di tiri di alta qualità, xG per tiro. Solo dove la copertura lo consente; le competizioni
  senza mappa dei tiri usano il ripiego senza feature spaziali, non vengono penalizzate.

## 7. Le baseline obbligatorie

Per ogni target, prima di qualunque modello:

1. media di lega;
2. media di squadra sulla stagione;
3. media di squadra separata casa e trasferta;
4. media mobile recente;
5. attacco contro concesso dall'avversario;
6. restringimento verso la media di lega;
7. **il motore già in produzione**, dove copre la metrica.

## 8. Il ripiego, in ordine

1. modello del target validato;
2. modello del target con meno feature;
3. baseline attacco contro concesso;
4. restringimento verso la media di lega;
5. **nessuna previsione**, se l'incertezza resta eccessiva.

Mai una precisione falsa. L'affidabilità non si inventa: deriva dall'errore storico, dalla
larghezza dell'intervallo, dalla completezza dei dati, dalla dimensione del campione,
dall'incertezza sulla formazione e dalla stabilità del modello nel tempo.

**L'ordine dei due gradini di baseline è misurato, non fisso.** Sui dati il profilo
dell'avversario è il peggiore di tutti quando la squadra ha giocato poco, e batte il
restringimento solo su alcuni bersagli a storico pieno. L'ordine sta nell'artefatto, fascia
per fascia, con l'errore che lo giustifica.

**Il gradino 2 non è implementato.** Il modello a feature ridotte è competitivo ma non
distinguibile da quello completo: gli scarti misurati stanno sotto due errori standard.
Introdurlo richiederebbe un secondo artefatto per bersaglio senza una prova che serva.

**Il ripiego non dichiara un intervallo.** Nessuno ne ha calibrato uno su quelle baseline:
si dichiara assente invece di riusare quello del modello, che descriverebbe un'altra cosa.

## 8bis. La maturità del campione, e la regola EARLY

Il motore prevede **dalla quarta giornata**: `MIN_PREVIOUS_MATCHES = 3` resta. Le fasce
descrivono quanto è maturo il campione della squadra, **mai se il motore è disponibile**.

| Fascia | Gare precedenti |
|---|---|
| `EARLY` | 3-4 |
| `DEVELOPING` | 5-9 |
| `MATURE` | 10 o più |

In fascia EARLY il valore atteso è una **miscela** fra il modello e la baseline con
restringimento:

```
atteso = w * modello + (1 - w) * baseline_restringimento
```

`w` è **specifico per bersaglio e per fascia**, stimato sui periodi di addestramento — dove
le righe con poco storico sono centinaia e non decine — poi **congelato nell'artefatto** e
valutato su un periodo mai guardato. Non si ristima al momento di prevedere. Il
congelamento non è costato nulla in errore rispetto alla ristima a ogni origine.

L'intervallo si calibra **dentro la fascia**: dispersione e livello nominale sono quelli
della fascia, non quelli complessivi.

**L'affidabilità non poggia sulla stabilità temporale, e il motivo è misurato.** Con il
campione attuale la stabilità in fascia EARLY non è stimabile: l'oscillazione dell'errore
fra origini vi risulta *minore* di quella che il caso produce da solo con ventisei righe per
origine. Un numero costruito su quella grandezza direbbe che la quarta giornata è la fascia
più affidabile di tutte, il che è falso. La definizione adottata è un'altra ed è al §8quater.
Accanto al punteggio la proiezione continua a esporre le **componenti misurate** — errore
fuori campione con il suo errore standard, scostamento sistematico, righe di prova, righe di
addestramento nella fascia, completezza delle feature, disponibilità della formazione: una
sintesi non sostituisce l'evidenza da cui viene.

## 8ter. Estensioni registrate, non ancora costruite

Ognuna entra come **gruppo di feature o strato aggiuntivo** del motore esistente, con la sua
ablazione, e va in produzione solo se migliora davvero il bersaglio interessato. Nessuna
giustifica una riscrittura di ciò che è già validato.

| Estensione | Che cosa richiede | Stato |
|---|---|---|
| Impatto dei giocatori | produzione persa, produzione dei sostituti, redistribuzione sugli altri, cambio di modulo, storia della squadra senza quei profili, confronto con l'avversario. Mai una sottrazione diretta dei minuti mancanti | da costruire |
| Formazione probabile e ufficiale | raccolta delle formazioni, oggi sospesa; per le gare passate la fonte dà l'undici effettivo, e usarlo sarebbe contaminazione | sospesa |
| Proiezione provvisoria e definitiva | due stati della stessa previsione, con il loro scarto conservato: provvisoria → definitiva → variazione | da costruire |
| Aggiustamento multidimensionale | la formazione può muovere tiri, corner, falli, cartellini, contrasti, parate, fuorigioco, non solo i tiri, e per relazioni apprese | da costruire |
| Contesto competitivo esteso | posizione, obiettivi, pressione, scontri diretti pesati per recenza | parziale: turno, derby, gare ravvicinate e classifica già dentro |
| Distribuzione predittiva e cinque linee | per ogni bersaglio validato, cinque soglie centrali con probabilità sotto e sopra derivate dalla distribuzione calibrata, mai dalla sola distanza dal valore atteso | da costruire |
| Casa, trasferta e totale di gara | il totale richiede la dipendenza fra i due processi, non l'indipendenza per comodità | da costruire |
| Indicazione principale | ordina le linee per supporto statistico, e tiene separate **probabilità dell'evento** e **affidabilità del modello** | da costruire |
| **Contesto e ritmo della gara** (`match-context-pace`) | sette famiglie di feature dal pannello già raccolto, con ablazione bersaglio per bersaglio | **costruita e misurata il 19 agosto 2026**: entra su corner e parate, non sugli altri cinque |

### Contesto e ritmo della gara, in dettaglio

Registrata il 19 agosto 2026 su richiesta dell'utente. **È un gruppo di feature del motore
esistente, non un motore nuovo:** nessun modello già validato si riscrive, nessun bersaglio si
ricostruisce, e il blocco entra su un bersaglio solo se l'ablazione lo promuove lì.

Che cosa deve rappresentare, quando è ricostruibile dall'archivio: ritmo atteso della gara,
volume offensivo, verticalità, possesso atteso, pressione territoriale, intensità del pressing,
frequenza delle transizioni, apertura della gara, intensità fisica; l'ambiente da gol — xG
atteso, volume e qualità dei tiri, xG per tiro, profili di conversione, tendenza al risultato
senza reti; il modulo delle due squadre, il confronto fra i due, il modulo sotto l'allenatore
attuale e il cambio rispetto alle gare precedenti; per il fuorigioco, altezza e aggressività
della linea difensiva, attacchi alla profondità, profilo degli attaccanti.

Cinque regole che il blocco non negozia.

**Nessun peso a mano.** Mai «gara veloce = +10% tiri», mai «3-4-3 = +X tiri», mai «Under 2,5
atteso = pochi tiri». Ogni relazione si stima e si valida, oppure non esiste.

**Ablazione bersaglio per bersaglio**, con la stessa finestra avanzante già in uso: modello
validato corrente contro modello validato più il blocco, su MAE, RMSE, scostamento, copertura
dell'intervallo, calibrazione e stabilità. È previsto e accettabile che il blocco migliori il
fuorigioco e non i corner: in quel caso sui corner non entra.

**Selezione delle feature target-specific.** Il gruppo non è monolitico: una feature utile al
fuorigioco può essere inutile ai tiri, e resta solo dove serve.

**Una previsione indipendente di Under/Over è al più una feature candidata**, mai un ingresso
promosso d'ufficio, e mai il bersaglio.

**Il blocco non entra automaticamente nell'affidabilità.** Migliorare la proiezione e
discriminare l'errore sono due problemi distinti: una feature che migliora il valore atteso
senza discriminare lo scarto resta nel modello e non entra nel punteggio.

Le voci **impatto dei giocatori**, **provvisoria → definitiva** e **aggiustamento
multidimensionale** restano quelle già registrate qui sopra e si integrano con questo blocco.
La raccolta delle formazioni è stata **riaperta come blocco separato** su decisione
dell'utente del 19 agosto 2026, con due istantanee distinte — `PRE_LINEUP` e
`CONFIRMED_LINEUP` — e il vincolo che la formazione ufficiale non entri mai nel modello
provvisorio. Non è ancora iniziata.

#### Che cosa è stato costruito e che cosa è stato misurato

Trentasei metriche del pannello, ognuna con quattro viste — quanto la squadra produce, quanto
concede, e le stesse due per l'avversario — per **140 colonne candidate** che portano il
totale da 117 a 257. Tutte sopra la soglia di densità 0,80, e costano **zero righe** di
copertura su tiri e fuorigioco, 54 su 16.662 sugli ammoniti.

| Famiglia | Bersagli che la promuovono |
| --- | --- |
| `territorio` | tiri, tiri in porta, corner, ammoniti, parate |
| `intensita` | corner, parate |
| `incrociato` | tiri, parate |
| `ambiente_tiro` | parate |
| `ambiente_gol` | ammoniti |
| `circolazione` | **nessuno** |
| `inattive` | **nessuno** |

**Non entrano affatto:** possesso, passaggi, accuratezza, palle lunghe, punizioni, rimesse,
rinvii. Misurati e inutili, su tutti e sette. Fuori anche `dangerous_attack`, `attack` e
`ball_safe`, con copertura 0,09.

**In produzione entra solo su corner e parate**, per decisione dell'utente: sono i due dove il
segno è unanime fra le origini. Corner **2,0764 → 2,0637** (+0,61%), parate **1,4804 → 1,4699**
(+0,71%, cinque origini su cinque). Su falli e fuorigioco nessuna famiglia passa: sul
fuorigioco togliere `intensita` migliora dello 0,11%.

La riselezione ha anche **tolto** blocchi che c'erano: sulle parate sono usciti `avversario`,
`forma`, `riposo`, `giocatori`, `arbitro`, `spaziale` e `contesto`, e le colonne preesistenti
sono scese da 70 a 33. `incrociato` porta i tiri in porta avversari, che è una versione
migliore della stessa informazione. Le righe utilizzabili **aumentano** su entrambi i
bersagli, perché è uscito `spaziale`, che aveva copertura bassa.

## 8quater. L'affidabilità: definizione, soglia e curva conservata

Deciso il 19 agosto 2026. **L'affidabilità è la probabilità, misurata fuori campione, che lo
scarto fra previsto e osservato resti entro una soglia assoluta dichiarata per quel
bersaglio**, esposta come punteggio 0-100 con fasce di lettura BASSA 0-49 · MODERATA 50-69 ·
ALTA 70-84 · MOLTO ALTA 85-100. Le fasce sono rappresentazione, non dato.

**La soglia è assoluta, nelle unità reali del bersaglio.** «Entro un'ammonizione», «entro
quattro tiri». Ne discende che il punteggio dice anche quanto è alta la posta: il livello
atteso della proiezione discrimina su tutti e sette i bersagli, sempre con segno negativo, e
con soglia assoluta quel fatto entra nel numero invece di essere neutralizzato. È una scelta
dichiarata, non un effetto collaterale.

**La soglia è specifica per bersaglio e non è scelta a mano.** È l'errore assoluto medio della
migliore baseline, arrotondato all'unità: sotto quella distanza il modello vale più del non
sapere nulla. Una regola sola, applicata a tutti e sette.

| Bersaglio | Migliore baseline | MAE | Soglia | Punteggio |
| --- | --- | ---: | :---: | ---: |
| Tiri | attacco contro concesso | 3,7880 | 4 | 62 |
| Tiri in porta | restringimento | 1,8370 | 2 | 63 |
| Corner | restringimento | 2,1687 | 2 | 55 |
| Falli | restringimento | 2,9278 | 3 | 61 |
| Ammoniti | lega | 1,0690 | 1 | 54 |
| Fuorigioco | lega | 1,1392 | 1 | 54 |
| Parate | lega | 1,5191 | 2 | 73 |

**La curva intera resta nell'artefatto.** Cambiare soglia domani non costa un riaddestramento,
e la diagnostica vede la distribuzione dell'errore invece di un punto solo.

Il punteggio si legge **dentro la fascia di maturità** della riga, perché è lì che è stato
misurato sulla miscela congelata, cioè sul numero che il predittore produce davvero. Porta con
sé la propria incertezza binomiale, che in fascia EARLY è larga venti punti e non si nasconde.
**Sotto un ripiego il punteggio non si dichiara:** nessuno lo ha misurato su quella baseline.

**Affidabilità del modello e probabilità dell'evento restano due numeri distinti**, sempre.
«Oltre 12,5 tiri al 69%» non è «affidabilità 69».

### Lo strato condizionale, costruito il 19 agosto 2026

Il punteggio non è più costante dentro la fascia dove la misura lo consente. Una regressione
logistica stima, **per questa gara**, la probabilità che lo scarto resti entro la soglia, da
condizioni note prima del calcio d'inizio: valore atteso della proiezione, gare precedenti
della squadra e dell'avversario, scarto normalizzato dalla media di lega.

**Non si addestra sugli errori del proprio periodo di addestramento.** Lì il modello di
proiezione ha già visto le righe, e gli errori sono ottimisti: una probabilità stimata su
quelli direbbe che il motore azzecca più di quanto azzecchi. Si addestra sugli errori fuori
campione delle origini precedenti e si valuta sull'origine successiva. Costa un'origine, ed è
l'unico modo onesto.

**Entra solo dove batte la costante** su Brier *e* log-loss nella maggioranza delle origini
valutabili. Sei bersagli su sette lo fanno; i **falli** no — 2 origini su 4 — e lì resta la
costante. Il guadagno di Brier va da +0,49% (corner) a +1,85% (parate).

**La lega è stata provata e scartata.** Batteva la costante su cinque bersagli, ma non batte
mai il condizionale semplice: da −0,12% a −0,76% su tutti e sette. Nell'artefatto non c'è
nessuna tabella di leghe.

**Una condizione che il modello non riceve non è una condizione.** Se non è fra le colonne
dell'artefatto, il lato che prevede non l'avrebbe: si esclude dalla misura, e lo schema
rifiuta un artefatto che la dichiari. È così che i falli sono passati da promossi a non
promossi, quando la restrizione è stata applicata.

**L'incertezza dichiarata qui non è binomiale:** è lo scarto medio fra probabilità promessa e
frequenza osservata, misurato per decili, fra 0,035 e 0,042. In produzione, se una condizione
manca, si torna alla costante della fascia — mai a zero.

**Migliorare la proiezione e discriminare l'affidabilità sono due problemi diversi.** Una
feature che non discrimina l'errore non esce dal modello per questo: resta dove serve.

## 9. Struttura dei file

```
scripts/projection/
  discovery/        ricognizione e registri            (fatto)
  dataset/          costruzione del dataset as-of
  models/           addestramento, backtest, ablazione
  output/
    models/         artefatti esportati e versionati
    reports/        rapporti di validazione
apps/web/src/server/iqstats/
  projection.ts     inferenza, sola lettura, solo server
```

La ricerca non tocca l'applicazione di produzione, esattamente come la calibrazione.

## 10. Vincoli

- La fonte si legge solo lato server; nessuna chiave in codice, log o output.
- Il nome della fonte non compare in percorsi, moduli, commit, log o interfaccia.
- Un'assenza non diventa mai zero se non nei casi verificati e marcati come tali.
- Mai mescolare stagioni o competizioni diverse in una media.
- Nessun linguaggio di certezza, nessuna istruzione di puntata, nessun operatore nominato.
- Le quote possono essere una feature candidata da validare, mai il bersaglio: il bersaglio
  è sempre la statistica osservata. Il motore deve funzionare anche senza di esse.
- Il modello della fonte è un termine di paragone esterno, non un bersaglio.
- Nessuna modifica all'interfaccia in questa fase.
