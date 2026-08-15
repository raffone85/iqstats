\set ON_ERROR_STOP on

begin;

do $$
declare
  v_competition bigint;
  v_season bigint;
  v_home bigint;
  v_away bigint;
  v_match bigint;
  v_snapshot bigint;
  v_count bigint;
begin
  insert into football.competitions(
    source_id, name, country_name, country_code, is_active, observed_at, content_checksum
  ) values (
    900000001, 'Synthetic Regular League', 'Synthetic Country', 'TST', true, now(),
    'synthetic-competition-v1'
  ) returning id into v_competition;

  insert into football.seasons(
    competition_id, source_id, name, season_kind, starts_on, ends_on,
    is_current, ingest_scope, observed_at, content_checksum
  ) values (
    v_competition, 900000002, '2026/27', 'cross_year', date '2026-07-01',
    date '2027-06-30', true, 'product_current', now(), 'synthetic-season-v1'
  ) returning id into v_season;

  insert into football.teams(source_id, name, observed_at, content_checksum)
  values (900000003, 'Synthetic Home', now(), 'synthetic-home-v1')
  returning id into v_home;

  insert into football.teams(source_id, name, observed_at, content_checksum)
  values (900000004, 'Synthetic Away', now(), 'synthetic-away-v1')
  returning id into v_away;

  insert into football.matches(
    source_id, competition_id, season_id, home_team_id, away_team_id,
    kickoff_at, normalized_status, observed_at, fresh_until, content_checksum
  ) values (
    900000005, v_competition, v_season, v_home, v_away,
    timestamptz '2026-08-09 18:00:00+00', 'scheduled', now(),
    now() + interval '15 minutes', 'synthetic-match-v1'
  ) returning id into v_match;

  insert into football.standing_snapshots(
    competition_id, season_id, effective_at, observed_at, content_checksum,
    row_count, is_complete
  ) values (
    v_competition, v_season, now(), now(), 'synthetic-standing-v1', 2, true
  ) returning id into v_snapshot;

  insert into football.standing_rows(
    snapshot_id, team_id, position, played, won, drawn, lost, goals_for,
    goals_against, goal_difference, points, form, observed_at
  ) values
    (v_snapshot, v_home, 1, 1, 1, 0, 0, 2, 0, 2, 3, 'W', now()),
    (v_snapshot, v_away, 2, 1, 0, 0, 1, 0, 2, -2, 0, 'L', now());

  select count(*) into v_count
  from football.match_read_model
  where id = v_match;
  if v_count <> 1 then
    raise exception 'DATA-1 match read model smoke failed';
  end if;

  select count(*) into v_count
  from football.current_standing_rows
  where season_id = v_season;
  if v_count <> 2 then
    raise exception 'DATA-1 standing read model smoke failed';
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'football'
    and grantee in ('anon', 'authenticated');
  if v_count <> 0 then
    raise exception 'DATA-1 client privilege smoke failed';
  end if;

  begin
    insert into football.matches(
      source_id, competition_id, season_id, home_team_id, away_team_id,
      kickoff_at, normalized_status, observed_at, content_checksum
    ) values (
      900000006, v_competition, v_season, v_home, v_home,
      timestamptz '2026-08-10 18:00:00+00', 'scheduled', now(), 'invalid-same-team'
    );
    raise exception 'DATA-1 distinct-team constraint was not enforced';
  exception
    when check_violation then null;
  end;
end;
$$;

explain (analyze, buffers, format text)
select *
from football.match_read_model
where kickoff_at >= timestamptz '2026-08-09 00:00:00+00'
  and kickoff_at < timestamptz '2026-08-10 00:00:00+00'
order by kickoff_at, id
limit 50;

explain (analyze, buffers, format text)
select *
from football.current_standing_rows
where season_id = (
  select id from football.seasons where source_id = 900000002
)
order by position nulls last, team_id;

rollback;
