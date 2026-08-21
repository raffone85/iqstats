begin;

-- Osservazioni squadra-gara del motore di proiezione.
--
-- E' il livello dati del motore, non il motore: qui non vive nessun modello e
-- nessun coefficiente. La tabella conserva soltanto cio' che il calcolo delle
-- feature «al momento di» deve ricevere, con la granularita' squadra-gara
-- descritta in docs/architecture/contratto-feature-al-momento-di.md.
--
-- Tre regole che questa tabella non negozia.
--
-- **La semantica «al momento di» e' un vincolo di lettura, non di scrittura.**
-- Per proiettare una gara si leggono soltanto righe con `kickoff_at` anteriore
-- al calcio d'inizio di quella gara. La colonna esiste denormalizzata proprio
-- perche' quel taglio sia una condizione su una colonna indicizzata e non un
-- percorso di join.
--
-- **Un'assenza non diventa zero.** Una metrica non osservata resta `null` e lo
-- stato della lettura lo dichiara: `absent` quando la fonte non porta quel
-- blocco per quella gara, `error` quando la lettura e' fallita e va ritentata.
-- Sono due cose diverse e la sincronizzazione le tratta in modo diverso.
--
-- **Le medie di lega e il profilo dell'arbitro non si conservano.** Si calcolano
-- da questa stessa tavola con lo stesso taglio temporale: due verita' scritte in
-- due posti divergono in silenzio, e questo progetto ne ha gia' pagate tre.
--
-- L'archivio grezzo, i dataset di addestramento e gli artefatti dei modelli
-- restano fuori dal database e fuori dal deploy.

create table football.team_match_observations (
  id bigint generated always as identity primary key,
  match_id bigint not null references football.matches(id) on delete cascade,
  competition_id bigint not null references football.competitions(id) on delete restrict,
  season_id bigint not null references football.seasons(id) on delete restrict,
  team_id bigint not null references football.teams(id) on delete restrict,
  opponent_id bigint not null references football.teams(id) on delete restrict,
  side text not null,
  kickoff_at timestamptz not null,
  referee_id bigint references football.referees(id) on delete set null,

  -- Gli allenatori non hanno una tavola propria in questo schema: si conserva
  -- l'identificativo della fonte, che e' cio' che il gruppo allenatore usa per
  -- riconoscere la stessa persona fra squadre diverse.
  coach_source_id bigint,
  opponent_coach_source_id bigint,

  -- Contorno noto prima del calcio d'inizio.
  round_number smallint,
  is_derby boolean,

  -- Esito della gara: non entra mai come feature della gara stessa, serve a
  -- ricostruire punti e reti «al momento di» dalle gare anteriori.
  goals_for smallint,
  goals_against smallint,

  -- Esito di ciascuna delle tre letture che compongono la riga.
  panel_status text not null,
  discipline_status text not null,
  players_status text not null,

  -- famiglia circolazione
  ball_possession numeric(8,4),
  passes integer,
  accurate_passes integer,
  pass_accuracy_pct numeric(8,4),
  long_balls_total integer,
  -- famiglia territorio
  final_third_entries integer,
  final_third_phase_total integer,
  touches_in_penalty_area integer,
  crosses_total integer,
  -- famiglia intensita
  duels integer,
  ground_duels_total integer,
  aerial_duels_total integer,
  tackles integer,
  interceptions integer,
  recoveries integer,
  clearances integer,
  dribbles_total integer,
  dispossessed integer,
  -- famiglia ambiente_tiro
  shots_inside_box integer,
  shots_outside_box integer,
  blocked_shots integer,
  hit_woodwork integer,
  errors_lead_to_a_shot integer,
  -- famiglia ambiente_gol
  expected_goals numeric(8,4),
  big_chances integer,
  -- famiglia inattive
  free_kicks integer,
  throw_ins integer,
  goal_kicks integer,
  fouled_in_final_third integer,
  -- famiglia incrociato
  total_shots integer,
  shots_on_target integer,
  corner_kicks integer,
  fouls integer,
  yellow_cards integer,
  offsides integer,
  goalkeeper_saves integer,
  -- disciplina, ricostruita dagli episodi e non dal pannello
  second_yellow_red integer,
  red_cards_direct integer,
  bench_cards integer,
  -- Profilo spaziale, misurato sulla mappa dei tiri di quella gara.
  --
  -- Doppia precisione e non `numeric` con i decimali contati: questi non sono valori
  -- letti dalla fonte ma quozienti e medie calcolati in virgola mobile, e il test di
  -- parita' li confronta con uno scarto relativo di 1e-9. Cinque decimali li
  -- arrotonderebbero, e l'arrotondamento non darebbe errore: darebbe un altro numero.
  shot_map_total double precision, -- tiri della mappa
  shot_map_share_in_box double precision, -- quota dentro l'area
  shot_map_avg_distance double precision, -- distanza media in metri
  shot_map_xg_per_shot double precision, -- reti attese per tiro
  shot_map_share_quality double precision, -- quota di tiri sopra la soglia di qualita'
  shot_map_share_blocked double precision, -- quota di tiri respinti
  shot_map_share_set_piece double precision, -- quota di tiri da palla inattiva

  -- Classe di provenienza per singolo valore, secondo la politica dichiarata in
  -- data/registro-metriche.json: A osservato, B zero implicito verificato,
  -- C ricostruito, D ambiguo, E mancante. E' diagnostica, non una dimensione di
  -- interrogazione, e per questo sta in un solo campo invece che in una colonna
  -- per metrica.
  value_provenance jsonb not null default '{}'::jsonb,

  source_observed_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (match_id, team_id),
  constraint team_match_observations_side_check check (side in ('home', 'away')),
  constraint team_match_observations_distinct_teams check (team_id <> opponent_id),
  constraint team_match_observations_panel_status_check check (
    panel_status in ('observed', 'absent', 'error')
  ),
  constraint team_match_observations_discipline_status_check check (
    discipline_status in ('observed', 'absent', 'error')
  ),
  constraint team_match_observations_players_status_check check (
    players_status in ('observed', 'absent', 'error')
  ),
  constraint team_match_observations_round_positive check (
    round_number is null or round_number > 0
  ),
  constraint team_match_observations_goal_pair check (
    (goals_for is null) = (goals_against is null)
  ),
  constraint team_match_observations_goals_nonnegative check (
    (goals_for is null or goals_for >= 0) and (goals_against is null or goals_against >= 0)
  ),
  constraint team_match_observations_provenance_object check (
    jsonb_typeof(value_provenance) = 'object'
  ),
  constraint team_match_observations_metrics_nonnegative check (
    (passes is null or passes >= 0) and
    (accurate_passes is null or accurate_passes >= 0) and
    (long_balls_total is null or long_balls_total >= 0) and
    (final_third_entries is null or final_third_entries >= 0) and
    (final_third_phase_total is null or final_third_phase_total >= 0) and
    (touches_in_penalty_area is null or touches_in_penalty_area >= 0) and
    (crosses_total is null or crosses_total >= 0) and
    (duels is null or duels >= 0) and
    (ground_duels_total is null or ground_duels_total >= 0) and
    (aerial_duels_total is null or aerial_duels_total >= 0) and
    (tackles is null or tackles >= 0) and
    (interceptions is null or interceptions >= 0) and
    (recoveries is null or recoveries >= 0) and
    (clearances is null or clearances >= 0) and
    (dribbles_total is null or dribbles_total >= 0) and
    (dispossessed is null or dispossessed >= 0) and
    (shots_inside_box is null or shots_inside_box >= 0) and
    (shots_outside_box is null or shots_outside_box >= 0) and
    (blocked_shots is null or blocked_shots >= 0) and
    (hit_woodwork is null or hit_woodwork >= 0) and
    (errors_lead_to_a_shot is null or errors_lead_to_a_shot >= 0) and
    (big_chances is null or big_chances >= 0) and
    (free_kicks is null or free_kicks >= 0) and
    (throw_ins is null or throw_ins >= 0) and
    (goal_kicks is null or goal_kicks >= 0) and
    (fouled_in_final_third is null or fouled_in_final_third >= 0) and
    (total_shots is null or total_shots >= 0) and
    (shots_on_target is null or shots_on_target >= 0) and
    (corner_kicks is null or corner_kicks >= 0) and
    (fouls is null or fouls >= 0) and
    (yellow_cards is null or yellow_cards >= 0) and
    (offsides is null or offsides >= 0) and
    (goalkeeper_saves is null or goalkeeper_saves >= 0) and
    (second_yellow_red is null or second_yellow_red >= 0) and
    (red_cards_direct is null or red_cards_direct >= 0) and
    (bench_cards is null or bench_cards >= 0) and
    (ball_possession is null or ball_possession >= 0) and
    (pass_accuracy_pct is null or pass_accuracy_pct >= 0) and
    (expected_goals is null or expected_goals >= 0) and
    (shot_map_total is null or shot_map_total >= 0) and
    (shot_map_avg_distance is null or shot_map_avg_distance >= 0) and
    (shot_map_xg_per_shot is null or shot_map_xg_per_shot >= 0)
  ),
  constraint team_match_observations_shares_bounded check (
    (ball_possession is null or ball_possession between 0 and 100) and
    (pass_accuracy_pct is null or pass_accuracy_pct between 0 and 100) and
    (shot_map_share_in_box is null or shot_map_share_in_box between 0 and 1) and
    (shot_map_share_quality is null or shot_map_share_quality between 0 and 1) and
    (shot_map_share_blocked is null or shot_map_share_blocked between 0 and 1) and
    (shot_map_share_set_piece is null or shot_map_share_set_piece between 0 and 1)
  )
);

-- Tre interrogazioni reali, tre indici. Nessuna vista materializzata: con
-- diciottomila righe non c'e' niente da precalcolare, e un livello in piu'
-- sarebbe un secondo posto dove la verita' puo' divergere.
--
-- 1. la storia di una squadra prima di un istante;
create index team_match_observations_team_kickoff_idx
  on football.team_match_observations(team_id, kickoff_at desc, id);
-- 2. le medie di lega «al momento di», dentro la stagione;
create index team_match_observations_season_kickoff_idx
  on football.team_match_observations(season_id, kickoff_at, id);
-- 3. il profilo dell'arbitro prima di un istante.
create index team_match_observations_referee_kickoff_idx
  on football.team_match_observations(referee_id, kickoff_at, id)
  where referee_id is not null;

-- Le gare ancora da leggere o da ritentare: e' il modo in cui la
-- sincronizzazione riprende senza tenere una coda propria.
create index team_match_observations_pending_idx
  on football.team_match_observations(kickoff_at desc, match_id)
  where panel_status = 'error' or discipline_status = 'error' or players_status = 'error';

create trigger football_team_match_observations_set_updated_at
before update on football.team_match_observations
for each row execute function private.set_football_updated_at();

-- Statistiche per giocatore: servono agli aggregati di rosa del motore, che
-- descrivono con chi la squadra sta giocando usando le sole gare precedenti.
-- Non c'e' una tavola dei giocatori in questo schema: si conserva
-- l'identificativo della fonte.
create table football.player_match_observations (
  match_id bigint not null references football.matches(id) on delete cascade,
  team_id bigint not null references football.teams(id) on delete restrict,
  player_source_id bigint not null,
  season_id bigint not null references football.seasons(id) on delete restrict,
  kickoff_at timestamptz not null,
  -- Posizione nella risposta della fonte. Serve a riprodurre l'ordine di prima
  -- apparizione dei giocatori, che a parita' di minuti decide chi sta negli undici
  -- di riferimento: senza, quell'ordine sarebbe arbitrario e i numeri divergerebbero
  -- da quelli del lato che addestra.
  source_ordinal smallint not null,
  minutes_played smallint not null,
  total_shots smallint,
  shots_on_target smallint,
  fouls smallint,
  yellow_card smallint,
  red_card smallint,
  saves smallint,
  synced_at timestamptz not null default now(),
  primary key (match_id, team_id, player_source_id),
  constraint player_match_observations_player_positive check (player_source_id > 0),
  constraint player_match_observations_ordinal_nonnegative check (source_ordinal >= 0),
  constraint player_match_observations_minutes_range check (
    minutes_played >= 0 and minutes_played <= 200
  ),
  constraint player_match_observations_metrics_nonnegative check (
    (total_shots is null or total_shots >= 0) and
    (shots_on_target is null or shots_on_target >= 0) and
    (fouls is null or fouls >= 0) and
    (yellow_card is null or yellow_card >= 0) and
    (red_card is null or red_card >= 0) and
    (saves is null or saves >= 0)
  )
);

create index player_match_observations_team_kickoff_idx
  on football.player_match_observations(team_id, kickoff_at desc, match_id);

-- Permessi: le due tavole seguono la stessa disciplina delle altre di questo
-- schema. Il lettore dell'applicazione legge e basta; chi sincronizza scrive con
-- il ruolo di servizio. La concessione «su tutte le tavole» del 9 agosto valeva
-- per le tavole di allora: queste vanno concesse esplicitamente.
alter table football.team_match_observations enable row level security;
alter table football.player_match_observations enable row level security;

revoke all on football.team_match_observations, football.player_match_observations
  from public, anon, authenticated;

grant select, insert, update, delete
  on football.team_match_observations, football.player_match_observations
  to service_role;
grant usage, select on sequence football.team_match_observations_id_seq to service_role;

grant select on football.team_match_observations, football.player_match_observations
  to iqstats_app_reader;

create policy iqstats_app_reader_team_match_observations_select
  on football.team_match_observations
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_player_match_observations_select
  on football.player_match_observations
  for select
  to iqstats_app_reader
  using (true);

-- La sincronizzazione delle osservazioni e' una fetta a se': si annota nello
-- stesso giornale delle altre, senza una tavola propria.
alter table private.football_sync_runs
  drop constraint football_sync_runs_slice_check;
alter table private.football_sync_runs
  add constraint football_sync_runs_slice_check check (
    data_slice in ('DATA-1', 'DATA-2', 'DATA-3', 'DATA-4', 'DATA-5', 'DATA-6')
  );

-- Scrittura di un lotto di osservazioni.
--
-- Il lotto arriva con gli identificativi della fonte, non con quelli interni: chi
-- normalizza lavora sull'archivio e non conosce le chiavi di questo database. La
-- risoluzione avviene qui, con una giuntura, e una riga che nomina una gara o una
-- squadra sconosciute **non viene inventata**: viene contata fra le rifiutate e il
-- chiamante lo vede.
--
-- La scrittura e' idempotente per costruzione: la chiave (gara, squadra) e' unica e il
-- conflitto aggiorna. Rilanciare lo stesso lotto due volte lascia la tavola identica.
--
-- Tutto in CTE e niente tabelle temporanee: con `search_path` vuoto una temporanea non
-- si risolverebbe senza qualificarla, e il rimedio sarebbe piu' fragile del problema.
create or replace function private.apply_projection_observations(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $iqstats$
with lotto_squadre as (
  select *
  from jsonb_to_recordset(coalesce(payload -> 'teamMatches', '[]'::jsonb)) as riga(
      match_source_id bigint,
      team_source_id bigint,
      opponent_source_id bigint,
      season_source_id bigint,
      referee_source_id bigint,
      side text,
      kickoff_at timestamptz,
      coach_source_id bigint,
      opponent_coach_source_id bigint,
      round_number smallint,
      is_derby boolean,
      goals_for smallint,
      goals_against smallint,
      panel_status text,
      discipline_status text,
      players_status text,
      value_provenance jsonb,
      source_observed_at timestamptz,
      ball_possession numeric(8,4),
      passes integer,
      accurate_passes integer,
      pass_accuracy_pct numeric(8,4),
      long_balls_total integer,
      final_third_entries integer,
      final_third_phase_total integer,
      touches_in_penalty_area integer,
      crosses_total integer,
      duels integer,
      ground_duels_total integer,
      aerial_duels_total integer,
      tackles integer,
      interceptions integer,
      recoveries integer,
      clearances integer,
      dribbles_total integer,
      dispossessed integer,
      shots_inside_box integer,
      shots_outside_box integer,
      blocked_shots integer,
      hit_woodwork integer,
      errors_lead_to_a_shot integer,
      expected_goals numeric(8,4),
      big_chances integer,
      free_kicks integer,
      throw_ins integer,
      goal_kicks integer,
      fouled_in_final_third integer,
      total_shots integer,
      shots_on_target integer,
      corner_kicks integer,
      fouls integer,
      yellow_cards integer,
      offsides integer,
      goalkeeper_saves integer,
      second_yellow_red integer,
      red_cards_direct integer,
      bench_cards integer,
      shot_map_total double precision,
      shot_map_share_in_box double precision,
      shot_map_avg_distance double precision,
      shot_map_xg_per_shot double precision,
      shot_map_share_quality double precision,
      shot_map_share_blocked double precision,
      shot_map_share_set_piece double precision
  )
),
squadre_scritte as (
  insert into football.team_match_observations (
    match_id, competition_id, season_id, team_id, opponent_id, side, kickoff_at,
    referee_id, coach_source_id, opponent_coach_source_id, round_number, is_derby,
    goals_for, goals_against, panel_status, discipline_status, players_status,
    ball_possession,
    passes,
    accurate_passes,
    pass_accuracy_pct,
    long_balls_total,
    final_third_entries,
    final_third_phase_total,
    touches_in_penalty_area,
    crosses_total,
    duels,
    ground_duels_total,
    aerial_duels_total,
    tackles,
    interceptions,
    recoveries,
    clearances,
    dribbles_total,
    dispossessed,
    shots_inside_box,
    shots_outside_box,
    blocked_shots,
    hit_woodwork,
    errors_lead_to_a_shot,
    expected_goals,
    big_chances,
    free_kicks,
    throw_ins,
    goal_kicks,
    fouled_in_final_third,
    total_shots,
    shots_on_target,
    corner_kicks,
    fouls,
    yellow_cards,
    offsides,
    goalkeeper_saves,
    second_yellow_red,
    red_cards_direct,
    bench_cards,
    shot_map_total,
    shot_map_share_in_box,
    shot_map_avg_distance,
    shot_map_xg_per_shot,
    shot_map_share_quality,
    shot_map_share_blocked,
    shot_map_share_set_piece,
    value_provenance, source_observed_at, synced_at
  )
  select gara.id, gara.competition_id, gara.season_id, squadra.id, avversaria.id,
         lotto.side, lotto.kickoff_at, arbitro.id, lotto.coach_source_id,
         lotto.opponent_coach_source_id, lotto.round_number, lotto.is_derby,
         lotto.goals_for, lotto.goals_against, lotto.panel_status,
         lotto.discipline_status, lotto.players_status,
         lotto.ball_possession,
         lotto.passes,
         lotto.accurate_passes,
         lotto.pass_accuracy_pct,
         lotto.long_balls_total,
         lotto.final_third_entries,
         lotto.final_third_phase_total,
         lotto.touches_in_penalty_area,
         lotto.crosses_total,
         lotto.duels,
         lotto.ground_duels_total,
         lotto.aerial_duels_total,
         lotto.tackles,
         lotto.interceptions,
         lotto.recoveries,
         lotto.clearances,
         lotto.dribbles_total,
         lotto.dispossessed,
         lotto.shots_inside_box,
         lotto.shots_outside_box,
         lotto.blocked_shots,
         lotto.hit_woodwork,
         lotto.errors_lead_to_a_shot,
         lotto.expected_goals,
         lotto.big_chances,
         lotto.free_kicks,
         lotto.throw_ins,
         lotto.goal_kicks,
         lotto.fouled_in_final_third,
         lotto.total_shots,
         lotto.shots_on_target,
         lotto.corner_kicks,
         lotto.fouls,
         lotto.yellow_cards,
         lotto.offsides,
         lotto.goalkeeper_saves,
         lotto.second_yellow_red,
         lotto.red_cards_direct,
         lotto.bench_cards,
         lotto.shot_map_total,
         lotto.shot_map_share_in_box,
         lotto.shot_map_avg_distance,
         lotto.shot_map_xg_per_shot,
         lotto.shot_map_share_quality,
         lotto.shot_map_share_blocked,
         lotto.shot_map_share_set_piece,
         coalesce(lotto.value_provenance, '{}'::jsonb), lotto.source_observed_at,
         pg_catalog.now()
  from lotto_squadre lotto
  join football.matches gara on gara.source_id = lotto.match_source_id
  join football.teams squadra on squadra.source_id = lotto.team_source_id
  join football.teams avversaria on avversaria.source_id = lotto.opponent_source_id
  left join football.referees arbitro on arbitro.source_id = lotto.referee_source_id
  on conflict (match_id, team_id) do update set
    opponent_id = excluded.opponent_id,
    side = excluded.side,
    kickoff_at = excluded.kickoff_at,
    referee_id = excluded.referee_id,
    coach_source_id = excluded.coach_source_id,
    opponent_coach_source_id = excluded.opponent_coach_source_id,
    round_number = excluded.round_number,
    is_derby = excluded.is_derby,
    goals_for = excluded.goals_for,
    goals_against = excluded.goals_against,
    panel_status = excluded.panel_status,
    discipline_status = excluded.discipline_status,
    players_status = excluded.players_status,
    ball_possession = excluded.ball_possession,
    passes = excluded.passes,
    accurate_passes = excluded.accurate_passes,
    pass_accuracy_pct = excluded.pass_accuracy_pct,
    long_balls_total = excluded.long_balls_total,
    final_third_entries = excluded.final_third_entries,
    final_third_phase_total = excluded.final_third_phase_total,
    touches_in_penalty_area = excluded.touches_in_penalty_area,
    crosses_total = excluded.crosses_total,
    duels = excluded.duels,
    ground_duels_total = excluded.ground_duels_total,
    aerial_duels_total = excluded.aerial_duels_total,
    tackles = excluded.tackles,
    interceptions = excluded.interceptions,
    recoveries = excluded.recoveries,
    clearances = excluded.clearances,
    dribbles_total = excluded.dribbles_total,
    dispossessed = excluded.dispossessed,
    shots_inside_box = excluded.shots_inside_box,
    shots_outside_box = excluded.shots_outside_box,
    blocked_shots = excluded.blocked_shots,
    hit_woodwork = excluded.hit_woodwork,
    errors_lead_to_a_shot = excluded.errors_lead_to_a_shot,
    expected_goals = excluded.expected_goals,
    big_chances = excluded.big_chances,
    free_kicks = excluded.free_kicks,
    throw_ins = excluded.throw_ins,
    goal_kicks = excluded.goal_kicks,
    fouled_in_final_third = excluded.fouled_in_final_third,
    total_shots = excluded.total_shots,
    shots_on_target = excluded.shots_on_target,
    corner_kicks = excluded.corner_kicks,
    fouls = excluded.fouls,
    yellow_cards = excluded.yellow_cards,
    offsides = excluded.offsides,
    goalkeeper_saves = excluded.goalkeeper_saves,
    second_yellow_red = excluded.second_yellow_red,
    red_cards_direct = excluded.red_cards_direct,
    bench_cards = excluded.bench_cards,
    shot_map_total = excluded.shot_map_total,
    shot_map_share_in_box = excluded.shot_map_share_in_box,
    shot_map_avg_distance = excluded.shot_map_avg_distance,
    shot_map_xg_per_shot = excluded.shot_map_xg_per_shot,
    shot_map_share_quality = excluded.shot_map_share_quality,
    shot_map_share_blocked = excluded.shot_map_share_blocked,
    shot_map_share_set_piece = excluded.shot_map_share_set_piece,
    value_provenance = excluded.value_provenance,
    source_observed_at = excluded.source_observed_at,
    synced_at = pg_catalog.now()
  returning 1
),
squadre_rifiutate as (
  select 1
  from lotto_squadre lotto
  where not exists (
      select 1 from football.matches g where g.source_id = lotto.match_source_id)
     or not exists (
      select 1 from football.teams s where s.source_id = lotto.team_source_id)
     or not exists (
      select 1 from football.teams a where a.source_id = lotto.opponent_source_id)
),
lotto_giocatori as (
  select *
  from jsonb_to_recordset(coalesce(payload -> 'playerMatches', '[]'::jsonb)) as riga(
      match_source_id bigint,
      team_source_id bigint,
      player_source_id bigint,
      kickoff_at timestamptz,
      source_ordinal smallint,
      minutes_played smallint,
      total_shots smallint,
      shots_on_target smallint,
      fouls smallint,
      yellow_card smallint,
      red_card smallint,
      saves smallint
  )
),
giocatori_scritti as (
  insert into football.player_match_observations (
    match_id, team_id, player_source_id, season_id, kickoff_at, source_ordinal,
    minutes_played, total_shots, shots_on_target, fouls, yellow_card, red_card, saves,
    synced_at
  )
  select gara.id, squadra.id, lotto.player_source_id, gara.season_id, lotto.kickoff_at,
         lotto.source_ordinal, lotto.minutes_played, lotto.total_shots,
         lotto.shots_on_target, lotto.fouls, lotto.yellow_card, lotto.red_card,
         lotto.saves, pg_catalog.now()
  from lotto_giocatori lotto
  join football.matches gara on gara.source_id = lotto.match_source_id
  join football.teams squadra on squadra.source_id = lotto.team_source_id
  on conflict (match_id, team_id, player_source_id) do update set
    season_id = excluded.season_id,
    kickoff_at = excluded.kickoff_at,
    source_ordinal = excluded.source_ordinal,
    minutes_played = excluded.minutes_played,
    total_shots = excluded.total_shots,
    shots_on_target = excluded.shots_on_target,
    fouls = excluded.fouls,
    yellow_card = excluded.yellow_card,
    red_card = excluded.red_card,
    saves = excluded.saves,
    synced_at = pg_catalog.now()
  returning 1
),
giocatori_rifiutati as (
  select 1
  from lotto_giocatori lotto
  where not exists (
      select 1 from football.matches g where g.source_id = lotto.match_source_id)
     or not exists (
      select 1 from football.teams s where s.source_id = lotto.team_source_id)
)
select jsonb_build_object(
  'teamRowsWritten', (select pg_catalog.count(*) from squadre_scritte),
  'teamRowsRejected', (select pg_catalog.count(*) from squadre_rifiutate),
  'playerRowsWritten', (select pg_catalog.count(*) from giocatori_scritti),
  'playerRowsRejected', (select pg_catalog.count(*) from giocatori_rifiutati)
);
$iqstats$;

revoke all on function private.apply_projection_observations(jsonb)
  from public, anon, authenticated;
grant execute on function private.apply_projection_observations(jsonb) to service_role;

commit;
