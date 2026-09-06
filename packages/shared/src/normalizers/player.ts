import type { DataEnvelope } from "../contracts/common.ts";
import type { PlayerProfile, PlayerStatsBlock } from "../contracts/player.ts";
import {
  PLAYER_METRIC_KEYS,
  type PlayerMatchStats,
  type PlayerMetricKey,
} from "../contracts/team.ts";
import {
  finiteInteger,
  finiteNumber,
  isRecord,
  makeAvailability,
  makeCoverage,
  makeProvenance,
  nonEmptyString,
  stringId,
} from "./common.ts";
import { normalizeSquadMember, playerMetricFields } from "./team.ts";

export interface PlayerNormalizationContext {
  readonly capturedAt: string;
}

/**
 * `players/{id}/` porta l'anagrafica della rosa più sette campi propri. I derivati della
 * fonte non entrano: il contratto non li dichiara, quindi non arrivano in pagina.
 */
export function normalizePlayerProfile(
  payload: unknown,
  context: PlayerNormalizationContext,
): DataEnvelope<PlayerProfile> {
  const provenance = makeProvenance(context.capturedAt);
  const member = normalizeSquadMember(payload);
  if (!isRecord(payload) || !member) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["player"]),
      provenance,
      calculation: null,
    };
  }

  const team = isRecord(payload.current_team) ? payload.current_team : null;
  const teamId = team ? stringId(team.id) : null;
  const teamName = team ? nonEmptyString(team.name) : null;

  return {
    data: {
      ...member,
      specificPosition: nonEmptyString(payload.specific_position),
      heightCm: finiteInteger(payload.height_cm),
      preferredFoot: nonEmptyString(payload.preferred_foot),
      contractUntil: nonEmptyString(payload.contract_until),
      currentTeam: teamId && teamName ? { id: teamId, name: teamName } : null,
      availabilityStatus: nonEmptyString(payload.availability),
      injuryType: nonEmptyString(payload.injury_type),
      injuryExpectedReturn: nonEmptyString(payload.injury_expected_return),
    },
    availability: makeAvailability("available", null, []),
    provenance,
    calculation: null,
  };
}

/**
 * Una pagina di `players/{id}/stats/`: le stesse righe di `events/{id}/player-stats/`
 * viste dalla parte del giocatore, quindi con `team_id` che cambia lungo la carriera.
 * La fonte pagina a cinquanta e **taglia a duecento** qualunque `limit` più alto:
 * `count` resta il totale vero, e serve a dichiarare quanto manca.
 */
export function normalizePlayerStatsPage(
  payload: unknown,
  context: PlayerNormalizationContext,
): DataEnvelope<{ readonly rows: readonly PlayerMatchStats[]; readonly declared: number }> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["results"]),
      provenance,
      calculation: null,
    };
  }

  const missing: string[] = [];
  const rows: PlayerMatchStats[] = [];
  payload.results.forEach((raw, index) => {
    if (!isRecord(raw)) {
      missing.push(`results[${index}]`);
      return;
    }
    const eventId = stringId(raw.event_id);
    const playerId = stringId(raw.player_id);
    const teamId = stringId(raw.team_id);
    if (!eventId || !playerId || !teamId) {
      missing.push(`results[${index}].event_id`);
      return;
    }
    const metrics = {} as Record<PlayerMetricKey, number | null>;
    for (const key of PLAYER_METRIC_KEYS) {
      metrics[key] = finiteNumber(raw[playerMetricFields[key]]);
    }
    rows.push({
      eventId,
      playerId,
      teamId,
      minutesPlayed: finiteInteger(raw.minutes_played),
      rating: finiteNumber(raw.rating),
      metrics,
    });
  });

  const declared = finiteInteger(payload.count) ?? rows.length;
  return {
    data: { rows, declared },
    availability: makeAvailability(
      rows.length === 0 ? "unavailable" : missing.length === 0 ? "available" : "partial",
      rows.length === 0 ? "not_captured" : missing.length === 0 ? null : "validation_failed",
      missing,
      makeCoverage(rows.length, payload.results.length),
    ),
    provenance,
    calculation: null,
  };
}

/** Somme del blocco. Una metrica assente in ogni riga resta `null`: mai uno zero al suo posto. */
export function aggregatePlayerStats(
  rows: readonly PlayerMatchStats[],
  declared: number,
): PlayerStatsBlock {
  const totals = {} as Record<PlayerMetricKey, number | null>;
  for (const key of PLAYER_METRIC_KEYS) {
    const values = rows
      .map((row) => row.metrics[key])
      .filter((value): value is number => value !== null);
    totals[key] = values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  }

  const perTeam = new Map<string, number>();
  for (const row of rows) perTeam.set(row.teamId, (perTeam.get(row.teamId) ?? 0) + 1);

  return {
    rows: rows.length,
    declared,
    appearances: rows.filter((row) => (row.minutesPlayed ?? 0) > 0).length,
    minutes: rows.reduce((sum, row) => sum + (row.minutesPlayed ?? 0), 0),
    teams: [...perTeam.entries()]
      .map(([teamId, count]) => ({ teamId, rows: count }))
      .sort((left, right) => right.rows - left.rows),
    totals,
  };
}
