import type {
  DataAvailability,
  DataProvenance,
  FieldValue,
} from "./common.ts";

export type TeamSide = "home" | "away";

export type ObservedMetric =
  | "shots"
  | "shotsOnTarget"
  | "fouls"
  | "corners"
  | "yellowCards"
  | "goalkeeperSaves"
  | "offsides";

export type ObservedMetricValues = Readonly<Record<ObservedMetric, number | null>>;

export interface ObservedMatchStats {
  readonly matchId: string;
  readonly teamId: string;
  readonly side: TeamSide;
  readonly metrics: ObservedMetricValues;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}

export interface ObservedMatchStatsCollection {
  readonly matchId: string;
  readonly teams: readonly [ObservedMatchStats, ObservedMatchStats];
}

export interface StandingEntry {
  readonly position: number;
  readonly teamId: string;
  readonly teamName: string;
  readonly played: number | null;
  readonly won: number | null;
  readonly drawn: number | null;
  readonly lost: number | null;
  readonly goalsFor: number | null;
  readonly goalsAgainst: number | null;
  readonly goalDifference: number | null;
  readonly points: number | null;
  readonly expectedGoalsFor: number | null;
  readonly expectedGoalsAgainst: number | null;
  readonly compactForm: FieldValue<string>;
  readonly availability: DataAvailability;
}

export interface StandingTable {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly seasonName: string;
  readonly rows: readonly StandingEntry[];
  readonly detailedFormAvailability: DataAvailability;
}

export interface HeadToHeadRecentMatch {
  readonly date: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly score: string;
}

export interface HeadToHeadSample {
  readonly matchId: string;
  readonly totalMatches: number;
  readonly homeWins: number | null;
  readonly draws: number | null;
  readonly awayWins: number | null;
  readonly homeGoals: number | null;
  readonly awayGoals: number | null;
  readonly averageTotalGoals: number | null;
  readonly recentMatches: readonly HeadToHeadRecentMatch[];
}

export interface TeamContextSnapshot {
  readonly leagueId: string;
  readonly teamId: string;
  readonly asOf: string;
  readonly formulaVersion: string;
  readonly squadStability: FieldValue<number>;
  readonly coachChanged: FieldValue<boolean>;
  readonly tacticalShift: FieldValue<boolean>;
  readonly regimeUncertain: boolean;
  readonly expectedAdjustmentAllowed: false;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}
