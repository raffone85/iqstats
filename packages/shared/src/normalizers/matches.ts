import type { DataEnvelope } from "../contracts/common.ts";
import type {
  CompetitionSummary,
  MatchDetail,
  MatchList,
  MatchSection,
  MatchStatus,
  MatchSummary,
  SeasonSummary,
} from "../contracts/matches.ts";
import {
  available,
  booleanValue,
  finiteInteger,
  finiteNumber,
  isRecord,
  isoDateTime,
  makeAvailability,
  makeCoverage,
  makeProvenance,
  nonEmptyString,
  stringId,
  unavailable,
  type UnknownRecord,
} from "./common.ts";

export interface MatchNormalizationContext {
  readonly capturedAt: string;
  readonly competitions: Readonly<Record<string, CompetitionSummary>>;
}

const sections: readonly MatchSection[] = [
  "odds",
  "statistics",
  "form",
  "standings",
  "headToHead",
  "context",
  "signals",
];

function normalizedStatus(value: unknown): MatchStatus {
  const raw = isRecord(value) ? nonEmptyString(value.name) : nonEmptyString(value);
  switch (raw?.toLowerCase().replaceAll("-", "").replaceAll("_", "")) {
    case "notstarted":
    case "scheduled":
    case "upcoming":
      return "not_started";
    case "live":
    case "inprogress":
      return "live";
    case "finished":
    case "final":
      return "finished";
    case "postponed":
      return "postponed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function normalizeSeason(value: unknown): SeasonSummary | null {
  if (!isRecord(value)) return null;
  const id = stringId(value.id);
  const name = nonEmptyString(value.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    year: finiteInteger(value.year),
    startsOn: nonEmptyString(value.start_date),
    endsOn: nonEmptyString(value.end_date),
    current: booleanValue(value.is_current),
  };
}

export function normalizeCompetitionCatalog(
  payload: unknown,
  capturedAt: string,
): DataEnvelope<readonly CompetitionSummary[]> {
  const provenance = makeProvenance(capturedAt);
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["results"]),
      provenance,
      calculation: null,
    };
  }

  const missing: string[] = [];
  const items: CompetitionSummary[] = [];
  payload.results.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      missing.push(`results[${index}]`);
      return;
    }
    const id = stringId(candidate.id);
    const name = nonEmptyString(candidate.name);
    if (!id || !name) {
      missing.push(`results[${index}].id_or_name`);
      return;
    }
    items.push({
      id,
      name,
      country: nonEmptyString(candidate.country),
      active: booleanValue(candidate.is_active),
      currentSeason: normalizeSeason(candidate.current_season),
    });
  });

  return {
    data: items,
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "validation_failed",
      missing,
      makeCoverage(items.length, payload.results.length),
    ),
    provenance,
    calculation: null,
  };
}

export function indexCompetitions(
  competitions: readonly CompetitionSummary[],
): Readonly<Record<string, CompetitionSummary>> {
  return Object.fromEntries(competitions.map((competition) => [competition.id, competition]));
}

function sectionAvailability(raw: UnknownRecord): Readonly<Record<MatchSection, ReturnType<typeof makeAvailability>>> {
  const result = {} as Record<MatchSection, ReturnType<typeof makeAvailability>>;
  for (const section of sections) {
    const hasHeadToHead = section === "headToHead" && isRecord(raw.head_to_head);
    result[section] = hasHeadToHead
      ? makeAvailability("available", null)
      : makeAvailability("unavailable", "not_captured");
  }
  return result;
}

function normalizedRound(raw: UnknownRecord): string | null {
  return nonEmptyString(raw.round_name) ??
    (finiteInteger(raw.round_number) !== null ? String(raw.round_number) : null);
}

function normalizeSummary(
  raw: unknown,
  context: MatchNormalizationContext,
): MatchSummary | null {
  if (!isRecord(raw)) return null;
  const id = stringId(raw.id);
  const leagueId = stringId(raw.league_id);
  const homeTeamId = stringId(raw.home_team_id);
  const awayTeamId = stringId(raw.away_team_id);
  const homeTeamName = nonEmptyString(raw.home_team);
  const awayTeamName = nonEmptyString(raw.away_team);
  const kickoffAt = isoDateTime(raw.event_date);
  if (
    !id ||
    !leagueId ||
    !homeTeamId ||
    !awayTeamId ||
    !homeTeamName ||
    !awayTeamName ||
    !kickoffAt
  ) {
    return null;
  }

  const competition = context.competitions[leagueId];
  if (!competition) return null;
  const status = normalizedStatus(raw.status);
  const homeScore = finiteNumber(raw.home_score);
  const awayScore = finiteNumber(raw.away_score);
  const score =
    homeScore !== null && awayScore !== null
      ? available({ home: homeScore, away: awayScore })
      : unavailable<{ readonly home: number; readonly away: number }>(
          status === "not_started" ? "not_applicable" : "not_captured",
        );

  return {
    id,
    kickoffAt,
    status,
    competition,
    seasonId: stringId(raw.season_id),
    refereeId: stringId(raw.referee_id),
    homeTeam: { id: homeTeamId, name: homeTeamName },
    awayTeam: { id: awayTeamId, name: awayTeamName },
    score,
    round: normalizedRound(raw),
    sectionAvailability: sectionAvailability(raw),
    availability: makeAvailability("available", null),
    provenance: makeProvenance(
      context.capturedAt,
      isoDateTime(raw.last_updated) ?? isoDateTime(raw.updated_at),
    ),
  };
}

export function normalizeMatchList(
  payload: unknown,
  context: MatchNormalizationContext,
): DataEnvelope<MatchList> {
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
  const items: MatchSummary[] = [];
  payload.results.forEach((raw, index) => {
    const normalized = normalizeSummary(raw, context);
    if (normalized) items.push(normalized);
    else missing.push(`results[${index}]`);
  });
  const declaredTotal = finiteInteger(payload.count);

  return {
    data: {
      items,
      total: declaredTotal ?? items.length,
      hasNextPage: payload.next !== null && payload.next !== undefined,
      hasPreviousPage: payload.previous !== null && payload.previous !== undefined,
    },
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "validation_failed",
      missing,
      makeCoverage(items.length, payload.results.length),
    ),
    provenance,
    calculation: null,
  };
}

export function normalizeMatchDetail(
  payload: unknown,
  context: MatchNormalizationContext,
): DataEnvelope<MatchDetail> {
  const provenance = makeProvenance(context.capturedAt);
  const summary = normalizeSummary(payload, context);
  if (!summary || !isRecord(payload)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["match"]),
      provenance,
      calculation: null,
    };
  }

  return {
    data: {
      ...summary,
      seasonId: stringId(payload.season_id),
      venueId: stringId(payload.venue_id),
      refereeId: stringId(payload.referee_id),
      currentMinute: finiteInteger(payload.current_minute),
      neutralGround: booleanValue(payload.is_neutral_ground),
      localDerby: booleanValue(payload.is_local_derby),
    },
    availability: makeAvailability("available", null),
    provenance: summary.provenance,
    calculation: null,
  };
}

/**
 * `leagues/{id}/seasons/` usa la chiave `seasons`, non `results`: le stagioni si
 * risolvono da qui e non si scrivono mai a mano.
 */
export function normalizeSeasonCatalog(
  payload: unknown,
  capturedAt: string,
): DataEnvelope<readonly SeasonSummary[]> {
  const provenance = makeProvenance(capturedAt);
  if (!isRecord(payload) || !Array.isArray(payload.seasons)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["seasons"]),
      provenance,
      calculation: null,
    };
  }

  const missing: string[] = [];
  const items: SeasonSummary[] = [];
  payload.seasons.forEach((candidate, index) => {
    const season = normalizeSeason(candidate);
    if (season) items.push(season);
    else missing.push(`seasons[${index}]`);
  });

  return {
    data: items,
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "validation_failed",
      missing,
      makeCoverage(items.length, payload.seasons.length),
    ),
    provenance,
    calculation: null,
  };
}
