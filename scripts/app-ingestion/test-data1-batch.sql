\set ON_ERROR_STOP on

begin;

do $$
declare
  v_initial jsonb := $batch$
  {
    "observedAt": "2026-08-09T08:00:00Z",
    "competitions": [
      {
        "sourceId": 930000001,
        "name": "Synthetic Batch League",
        "countryName": "Synthetic Country",
        "countryCode": "TST",
        "competitionKind": "regular_league",
        "gender": "men",
        "active": true,
        "observedAt": "2026-08-09T08:00:00Z",
        "sourceUpdatedAt": null,
        "checksum": "batch-competition-v1"
      }
    ],
    "seasons": [
      {
        "sourceId": 930000002,
        "competitionSourceId": 930000001,
        "name": "2026/27",
        "seasonKind": "cross_year",
        "startsOn": "2026-07-01",
        "endsOn": "2027-06-30",
        "current": true,
        "ingestScope": "product_current",
        "observedAt": "2026-08-09T08:00:00Z",
        "sourceUpdatedAt": null,
        "checksum": "batch-season-v1"
      }
    ],
    "teams": [
      {
        "sourceId": 930000003,
        "name": "Synthetic Batch Home",
        "shortName": null,
        "countryName": null,
        "countryCode": null,
        "active": null,
        "observedAt": "2026-08-09T08:00:00Z",
        "sourceUpdatedAt": null,
        "checksum": "batch-team-home-v1"
      },
      {
        "sourceId": 930000004,
        "name": "Synthetic Batch Away",
        "shortName": null,
        "countryName": null,
        "countryCode": null,
        "active": null,
        "observedAt": "2026-08-09T08:00:00Z",
        "sourceUpdatedAt": null,
        "checksum": "batch-team-away-v1"
      }
    ],
    "matches": [
      {
        "sourceId": 930000005,
        "competitionSourceId": 930000001,
        "seasonSourceId": 930000002,
        "homeTeamSourceId": 930000003,
        "awayTeamSourceId": 930000004,
        "kickoffAt": "2026-08-09T18:00:00Z",
        "status": "scheduled",
        "statusDetail": "scheduled",
        "roundName": "1",
        "homeScore": null,
        "awayScore": null,
        "sourceSequence": 1,
        "sourceUpdatedAt": null,
        "observedAt": "2026-08-09T08:00:00Z",
        "freshUntil": "2026-08-09T14:00:00Z",
        "checksum": "batch-match-v1"
      }
    ],
    "standings": [
      {
        "competitionSourceId": 930000001,
        "seasonSourceId": 930000002,
        "effectiveAt": "2026-08-09T08:00:00Z",
        "observedAt": "2026-08-09T08:00:00Z",
        "sourceUpdatedAt": null,
        "checksum": "batch-standing-v1",
        "rowCount": 2,
        "complete": true,
        "rows": [
          {
            "teamSourceId": 930000003,
            "position": 1,
            "played": 0,
            "won": 0,
            "drawn": 0,
            "lost": 0,
            "goalsFor": 0,
            "goalsAgainst": 0,
            "goalDifference": 0,
            "points": 0,
            "form": null,
            "observedAt": "2026-08-09T08:00:00Z"
          },
          {
            "teamSourceId": 930000004,
            "position": 2,
            "played": null,
            "won": null,
            "drawn": null,
            "lost": null,
            "goalsFor": null,
            "goalsAgainst": null,
            "goalDifference": null,
            "points": null,
            "form": null,
            "observedAt": "2026-08-09T08:00:00Z"
          }
        ]
      }
    ]
  }
  $batch$::jsonb;
  v_stale jsonb;
  v_newer jsonb;
  v_result jsonb;
  v_count bigint;
begin
  v_result := private.apply_football_data1_batch(v_initial);
  if (v_result->>'snapshotsInserted')::integer <> 1
    or (v_result->>'standingRowsInserted')::integer <> 2
  then
    raise exception 'DATA-1 initial batch counters failed';
  end if;

  v_result := private.apply_football_data1_batch(v_initial);
  if (v_result->>'snapshotsInserted')::integer <> 0
    or (v_result->>'standingRowsInserted')::integer <> 0
  then
    raise exception 'DATA-1 replay duplicated standing snapshot';
  end if;

  select count(*) into v_count from football.matches;
  if v_count <> 1 then
    raise exception 'DATA-1 replay duplicated match';
  end if;
  select count(*) into v_count from football.standing_snapshots;
  if v_count <> 1 then
    raise exception 'DATA-1 replay duplicated standing snapshot row';
  end if;

  v_stale := jsonb_set(
    jsonb_set(
      jsonb_set(v_initial, '{observedAt}', '"2026-08-08T08:00:00Z"'::jsonb),
      '{matches,0,observedAt}',
      '"2026-08-08T08:00:00Z"'::jsonb
    ),
    '{matches,0,status}',
    '"finished"'::jsonb
  );
  v_stale := jsonb_set(v_stale, '{matches,0,sourceSequence}', '0'::jsonb);
  v_stale := jsonb_set(v_stale, '{matches,0,homeScore}', '9'::jsonb);
  v_stale := jsonb_set(v_stale, '{matches,0,awayScore}', '9'::jsonb);
  v_stale := jsonb_set(v_stale, '{matches,0,checksum}', '"stale-change"'::jsonb);
  perform private.apply_football_data1_batch(v_stale);

  if (select normalized_status <> 'scheduled' or home_score is not null from football.matches) then
    raise exception 'DATA-1 stale match update was accepted';
  end if;

  v_newer := jsonb_set(
    jsonb_set(
      jsonb_set(v_initial, '{observedAt}', '"2026-08-10T08:00:00Z"'::jsonb),
      '{matches,0,observedAt}',
      '"2026-08-10T08:00:00Z"'::jsonb
    ),
    '{matches,0,status}',
    '"finished"'::jsonb
  );
  v_newer := jsonb_set(v_newer, '{matches,0,sourceSequence}', '2'::jsonb);
  v_newer := jsonb_set(v_newer, '{matches,0,homeScore}', '2'::jsonb);
  v_newer := jsonb_set(v_newer, '{matches,0,awayScore}', '1'::jsonb);
  v_newer := jsonb_set(v_newer, '{matches,0,freshUntil}', '"2026-08-11T08:00:00Z"'::jsonb);
  v_newer := jsonb_set(v_newer, '{matches,0,checksum}', '"newer-change"'::jsonb);
  perform private.apply_football_data1_batch(v_newer);

  if not (select normalized_status = 'finished' and home_score = 2 and away_score = 1
          from football.matches) then
    raise exception 'DATA-1 newer match update was not accepted';
  end if;

  if has_function_privilege('anon', 'private.apply_football_data1_batch(jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.apply_football_data1_batch(jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'private.apply_football_data1_batch(jsonb)', 'EXECUTE')
  then
    raise exception 'DATA-1 batch function privileges failed';
  end if;
end;
$$;

rollback;
