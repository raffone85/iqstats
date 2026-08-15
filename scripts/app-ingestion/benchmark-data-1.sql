\set ON_ERROR_STOP on

begin;

do $$
declare
  v_competition bigint;
  v_season bigint;
  v_snapshot bigint;
  v_teams bigint[];
begin
  insert into football.competitions(
    source_id, name, country_name, country_code, is_active, observed_at, content_checksum
  ) values (
    910000001, 'Synthetic Capacity League', 'Synthetic Country', 'TST', true, now(),
    'synthetic-capacity-competition-v1'
  ) returning id into v_competition;

  insert into football.seasons(
    competition_id, source_id, name, season_kind, starts_on, ends_on,
    is_current, ingest_scope, observed_at, content_checksum
  ) values (
    v_competition, 910000002, '2026/27', 'cross_year', date '2026-07-01',
    date '2027-06-30', true, 'product_current', now(), 'synthetic-capacity-season-v1'
  ) returning id into v_season;

  insert into football.teams(source_id, name, observed_at, content_checksum)
  select
    910001000 + series_value,
    'Synthetic Team ' || series_value,
    now(),
    'synthetic-team-' || series_value
  from generate_series(1, 40) as series_value;

  select array_agg(id order by source_id) into v_teams
  from football.teams
  where source_id between 910001001 and 910001040;

  insert into football.matches(
    source_id, competition_id, season_id, home_team_id, away_team_id,
    kickoff_at, normalized_status, observed_at, fresh_until, content_checksum
  )
  select
    920000000 + series_value,
    v_competition,
    v_season,
    v_teams[((series_value - 1) % 40) + 1],
    v_teams[(series_value % 40) + 1],
    timestamptz '2026-07-01 00:00:00+00'
      + ((series_value - 1) % 365) * interval '1 day'
      + ((series_value - 1) % 24) * interval '1 hour',
    case
      when series_value % 20 = 0 then 'live'
      when series_value % 7 = 0 then 'finished'
      else 'scheduled'
    end,
    now(),
    now() + interval '15 minutes',
    'synthetic-match-' || series_value
  from generate_series(1, 10361) as series_value;

  insert into football.standing_snapshots(
    competition_id, season_id, effective_at, observed_at, content_checksum,
    row_count, is_complete
  ) values (
    v_competition, v_season, now(), now(), 'synthetic-standing-capacity-v1', 20, true
  ) returning id into v_snapshot;

  insert into football.standing_rows(
    snapshot_id, team_id, position, played, won, drawn, lost, goals_for,
    goals_against, goal_difference, points, form, observed_at
  )
  select
    v_snapshot,
    v_teams[series_value],
    series_value,
    10,
    5,
    3,
    2,
    18,
    10,
    8,
    18,
    'WWDLW',
    now()
  from generate_series(1, 20) as series_value;

  insert into private.football_sync_jobs(
    domain, dedupe_key, normalized_parameters, priority, run_after
  )
  select
    'matches',
    'synthetic-job-' || series_value,
    jsonb_build_object('offset', (series_value - 1) * 200),
    (series_value % 10)::smallint,
    now()
  from generate_series(1, 1000) as series_value;
end;
$$;

analyze football.competitions;
analyze football.seasons;
analyze football.teams;
analyze football.matches;
analyze football.standing_snapshots;
analyze football.standing_rows;
analyze private.football_sync_jobs;

select 'BENCHMARK_METRICS|' || json_build_object(
  'matches', (select count(*) from football.matches),
  'standing_rows', (select count(*) from football.standing_rows),
  'sync_jobs', (select count(*) from private.football_sync_jobs),
  'matches_total_bytes', pg_total_relation_size('football.matches'),
  'football_total_bytes', (
    select sum(pg_total_relation_size(c.oid))
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'football' and c.relkind = 'r'
  )
)::text;

explain (analyze, buffers, format text)
select *
from football.match_read_model
where kickoff_at >= timestamptz '2026-08-09 00:00:00+00'
  and kickoff_at < timestamptz '2026-08-10 00:00:00+00'
  and competition_id = (
    select id from football.competitions where source_id = 910000001
  )
  and normalized_status in ('scheduled', 'live')
order by kickoff_at, id
limit 50;

explain (analyze, buffers, format text)
select *
from football.match_read_model
where id = (
  select id from football.matches where source_id = 920000001
);

explain (analyze, buffers, format text)
select *
from football.current_standing_rows
where season_id = (
  select id from football.seasons where source_id = 910000002
)
order by position nulls last, team_id;

explain (analyze, buffers, format text)
select id
from private.football_sync_jobs
where status in ('pending', 'retry')
  and run_after <= now()
  and attempt_count < max_attempts
order by priority desc, run_after, id
for update skip locked
limit 25;

select count(*) as claimed_jobs
from private.claim_football_sync_jobs('synthetic-benchmark-worker', 25);

rollback;
