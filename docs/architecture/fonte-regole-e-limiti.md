# Regole e limiti della fonte

Scritto il 20 agosto 2026, dalla documentazione corrente della fonte e **verificato
chiamando l'API**, non solo leggendo. Sostituisce le regole sparse nei documenti
precedenti; dove un documento più vecchio dice altro, vale questo.

Riferimenti: [inventario della fonte](inventario-fonte.md) ·
[catalogo degli endpoint](statsiq-football-endpoint-catalog.md) ·
[mappa endpoint-sezioni](mappa-endpoint-sezioni.md) · `linkdocumentazionebzoiroApi`.

Il nome della fonte, l'indirizzo e la chiave non compaiono qui, come in tutti gli altri
documenti di architettura. Compaiono solo i percorsi degli endpoint.

## Il piano di questo progetto, misurato

Due prove indipendenti, eseguite il 20 agosto 2026:

1. una chiamata autenticata **non riceve** le intestazioni `RateLimit` e
   `RateLimit-Policy`. La documentazione dichiara che i piani a pagamento non le
   ricevono, e che **la loro assenza significa quota assente, non quota esaurita**;
2. `/api/v2/odds/best/` e `/api/v2/events/{id}/odds/comparison/` rispondono `200` — la
   seconda con sessantasette operatori — invece del `403` con codice
   `bookmakers_not_entitled` che la documentazione prevede senza il piano illimitato.

**Conseguenza operativa: non esiste una quota giornaliera da amministrare.** Il tetto
alle raccolte resta una scelta di questo progetto, non un vincolo esterno.

## Autenticazione

Intestazione `Authorization: Token <chiave>`. È già quella che l'applicazione e le
raccolte usano — `provider-client.ts`, `fetch_blocks.py`, `data1-harvest.mjs` — e non
cambia. La chiave si può anche passare in `?token=`, e `token` insieme a `format` sono i
due soli parametri mai trattati come filtri.

## Limiti di frequenza

| Limite | Valore | Si applica a noi? |
|---|---|---|
| Quota giornaliera per account | 7.500 richieste al giorno per gli account gratuiti, dal 17 agosto 2026 | **no**, il piano la rimuove |
| Raffica per indirizzo | **25 richieste al secondo, picco 110**, sugli endpoint in cache | **sì**, il piano non la solleva |

La raffica per indirizzo copre `/api/v2/events/` e `/live/`, `/leagues/`, `/teams/`,
`/tournaments/`, `/referees/{id}/`, `/venues/{id}/`, `/predictions/` e i corrispettivi
legacy. Superarla dà `429` con `"code": "rate_limited"` e `Retry-After: 1`.

I due `429` vogliono reazioni opposte e si distinguono dal campo `code`:
`rate_limited` si ritenta dopo un secondo, `taster_exhausted` ha senso ritentarlo solo
dopo la mezzanotte UTC.

**La disciplina del progetto resta invariata a due richieste al secondo**, che sono un
dodicesimo del limite: la ragione non è più la quota, è non disturbare gli altri e non
dipendere da una risposta veloce. Le raccolte notturne restano notturne.

**La regola precedentemente scritta — «dieci richieste al secondo per indirizzo» — non è
più esatta** e va letta come 25 al secondo sugli endpoint in cache, senza un tetto per
secondo dichiarato sugli altri.

## Intestazioni di quota

La fonte usa i due campi `RateLimit-Policy` e `RateLimit` della bozza IETF, non i
`X-RateLimit-*` di prima. Sono campi strutturati e vanno letti con una libreria, non con
un'espressione regolare. **Un'assenza non è uno zero:** su un piano a pagamento non
arrivano affatto, e trattarle come «quota finita» fermerebbe una raccolta che non ha
nessun motivo di fermarsi.

## Impaginazione

`limit` e `offset`, valore predefinito **50**, massimo **200**. L'involucro è
`{count, next, previous, results}`.

**Un'eccezione misurata:** `/api/v2/events/live/` risponde `{count, events}` — la chiave
è `events`, non `results`. Chi legge `results` su quell'endpoint trova sempre una lista
vuota e non se ne accorge.

## Gli stati della gara, e una trappola vera

La documentazione elenca come valori del filtro `status`: `upcoming`, `live`, `finished`,
`cancelled`, `postponed`, `unresolved`. **I valori che compaiono davvero nelle risposte
sono altri**, ed è stato verificato chiamando l'API il 20 agosto 2026:

| Filtro passato | Righe dichiarate | Stato nelle risposte |
|---|---:|---|
| `upcoming` | 395.814 | `notstarted` |
| `live` | 395.814 | `notstarted` |
| `notstarted` | 10.160 | `notstarted` |
| `finished` | 378.217 | `finished` |
| `cancelled` | 3 | `cancelled` |
| `postponed` | 3.676 | `postponed` |
| `unresolved` | 72 | `unresolved` |

395.814 è **il numero totale di gare senza nessun filtro**. Quindi `status=upcoming` e
`status=live` non filtrano niente: il filtro cade e la risposta è la lista intera, con un
`200` che non lo dice.

È esattamente il difetto che la documentazione dichiara di aver eliminato — «un filtro
caduto restituirebbe `200` con la lista non filtrata, e non c'è modo di distinguerlo da un
filtro che ha selezionato tutto» — ma il rifiuto vale per i **nomi** dei parametri
sconosciuti, non per i loro **valori**. Un valore non riconosciuto passa in silenzio.

**Regola per questo progetto: sui filtri si usa il vocabolario delle risposte**, cioè
`notstarted`, `inprogress`, `finished`, `cancelled`, `postponed`, `unresolved`. Lo stato
delle gare in corso è `inprogress` e si legge da `/events/live/`.

`unresolved` è nuovo e vale la pena capirlo: calcio d'inizio passato, gara mai vista
giocare, nessun risultato registrato. I punteggi restano `null` e non si deduce niente.
Sono 72 gare. Il nostro schema non lo mappa: oggi finirebbe in `unknown`.

## Parametri sconosciuti

Un endpoint `/api/v2/` **rifiuta** un parametro che non conosce, con `400`, l'elenco
completo di `accepted_parameters` e un campo `suggestions`. I nomi della v1 vengono invece
tradotti prima della richiesta: `league` → `league_id`, `season` → `season_id`,
`team` → `team_name`, `page_size` → `limit`, `page` → `offset`. Verificato: `?league=17`
risponde `200` con 3.813 gare tutte di `league_id: 17`.

`tz`, `full` e `ordering` sono accettati e non fanno niente.

## Cache e freschezza

| Che cosa | Freschezza |
|---|---|
| `/events/`, `/leagues/`, `/teams/`, `/tournaments/` | cache di bordo ~5 s, intestazione `X-Cache-Status` con `HIT`, `MISS` o `STALE` |
| Punteggi in tempo reale | 10-30 s lato server |
| Dati di riferimento | ~5 minuti |
| Quote | riletture programmate: 15 minuti in gara, 30 minuti sotto le 24 ore, 4 ore oltre |

Le quote portano `last_update_at`, `next_update_at`, `update_interval_seconds` e
`update_reason`. **`last_update_at` dice quando abbiamo chiesto, non quando un prezzo si è
mosso**, e `next_update_at` è il primo istante in cui *può* cambiare, non una promessa.
`update_reason` ha sempre un valore, gli altri tre diventano `null`: si dirama su quello.
Per prendere solo ciò che è cambiato esiste `updated_after` su `/api/v2/odds/`.

## Novità che toccano il motore di proiezione

Tre cose nuove nei payload **non esistono nell'archivio raccolto**, ed è stato verificato
leggendolo. Sono la ragione principale per cui questo documento esiste.

### xG misurato e xG stimato

La fonte ora dichiara, con quattro segnalatori, quando un valore di xG è una sua stima e
non una misura: `xg_estimated` alla radice della risposta e su ogni tiro, `estimated`
dentro ogni blocco `stats.*.xg` e su ogni intervallo di `xg_per_minute`. Dichiara anche
che **competizioni intere sono stimate da cima a fondo** e che poco meno della metà delle
gare con mappa dei tiri ne porta almeno un pezzo.

**Nell'archivio quei segnalatori non ci sono.** Verificato su ottocento payload: il blocco
`xg` ha la sola chiave `actual`, nessun tiro porta `xg_estimated`, e alla radice non c'è
niente. Quindi il dataset attuale **mescola misura e stima senza poterle distinguere**.

Dove pesa: `expected_goals` è nella famiglia `ambiente_gol`, promossa sugli **ammoniti**;
`spaziale_xg_per_tiro` è nel profilo spaziale, usato da **corner, falli, tiri in porta e
ammoniti**. Non rende sbagliati i modelli validati — sono stati misurati fuori campione
su quei dati — ma dice che una loro feature è due variabili diverse sotto un nome solo.
Va deciso se separarle alla prossima riselezione.

### Cartellini revocati

Gli episodi ora portano `rescinded: true` quando un cartellino è annullato dopo revisione,
e la fonte dichiara che quei cartellini **restano nella cronologia ma sono esclusi dai
conteggi**. Portano anche `period_second`, per ordinare sotto il minuto.

**Nell'archivio il campo non compare mai**: 8.022 cartellini su 1.962 gare, zero
occorrenze. E `reconstruct_cards.py` non lo guarda.

Conseguenza precisa: le righe già raccolte sono coerenti con sé stesse, ma una raccolta
nuova che ignorasse `rescinded` conterebbe cartellini che le righe vecchie non contano.
**Due righe della stessa tavola direbbero cose diverse senza che nessuno lo dica.** La
sincronizzazione delle osservazioni deve escludere `rescinded: true`.

### Formazioni previste

`/events/{id}/lineups/` risponde sempre `200`, con `lineup_status` a `confirmed`,
`predicted` o `unavailable`, e `lineups: null` nell'ultimo caso — **mai `404`**. La
formazione prevista è generata da un modello, porta una `confidence` per lato, ed esiste
per il 100% delle gare entro tre giorni dal calcio d'inizio, il 99,8% entro sette, il 96%
entro quattordici e il 42% entro trenta.

Questo cambia il quadro della FASE B. Il limite dichiarato nel dizionario delle metriche
resta vero **per il passato** — su una gara già giocata la fonte dà l'undici effettivo,
che è contaminazione — ma da qui in avanti l'istantanea `PRE_LINEUP` è raccoglibile
davvero, con la sua confidenza e il suo orizzonte.

### Conteggio dei tiri: due fonti che non si accordano

La fonte dichiara che `stats.*.total_shots` e la mappa dei tiri vengono da due flussi
diversi che **non vengono riconciliati**, e che su oltre ottocento squadre-gara misurate
l'**11% continua a non accordarsi sul numero di tiri**, quasi sempre di uno. Consiglia la
mappa quando serve un conteggio.

Il motore usa entrambi: il bersaglio `total_shots` viene dal pannello, il profilo spaziale
dalla mappa. Non è un errore, ma va saputo.

La mappa comprende anche i rigori a oltranza, il pannello no. Nell'archivio riguarda
**4 gare su 1.500 esaminate, lo 0,27%**, e `build_shots.py` non li esclude. Dal 16 agosto
2026 la fonte ricostruisce il totale xG di squadra dalla mappa escludendoli, quindi su
quelle gare **un payload riletto oggi porta un xG diverso da quello archiviato**.

## Endpoint nuovi rispetto al catalogo del repo

| Endpoint | Che cosa dà | Serve a noi? |
|---|---|---|
| `/api/v2/coverage/` | per ogni sport: stato di stagione, gare nei prossimi 7 e 30 giorni, quante hanno un prezzo, prossima e ultima gara. **Non richiede chiave** | sì, come primo controllo prima di una raccolta |
| `/api/v2/leagues/{id}/venues/` e `/leagues/{id}/seasons/{season_id}/venues/` | stadi di una competizione | non ora |

Il resto della superficie è invariato rispetto al catalogo già in repo: gare e dodici
sotto-risorse, competizioni, squadre, giocatori, trasferimenti, allenatori, arbitri,
stadi, quote, previsioni, contenuti.

## Che cosa resta fuori, e non cambia

Le quote per singolo operatore ora sarebbero accessibili con questo piano. **Restano
comunque fuori dal prodotto**, per la ragione già scritta nell'inventario: porterebbero a
nominare un operatore. Il piano cambia che cosa è possibile, non che cosa è stato deciso.
