-- L'assetto in campo e la pressione minuto per minuto.
--
-- **Da dove arrivano.** Dalle stesse risposte `/events/{id}/stats/` gia' archiviate per
-- il motore, che pero' legge solo `stats.home` e `stats.away`. Restano fuori tre blocchi
-- ricchi, misurati sull'archivio il 4 settembre 2026: `average_positions` su 9.873 gare
-- di 10.977, `momentum` su 9.852, `xg_per_minute` su 9.740. Nessuna chiamata nuova.
--
-- **`attack`, `dangerous_attack` e `ball_safe` non entrano:** stanno solo su 2.140 gare
-- su 10.977, il 19%. Un campo quasi sempre vuoto sembra un dato e non lo e'.
--
-- **Le coordinate sono relative alla squadra, ed e' misurato.** La x dei difensori ha
-- mediana 41,4 per la squadra di casa e 39,3 per l'ospite, quella degli attaccanti 63,4 e
-- 61,7: se fossero assolute i due lati sarebbero specchiati. Quindi 0 e' la propria porta
-- e 100 quella avversaria per entrambe, e i due assetti si confrontano direttamente.
--
-- **Il segno del momentum e' della casa.** Su 701 gare campionate il segno della somma
-- concorda con chi ha prodotto piu' gol attesi nel 73,6% dei casi: positivo e' pressione
-- della squadra di casa, negativo dell'ospite. Il resto e' calcio, non un errore di segno:
-- si puo' premere e non tirare.
--
-- Due tavole a se', come `team_match_halves`: il caricamento del motore riscrive
-- `team_match_observations`, e colonne aggiunte li' sparirebbero al primo ricarico.

begin;

-- L'assetto medio di una squadra in una gara: dove sta la linea, quanto e' larga la
-- squadra, quanto sono distanti i reparti. Il portiere resta fuori da tutto: la sua
-- posizione dice dove si difende, non come si sta in campo.
create table football.team_match_shape (
  match_id bigint not null references football.matches(id) on delete cascade,
  team_id bigint not null references football.teams(id) on delete restrict,
  kickoff_at timestamptz not null,
  -- x media dei difensori, da 0 (propria porta) a 100 (porta avversaria).
  linea_difensiva numeric(5, 2),
  -- x media di tutti i giocatori di movimento.
  baricentro numeric(5, 2),
  -- Quanto si allarga la squadra: differenza fra la y piu' alta e la piu' bassa.
  ampiezza numeric(5, 2),
  -- Distanza fra la linea degli attaccanti e quella dei difensori.
  profondita numeric(5, 2),
  -- Su quanti giocatori di movimento poggia la misura: sotto otto non e' una squadra.
  giocatori smallint not null,
  synced_at timestamptz not null default now(),
  primary key (match_id, team_id),
  constraint team_match_shape_scala check (
    (linea_difensiva is null or linea_difensiva between 0 and 100) and
    (baricentro is null or baricentro between 0 and 100) and
    (ampiezza is null or ampiezza between 0 and 100) and
    (profondita is null or profondita between -100 and 100)
  ),
  constraint team_match_shape_giocatori check (giocatori >= 0 and giocatori <= 20)
);

create index team_match_shape_team_kickoff_idx
  on football.team_match_shape(team_id, kickoff_at desc, match_id);

-- La gara divisa in sei quarti d'ora: quanta pressione ha fatto ciascuna squadra e
-- quanti gol attesi ha prodotto in quella fascia. I minuti oltre il 90 rientrano
-- nell'ultima fascia: il recupero appartiene al finale, non a una fascia propria.
create table football.team_match_bands (
  match_id bigint not null references football.matches(id) on delete cascade,
  team_id bigint not null references football.teams(id) on delete restrict,
  kickoff_at timestamptz not null,
  -- 1 = 1-15, 2 = 16-30, 3 = 31-45, 4 = 46-60, 5 = 61-75, 6 = 76 e oltre.
  band smallint not null,
  -- Somma del momento a favore di questa squadra in quella fascia, grezza: la quota si
  -- calcola quando si legge, cosi' la scala della fonte non viene interpretata qui.
  pressione numeric(8, 2),
  expected_goals numeric(6, 3),
  synced_at timestamptz not null default now(),
  primary key (match_id, team_id, band),
  constraint team_match_bands_band_range check (band between 1 and 6),
  constraint team_match_bands_nonnegative check (
    (pressione is null or pressione >= 0) and
    (expected_goals is null or expected_goals >= 0)
  )
);

create index team_match_bands_team_kickoff_idx
  on football.team_match_bands(team_id, kickoff_at desc, match_id);

alter table football.team_match_shape enable row level security;
alter table football.team_match_bands enable row level security;

revoke all on football.team_match_shape, football.team_match_bands
  from public, anon, authenticated;

grant select, insert, update, delete
  on football.team_match_shape, football.team_match_bands to service_role;

grant select on football.team_match_shape, football.team_match_bands to iqstats_app_reader;

create policy iqstats_app_reader_team_match_shape_select
  on football.team_match_shape
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_team_match_bands_select
  on football.team_match_bands
  for select
  to iqstats_app_reader
  using (true);

commit;
