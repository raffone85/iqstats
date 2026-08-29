import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  TEAM_METRIC_CATALOG,
  TEAM_MINIMUM_SAMPLE,
  aggregateTeamSeasonSplits,
  aggregateTeamSquad,
  aggregateTeamReferees,
  normalizeEventPlayerStats,
  normalizeRefereeDirectory,
  normalizeRefereeProfile,
  normalizeSeasonCatalog,
  normalizeTeamManager,
  normalizeTeamMatchMetrics,
  normalizeTeamProfile,
  normalizeTeamSquad,
  type TeamMatchMetrics,
  type TeamMetricAverage,
  type TeamMetricKey,
} from "../src/index.ts";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const discovery = "scripts/app-discovery/output/2026-08-13-team-profile";
const capturedAt = "2026-08-13T21:47:11.745Z";
const teamId = "63";

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(`${workspace}${discovery}/${file}`, "utf8"));
}

function requireData<T>(value: { readonly data: T | null }): T {
  assert.notEqual(value.data, null);
  return value.data as T;
}

function metric(metrics: readonly TeamMetricAverage[], key: TeamMetricKey): TeamMetricAverage {
  const found = metrics.find((item) => item.key === key);
  assert.ok(found, `metrica ${key} assente dal catalogo aggregato`);
  return found;
}

function matchMetrics(file: string, side: "home" | "away", eventId: string): TeamMatchMetrics {
  return requireData(
    normalizeTeamMatchMetrics(readJson(file), { eventId, teamId, side, capturedAt }),
  );
}

const homeRows = [
  matchMetrics("event-stats-home-1.json", "home", "1453"),
  matchMetrics("event-stats-home-2.json", "home", "1433"),
  matchMetrics("event-stats-home-3.json", "home", "1413"),
];
const awayRows = [
  matchMetrics("event-stats-away-1.json", "away", "1440"),
  matchMetrics("event-stats-away-2.json", "away", "1425"),
  matchMetrics("event-stats-away-3.json", "away", "1398"),
];

test("il catalogo tiene il nucleo di sette metriche e aggancia il corredo", () => {
  const core = TEAM_METRIC_CATALOG.filter((descriptor) => descriptor.tier === "core");
  assert.deepEqual(
    core.map((descriptor) => descriptor.key),
    ["shots", "shotsOnTarget", "fouls", "corners", "yellowCards", "goalkeeperSaves", "offsides"],
  );

  const coreKeys = new Set(core.map((descriptor) => descriptor.key));
  const extended = TEAM_METRIC_CATALOG.filter((descriptor) => descriptor.tier === "extended");
  assert.equal(extended.length, 53);
  for (const descriptor of extended) {
    if (descriptor.supports !== null) {
      assert.ok(coreKeys.has(descriptor.supports), `${descriptor.key} valida una metrica inesistente`);
    }
  }
  assert.equal(metricDescriptor("shotsInsideBox").supports, "shots");
  assert.equal(metricDescriptor("totalSaves").supports, "goalkeeperSaves");
  assert.equal(metricDescriptor("redCards").supports, "yellowCards");
});

function metricDescriptor(key: TeamMetricKey) {
  const found = TEAM_METRIC_CATALOG.find((descriptor) => descriptor.key === key);
  assert.ok(found, `descrittore ${key} assente`);
  return found;
}

test("legge le metriche composte e non confonde expected_goals con xg.actual", () => {
  const row = homeRows[1];
  assert.ok(row);
  // event-stats-home-2: crosses {value, total}, xg.actual 2.21 contro expected_goals 1.94.
  assert.equal(row.metrics.expectedGoals.value, 1.94);
  assert.equal(row.metrics.xgActual.value, 2.21);
  assert.notEqual(row.metrics.crossesAccuracy.total, null);
  assert.equal(row.metrics.crossesAttempted.total, null);
  // `punches` manca in questa gara: resta null, non diventa 0.
  assert.equal(row.metrics.punches.value, null);
  assert.ok(row.availability.missingFields.includes("punches"));
  assert.equal(row.availability.status, "partial");
});

test("le medie casa e trasferta escludono i valori assenti invece di azzerarli", () => {
  const splits = requireData(
    aggregateTeamSeasonSplits([...homeRows, ...awayRows], {
      teamId,
      seasonId: "358",
      capturedAt,
    }),
  );
  assert.equal(splits.minimumSample, TEAM_MINIMUM_SAMPLE);
  assert.equal(splits.home.matches, 3);
  assert.equal(splits.away.matches, 3);

  const homeShots = metric(splits.home.metrics, "shots");
  assert.equal(homeShots.sample, 3);
  assert.equal(homeShots.average.status, "available");
  assert.ok(Math.abs((homeShots.average.value ?? 0) - 44 / 3) < 1e-9);

  const awayShots = metric(splits.away.metrics, "shots");
  assert.ok(Math.abs((awayShots.average.value ?? 0) - 19 / 3) < 1e-9);

  // `punches` è presente in 2 gare su 3 in casa e in 1 su 3 fuori: sotto la soglia
  // il valore non si mostra e il campione resta dichiarato.
  const homePunches = metric(splits.home.metrics, "punches");
  assert.equal(homePunches.sample, 2);
  assert.equal(homePunches.average.status, "unavailable");
  assert.equal(homePunches.average.reason, "insufficient_coverage");
  assert.equal(metric(splits.away.metrics, "punches").sample, 1);
});

test("le percentuali sommano numeratori e denominatori, non mediano percentuali", () => {
  const splits = requireData(
    aggregateTeamSeasonSplits(homeRows, { teamId, seasonId: "358", capturedAt }),
  );
  // crosses in casa: 18 riusciti su 40 tentati = 45%. La media dei tre pct per gara
  // darebbe 50%, che sarebbe sbagliato.
  const crosses = metric(splits.home.metrics, "crossesAccuracy");
  assert.equal(crosses.average.status, "available");
  assert.equal(crosses.average.value, 45);
  assert.equal(crosses.sample, 3);

  const passAccuracy = metric(splits.home.metrics, "passAccuracy");
  assert.ok(Math.abs((passAccuracy.average.value ?? 0) - (1265 / 1449) * 100) < 1e-9);

  // Nessuna gara in trasferta in questo aggregato: il lato resta dichiarato vuoto.
  assert.equal(splits.away.matches, 0);
  assert.equal(metric(splits.away.metrics, "shots").average.reason, "not_captured");
});

test("sotto le tre gare la media non si mostra", () => {
  const twoMatches = homeRows.slice(0, 2);
  const splits = requireData(
    aggregateTeamSeasonSplits(twoMatches, { teamId, seasonId: "358", capturedAt }),
  );
  const shots = metric(splits.home.metrics, "shots");
  assert.equal(shots.sample, 2);
  assert.equal(shots.average.status, "unavailable");
  assert.equal(shots.average.reason, "insufficient_coverage");
});

test("identità squadra e stadio arrivano da due endpoint distinti", () => {
  const profile = requireData(
    normalizeTeamProfile(readJson("team-detail.json"), readJson("venue-detail.json"), { capturedAt }),
  );
  assert.equal(profile.teamId, teamId);
  assert.equal(profile.name, "AC Milan");
  assert.equal(profile.venue?.name, "San Siro/Giuseppe Meazza");
  assert.equal(profile.venue?.capacity, 75817);
  assert.equal(profile.availability.status, "available");

  const withoutVenue = requireData(
    normalizeTeamProfile(readJson("team-detail.json"), null, { capturedAt }),
  );
  assert.equal(withoutVenue.venue, null);
  assert.equal(withoutVenue.availability.status, "partial");
  assert.deepEqual(withoutVenue.availability.missingFields, ["venue"]);
});

test("l'allenatore espone il proprio current_team_id senza interpretarlo", () => {
  const manager = requireData(normalizeTeamManager(readJson("manager-detail.json"), { capturedAt }));
  assert.equal(manager.name, "Massimiliano Allegri");
  assert.equal(manager.preferredFormation, "3-5-2");
  // Il provider dichiara una squadra diversa da quella richiesta: il contratto lo
  // riporta, la derivazione dell'allenatore resta compito del gateway.
  assert.equal(manager.currentTeamId, "62");
  assert.notEqual(manager.currentTeamId, teamId);
  assert.equal(manager.statsUpdatedAt, "2026-08-10T23:30:35.873960+00:00");
});

test("la rosa mappa i ruoli e un solo GET copre le statistiche per giocatore", () => {
  const members = requireData(normalizeTeamSquad(readJson("team-squad.json"), { teamId, capturedAt }));
  assert.equal(members.length, 42);
  assert.equal(members.filter((member) => member.position === "goalkeeper").length > 0, true);
  assert.equal(members.every((member) => member.position !== null), true);

  const playerStats = requireData(
    normalizeEventPlayerStats(readJson("event-player-stats-1.json"), { teamId, capturedAt }),
  );
  // Il payload contiene 52 righe di entrambe le squadre: solo 26 sono del Milan.
  assert.equal(playerStats.length, 26);
  assert.equal(playerStats.every((row) => row.teamId === teamId), true);
  assert.equal(playerStats.filter((row) => row.rating !== null).length, 16);
  assert.equal(playerStats.filter((row) => (row.minutesPlayed ?? 0) > 0).length, 16);

  const squadResult = aggregateTeamSquad(members, playerStats, {
    teamId,
    capturedAt,
    matchesCovered: 1,
    minimumSample: 1,
  });
  const squad = requireData(squadResult);
  assert.equal(squad.entries.length, 42);
  assert.equal(squad.matchesCovered, 1);
  const played = squad.entries.filter((entry) => entry.stats !== null);
  assert.equal(played.length, 25);
  // Una riga statistica appartiene a un giocatore non più in rosa: dichiarata, non scartata in silenzio.
  assert.equal(squadResult.availability.missingFields.length, 1);
  assert.ok(squadResult.availability.missingFields[0]?.startsWith("playerStats.notInSquad["));

  const starter = squad.entries.find((entry) => entry.profile.playerId === "1995");
  assert.equal(starter?.stats?.minutes, 90);
  assert.equal(starter?.stats?.appearances, 1);
  assert.equal(starter?.stats?.rating.value, 7.2);
  assert.equal(starter?.stats?.totals.touches, 66);
  // expected_goals è null per parte delle righe: la somma non inventa uno zero.
  assert.equal(starter?.stats?.totals.expectedGoals, 0.0515);
});

test("con una sola gara il rating medio resta sotto soglia", () => {
  const members = requireData(normalizeTeamSquad(readJson("team-squad.json"), { teamId, capturedAt }));
  const playerStats = requireData(
    normalizeEventPlayerStats(readJson("event-player-stats-1.json"), { teamId, capturedAt }),
  );
  const squad = requireData(
    aggregateTeamSquad(members, playerStats, { teamId, capturedAt, matchesCovered: 1 }),
  );
  const starter = squad.entries.find((entry) => entry.profile.playerId === "1995");
  assert.equal(starter?.stats?.ratingSample, 1);
  assert.equal(starter?.stats?.rating.status, "unavailable");
  assert.equal(starter?.stats?.rating.reason, "insufficient_coverage");
});

test("le stagioni si leggono dalla chiave seasons, non da results", () => {
  const seasons = requireData(normalizeSeasonCatalog(readJson("league-seasons.json"), capturedAt));
  assert.equal(seasons.length, 62);
  const current = seasons.filter((season) => season.current === true);
  assert.equal(current.length, 1);
  assert.equal(current[0]?.id, "1375");
  assert.equal(seasons.find((season) => season.id === "358")?.name, "Serie A 25/26");
});

test("la media totale affianca casa e trasferta senza rimescolarle", () => {
  const splits = requireData(
    aggregateTeamSeasonSplits([...homeRows, ...awayRows], {
      teamId,
      seasonId: "358",
      capturedAt,
    }),
  );
  assert.equal(splits.overall.matches, 6);
  assert.equal(splits.overall.venue, "overall");

  const total = metric(splits.overall.metrics, "shots");
  assert.equal(total.sample, 6);
  // 44 tiri in casa e 19 in trasferta su sei gare: il totale è la media di tutte,
  // non la media delle due medie.
  assert.ok(Math.abs((total.average.value ?? 0) - 63 / 6) < 1e-9);

  // Con campioni sbilanciati la differenza si vede: tre gare in casa e due fuori
  // danno 57/5 = 11.4, mentre la media delle due medie darebbe 10.58.
  const unbalanced = requireData(
    aggregateTeamSeasonSplits([...homeRows, ...awayRows.slice(0, 2)], {
      teamId,
      seasonId: "358",
      capturedAt,
    }),
  );
  const unbalancedTotal = metric(unbalanced.overall.metrics, "shots").average.value ?? 0;
  const homeAverage = metric(unbalanced.home.metrics, "shots").average.value ?? 0;
  const awayAverage = metric(unbalanced.away.metrics, "shots").average.value ?? 0;
  assert.ok(Math.abs(unbalancedTotal - 57 / 5) < 1e-9);
  assert.ok(Math.abs(unbalancedTotal - (homeAverage + awayAverage) / 2) > 0.5);
});

test("il registro gara per gara porta anche il valore dell'avversario", () => {
  const row = requireData(
    normalizeTeamMatchMetrics(readJson("event-stats-home-1.json"), {
      eventId: "1453",
      teamId,
      side: "home",
      capturedAt,
      playedAt: "2026-05-24T18:00:00Z",
      opponentName: "Cagliari",
    }),
  );
  assert.equal(row.opponentName, "Cagliari");
  assert.equal(row.metrics.shots.value, 16);
  assert.equal(row.opponentMetrics.shots.value, 25);

  const splits = requireData(
    aggregateTeamSeasonSplits([row], { teamId, seasonId: "358", capturedAt }),
  );
  assert.equal(splits.matchLog.length, 1);
  const entry = splits.matchLog[0];
  assert.equal(entry?.eventId, "1453");
  assert.equal(entry?.side, "home");
  assert.equal(entry?.values.shots, 16);
  assert.equal(entry?.opponentValues.shots, 25);
  // Le metriche di rapporto diventano la percentuale di quella gara: 12 cross
  // riusciti su 23 tentati sono il 52%, come dichiara la fonte.
  assert.ok(Math.abs((entry?.values.crossesAccuracy ?? 0) - (12 / 23) * 100) < 1e-9);
  assert.ok(Math.abs((entry?.opponentValues.crossesAccuracy ?? 0) - (3 / 19) * 100) < 1e-9);
  assert.equal(entry?.values.ballPossession, 48);
  assert.equal(entry?.opponentValues.ballPossession, 52);
});

test("il metro di lega si calcola dai 42 arbitri della competizione", () => {
  const directory = requireData(
    normalizeRefereeDirectory(readJson("referees-league.json"), {
      leagueId: "4",
      capturedAt,
    }),
  );
  assert.equal(directory.referees.length, 42);
  assert.equal(directory.benchmark.referees, 42);
  assert.ok(Math.abs((directory.benchmark.avgYellowPerMatch ?? 0) - 3.8492857142857146) < 1e-9);
  assert.ok(Math.abs((directory.benchmark.avgFoulsPerMatch ?? 0) - 25.28333333333333) < 1e-9);
});

test("il profilo dell'arbitro e il metro della lega restano quelli della fonte", () => {
  // La lettura «severo o permissivo» non nasce piu' qui: la fa il livello dati sulle nostre
  // osservazioni, con mezza dispersione fra i colleghi invece della vecchia tolleranza fissa
  // del cinque per cento. Qui resta la sola normalizzazione.
  const referee = requireData(
    normalizeRefereeProfile(readJson("referee-detail.json"), { capturedAt }),
  );
  assert.equal(referee.name, "Marco Guida");
  assert.equal(referee.careerGames, 328);
  assert.equal(referee.avgFoulsPerMatch, 23.1);
  assert.equal(referee.avgYellowPerMatch, 3.74);

  const directory = requireData(
    normalizeRefereeDirectory(readJson("referees-league.json"), { leagueId: "4", capturedAt }),
  );
  assert.equal(directory.benchmark.avgFoulsPerMatch?.toFixed(2), "25.28");
});

test("il rapporto con l'arbitro si ricava dalle gare, senza richieste in più", () => {
  const withReferee = (file: string, eventId: string, refereeId: string) =>
    requireData(
      normalizeTeamMatchMetrics(readJson(file), {
        eventId,
        teamId,
        side: "home",
        capturedAt,
        refereeId,
        playedAt: `2026-05-${eventId.slice(-2)}T18:00:00Z`,
      }),
    );

  const splits = requireData(
    aggregateTeamSeasonSplits(
      [
        withReferee("event-stats-home-1.json", "1453", "1761"),
        withReferee("event-stats-home-2.json", "1433", "1761"),
        withReferee("event-stats-home-3.json", "1413", "999"),
      ],
      { teamId, seasonId: "358", capturedAt },
    ),
  );

  const records = aggregateTeamReferees(splits.matchLog);
  assert.equal(records.length, 2);
  // Ordinati per gare arbitrate: prima chi ha diretto più volte questa squadra.
  const [first, second] = records;
  assert.equal(first?.refereeId, "1761");
  assert.equal(first?.matches, 2);
  assert.equal(first?.teamFoulsPerMatch, 8);
  assert.equal(first?.teamYellowsPerMatch, 3);
  assert.equal(first?.opponentFoulsPerMatch, 13);
  assert.equal(first?.opponentYellowsPerMatch, 2);
  assert.equal(second?.refereeId, "999");
  assert.equal(second?.matches, 1);
  assert.equal(second?.teamFoulsPerMatch, 12);
});

test("una gara senza arbitro dichiarato non entra nel conteggio", () => {
  const splits = requireData(
    aggregateTeamSeasonSplits([...homeRows], { teamId, seasonId: "358", capturedAt }),
  );
  // `homeRows` non porta l'identificativo arbitro: nessun record, nessuna invenzione.
  assert.equal(splits.matchLog.every((entry) => entry.refereeId === null), true);
  assert.deepEqual(aggregateTeamReferees(splits.matchLog), []);
});
