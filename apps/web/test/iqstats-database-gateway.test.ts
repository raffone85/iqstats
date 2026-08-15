import assert from "node:assert/strict";
import test from "node:test";

import { DatabaseIqstatsGateway } from "../src/server/iqstats/database-gateway.ts";
import type {
  CompetitionDatabaseRow,
  FootballDataStore,
  MatchDatabasePage,
  MatchDatabaseRow,
  SeasonDatabaseRow,
  StandingDatabaseRow,
} from "../src/server/iqstats/database-store.ts";
import { GatewayError } from "../src/server/iqstats/errors.ts";
import type { MatchQuery } from "../src/server/iqstats/query.ts";

const capturedAt = "2026-08-09T12:00:00.000Z";

const competition: CompetitionDatabaseRow = {
  competition_source_id: "9",
  competition_name: "Campionato verificato",
  country_name: "Paese verificato",
  is_active: true,
  observed_at: "2026-08-09T10:00:00+00:00",
  source_updated_at: null,
  season_source_id: "28",
  season_name: "Stagione verificata",
  starts_on: "2026-07-01",
  ends_on: "2027-05-31",
  is_current: true,
  season_observed_at: "2026-08-09T10:00:00+00:00",
  season_source_updated_at: null,
};

const match: MatchDatabaseRow = {
  match_source_id: "7198",
  kickoff_at: "2026-08-09T18:30:00+00:00",
  normalized_status: "scheduled",
  status_detail: "notstarted",
  round_name: "Giornata 1",
  home_score: null,
  away_score: null,
  observed_at: "2026-08-09T10:00:00+00:00",
  source_updated_at: null,
  fresh_until: "2026-08-09T16:00:00+00:00",
  competition_source_id: "9",
  competition_name: "Campionato verificato",
  competition_country_name: "Paese verificato",
  competition_active: true,
  season_source_id: "28",
  season_name: "Stagione verificata",
  season_starts_on: "2026-07-01",
  season_ends_on: "2027-05-31",
  season_is_current: true,
  home_team_source_id: "101",
  home_team_name: "Squadra casa",
  away_team_source_id: "102",
  away_team_name: "Squadra ospite",
  venue_source_id: null,
  referee_source_id: null,
  has_complete_standings: true,
};

const season: SeasonDatabaseRow = {
  competition_source_id: "9",
  season_source_id: "28",
  season_name: "Stagione verificata",
  observed_at: "2026-08-09T10:00:00+00:00",
  source_updated_at: null,
};

const standing: StandingDatabaseRow = {
  competition_source_id: "9",
  season_source_id: "28",
  season_name: "Stagione verificata",
  effective_at: "2026-08-09T09:00:00+00:00",
  snapshot_observed_at: "2026-08-09T10:00:00+00:00",
  source_updated_at: null,
  team_source_id: "101",
  team_name: "Squadra casa",
  position: 1,
  played: 1,
  won: 1,
  drawn: 0,
  lost: 0,
  goals_for: 2,
  goals_against: 0,
  goal_difference: 2,
  points: 3,
  form: "W",
  observed_at: "2026-08-09T10:00:00+00:00",
};

class FixtureStore implements FootballDataStore {
  standings: readonly StandingDatabaseRow[] = [standing];
  season: SeasonDatabaseRow | null = season;
  error: Error | null = null;

  async #result<T>(value: T): Promise<T> {
    if (this.error) throw this.error;
    return value;
  }

  listCompetitions(): Promise<readonly CompetitionDatabaseRow[]> {
    return this.#result([competition]);
  }

  listMatches(): Promise<MatchDatabasePage> {
    return this.#result({ rows: [match], total: 1 });
  }

  getMatch(matchId: string): Promise<MatchDatabaseRow | null> {
    return this.#result(matchId === match.match_source_id ? match : null);
  }

  getSeason(): Promise<SeasonDatabaseRow | null> {
    return this.#result(this.season);
  }

  listStandings(): Promise<readonly StandingDatabaseRow[]> {
    return this.#result(this.standings);
  }
}

function query(): MatchQuery {
  return {
    date: "2026-08-09",
    leagueId: "9",
    status: null,
    limit: 25,
    offset: 0,
  };
}

test("espone dal database soltanto identificativi sorgente e dati DATA-1", async () => {
  const gateway = new DatabaseIqstatsGateway(new FixtureStore(), () => capturedAt);
  const competitions = await gateway.getCompetitions();
  const matches = await gateway.getMatches(query());
  const detail = await gateway.getMatchDetail("7198");

  assert.equal(competitions.data?.[0]?.id, "9");
  assert.equal(competitions.data?.[0]?.currentSeason?.id, "28");
  assert.equal(matches.data?.items[0]?.id, "7198");
  assert.equal(matches.data?.items[0]?.homeTeam.id, "101");
  assert.equal(matches.data?.items[0]?.score.status, "unavailable");
  assert.equal(matches.data?.items[0]?.score.reason, "not_applicable");
  assert.equal(matches.data?.items[0]?.sectionAvailability.standings.status, "available");
  assert.equal(matches.data?.items[0]?.sectionAvailability.statistics.status, "unavailable");
  assert.equal(detail.data?.seasonId, "28");
  assert.equal(detail.data?.currentMinute, null);
});

test("propaga freschezza, paginazione e indisponibilità classifica", async () => {
  const store = new FixtureStore();
  const staleGateway = new DatabaseIqstatsGateway(store, () => "2026-08-09T17:00:00.000Z");
  const matches = await staleGateway.getMatches(query());
  assert.equal(matches.availability.status, "stale");
  assert.equal(matches.data?.hasNextPage, false);
  assert.equal(matches.data?.hasPreviousPage, false);

  store.standings = [];
  const standings = await staleGateway.getStandings("9", "28");
  assert.equal(standings.data, null);
  assert.equal(standings.availability.status, "unavailable");
  assert.equal(standings.availability.reason, "insufficient_coverage");
});

test("classifica completa conserva null ed espone limiti del contratto", async () => {
  const gateway = new DatabaseIqstatsGateway(new FixtureStore(), () => capturedAt);
  const result = await gateway.getStandings("9", "28");
  assert.equal(result.data?.rows.length, 1);
  assert.equal(result.data?.rows[0]?.teamId, "101");
  assert.equal(result.data?.rows[0]?.expectedGoalsFor, null);
  assert.equal(result.data?.rows[0]?.compactForm.status, "available");
  assert.equal(result.data?.detailedFormAvailability.reason, "not_exposed_by_source");
});

test("risorsa assente ed errore database restano sanificati", async () => {
  const store = new FixtureStore();
  const gateway = new DatabaseIqstatsGateway(store, () => capturedAt);
  await assert.rejects(
    () => gateway.getMatchDetail("999999"),
    (reason) => reason instanceof GatewayError && reason.code === "not_found",
  );

  store.error = new Error("dettaglio database riservato");
  await assert.rejects(
    () => gateway.getCompetitions(),
    (reason) => reason instanceof GatewayError && reason.code === "source_unavailable",
  );
});
