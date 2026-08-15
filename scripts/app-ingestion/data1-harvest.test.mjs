import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSanitizedReport,
  buildData1Plan,
  isStandingCoverageAbsent,
  parseData1Args,
} from "./data1-harvest.mjs";

const report = {
  scope: {
    regularLeaguePolicyCount: 36,
    productFreshSeasonEligibleCount: 33,
    heldForSeasonRollover: 3,
  },
  volume: { currentSeasonMatches: 10_361 },
};

test("il piano è offline e mantiene il perimetro fresco", () => {
  const plan = buildData1Plan(report);
  assert.equal(plan.networkCalls, 0);
  assert.equal(plan.databaseWrites, 0);
  assert.equal(plan.scope.productFreshCompetitions, 33);
  assert.equal(plan.scope.heldCompetitions, 3);
  assert.ok(plan.providerReadPlan.estimatedRequestsHigh <= plan.providerReadPlan.hardCapRecommended);
});

test("l'esecuzione richiede un tetto letture esplicito", () => {
  assert.throws(() => parseData1Args(["--execute-local"]), /explicit_read_cap_required/);
  assert.deepEqual(parseData1Args(["--execute-local", "--approved-read-cap=200"]), {
    mode: "execute-local",
    resume: false,
    approvedReadCap: 200,
  });
  assert.deepEqual(parseData1Args(["--execute-local", "--resume-local", "--approved-read-cap=143"]), {
    mode: "execute-local",
    resume: true,
    approvedReadCap: 143,
  });
  assert.throws(
    () => parseData1Args(["--execute-local", "--approved-read-cap=201"]),
    /read_cap_above_reviewed_limit/,
  );
  assert.throws(() => parseData1Args(["--plan", "--resume-local"]), /resume_not_valid_in_plan/);
});

test("il report rifiuta materiale sensibile o remoto", () => {
  assert.deepEqual(assertSanitizedReport({ status: "completed", rows: 1 }), {
    status: "completed",
    rows: 1,
  });
  assert.throws(() => assertSanitizedReport({ location: "https://example.invalid" }), /unsafe_report_content/);
  assert.throws(() => assertSanitizedReport({ authorization: "redacted" }), /unsafe_report_content/);
});

test("un inviluppo di classifica valido senza righe dichiara copertura assente", () => {
  assert.equal(isStandingCoverageAbsent({ league_id: 1, season: { id: 2 } }), true);
  assert.equal(isStandingCoverageAbsent({ league_id: 1, season: { id: 2 }, standings: [] }), false);
  assert.equal(isStandingCoverageAbsent({ league_id: null, season: { id: 2 } }), false);
});
