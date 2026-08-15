import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  indexCompetitions,
  normalizeCompetitionCatalog,
  normalizeHeadToHead,
  normalizeMatchDetail,
  normalizeMatchList,
  normalizeObservedMatchStats,
  normalizeOddsPages,
  normalizeStandingTable,
} from "../src/index.ts";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const capturedAt = "2026-08-01T19:30:00.000Z";

function readJson(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(`${workspace}${relativePath}`, "utf8"));
}

function requireData<T>(value: { readonly data: T | null }): T {
  assert.notEqual(value.data, null);
  return value.data as T;
}

const catalogResult = normalizeCompetitionCatalog(
  readJson("scripts/calibration/discovery/leagues.json"),
  capturedAt,
);
const competitions = indexCompetitions(requireData(catalogResult));

test("normalizza catalogo, lista e dettaglio senza fallback dimostrativi", () => {
  assert.equal(catalogResult.availability.status, "available");
  assert.equal(requireData(catalogResult).length, 72);

  const finished = normalizeMatchList(
    readJson("scripts/app-discovery/output/2026-08-01/events-finished-sample.json"),
    { capturedAt, competitions },
  );
  const finishedData = requireData(finished);
  assert.equal(finished.availability.status, "available");
  assert.equal(finishedData.items.length, 10);
  assert.equal(finishedData.total, 16);
  assert.equal(finishedData.items[0]?.status, "finished");
  assert.equal(finishedData.items[0]?.score.status, "available");

  const upcoming = normalizeMatchList(
    readJson("scripts/app-discovery/output/2026-08-01/events-upcoming-sample.json"),
    { capturedAt, competitions },
  );
  const upcomingMatch = requireData(upcoming).items[0];
  assert.equal(upcomingMatch?.status, "not_started");
  assert.deepEqual(upcomingMatch?.score, {
    status: "unavailable",
    value: null,
    reason: "not_applicable",
  });

  const detail = normalizeMatchDetail(
    readJson("scripts/app-discovery/output/2026-08-01/event-finished-detail.json"),
    { capturedAt, competitions },
  );
  const detailData = requireData(detail);
  assert.equal(detailData.id, "7198");
  assert.equal(detailData.competition.id, "9");
  assert.equal(detailData.sectionAvailability.headToHead.status, "available");
  assert.equal(detailData.sectionAvailability.odds.status, "unavailable");
});

test("normalizza 448 quote e non ricostruisce apertura o chiusura", () => {
  const pages = [
    "event-finished-odds-list.json",
    "event-finished-odds-list-offset-200.json",
    "event-finished-odds-list-offset-400.json",
  ].map((file) => readJson(`scripts/app-discovery/output/2026-08-01/${file}`));
  const result = normalizeOddsPages(pages, { matchId: "7198", capturedAt });
  const data = requireData(result);

  assert.equal(result.availability.status, "available");
  assert.equal(result.availability.coverage?.ratio, 1);
  assert.equal(data.items.length, 448);
  assert.equal(data.declaredTotal, 448);
  assert.equal(data.markets.length, 11);
  assert.equal(data.items.filter((item) => item.previousDecimalOdds.status === "available").length, 347);
  assert.equal(data.items.filter((item) => item.movement.status === "available").length, 448);
  assert.ok(data.items.every((item) => item.matchId === "7198"));
  assert.ok(
    data.items.every(
      (item) =>
        item.openingDecimalOdds.status === "unavailable" &&
        item.openingDecimalOdds.reason === "not_exposed_by_source" &&
        item.closingDecimalOdds.status === "unavailable" &&
        item.closingDecimalOdds.reason === "not_exposed_by_source",
    ),
  );
  assert.ok(data.items.every((item) => !Object.hasOwn(item, "event_id")));

  const totalRedCards = data.items.filter((item) => item.market === "total_red_cards");
  assert.equal(totalRedCards.length, 8);
  assert.ok(totalRedCards.every((item) => item.previousDecimalOdds.status === "unavailable"));
});

test("dichiara copertura parziale quando manca una pagina di quote", () => {
  const result = normalizeOddsPages(
    [readJson("scripts/app-discovery/output/2026-08-01/event-finished-odds-list.json")],
    { matchId: "7198", capturedAt },
  );
  const data = requireData(result);

  assert.equal(result.availability.status, "partial");
  assert.equal(result.availability.reason, "insufficient_coverage");
  assert.deepEqual(result.availability.missingFields, ["pagination"]);
  assert.equal(result.availability.coverage?.available, 200);
  assert.equal(result.availability.coverage?.total, 448);
  assert.equal(result.availability.coverage?.ratio, 200 / 448);
  assert.equal(data.items.length, 200);
  assert.equal(data.declaredTotal, 448);
});

test("mantiene la gara futura senza quote come lista vuota, non come zeri", () => {
  const result = normalizeOddsPages(
    [readJson("scripts/app-discovery/output/2026-08-01/event-upcoming-odds-list.json")],
    { matchId: "7208", capturedAt },
  );
  const data = requireData(result);
  assert.equal(result.availability.status, "available");
  assert.equal(data.items.length, 0);
  assert.equal(data.declaredTotal, 0);
  assert.deepEqual(data.markets, []);
});

test("normalizza classifica e limita la forma alla sequenza W/D/L", () => {
  const result = normalizeStandingTable(
    readJson("scripts/app-discovery/output/2026-08-01/league-standings.json"),
    { capturedAt },
  );
  const data = requireData(result);
  assert.equal(result.availability.status, "available");
  assert.equal(data.leagueId, "9");
  assert.equal(data.rows.length, 20);
  assert.ok(data.rows.every((row) => row.compactForm.status === "available"));
  assert.deepEqual(data.detailedFormAvailability, {
    status: "unavailable",
    reason: "not_exposed_by_source",
    missingFields: [],
    coverage: null,
  });
});

test("normalizza H2H dedicato con campione e partite recenti espliciti", () => {
  const result = normalizeHeadToHead(
    readJson("scripts/app-discovery/output/2026-08-01/event-finished-h2h.json"),
    { matchId: "7198", capturedAt },
  );
  const data = requireData(result);
  assert.equal(result.availability.status, "available");
  assert.equal(data.matchId, "7198");
  assert.equal(data.totalMatches, 4);
  assert.equal(data.recentMatches.length, 4);
});

test("le statistiche osservate preservano offsides null e zero reale", () => {
  const missingOffsides = normalizeObservedMatchStats(
    readJson("scripts/calibration/discovery/sample-match-1456.json"),
    { matchId: "1456", homeTeamId: "home-1456", awayTeamId: "away-1456", capturedAt },
  );
  const missingData = requireData(missingOffsides);
  assert.equal(missingOffsides.availability.status, "partial");
  assert.equal(missingData.teams[0].metrics.offsides, null);
  assert.equal(missingData.teams[1].metrics.offsides, null);
  assert.deepEqual(missingOffsides.availability.missingFields, ["home.offsides", "away.offsides"]);

  const realZero = normalizeObservedMatchStats(
    readJson("scripts/calibration/discovery/sample-match-383.json"),
    { matchId: "383", homeTeamId: "home-383", awayTeamId: "away-383", capturedAt },
  );
  const zeroData = requireData(realZero);
  assert.equal(realZero.availability.status, "available");
  assert.equal(zeroData.teams[0].metrics.offsides, 0);
  assert.equal(zeroData.teams[1].metrics.offsides, 1);
});
