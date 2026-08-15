begin;

create schema if not exists football;
create schema if not exists private;

revoke all on schema football from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

alter default privileges for role postgres in schema football
  revoke select, insert, update, delete on tables from public, anon, authenticated;
alter default privileges for role postgres in schema football
  revoke usage, select on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema football
  revoke execute on functions from public, anon, authenticated;

create table football.competitions (
  id bigint generated always as identity primary key,
  source_id bigint not null unique,
  name text not null,
  country_name text,
  country_code text,
  competition_kind text not null default 'regular_league',
  gender text not null default 'men',
  is_active boolean not null,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_source_id_positive check (source_id > 0),
  constraint competitions_name_not_blank check (btrim(name) <> ''),
  constraint competitions_country_name_not_blank check (
    country_name is null or btrim(country_name) <> ''
  ),
  constraint competitions_country_code_format check (
    country_code is null or country_code ~ '^[A-Z]{2,3}$'
  ),
  constraint competitions_kind_check check (
    competition_kind in ('regular_league')
  ),
  constraint competitions_gender_check check (gender in ('men'))
);

create table football.seasons (
  id bigint generated always as identity primary key,
  competition_id bigint not null references football.competitions(id) on delete restrict,
  source_id bigint not null,
  name text not null,
  season_kind text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null,
  ingest_scope text not null,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, source_id),
  constraint seasons_source_id_positive check (source_id > 0),
  constraint seasons_name_not_blank check (btrim(name) <> ''),
  constraint seasons_date_order check (ends_on >= starts_on),
  constraint seasons_kind_check check (
    season_kind in ('cross_year', 'calendar_year', 'other')
  ),
  constraint seasons_ingest_scope_check check (
    ingest_scope in ('product_current', 'held')
  ),
  constraint seasons_current_scope_check check (
    not (ingest_scope = 'product_current' and not is_current)
  )
);

create unique index seasons_one_current_per_competition_idx
  on football.seasons(competition_id)
  where is_current;
create index seasons_ingest_scope_dates_idx
  on football.seasons(ingest_scope, starts_on, ends_on);

create table football.teams (
  id bigint generated always as identity primary key,
  source_id bigint not null unique,
  name text not null,
  short_name text,
  country_name text,
  country_code text,
  is_active boolean,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_source_id_positive check (source_id > 0),
  constraint teams_name_not_blank check (btrim(name) <> ''),
  constraint teams_short_name_not_blank check (
    short_name is null or btrim(short_name) <> ''
  ),
  constraint teams_country_name_not_blank check (
    country_name is null or btrim(country_name) <> ''
  ),
  constraint teams_country_code_format check (
    country_code is null or country_code ~ '^[A-Z]{2,3}$'
  )
);

create table football.venues (
  id bigint generated always as identity primary key,
  source_id bigint unique,
  name text not null,
  city text,
  country_name text,
  capacity integer,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_source_id_positive check (source_id is null or source_id > 0),
  constraint venues_name_not_blank check (btrim(name) <> ''),
  constraint venues_city_not_blank check (city is null or btrim(city) <> ''),
  constraint venues_country_not_blank check (
    country_name is null or btrim(country_name) <> ''
  ),
  constraint venues_capacity_positive check (capacity is null or capacity > 0)
);

create table football.referees (
  id bigint generated always as identity primary key,
  source_id bigint unique,
  name text not null,
  country_name text,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referees_source_id_positive check (source_id is null or source_id > 0),
  constraint referees_name_not_blank check (btrim(name) <> ''),
  constraint referees_country_not_blank check (
    country_name is null or btrim(country_name) <> ''
  )
);

create table football.matches (
  id bigint generated always as identity primary key,
  source_id bigint not null unique,
  competition_id bigint not null references football.competitions(id) on delete restrict,
  season_id bigint not null references football.seasons(id) on delete restrict,
  home_team_id bigint not null references football.teams(id) on delete restrict,
  away_team_id bigint not null references football.teams(id) on delete restrict,
  venue_id bigint references football.venues(id) on delete set null,
  referee_id bigint references football.referees(id) on delete set null,
  kickoff_at timestamptz not null,
  normalized_status text not null,
  status_detail text,
  round_name text,
  home_score smallint,
  away_score smallint,
  home_score_halftime smallint,
  away_score_halftime smallint,
  winner_team_id bigint references football.teams(id) on delete set null,
  source_sequence bigint,
  source_updated_at timestamptz,
  observed_at timestamptz not null,
  finalized_at timestamptz,
  fresh_until timestamptz,
  content_checksum text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_source_id_positive check (source_id > 0),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_status_check check (
    normalized_status in (
      'scheduled', 'live', 'finished', 'postponed', 'canceled', 'abandoned', 'unknown'
    )
  ),
  constraint matches_status_detail_not_blank check (
    status_detail is null or btrim(status_detail) <> ''
  ),
  constraint matches_round_not_blank check (round_name is null or btrim(round_name) <> ''),
  constraint matches_score_pair check ((home_score is null) = (away_score is null)),
  constraint matches_halftime_score_pair check (
    (home_score_halftime is null) = (away_score_halftime is null)
  ),
  constraint matches_scores_nonnegative check (
    (home_score is null or home_score >= 0) and
    (away_score is null or away_score >= 0) and
    (home_score_halftime is null or home_score_halftime >= 0) and
    (away_score_halftime is null or away_score_halftime >= 0)
  ),
  constraint matches_winner_participant check (
    winner_team_id is null or winner_team_id in (home_team_id, away_team_id)
  ),
  constraint matches_source_sequence_positive check (
    source_sequence is null or source_sequence >= 0
  ),
  constraint matches_checksum_not_blank check (btrim(content_checksum) <> ''),
  constraint matches_freshness_order check (
    fresh_until is null or fresh_until >= observed_at
  ),
  constraint matches_finalized_status check (
    finalized_at is null or normalized_status in ('finished', 'canceled', 'abandoned')
  )
);

create index matches_kickoff_competition_status_idx
  on football.matches(kickoff_at, competition_id, normalized_status, id);
create index matches_competition_season_kickoff_idx
  on football.matches(competition_id, season_id, kickoff_at, id);
create index matches_home_team_kickoff_idx
  on football.matches(home_team_id, kickoff_at desc, id);
create index matches_away_team_kickoff_idx
  on football.matches(away_team_id, kickoff_at desc, id);
create index matches_season_idx
  on football.matches(season_id, id);
create index matches_venue_idx
  on football.matches(venue_id, id)
  where venue_id is not null;
create index matches_referee_idx
  on football.matches(referee_id, id)
  where referee_id is not null;
create index matches_winner_idx
  on football.matches(winner_team_id, id)
  where winner_team_id is not null;
create index matches_active_kickoff_idx
  on football.matches(normalized_status, kickoff_at, id)
  where normalized_status in ('scheduled', 'live', 'postponed');
create index matches_stale_idx
  on football.matches(fresh_until, kickoff_at, id)
  where normalized_status in ('scheduled', 'live', 'postponed');

create table football.standing_snapshots (
  id bigint generated always as identity primary key,
  competition_id bigint not null references football.competitions(id) on delete restrict,
  season_id bigint not null references football.seasons(id) on delete restrict,
  effective_at timestamptz not null,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  content_checksum text not null,
  row_count integer not null,
  is_complete boolean not null,
  created_at timestamptz not null default now(),
  unique (season_id, content_checksum),
  constraint standing_snapshots_checksum_not_blank check (btrim(content_checksum) <> ''),
  constraint standing_snapshots_row_count_nonnegative check (row_count >= 0),
  constraint standing_snapshots_complete_nonempty check (not is_complete or row_count > 0)
);

create index standing_snapshots_current_idx
  on football.standing_snapshots(season_id, effective_at desc, id desc)
  where is_complete;
create index standing_snapshots_competition_effective_idx
  on football.standing_snapshots(competition_id, effective_at desc, id desc);

create table football.standing_rows (
  snapshot_id bigint not null references football.standing_snapshots(id) on delete cascade,
  team_id bigint not null references football.teams(id) on delete restrict,
  position smallint,
  played smallint,
  won smallint,
  drawn smallint,
  lost smallint,
  goals_for smallint,
  goals_against smallint,
  goal_difference smallint,
  points smallint,
  form text,
  observed_at timestamptz not null,
  primary key (snapshot_id, team_id),
  constraint standing_rows_position_positive check (position is null or position > 0),
  constraint standing_rows_counts_nonnegative check (
    (played is null or played >= 0) and
    (won is null or won >= 0) and
    (drawn is null or drawn >= 0) and
    (lost is null or lost >= 0) and
    (goals_for is null or goals_for >= 0) and
    (goals_against is null or goals_against >= 0)
  ),
  constraint standing_rows_results_coherent check (
    played is null or won is null or drawn is null or lost is null or
    played = won + drawn + lost
  ),
  constraint standing_rows_form_format check (form is null or form ~ '^[WDL]*$')
);

create index standing_rows_team_snapshot_idx
  on football.standing_rows(team_id, snapshot_id);
create index standing_rows_snapshot_position_idx
  on football.standing_rows(snapshot_id, position, team_id);

create table private.football_sync_runs (
  id bigint generated always as identity primary key,
  data_slice text not null,
  run_mode text not null,
  status text not null,
  source_read_only boolean not null default true,
  requests_limit integer,
  requests_started integer not null default 0,
  requests_completed integer not null default 0,
  rows_observed bigint not null default 0,
  rows_upserted bigint not null default 0,
  rows_unchanged bigint not null default 0,
  rows_rejected bigint not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint football_sync_runs_slice_check check (
    data_slice in ('DATA-1', 'DATA-2', 'DATA-3', 'DATA-4', 'DATA-5')
  ),
  constraint football_sync_runs_mode_check check (
    run_mode in ('plan', 'smoke', 'backfill', 'incremental', 'repair')
  ),
  constraint football_sync_runs_status_check check (
    status in ('planned', 'running', 'completed', 'failed', 'canceled')
  ),
  constraint football_sync_runs_request_counts check (
    requests_started >= 0 and requests_completed >= 0 and
    requests_completed <= requests_started and
    (requests_limit is null or (requests_limit >= 0 and requests_started <= requests_limit))
  ),
  constraint football_sync_runs_row_counts check (
    rows_observed >= 0 and rows_upserted >= 0 and rows_unchanged >= 0 and rows_rejected >= 0
  ),
  constraint football_sync_runs_error_code_not_blank check (
    error_code is null or btrim(error_code) <> ''
  ),
  constraint football_sync_runs_completion_check check (
    (status in ('completed', 'failed', 'canceled')) = (completed_at is not null)
  )
);

create index football_sync_runs_status_started_idx
  on private.football_sync_runs(status, started_at desc, id desc);

create table private.football_sync_jobs (
  id bigint generated always as identity primary key,
  run_id bigint references private.football_sync_runs(id) on delete set null,
  domain text not null,
  dedupe_key text not null,
  normalized_parameters jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  priority smallint not null default 0,
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 5,
  cursor_offset bigint,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain, dedupe_key),
  constraint football_sync_jobs_domain_check check (
    domain in ('competitions', 'seasons', 'teams', 'matches', 'standings')
  ),
  constraint football_sync_jobs_dedupe_not_blank check (btrim(dedupe_key) <> ''),
  constraint football_sync_jobs_parameters_object check (
    jsonb_typeof(normalized_parameters) = 'object'
  ),
  constraint football_sync_jobs_status_check check (
    status in ('pending', 'running', 'retry', 'completed', 'failed', 'canceled')
  ),
  constraint football_sync_jobs_attempts_check check (
    attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts
  ),
  constraint football_sync_jobs_cursor_nonnegative check (
    cursor_offset is null or cursor_offset >= 0
  ),
  constraint football_sync_jobs_lock_pair check (
    (locked_at is null) = (locked_by is null)
  ),
  constraint football_sync_jobs_locked_by_not_blank check (
    locked_by is null or btrim(locked_by) <> ''
  ),
  constraint football_sync_jobs_error_code_not_blank check (
    last_error_code is null or btrim(last_error_code) <> ''
  )
);

create index football_sync_jobs_claim_idx
  on private.football_sync_jobs(run_after, priority desc, id)
  where status in ('pending', 'retry');
create index football_sync_jobs_running_idx
  on private.football_sync_jobs(locked_at, id)
  where status = 'running';
create index football_sync_jobs_run_idx
  on private.football_sync_jobs(run_id, status, id);

create or replace function private.set_football_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger football_competitions_set_updated_at
before update on football.competitions
for each row execute function private.set_football_updated_at();

create trigger football_seasons_set_updated_at
before update on football.seasons
for each row execute function private.set_football_updated_at();

create trigger football_teams_set_updated_at
before update on football.teams
for each row execute function private.set_football_updated_at();

create trigger football_venues_set_updated_at
before update on football.venues
for each row execute function private.set_football_updated_at();

create trigger football_referees_set_updated_at
before update on football.referees
for each row execute function private.set_football_updated_at();

create trigger football_matches_set_updated_at
before update on football.matches
for each row execute function private.set_football_updated_at();

create trigger football_sync_jobs_set_updated_at
before update on private.football_sync_jobs
for each row execute function private.set_football_updated_at();

create or replace function private.claim_football_sync_jobs(
  p_worker text,
  p_limit integer default 25
)
returns table(
  job_key bigint,
  job_domain text,
  job_parameters jsonb,
  job_cursor_offset bigint,
  job_attempt integer
)
language sql
volatile
security definer
set search_path = ''
as $$
  with candidates as (
    select j.id
    from private.football_sync_jobs j
    where j.status in ('pending', 'retry')
      and j.run_after <= now()
      and j.attempt_count < j.max_attempts
    order by j.priority desc, j.run_after, j.id
    for update skip locked
    limit greatest(least(p_limit, 100), 1)
  )
  update private.football_sync_jobs j
  set
    status = 'running',
    attempt_count = j.attempt_count + 1,
    locked_at = now(),
    locked_by = p_worker,
    last_error_code = null
  from candidates c
  where j.id = c.id
  returning
    j.id,
    j.domain,
    j.normalized_parameters,
    j.cursor_offset,
    j.attempt_count::integer;
$$;

create view football.match_read_model
with (security_invoker = true)
as
select
  m.id,
  m.kickoff_at,
  m.normalized_status,
  m.status_detail,
  m.round_name,
  m.home_score,
  m.away_score,
  m.home_score_halftime,
  m.away_score_halftime,
  m.observed_at,
  m.fresh_until,
  c.id as competition_id,
  c.name as competition_name,
  s.id as season_id,
  s.name as season_name,
  ht.id as home_team_id,
  ht.name as home_team_name,
  at.id as away_team_id,
  at.name as away_team_name,
  v.id as venue_id,
  v.name as venue_name,
  r.id as referee_id,
  r.name as referee_name
from football.matches m
join football.competitions c on c.id = m.competition_id
join football.seasons s on s.id = m.season_id
join football.teams ht on ht.id = m.home_team_id
join football.teams at on at.id = m.away_team_id
left join football.venues v on v.id = m.venue_id
left join football.referees r on r.id = m.referee_id;

create view football.current_standing_rows
with (security_invoker = true)
as
select
  ss.competition_id,
  ss.season_id,
  ss.effective_at,
  sr.team_id,
  t.name as team_name,
  sr.position,
  sr.played,
  sr.won,
  sr.drawn,
  sr.lost,
  sr.goals_for,
  sr.goals_against,
  sr.goal_difference,
  sr.points,
  sr.form,
  sr.observed_at
from football.standing_rows sr
join football.standing_snapshots ss on ss.id = sr.snapshot_id
join football.teams t on t.id = sr.team_id
where ss.id = (
  select latest.id
  from football.standing_snapshots latest
  where latest.season_id = ss.season_id
    and latest.is_complete
  order by latest.effective_at desc, latest.id desc
  limit 1
);

alter table football.competitions enable row level security;
alter table football.seasons enable row level security;
alter table football.teams enable row level security;
alter table football.venues enable row level security;
alter table football.referees enable row level security;
alter table football.matches enable row level security;
alter table football.standing_snapshots enable row level security;
alter table football.standing_rows enable row level security;
alter table private.football_sync_runs enable row level security;
alter table private.football_sync_jobs enable row level security;

revoke all on all tables in schema football from public, anon, authenticated;
revoke all on all sequences in schema football from public, anon, authenticated;
revoke execute on function private.set_football_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function private.claim_football_sync_jobs(text, integer)
  from public, anon, authenticated, service_role;

grant usage on schema football to service_role;
grant select, insert, update, delete on all tables in schema football to service_role;
grant usage, select on all sequences in schema football to service_role;
grant select, insert, update, delete on private.football_sync_runs,
  private.football_sync_jobs to service_role;
grant usage, select on sequence private.football_sync_runs_id_seq,
  private.football_sync_jobs_id_seq to service_role;
grant execute on function private.claim_football_sync_jobs(text, integer) to service_role;

commit;
