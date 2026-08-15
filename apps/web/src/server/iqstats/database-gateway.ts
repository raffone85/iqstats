import type {
  CompetitionSummary,
  DataAvailability,
  DataEnvelope,
  DataProvenance,
  FieldValue,
  MatchDetail,
  MatchList,
  MatchScore,
  MatchSection,
  MatchStatus,
  MatchSummary,
  StandingEntry,
  StandingTable,
} from "@iqstats/shared";

import { GatewayError } from "./errors.ts";
import type {
  CompetitionDatabaseRow,
  FootballDataStore,
  MatchDatabaseRow,
  StandingDatabaseRow,
} from "./database-store.ts";
import type { MatchQuery } from "./query.ts";

const matchSections: readonly MatchSection[] = [
  "odds",
  "statistics",
  "form",
  "standings",
  "headToHead",
  "context",
  "signals",
];

function availability(
  status: DataAvailability["status"],
  reason: DataAvailability["reason"],
  missingFields: readonly string[] = [],
  availableCount: number | null = null,
  total: number | null = null,
): DataAvailability {
  return {
    status,
    reason,
    missingFields,
    coverage:
      availableCount === null || total === null
        ? null
        : {
            available: availableCount,
            total,
            ratio: total > 0 ? availableCount / total : null,
          },
  };
}

function provenance(
  capturedAt: string,
  sourceUpdatedAt: string | null,
  asOf: string | null,
): DataProvenance {
  return {
    sourceKind: "external-data",
    capturedAt,
    sourceUpdatedAt,
    asOf,
  };
}

function availableValue<T>(value: T): FieldValue<T> {
  return { status: "available", value, reason: null };
}

function unavailableValue<T>(reason: "not_applicable" | "not_captured"): FieldValue<T> {
  return { status: "unavailable", value: null, reason };
}

function latestDate(values: readonly (string | null)[]): string | null {
  let latest: string | null = null;
  let latestMilliseconds = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value === null) continue;
    const milliseconds = Date.parse(value);
    if (!Number.isNaN(milliseconds) && milliseconds > latestMilliseconds) {
      latest = value;
      latestMilliseconds = milliseconds;
    }
  }
  return latest;
}

function matchStatus(value: string): MatchStatus {
  switch (value) {
    case "scheduled":
      return "not_started";
    case "live":
      return "live";
    case "finished":
      return "finished";
    case "postponed":
      return "postponed";
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function competitionFromMatch(row: MatchDatabaseRow): CompetitionSummary {
  return {
    id: row.competition_source_id,
    name: row.competition_name,
    country: row.competition_country_name,
    active: row.competition_active,
    currentSeason: {
      id: row.season_source_id,
      name: row.season_name,
      year: Number(row.season_starts_on.slice(0, 4)) || null,
      startsOn: row.season_starts_on,
      endsOn: row.season_ends_on,
      current: row.season_is_current,
    },
  };
}

function sectionAvailability(row: MatchDatabaseRow): Readonly<Record<MatchSection, DataAvailability>> {
  return Object.fromEntries(
    matchSections.map((section) => [
      section,
      section === "standings" && row.has_complete_standings
        ? availability("available", null)
        : availability("unavailable", "not_captured"),
    ]),
  ) as Readonly<Record<MatchSection, DataAvailability>>;
}

function matchFromRow(row: MatchDatabaseRow, capturedAt: string): MatchSummary {
  const status = matchStatus(row.normalized_status);
  const score: FieldValue<MatchScore> =
    row.home_score !== null && row.away_score !== null
      ? availableValue({ home: row.home_score, away: row.away_score })
      : unavailableValue(status === "not_started" ? "not_applicable" : "not_captured");
  const isStale = row.fresh_until !== null && Date.parse(row.fresh_until) < Date.parse(capturedAt);
  const itemAvailability =
    status === "unknown"
      ? availability("partial", "validation_failed", ["status"])
      : isStale
        ? availability("stale", "stale_snapshot", ["freshUntil"])
        : availability("available", null);

  return {
    id: row.match_source_id,
    kickoffAt: row.kickoff_at,
    status,
    competition: competitionFromMatch(row),
    seasonId: row.season_source_id,
    refereeId: row.referee_source_id,
    homeTeam: { id: row.home_team_source_id, name: row.home_team_name },
    awayTeam: { id: row.away_team_source_id, name: row.away_team_name },
    score,
    round: row.round_name,
    sectionAvailability: sectionAvailability(row),
    availability: itemAvailability,
    provenance: provenance(capturedAt, row.source_updated_at, row.observed_at),
  };
}

function standingFromRow(row: StandingDatabaseRow): StandingEntry {
  const compactForm = row.form && /^[WDL]+$/.test(row.form)
    ? availableValue(row.form)
    : unavailableValue<string>("not_captured");
  const nullableFields = {
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goals_for,
    goalsAgainst: row.goals_against,
    goalDifference: row.goal_difference,
    points: row.points,
  };
  const missingFields = [
    ...Object.entries(nullableFields)
      .filter(([, value]) => value === null)
      .map(([field]) => field),
    "expectedGoalsFor",
    "expectedGoalsAgainst",
    ...(compactForm.status === "unavailable" ? ["compactForm"] : []),
  ];
  return {
    position: row.position,
    teamId: row.team_source_id,
    teamName: row.team_name,
    ...nullableFields,
    expectedGoalsFor: null,
    expectedGoalsAgainst: null,
    compactForm,
    availability: availability("partial", "not_captured", missingFields),
  };
}

export class DatabaseIqstatsGateway {
  readonly #store: FootballDataStore;
  readonly #clock: () => string;

  constructor(store: FootballDataStore, clock: () => string = () => new Date().toISOString()) {
    this.#store = store;
    this.#clock = clock;
  }

  async #read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (reason) {
      if (reason instanceof GatewayError) throw reason;
      throw new GatewayError("source_unavailable");
    }
  }

  async getCompetitions(): Promise<DataEnvelope<readonly CompetitionSummary[]>> {
    const capturedAt = this.#clock();
    const rows = await this.#read(() => this.#store.listCompetitions());
    const data = rows.map((row: CompetitionDatabaseRow): CompetitionSummary => ({
      id: row.competition_source_id,
      name: row.competition_name,
      country: row.country_name,
      active: row.is_active,
      currentSeason: {
        id: row.season_source_id,
        name: row.season_name,
        year: Number(row.starts_on.slice(0, 4)) || null,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        current: row.is_current,
      },
    }));
    return {
      data,
      availability: availability("available", null, [], data.length, rows.length),
      provenance: provenance(
        capturedAt,
        latestDate(rows.flatMap((row) => [row.source_updated_at, row.season_source_updated_at])),
        latestDate(rows.flatMap((row) => [row.observed_at, row.season_observed_at])),
      ),
      calculation: null,
    };
  }

  async getMatches(query: MatchQuery): Promise<DataEnvelope<MatchList>> {
    const capturedAt = this.#clock();
    const page = await this.#read(() => this.#store.listMatches(query));
    const items = page.rows.map((row) => matchFromRow(row, capturedAt));
    const partialItems = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.availability.status === "partial");
    const staleItems = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.availability.status === "stale");
    const envelopeAvailability = partialItems.length > 0
      ? availability(
          "partial",
          "validation_failed",
          partialItems.map(({ index }) => `items[${index}].status`),
          items.length - partialItems.length,
          items.length,
        )
      : staleItems.length > 0
        ? availability(
            "stale",
            "stale_snapshot",
            staleItems.map(({ index }) => `items[${index}].freshUntil`),
            items.length - staleItems.length,
            items.length,
          )
        : availability("available", null, [], items.length, items.length);
    return {
      data: {
        items,
        total: page.total,
        hasNextPage: query.offset + items.length < page.total,
        hasPreviousPage: query.offset > 0,
      },
      availability: envelopeAvailability,
      provenance: provenance(
        capturedAt,
        latestDate(page.rows.map((row) => row.source_updated_at)),
        latestDate(page.rows.map((row) => row.observed_at)),
      ),
      calculation: null,
    };
  }

  async getMatchDetail(matchId: string): Promise<DataEnvelope<MatchDetail>> {
    const capturedAt = this.#clock();
    const row = await this.#read(() => this.#store.getMatch(matchId));
    if (row === null) throw new GatewayError("not_found");
    const summary = matchFromRow(row, capturedAt);
    return {
      data: {
        ...summary,
        seasonId: row.season_source_id,
        venueId: row.venue_source_id,
        refereeId: row.referee_source_id,
        currentMinute: null,
        neutralGround: null,
        localDerby: null,
      },
      availability: summary.availability,
      provenance: summary.provenance,
      calculation: null,
    };
  }

  async getStandings(
    leagueId: string,
    seasonId: string,
  ): Promise<DataEnvelope<StandingTable>> {
    const capturedAt = this.#clock();
    const [season, rawRows] = await this.#read(() =>
      Promise.all([
        this.#store.getSeason(leagueId, seasonId),
        this.#store.listStandings(leagueId, seasonId),
      ]),
    );
    if (season === null) throw new GatewayError("not_found");
    if (rawRows.length === 0) {
      return {
        data: null,
        availability: availability("unavailable", "insufficient_coverage", ["standings"], 0, 0),
        provenance: provenance(capturedAt, season.source_updated_at, season.observed_at),
        calculation: null,
      };
    }
    const rows = rawRows.map(standingFromRow);
    return {
      data: {
        leagueId,
        seasonId,
        seasonName: season.season_name,
        rows,
        detailedFormAvailability: availability("unavailable", "not_exposed_by_source"),
      },
      availability: availability("available", null, [], rows.length, rows.length),
      provenance: provenance(
        capturedAt,
        latestDate(rawRows.map((row) => row.source_updated_at)),
        latestDate(rawRows.map((row) => row.effective_at)),
      ),
      calculation: null,
    };
  }
}
