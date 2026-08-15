// Self-test del motore statistico ENG-1: distribuzioni, soglie di sezione e fail-closed.
// Eseguire con --conditions=react-server (il modulo importa "server-only").
import assert from "node:assert/strict";
import test from "node:test";

import {
  countPmf,
  getStatEngineReading,
  lgamma,
  REFEREE_MIN_CURRENT_MATCHES,
  STAT_ENGINE_METRICS,
} from "../src/server/iqstats/stat-engine.ts";

const THRESHOLD = 1.05;

function moments(mu: number, dispersion: number): { mass: number; mean: number; variance: number } {
  let mass = 0;
  let mean = 0;
  let second = 0;
  for (let k = 0; k <= 400; k += 1) {
    const p = countPmf(k, mu, dispersion, THRESHOLD);
    mass += p;
    mean += k * p;
    second += k * k * p;
  }
  return { mass, mean, variance: second - mean * mean };
}

test("lgamma riproduce valori noti", () => {
  assert.ok(Math.abs(lgamma(1)) < 1e-9);
  assert.ok(Math.abs(lgamma(2)) < 1e-9);
  assert.ok(Math.abs(lgamma(5) - Math.log(24)) < 1e-9);
  assert.ok(Math.abs(lgamma(0.5) - Math.log(Math.sqrt(Math.PI))) < 1e-9);
});

test("la PMF Binomiale Negativa somma a 1 e ricostruisce media e varianza", () => {
  for (const [mu, dispersion] of [
    [12.4, 2.209124],
    [4.7, 1.384106],
    [1.2, 1.646189],
    [26.5, 1.4562],
  ] as const) {
    const { mass, mean, variance } = moments(mu, dispersion);
    assert.ok(Math.abs(mass - 1) < 1e-6, `massa ${mass} per mu=${mu}`);
    assert.ok(Math.abs(mean - mu) < 1e-4, `media ${mean} attesa ${mu}`);
    // Per la NB la varianza è D · μ.
    assert.ok(
      Math.abs(variance - dispersion * mu) < 1e-3,
      `varianza ${variance} attesa ${dispersion * mu}`,
    );
  }
});

test("sotto la soglia dell'artefatto la distribuzione è Poisson (varianza = media)", () => {
  const { mass, mean, variance } = moments(3.4, 1);
  assert.ok(Math.abs(mass - 1) < 1e-9);
  assert.ok(Math.abs(mean - 3.4) < 1e-6);
  assert.ok(Math.abs(variance - 3.4) < 1e-6);
});

test("la Binomiale Negativa converge alla Poisson per D → 1", () => {
  const mu = 5.5;
  for (let k = 0; k <= 20; k += 1) {
    const poisson = countPmf(k, mu, 1, THRESHOLD);
    const nearPoisson = countPmf(k, mu, 1.000001, 1); // soglia 1 forza il ramo NB
    assert.ok(Math.abs(poisson - nearPoisson) < 1e-4, `k=${k}: ${poisson} vs ${nearPoisson}`);
  }
});

test("lettura reale del Brasileirão: copertura corrente, probabilità complementari", () => {
  const reading = getStatEngineReading({ leagueId: 9, homeTeamId: 154, awayTeamId: 150 });
  assert.equal(reading.available, true);
  if (!reading.available) return;

  assert.equal(reading.coverage.tier, "current-season");
  assert.equal(reading.source, "iqstats-engine");
  assert.ok(reading.metrics.length > 0);

  for (const projection of reading.metrics) {
    assert.ok(STAT_ENGINE_METRICS.includes(projection.metric));
    assert.ok(projection.expectedHome > 0 && Number.isFinite(projection.expectedHome));
    assert.ok(projection.expectedAway > 0 && Number.isFinite(projection.expectedAway));
    assert.ok(
      Math.abs(projection.expectedTotal - (projection.expectedHome + projection.expectedAway)) <
        1e-9,
    );
    for (const ladder of [projection.homeLines, projection.awayLines, projection.totalLines]) {
      // Cinque soglie, salvo troncamento sotto 0.5, con una sola centrale.
      assert.ok(ladder.length >= 3 && ladder.length <= 5, `soglie: ${ladder.length}`);
      assert.equal(ladder.filter((line) => line.isCentral).length, 1);

      for (const line of ladder) {
        assert.ok(Math.abs(line.probOver + line.probUnder - 1) < 1e-6);
        assert.ok(line.probOver >= 0 && line.probOver <= 1);
      }

      // La scala è ordinata e l'Over cala al salire della soglia.
      for (let i = 1; i < ladder.length; i += 1) {
        assert.equal(ladder[i].line, ladder[i - 1].line + 1);
        assert.ok(ladder[i].probOver < ladder[i - 1].probOver);
      }

      // La centrale è la soglia .5 più vicina al valore atteso.
      const central = ladder.find((line) => line.isCentral);
      assert.ok(central);
      const expected =
        ladder === projection.homeLines
          ? projection.expectedHome
          : ladder === projection.awayLines
            ? projection.expectedAway
            : projection.expectedTotal;
      for (const line of ladder) {
        assert.ok(Math.abs(central.line - expected) <= Math.abs(line.line - expected) + 1e-9);
      }
    }
  }
});

test("l'arbitro sopra soglia modula solo falli e cartellini", () => {
  const withReferee = getStatEngineReading({
    leagueId: 9,
    homeTeamId: 154,
    awayTeamId: 150,
    refereeId: 1587,
  });
  const withoutReferee = getStatEngineReading({ leagueId: 9, homeTeamId: 154, awayTeamId: 150 });
  assert.equal(withReferee.available, true);
  assert.equal(withoutReferee.available, true);
  if (!withReferee.available || !withoutReferee.available) return;

  assert.equal(withReferee.referee?.tier, "current-season");
  assert.ok((withReferee.referee?.currentMatches ?? 0) >= REFEREE_MIN_CURRENT_MATCHES);

  for (const projection of withReferee.metrics) {
    const baseline = withoutReferee.metrics.find((m) => m.metric === projection.metric);
    assert.ok(baseline);
    if (projection.metric === "fouls" || projection.metric === "yellows") {
      assert.ok(projection.refereeAdjustment !== null);
    } else {
      assert.equal(projection.refereeAdjustment, null);
      assert.ok(Math.abs(projection.expectedTotal - baseline.expectedTotal) < 1e-9);
    }
  }
});

test("sotto soglia l'arbitro non espone il dato corrente come lettura", () => {
  const reading = getStatEngineReading({
    leagueId: 13,
    homeTeamId: 1,
    awayTeamId: 2,
    refereeId: 1580,
  });
  // La gara può non essere coperta: interessa solo che il dato arbitro resti fail-closed.
  if (reading.available && reading.referee) {
    assert.equal(reading.referee.tier, "career");
    assert.equal(reading.referee.yellowsPerMatch, null);
    assert.equal(reading.referee.foulsPerMatch, null);
  }
});

test("senza gare correnti la copertura resta dichiarata come stagione precedente", () => {
  const reading = getStatEngineReading({ leagueId: 4, homeTeamId: 59, awayTeamId: 60 });
  assert.equal(reading.available, true);
  if (!reading.available) return;
  assert.equal(reading.coverage.tier, "previous-season");
  assert.equal(reading.coverage.home.currentHome, 0);
});

test("fail-closed su input invalido, lega non calibrata e squadra assente", () => {
  assert.deepEqual(getStatEngineReading({ leagueId: null, homeTeamId: 1, awayTeamId: 2 }), {
    available: false,
    reason: "invalid_input",
  });
  // La lega 26 è fra quelle scartate dal QA CAL-2: non ha alcuna baseline calibrata.
  assert.deepEqual(getStatEngineReading({ leagueId: 26, homeTeamId: 1, awayTeamId: 2 }), {
    available: false,
    reason: "league_not_calibrated",
  });
  assert.deepEqual(getStatEngineReading({ leagueId: 9, homeTeamId: 999999, awayTeamId: 150 }), {
    available: false,
    reason: "team_rating_missing",
  });
});
