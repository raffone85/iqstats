# Copertura dei dati per giocatore — misura del 30 agosto 2026

La voce 15 del piano (`tasks/allineamento-powerstats.md`) impone di **misurare la copertura
prima di costruire**: la sezione Giocatori esiste solo dove il dato regge, e deve dichiarare
dove non c'è. Questo documento è quella misura. Non contiene decisioni di prodotto: contiene
numeri.

**Come rifarla,** da `apps/web`:

```
node scripts/verification/copertura-giocatori.mjs 20              # ultime 20 gare per lega
COPERTURA_DA=2026-07-01 node scripts/verification/copertura-giocatori.mjs   # censimento stagione
COPERTURA_JSON=<percorso>                                          # per riavere le misure in JSON
```

Solo lettura, nessuna scrittura. Lo script verifica da sé l'intervallo di Wilson che stampa:
se la formula si rompe, si ferma con un `AssertionError` invece di stampare numeri sbagliati.

---

## 1. Da dove arrivano i dati per giocatore

**Non dal nostro livello dati.** Il contratto `FootballDataStore`
(`src/server/iqstats/database-store.ts`) espone competizioni, gare, stagioni e classifiche:
nessuna entità giocatore.

**Non dalle formazioni.** `LineupPlayer` (`src/server/iqstats/lineups.ts`) porta soltanto
identificativo, nome, ruolo e numero di maglia.

**Dalla fonte, su endpoint che l'app non usa ancora.** L'app oggi chiama solo `events`,
`leagues`, `managers`, `odds`, `predictions`, `referees`, `teams`, `venues`.

| Endpoint | Che cosa dà |
| --- | --- |
| `/api/v2/events/{id}/player-stats/` | una riga per convocato di quella gara, 71 campi |
| `/api/v2/players/{id}/stats/` | **le stesse righe** viste dalla parte del giocatore |
| `/api/v2/players/{id}/` | anagrafica e valori derivati |
| `/api/v2/events/{id}/lineups/` | formazione, prevista o ufficiale |
| `/api/v2/referees/` | 1.350 arbitri con medie di cartellini e falli |

**La fonte non ha aggregati di stagione per giocatore.** `/api/v2/players/{id}/stats/`
restituisce le stesse righe per gara, ciascuna con il suo `event_id` — 271 righe per un
titolare di Serie A. La somma di stagione la calcoliamo noi, come vuole `AGENTS.md`.
La conseguenza pesa: **una classifica di stagione è onesta solo se copre tutte le gare della
stagione**, perché ogni gara scoperta è un buco nel totale che non si vede guardando il totale.

---

## 2. Che cosa è stato misurato

Due campioni, entrambi del 30 agosto 2026, su tutti gli **83 campionati** della fonte.

| | Campione | Gare | Righe |
| --- | --- | ---: | ---: |
| A | ultime **20** gare finite per campionato | 1.659 | 67.108 |
| B | **tutte** le gare finite dal 1° luglio 2026 | 2.637 | 101.513 |

Il campione A serve a confrontare campionati fra loro con lo stesso numero di gare ciascuno:
venti perché a 20/20 l'intervallo di Wilson al 95% parte da **83,9%** e a 0/20 arriva a
**16,1%**, quindi i due estremi non si toccano e il campione sa distinguere «coperto sempre» da
«mai coperto». A dieci gare non ci riuscirebbe: 10/10 scende a 72,2%.

Il campione B non è un campione ma un censimento, e serve alla sezione con selettore di
stagione. In due casi la lista si ferma a 200 gare e il conteggio è tagliato per difetto:
Conference League e Club Friendlies.

---

## 3. Il campione per lega — dove regge e dove no

**1.303 gare su 1.659 coprono (78,5%).** Le righe con minuti sopra zero sono 40.710 su 67.108,
il 60,7%: il resto sono convocati rimasti in panchina, per i quali zero è il valore vero.

I campionati si dispongono in tre gruppi separati da due salti larghi:

- **58 campionati a 20 su 20**, poi una banda che scende di cinque punti per volta —
  Africa Cup of Nations 95%, Scottish Premiership 90%, Champions League 85%, Coppa Italia 80%,
  Conference League 75%;
- **un salto di 22,4 punti** fino a UEFA Super Cup 52,6%, Parva Liga 50%, Taça de Portugal 50%,
  International Friendly Games 35%, Copa Colombia 25%;
- **un salto di 25 punti** fino a **quattordici campionati a 0 su 20**.

**Un campione a cavallo di due stagioni inganna.** La UEFA Super Cup gioca una gara l'anno: le
sue venti gare vanno dal 2008 al 2026, e il suo 52,6% non dice niente sulla lega — dice che le
statistiche per giocatore della fonte **cominciano nel 2017**. Dal 2017 in poi sono dieci gare
su dieci; dal 2016 indietro sono zero, e prima del 2012 non tornano nemmeno le righe.

---

## 4. L'errore che questa misura ha corretto

La misura precedente concludeva che tre campionati «non portano nulla». **È falso.** Uno zero
sulle gare recenti non significa lega scoperta: nella maggior parte dei casi significa
**copertura interrotta**. Lo script ora lo verifica da sé, andando indietro di 120 gare
nell'archivio di ogni lega a zero.

| Campionato | Ultime 20 gare | Indietro di 120 gare |
| --- | ---: | --- |
| Europa League | 0/20 | 3/3, fino al 19 febbraio 2026 |
| K League 1 | 0/20 | 3/3, fino al 4 aprile 2026 |
| Veikkausliiga | 0/20 | 3/3, fino al 4 aprile 2026 |
| National League | 0/20 | 3/3, fino al 28 marzo 2026 |
| Liga Portugal 2 | 0/20 | 3/3, fino all'8 marzo 2026 |
| NPL Queensland | 0/20 | 3/3, fino al 7 marzo 2026 |
| Suomen Cup | 0/20 | 3/3, fino al 24 giugno 2025 |
| Puchar Polski | 0/20 | 3/3, fino al 25 settembre 2024 |
| Emperor Cup | 0/20 | **0/3** — mai coperta |
| Nigeria Premier Football League | 0/20 | **0/3** — mai coperta |
| Tunisian Ligue Professionnelle 1 | 0/20 | **0/3** — mai coperta |
| Coupe de Tunisie | 0/20 | **0/3** — mai coperta |

Mese per mese la copertura **si accende e si spegne, e non in un verso solo.**

| Campionato | Andamento mensile misurato |
| --- | --- |
| Serie A | 3/3 in ogni mese controllato, da agosto 2025 ad agosto 2026 |
| Premier League | 3/3 in ogni mese controllato |
| Europa League | spenta lug-ago 2025, **accesa** set 2025 – mag 2026, spenta lug-ago 2026 |
| Parva Liga | accesa fino a dic 2025, spenta feb-lug 2026, **riaccesa** ad agosto 2026 |
| Taça de Portugal | spenta ago-dic 2025, accesa gen-mag 2026, spenta ad agosto 2026 |
| Tunisian Ligue Pro 1 | accesa fino a nov 2025, spenta da gennaio 2026 |

Il buco dell'Europa League coincide con i turni preliminari di luglio e agosto, in entrambe le
stagioni. Quello della Taça de Portugal coincide con i primi turni, quelli dei club minori.

---

## 5. Il censimento della stagione — la misura che decide

Tutte le gare finite dal 1° luglio 2026: **1.854 coperte su 2.637, il 70,3%**. Sessantatré
campionati hanno giocato in questa finestra, e si dividono così:

**Piene, 42 campionati, 1.520 gare, tutte coperte.** MLS 109/109, Liga Profesional 97/97,
Brasileirão B 94/94, NWSL 78/78, Chinese Super League 69/69, Allsvenskan 64/64, Brasileirão A
61/61, Carabao Cup 60/60, Categoría Primera A e Liga MX Apertura 52/52, Eliteserien 47/47,
Ekstraklasa 44/44, J1 League 40/40, Championship e League Two 36/36, Ligue 2 35/35, League One
e Saudi Pro League 33/33, Copa Sudamericana 32/32, DFB Pokal e Liga 3 30/30, Pro League e
Danish Superliga 29/29, Eredivisie e Liga Portugal Betclic 28/28, Segunda División 27/27,
World Cup 2026 26/26, La Liga 25/25, Super League svizzera 24/24, Trendyol Super Lig 22/22,
Copa do Brasil e Botola Pro 20/20, Scottish Premiership e Copa Libertadores 16/16, Premier
League, Ligue 1 e Serie A 15/15, UEFA European U19 12/12, Stoiximan Super League 8/8,
Bundesliga 7/7, Liga F 5/5, UEFA Super Cup 1/1.

Le ultime della lista hanno un campione piccolo solo perché la stagione è appena cominciata:
Bundesliga 7/7 dà un intervallo 64,6-100%, e vorrà essere rimisurata fra un mese.

**Parziali, 8 campionati, 758 gare.**

| Campionato | Coperte | Quota | IC 95% |
| --- | ---: | ---: | --- |
| USL Championship | 105/106 | 99,1% | 94,8-99,8 |
| Superliga (Romania) | 51/52 | 98,1% | 89,9-99,7 |
| Coppa Italia | 16/20 | 80,0% | 58,4-91,9 |
| National League | 22/48 | 45,8% | 32,6-59,7 |
| Conference League | 77/200 | 38,5% | 32,0-45,4 |
| Champions League | 33/90 | 36,7% | 27,4-47,0 |
| Parva Liga | 10/42 | 23,8% | 13,5-38,5 |
| Club Friendlies | 20/200 | 10,0% | 6,6-14,9 |

**Champions e Conference crollano nel censimento** rispetto al campione per lega — 36,7% contro
85%, 38,5% contro 75% — perché il censimento include i turni preliminari di luglio e agosto,
che le ultime venti gare non toccavano. Non è una contraddizione fra le due misure: è la
stessa cosa detta su due finestre diverse, e la finestra della stagione è quella che conta.

**A zero, 13 campionati, 359 gare.** Europa League 0/80, K League 1 0/61, Emperor Cup 0/56,
Veikkausliiga 0/44, NPL Queensland 0/40, Liga Portugal 2 0/32, Copa Colombia 0/15, Puchar
Polski 0/11, Tunisian Ligue Pro 1 0/11, Taça de Portugal 0/5, International Friendly Games 0/2,
Suomen Cup 0/1, Nigeria Premier 0/1.

Otto di questi tredici coprivano fino a pochi mesi fa. **Per loro la stagione in corso è
interamente scoperta**, e una classifica di stagione non si può mostrare affatto: non è
incompleta, è vuota.

---

## 6. I campi

**71 campi presenti, 70 con almeno un valore diverso da zero.** L'unico mai valorizzato su
101.513 righe è `high_claims`.

Sulle righe di chi ha davvero giocato, in Serie A, i campi che servono a una scheda giocatore
sono **presenti sul 100%**: `minutes_played`, `fouls`, `was_fouled`, `yellow_card`, `red_card`,
`total_tackle`, `won_tackle`, `duel_won`, `duel_lost`, `total_shots`, `shots_on_target`,
`goals`, `key_pass`, `big_chance_missed`, `saves`.

**`expected_goals` è nullo esattamente quando il giocatore non ha tirato.** Su 479 righe con
minuti sopra zero: 233 righe con almeno un tiro hanno tutte l'xG, 246 righe senza tiri non ce
l'hanno nessuna, zero eccezioni in entrambi i versi. Il 48,6% di presenza non è un buco di
copertura: è la definizione del campo. Va trattato come zero quando i tiri sono zero, e come
mancante mai.

**Valori derivati da non confondere con misure.** `/api/v2/players/{id}/` porta anche
`rating`, `potential` (un'etichetta testuale, per esempio `"Can Polish Skills"`), `injury_risk`,
`market_value_eur` e `wage_eur_annual`. Valgono la decisione già presa il 30 agosto su
`rating`: sono numeri calcolati con un metodo che non conosciamo, e valore di mercato e
stipendio non sono nemmeno statistiche. Accanto ai nostri numeri passerebbero per nostri.

---

## 7. Le formazioni prima della gara

`/api/v2/events/{id}/lineups/` ha un campo `lineup_status` con tre valori misurati:

| Valore | Quando | Che cosa porta |
| --- | --- | --- |
| `unavailable` | oltre ~dieci giorni prima | niente, zero giocatori |
| `predicted` | da ~dieci giorni prima al fischio | undici più undici, `beta: true`, un `ai_score` per giocatore |
| `confirmed` | a formazioni ufficiali | undici più undici reali, `beta: false`, `ai_score` nullo |

Misurato il 30 agosto interrogando dodici gare per giorno: `predicted` a 0, 1, 2, 3, 4, 5, 7 e
10 giorni; `unavailable` a 14 giorni.

**`ai_score` è un numero della fonte**, non nostro, dichiarato `beta`, prodotto da un modello
di cui non conosciamo il metodo. Vale la stessa regola di `rating`: si può usare come ingresso
dichiarandone l'origine, non si mostra come se fosse una nostra misura.

---

## 8. Che cosa significa per la voce 15

1. **Una soglia per campionato è lo strumento sbagliato.** Un elenco di leghe ammesse scritto
   oggi sarebbe falso entro un mese in entrambe le direzioni: escluderebbe la Parva Liga, che è
   tornata ad agosto, e includerebbe l'Europa League, che si è spenta a luglio.
2. **La sezione si decide sulla gara, al momento della lettura**: si chiede, e se il dato non
   c'è si dichiara assente. È l'unico criterio che non invecchia.
3. **La classifica di stagione si decide sulla stagione**, con il numero di gare coperte su
   quelle giocate scritto accanto. Sotto il 100% il totale è parziale e va detto quanto; a zero
   la classifica non si mostra.
4. **Il campione va rifatto**, non ereditato: a fine settembre Bundesliga, Serie A, Premier
   League e Ligue 1 avranno un campione tre volte più largo e un intervallo tre volte più
   stretto.
5. **`rating`, `ai_score`, `potential`, `market_value_eur`, `wage_eur_annual` non si mostrano**
   accanto ai nostri numeri.

Il seguito operativo — probabili ammoniti e probabili marcatori — sta in
`tasks/giocatori-cartellini-e-marcatori.md`.
