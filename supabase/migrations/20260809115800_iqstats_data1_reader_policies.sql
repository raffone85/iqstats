begin;

create policy iqstats_app_reader_competitions_select
  on football.competitions
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_seasons_select
  on football.seasons
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_teams_select
  on football.teams
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_venues_select
  on football.venues
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_referees_select
  on football.referees
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_matches_select
  on football.matches
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_standing_snapshots_select
  on football.standing_snapshots
  for select
  to iqstats_app_reader
  using (true);

create policy iqstats_app_reader_standing_rows_select
  on football.standing_rows
  for select
  to iqstats_app_reader
  using (true);

commit;
