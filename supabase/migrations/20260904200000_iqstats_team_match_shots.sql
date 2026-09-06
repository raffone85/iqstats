-- Da dove tira una squadra in una gara: la forma delle sue conclusioni.
--
-- **Perche' una tavola nuova e non colonne su `team_match_observations`.** Stessa
-- ragione delle altre tre: il caricamento del motore riscrive quella tavola e le
-- colonne aggiunte sparirebbero al primo ricarico.
--
-- **Da dove arrivano i numeri.** Da `scripts/projection/dataset/output/tiri.csv`, che
-- `build_shots.py` ha gia' costruito dalle mappe dei tiri archiviate: 255.156 tiri su
-- 10.977 gare lette, 1.105 senza mappa, 19.739 righe squadra-gara. Nessuna chiamata
-- nuova alla fonte, e nessuna rilettura dell'archivio: il dataset c'e' gia'.
--
-- **Il motore le usa gia' come feature** - `shot_map_share_in_box`, `avg_distance`,
-- `share_quality`, `share_blocked`, `share_set_piece` - ma la pagina non le mostra.
-- Questa tavola serve alla pagina e non entra in nessuna interrogazione del motore.
--
-- **Perche' reggono, misurato il 4 settembre 2026.** Su 427 squadre con almeno trenta
-- gare, confrontando il verso dichiarato sulle prime dieci con il verso vero rispetto
-- alla media della competizione: 86,7% di versi giusti sulla distanza media, 86,6%
-- sulla quota da palla ferma, 85,7% sulla qualita', 84,9% sulla quota in area, 80,4%
-- sui gol attesi per tiro. Dire sempre la stessa cosa ne azzecca 50-54%.
--
-- **`share_blocked` resta fuori dalla lettura** pur essendo qui: 76,1% e' il verso piu'
-- debole dei sei, ed e' anche il piu' difficile da interpretare per chi legge. La
-- colonna si conserva perche' costa nulla e serve se un giorno la si vuole.

begin;

create table football.team_match_shots (
  match_id bigint not null references football.matches(id) on delete cascade,
  team_id bigint not null references football.teams(id) on delete restrict,
  -- Ripetuto qui come nelle altre tre: l'interrogazione filtra sempre «prima di un
  -- istante», e senza la colonna l'indice non la copre.
  kickoff_at timestamptz not null,
  -- Quanti tiri stanno dietro alle quote di questa riga: senza, una quota su tre tiri
  -- e una su venti si leggerebbero uguali.
  shots_total smallint not null,
  share_in_box numeric(5, 4),
  avg_distance numeric(6, 3),
  xg_per_shot numeric(6, 4),
  share_quality numeric(5, 4),
  share_blocked numeric(5, 4),
  share_set_piece numeric(5, 4),
  synced_at timestamptz not null default now(),
  primary key (match_id, team_id),
  constraint team_match_shots_totali_nonnegativi check (shots_total >= 0),
  constraint team_match_shots_distanza_positiva check (
    avg_distance is null or avg_distance >= 0
  ),
  constraint team_match_shots_quote_in_scala check (
    (share_in_box is null or share_in_box between 0 and 1)
    and (share_quality is null or share_quality between 0 and 1)
    and (share_blocked is null or share_blocked between 0 and 1)
    and (share_set_piece is null or share_set_piece between 0 and 1)
    and (xg_per_shot is null or xg_per_shot >= 0)
  )
);

-- Due interrogazioni reali: le gare di una squadra prima di un istante, e le gare di
-- una competizione prima dello stesso istante per il metro. La seconda passa da
-- `matches`, che ha gia' il suo indice per competizione e stagione.
create index team_match_shots_team_kickoff_idx
  on football.team_match_shots(team_id, kickoff_at desc, match_id);

alter table football.team_match_shots enable row level security;

revoke all on football.team_match_shots from public, anon, authenticated;

grant select, insert, update, delete on football.team_match_shots to service_role;

grant select on football.team_match_shots to iqstats_app_reader;

create policy iqstats_app_reader_team_match_shots_select
  on football.team_match_shots
  for select
  to iqstats_app_reader
  using (true);

commit;
