export type {
  AvailabilityReason,
  AvailabilityStatus,
  CalculationMetadata,
  Coverage,
  DataAvailability,
  DataEnvelope,
  DataProvenance,
  FieldValue,
  SourceKind,
} from "./contracts/common.ts";
export type {
  ApiErrorCode,
  ApiErrorDescriptor,
  ApiErrorEnvelope,
} from "./contracts/api.ts";
export type {
  CompetitionSummary,
  MatchDetail,
  MatchList,
  MatchListFilters,
  MatchScore,
  MatchSection,
  MatchStatus,
  MatchSummary,
  SeasonSummary,
  TeamSummary,
} from "./contracts/matches.ts";
export type {
  BookmakerSummary,
  OddsCollection,
  OddsMarket,
  OddsMovement,
  OddsOutcome,
  OddsSnapshot,
} from "./contracts/odds.ts";
export type {
  HeadToHeadRecentMatch,
  HeadToHeadSample,
  ObservedMatchStats,
  ObservedMatchStatsCollection,
  ObservedMetric,
  ObservedMetricValues,
  StandingEntry,
  StandingTable,
  TeamContextSnapshot,
  TeamSide,
} from "./contracts/football.ts";
export type {
  MetricObservation,
  PlayerMatchStats,
  PlayerMetricKey,
  SquadPosition,
  TeamExtendedMetric,
  TeamManagerProfile,
  TeamMatchLogEntry,
  TeamMatchMetrics,
  TeamMetricAverage,
  TeamMetricDescriptor,
  TeamMetricGroup,
  TeamMetricKey,
  TeamProfile,
  TeamSeasonSplit,
  TeamSeasonSplits,
  TeamSplitScope,
  TeamSquad,
  TeamSquadEntry,
  TeamSquadMember,
  TeamSquadMemberStats,
  TeamVenue,
} from "./contracts/team.ts";
export { PLAYER_METRIC_KEYS, SQUAD_ROLE_METRICS } from "./contracts/team.ts";
export type {
  RefereeAxis,
  RefereeAxisLevel,
  RefereeDirectory,
  RefereeLeagueBenchmark,
  RefereeProfile,
  RefereeReading,
  TeamRefereeRecord,
} from "./contracts/referee.ts";
export { REFEREE_INLINE_TOLERANCE } from "./contracts/referee.ts";
export {
  aggregateTeamReferees,
  normalizeRefereeDirectory,
  normalizeRefereeProfile,
  readReferee,
  type RefereeDirectoryContext,
  type RefereeNormalizationContext,
} from "./normalizers/referee.ts";
export {
  indexCompetitions,
  normalizeCompetitionCatalog,
  normalizeMatchDetail,
  normalizeMatchList,
  normalizeSeasonCatalog,
  type MatchNormalizationContext,
} from "./normalizers/matches.ts";
export {
  normalizeOddsPages,
  type OddsNormalizationContext,
} from "./normalizers/odds.ts";
export {
  normalizeHeadToHead,
  normalizeObservedMatchStats,
  normalizeStandingTable,
  type FootballNormalizationContext,
  type HeadToHeadNormalizationContext,
  type StatsNormalizationContext,
} from "./normalizers/football.ts";
export {
  TEAM_METRIC_CATALOG,
  TEAM_MINIMUM_SAMPLE,
  aggregateTeamSeasonSplits,
  aggregateTeamSquad,
  normalizeEventPlayerStats,
  normalizeTeamManager,
  normalizeTeamMatchMetrics,
  normalizeTeamProfile,
  normalizeTeamSquad,
  type PlayerMatchStatsContext,
  type TeamManagerContext,
  type TeamMatchMetricsContext,
  type TeamNormalizationContext,
  type TeamSeasonSplitsContext,
  type TeamSquadAggregationContext,
  type TeamSquadContext,
} from "./normalizers/team.ts";
