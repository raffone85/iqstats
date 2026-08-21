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
| Casa, trasferta e totale di gara | **misurato il 20 agosto 2026:** la dipendenza esiste, è stabile e **non serve**. Il valore atteso del totale è la somma dei due, esatta; l'incertezza si calibra direttamente sui residui della somma. Vedi §8quinquies | **deciso** |
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

## 8quinquies. Il totale di gara: la dipendenza esiste e non serve

Misurato il 20 agosto 2026, su quattro origini per ciascuno dei sette bersagli, riusando
le previsioni fuori campione dei modelli già validati con la miscela congelata. Il
registro completo è in `data/registro-totale.json`.

**Il valore atteso del totale non richiede nessuna assunzione.** `E[casa + trasferta] =
E[casa] + E[trasferta]` vale anche con i due processi dipendenti. Quello che richiede la
dipendenza è l'incertezza: l'intervallo, la distribuzione da cui escono le cinque linee, e
l'affidabilità. Il centro resta la somma, sempre: nessun terzo valore atteso indipendente
può contraddire i due lati.

Sono stati confrontati due modi di costruire quell'incertezza. **A**, calibrazione diretta:
binomiale negativa centrata sulla somma, dispersione stimata sui residui della somma nelle
origini precedenti, livello nominale calibrato come per le marginali. **B**, composizione:
le due marginali già calibrate, unite da una copula gaussiana con la correlazione dei
residui misurata fuori campione.

| Bersaglio | ρ di rango | Scost. copertura A | B | Brier linee A | B |
|---|---:|---:|---:|---:|---:|
| Tiri | −0,249 | 0,0190 | 0,0197 | 0,23982 | 0,24012 |
| Tiri in porta | −0,067 | 0,0272 | 0,0308 | 0,21894 | 0,21918 |
| Corner | −0,180 | 0,0173 | 0,0162 | 0,22125 | 0,22148 |
| Falli | +0,072 | 0,0173 | 0,0165 | 0,23848 | 0,23837 |
| Ammoniti | +0,166 | 0,0149 | 0,0173 | 0,18362 | 0,18362 |
| Fuorigioco | −0,062 | 0,0195 | 0,0153 | 0,16791 | 0,16800 |
| Parate | −0,101 | 0,0180 | 0,0105 | 0,20608 | 0,20606 |

**Lo scarto massimo di Brier fra i due metodi, su tutte e ventotto le combinazioni
bersaglio-origine, è 0,00058.** Lo strato condizionale dell'affidabilità è stato promosso
con guadagni fra lo 0,49% e l'1,85%; qui il massimo è lo 0,25%. Su sei bersagli su sette i
due metodi sono indistinguibili.

**La dipendenza è reale e non paga.** I tiri hanno la correlazione più forte e più stabile
— fra −0,23 e −0,26 su quattro origini — e lì la composizione perde. Il motivo è
strutturale: la dispersione stimata sui residui della somma **contiene già la covarianza**.
Il segno ha una lettura fisica coerente — negativo dove chi domina produce e concede in
direzioni opposte, positivo sui falli, che li fa la gara e non la squadra — ma resta
un'informazione che la calibrazione diretta ha già.

**L'unica eccezione era apparente.** Sulle parate la composizione copriva meglio in tutte e
quattro le origini. Allargando la diretta fino alla stessa larghezza, con il livello
cercato sul solo periodo di addestramento, il vantaggio si riduce di due terzi:

| Metodo | Copertura media | Scostamento | Larghezza |
|---|---:|---:|---:|
| Diretta | 0,7821 | 0,0180 | 5,242 |
| Composizione | 0,7904 | 0,0096 | 5,318 |
| Diretta a larghezza pari | 0,7871 | 0,0130 | 5,308 |

Il residuo non è dipendenza, è **granularità**: l'intervallo della diretta è una coppia di
quantili interi e si muove a scatti di un'unità, quello della composizione viene da un
campione e cade in mezzo. Su due origini su quattro il livello nominale non ha potuto
muoversi affatto.

**Deciso: calibrazione diretta su tutti e sette.** Il costo evitato è concreto — la
composizione vorrebbe un generatore di numeri casuali dentro il predittore e la
riproduzione del suo esito in TypeScript cifra per cifra — e il beneficio misurato è
0,003 di copertura su un bersaglio.

### L'affidabilità del totale, misurata il 20 agosto 2026

La definizione è quella del §8quater applicata a un'altra grandezza: la probabilità,
misurata fuori campione, che lo scarto fra totale previsto e totale osservato resti entro
una soglia assoluta. **La soglia viene dalla migliore baseline del totale**, che è la
somma delle due baseline di lato, non dall'errore del modello e non dalla soglia
marginale del bersaglio. È quasi sempre la media di lega; solo sui falli vince il
restringimento.

| Bersaglio | Soglia | Punteggio | MAE modello | MAE baseline | Media dei due lati | Minimo dei due |
|---|---:|---:|---:|---:|---:|---:|
| Tiri | 5 | **61** | 4,595 | 4,730 | 62,7 | 39,2 |
| Tiri in porta | 3 | **66** | 2,466 | 2,508 | 63,2 | 39,4 |
| Corner | 3 | **63** | 2,676 | 2,696 | 55,6 | 30,3 |
| Falli | 4 | **55** | 4,115 | 4,313 | 61,2 | 37,3 |
| Ammoniti | 2 | **68** | 1,634 | 1,641 | 53,8 | 29,1 |
| Fuorigioco | 2 | **73** | 1,457 | 1,537 | 54,2 | 28,1 |
| Parate | 2 | **55** | 2,033 | 2,054 | 73,9 | 53,8 |

**Il divieto regge alla misura.** La media delle due affidabilità di lato sbaglia in
entrambe le direzioni — sottostima di diciannove punti sul fuorigioco, sovrastima di
diciannove sulle parate — e il minimo sbaglia sempre, fino a quarantacinque punti. Il
motivo è strutturale: due lati che sbagliano in direzioni opposte danno un totale giusto,
e nessuna combinazione dei due punteggi può saperlo.

**Sul totale il modello batte la migliore baseline di poco**, e va detto: da 0,7% sui
corner e sugli ammoniti a 5,2% sul fuorigioco. È un margine più sottile di quello delle
marginali, sulla stessa materia.

La curva intera resta nel rapporto, con la griglia estesa oltre l'otto delle marginali
perché il totale ha una scala più grande e il punto letto dev'essere misurato, mai
interpolato. Il punteggio per fascia esiste, ma **in fascia EARLY poggia su 31-40 righe**
e la sua incertezza binomiale è di circa venti punti.

**Portata negli artefatti il 21 agosto 2026, rispecchiando le marginali.** Il blocco
`totale.affidabilita` porta soglia assoluta, punteggio complessivo, punteggio per fascia
con la sua incertezza e la curva intera: la stessa forma del blocco del bersaglio **meno
lo strato condizionale**, che sul totale non è stato misurato e che il tipo dichiara
assente invece di lasciare un campo sempre nullo. Il controllo di soglia e punteggi è uno
solo e lo chiamano entrambi.

**Il punteggio si legge nella fascia più povera dei due lati** — la storia più corta
governa l'incertezza — che è la stessa regola con cui la fascia è stata assegnata alle
paia quando il punteggio è stato misurato. Sotto un ripiego non si dichiara, come per le
marginali.

**Il blocco entra in sette artefatti su quattordici**, e non è una mancanza: il rapporto è
di un modello solo per bersaglio — `total_shots` e `fouls` `ridge`, gli altri cinque
`poisson_glm` — e su un modello diverso il cancello lo rifiuta invece di attribuirgli una
misura che nessuno ha fatto su di lui. Su `shots_on_target` la fascia EARLY non compare:
non è misurabile, e non si finge.

**La media e il minimo dei due punteggi di lato restano fuori dall'artefatto.** Sono nel
rapporto come termine di paragone del divieto: un artefatto non porta un numero che
nessuno deve usare.

**Un arrotondamento scritto in due posti, trovato dal test di parità e corretto.** Sui
falli in fascia EARLY la quota è 0,525 esatti: `round()` di Python arrotonda al pari e dà
52, mentre `punteggio_da` dell'esportatore fa `floor(x + 0,5)` e dà 53. Ora
`total_reliability.py` chiama `punteggio_da`, e l'arrotondamento è uno solo.

### La copertura per fascia è stata provata e non funziona

Misurato il 20 agosto 2026. L'ipotesi era che l'intervallo del totale fosse ottimista
perché calibra un livello unico su fasce con dispersioni diverse, e che calibrarlo dentro
la fascia — come già fanno le marginali al §8bis — lo correggesse.

**Non lo corregge, e il motivo non è l'implementazione: è il campione.** Nel periodo di
addestramento dell'ultima origine, `EARLY` ha fra 21 e 36 righe e `DEVELOPING` fra 91 e
114, contro le 1.748-2.095 di `MATURE`. Le fasce povere non hanno materiale per stimare
un livello proprio e ripiegano sul livello unico; `MATURE` è il 94-96% delle righe, quindi
calibrare «per fascia» coincide quasi per costruzione con non calibrarlo.

| Bersaglio | Copertura, livello unico | Copertura, per fascia |
|---|---:|---:|
| Tiri | 0,8035 | 0,7932 |
| Tiri in porta | 0,7868 | 0,7868 |
| Corner | 0,8041 | 0,8051 |
| Falli | 0,7812 | 0,7837 |
| Ammoniti | 0,7996 | 0,8000 |
| Fuorigioco | 0,8021 | 0,7980 |
| Parate | 0,8012 | 0,8012 |

Su tre bersagli la fascia guadagna fra 0,0004 e 0,0025, su due non cambia niente, su due
perde fino a 0,0103. Nessuno vince più di una origine su tre. **Il livello unico resta**,
e lo scostamento residuo — massimo 0,019 sui falli — non ha oggi una correzione
misurabile. È la stessa parete della fascia EARLY: non è un metodo sbagliato, è un
campione che non c'è.

### Che cosa resta aperto

**La copertura è ottimista su sei bersagli su sette:** l'intervallo che promette l'80% ne
copre fra il 78,1% e il 79,9%; solo il fuorigioco supera, all'82,0%. È una direzione sola,
e **la correzione per fascia è stata provata e non paga**, per mancanza di campione: il
paragrafo qui sopra la misura. Oggi non ha una correzione misurabile.

**La fascia EARLY non è misurabile in questo disegno.** Su ventotto combinazioni
bersaglio-origine, `MATURE` compare 28 volte, `DEVELOPING` 11, `EARLY` mai con almeno
trenta gare: le origini di prova cadono a stagione avanzata. Il criterio resta non
verificato, e non si dichiara verificato.

**Le probabilità delle cinque linee sotto-promettono l'Over.** Sui tiri, ultima origine,
tutti e dieci i decili hanno frequenza osservata sopra la promessa, da +1,3 a +6,3 punti.
Lo scarto medio di calibrazione sta fra 0,020 e 0,034 a seconda del bersaglio — lo stesso
ordine di grandezza dello strato condizionale, che dichiara fra 0,035 e 0,042. Va
dichiarato accanto al numero.

**L'affidabilità del totale è misurata ed è negli artefatti** dal 21 agosto 2026: soglie,
punteggi e la regola con cui si legge sono nel paragrafo qui sopra.

## 9. Struttura dei file

```
scripts/projection/
  discovery/        ricognizione e registri            (fatto)
  dataset/          costruzione del dataset as-of, ed export del lotto per il database
  models/           addestramento, backtest, ablazione
  output/
    models/         artefatti esportati e versionati
    reports/        rapporti di validazione
  tests/            parita' fra Python e TypeScript, e parita' del livello dati
apps/web/src/server/iqstats/
  projection/       moduli puri: artefatto, feature, predittore, produzione, as-of,
                    e la composizione dell'ingresso da righe gia' lette
  projection-store.ts   il livello dati: legge le osservazioni dal database
```

**Il trasloco e' avvenuto il 20 agosto 2026.** I moduli del motore vivono dentro
l'applicazione; i test di parita' restano in `scripts/projection/tests/`, perche'
consumano i campioni di riscontro che Python produce e appartengono al lato che ricerca.

La ricerca non tocca l'applicazione di produzione, esattamente come la calibrazione.

## 9bis. Il livello dati in produzione

Deciso e costruito il 20 agosto 2026. **La storia che il motore riceve viene dal database
dell'applicazione, non dalla fonte a ogni richiesta.** Due tavole nuove nello schema
`football`: le osservazioni squadra-gara e le statistiche per giocatore. La fonte serve a
riempirle, non a rispondere a una pagina.

La ragione è misurata, non stilistica. Ricostruire l'ingresso di una sola gara dalla fonte
costerebbe circa centoventi richieste per la storia delle due squadre, e le **medie di
lega «al momento di»** non sarebbero comunque ricostruibili: richiedono tutte le gare della
competizione fino a quell'istante, non solo quelle delle due squadre. Lo stesso vale per il
profilo dell'arbitro.

Che cosa conservano le tavole, e che cosa no:

- **si conserva** ciò che è stato osservato a gara conclusa: il pannello nelle sette
  famiglie del motore, la disciplina ricostruita dagli episodi, il profilo della mappa dei
  tiri, reti e contorno, con la **classe di provenienza per singolo valore**;
- **non si conservano** le medie di lega né il profilo dell'arbitro: si calcolano da questa
  stessa tavola con lo stesso taglio temporale, perché due verità scritte in due posti
  divergono in silenzio;
- **restano fuori** dal database e dal rilascio l'archivio grezzo — 703 MB — i dataset di
  addestramento e gli artefatti dei modelli.

**Il taglio temporale è dichiarato in un posto solo.** In SQL si restringe con
`kickoff_at <= calcio d'inizio`, che è un soprainsieme e serve a non trascinare l'archivio
attraverso la rete; la condizione esatta — gara anteriore per istante e, a parità, per
identificativo, e mai la gara stessa — la applica `prima()` in `projection/snapshot.ts`.

### La migrazione è passata da un motore vero, il 20 agosto 2026

Fino a quel momento le tavole esistevano soltanto come file SQL. **Nessun database del
progetto aveva lo schema `football`**: il progetto in linea porta autenticazione,
pagamenti e la sola `private.api_rate_limits`, e nessuna delle cinque migrazioni del 9
agosto vi risulta registrata. Applicare l'ultima da sola sarebbe fallito al `drop
constraint` su `private.football_sync_runs`, che non esisteva.

Il banco è un **Postgres 17 locale**, coerente con `runtime.ts`, che accetta una
connessione soltanto su indirizzo locale se non è dichiarato altrimenti. Le sei migrazioni
sono state applicate in ordine su un motore vuoto — il ruolo `iqstats_app_reader` se lo
crea la terza — e la sesta è passata senza errori.

Che cosa è stato verificato, e con quale esito:

| Verifica | Esito |
|---|---|
| Struttura | 69 colonne e 14 colonne, 8 indici, RLS attiva su entrambe, 2 policy, nessun privilegio ad `anon` o `authenticated` |
| Tipi corretti in precedenza | i **sette** campi del profilo dei tiri in `double precision`, le tre continue del pannello in `numeric(8,4)` |
| Vincolo riscritto | `DATA-6` accettato, un valore fuori elenco rifiutato dal vincolo |
| La funzione non inventa | su tavole di riferimento vuote: **800 righe squadra e 15.987 righe giocatore rifiutate, zero scritte** |
| Caricamento | **18.570 righe squadra scritte e 40 rifiutate — 18.610, il manifesto — e 382.318 righe giocatore, zero rifiuti** |
| Idempotenza | i ventiquattro lotti riapplicati lasciano un'impronta identica su tutte le righe |
| Parità dal database | `test:projection-store` ricostruisce l'ingresso leggendo da `ProjectionObservationStore` con il ruolo di sola lettura e lo confronta con Python: **42 righe, 1.995 gare, 20.736 metriche di contesto, 42 profili d'arbitro, 714 campi di rosa**, gli stessi numeri di `test:snapshot` |

Il test è stato anche fatto fallire di proposito, alterando una riga nel banco: se ne
accorge sulla media di lega alla terza cifra. Un verde che non sa diventare rosso non è
una verifica.

**Le tavole di riferimento del banco vengono dall'archivio, non dalla fonte.**
`dataset/export_reference_local.py` ricava gare, squadre, stagioni, arbitri e competizioni
dai payload già raccolti: 9.285 gare sulle 9.305 che i lotti nominano. Le venti mancanti
sono dichiarate e non aggirate — dodici hanno una stagione che l'archivio non associa a
nessuna competizione, otto non nominano le due squadre — e sono esattamente le 40 righe
rifiutate dal caricamento. Sono tutte gare senza pannello e senza statistiche per
giocatore. **I nomi di competizione, stagione e arbitro sono segnaposto dichiarati**:
l'archivio non li porta, le tavole li vogliono non nulli, e il motore non li legge mai.

**Due fatti che il manifesto dei lotti non dice.** Trentadue righe su 18.610, in venti
gare, non nominano né la squadra né l'avversaria, mentre il manifesto dichiara
`righe_scartate: 0`; e cento gare su 9.305 non hanno un payload di dettaglio archiviato.
Nessuno dei due tocca i modelli — sono righe senza pannello — ma il conteggio del
manifesto conta le righe prodotte, non quelle utilizzabili.

### Una divergenza misurata, non tollerata

Il lato che addestra calcola le medie di lega spostando di una **riga** e non di una
**gara**. Le due righe di una gara stanno nello stesso gruppo, quindi per una delle due la
media di lega comprende la riga gemella: informazione della gara stessa.

Misurato sulle quaranta righe del campione di riscontro del fuorigioco: **venticinque su
quaranta differiscono**. Lo scarto massimo è 0,0287 sulla media di lega del fuorigioco
(2,05), 0,0552 sui falli (11,97) e 0,0217 sugli ammoniti (1,96) — fra lo 0,5% e l'1,4%.
`lega_lato_media` e `lega_lato_campione` sono **identiche su quaranta righe su quaranta**,
perché il lato di campo separa le due righe di una gara in gruppi diversi.

Il livello dati esclude l'intera gara, che è la semantica «al momento di» e sarà comunque
la realtà in produzione, dove quella riga non esiste ancora. Il test del livello dati
verifica che **riaggiungendo la riga gemella si riottenga esattamente il numero di
Python**: la differenza è spiegata riga per riga, non assorbita in una tolleranza.

Correggere il lato che addestra richiederebbe di ricostruire i quattordici modelli
validati, e non si fa senza decisione esplicita.

### Il percorso proprio, deciso il 21 agosto 2026

**Il livello dati del motore vive nello stesso database dell'applicazione, e se lo
alimenta da solo.** Le osservazioni non si limitano alle due tavole nuove: lo stesso
percorso innesta anche `football.matches`, `teams`, `referees`, `seasons` e
`competitions`, perché senza quelle la funzione di scrittura rifiuterebbe quasi tutto.
`dataset/load_reference_and_batches.py` costruisce l'innesto dai riferimenti che
`export_reference_local.py` ricava dall'archivio.

**L'innesto non sovrascrive mai.** Ogni inserimento è `on conflict do nothing`: dove
DATA-1 ha già scritto una riga, vince la sua, con il suo nome vero. Applicato allo stack
locale del progetto, che aveva le cinque migrazioni del 9 agosto ma non la sesta:

| Tavola | Esistenti | Innestate | Totale |
|---|---:|---:|---:|
| `competitions` | 36 | **0** | 36 |
| `seasons` | 36 | 27 | 63 |
| `teams` | 591 | 116 | 707 |
| `referees` | 0 | 673 | 673 |
| `matches` | 9.548 | 9.307 | 18.855 |

**I due perimetri non sono diversi: uno è contenuto nell'altro.** Le 29 competizioni del
motore sono già tutte fra le 36 di DATA-1, quindi nessun nome di competizione segnaposto
entra nel database. I segnaposto scritti sono 27 nomi di stagione, 2 di squadra e i 673
arbitri, che DATA-1 non ha mai raccolto: `data1-harvest.mjs` non nomina l'arbitro,
`football.referees` era vuota.

**Le due guardie che tengono il motore fuori dall'applicazione erano già nello schema**,
e non ne sono state aggiunte: le competizioni nuove entrano con `is_active = false`, che
`app_competition_read_model` filtra; le stagioni nuove con `ingest_scope = 'held'`, che
`app_match_read_model` filtra. Le due viste restano a 33 e 331 righe.

**Un'eccezione misurata, non nascosta.** `app_match_read_model` è passata da 9.548 a
**9.550**: due gare della Chinese Super League del 18 e 19 agosto, vere, con nomi e
punteggi reali, appartenenti a una stagione `product_current` che DATA-1 non aveva ancora
raccolto. Non sono segnaposto e non sono contaminazione, ma dicono che dove la stagione è
condivisa il percorso del motore **può** scrivere dentro il perimetro del prodotto.

Che cosa è stato verificato su questo database, con quale esito:

| Verifica | Esito |
|---|---|
| Migrazione | 69 e 14 colonne, 8 indici, RLS su entrambe, 2 policy, `DATA-6` accettato, nessun privilegio ad `anon` o `authenticated` |
| Caricamento dei 27 lotti | **20.912 righe scritte + 40 rifiutate = 20.952**, il manifesto, e **431.935 righe giocatore, zero rifiuti** |
| Idempotenza dell'intero percorso | riapplicati innesto e lotti: **0 inserimenti** su tutte e cinque le tavole di riferimento, impronta `655a292f…` identica, conteggi invariati |
| Parità dal database | `test:projection-store` verde con **42 righe, 1.995 gare, 20.736 metriche di contesto, 42 profili d'arbitro, 714 campi di rosa** — gli stessi numeri del banco, con 8.399 gare di DATA-1 prive di osservazioni che non spostano nulla |

### La passata notturna, decisa il 21 agosto 2026

**Una volta a notte**, con `harvest/sync_nightly.ps1`. Fra due passate la storia del motore
può restare indietro al massimo di un giorno: una squadra che ha giocato ieri sera non ha
ancora quella gara nella propria storia quando si proietta oggi, e la forma recente è la
parte più informativa. Le gare che finiscono **dopo** l'orario della passata aspettano la
notte successiva, quindi l'orario va messo dopo l'ultimo fischio finale della sera.

**Il tetto di richieste resta obbligatorio, ma non tronca più.** La scoperta dice quante
gare nuove ci sono e la raccolta riceve `4 × gare + 50`: con le 1.171 gare del 20 agosto
sarebbero 4.734 contro le 4.604 realmente usate. L'argomento continua a essere esplicito —
una raccolta senza tetto è una decisione che lo script non prende — ma nessuna passata si
ferma a metà per un numero scelto a mano.

**Nessuna troncatura silenziosa.** Se la scoperta esaurisce il proprio tetto la passata si
ferma: una scoperta troncata direbbe «zero gare nuove» dove ce ne sono, ed è l'unico modo
in cui questa catena poteva mentire senza dare errore.

**Una riga per passata in `private.football_sync_runs`, fetta `DATA-6`.** Si apre `running`
**prima** della raccolta, perché una passata che fallisce a metà deve lasciare traccia. La
chiusura riuscita è l'ultima istruzione del SQL di caricamento e non del pianificatore: se
`psql` si ferma per un errore, `ON_ERROR_STOP` non ci arriva e la riga resta `running`, che
è la verità — chiuderla da fuori direbbe «completata» comunque. Il fallimento lo scrive il
pianificatore, con il motivo.

Provato sul database del progetto: riga chiusa `completed` con **452.887 righe osservate,
452.847 scritte, 40 rifiutate** — cioè 20.952 e 431.935, il manifesto — e 4.636 richieste
su un tetto di 4.984. La chiusura in fallimento è stata provata a parte, apostrofo nel
motivo compreso.

**Il SQL lo scrive Python, non PowerShell.** `Out-File` di PowerShell 5.1 non è una condotta
di byte affidabile e un lotto è una riga sola da cinque megabyte: il caricatore accetta
`--sql <file>`, e il file prodotto è identico a quello che manderebbe su standard output.

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
