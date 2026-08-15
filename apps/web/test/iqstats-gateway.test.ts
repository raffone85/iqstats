import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { JsonSource } from "../src/server/iqstats/provider-client.ts";
import { GatewayError } from "../src/server/iqstats/errors.ts";
import { IqstatsGateway } from "../src/server/iqstats/gateway-core.ts";
import { ProviderClient } from "../src/server/iqstats/provider-client.ts";
import {
  assertNoQuery,
  parseMatchesQuery,
  parseSeasonQuery,
  parseTeamSeasonQuery,
  positiveIntegerId,
} from "../src/server/iqstats/query.ts";
import { errorResponse } from "../src/server/iqstats/responses.ts";
import { selectCompetition } from "../src/server/iqstats/team-selection.ts";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const capturedAt = "2026-08-01T20:30:00.000Z";

function readJson(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(`${workspace}${relativePath}`, "utf8"));
}

function requireData<T>(value: { readonly data: T | null }): T {
  assert.notEqual(value.data, null);
  return value.data as T;
}

function errorCode(reason: unknown): string | null {
  return reason instanceof GatewayError ? reason.code : null;
}

class FixtureSource implements JsonSource {
  readonly requests: string[] = [];
  readonly #responses: ReadonlyMap<string, unknown>;

  constructor(entries: readonly (readonly [string, unknown])[]) {
    this.#responses = new Map(entries);
  }

  async getJson(path: string): Promise<unknown> {
    this.requests.push(path);
    if (!this.#responses.has(path)) throw new Error(`Fixture non registrata: ${path}`);
    return this.#responses.get(path);
  }
}

const catalogPath = "/api/v2/leagues/?limit=100&offset=0";
const catalog = readJson("scripts/calibration/discovery/leagues.json");
const finishedDetail = readJson(
  "scripts/app-discovery/output/2026-08-01/event-finished-detail.json",
);

test("valida query pubbliche senza ampliare implicitamente lo scope", () => {
  const query = parseMatchesQuery(
    new URLSearchParams({
      date: "2026-08-01",
      leagueId: "9",
      status: "finished",
      limit: "25",
      offset: "50",
    }),
  );
  assert.deepEqual(query, {
    date: "2026-08-01",
    leagueId: "9",
    status: "finished",
    limit: 25,
    offset: 50,
  });
  assert.equal(parseSeasonQuery(new URLSearchParams({ seasonId: "28" })), "28");
  assert.equal(positiveIntegerId("7198"), "7198");
  assert.doesNotThrow(() => assertNoQuery(new URLSearchParams()));

  const invalidQueries = [
    new URLSearchParams({ leagueId: "9" }),
    new URLSearchParams({ date: "2026-02-30", leagueId: "9" }),
    new URLSearchParams({ date: "2026-08-01", leagueId: "0" }),
    new URLSearchParams({ date: "2026-08-01", leagueId: "9", status: "live" }),
    new URLSearchParams({ date: "2026-08-01", leagueId: "9", countryId: "BR" }),
    new URLSearchParams("date=2026-08-01&date=2026-08-02&leagueId=9"),
  ];
  for (const params of invalidQueries) {
    assert.throws(() => parseMatchesQuery(params), (reason) => errorCode(reason) === "invalid_request");
  }
});

test("client server-side applica header e converte status senza esporre dettagli", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const client = new ProviderClient({
    baseUrl: "https://source.invalid/api/v2/",
    token: "test-token",
    fetchImplementation: async (input, init) => {
      observedUrl = String(input);
      observedInit = init;
      return Response.json({ ok: true });
    },
  });

  assert.deepEqual(await client.getJson("/api/v2/leagues/?limit=1"), { ok: true });
  assert.equal(observedUrl, "https://source.invalid/api/v2/leagues/?limit=1");
  assert.equal(observedInit?.method, "GET");
  assert.equal(observedInit?.cache, "no-store");
  assert.equal(new Headers(observedInit?.headers).get("authorization"), "Token test-token");

  const cases: readonly [Response | Error, string][] = [
    [new Response(null, { status: 404 }), "not_found"],
    [new Response(null, { status: 429 }), "source_rate_limited"],
    [new Response("temporaneo", { status: 503 }), "source_unavailable"],
    [new Response("non-json", { status: 200 }), "source_invalid_response"],
    [new DOMException("timeout", "TimeoutError"), "source_timeout"],
  ];
  for (const [outcome, expectedCode] of cases) {
    const failing = new ProviderClient({
      baseUrl: "https://source.invalid/api/v2/",
      token: "test-token",
      fetchImplementation: async () => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    });
    await assert.rejects(
      () => failing.getJson("/api/v2/events/7198/"),
      (reason) => errorCode(reason) === expectedCode,
    );
  }
});

test("normalizza catalogo, lista e dettaglio attraverso il gateway", async () => {
  const listPath =
    "/api/v2/events/?league_id=9&date_from=2026-08-01&date_to=2026-08-01&limit=10&offset=0&status=finished";
  const source = new FixtureSource([
    [catalogPath, catalog],
    [listPath, readJson("scripts/app-discovery/output/2026-08-01/events-finished-sample.json")],
    ["/api/v2/events/7198/", finishedDetail],
  ]);
  const gateway = new IqstatsGateway(source, () => capturedAt);

  const competitions = requireData(await gateway.getCompetitions());
  assert.equal(competitions.length, 72);

  const matches = requireData(
    await gateway.getMatches({
      date: "2026-08-01",
      leagueId: "9",
      status: "finished",
      limit: 10,
      offset: 0,
    }),
  );
  assert.equal(matches.items.length, 10);
  assert.ok(matches.items.every((match) => match.competition.id === "9"));

  const detail = requireData(await gateway.getMatchDetail("7198"));
  assert.equal(detail.id, "7198");
  assert.equal(detail.provenance.sourceKind, "external-data");
  assert.equal(detail.provenance.capturedAt, capturedAt);
});

test("restituisce tutte le 448 quote e conserva i limiti documentati", async () => {
  const source = new FixtureSource([
    [
      "/api/v2/odds/?event_id=7198&limit=200&offset=0",
      readJson("scripts/app-discovery/output/2026-08-01/event-finished-odds-list.json"),
    ],
    [
      "/api/v2/odds/?event_id=7198&limit=200&offset=200",
      readJson(
        "scripts/app-discovery/output/2026-08-01/event-finished-odds-list-offset-200.json",
      ),
    ],
    [
      "/api/v2/odds/?event_id=7198&limit=200&offset=400",
      readJson(
        "scripts/app-discovery/output/2026-08-01/event-finished-odds-list-offset-400.json",
      ),
    ],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getOdds("7198");
  const odds = requireData(result);

  assert.equal(result.availability.status, "available");
  assert.equal(odds.items.length, 448);
  assert.equal(odds.markets.length, 11);
  assert.equal(
    odds.items.filter((item) => item.previousDecimalOdds.status === "available").length,
    347,
  );
  assert.ok(odds.items.every((item) => item.matchId === "7198"));
  assert.ok(
    odds.items.every(
      (item) =>
        item.openingDecimalOdds.status === "unavailable" &&
        item.openingDecimalOdds.reason === "not_exposed_by_source" &&
        item.closingDecimalOdds.status === "unavailable" &&
        item.closingDecimalOdds.reason === "not_exposed_by_source",
    ),
  );
  assert.ok(odds.items.every((item) => !Object.hasOwn(item, "event_id")));
  assert.equal(source.requests.length, 3);
});

test("una pagina quote troncata rimane partial", async () => {
  const first = readJson(
    "scripts/app-discovery/output/2026-08-01/event-finished-odds-list.json",
  );
  assert.ok(first && typeof first === "object" && !Array.isArray(first));
  const truncated = { ...(first as Record<string, unknown>), next: null };
  const source = new FixtureSource([
    ["/api/v2/odds/?event_id=7198&limit=200&offset=0", truncated],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getOdds("7198");
  assert.equal(result.availability.status, "partial");
  assert.equal(result.availability.reason, "insufficient_coverage");
  assert.equal(result.availability.coverage?.available, 200);
  assert.equal(result.availability.coverage?.total, 448);
});

test("normalizza classifica, forma compatta e H2H senza ricostruzioni", async () => {
  const source = new FixtureSource([
    [
      "/api/v2/leagues/9/standings/?season_id=28",
      readJson("scripts/app-discovery/output/2026-08-01/league-standings.json"),
    ],
    [
      "/api/v2/events/7198/h2h/",
      readJson("scripts/app-discovery/output/2026-08-01/event-finished-h2h.json"),
    ],
  ]);
  const gateway = new IqstatsGateway(source, () => capturedAt);
  const standings = requireData(await gateway.getStandings("9", "28"));
  const h2h = requireData(await gateway.getHeadToHead("7198"));

  assert.equal(standings.rows.length, 20);
  assert.ok(standings.rows.every((row) => row.compactForm.status === "available"));
  assert.equal(standings.detailedFormAvailability.status, "unavailable");
  assert.equal(standings.detailedFormAvailability.reason, "not_exposed_by_source");
  assert.equal(h2h.matchId, "7198");
  assert.equal(h2h.totalMatches, 4);
});

test("statistiche gateway preservano null e usano ID team verificati", async () => {
  const events = readJson(
    "scripts/calibration/context/data/2026-07-23/events/4/calibration.json",
  ) as { readonly events?: readonly Record<string, unknown>[] };
  const event = events.events?.find((candidate) => candidate.eventId === 1456);
  assert.ok(event);
  const source = new FixtureSource([
    [
      "/api/v2/events/1456/",
      { home_team_id: event.homeTeamId, away_team_id: event.awayTeamId },
    ],
    [
      "/api/v2/events/1456/stats/",
      readJson("scripts/calibration/discovery/sample-match-1456.json"),
    ],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getStatistics("1456");
  const stats = requireData(result);
  assert.equal(stats.teams[0].teamId, String(event.homeTeamId));
  assert.equal(stats.teams[1].teamId, String(event.awayTeamId));
  assert.equal(stats.teams[0].metrics.offsides, null);
  assert.equal(stats.teams[1].metrics.offsides, null);
});

test("errore pubblico è stabile e non propaga dettagli interni", async () => {
  const response = errorResponse(new Error("Authorization: Token non-deve-uscire"));
  const body = await response.text();
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(body, /"code":"internal_error"/);
  assert.doesNotMatch(body, /Authorization|non-deve-uscire|source\.invalid/i);
});

const teamDiscovery = "scripts/app-discovery/output/2026-08-13-team-profile";
const teamId = "63";

interface EventsPage {
  readonly count: number;
  readonly next: string | null;
  readonly previous: string | null;
  readonly results: readonly Record<string, unknown>[];
}

/** Sottoinsieme reale dell'elenco gare: solo gli eventi di cui esiste la fixture statistiche. */
function teamEventsPage(eventIds: readonly number[]): EventsPage {
  const page = readJson(`${teamDiscovery}/events-by-team-previous-season.json`) as EventsPage;
  const results = page.results.filter((event) => eventIds.includes(event.id as number));
  assert.equal(results.length, eventIds.length);
  return { count: results.length, next: null, previous: null, results };
}

const teamEventsPath =
  "/api/v2/events/?team_id=63&status=finished&limit=50&season_id=358";

test("il profilo squadra compone identità e stadio da due endpoint", async () => {
  const source = new FixtureSource([
    ["/api/v2/teams/63/", readJson(`${teamDiscovery}/team-detail.json`)],
    ["/api/v2/venues/63/", readJson(`${teamDiscovery}/venue-detail.json`)],
  ]);
  const profile = requireData(
    await new IqstatsGateway(source, () => capturedAt).getTeamProfile(teamId),
  );
  assert.equal(profile.name, "AC Milan");
  assert.equal(profile.venue?.capacity, 75817);
  assert.deepEqual(source.requests, ["/api/v2/teams/63/", "/api/v2/venues/63/"]);
});

test("uno stadio non disponibile non fa cadere la testata", async () => {
  const source = new FixtureSource([
    ["/api/v2/teams/63/", readJson(`${teamDiscovery}/team-detail.json`)],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getTeamProfile(teamId);
  assert.equal(requireData(result).venue, null);
  assert.equal(result.availability.status, "partial");
  assert.deepEqual(result.availability.missingFields, ["venue"]);
});

test("le medie casa/trasferta aggregano una gara per richiesta e dichiarano il campione", async () => {
  const eventIds = [1453, 1433, 1413, 1440, 1425, 1398];
  const source = new FixtureSource([
    [catalogPath, catalog],
    [teamEventsPath, teamEventsPage(eventIds)],
    ["/api/v2/events/1453/stats/", readJson(`${teamDiscovery}/event-stats-home-1.json`)],
    ["/api/v2/events/1433/stats/", readJson(`${teamDiscovery}/event-stats-home-2.json`)],
    ["/api/v2/events/1413/stats/", readJson(`${teamDiscovery}/event-stats-home-3.json`)],
    ["/api/v2/events/1440/stats/", readJson(`${teamDiscovery}/event-stats-away-1.json`)],
    ["/api/v2/events/1425/stats/", readJson(`${teamDiscovery}/event-stats-away-2.json`)],
    ["/api/v2/events/1398/stats/", readJson(`${teamDiscovery}/event-stats-away-3.json`)],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getTeamSeasonSplits(teamId, {
    seasonId: "358",
    leagueId: null,
  });
  const splits = requireData(result);

  assert.equal(splits.home.matches, 3);
  assert.equal(splits.away.matches, 3);
  assert.equal(splits.minimumSample, 3);
  const homeShots = splits.home.metrics.find((entry) => entry.key === "shots");
  assert.equal(homeShots?.sample, 3);
  assert.ok(Math.abs((homeShots?.average.value ?? 0) - 44 / 3) < 1e-9);
  assert.equal(result.calculation?.sampleSize, 6);
  assert.equal(result.availability.status, "available");
  // Costo dichiarato: catalogo, elenco gare e una statistica per gara.
  assert.equal(source.requests.length, 8);
});

test("una statistica gara non disponibile riduce il campione senza far cadere il blocco", async () => {
  const eventIds = [1453, 1433, 1413];
  const source = new FixtureSource([
    [catalogPath, catalog],
    [teamEventsPath, teamEventsPage(eventIds)],
    ["/api/v2/events/1453/stats/", readJson(`${teamDiscovery}/event-stats-home-1.json`)],
    ["/api/v2/events/1433/stats/", readJson(`${teamDiscovery}/event-stats-home-2.json`)],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getTeamSeasonSplits(teamId, {
    seasonId: "358",
    leagueId: null,
  });
  assert.equal(requireData(result).home.matches, 2);
  assert.equal(result.availability.status, "partial");
  assert.ok(result.availability.missingFields.includes("eventStats"));
  assert.deepEqual(result.availability.coverage, { available: 2, total: 3, ratio: 2 / 3 });
});

test("il filtro competizione taglia le gare prima del limite", async () => {
  const eventIds = [1453, 1433, 1413];
  const source = new FixtureSource([
    [catalogPath, catalog],
    [teamEventsPath, teamEventsPage(eventIds)],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getTeamSeasonSplits(teamId, {
    seasonId: "358",
    leagueId: "999",
  });
  assert.equal(requireData(result).home.matches, 0);
  assert.equal(result.availability.status, "unavailable");
  // Nessuna gara selezionata: nessuna richiesta di statistiche.
  assert.equal(source.requests.length, 2);
});

test("la rosa statistica costa un GET per gara, non uno per giocatore", async () => {
  const source = new FixtureSource([
    [catalogPath, catalog],
    [teamEventsPath, teamEventsPage([1453])],
    ["/api/v2/teams/63/squad/", readJson(`${teamDiscovery}/team-squad.json`)],
    [
      "/api/v2/events/1453/player-stats/",
      readJson(`${teamDiscovery}/event-player-stats-1.json`),
    ],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getTeamSquadStats(teamId, {
    seasonId: "358",
    leagueId: null,
  });
  const squad = requireData(result);

  assert.equal(squad.entries.length, 42);
  assert.equal(squad.matchesCovered, 1);
  assert.equal(squad.entries.filter((entry) => entry.stats !== null).length, 25);
  assert.equal(source.requests.length, 4);
  assert.equal(
    source.requests.filter((path) => path.includes("/players/")).length,
    0,
  );
});

test("la query stagionale rifiuta scope impliciti e limiti fuori intervallo", () => {
  assert.deepEqual(parseTeamSeasonQuery(new URLSearchParams({ seasonId: "358" })), {
    seasonId: "358",
    leagueId: null,
  });
  assert.deepEqual(
    parseTeamSeasonQuery(new URLSearchParams({ seasonId: "358", leagueId: "4", limit: "10" })),
    { seasonId: "358", leagueId: "4", limit: 10 },
  );

  const invalidQueries = [
    new URLSearchParams(),
    new URLSearchParams({ leagueId: "4" }),
    new URLSearchParams({ seasonId: "0" }),
    new URLSearchParams({ seasonId: "358", limit: "0" }),
    new URLSearchParams({ seasonId: "358", limit: "51" }),
    new URLSearchParams({ seasonId: "358", venue: "home" }),
    new URLSearchParams("seasonId=358&seasonId=1375"),
  ];
  for (const params of invalidQueries) {
    assert.throws(
      () => parseTeamSeasonQuery(params),
      (reason) => errorCode(reason) === "invalid_request",
    );
  }
});

test("l'allenatore è derivato dalla gara e la provenienza resta nel dato", async () => {
  const upcoming = readJson(`${teamDiscovery}/team-fixtures-upcoming.json`) as EventsPage;
  const managerId = 483; // l'unico profilo allenatore disponibile fra le fixture
  const aligned = {
    ...upcoming,
    results: upcoming.results.map((event) => ({ ...event, home_coach_id: managerId })),
  };
  const source = new FixtureSource([
    ["/api/v2/teams/63/fixtures/?status=notstarted&limit=10", aligned],
    [`/api/v2/managers/${managerId}/`, readJson(`${teamDiscovery}/manager-detail.json`)],
  ]);
  const manager = requireData(
    await new IqstatsGateway(source, () => capturedAt).getTeamManager(teamId),
  );

  assert.equal(manager.name, "Massimiliano Allegri");
  assert.equal(manager.derivedFromMatchId, "219707");
  // Il provider dichiara una squadra diversa: il dato lo riporta senza spacciarlo
  // per allenatore corrente della squadra richiesta.
  assert.equal(manager.currentTeamId, "62");
  assert.equal(source.requests.length, 2);
});

test("un profilo allenatore che non corrisponde alla gara viene rifiutato", async () => {
  const source = new FixtureSource([
    [
      "/api/v2/teams/63/fixtures/?status=notstarted&limit=10",
      readJson(`${teamDiscovery}/team-fixtures-upcoming.json`),
    ],
    ["/api/v2/managers/1813/", readJson(`${teamDiscovery}/manager-detail.json`)],
  ]);
  await assert.rejects(
    () => new IqstatsGateway(source, () => capturedAt).getTeamManager(teamId),
    (reason) => errorCode(reason) === "source_invalid_response",
  );
});

test("senza gare in programma l'allenatore è dichiarato assente, non inventato", async () => {
  const source = new FixtureSource([
    [
      "/api/v2/teams/63/fixtures/?status=notstarted&limit=10",
      { count: 0, next: null, previous: null, results: [] },
    ],
  ]);
  const result = await new IqstatsGateway(source, () => capturedAt).getTeamManager(teamId);
  assert.equal(result.data, null);
  assert.equal(result.availability.status, "unavailable");
  assert.equal(result.availability.reason, "not_captured");
  assert.deepEqual(result.availability.missingFields, ["manager"]);
});

// Regola di selezione competizione/stagione: modulo puro, verificabile senza fonte.
const serieA2526 = { leagueId: "4", leagueName: "Serie A", seasonId: "358", matches: 38, lastMatchAt: "2026-05-24T18:00:00Z" };
const serieA2425 = { leagueId: "4", leagueName: "Serie A", seasonId: "357", matches: 5, lastMatchAt: "2025-05-24T18:00:00Z" };
const amichevoli = { leagueId: "79", leagueName: "Club Friendlies", seasonId: "1552", matches: 3, lastMatchAt: "2026-08-08T18:00:00Z" };
const coppa = { leagueId: "42", leagueName: "Coppa Italia", seasonId: "1156", matches: 3, lastMatchAt: "2025-12-04T18:00:00Z" };
const noRequest = { leagueId: null, seasonId: null };
const seriaAContext = (currentSeasonId: string | null) => ({
  currentSeasonByLeague: new Map([["4", currentSeasonId], ["79", "1552"], ["42", "1156"]]),
  currentSeasonThreshold: 6,
});

test("le amichevoli più recenti non scavalcano il campionato", () => {
  const selected = selectCompetition(
    [amichevoli, serieA2526, serieA2425, coppa],
    noRequest,
    seriaAContext("1375"),
  );
  // La gara più recente è un'amichevole di agosto: vince comunque la Serie A,
  // che è il campionato che pesa nello storico della squadra.
  assert.equal(selected?.leagueId, "4");
  assert.equal(selected?.seasonId, "358");
});

test("la stagione corrente subentra solo con gare a sufficienza", () => {
  const options = (matches: number) => [
    { leagueId: "4", leagueName: "Serie A", seasonId: "1375", matches, lastMatchAt: "2026-09-20T18:00:00Z" },
    serieA2526,
    amichevoli,
  ];

  // Prima giornata: la nuova stagione esiste ma il campione non regge casa e trasferta.
  const early = selectCompetition(options(2), noRequest, seriaAContext("1375"));
  assert.equal(early?.seasonId, "358");

  // Raggiunta la soglia, il riferimento passa alla stagione corrente da sola.
  const ready = selectCompetition(options(6), noRequest, seriaAContext("1375"));
  assert.equal(ready?.seasonId, "1375");
});

test("la scelta esplicita dai filtri vince sulla regola", () => {
  const selected = selectCompetition(
    [serieA2526, amichevoli, coppa],
    { leagueId: "79", seasonId: "1552" },
    seriaAContext("1375"),
  );
  assert.equal(selected?.leagueId, "79");
  assert.equal(selectCompetition([], noRequest, seriaAContext(null)), null);
});
