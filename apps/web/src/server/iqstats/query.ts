import type { MatchStatus } from "@iqstats/shared";

import { invalidRequest } from "./errors.ts";

export type SupportedMatchFilterStatus = Extract<
  MatchStatus,
  "not_started" | "finished" | "postponed" | "cancelled"
>;

export interface MatchQuery {
  readonly date: string;
  readonly leagueId: string;
  readonly status: SupportedMatchFilterStatus | null;
  readonly limit: number;
  readonly offset: number;
}

const statusMap: Readonly<Record<SupportedMatchFilterStatus, string>> = {
  not_started: "notstarted",
  finished: "finished",
  postponed: "postponed",
  cancelled: "cancelled",
};

function singleValue(
  params: URLSearchParams,
  name: string,
  required = false,
): string | null {
  const values = params.getAll(name);
  if (values.length > 1) throw invalidRequest();
  const value = values[0]?.trim() ?? "";
  if (!value) {
    if (required) throw invalidRequest();
    return null;
  }
  return value;
}

function rejectUnknown(params: URLSearchParams, allowed: readonly string[]): void {
  const allowedNames = new Set(allowed);
  for (const name of params.keys()) {
    if (!allowedNames.has(name)) throw invalidRequest();
  }
}

function integerInRange(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw invalidRequest();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidRequest();
  }
  return parsed;
}

export function positiveIntegerId(value: string): string {
  if (!/^[1-9]\d*$/.test(value)) throw invalidRequest();
  return value;
}

export function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidRequest();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw invalidRequest();
  }
  return value;
}

export function parseMatchesQuery(params: URLSearchParams): MatchQuery {
  rejectUnknown(params, ["date", "leagueId", "status", "limit", "offset"]);
  const date = isoDate(singleValue(params, "date", true) as string);
  const leagueId = positiveIntegerId(singleValue(params, "leagueId", true) as string);
  const rawStatus = singleValue(params, "status");
  if (rawStatus !== null && !Object.hasOwn(statusMap, rawStatus)) throw invalidRequest();

  return {
    date,
    leagueId,
    status: rawStatus as SupportedMatchFilterStatus | null,
    limit: integerInRange(singleValue(params, "limit"), 50, 1, 100),
    offset: integerInRange(singleValue(params, "offset"), 0, 0, 10_000),
  };
}

export function providerStatus(status: SupportedMatchFilterStatus | null): string | null {
  return status === null ? null : statusMap[status];
}

export function parseSeasonQuery(params: URLSearchParams): string {
  rejectUnknown(params, ["seasonId"]);
  return positiveIntegerId(singleValue(params, "seasonId", true) as string);
}

export function assertNoQuery(params: URLSearchParams): void {
  rejectUnknown(params, []);
}

export interface TeamSeasonQueryInput {
  readonly seasonId: string;
  readonly leagueId: string | null;
  readonly limit?: number;
}

/**
 * Le medie di squadra non si mescolano fra stagioni: `seasonId` è obbligatorio.
 * `leagueId` è il filtro competizione, facoltativo e senza default implicito.
 */
export function parseTeamSeasonQuery(params: URLSearchParams): TeamSeasonQueryInput {
  rejectUnknown(params, ["seasonId", "leagueId", "limit"]);
  const seasonId = positiveIntegerId(singleValue(params, "seasonId", true) as string);
  const rawLeagueId = singleValue(params, "leagueId");
  const rawLimit = singleValue(params, "limit");

  return {
    seasonId,
    leagueId: rawLeagueId === null ? null : positiveIntegerId(rawLeagueId),
    ...(rawLimit === null ? {} : { limit: integerInRange(rawLimit, 20, 1, 50) }),
  };
}
