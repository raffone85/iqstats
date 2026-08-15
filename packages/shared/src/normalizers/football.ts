import type { DataEnvelope } from "../contracts/common.ts";
import type {
  HeadToHeadRecentMatch,
  HeadToHeadSample,
  ObservedMatchStats,
  ObservedMatchStatsCollection,
  ObservedMetric,
  ObservedMetricValues,
  StandingEntry,
  StandingTable,
  TeamSide,
} from "../contracts/football.ts";
import {
  available,
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

export interface StatsNormalizationContext {
  readonly matchId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly capturedAt: string;
}

export interface FootballNormalizationContext {
  readonly capturedAt: string;
}

export interface HeadToHeadNormalizationContext extends FootballNormalizationContext {
  readonly matchId: string;
}

const metricFields: Readonly<Record<ObservedMetric, string>> = {
  shots: "total_shots",
  shotsOnTarget: "shots_on_target",
  fouls: "fouls",
  corners: "corner_kicks",
  yellowCards: "yellow_cards",
  goalkeeperSaves: "goalkeeper_saves",
  offsides: "offsides",
};

function normalizeTeamStats(
  raw: UnknownRecord,
  side: TeamSide,
  teamId: string,
  context: StatsNormalizationContext,
): ObservedMatchStats {
  const metrics = {} as Record<ObservedMetric, number | null>;
  const missing: string[] = [];
  for (const [metric, field] of Object.entries(metricFields) as [ObservedMetric, string][]) {
    const value = finiteNumber(raw[field]);
    metrics[metric] = value;
    if (value === null) missing.push(metric);
  }
  return {
    matchId: context.matchId,
    teamId,
    side,
    metrics: metrics as ObservedMetricValues,
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "not_captured",
      missing,
      makeCoverage(Object.keys(metricFields).length - missing.length, Object.keys(metricFields).length),
    ),
    provenance: makeProvenance(context.capturedAt),
  };
}

export function normalizeObservedMatchStats(
  payload: unknown,
  context: StatsNormalizationContext,
): DataEnvelope<ObservedMatchStatsCollection> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload) || !isRecord(payload.stats)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["stats"]),
      provenance,
      calculation: null,
    };
  }
  const home = payload.stats.home;
  const away = payload.stats.away;
  if (!isRecord(home) || !isRecord(away)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["stats.home", "stats.away"]),
      provenance,
      calculation: null,
    };
  }
  const teams: readonly [ObservedMatchStats, ObservedMatchStats] = [
    normalizeTeamStats(home, "home", context.homeTeamId, context),
    normalizeTeamStats(away, "away", context.awayTeamId, context),
  ];
  const missing = teams.flatMap((team) =>
    team.availability.missingFields.map((field) => `${team.side}.${field}`),
  );
  return {
    data: { matchId: context.matchId, teams },
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "not_captured",
      missing,
      makeCoverage(14 - missing.length, 14),
    ),
    provenance,
    calculation: null,
  };
}

function normalizeStandingEntry(raw: unknown): StandingEntry | null {
  if (!isRecord(raw)) return null;
  const position = finiteInteger(raw.position);
  const teamId = stringId(raw.team_id);
  const teamName = nonEmptyString(raw.team_name);
  if (position === null || !teamId || !teamName) return null;

  const numericFields = {
    played: finiteInteger(raw.played),
    won: finiteInteger(raw.won),
    drawn: finiteInteger(raw.drawn),
    lost: finiteInteger(raw.lost),
    goalsFor: finiteInteger(raw.gf),
    goalsAgainst: finiteInteger(raw.ga),
    goalDifference: finiteInteger(raw.gd),
    points: finiteInteger(raw.pts),
    expectedGoalsFor: finiteNumber(raw.xgf),
    expectedGoalsAgainst: finiteNumber(raw.xga),
  };
  const missing = Object.entries(numericFields)
    .filter(([, value]) => value === null)
    .map(([field]) => field);
  const form = nonEmptyString(raw.form);
  const compactForm = form && /^[WDL]+$/.test(form)
    ? available(form)
    : unavailable<string>("not_captured");
  if (compactForm.status === "unavailable") missing.push("compactForm");

  return {
    position,
    teamId,
    teamName,
    ...numericFields,
    compactForm,
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "not_captured",
      missing,
    ),
  };
}

export function normalizeStandingTable(
  payload: unknown,
  context: FootballNormalizationContext,
): DataEnvelope<StandingTable> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload) || !Array.isArray(payload.standings) || !isRecord(payload.season)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["standings", "season"]),
      provenance,
      calculation: null,
    };
  }
  const leagueId = stringId(payload.league_id);
  const seasonId = stringId(payload.season.id);
  const seasonName = nonEmptyString(payload.season.name);
  if (!leagueId || !seasonId || !seasonName) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["leagueId", "season"]),
      provenance,
      calculation: null,
    };
  }
  const missing: string[] = [];
  const rows: StandingEntry[] = [];
  payload.standings.forEach((raw, index) => {
    const row = normalizeStandingEntry(raw);
    if (row) rows.push(row);
    else missing.push(`standings[${index}]`);
  });
  return {
    data: {
      leagueId,
      seasonId,
      seasonName,
      rows,
      detailedFormAvailability: makeAvailability("unavailable", "not_exposed_by_source"),
    },
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "validation_failed",
      missing,
      makeCoverage(rows.length, payload.standings.length),
    ),
    provenance,
    calculation: null,
  };
}

function normalizeRecentMatch(raw: unknown): HeadToHeadRecentMatch | null {
  if (!isRecord(raw)) return null;
  const date = isoDateTime(raw.date) ?? nonEmptyString(raw.date);
  const homeTeam = nonEmptyString(raw.home);
  const awayTeam = nonEmptyString(raw.away);
  const score = nonEmptyString(raw.score);
  return date && homeTeam && awayTeam && score
    ? { date, homeTeam, awayTeam, score }
    : null;
}

export function normalizeHeadToHead(
  payload: unknown,
  context: HeadToHeadNormalizationContext,
): DataEnvelope<HeadToHeadSample> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload) || !Array.isArray(payload.recent_matches)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["recent_matches"]),
      provenance,
      calculation: null,
    };
  }
  const totalMatches = finiteInteger(payload.total_matches);
  if (totalMatches === null) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["total_matches"]),
      provenance,
      calculation: null,
    };
  }
  const missing: string[] = [];
  const recentMatches: HeadToHeadRecentMatch[] = [];
  payload.recent_matches.forEach((raw, index) => {
    const match = normalizeRecentMatch(raw);
    if (match) recentMatches.push(match);
    else missing.push(`recent_matches[${index}]`);
  });
  const aggregate = {
    homeWins: finiteInteger(payload.home_wins),
    draws: finiteInteger(payload.draws),
    awayWins: finiteInteger(payload.away_wins),
    homeGoals: finiteInteger(payload.home_goals),
    awayGoals: finiteInteger(payload.away_goals),
    averageTotalGoals: finiteNumber(payload.avg_total_goals),
  };
  for (const [field, value] of Object.entries(aggregate)) {
    if (value === null) missing.push(field);
  }
  return {
    data: {
      matchId: context.matchId,
      totalMatches,
      ...aggregate,
      recentMatches,
    },
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "not_captured",
      missing,
      makeCoverage(recentMatches.length, totalMatches),
    ),
    provenance,
    calculation: null,
  };
}
