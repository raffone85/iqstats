// Server-only: composizione della scheda squadra /squadre/[teamId].
// Tutti i dati vengono dal provider tramite il gateway cacheato (TEAM-1 §4); nessun
// blocco fa cadere la pagina: un errore diventa `null` dichiarato, mai un dato inventato.
import "server-only";

import {
  aggregateTeamReferees,
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

import {
  classificaArbitri, letturaArbitro, metriDiLega, metroDiCompetizione,
  type LetturaArbitro, type MetroDiLega,
} from "./referees.ts";
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

export interface MatchStandingRows {
  readonly home: StandingEntry | null;
  readonly away: StandingEntry | null;
  /** Quante squadre compongono la classifica: senza il totale la posizione non si legge. */
  readonly teams: number;
  readonly seasonName: string;
}

/**
 * Le due righe di classifica di una gara, con una sola lettura della tabella: chiedere
 * la riga di casa e quella di trasferta separatamente costerebbe due richieste identiche.
 * Nelle coppe la tabella arriva a gironi e una squadra può non esserci: resta `null`.
 */
export async function getMatchStandingRows(
  leagueId: string,
  seasonId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<MatchStandingRows | null> {
  const envelope = await safely(() => getTeamGateway().getStandings(leagueId, seasonId));
  const table = envelope?.data;
  if (!table) return null;
  return {
    home: table.rows.find((row) => row.teamId === homeTeamId) ?? null,
    away: table.rows.find((row) => row.teamId === awayTeamId) ?? null,
    teams: table.rows.length,
    seasonName: table.seasonName,
  };
}

export interface TeamFormEntry {
  readonly matchId: string;
  readonly kickoffAt: string;
  readonly opponent: string;
  readonly atHome: boolean;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  /** Vinta, pareggiata (nulla), persa. */
  readonly outcome: "V" | "N" | "P";
  readonly competition: string;
}

/**
 * La forma di una squadra, ricavata dalle gare davvero giocate.
 *
 * Non si usa la stringa di forma della classifica: il 16 agosto 2026 è risultata non
 * allineata al giocato — una squadra reduce da una vittoria la mostrava come sconfitta —
 * e il suo ordine non è dichiarato da nessuna parte. Qui ogni lettera è una gara con la
 * sua data, il suo avversario e il suo punteggio, quindi è verificabile a vista.
 *
 * Le gare arrivano senza filtro di stagione perché «le ultime cinque» attraversa la
 * pausa estiva: è un elenco, non una media, e ogni riga porta la sua competizione.
 */
export async function getTeamForm(
  teamId: string,
  limit = 5,
): Promise<readonly TeamFormEntry[] | null> {
  const envelope = await safely(() => getTeamGateway().getTeamFinishedMatches(teamId, null));
  const items = envelope?.data?.items;
  if (!items) return null;

  const entries: TeamFormEntry[] = [];
  for (const match of items.toSorted((left, right) =>
    right.kickoffAt.localeCompare(left.kickoffAt),
  )) {
    if (match.score.status === "unavailable") continue;
    const atHome = match.homeTeam.id === teamId;
    const opponent = atHome ? match.awayTeam : match.homeTeam;
    const goalsFor = atHome ? match.score.value.home : match.score.value.away;
    const goalsAgainst = atHome ? match.score.value.away : match.score.value.home;
    entries.push({
      matchId: match.id,
      kickoffAt: match.kickoffAt,
      opponent: opponent.name,
      atHome,
      goalsFor,
      goalsAgainst,
      outcome: goalsFor > goalsAgainst ? "V" : goalsFor === goalsAgainst ? "N" : "P",
      competition: match.competition.name,
    });
    if (entries.length === limit) break;
  }
  return entries;
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
  readonly nome: string | null;
  /** `null` quando di quell'arbitro non abbiamo abbastanza gare in questa competizione. */
  readonly lettura: LetturaArbitro | null;
}

export interface TeamRefereePanel {
  readonly entries: readonly TeamRefereeEntry[];
  /** Il metro dei colleghi che dirigono questa competizione, dalle nostre osservazioni. */
  readonly metro: MetroDiLega | null;
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
 * Arbitri incontrati nel campione, e come fischiano rispetto ai colleghi di questa
 * competizione.
 *
 * **Le medie e il metro vengono dalle nostre righe, non dalla fonte.** Fino al 29 agosto
 * 2026 questo pannello chiedeva alla fonte l'aggregato dell'arbitro - una finestra che la
 * fonte non dichiara, quindi possibilmente tutta la carriera su tutte le competizioni - e
 * lo confrontava con il metro di **questa** lega: e' lo stesso difetto corretto nel banner
 * del dossier il 28 agosto, ed era ancora vivo qui.
 *
 * **La soglia non e' piu' un cinque per cento scelto a tavolino** (`REFEREE_INLINE_TOLERANCE`)
 * ma mezza dispersione fra i colleghi della competizione, la stessa disciplina del dossier:
 * dove gli arbitri si somigliano serve poco per staccarsi, dove variano molto serve di piu'.
 *
 * **E c'e' un minimo di gare**, che prima mancava: sotto le cinque gare in competizione
 * `classificaArbitri` non restituisce l'arbitro, quindi niente medie e niente etichetta, e
 * la pagina lo dichiara invece di dedurre un carattere da una partita sola.
 *
 * Il record «con questa squadra» resta quello di prima: si ricava dalle gare gia' scaricate.
 */
export async function getTeamRefereePanel(
  teamId: string,
  selection: TeamSelection,
): Promise<TeamRefereePanel | null> {
  const competizione = Number(selection.leagueId);
  const [splitsEnvelope, classifica, metri] = await Promise.all([
    getTeamSplits(teamId, selection.leagueId, selection.seasonId),
    Number.isFinite(competizione) ? classificaArbitri(competizione, "gialli") : Promise.resolve([]),
    Number.isFinite(competizione) ? metriDiLega([competizione]) : Promise.resolve(new Map()),
  ]);
  const splits = splitsEnvelope?.data ?? null;
  if (splits === null) return null;

  // Il metro e' quello di **tutta** la competizione, come le medie qui accanto: un metro di
  // stagione sopra medie di competizione confronterebbe due perimetri diversi.
  const metro = Number.isFinite(competizione)
    ? metroDiCompetizione(metri, competizione)
    : null;
  const nostre = new Map(classifica.map((r) => [String(r.sourceId), r]));
  const records = aggregateTeamReferees(splits.matchLog);

  return {
    entries: records.map((record) => {
      const riga = nostre.get(record.refereeId) ?? null;
      return { record, nome: riga?.nome ?? null, lettura: letturaArbitro(riga, metro) };
    }),
    metro,
    teamFoulsPerMatch: averageOf(splits, "fouls"),
    teamYellowsPerMatch: averageOf(splits, "yellowCards"),
    matchesWithReferee: records.reduce((total, record) => total + record.matches, 0),
    matches: splits.matchLog.length,
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
