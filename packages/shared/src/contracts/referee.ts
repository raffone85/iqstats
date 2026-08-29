import type { DataAvailability, DataProvenance } from "./common.ts";

/**
 * Profilo arbitro come lo espone la fonte. Due soli livelli: un aggregato recente,
 * la cui finestra **non è dichiarata** e quindi non va chiamata stagione, e la
 * carriera. Il log gare per arbitro esiste ma torna vuoto: non è utilizzabile.
 */
export interface RefereeProfile {
  readonly refereeId: string;
  readonly name: string;
  readonly country: string | null;
  readonly birthdate: string | null;
  readonly matches: number | null;
  readonly totalYellowCards: number | null;
  readonly totalRedCards: number | null;
  readonly avgYellowPerMatch: number | null;
  readonly avgRedPerMatch: number | null;
  readonly avgFoulsPerMatch: number | null;
  readonly avgGoalsPerMatch: number | null;
  readonly careerGames: number | null;
  readonly careerYellowCards: number | null;
  readonly careerRedCards: number | null;
}

/** Metro di riferimento: le medie degli arbitri della stessa lega. */
export interface RefereeLeagueBenchmark {
  readonly leagueId: string;
  readonly referees: number;
  readonly avgYellowPerMatch: number | null;
  readonly avgFoulsPerMatch: number | null;
}

export interface RefereeDirectory {
  readonly leagueId: string;
  readonly referees: readonly RefereeProfile[];
  readonly benchmark: RefereeLeagueBenchmark;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}

/** Come si è comportata *questa* squadra sotto *questo* arbitro, calcolato da noi. */
export interface TeamRefereeRecord {
  readonly refereeId: string;
  readonly matches: number;
  readonly teamFoulsPerMatch: number | null;
  readonly teamYellowsPerMatch: number | null;
  readonly opponentFoulsPerMatch: number | null;
  readonly opponentYellowsPerMatch: number | null;
}
