// Server-only: motore statistico IQstatS (ENG-1). Legge in SOLA LETTURA l'artefatto
// generato da scripts/engine/buildRatings.ts e proietta le sette metriche osservate con
// una Binomiale Negativa la cui dispersione è calibrata da questo progetto (CAL-3).
// Nessuna chiamata al provider, nessuna rete, nessuna costante di modello ricopiata qui:
// baseline, dispersione e soglia di fallback arrivano dall'artefatto.
import "server-only";

import ratingsState from "./data/ratings-state.generated.json" with { type: "json" };

export const STAT_ENGINE_METRICS = [
  "shots",
  "sot",
  "fouls",
  "corners",
  "yellows",
  "saves",
  "offsides",
] as const;

export type StatMetric = (typeof STAT_ENGINE_METRICS)[number];

/** Metriche modulate dalla tendenza arbitrale (contratto ENG-1 §4.4). */
const DISCIPLINE_METRICS: readonly StatMetric[] = ["fouls", "yellows"];

/** Soglie di sezione decise il 12 agosto 2026: governano etichetta e confidenza. */
export const CURRENT_SEASON_MIN_HOME = 2;
export const CURRENT_SEASON_MIN_AWAY = 2;
export const REFEREE_MIN_CURRENT_MATCHES = 3;

/** Peso del campione arbitro: n/(n+K). Alla terza gara vale 0.33, prudente per costruzione. */
const REFEREE_SHRINKAGE_K = 6;
/** Limite di prudenza sull'effetto arbitro, dichiarato e versionato. */
const REFEREE_FACTOR_MIN = 0.75;
const REFEREE_FACTOR_MAX = 1.25;
const REFEREE_BLEND_VERSION = "eng-1-referee-blend-v1";

// ---------------------------------------------------------------- artefatto

interface Baseline {
  readonly home: number;
  readonly away: number;
}

interface TeamMetricRating {
  readonly attack: number;
  readonly defence: number;
  readonly historicalSample: number;
  readonly currentSample: number;
}

interface TeamRating {
  readonly leagueId: number;
  readonly teamId: number;
  readonly historical: { readonly home: number; readonly away: number };
  readonly current: { readonly home: number; readonly away: number };
  readonly metrics: Partial<Record<StatMetric, TeamMetricRating>>;
}

interface RefereeRating {
  readonly refereeId: number;
  readonly leagueId: number;
  readonly currentMatches: number;
  readonly yellowsPerMatch: number | null;
  readonly foulsPerMatch: number | null;
}

interface RatingsState {
  readonly schemaVersion: number;
  readonly formulaVersion: string;
  readonly generatedAt: string;
  readonly baselines: Record<string, Partial<Record<StatMetric, Baseline>>>;
  readonly dispersion: {
    readonly poissonFallbackThreshold: number;
    readonly team: Partial<Record<StatMetric, number>>;
    readonly match: Partial<Record<StatMetric, number>>;
  };
  readonly currentSeasons: Record<string, string>;
  readonly teams: Record<string, TeamRating>;
  readonly referees: Record<string, RefereeRating>;
}

const state = ratingsState as unknown as RatingsState;

// ---------------------------------------------------------------- distribuzioni

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
] as const;

/** log Γ(x) per x > 0, approssimazione di Lanczos (g = 7). TypeScript puro. */
export function lgamma(x: number): number {
  if (x < 0.5) {
    // Riflessione: Γ(x)Γ(1−x) = π / sin(πx).
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  const z = x - 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i += 1) sum += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

export type DistributionKind = "negative-binomial" | "poisson";

/**
 * P(X = k) per media `mu` e rapporto varianza/media `dispersion`.
 * Con `dispersion` sotto la soglia dell'artefatto si usa la Poisson, che è il limite
 * della Binomiale Negativa per D → 1. Calcolo in spazio logaritmico.
 */
export function countPmf(k: number, mu: number, dispersion: number, threshold: number): number {
  if (!Number.isFinite(mu) || mu <= 0 || k < 0) return 0;
  if (dispersion <= threshold) {
    return Math.exp(-mu + k * Math.log(mu) - lgamma(k + 1));
  }
  const p = 1 / dispersion;
  const r = mu / (dispersion - 1);
  const logP =
    lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p);
  return Math.exp(logP);
}

function distributionKind(dispersion: number, threshold: number): DistributionKind {
  return dispersion <= threshold ? "poisson" : "negative-binomial";
}

/** P(X ≤ k) sommando la PMF; il troncamento supera di molto la coda utile. */
function cumulative(k: number, mu: number, dispersion: number, threshold: number): number {
  let total = 0;
  for (let i = 0; i <= k; i += 1) total += countPmf(i, mu, dispersion, threshold);
  return Math.min(1, total);
}

// ---------------------------------------------------------------- contratto pubblico

export interface StatLine {
  readonly line: number;
  readonly probOver: number;
  readonly probUnder: number;
  /** Soglia .5 più vicina al valore atteso: le altre quattro le stanno attorno. */
  readonly isCentral: boolean;
}

export interface RefereeAdjustment {
  readonly factor: number;
  readonly sample: number;
  readonly formulaVersion: string;
}

export interface MetricProjection {
  readonly metric: StatMetric;
  readonly expectedHome: number;
  readonly expectedAway: number;
  readonly expectedTotal: number;
  readonly teamDistribution: DistributionKind;
  readonly matchDistribution: DistributionKind;
  readonly homeLines: readonly StatLine[];
  readonly awayLines: readonly StatLine[];
  readonly totalLines: readonly StatLine[];
  readonly refereeAdjustment: RefereeAdjustment | null;
}

export interface TeamSample {
  readonly currentHome: number;
  readonly currentAway: number;
  readonly historicalMatches: number;
}

export interface StatEngineCoverage {
  /** `current-season` solo quando entrambe le squadre superano la soglia di sezione. */
  readonly tier: "current-season" | "previous-season";
  readonly home: TeamSample;
  readonly away: TeamSample;
  readonly requiredHome: number;
  readonly requiredAway: number;
  readonly seasonName: string | null;
}

export interface RefereeReading {
  readonly refereeId: number;
  readonly tier: "current-season" | "career";
  readonly currentMatches: number;
  readonly requiredMatches: number;
  /** Valorizzati solo sopra soglia: sotto soglia il dato corrente non è una lettura. */
  readonly yellowsPerMatch: number | null;
  readonly foulsPerMatch: number | null;
}

export interface StatEngineReading {
  readonly available: true;
  readonly leagueId: number;
  readonly coverage: StatEngineCoverage;
  readonly referee: RefereeReading | null;
  readonly metrics: readonly MetricProjection[];
  readonly missingMetrics: readonly StatMetric[];
  readonly formulaVersion: string;
  readonly generatedAt: string;
  readonly source: "iqstats-engine";
}

export type StatEngineUnavailableReason =
  | "invalid_input"
  | "league_not_calibrated"
  | "team_rating_missing"
  | "no_metric_covered";

export interface StatEngineUnavailable {
  readonly available: false;
  readonly reason: StatEngineUnavailableReason;
}

export type StatEngineResult = StatEngineReading | StatEngineUnavailable;

export interface StatEngineInput {
  readonly leagueId: number | null;
  readonly homeTeamId: number | null;
  readonly awayTeamId: number | null;
  readonly refereeId?: number | null;
}

// ---------------------------------------------------------------- calcolo

/** Offset della scala di soglie attorno alla centrale, in unità intere. */
const LINE_OFFSETS = [-2, -1, 0, 1, 2] as const;

/**
 * Scala di soglie .5 attorno all'atteso. `floor(μ) + 0.5` è per costruzione la .5 più
 * vicina a μ; le altre quattro le stanno attorno. Le soglie sotto 0.5 non esistono e
 * vengono omesse invece di essere spostate.
 */
function linesFor(mu: number, dispersion: number, threshold: number): StatLine[] {
  const centre = Math.floor(mu) + 0.5;
  const lines: StatLine[] = [];
  for (const offset of LINE_OFFSETS) {
    const line = centre + offset;
    if (line < 0.5) continue;
    const probUnder = cumulative(Math.floor(line), mu, dispersion, threshold);
    lines.push({
      line,
      probUnder,
      probOver: Math.max(0, 1 - probUnder),
      isCentral: offset === 0,
    });
  }
  return lines;
}

function refereeFactor(
  observedPerMatch: number | null,
  leagueMeanPerMatch: number,
  sample: number,
): RefereeAdjustment | null {
  if (observedPerMatch === null || leagueMeanPerMatch <= 0) return null;
  const weight = sample / (sample + REFEREE_SHRINKAGE_K);
  const raw = 1 + weight * (observedPerMatch / leagueMeanPerMatch - 1);
  const factor = Math.min(REFEREE_FACTOR_MAX, Math.max(REFEREE_FACTOR_MIN, raw));
  return { factor, sample, formulaVersion: REFEREE_BLEND_VERSION };
}

function readReferee(refereeId: number | null | undefined): {
  reading: RefereeReading | null;
  rating: RefereeRating | null;
} {
  if (typeof refereeId !== "number" || !Number.isInteger(refereeId) || refereeId <= 0) {
    return { reading: null, rating: null };
  }
  const rating = state.referees[String(refereeId)] ?? null;
  if (!rating) return { reading: null, rating: null };

  const aboveThreshold = rating.currentMatches >= REFEREE_MIN_CURRENT_MATCHES;
  return {
    rating: aboveThreshold ? rating : null,
    reading: {
      refereeId,
      tier: aboveThreshold ? "current-season" : "career",
      currentMatches: rating.currentMatches,
      requiredMatches: REFEREE_MIN_CURRENT_MATCHES,
      yellowsPerMatch: aboveThreshold ? rating.yellowsPerMatch : null,
      foulsPerMatch: aboveThreshold ? rating.foulsPerMatch : null,
    },
  };
}

/**
 * Lettura del motore per una gara. Fail-closed: se la lega non è calibrata o i rating
 * non esistono, dichiara copertura assente invece di stimare.
 */
export function getStatEngineReading(input: StatEngineInput): StatEngineResult {
  const { leagueId, homeTeamId, awayTeamId } = input;
  if (
    !Number.isInteger(leagueId) ||
    !Number.isInteger(homeTeamId) ||
    !Number.isInteger(awayTeamId)
  ) {
    return { available: false, reason: "invalid_input" };
  }

  const leagueBaselines = state.baselines[String(leagueId)];
  if (!leagueBaselines) return { available: false, reason: "league_not_calibrated" };

  const home = state.teams[`${leagueId}:${homeTeamId}`];
  const away = state.teams[`${leagueId}:${awayTeamId}`];
  if (!home || !away) return { available: false, reason: "team_rating_missing" };

  const threshold = state.dispersion.poissonFallbackThreshold;
  const referee = readReferee(input.refereeId);

  const metrics: MetricProjection[] = [];
  const missingMetrics: StatMetric[] = [];

  for (const metric of STAT_ENGINE_METRICS) {
    const baseline = leagueBaselines[metric];
    const homeRating = home.metrics[metric];
    const awayRating = away.metrics[metric];
    const teamDispersion = state.dispersion.team[metric];
    const matchDispersion = state.dispersion.match[metric];
    if (!baseline || !homeRating || !awayRating || !teamDispersion || !matchDispersion) {
      missingMetrics.push(metric);
      continue;
    }

    let expectedHome = baseline.home * homeRating.attack * awayRating.defence;
    let expectedAway = baseline.away * awayRating.attack * homeRating.defence;

    let adjustment: RefereeAdjustment | null = null;
    if (referee.rating && DISCIPLINE_METRICS.includes(metric)) {
      const observed =
        metric === "yellows" ? referee.rating.yellowsPerMatch : referee.rating.foulsPerMatch;
      adjustment = refereeFactor(
        observed,
        baseline.home + baseline.away,
        referee.rating.currentMatches,
      );
      if (adjustment) {
        expectedHome *= adjustment.factor;
        expectedAway *= adjustment.factor;
      }
    }

    const expectedTotal = expectedHome + expectedAway;

    metrics.push({
      metric,
      expectedHome,
      expectedAway,
      expectedTotal,
      teamDistribution: distributionKind(teamDispersion, threshold),
      matchDistribution: distributionKind(matchDispersion, threshold),
      homeLines: linesFor(expectedHome, teamDispersion, threshold),
      awayLines: linesFor(expectedAway, teamDispersion, threshold),
      totalLines: linesFor(expectedTotal, matchDispersion, threshold),
      refereeAdjustment: adjustment,
    });
  }

  if (metrics.length === 0) return { available: false, reason: "no_metric_covered" };

  const aboveThreshold =
    home.current.home >= CURRENT_SEASON_MIN_HOME &&
    home.current.away >= CURRENT_SEASON_MIN_AWAY &&
    away.current.home >= CURRENT_SEASON_MIN_HOME &&
    away.current.away >= CURRENT_SEASON_MIN_AWAY;

  return {
    available: true,
    leagueId: leagueId as number,
    coverage: {
      tier: aboveThreshold ? "current-season" : "previous-season",
      home: {
        currentHome: home.current.home,
        currentAway: home.current.away,
        historicalMatches: home.historical.home + home.historical.away,
      },
      away: {
        currentHome: away.current.home,
        currentAway: away.current.away,
        historicalMatches: away.historical.home + away.historical.away,
      },
      requiredHome: CURRENT_SEASON_MIN_HOME,
      requiredAway: CURRENT_SEASON_MIN_AWAY,
      seasonName: state.currentSeasons[String(leagueId)] ?? null,
    },
    referee: referee.reading,
    metrics,
    missingMetrics,
    formulaVersion: state.formulaVersion,
    generatedAt: state.generatedAt,
    source: "iqstats-engine",
  };
}
