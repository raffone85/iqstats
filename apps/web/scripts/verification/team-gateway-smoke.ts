/**
 * Smoke in sola lettura del gateway TEAM-1 contro il provider reale.
 *
 * Uso:
 *   node --env-file=.env.local --experimental-strip-types scripts/verification/team-gateway-smoke.ts
 *
 * Non stampa token, header o payload grezzi: solo conteggi, campioni e stati.
 */
import { IqstatsGateway } from "../../src/server/iqstats/gateway-core.ts";
import { ProviderClient } from "../../src/server/iqstats/provider-client.ts";
import type { JsonSource } from "../../src/server/iqstats/provider-client.ts";

const TEAM_ID = "63";
const CURRENT_SEASON_ID = "1375";
const PREVIOUS_SEASON_ID = "358";
const MATCH_LIMIT = 4;

class CountingSource implements JsonSource {
  requests = 0;
  readonly #source: JsonSource;

  constructor(source: JsonSource) {
    this.#source = source;
  }

  async getJson(path: string): Promise<unknown> {
    this.requests += 1;
    return this.#source.getJson(path);
  }
}

function providerClient(): ProviderClient {
  const token = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
  if (!token) throw new Error("Token provider server-side non configurato.");
  const baseUrl =
    process.env.IQSTATS_PROVIDER_BASE_URL ??
    process.env.BSD_API_BASE_URL ??
    "https://sports.bzzoiro.com/api/v2/";
  return new ProviderClient({ baseUrl, token });
}

const source = new CountingSource(providerClient());
const gateway = new IqstatsGateway(source);

const profile = await gateway.getTeamProfile(TEAM_ID);
console.log("profilo:", {
  nome: profile.data?.name,
  stadio: profile.data?.venue?.name ?? null,
  stato: profile.availability.status,
  richieste: source.requests,
});

const currentSeason = await gateway.getTeamFinishedMatches(TEAM_ID, CURRENT_SEASON_ID);
console.log("stagione corrente:", {
  gareConcluse: currentSeason.data?.items.length ?? 0,
  richieste: source.requests,
});

const previousSeason = await gateway.getTeamFinishedMatches(TEAM_ID, PREVIOUS_SEASON_ID);
const foreign = previousSeason.data?.items.filter(
  (match) => match.homeTeam.id !== TEAM_ID && match.awayTeam.id !== TEAM_ID,
).length;
console.log("stagione precedente:", {
  gareConcluse: previousSeason.data?.items.length ?? 0,
  gareDiAltreSquadre: foreign,
  richieste: source.requests,
});

const before = source.requests;
const splits = await gateway.getTeamSeasonSplits(TEAM_ID, {
  seasonId: PREVIOUS_SEASON_ID,
  leagueId: null,
  limit: MATCH_LIMIT,
});
const shots = (venue: "home" | "away") =>
  splits.data?.[venue].metrics.find((entry) => entry.key === "shots");
console.log("medie casa/trasferta:", {
  gareCasa: splits.data?.home.matches,
  gareTrasferta: splits.data?.away.matches,
  tiriCasa: shots("home")?.average.value ?? null,
  campioneCasa: shots("home")?.sample,
  tiriTrasferta: shots("away")?.average.value ?? null,
  campioneTrasferta: shots("away")?.sample,
  stato: splits.availability.status,
  richieste: source.requests - before,
});

const beforeSquad = source.requests;
const squad = await gateway.getTeamSquadStats(TEAM_ID, {
  seasonId: PREVIOUS_SEASON_ID,
  leagueId: null,
  limit: 1,
});
console.log("rosa:", {
  tesserati: squad.data?.entries.length,
  conStatistiche: squad.data?.entries.filter((entry) => entry.stats !== null).length,
  gareCoperte: squad.data?.matchesCovered,
  stato: squad.availability.status,
  richieste: source.requests - beforeSquad,
});

console.log("richieste totali:", source.requests);
