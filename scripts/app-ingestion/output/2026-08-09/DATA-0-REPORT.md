# DATA-0 — Provider preflight per APP-3D

## Esito

Preflight completato in sola lettura. Sono state avviate 50 richieste GET
su un massimo autorizzato di 50, con frequenza non superiore a due al
secondo. Non sono state effettuate scritture remote e non sono state conservate risposte grezze.

Il catalogo locale di prodotto definisce 36 campionati
regolari supportati. Il catalogo corrente ne rende interrogabili
36; 33
rispettano già la finestra prodotto stretta. Le stagioni sono interpretate tramite il marcatore
corrente del provider: 21 stagioni 2026/27,
12 stagioni nell'anno solare 2026 e
3 casi correnti con altra finestra esplicita. Questi
ultimi restano sospesi da DATA-1 fino al rollover del catalogo o a una conferma umana.

## Volume corrente osservato

- gare dichiarate nelle finestre di stagione corrente: 10361;
- campionati interrogati per il calendario: 36;
- campionati con calendario vuoto: 0;
- stima tecnica del solo nucleo relazionale gare e indici: 20.2–60.7 MiB;
- le proiezioni di quote, statistiche e formazioni restano separate finché il campione non è
  rappresentativo: non vengono moltiplicate artificialmente per tutte le gare.

## Inventario GET calcistico

Il contratto macchina dichiara 145 operazioni GET
nel perimetro calcistico/versionato osservato. Il conteggio seguente è per dominio e non espone
percorsi o indirizzi.

| Dominio | Operazioni dichiarate |
| --- | ---: |
| competitions | 6 |
| headToHead | 2 |
| lineups | 1 |
| managers | 7 |
| matches | 27 |
| odds | 7 |
| other | 46 |
| players | 14 |
| referees | 3 |
| seasons | 4 |
| standings | 2 |
| statistics | 5 |
| teams | 12 |
| transfers | 2 |
| venues | 7 |

## Contratti campionati

| Dominio | Stato | Richieste | Risposte utili | Righe esplicite |
| --- | --- | ---: | ---: | ---: |
| contractCatalog | sampled | 1 | 1 | 1 |
| competitions | sampled | 1 | 1 | 79 |
| matches | sampled | 36 | 36 | 10361 |
| standings | sampled | 1 | 1 | 18 |
| matchDetail | sampled | 1 | 1 | 1 |
| statistics | sampled | 1 | 1 | 31 |
| headToHead | sampled | 1 | 1 | 10 |
| oddsCurrent | sampled | 1 | 1 | 1 |
| oddsComparison | sampled | 1 | 1 | 1 |
| lineups | sampled | 1 | 1 | 1 |
| oddsDetailed | sampled | 1 | 1 | 368 |
| players | sampled | 1 | 1 | 43 |
| playerDetail | sampled | 1 | 1 | 1 |
| managerDetail | sampled | 1 | 1 | 1 |
| transfers | sampled | 1 | 1 | 46 |

## Decisione architetturale

PostgreSQL normalizzato resta adeguato per velocità, capacità e qualità: caricamenti a batch,
upsert idempotenti, indici composti sulle chiavi di lettura, snapshot solo quando cambiano e
raw payload esclusi dal database di prodotto. Il volume del nucleo corrente non giustifica
partizionamento anticipato; quote e snapshot verranno rivalutati dopo DATA-1/DATA-3.

## Limiti e gate

- DATA-0 dimostra disponibilità, forma e volumi; non è il caricamento completo.
- Il totale gare include anche i 3 campionati sospesi e non
  rappresenta ancora il conteggio definitivo del perimetro fresco DATA-1.
- La copertura di una sonda non implica copertura uniforme su tutti i campionati o tutte le gare.
- I campi mancanti restano mancanti e non vengono convertiti in zero.
- Prima di migrazioni o letture/scritture sul database remoto resta obbligatorio un checkpoint
  umano sul contratto SQL locale e sul piano di ingestione DATA-1.
