// Server-only: composizione della scheda giocatore /giocatori/[playerId].
// Tre blocchi separati e in questo ordine: stagione in corso, stagione precedente,
// carriera. La fonte non data le righe del giocatore — portano solo `event_id` e
// `team_id` — quindi la separazione per stagione la fa lei con `season_id`, e la
// carriera resta un totale senza tempo che si dichiara tale.
import "server-only";

import type { DataEnvelope, PlayerProfile, PlayerStatsBlock } from "@iqstats/shared";
import { cache } from "react";

import { getSeasons, getTeamCompetitionOptions } from "./team-page.ts";
import { getTeamGateway } from "./runtime.ts";

export interface PlayerStatsSection {
  readonly leagueName: string;
  readonly seasonId: string;
  /** Nome della stagione alla fonte, quando la fonte lo espone. */
  readonly seasonName: string | null;
  readonly envelope: DataEnvelope<PlayerStatsBlock>;
}

export interface PlayerDossier {
  readonly profile: PlayerProfile;
  /** La competizione che domina lo storico della squadra: la stessa regola della scheda squadra. */
  readonly stagione: PlayerStatsSection | null;
  readonly precedente: PlayerStatsSection | null;
  readonly carriera: DataEnvelope<PlayerStatsBlock> | null;
}

async function safely<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

async function section(
  playerId: string,
  option: { leagueName: string; seasonId: string } | undefined,
  seasonName: string | null,
): Promise<PlayerStatsSection | null> {
  if (!option) return null;
  const envelope = await safely(() => getTeamGateway().getPlayerStats(playerId, option.seasonId));
  return envelope ? { ...option, seasonName, envelope } : null;
}

export const getPlayerDossier = cache(async (playerId: string): Promise<PlayerDossier | null> => {
  const profile = await safely(() => getTeamGateway().getPlayerProfile(playerId));
  if (!profile?.data) return null;

  const teamId = profile.data.currentTeam?.id ?? null;
  const options = teamId ? await getTeamCompetitionOptions(teamId) : [];
  // Le opzioni arrivano ordinate per peso della competizione e, dentro la competizione,
  // dalla stagione più recente: la prima è quella in corso, la seconda la precedente.
  const stagione = options[0];
  const precedente = options.find(
    (option) => option.leagueId === stagione?.leagueId && option.seasonId !== stagione.seasonId,
  );

  const seasons = stagione ? await getSeasons(stagione.leagueId) : null;
  const seasonName = (seasonId: string | undefined): string | null =>
    seasons?.find((season) => season.id === seasonId)?.name ?? null;

  const [inCorso, scorsa, carriera] = await Promise.all([
    section(playerId, stagione, seasonName(stagione?.seasonId)),
    section(playerId, precedente, seasonName(precedente?.seasonId)),
    safely(() => getTeamGateway().getPlayerStats(playerId, null)),
  ]);

  return { profile: profile.data, stagione: inCorso, precedente: scorsa, carriera };
});
