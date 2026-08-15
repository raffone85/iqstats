import type {
  DataAvailability,
  DataProvenance,
  FieldValue,
} from "./common.ts";

export type MatchStatus =
  | "not_started"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled"
  | "unknown";

export type MatchSection =
  | "odds"
  | "statistics"
  | "form"
  | "standings"
  | "headToHead"
  | "context"
  | "signals";

export interface SeasonSummary {
  readonly id: string;
  readonly name: string;
  readonly year: number | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly current: boolean | null;
}

export interface CompetitionSummary {
  readonly id: string;
  readonly name: string;
  readonly country: string | null;
  readonly active: boolean | null;
  readonly currentSeason: SeasonSummary | null;
}

export interface TeamSummary {
  readonly id: string;
  readonly name: string;
}

export interface MatchScore {
  readonly home: number;
  readonly away: number;
}

export interface MatchSummary {
  readonly id: string;
  readonly kickoffAt: string;
  readonly status: MatchStatus;
  readonly competition: CompetitionSummary;
  readonly seasonId: string | null;
  readonly refereeId: string | null;
  readonly homeTeam: TeamSummary;
  readonly awayTeam: TeamSummary;
  readonly score: FieldValue<MatchScore>;
  readonly round: string | null;
  readonly sectionAvailability: Readonly<Record<MatchSection, DataAvailability>>;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
}

export interface MatchDetail extends MatchSummary {
  readonly seasonId: string | null;
  readonly venueId: string | null;
  readonly refereeId: string | null;
  readonly currentMinute: number | null;
  readonly neutralGround: boolean | null;
  readonly localDerby: boolean | null;
}

export interface MatchList {
  readonly items: readonly MatchSummary[];
  readonly total: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

export interface MatchListFilters {
  readonly date: string;
  readonly countryId: string | null;
  readonly leagueId: string | null;
  readonly status: MatchStatus | null;
  readonly dataAvailability: "any" | "complete" | "partial";
}
