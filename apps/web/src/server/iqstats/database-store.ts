import "server-only";

import postgres from "postgres";

import type { MatchQuery } from "./query.ts";

export interface CompetitionDatabaseRow {
  readonly competition_source_id: string;
  readonly competition_name: string;
  readonly country_name: string | null;
  readonly is_active: boolean;
  readonly observed_at: string;
  readonly source_updated_at: string | null;
  readonly season_source_id: string;
  readonly season_name: string;
  readonly starts_on: string;
  readonly ends_on: string;
  readonly is_current: boolean;
  readonly season_observed_at: string;
  readonly season_source_updated_at: string | null;
}

export interface MatchDatabaseRow {
  readonly match_source_id: string;
  readonly kickoff_at: string;
  readonly normalized_status: string;
  readonly status_detail: string | null;
  readonly round_name: string | null;
  readonly home_score: number | null;
  readonly away_score: number | null;
  readonly observed_at: string;
  readonly source_updated_at: string | null;
  readonly fresh_until: string | null;
  readonly competition_source_id: string;
  readonly competition_name: string;
  readonly competition_country_name: string | null;
  readonly competition_active: boolean;
  readonly season_source_id: string;
  readonly season_name: string;
  readonly season_starts_on: string;
  readonly season_ends_on: string;
  readonly season_is_current: boolean;
  readonly home_team_source_id: string;
  readonly home_team_name: string;
  readonly away_team_source_id: string;
  readonly away_team_name: string;
  readonly venue_source_id: string | null;
  readonly referee_source_id: string | null;
  readonly has_complete_standings: boolean;
}

export interface MatchDatabasePage {
  readonly rows: readonly MatchDatabaseRow[];
  readonly total: number;
}

export interface SeasonDatabaseRow {
  readonly competition_source_id: string;
  readonly season_source_id: string;
  readonly season_name: string;
  readonly observed_at: string;
  readonly source_updated_at: string | null;
}

export interface StandingDatabaseRow {
  readonly competition_source_id: string;
  readonly season_source_id: string;
  readonly season_name: string;
  readonly effective_at: string;
  readonly snapshot_observed_at: string;
  readonly source_updated_at: string | null;
  readonly team_source_id: string;
  readonly team_name: string;
  readonly position: number;
  readonly played: number | null;
  readonly won: number | null;
  readonly drawn: number | null;
  readonly lost: number | null;
  readonly goals_for: number | null;
  readonly goals_against: number | null;
  readonly goal_difference: number | null;
  readonly points: number | null;
  readonly form: string | null;
  readonly observed_at: string;
}

export interface FootballDataStore {
  listCompetitions(): Promise<readonly CompetitionDatabaseRow[]>;
  listMatches(query: MatchQuery): Promise<MatchDatabasePage>;
  getMatch(matchId: string): Promise<MatchDatabaseRow | null>;
  getSeason(leagueId: string, seasonId: string): Promise<SeasonDatabaseRow | null>;
  listStandings(leagueId: string, seasonId: string): Promise<readonly StandingDatabaseRow[]>;
}

function databaseMatchStatus(status: MatchQuery["status"]): string | null {
  switch (status) {
    case "not_started":
      return "scheduled";
    case "finished":
      return "finished";
    case "postponed":
      return "postponed";
    case "cancelled":
      return "canceled";
    case null:
      return null;
  }
}

function nextUtcDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export class PostgresFootballDataStore implements FootballDataStore {
  readonly #sql: ReturnType<typeof postgres>;

  constructor(sql: ReturnType<typeof postgres>) {
    this.#sql = sql;
  }

  async listCompetitions(): Promise<readonly CompetitionDatabaseRow[]> {
    return this.#sql<CompetitionDatabaseRow[]>`
      select
        competition_source_id::text,
        competition_name,
        country_name,
        is_active,
        observed_at::text,
        source_updated_at::text,
        season_source_id::text,
        season_name,
        starts_on::text,
        ends_on::text,
        is_current,
        season_observed_at::text,
        season_source_updated_at::text
      from football.app_competition_read_model
      order by country_name nulls last, competition_name, competition_source_id
    `;
  }

  async listMatches(query: MatchQuery): Promise<MatchDatabasePage> {
    const normalizedStatus = databaseMatchStatus(query.status);
    const dateFrom = `${query.date}T00:00:00.000Z`;
    const dateTo = `${nextUtcDate(query.date)}T00:00:00.000Z`;
    const [rows, totals] = await Promise.all([
      this.#sql<MatchDatabaseRow[]>`
        select
          match_source_id::text,
          kickoff_at::text,
          normalized_status,
          status_detail,
          round_name,
          home_score,
          away_score,
          observed_at::text,
          source_updated_at::text,
          fresh_until::text,
          competition_source_id::text,
          competition_name,
          competition_country_name,
          competition_active,
          season_source_id::text,
          season_name,
          season_starts_on::text,
          season_ends_on::text,
          season_is_current,
          home_team_source_id::text,
          home_team_name,
          away_team_source_id::text,
          away_team_name,
          venue_source_id::text,
          referee_source_id::text,
          has_complete_standings
        from football.app_match_read_model
        where competition_source_id = ${query.leagueId}::bigint
          and kickoff_at >= ${dateFrom}::timestamptz
          and kickoff_at < ${dateTo}::timestamptz
          and (${normalizedStatus}::text is null or normalized_status = ${normalizedStatus})
        order by kickoff_at, match_source_id
        limit ${query.limit}
        offset ${query.offset}
      `,
      this.#sql<{ readonly total: number }[]>`
        select count(*)::integer as total
        from football.app_match_read_model
        where competition_source_id = ${query.leagueId}::bigint
          and kickoff_at >= ${dateFrom}::timestamptz
          and kickoff_at < ${dateTo}::timestamptz
          and (${normalizedStatus}::text is null or normalized_status = ${normalizedStatus})
      `,
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  }

  async getMatch(matchId: string): Promise<MatchDatabaseRow | null> {
    const rows = await this.#sql<MatchDatabaseRow[]>`
      select
        match_source_id::text,
        kickoff_at::text,
        normalized_status,
        status_detail,
        round_name,
        home_score,
        away_score,
        observed_at::text,
        source_updated_at::text,
        fresh_until::text,
        competition_source_id::text,
        competition_name,
        competition_country_name,
        competition_active,
        season_source_id::text,
        season_name,
        season_starts_on::text,
        season_ends_on::text,
        season_is_current,
        home_team_source_id::text,
        home_team_name,
        away_team_source_id::text,
        away_team_name,
        venue_source_id::text,
        referee_source_id::text,
        has_complete_standings
      from football.app_match_read_model
      where match_source_id = ${matchId}::bigint
      limit 1
    `;
    return rows[0] ?? null;
  }

  async getSeason(leagueId: string, seasonId: string): Promise<SeasonDatabaseRow | null> {
    const rows = await this.#sql<SeasonDatabaseRow[]>`
      select
        competition.source_id::text as competition_source_id,
        season.source_id::text as season_source_id,
        season.name as season_name,
        season.observed_at::text,
        season.source_updated_at::text
      from football.seasons season
      join football.competitions competition on competition.id = season.competition_id
      where competition.source_id = ${leagueId}::bigint
        and season.source_id = ${seasonId}::bigint
        and season.ingest_scope = 'product_current'
      limit 1
    `;
    return rows[0] ?? null;
  }

  async listStandings(
    leagueId: string,
    seasonId: string,
  ): Promise<readonly StandingDatabaseRow[]> {
    return this.#sql<StandingDatabaseRow[]>`
      select
        competition_source_id::text,
        season_source_id::text,
        season_name,
        effective_at::text,
        snapshot_observed_at::text,
        source_updated_at::text,
        team_source_id::text,
        team_name,
        position,
        played,
        won,
        drawn,
        lost,
        goals_for,
        goals_against,
        goal_difference,
        points,
        form,
        observed_at::text
      from football.app_standing_read_model
      where competition_source_id = ${leagueId}::bigint
        and season_source_id = ${seasonId}::bigint
      order by position, team_source_id
    `;
  }
}
