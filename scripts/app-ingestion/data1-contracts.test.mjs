import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleData1Batch,
  contentChecksum,
  normalizeCurrentCatalog,
  normalizeMatchPage,
  normalizeStandingSnapshot,
} from "./data1-contracts.mjs";

const observedAt = "2026-08-09T08:00:00.000Z";

const catalogPayload = {
  results: [
    {
      id: 101,
      name: "Cross-year League",
      country: "Country A",
      is_active: true,
      is_women: false,
      current_season: {
        id: 201,
        name: "2026/27",
        start_date: "2026-07-01",
        end_date: "2027-06-30",
      },
    },
    {
      id: 102,
      name: "Calendar League",
      country: "Country B",
      is_active: true,
      is_women: false,
      current_season: {
        id: 202,
        name: "2026",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      },
    },
    {
      id: 103,
      name: "Rollover Pending League",
      country: "Country C",
      is_active: true,
      is_women: false,
      current_season: {
        id: 203,
        name: "Previous window",
        start_date: "2025-07-01",
        end_date: "2026-06-30",
      },
    },
    {
      id: 104,
      name: "Excluded Competition",
      country: "Country D",
      is_active: true,
      is_women: false,
      current_season: {
        id: 204,
        name: "2026/27",
        start_date: "2026-07-01",
        end_date: "2027-06-30",
      },
    },
  ],
};

const matchPayload = {
  count: 3,
  results: [
    {
      id: 301,
      league_id: 101,
      season_id: 201,
      home_team_id: 401,
      away_team_id: 402,
      home_team: "Home A",
      away_team: "Away A",
      event_date: "2026-08-09T18:00:00Z",
      status: "scheduled",
      home_score: null,
      away_score: null,
    },
    {
      id: 302,
      league_id: 101,
      season_id: 201,
      home_team_id: 402,
      away_team_id: 401,
      home_team: "Away A",
      away_team: "Home A",
      event_date: "2026-08-02T18:00:00Z",
      status: "finished",
      home_score: 0,
      away_score: 1,
    },
    {
      id: 303,
      league_id: 101,
      season_id: 201,
      home_team_id: 401,
      away_team_id: 402,
      home_team: "Home A",
      away_team: "Away A",
      event_date: "2026-08-03T18:00:00Z",
      status: "finished",
      home_score: 2,
      away_score: null,
    },
  ],
};

const standingPayload = {
  league_id: 101,
  season: { id: 201, name: "2026/27" },
  standings: [
    {
      position: 1,
      team_id: 401,
      team_name: "Home A",
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      gf: 1,
      ga: 0,
      gd: 1,
      pts: 3,
      form: "W",
    },
    {
      position: 2,
      team_id: 402,
      team_name: "Away A",
      played: null,
      won: null,
      drawn: null,
      lost: null,
      gf: null,
      ga: null,
      gd: null,
      pts: null,
      form: null,
    },
  ],
};

test("classifica il perimetro fresco e mantiene in hold il rollover", () => {
  const catalog = normalizeCurrentCatalog(catalogPayload, [101, 102, 103], observedAt);
  assert.equal(catalog.competitions.length, 3);
  assert.equal(catalog.productCurrent, 2);
  assert.equal(catalog.held, 1);
  assert.equal(catalog.seasons[0].seasonKind, "cross_year");
  assert.equal(catalog.seasons[1].seasonKind, "calendar_year");
  assert.equal(catalog.seasons[2].ingestScope, "held");
});

test("preserva score nullo e zero reale senza completare coppie mancanti", () => {
  const page = normalizeMatchPage(matchPayload, observedAt);
  assert.equal(page.matches.length, 3);
  assert.equal(page.teams.length, 2);
  assert.equal(page.matches[0].homeScore, null);
  assert.equal(page.matches[0].awayScore, null);
  assert.equal(page.matches[1].homeScore, 0);
  assert.equal(page.matches[1].awayScore, 1);
  assert.equal(page.matches[2].homeScore, null);
  assert.equal(page.matches[2].awayScore, null);
  assert.equal(page.matches[0].freshUntil, "2026-08-09T08:15:00.000Z");
  assert.equal(page.matches[1].freshUntil, "2026-08-10T08:00:00.000Z");
});

test("classifica preserva metriche mancanti come null", () => {
  const standing = normalizeStandingSnapshot(standingPayload, observedAt);
  assert.equal(standing.snapshot.complete, true);
  assert.equal(standing.snapshot.rows.length, 2);
  assert.equal(standing.snapshot.rows[1].played, null);
  assert.equal(standing.snapshot.rows[1].points, null);
  assert.equal(standing.snapshot.rows[1].form, null);
});

test("l'intervallo entra intero, e quello maggiore del finale si dichiara assente", () => {
  const page = normalizeMatchPage(
    {
      count: 4,
      results: [
        // coppia buona: entra com'e'
        { id: 501, league_id: 101, season_id: 201, home_team_id: 401, away_team_id: 402,
          home_team: "Home A", away_team: "Away A", event_date: "2026-08-09T18:00:00Z",
          status: "finished", home_score: 2, away_score: 1, home_score_ht: 1, away_score_ht: 1 },
        // un gol non si toglie: 2-0 all'intervallo su un 1-1 finale e' rotto
        { id: 502, league_id: 101, season_id: 201, home_team_id: 401, away_team_id: 402,
          home_team: "Home A", away_team: "Away A", event_date: "2026-08-09T18:00:00Z",
          status: "finished", home_score: 1, away_score: 1, home_score_ht: 2, away_score_ht: 0 },
        // mezza coppia: la tavola le vuole nulle insieme o piene insieme
        { id: 503, league_id: 101, season_id: 201, home_team_id: 401, away_team_id: 402,
          home_team: "Home A", away_team: "Away A", event_date: "2026-08-09T18:00:00Z",
          status: "finished", home_score: 3, away_score: 0, home_score_ht: 1, away_score_ht: null },
        // senza finale non c'e' niente con cui confrontare l'intervallo
        { id: 504, league_id: 101, season_id: 201, home_team_id: 401, away_team_id: 402,
          home_team: "Home A", away_team: "Away A", event_date: "2026-08-09T18:00:00Z",
          status: "scheduled", home_score: null, away_score: null, home_score_ht: 0, away_score_ht: 0 },
      ],
    },
    observedAt,
  );
  assert.equal(page.matches[0].homeScoreHalftime, 1);
  assert.equal(page.matches[0].awayScoreHalftime, 1);
  for (const indice of [1, 2, 3]) {
    assert.equal(page.matches[indice].homeScoreHalftime, null);
    assert.equal(page.matches[indice].awayScoreHalftime, null);
  }
});

test("un intervallo diverso cambia il checksum, altrimenti non si aggiornerebbe mai", () => {
  const gara = (ht) => ({
    id: 505, league_id: 101, season_id: 201, home_team_id: 401, away_team_id: 402,
    home_team: "Home A", away_team: "Away A", event_date: "2026-08-09T18:00:00Z",
    status: "finished", home_score: 2, away_score: 1, home_score_ht: ht, away_score_ht: 0,
  });
  const uno = normalizeMatchPage({ count: 1, results: [gara(1)] }, observedAt).matches[0];
  const due = normalizeMatchPage({ count: 1, results: [gara(2)] }, observedAt).matches[0];
  assert.notEqual(uno.checksum, due.checksum);
});

test("checksum non dipende dall'ordine delle chiavi", () => {
  assert.equal(contentChecksum({ a: 1, b: { c: 2 } }), contentChecksum({ b: { c: 2 }, a: 1 }));
});

test("assembla un batch privo di payload raw", () => {
  const catalog = normalizeCurrentCatalog(catalogPayload, [101, 102, 103], observedAt);
  const page = normalizeMatchPage(matchPayload, observedAt);
  const standing = normalizeStandingSnapshot(standingPayload, observedAt);
  const batch = assembleData1Batch({ catalog, matchPages: [page], standings: [standing], observedAt });
  assert.equal(batch.competitions.length, 3);
  assert.equal(batch.matches.length, 3);
  assert.equal(batch.standings.length, 1);
  assert.ok(!Object.hasOwn(batch, "payload"));
  assert.ok(!Object.hasOwn(batch, "headers"));
  assert.ok(batch.matches.every((match) => typeof match.checksum === "string"));
});
