begin;

create index if not exists matches_competition_kickoff_status_idx
  on football.matches(competition_id, kickoff_at, normalized_status, id);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'iqstats_app_reader') then
    create role iqstats_app_reader
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication;
  end if;
end;
$$;

create or replace view football.app_competition_read_model
with (security_invoker = true)
as
select
  competition.source_id as competition_source_id,
  competition.name as competition_name,
  competition.country_name,
  competition.is_active,
  competition.observed_at,
  competition.source_updated_at,
  season.source_id as season_source_id,
  season.name as season_name,
  season.starts_on,
  season.ends_on,
  season.is_current,
  season.observed_at as season_observed_at,
  season.source_updated_at as season_source_updated_at
from football.competitions competition
join football.seasons season
  on season.competition_id = competition.id
  and season.is_current
  and season.ingest_scope = 'product_current'
where competition.is_active;

create or replace view football.app_match_read_model
with (security_invoker = true)
as
select
  match.source_id as match_source_id,
  match.kickoff_at,
  match.normalized_status,
  match.status_detail,
  match.round_name,
  match.home_score,
  match.away_score,
  match.observed_at,
  match.source_updated_at,
  match.fresh_until,
  competition.source_id as competition_source_id,
  competition.name as competition_name,
  competition.country_name as competition_country_name,
  competition.is_active as competition_active,
  season.source_id as season_source_id,
  season.name as season_name,
  season.starts_on as season_starts_on,
  season.ends_on as season_ends_on,
  season.is_current as season_is_current,
  home_team.source_id as home_team_source_id,
  home_team.name as home_team_name,
  away_team.source_id as away_team_source_id,
  away_team.name as away_team_name,
  venue.source_id as venue_source_id,
  referee.source_id as referee_source_id,
  exists (
    select 1
    from football.standing_snapshots snapshot
    where snapshot.season_id = match.season_id
      and snapshot.is_complete
  ) as has_complete_standings
from football.matches match
join football.competitions competition on competition.id = match.competition_id
join football.seasons season on season.id = match.season_id
join football.teams home_team on home_team.id = match.home_team_id
join football.teams away_team on away_team.id = match.away_team_id
left join football.venues venue on venue.id = match.venue_id
left join football.referees referee on referee.id = match.referee_id
where season.ingest_scope = 'product_current';

create or replace view football.app_standing_read_model
with (security_invoker = true)
as
select
  competition.source_id as competition_source_id,
  season.source_id as season_source_id,
  season.name as season_name,
  snapshot.effective_at,
  snapshot.observed_at as snapshot_observed_at,
  snapshot.source_updated_at,
  team.source_id as team_source_id,
  team.name as team_name,
  standing.position,
  standing.played,
  standing.won,
  standing.drawn,
  standing.lost,
  standing.goals_for,
  standing.goals_against,
  standing.goal_difference,
  standing.points,
  standing.form,
  standing.observed_at
from football.standing_snapshots snapshot
join football.competitions competition on competition.id = snapshot.competition_id
join football.seasons season on season.id = snapshot.season_id
join football.standing_rows standing on standing.snapshot_id = snapshot.id
join football.teams team on team.id = standing.team_id
where snapshot.is_complete
  and snapshot.id = (
    select latest.id
    from football.standing_snapshots latest
    where latest.season_id = snapshot.season_id
      and latest.is_complete
    order by latest.effective_at desc, latest.id desc
    limit 1
  );

revoke all on football.app_competition_read_model,
  football.app_match_read_model,
  football.app_standing_read_model
  from public, anon, authenticated;

grant usage on schema football to iqstats_app_reader;
grant select on football.competitions,
  football.seasons,
  football.teams,
  football.venues,
  football.referees,
  football.matches,
  football.standing_snapshots,
  football.standing_rows,
  football.app_competition_read_model,
  football.app_match_read_model,
  football.app_standing_read_model
  to iqstats_app_reader;

grant select on football.app_competition_read_model,
  football.app_match_read_model,
  football.app_standing_read_model
  to service_role;

commit;
