-- DATA-1 scrive anche il punteggio all'intervallo.
--
-- `matchRecord` in scripts/app-ingestion/data1-contracts.mjs leggeva dieci campi
-- della gara e saltava `home_score_ht` / `away_score_ht`, che la lista
-- `/api/v2/events/` porta gia'. La funzione del 9 agosto non elencava le due
-- colonne, quindi anche con il lotto corretto non le avrebbe scritte.
--
-- Oggi questo percorso scrive solo sul Postgres locale e sul livello dati remoto
-- non e' mai passato: misurato il 3 settembre 2026, 10.944 righe su 10.944 portano
-- la firma del motore. Non ripara niente adesso, ma il giorno in cui DATA-1
-- alimentera' il remoto senza queste colonne ricreerebbe il buco chiuso il 2
-- settembre.
--
-- La migrazione del 9 agosto non viene modificata sul posto: la funzione si
-- ricrea qui, e il resto del corpo e' identico a quello.

begin;

create or replace function private.apply_football_data1_batch(p_batch jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_competitions integer := 0;
  v_seasons integer := 0;
  v_teams integer := 0;
  v_matches integer := 0;
  v_snapshots integer := 0;
  v_standing_rows integer := 0;
  v_snapshot jsonb;
  v_snapshot_id bigint;
  v_competition_id bigint;
  v_season_id bigint;
  v_expected_rows integer;
  v_inserted_rows integer;
begin
  if jsonb_typeof(p_batch) <> 'object' then
    raise exception 'DATA-1 batch must be an object' using errcode = '22023';
  end if;
  if (p_batch->>'observedAt')::timestamptz is null then
    raise exception 'DATA-1 observedAt is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_batch->'competitions') <> 'array'
    or jsonb_typeof(p_batch->'seasons') <> 'array'
    or jsonb_typeof(p_batch->'teams') <> 'array'
    or jsonb_typeof(p_batch->'matches') <> 'array'
    or jsonb_typeof(p_batch->'standings') <> 'array'
  then
    raise exception 'DATA-1 batch arrays are required' using errcode = '22023';
  end if;

  insert into football.competitions(
    source_id,
    name,
    country_name,
    country_code,
    competition_kind,
    gender,
    is_active,
    observed_at,
    source_updated_at,
    content_checksum
  )
  select
    x."sourceId",
    x.name,
    x."countryName",
    x."countryCode",
    x."competitionKind",
    x.gender,
    x.active,
    x."observedAt",
    x."sourceUpdatedAt",
    x.checksum
  from jsonb_to_recordset(p_batch->'competitions') as x(
    "sourceId" bigint,
    name text,
    "countryName" text,
    "countryCode" text,
    "competitionKind" text,
    gender text,
    active boolean,
    "observedAt" timestamptz,
    "sourceUpdatedAt" timestamptz,
    checksum text
  )
  on conflict (source_id) do update set
    name = excluded.name,
    country_name = excluded.country_name,
    country_code = excluded.country_code,
    competition_kind = excluded.competition_kind,
    gender = excluded.gender,
    is_active = excluded.is_active,
    observed_at = excluded.observed_at,
    source_updated_at = excluded.source_updated_at,
    content_checksum = excluded.content_checksum
  where coalesce(excluded.source_updated_at, excluded.observed_at)
    >= coalesce(football.competitions.source_updated_at, football.competitions.observed_at);
  get diagnostics v_competitions = row_count;

  update football.seasons existing
  set
    is_current = false,
    ingest_scope = 'held'
  from jsonb_to_recordset(p_batch->'seasons') as incoming(
    "sourceId" bigint,
    "competitionSourceId" bigint,
    current boolean
  )
  join football.competitions competition
    on competition.source_id = incoming."competitionSourceId"
  where incoming.current
    and existing.competition_id = competition.id
    and existing.source_id <> incoming."sourceId"
    and existing.is_current;

  insert into football.seasons(
    competition_id,
    source_id,
    name,
    season_kind,
    starts_on,
    ends_on,
    is_current,
    ingest_scope,
    observed_at,
    source_updated_at,
    content_checksum
  )
  select
    competition.id,
    x."sourceId",
    x.name,
    x."seasonKind",
    x."startsOn",
    x."endsOn",
    x.current,
    x."ingestScope",
    x."observedAt",
    x."sourceUpdatedAt",
    x.checksum
  from jsonb_to_recordset(p_batch->'seasons') as x(
    "sourceId" bigint,
    "competitionSourceId" bigint,
    name text,
    "seasonKind" text,
    "startsOn" date,
    "endsOn" date,
    current boolean,
    "ingestScope" text,
    "observedAt" timestamptz,
    "sourceUpdatedAt" timestamptz,
    checksum text
  )
  join football.competitions competition
    on competition.source_id = x."competitionSourceId"
  on conflict (competition_id, source_id) do update set
    name = excluded.name,
    season_kind = excluded.season_kind,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    is_current = excluded.is_current,
    ingest_scope = excluded.ingest_scope,
    observed_at = excluded.observed_at,
    source_updated_at = excluded.source_updated_at,
    content_checksum = excluded.content_checksum
  where coalesce(excluded.source_updated_at, excluded.observed_at)
    >= coalesce(football.seasons.source_updated_at, football.seasons.observed_at);
  get diagnostics v_seasons = row_count;

  if (select count(*) from jsonb_array_elements(p_batch->'seasons'))
    <> (select count(*) from jsonb_to_recordset(p_batch->'seasons') as x(
      "competitionSourceId" bigint
    ) join football.competitions c on c.source_id = x."competitionSourceId")
  then
    raise exception 'DATA-1 season competition reference missing' using errcode = '23503';
  end if;

  insert into football.teams(
    source_id,
    name,
    short_name,
    country_name,
    country_code,
    is_active,
    observed_at,
    source_updated_at,
    content_checksum
  )
  select
    x."sourceId",
    x.name,
    x."shortName",
    x."countryName",
    x."countryCode",
    x.active,
    x."observedAt",
    x."sourceUpdatedAt",
    x.checksum
  from jsonb_to_recordset(p_batch->'teams') as x(
    "sourceId" bigint,
    name text,
    "shortName" text,
    "countryName" text,
    "countryCode" text,
    active boolean,
    "observedAt" timestamptz,
    "sourceUpdatedAt" timestamptz,
    checksum text
  )
  on conflict (source_id) do update set
    name = excluded.name,
    short_name = coalesce(excluded.short_name, football.teams.short_name),
    country_name = coalesce(excluded.country_name, football.teams.country_name),
    country_code = coalesce(excluded.country_code, football.teams.country_code),
    is_active = coalesce(excluded.is_active, football.teams.is_active),
    observed_at = excluded.observed_at,
    source_updated_at = coalesce(excluded.source_updated_at, football.teams.source_updated_at),
    content_checksum = excluded.content_checksum
  where coalesce(excluded.source_updated_at, excluded.observed_at)
    >= coalesce(football.teams.source_updated_at, football.teams.observed_at);
  get diagnostics v_teams = row_count;

  if exists (
    select 1
    from jsonb_to_recordset(p_batch->'matches') as x(
      "competitionSourceId" bigint,
      "seasonSourceId" bigint,
      "homeTeamSourceId" bigint,
      "awayTeamSourceId" bigint
    )
    left join football.competitions competition
      on competition.source_id = x."competitionSourceId"
    left join football.seasons season
      on season.competition_id = competition.id
      and season.source_id = x."seasonSourceId"
    left join football.teams home_team
      on home_team.source_id = x."homeTeamSourceId"
    left join football.teams away_team
      on away_team.source_id = x."awayTeamSourceId"
    where competition.id is null
      or season.id is null
      or home_team.id is null
      or away_team.id is null
  ) then
    raise exception 'DATA-1 match reference missing' using errcode = '23503';
  end if;

  insert into football.matches(
    source_id,
    competition_id,
    season_id,
    home_team_id,
    away_team_id,
    kickoff_at,
    normalized_status,
    status_detail,
    round_name,
    home_score,
    away_score,
    home_score_halftime,
    away_score_halftime,
    source_sequence,
    source_updated_at,
    observed_at,
    fresh_until,
    content_checksum
  )
  select
    x."sourceId",
    competition.id,
    season.id,
    home_team.id,
    away_team.id,
    x."kickoffAt",
    x.status,
    x."statusDetail",
    x."roundName",
    x."homeScore",
    x."awayScore",
    x."homeScoreHalftime",
    x."awayScoreHalftime",
    x."sourceSequence",
    x."sourceUpdatedAt",
    x."observedAt",
    x."freshUntil",
    x.checksum
  from jsonb_to_recordset(p_batch->'matches') as x(
    "sourceId" bigint,
    "competitionSourceId" bigint,
    "seasonSourceId" bigint,
    "homeTeamSourceId" bigint,
    "awayTeamSourceId" bigint,
    "kickoffAt" timestamptz,
    status text,
    "statusDetail" text,
    "roundName" text,
    "homeScore" smallint,
    "awayScore" smallint,
    "homeScoreHalftime" smallint,
    "awayScoreHalftime" smallint,
    "sourceSequence" bigint,
    "sourceUpdatedAt" timestamptz,
    "observedAt" timestamptz,
    "freshUntil" timestamptz,
    checksum text
  )
  join football.competitions competition
    on competition.source_id = x."competitionSourceId"
  join football.seasons season
    on season.competition_id = competition.id
    and season.source_id = x."seasonSourceId"
  join football.teams home_team
    on home_team.source_id = x."homeTeamSourceId"
  join football.teams away_team
    on away_team.source_id = x."awayTeamSourceId"
  on conflict (source_id) do update set
    competition_id = excluded.competition_id,
    season_id = excluded.season_id,
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    kickoff_at = excluded.kickoff_at,
    normalized_status = excluded.normalized_status,
    status_detail = excluded.status_detail,
    round_name = excluded.round_name,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    home_score_halftime = excluded.home_score_halftime,
    away_score_halftime = excluded.away_score_halftime,
    source_sequence = excluded.source_sequence,
    source_updated_at = excluded.source_updated_at,
    observed_at = excluded.observed_at,
    fresh_until = excluded.fresh_until,
    content_checksum = excluded.content_checksum
  where case
    when excluded.source_sequence is not null and football.matches.source_sequence is not null
      then excluded.source_sequence >= football.matches.source_sequence
    else coalesce(excluded.source_updated_at, excluded.observed_at)
      >= coalesce(football.matches.source_updated_at, football.matches.observed_at)
  end;
  get diagnostics v_matches = row_count;

  for v_snapshot in
    select value from jsonb_array_elements(p_batch->'standings')
  loop
    if jsonb_typeof(v_snapshot->'rows') <> 'array' then
      raise exception 'DATA-1 standing rows must be an array' using errcode = '22023';
    end if;
    v_expected_rows := jsonb_array_length(v_snapshot->'rows');
    if (v_snapshot->>'rowCount')::integer <> v_expected_rows then
      raise exception 'DATA-1 standing row count mismatch' using errcode = '22023';
    end if;

    select competition.id, season.id
      into v_competition_id, v_season_id
    from football.competitions competition
    join football.seasons season on season.competition_id = competition.id
    where competition.source_id = (v_snapshot->>'competitionSourceId')::bigint
      and season.source_id = (v_snapshot->>'seasonSourceId')::bigint;
    if v_competition_id is null or v_season_id is null then
      raise exception 'DATA-1 standing season reference missing' using errcode = '23503';
    end if;
    if exists (
      select 1
      from jsonb_to_recordset(v_snapshot->'rows') as row_data("teamSourceId" bigint)
      left join football.teams team on team.source_id = row_data."teamSourceId"
      where team.id is null
    ) then
      raise exception 'DATA-1 standing team reference missing' using errcode = '23503';
    end if;

    v_snapshot_id := null;
    insert into football.standing_snapshots(
      competition_id,
      season_id,
      effective_at,
      observed_at,
      source_updated_at,
      content_checksum,
      row_count,
      is_complete
    ) values (
      v_competition_id,
      v_season_id,
      (v_snapshot->>'effectiveAt')::timestamptz,
      (v_snapshot->>'observedAt')::timestamptz,
      (v_snapshot->>'sourceUpdatedAt')::timestamptz,
      v_snapshot->>'checksum',
      v_expected_rows,
      (v_snapshot->>'complete')::boolean
    )
    on conflict (season_id, content_checksum) do nothing
    returning id into v_snapshot_id;

    if v_snapshot_id is not null then
      v_snapshots := v_snapshots + 1;
      insert into football.standing_rows(
        snapshot_id,
        team_id,
        position,
        played,
        won,
        drawn,
        lost,
        goals_for,
        goals_against,
        goal_difference,
        points,
        form,
        observed_at
      )
      select
        v_snapshot_id,
        team.id,
        row_data.position,
        row_data.played,
        row_data.won,
        row_data.drawn,
        row_data.lost,
        row_data."goalsFor",
        row_data."goalsAgainst",
        row_data."goalDifference",
        row_data.points,
        row_data.form,
        row_data."observedAt"
      from jsonb_to_recordset(v_snapshot->'rows') as row_data(
        "teamSourceId" bigint,
        position smallint,
        played smallint,
        won smallint,
        drawn smallint,
        lost smallint,
        "goalsFor" smallint,
        "goalsAgainst" smallint,
        "goalDifference" smallint,
        points smallint,
        form text,
        "observedAt" timestamptz
      )
      join football.teams team on team.source_id = row_data."teamSourceId";
      get diagnostics v_inserted_rows = row_count;
      if v_inserted_rows <> v_expected_rows then
        raise exception 'DATA-1 standing insert incomplete' using errcode = '23503';
      end if;
      v_standing_rows := v_standing_rows + v_inserted_rows;
    end if;
  end loop;

  return jsonb_build_object(
    'competitionsAccepted', v_competitions,
    'seasonsAccepted', v_seasons,
    'teamsAccepted', v_teams,
    'matchesAccepted', v_matches,
    'snapshotsInserted', v_snapshots,
    'standingRowsInserted', v_standing_rows
  );
end;
$$;

revoke execute on function private.apply_football_data1_batch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.apply_football_data1_batch(jsonb) to service_role;

commit;
