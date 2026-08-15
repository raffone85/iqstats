import type {
  DataAvailability,
  DataProvenance,
  FieldValue,
} from "./common.ts";
import type { ObservedMetric, TeamSide } from "./football.ts";

export interface TeamVenue {
  readonly venueId: string;
  readonly name: string;
  readonly city: string | null;
  readonly capacity: number | null;
  readonly builtYear: number | null;
}

export interface TeamProfile {
  readonly teamId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly country: string | null;
  readonly venue: TeamVenue | null;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}

export interface TeamManagerProfile {
  readonly managerId: string;
  readonly name: string;
  readonly country: string | null;
  readonly tacticalProfile: string | null;
  readonly preferredFormation: string | null;
  readonly currentTeamId: string | null;
  readonly matchesTotal: number | null;
  readonly winPct: number | null;
  readonly avgGoalsScored: number | null;
  readonly avgGoalsConceded: number | null;
  readonly avgPossession: number | null;
  readonly cleanSheetPct: number | null;
  readonly statsUpdatedAt: string | null;
  /** Gara da cui l'allenatore è stato derivato: `current_team_id` non è affidabile. */
  readonly derivedFromMatchId: string | null;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}

/**
 * Gruppi del corredo di metriche. Il nucleo resta `ObservedMetric`: il corredo
 * non lo sostituisce, lo valida dichiarando con `supports` quale metrica
 * principale contestualizza.
 */
export type TeamMetricGroup =
  | "shooting"
  | "possession"
  | "defence"
  | "goalkeeping"
  | "discipline";

export type TeamExtendedMetric =
  // shooting
  | "shotsInsideBox"
  | "shotsOutsideBox"
  | "shotsOffTarget"
  | "blockedShots"
  | "hitWoodwork"
  | "bigChances"
  | "bigChancesScored"
  | "bigChancesMissed"
  | "expectedGoals"
  | "xgActual"
  | "touchesInPenaltyArea"
  // possession
  | "ballPossession"
  | "passes"
  | "accuratePasses"
  | "passAccuracy"
  | "longBallsAttempted"
  | "longBallsAccuracy"
  | "crossesAttempted"
  | "crossesAccuracy"
  | "dribblesAttempted"
  | "dribblesSuccess"
  | "finalThirdEntries"
  | "finalThirdPhaseAttempted"
  | "finalThirdPhaseSuccess"
  | "throughBalls"
  | "dispossessed"
  | "attacks"
  | "attackShare"
  | "dangerousAttacks"
  | "dangerousAttackShare"
  | "ballSafe"
  | "ballSafeShare"
  // defence
  | "tackles"
  | "tacklesWonShare"
  | "interceptions"
  | "clearances"
  | "recoveries"
  | "duels"
  | "groundDuelsContested"
  | "groundDuelsWon"
  | "aerialDuelsContested"
  | "aerialDuelsWon"
  | "errorsLeadToAShot"
  // goalkeeping
  | "totalSaves"
  | "bigSaves"
  | "goalsPrevented"
  | "punches"
  | "highClaims"
  // discipline
  | "redCards"
  | "freeKicks"
  | "fouledInFinalThird"
  | "throwIns"
  | "goalKicks";

export type TeamMetricKey = ObservedMetric | TeamExtendedMetric;

export interface TeamMetricDescriptor {
  readonly key: TeamMetricKey;
  readonly tier: "core" | "extended";
  readonly group: TeamMetricGroup;
  /** Metrica del nucleo che questa metrica valida; `null` se autonoma. */
  readonly supports: ObservedMetric | null;
  readonly percentage: boolean;
}

/**
 * Osservazione di una metrica in una singola gara. `total` valorizzato indica un
 * rapporto: l'aggregazione somma numeratori e denominatori invece di mediare
 * percentuali per gara.
 */
export interface MetricObservation {
  readonly value: number | null;
  readonly total: number | null;
}

export interface TeamMatchMetrics {
  readonly eventId: string;
  readonly teamId: string;
  readonly side: TeamSide;
  readonly playedAt: string | null;
  readonly opponentName: string | null;
  readonly refereeId: string | null;
  readonly metrics: Readonly<Record<TeamMetricKey, MetricObservation>>;
  /** Stessa gara, lato avversario: serve a mostrare 13–7 e non solo 13. */
  readonly opponentMetrics: Readonly<Record<TeamMetricKey, MetricObservation>>;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}

/**
 * Una gara del campione con i valori già risolti per la lettura: le metriche di
 * rapporto diventano la percentuale di quella gara, le altre restano il conteggio.
 * L'elenco vive una volta sola accanto agli aggregati, non dentro ogni metrica.
 */
export interface TeamMatchLogEntry {
  readonly eventId: string;
  readonly playedAt: string | null;
  readonly opponentName: string | null;
  readonly refereeId: string | null;
  readonly side: TeamSide;
  readonly values: Readonly<Record<TeamMetricKey, number | null>>;
  readonly opponentValues: Readonly<Record<TeamMetricKey, number | null>>;
}

export interface TeamMetricAverage {
  readonly key: TeamMetricKey;
  readonly average: FieldValue<number>;
  /** Gare che hanno effettivamente contribuito: i valori assenti non entrano. */
  readonly sample: number;
}

export type TeamSplitScope = TeamSide | "overall";

export interface TeamSeasonSplit {
  readonly venue: TeamSplitScope;
  readonly matches: number;
  readonly metrics: readonly TeamMetricAverage[];
}

export interface TeamSeasonSplits {
  readonly teamId: string;
  readonly seasonId: string;
  readonly minimumSample: number;
  readonly home: TeamSeasonSplit;
  readonly away: TeamSeasonSplit;
  readonly overall: TeamSeasonSplit;
  /** Le gare che compongono le medie, per rendere verificabile ogni numero. */
  readonly matchLog: readonly TeamMatchLogEntry[];
}

export type SquadPosition = "goalkeeper" | "defender" | "midfielder" | "forward";

export interface TeamSquadMember {
  readonly playerId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly position: SquadPosition | null;
  readonly jerseyNumber: number | null;
  readonly nationality: string | null;
  readonly dateOfBirth: string | null;
}

/**
 * Vocabolario delle metriche per giocatore, verificato su
 * `events/{id}/player-stats/`. Le stesse chiavi alimentano la rosa della scheda
 * squadra e, individualmente, la futura pagina del calciatore.
 */
export const PLAYER_METRIC_KEYS = [
  "touches",
  "goals",
  "goalAssist",
  "expectedGoals",
  "expectedAssists",
  "totalShots",
  "shotsOnTarget",
  "keyPass",
  "totalPass",
  "accuratePass",
  "totalLongBalls",
  "accurateLongBalls",
  "totalCross",
  "accurateCross",
  "totalContest",
  "wonContest",
  "duelWon",
  "duelLost",
  "aerialWon",
  "aerialLost",
  "totalTackle",
  "wonTackle",
  "totalClearance",
  "interception",
  "ballRecovery",
  "blockedScoringAttempt",
  "dispossessed",
  "possessionLost",
  "wasFouled",
  "fouls",
  "yellowCard",
  "redCard",
  "saves",
  "goalsConceded",
  "punches",
  "highClaims",
  "goodHighClaim",
  "accurateKeeperSweeper",
  "totalKeeperSweeper",
  "goalsPrevented",
  "keeperSaveValue",
  "goalkeeperValueNormalized",
  "bigChanceCreated",
  "bigChanceMissed",
  "expectedGoalsOnTarget",
  "hitWoodwork",
  "lastManTackle",
  "outfielderBlock",
  "savedShotsFromInsideTheBox",
  "clearanceOffLine",
  "challengeLost",
  "totalOffside",
  "errorLeadToAGoal",
  "errorLeadToAShot",
  "defensiveValueNormalized",
  "passValueNormalized",
  "shotValueNormalized",
  "dribbleValueNormalized",
  "ballCarriesCount",
  "progressiveBallCarriesCount",
  "totalBallCarriesDistance",
  "totalProgressiveBallCarriesDistance",
  "bestBallCarryProgression",
  "totalProgression",
  "unsuccessfulTouch",
  "accurateOppositionHalfPasses",
  "totalOppositionHalfPasses",
  "accurateOwnHalfPasses",
  "totalOwnHalfPasses",
] as const;

export type PlayerMetricKey = (typeof PLAYER_METRIC_KEYS)[number];

/**
 * Selezione per ruolo: le 69 metriche per giocatore non stanno in una tabella
 * mobile. Qui vive la prima battuta mostrata nella rosa; la pagina del calciatore
 * potrà attingere all'intero vocabolario.
 */
export const SQUAD_ROLE_METRICS: Readonly<Record<SquadPosition, readonly PlayerMetricKey[]>> = {
  goalkeeper: [
    "saves",
    "goalsConceded",
    "goalsPrevented",
    "savedShotsFromInsideTheBox",
    "highClaims",
    "punches",
  ],
  defender: [
    "totalClearance",
    "interception",
    "totalTackle",
    "wonTackle",
    "aerialWon",
    "blockedScoringAttempt",
    "errorLeadToAShot",
  ],
  midfielder: [
    "accuratePass",
    "keyPass",
    "totalProgression",
    "ballRecovery",
    "duelWon",
    "expectedAssists",
    "possessionLost",
  ],
  forward: [
    "goals",
    "expectedGoals",
    "goalAssist",
    "expectedAssists",
    "totalShots",
    "shotsOnTarget",
    "bigChanceMissed",
  ],
};

export interface PlayerMatchStats {
  readonly eventId: string;
  readonly playerId: string;
  readonly teamId: string;
  readonly minutesPlayed: number | null;
  readonly rating: number | null;
  readonly metrics: Readonly<Record<PlayerMetricKey, number | null>>;
}

export interface TeamSquadMemberStats {
  readonly playerId: string;
  /** Gare con almeno un minuto giocato. */
  readonly appearances: number;
  readonly minutes: number;
  readonly rating: FieldValue<number>;
  readonly ratingSample: number;
  /** Somme stagionali; `null` quando nessuna gara espone la metrica. */
  readonly totals: Readonly<Record<PlayerMetricKey, number | null>>;
}

export interface TeamSquadEntry {
  readonly profile: TeamSquadMember;
  readonly stats: TeamSquadMemberStats | null;
}

export interface TeamSquad {
  readonly teamId: string;
  readonly entries: readonly TeamSquadEntry[];
  readonly matchesCovered: number;
}
