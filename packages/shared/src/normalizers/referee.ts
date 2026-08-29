import type { DataEnvelope } from "../contracts/common.ts";
import {
  type RefereeDirectory,
  type RefereeLeagueBenchmark,
  type RefereeProfile,
  type TeamRefereeRecord,
} from "../contracts/referee.ts";
import type { TeamMatchLogEntry } from "../contracts/team.ts";
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

export interface RefereeNormalizationContext {
  readonly capturedAt: string;
}

export interface RefereeDirectoryContext extends RefereeNormalizationContext {
  readonly leagueId: string;
}

function normalizeProfile(raw: unknown): RefereeProfile | null {
  if (!isRecord(raw)) return null;
  const refereeId = stringId(raw.id);
  const name = nonEmptyString(raw.name);
  if (!refereeId || !name) return null;
  return {
    refereeId,
    name,
    country: nonEmptyString(raw.country),
    birthdate: nonEmptyString(raw.birthdate),
    matches: finiteInteger(raw.matches),
    totalYellowCards: finiteInteger(raw.total_yellow_cards),
    totalRedCards: finiteInteger(raw.total_red_cards),
    avgYellowPerMatch: finiteNumber(raw.avg_yellow_per_match),
    avgRedPerMatch: finiteNumber(raw.avg_red_per_match),
    avgFoulsPerMatch: finiteNumber(raw.avg_fouls_per_match),
    avgGoalsPerMatch: finiteNumber(raw.avg_goals_per_match),
    careerGames: finiteInteger(raw.career_games),
    careerYellowCards: finiteInteger(raw.career_yellow_cards),
    careerRedCards: finiteInteger(raw.career_red_cards),
  };
}

export function normalizeRefereeProfile(
  payload: unknown,
  context: RefereeNormalizationContext,
): DataEnvelope<RefereeProfile> {
  const provenance = makeProvenance(context.capturedAt);
  const profile = normalizeProfile(payload);
  if (!profile) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["referee"]),
      provenance,
      calculation: null,
    };
  }
  const missing = Object.entries(profile)
    .filter(([, value]) => value === null)
    .map(([field]) => field);
  return {
    data: profile,
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "not_captured",
      missing,
    ),
    provenance,
    calculation: null,
  };
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Un solo GET su `/referees/?league_id=` porta nomi, aggregati e metro di lega:
 * niente una richiesta per arbitro.
 */
export function normalizeRefereeDirectory(
  payload: unknown,
  context: RefereeDirectoryContext,
): DataEnvelope<RefereeDirectory> {
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
  const referees: RefereeProfile[] = [];
  payload.results.forEach((raw, index) => {
    const profile = normalizeProfile(raw);
    if (profile) referees.push(profile);
    else missing.push(`results[${index}]`);
  });

  const benchmark: RefereeLeagueBenchmark = {
    leagueId: context.leagueId,
    referees: referees.length,
    avgYellowPerMatch: mean(
      referees
        .map((referee) => referee.avgYellowPerMatch)
        .filter((value): value is number => value !== null),
    ),
    avgFoulsPerMatch: mean(
      referees
        .map((referee) => referee.avgFoulsPerMatch)
        .filter((value): value is number => value !== null),
    ),
  };
  const availability = makeAvailability(
    referees.length === 0 ? "unavailable" : missing.length === 0 ? "available" : "partial",
    referees.length === 0 ? "not_captured" : missing.length === 0 ? null : "validation_failed",
    missing,
    makeCoverage(referees.length, payload.results.length),
  );

  return {
    data: { leagueId: context.leagueId, referees, benchmark, availability, provenance },
    availability,
    provenance,
    calculation: null,
  };
}

/**
 * Come si è comportata la squadra sotto ciascun arbitro incontrato nel campione.
 * Si legge dalle gare già scaricate: non costa nessuna richiesta in più.
 */
export function aggregateTeamReferees(
  matchLog: readonly TeamMatchLogEntry[],
): readonly TeamRefereeRecord[] {
  const byReferee = new Map<string, TeamMatchLogEntry[]>();
  for (const entry of matchLog) {
    if (entry.refereeId === null) continue;
    const existing = byReferee.get(entry.refereeId);
    if (existing) existing.push(entry);
    else byReferee.set(entry.refereeId, [entry]);
  }

  const records: TeamRefereeRecord[] = [];
  for (const [refereeId, entries] of byReferee) {
    const average = (pick: (entry: TeamMatchLogEntry) => number | null): number | null =>
      mean(entries.map(pick).filter((value): value is number => value !== null));
    records.push({
      refereeId,
      matches: entries.length,
      teamFoulsPerMatch: average((entry) => entry.values.fouls),
      teamYellowsPerMatch: average((entry) => entry.values.yellowCards),
      opponentFoulsPerMatch: average((entry) => entry.opponentValues.fouls),
      opponentYellowsPerMatch: average((entry) => entry.opponentValues.yellowCards),
    });
  }

  return records.sort((left, right) => right.matches - left.matches);
}
