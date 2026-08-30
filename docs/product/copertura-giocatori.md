# Copertura dei dati per giocatore — misura del 30 agosto 2026

La voce 15 del piano (`tasks/allineamento-powerstats.md`) impone di **misurare la copertura
prima di costruire**: la sezione Giocatori esiste solo dove il dato regge, e deve dichiarare
dove non c'è. Questo documento è quella misura. Non contiene decisioni di prodotto: contiene
numeri.

**Come rifarla:** da `apps/web`, `node scripts/verification/copertura-giocatori.mjs 6 12`
(sei giorni indietro, dodici gare finite per giorno). Solo lettura, nessuna scrittura.

---

## 1. Da dove arrivano i dati per giocatore

**Non dal nostro livello dati.** Il contratto `FootballDataStore`
(`src/server/iqstats/database-store.ts`) espone competizioni, gare, stagioni e classifiche:
nessuna entità giocatore.

**Non dalle formazioni.** `LineupPlayer` (`src/server/iqstats/lineups.ts`) porta soltanto
identificativo, nome, ruolo e numero di maglia. Nessuna statistica.

**Dalla fonte, su un endpoint che l'app non usa ancora:**
`/api/v2/events/{eventId}/player-stats/`. Trovato per prova il 30 agosto: le forme
`/api/v2/player-stats/?event=`, `/api/v2/player_stats/?event=`, `/api/v2/players/stats/?event=`,
`/api/v2/events/{id}/players/` e `/api/v2/statistics/players/?event=` rispondono tutte **404**.
La risposta ha forma `{ event_id, count, player_stats: [...] }`, una riga per giocatore
convocato.

---

## 2. Il campione

**72 gare finite**, prese dai sei giorni dal 24 al 29 agosto 2026, dodici per giorno,
**22 campionati**, **2.990 righe giocatore**.

---

## 3. Quanto è coperto

| | |
| --- | --- |
| Righe giocatore | **2.990** |
| Righe con minuti giocati sopra zero | **2.047 — il 68,5%** |
| Gare con almeno un giocatore con minuti | **65 su 72 — il 90,3%** |
| Gare senza nessuna statistica per giocatore | **7 su 72 — il 9,7%** |

Il 31,5% di righe a zero **non è un buco**: sono i convocati rimasti in panchina, per i quali
zero è il valore vero. Il numero che conta è l'altro: **una gara su dieci non porta nessuna
statistica per giocatore**.

**Campi:** 71 campi statistici presenti, **68 con almeno un valore diverso da zero**, 3 mai
valorizzati sul campione. I campi di sostanza si attestano tutti attorno alla stessa quota
delle righe totali, cioè coprono quasi per intero le righe di chi ha giocato:

| Campo | Righe con valore | Quota sulle 2.990 |
| --- | --- | --- |
| `minutes_played` | 2.047 | 68,5% |
| `touches` | 2.042 | 68,3% |
| `rating` | 2.024 | 67,7% |
| `total_pass` | 2.021 | 67,6% |
| `accurate_pass` | 2.002 | 67,0% |
| `possession_lost` | 1.983 | 66,3% |
| `ball_carries_count` | 1.962 | 65,6% |

Gli eventi rari stanno in fondo, come è giusto: `red_card` una riga, `hit_woodwork` due,
`last_man_tackle` una.

---

## 4. Dove regge e dove no — la parte che decide

La copertura **non è uniforme fra i campionati**. Su questo campione:

| Campionato | Gare | Con statistiche | Righe | Righe con minuti |
| --- | ---: | ---: | ---: | ---: |
| Carabao Cup | 12 | 12 | 478 | 379 |
| Brasileirão Serie B | 7 | 7 | 312 | 224 |
| Conference League | 7 | **5** | 310 | 156 |
| Champions League | 6 | 6 | 267 | 195 |
| La Liga | 5 | 5 | 229 | 160 |
| MLS | 5 | 5 | 199 | 147 |
| Categoría Primera A | 4 | 4 | 160 | 125 |
| USL Championship | 4 | 4 | 145 | 125 |
| **National League** | 3 | **0** | 107 | **0** |
| Brasileirão Serie A | 2 | 2 | 92 | 63 |
| Liga Profesional de Fútbol | 2 | 2 | 92 | 62 |
| Liga Portugal Betclic | 2 | 2 | 92 | 64 |
| Segunda División | 2 | 2 | 91 | 64 |
| Premier League | 2 | 2 | 80 | 63 |
| Liga MX Apertura | 2 | 2 | 84 | 63 |
| Championship | 1 | 1 | 40 | 32 |
| Ligue 1 | 1 | 1 | 40 | 31 |
| Ligue 2 | 1 | 1 | 40 | 31 |
| DFB Pokal | 1 | 1 | 40 | 32 |
| Copa do Brasil | 1 | 1 | 46 | 31 |
| **Liga Portugal 2** | 1 | **0** | 46 | **0** |
| **Club Friendlies** | 1 | **0** | **0** | **0** |

**Tre campionati su ventidue non portano nulla.** National League su tre gare, Liga Portugal 2
su una, Club Friendlies su una — e le amichevoli non restituiscono nemmeno le righe.
**La Conference League è coperta a metà**: cinque gare su sette, e non è una lega minore.

---

## 5. Che cosa significa per la voce 15

1. **La sezione non può essere globale.** Con una gara su dieci scoperta e tre campionati a
   zero, una scheda giocatore mostrata ovunque prometterebbe un dato che in alcuni campionati
   non arriva mai.
2. **La copertura va decisa per campionato, non per gara.** Una gara vuota in un campionato
   coperto è un caso; un campionato sempre vuoto è una regola.
3. **Il campione per lega è ancora sottile.** Nove campionati su ventidue compaiono con una o
   due gare: prima di dichiarare «coperto» o «non coperto» un campionato serve un campione per
   lega, non un campione globale. Questa misura dice che il problema esiste e dove guardare,
   non basta a fissare la soglia.
4. **`rating` è un numero della fonte, non nostro.** Compare sul 67,7% delle righe, ma è un
   voto calcolato da loro con un metodo che non conosciamo: mostrarlo accanto ai nostri
   numeri lo farebbe passare per una nostra misura.

**Passo successivo, prima di scrivere una riga di interfaccia:** rifare la misura per
campionato con un campione per lega, e fissare la soglia sotto la quale la sezione non
compare. Nessuna soglia decisa a tavolino.
