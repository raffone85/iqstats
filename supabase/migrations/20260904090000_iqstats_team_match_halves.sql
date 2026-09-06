-- La gara divisa in due tempi, per le metriche di gioco.
--
-- **Perche' una tavola nuova e non dodici colonne su `team_match_observations`.**
-- Quella tavola la riscrive il caricamento del motore: colonne aggiunte qui
-- sparirebbero al primo ricarico delle osservazioni. Una tavola a se' sopravvive,
-- non entra in nessuna interrogazione del motore e si puo' togliere senza toccarlo.
--
-- **Da dove arrivano i numeri.** Dalla stessa risposta `/events/{id}/stats/` che il
-- motore gia' legge dall'archivio locale: `stats.first_half` e `stats.second_half`,
-- che `build_observations.py` scarta perche' addestra sul totale. Nessuna chiamata
-- nuova alla fonte.
--
-- **Copertura misurata il 4 settembre 2026** sull'archivio: 8.790 gare su 10.977
-- portano i due tempi. Fra quelle, gol attesi, tiri, tiri in porta, corner e
-- possesso sono pieni su tutte; i falli su 6.796. Le gare senza tempi non
-- diventano zeri: non hanno righe qui.
--
-- **I gol attesi stimati dalla fonte restano fuori.** In 576 gare la risposta
-- dichiara `xg.estimated = true`: e' un modello della fonte, non un'osservazione,
-- e in quelle righe `expected_goals` resta nullo mentre le altre metriche restano.

begin;

create table football.team_match_halves (
  match_id bigint not null references football.matches(id) on delete cascade,
  team_id bigint not null references football.teams(id) on delete restrict,
  -- 1 = primo tempo, 2 = secondo. Non c'e' un terzo valore: i supplementari
  -- non stanno in questi due blocchi della fonte.
  half smallint not null,
  -- Ripetuto qui come in `player_match_observations`: l'interrogazione filtra
  -- sempre «prima di un istante», e senza la colonna l'indice non la copre.
  kickoff_at timestamptz not null,
  expected_goals numeric(6, 3),
  total_shots smallint,
  shots_on_target smallint,
  corner_kicks smallint,
  fouls smallint,
  -- Percentuale del tempo, non del totale della gara: i due lati di uno stesso
  -- tempo sommano a cento.
  ball_possession numeric(5, 2),
  synced_at timestamptz not null default now(),
  primary key (match_id, team_id, half),
  constraint team_match_halves_half_range check (half in (1, 2)),
  constraint team_match_halves_metrics_nonnegative check (
    (expected_goals is null or expected_goals >= 0) and
    (total_shots is null or total_shots >= 0) and
    (shots_on_target is null or shots_on_target >= 0) and
    (corner_kicks is null or corner_kicks >= 0) and
    (fouls is null or fouls >= 0)
  ),
  constraint team_match_halves_possession_range check (
    ball_possession is null or ball_possession between 0 and 100
  )
);

-- Una sola interrogazione reale: le gare di una squadra prima di un istante.
create index team_match_halves_team_kickoff_idx
  on football.team_match_halves(team_id, kickoff_at desc, match_id);

alter table football.team_match_halves enable row level security;

revoke all on football.team_match_halves from public, anon, authenticated;

grant select, insert, update, delete on football.team_match_halves to service_role;

grant select on football.team_match_halves to iqstats_app_reader;

create policy iqstats_app_reader_team_match_halves_select
  on football.team_match_halves
  for select
  to iqstats_app_reader
  using (true);

commit;
