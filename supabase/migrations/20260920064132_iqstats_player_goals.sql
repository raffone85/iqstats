-- I gol di un giocatore in una gara.
--
-- **Perche' mancavano.** `football.player_match_observations` e' nata per il motore di
-- proiezione, che modella tiri, falli, cartellini e parate: `goals` non serviva a nessuno
-- dei sette bersagli e non e' stata portata. Il risultato e' che la tavola sa dire quanto
-- un giocatore tira e non quanto segna, e i marcatori - la prima cosa che si cerca su un
-- giocatore - restavano fuori dal prodotto.
--
-- **Da dove arrivano, e a costo zero.** Dall'archivio gia' sul disco:
-- `scripts/projection/harvest/data/player-stats/`, 11.513 gare, una riga per convocato,
-- campo `goals` presente in tutte. Nessuna chiamata nuova alla fonte.
--
-- **Una colonna qui e non una tavola nuova.** A differenza di `team_match_shots`, questa
-- tavola non viene riscritta da un caricamento del motore: le sue righe arrivano dallo
-- stesso archivio, e una colonna in piu' non sparisce al prossimo giro.
--
-- Resta `null` dove l'archivio non copre la gara: un giocatore senza dato non ha segnato
-- zero gol, non lo sappiamo, e in pagina si dichiara invece di contarlo come digiuno.

begin;

alter table football.player_match_observations
  add column goals smallint;

alter table football.player_match_observations
  add constraint player_match_observations_goals_nonnegative
  check (goals is null or (goals >= 0 and goals <= 20));

commit;
