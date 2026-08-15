// Server-only: composizione della scheda squadra /squadre/[teamId].
// Tutti i dati vengono dal provider tramite il gateway cacheato (TEAM-1 §4); nessun
// blocco fa cadere la pagina: un errore diventa `null` dichiarato, mai un dato inventato.
import "server-only";

import {
  aggregateTeamReferees,
  readReferee,
  type RefereeLeagueBenchmark,
  type RefereeProfile,
  type RefereeReading,
  type TeamRefereeRecord,
} from "@iqstats/shared";
import { cache } from "react";

import type {
  DataEnvelope,
  MatchList,
  MatchSummary,
  SeasonSummary,
  StandingEntry,
  TeamManagerProfile,
  TeamProfile,
  TeamSeasonSplits,
  TeamSquad,
} from "@iqstats/shared";

import { getTeamGateway } from "./runtime.ts";
import type { TeamCompetitionOption } from "./team-selection.ts";

export type { TeamCompetitionOption } from "./team-selection.ts";
export { selectCompetition } from "./team-selection.ts";

export interface TeamSelection {
  readonly leagueId: string;
  readonly seasonId: string;
}

async function safely<T>(load: () => Promise<DataEnvelope<T>>): Promise<DataEnvelope<T> | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/**
 * Competizioni e stagioni in cui la squadra ha gare concluse, ricavate dallo storico
 * più recente. Ordinate per numero di gare e, a parità, per data: è la regola che
 * seleziona la competizione di riferimento, ed è dichiarata in pagina.
 */
export async function getTeamCompetitionOptions(
  teamId: string,
): Promise<readonly TeamCompetitionOption[]> {
  const history = await safely(() => getTeamGateway().getTeamFinishedMatches(teamId, null));
  const groups = new Map<string, { option: TeamCompetitionOption }>();

  for (const match of history?.data?.items ?? []) {
    if (match.seasonId === null) continue;
    const key = `${match.competition.id}:${match.seasonId}`;
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, {
        option: {
          ...existing.option,
          matches: existing.option.matches + 1,
          lastMatchAt:
            match.kickoffAt > existing.option.lastMatchAt
              ? match.kickoffAt
              : existing.option.lastMatchAt,
        },
      });
      continue;
    }
    groups.set(key, {
      option: {
        leagueId: match.competition.id,
        leagueName: match.competition.name,
        seasonId: match.seasonId,
        matches: 1,
        lastMatchAt: match.kickoffAt,
      },
    });
  }

  // Ordine dei filtri: prima le competizioni che pesano di più nello storico — il
  // campionato, poi le coppe, poi le amichevoli — e dentro ciascuna le stagioni più
  // recenti. Nessun gruppo viene nascosto: una stagione con poche gare lo dichiara.
  const options = [...groups.values()].map((entry) => entry.option);
  const leagueWeight = new Map<string, number>();
  for (const option of options) {
    leagueWeight.set(option.leagueId, (leagueWeight.get(option.leagueId) ?? 0) + option.matches);
  }
  return options.sort(
    (left, right) =>
      (leagueWeight.get(right.leagueId) ?? 0) - (leagueWeight.get(left.leagueId) ?? 0) ||
      left.leagueId.localeCompare(right.leagueId) ||
      right.lastMatchAt.localeCompare(left.lastMatchAt),
  );
}

export async function getTeamProfile(teamId: string): Promise<DataEnvelope<TeamProfile> | null> {
  return safely(() => getTeamGateway().getTeamProfile(teamId));
}

export async function getSeasons(
  leagueId: string,
): Promise<readonly SeasonSummary[] | null> {
  const envelope = await safely(() => getTeamGateway().getSeasons(leagueId));
  return envelope?.data ?? null;
}

export async function getStandingRow(
  teamId: string,
  selection: TeamSelection,
): Promise<StandingEntry | null> {
  const envelope = await safely(() =>
    getTeamGateway().getStandings(selection.leagueId, selection.seasonId),
  );
  return envelope?.data?.rows.find((row) => row.teamId === teamId) ?? null;
}

/**
 * Deduplicato per richiesta: il blocco statistiche e il blocco arbitri leggono le
 * stesse gare, e senza `cache` verrebbero normalizzate due volte.
 */
export const getTeamSplits = cache(
  async (
    teamId: string,
    leagueId: string,
    seasonId: string,
  ): Promise<DataEnvelope<TeamSeasonSplits> | null> =>
    safely(() => getTeamGateway().getTeamSeasonSplits(teamId, { seasonId, leagueId })),
);

export interface TeamRefereeEntry {
  readonly record: TeamRefereeRecord;
  readonly profile: RefereeProfile | null;
  readonly reading: RefereeReading | null;
}

export interface TeamRefereePanel {
  readonly entries: readonly TeamRefereeEntry[];
  readonly benchmark: RefereeLeagueBenchmark | null;
  readonly teamFoulsPerMatch: number | null;
  readonly teamYellowsPerMatch: number | null;
  readonly matchesWithReferee: number;
  readonly matches: number;
}

function averageOf(
  splits: TeamSeasonSplits | null,
  key: "fouls" | "yellowCards",
): number | null {
  return splits?.overall.metrics.find((entry) => entry.key === key)?.average.value ?? null;
}

/**
 * Arbitri incontrati nel campione. Il record "con questa squadra" si ricava dalle
 * gare già scaricate; nomi, aggregati e metro di lega costano un solo GET.
 */
export async function getTeamRefereePanel(
  teamId: string,
  selection: TeamSelection,
): Promise<TeamRefereePanel | null> {
  const [splitsEnvelope, directoryEnvelope] = await Promise.all([
    getTeamSplits(teamId, selection.leagueId, selection.seasonId),
    safely(() => getTeamGateway().getRefereeDirectory(selection.leagueId)),
  ]);
  const splits = splitsEnvelope?.data ?? null;
  if (splits === null) return null;

  const directory = directoryEnvelope?.data ?? null;
  const profiles = new Map((directory?.referees ?? []).map((referee) => [referee.refereeId, referee]));
  const records = aggregateTeamReferees(splits.matchLog);

  return {
    entries: records.map((record) => {
      const profile = profiles.get(record.refereeId) ?? null;
      return {
        record,
        profile,
        reading: profile === null ? null : readReferee(profile, directory?.benchmark ?? null),
      };
    }),
    benchmark: directory?.benchmark ?? null,
    teamFoulsPerMatch: averageOf(splits, "fouls"),
    teamYellowsPerMatch: averageOf(splits, "yellowCards"),
    matchesWithReferee: records.reduce((total, record) => total + record.matches, 0),
    matches: splits.matchLog.length,
  };
}

export interface MatchRefereeReading {
  readonly profile: RefereeProfile;
  readonly reading: RefereeReading;
  readonly benchmark: RefereeLeagueBenchmark | null;
}

/**
 * Metro dell'arbitro designato, letto contro la media della sua competizione. Il
 * catalogo di lega copre già nome e aggregati: il profilo singolo è solo il ripiego.
 */
export async function getMatchRefereeReading(
  leagueId: string,
  refereeId: string,
): Promise<MatchRefereeReading | null> {
  const directory = (await safely(() => getTeamGateway().getRefereeDirectory(leagueId)))?.data ?? null;
  const fromDirectory = directory?.referees.find((referee) => referee.refereeId === refereeId) ?? null;
  const profile =
    fromDirectory ??
    (await safely(() => getTeamGateway().getRefereeProfile(refereeId)))?.data ??
    null;
  if (profile === null) return null;

  return {
    profile,
    reading: readReferee(profile, directory?.benchmark ?? null),
    benchmark: directory?.benchmark ?? null,
  };
}

export async function getTeamSquad(
  teamId: string,
  selection: TeamSelection,
): Promise<DataEnvelope<TeamSquad> | null> {
  return safely(() =>
    getTeamGateway().getTeamSquadStats(teamId, {
      seasonId: selection.seasonId,
      leagueId: selection.leagueId,
    }),
  );
}

export async function getTeamUpcoming(teamId: string): Promise<readonly MatchSummary[] | null> {
  const envelope: DataEnvelope<MatchList> | null = await safely(() =>
    getTeamGateway().getTeamUpcomingMatches(teamId),
  );
  return envelope?.data?.items ?? null;
}

export async function getTeamCoach(
  teamId: string,
): Promise<DataEnvelope<TeamManagerProfile> | null> {
  return safely(() => getTeamGateway().getTeamManager(teamId));
}
