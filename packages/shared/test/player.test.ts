import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregatePlayerStats,
  normalizePlayerProfile,
  normalizePlayerStatsPage,
  type PlayerMatchStats,
} from "../src/index.ts";

const capturedAt = "2026-09-06T08:00:00.000Z";

// Forma verificata sulla fonte il 6 settembre 2026, `players/1090/`: i campi derivati
// stanno nel payload e non devono attraversare il contratto.
const profilePayload = {
  id: 1090,
  name: "David Neres",
  short_name: "D. Neres",
  position: "F",
  specific_position: "RW",
  jersey_number: 7,
  nationality: "Brazil",
  date_of_birth: "1997-03-03",
  height_cm: 175,
  preferred_foot: "L",
  contract_until: "2028-06-30",
  current_team: { id: 62, name: "SSC Napoli", short_name: "Napoli" },
  availability: "available",
  injury_type: null,
  injury_expected_return: null,
  rating: 7.31,
  potential: "Can Polish Skills",
  injury_risk: 0.12,
  market_value_eur: 38000000,
  wage_eur_annual: 4200000,
};

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    player_id: 1090,
    event_id: 210083,
    team_id: 62,
    minutes_played: 90,
    goals: 1,
    fouls: 2,
    yellow_card: 0,
    total_shots: 3,
    ...overrides,
  };
}

test("il profilo non porta i campi derivati della fonte", () => {
  const envelope = normalizePlayerProfile(profilePayload, { capturedAt });
  const profile = envelope.data;
  assert.notEqual(profile, null);
  assert.equal(profile?.playerId, "1090");
  assert.equal(profile?.position, "forward");
  assert.equal(profile?.specificPosition, "RW");
  assert.equal(profile?.heightCm, 175);
  assert.deepEqual(profile?.currentTeam, { id: "62", name: "SSC Napoli" });
  for (const vietato of ["rating", "potential", "injuryRisk", "marketValueEur", "wageEurAnnual"]) {
    assert.equal(vietato in (profile as unknown as Record<string, unknown>), false);
  }
});

test("le righe del giocatore portano il conto dichiarato dalla fonte", () => {
  const envelope = normalizePlayerStatsPage(
    { count: 359, next: "...", results: [row({}), row({ event_id: 210090, team_id: 37 })] },
    { capturedAt },
  );
  assert.equal(envelope.data?.rows.length, 2);
  assert.equal(envelope.data?.declared, 359);
  assert.equal(envelope.data?.rows[1]?.teamId, "37");
});

test("una metrica assente su ogni riga resta n/d, non zero", () => {
  const envelope = normalizePlayerStatsPage(
    { count: 2, results: [row({ saves: null }), row({ saves: undefined })] },
    { capturedAt },
  );
  const block = aggregatePlayerStats(envelope.data?.rows ?? [], 2);
  assert.equal(block.totals.saves, null);
  assert.equal(block.totals.goals, 2);
});

test("la panchina non conta come presenza ma le sue righe sì", () => {
  const rows: readonly PlayerMatchStats[] = (
    normalizePlayerStatsPage(
      {
        count: 3,
        results: [row({}), row({ event_id: 2, minutes_played: 0 }), row({ event_id: 3, minutes_played: 12 })],
      },
      { capturedAt },
    ).data?.rows ?? []
  );
  const block = aggregatePlayerStats(rows, 3);
  assert.equal(block.rows, 3);
  assert.equal(block.appearances, 2);
  assert.equal(block.minutes, 102);
});

test("il blocco dichiara le squadre della carriera, dalla più presente", () => {
  const rows =
    normalizePlayerStatsPage(
      {
        count: 3,
        results: [row({}), row({ event_id: 2 }), row({ event_id: 3, team_id: 37 })],
      },
      { capturedAt },
    ).data?.rows ?? [];
  const block = aggregatePlayerStats(rows, 3);
  assert.deepEqual(block.teams, [
    { teamId: "62", rows: 2 },
    { teamId: "37", rows: 1 },
  ]);
});
