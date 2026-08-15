import type { IqstatsGateway } from "./gateway-core.ts";
import type { DatabaseIqstatsGateway } from "./database-gateway.ts";
import type { MatchQuery } from "./query.ts";

export class HybridIqstatsGateway {
  readonly #database: DatabaseIqstatsGateway;
  readonly #provider: () => IqstatsGateway;

  constructor(database: DatabaseIqstatsGateway, provider: () => IqstatsGateway) {
    this.#database = database;
    this.#provider = provider;
  }

  getCompetitions() {
    return this.#database.getCompetitions();
  }

  getMatches(query: MatchQuery) {
    return this.#database.getMatches(query);
  }

  getMatchDetail(matchId: string) {
    return this.#database.getMatchDetail(matchId);
  }

  getStandings(leagueId: string, seasonId: string) {
    return this.#database.getStandings(leagueId, seasonId);
  }

  getOdds(matchId: string) {
    return this.#provider().getOdds(matchId);
  }

  getStatistics(matchId: string) {
    return this.#provider().getStatistics(matchId);
  }

  getHeadToHead(matchId: string) {
    return this.#provider().getHeadToHead(matchId);
  }
}
