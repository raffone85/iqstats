import type { DataEnvelope } from "../contracts/common.ts";
import type { ObservedMetric, TeamSide } from "../contracts/football.ts";
import {
  PLAYER_METRIC_KEYS,
  type MetricObservation,
  type PlayerMatchStats,
  type PlayerMetricKey,
  type SquadPosition,
  type TeamManagerProfile,
  type TeamMatchMetrics,
  type TeamMetricAverage,
  type TeamMetricDescriptor,
  type TeamMetricGroup,
  type TeamMetricKey,
  type TeamProfile,
  type TeamMatchLogEntry,
  type TeamSeasonSplit,
  type TeamSeasonSplits,
  type TeamSplitScope,
  type TeamSquad,
  type TeamSquadEntry,
  type TeamSquadMember,
  type TeamSquadMemberStats,
  type TeamVenue,
} from "../contracts/team.ts";
import {
  available,
  finiteInteger,
  finiteNumber,
  isRecord,
  isoDateTime,
  makeAvailability,
  makeCoverage,
  makeProvenance,
  nonEmptyString,
  stringId,
  unavailable,
  type UnknownRecord,
} from "./common.ts";

/** Gare minime perché una media venga esposta. Sotto questa soglia il valore resta `null` dichiarato. */
export const TEAM_MINIMUM_SAMPLE = 3;

export interface TeamNormalizationContext {
  readonly capturedAt: string;
}

export interface TeamMatchMetricsContext extends TeamNormalizationContext {
  readonly eventId: string;
  readonly teamId: string;
  readonly side: TeamSide;
  readonly playedAt?: string | null;
  readonly opponentName?: string | null;
  readonly refereeId?: string | null;
}

export interface TeamSeasonSplitsContext extends TeamNormalizationContext {
  readonly teamId: string;
  readonly seasonId: string;
  readonly minimumSample?: number;
  readonly period?: { readonly from: string | null; readonly to: string | null };
}

export interface TeamSquadContext extends TeamNormalizationContext {
  readonly teamId: string;
}

type MetricSource =
  | { readonly kind: "scalar"; readonly field: string }
  | { readonly kind: "child"; readonly field: string; readonly child: string }
  | { readonly kind: "compositeTotal"; readonly field: string }
  | { readonly kind: "compositeRatio"; readonly field: string }
  | { readonly kind: "fieldRatio"; readonly field: string; readonly totalField: string };

interface TeamMetricDefinition {
  readonly tier: "core" | "extended";
  readonly group: TeamMetricGroup;
  readonly supports: ObservedMetric | null;
  readonly percentage: boolean;
  readonly source: MetricSource;
}

function core(
  group: TeamMetricGroup,
  field: string,
): TeamMetricDefinition {
  return { tier: "core", group, supports: null, percentage: false, source: { kind: "scalar", field } };
}

function extended(
  group: TeamMetricGroup,
  supports: ObservedMetric | null,
  source: MetricSource,
  percentage = false,
): TeamMetricDefinition {
  return { tier: "extended", group, supports, percentage, source };
}

const scalar = (field: string): MetricSource => ({ kind: "scalar", field });
const compositeTotal = (field: string): MetricSource => ({ kind: "compositeTotal", field });
const compositeRatio = (field: string): MetricSource => ({ kind: "compositeRatio", field });

/**
 * Catalogo verificato su `events/{id}/stats/` (6 gare, 12 lati squadra).
 * Il nucleo sono le sette metriche ENG-1; ogni metrica del corredo dichiara con
 * `supports` quale metrica del nucleo valida.
 *
 * Escluse e motivate: `total_tackles` è un duplicato esatto di `tackles`;
 * `pass_accuracy_pct` è ricalcolata da `accurate_passes`/`passes`.
 * `tackles_won` supera sempre `tackles` nei campioni osservati: è una quota, non
 * un conteggio, ed è esposta come `tacklesWonShare`.
 */
const definitions: Readonly<Record<TeamMetricKey, TeamMetricDefinition>> = {
  shots: core("shooting", "total_shots"),
  shotsOnTarget: core("shooting", "shots_on_target"),
  fouls: core("discipline", "fouls"),
  corners: core("possession", "corner_kicks"),
  yellowCards: core("discipline", "yellow_cards"),
  goalkeeperSaves: core("goalkeeping", "goalkeeper_saves"),
  offsides: core("discipline", "offsides"),

  shotsInsideBox: extended("shooting", "shots", scalar("shots_inside_box")),
  shotsOutsideBox: extended("shooting", "shots", scalar("shots_outside_box")),
  shotsOffTarget: extended("shooting", "shotsOnTarget", scalar("shots_off_target")),
  blockedShots: extended("shooting", "shots", scalar("blocked_shots")),
  hitWoodwork: extended("shooting", "shots", scalar("hit_woodwork")),
  bigChances: extended("shooting", "shots", scalar("big_chances")),
  bigChancesScored: extended("shooting", "shots", scalar("big_chances_scored")),
  bigChancesMissed: extended("shooting", "shots", scalar("big_chances_missed")),
  expectedGoals: extended("shooting", "shotsOnTarget", scalar("expected_goals")),
  xgActual: extended("shooting", "shotsOnTarget", { kind: "child", field: "xg", child: "actual" }),
  touchesInPenaltyArea: extended("shooting", "shots", scalar("touches_in_penalty_area")),

  ballPossession: extended("possession", null, scalar("ball_possession"), true),
  passes: extended("possession", null, scalar("passes")),
  accuratePasses: extended("possession", null, scalar("accurate_passes")),
  passAccuracy: extended(
    "possession",
    null,
    { kind: "fieldRatio", field: "accurate_passes", totalField: "passes" },
    true,
  ),
  longBallsAttempted: extended("possession", null, compositeTotal("long_balls")),
  longBallsAccuracy: extended("possession", null, compositeRatio("long_balls"), true),
  crossesAttempted: extended("possession", "corners", compositeTotal("crosses")),
  crossesAccuracy: extended("possession", "corners", compositeRatio("crosses"), true),
  dribblesAttempted: extended("possession", null, compositeTotal("dribbles")),
  dribblesSuccess: extended("possession", null, compositeRatio("dribbles"), true),
  finalThirdEntries: extended("possession", null, scalar("final_third_entries")),
  finalThirdPhaseAttempted: extended("possession", null, compositeTotal("final_third_phase")),
  finalThirdPhaseSuccess: extended("possession", null, compositeRatio("final_third_phase"), true),
  throughBalls: extended("possession", null, scalar("through_balls")),
  dispossessed: extended("possession", null, scalar("dispossessed")),
  attacks: extended("possession", null, scalar("attack")),
  attackShare: extended("possession", null, scalar("attack_pct"), true),
  dangerousAttacks: extended("possession", null, scalar("dangerous_attack")),
  dangerousAttackShare: extended("possession", null, scalar("dangerous_attack_pct"), true),
  ballSafe: extended("possession", null, scalar("ball_safe")),
  ballSafeShare: extended("possession", null, scalar("ball_safe_pct"), true),

  tackles: extended("defence", null, scalar("tackles")),
  tacklesWonShare: extended("defence", null, scalar("tackles_won"), true),
  interceptions: extended("defence", null, scalar("interceptions")),
  clearances: extended("defence", null, scalar("clearances")),
  recoveries: extended("defence", null, scalar("recoveries")),
  duels: extended("defence", null, scalar("duels")),
  groundDuelsContested: extended("defence", null, compositeTotal("ground_duels")),
  groundDuelsWon: extended("defence", null, compositeRatio("ground_duels"), true),
  aerialDuelsContested: extended("defence", null, compositeTotal("aerial_duels")),
  aerialDuelsWon: extended("defence", null, compositeRatio("aerial_duels"), true),
  errorsLeadToAShot: extended("defence", null, scalar("errors_lead_to_a_shot")),

  totalSaves: extended("goalkeeping", "goalkeeperSaves", scalar("total_saves")),
  bigSaves: extended("goalkeeping", "goalkeeperSaves", scalar("big_saves")),
  goalsPrevented: extended("goalkeeping", "goalkeeperSaves", scalar("goals_prevented")),
  punches: extended("goalkeeping", null, scalar("punches")),
  highClaims: extended("goalkeeping", null, scalar("high_claims")),

  redCards: extended("discipline", "yellowCards", scalar("red_cards")),
  freeKicks: extended("discipline", "fouls", scalar("free_kicks")),
  fouledInFinalThird: extended("discipline", "fouls", scalar("fouled_in_final_third")),
  throwIns: extended("discipline", null, scalar("throw_ins")),
  goalKicks: extended("discipline", null, scalar("goal_kicks")),
};

const metricKeys = Object.keys(definitions) as readonly TeamMetricKey[];

export const TEAM_METRIC_CATALOG: readonly TeamMetricDescriptor[] = metricKeys.map((key) => {
  const definition = definitions[key];
  return {
    key,
    tier: definition.tier,
    group: definition.group,
    supports: definition.supports,
    percentage: definition.percentage,
  };
});

function isRatio(source: MetricSource): boolean {
  return source.kind === "compositeRatio" || source.kind === "fieldRatio";
}

function readObservation(raw: UnknownRecord, source: MetricSource): MetricObservation {
  switch (source.kind) {
    case "scalar":
      return { value: finiteNumber(raw[source.field]), total: null };
    case "child": {
      const nested = raw[source.field];
      return { value: isRecord(nested) ? finiteNumber(nested[source.child]) : null, total: null };
    }
    case "compositeTotal": {
      const composite = raw[source.field];
      return { value: isRecord(composite) ? finiteNumber(composite.total) : null, total: null };
    }
    case "compositeRatio": {
      const composite = raw[source.field];
      if (!isRecord(composite)) return { value: null, total: null };
      return { value: finiteNumber(composite.value), total: finiteNumber(composite.total) };
    }
    case "fieldRatio":
      return { value: finiteNumber(raw[source.field]), total: finiteNumber(raw[source.totalField]) };
  }
}

function observed(observation: MetricObservation, source: MetricSource): boolean {
  return isRatio(source)
    ? observation.value !== null && observation.total !== null
    : observation.value !== null;
}

function readSideMetrics(raw: UnknownRecord): {
  readonly metrics: Record<TeamMetricKey, MetricObservation>;
  readonly missing: readonly string[];
} {
  const metrics = {} as Record<TeamMetricKey, MetricObservation>;
  const missing: string[] = [];
  for (const key of metricKeys) {
    const source = definitions[key].source;
    const observation = readObservation(raw, source);
    metrics[key] = observation;
    if (!observed(observation, source)) missing.push(key);
  }
  return { metrics, missing };
}

export function normalizeTeamMatchMetrics(
  payload: unknown,
  context: TeamMatchMetricsContext,
): DataEnvelope<TeamMatchMetrics> {
  const provenance = makeProvenance(context.capturedAt);
  const stats = isRecord(payload) ? payload.stats : null;
  const raw = isRecord(stats) ? stats[context.side] : null;
  if (!isRecord(raw)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", [`stats.${context.side}`]),
      provenance,
      calculation: null,
    };
  }

  const { metrics, missing } = readSideMetrics(raw);
  const opponentSide: TeamSide = context.side === "home" ? "away" : "home";
  const opponentRaw = isRecord(stats) ? stats[opponentSide] : null;
  const opponentMetrics = isRecord(opponentRaw)
    ? readSideMetrics(opponentRaw).metrics
    : (Object.fromEntries(
        metricKeys.map((key) => [key, { value: null, total: null }]),
      ) as Record<TeamMetricKey, MetricObservation>);

  return {
    data: {
      eventId: context.eventId,
      teamId: context.teamId,
      side: context.side,
      playedAt: context.playedAt ?? null,
      opponentName: context.opponentName ?? null,
      refereeId: context.refereeId ?? null,
      metrics,
      opponentMetrics,
      availability: makeAvailability(
        missing.length === 0 ? "available" : "partial",
        missing.length === 0 ? null : "not_captured",
        missing,
        makeCoverage(metricKeys.length - missing.length, metricKeys.length),
      ),
      provenance,
    },
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "not_captured",
      missing,
      makeCoverage(metricKeys.length - missing.length, metricKeys.length),
    ),
    provenance,
    calculation: null,
  };
}

function averageMetric(
  key: TeamMetricKey,
  rows: readonly TeamMatchMetrics[],
  minimumSample: number,
): TeamMetricAverage {
  const source = definitions[key].source;
  const observations = rows
    .map((row) => row.metrics[key])
    .filter((observation) => observed(observation, source));
  const sample = observations.length;

  if (sample === 0) {
    return { key, average: unavailable<number>("not_captured"), sample };
  }
  if (sample < minimumSample) {
    return { key, average: unavailable<number>("insufficient_coverage"), sample };
  }

  if (isRatio(source)) {
    const numerator = observations.reduce((total, item) => total + (item.value ?? 0), 0);
    const denominator = observations.reduce((total, item) => total + (item.total ?? 0), 0);
    return denominator > 0
      ? { key, average: available((numerator / denominator) * 100), sample }
      : { key, average: unavailable<number>("not_captured"), sample };
  }

  const sum = observations.reduce((total, item) => total + (item.value ?? 0), 0);
  return { key, average: available(sum / sample), sample };
}

function buildSplit(
  venue: TeamSplitScope,
  rows: readonly TeamMatchMetrics[],
  minimumSample: number,
): TeamSeasonSplit {
  return {
    venue,
    matches: rows.length,
    metrics: metricKeys.map((key) => averageMetric(key, rows, minimumSample)),
  };
}

/** Valore leggibile della singola gara: percentuale per i rapporti, conteggio per il resto. */
function matchValue(observation: MetricObservation, source: MetricSource): number | null {
  if (!observed(observation, source)) return null;
  if (!isRatio(source)) return observation.value;
  const total = observation.total ?? 0;
  return total > 0 ? ((observation.value ?? 0) / total) * 100 : null;
}

function buildMatchLog(rows: readonly TeamMatchMetrics[]): readonly TeamMatchLogEntry[] {
  const entries: TeamMatchLogEntry[] = rows
    .map((row) => {
      const values = {} as Record<TeamMetricKey, number | null>;
      const opponentValues = {} as Record<TeamMetricKey, number | null>;
      for (const key of metricKeys) {
        const source = definitions[key].source;
        values[key] = matchValue(row.metrics[key], source);
        opponentValues[key] = matchValue(row.opponentMetrics[key], source);
      }
      return {
        eventId: row.eventId,
        playedAt: row.playedAt,
        opponentName: row.opponentName,
        refereeId: row.refereeId,
        side: row.side,
        values,
        opponentValues,
      };
    });
  // Più recente prima: è l'ordine in cui si guarda un rendimento.
  return entries.sort((left, right) => (right.playedAt ?? "").localeCompare(left.playedAt ?? ""));
}

/**
 * Aggrega le gare già normalizzate in medie casa e trasferta. Le metriche assenti
 * non diventano `0`: escono dal campione, che resta dichiarato per ogni metrica.
 */
export function aggregateTeamSeasonSplits(
  rows: readonly TeamMatchMetrics[],
  context: TeamSeasonSplitsContext,
): DataEnvelope<TeamSeasonSplits> {
  const provenance = makeProvenance(context.capturedAt);
  const minimumSample = context.minimumSample ?? TEAM_MINIMUM_SAMPLE;
  const home = buildSplit("home", rows.filter((row) => row.side === "home"), minimumSample);
  const away = buildSplit("away", rows.filter((row) => row.side === "away"), minimumSample);

  const belowThreshold = [home, away].filter((split) => split.matches < minimumSample).length;
  const status = rows.length === 0
    ? "unavailable"
    : belowThreshold > 0
      ? "partial"
      : "available";
  const reason = rows.length === 0
    ? "not_captured"
    : belowThreshold > 0
      ? "insufficient_coverage"
      : null;

  return {
    data: {
      teamId: context.teamId,
      seasonId: context.seasonId,
      minimumSample,
      home,
      away,
      overall: buildSplit("overall", rows, minimumSample),
      matchLog: buildMatchLog(rows),
    },
    availability: makeAvailability(
      status,
      reason,
      [home, away].filter((split) => split.matches < minimumSample).map((split) => split.venue),
      makeCoverage(rows.length, rows.length),
    ),
    provenance,
    calculation: {
      formulaVersion: "team-season-split.v1",
      sampleSize: rows.length,
      period: context.period ?? { from: null, to: null },
    },
  };
}

const positions: Readonly<Record<string, SquadPosition>> = {
  G: "goalkeeper",
  D: "defender",
  M: "midfielder",
  F: "forward",
};

function normalizeSquadMember(raw: unknown): TeamSquadMember | null {
  if (!isRecord(raw)) return null;
  const playerId = stringId(raw.id);
  const name = nonEmptyString(raw.name);
  if (!playerId || !name) return null;
  const position = nonEmptyString(raw.position);
  return {
    playerId,
    name,
    shortName: nonEmptyString(raw.short_name),
    position: position ? positions[position] ?? null : null,
    jerseyNumber: finiteInteger(raw.jersey_number),
    nationality: nonEmptyString(raw.nationality),
    dateOfBirth: nonEmptyString(raw.date_of_birth),
  };
}

export function normalizeTeamSquad(
  payload: unknown,
  context: TeamSquadContext,
): DataEnvelope<readonly TeamSquadMember[]> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload) || !Array.isArray(payload.players)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["players"]),
      provenance,
      calculation: null,
    };
  }
  const missing: string[] = [];
  const members: TeamSquadMember[] = [];
  payload.players.forEach((raw, index) => {
    const member = normalizeSquadMember(raw);
    if (member) members.push(member);
    else missing.push(`players[${index}]`);
  });
  return {
    data: members,
    availability: makeAvailability(
      missing.length === 0 ? "available" : "partial",
      missing.length === 0 ? null : "validation_failed",
      missing,
      makeCoverage(members.length, payload.players.length),
    ),
    provenance,
    calculation: null,
  };
}

const playerMetricFields: Readonly<Record<PlayerMetricKey, string>> = Object.fromEntries(
  PLAYER_METRIC_KEYS.map((key) => [key, key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]),
) as Readonly<Record<PlayerMetricKey, string>>;

export interface PlayerMatchStatsContext extends TeamNormalizationContext {
  readonly teamId: string;
}

/**
 * Estrae le righe della squadra richiesta da `events/{id}/player-stats/`: un solo
 * GET copre entrambe le formazioni, quindi il filtro per `team_id` è obbligatorio.
 */
export function normalizeEventPlayerStats(
  payload: unknown,
  context: PlayerMatchStatsContext,
): DataEnvelope<readonly PlayerMatchStats[]> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload) || !Array.isArray(payload.player_stats)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["player_stats"]),
      provenance,
      calculation: null,
    };
  }
  const eventId = stringId(payload.event_id);
  if (!eventId) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["event_id"]),
      provenance,
      calculation: null,
    };
  }

  const missing: string[] = [];
  const rows: PlayerMatchStats[] = [];
  let teamRows = 0;
  payload.player_stats.forEach((raw, index) => {
    if (!isRecord(raw)) {
      missing.push(`player_stats[${index}]`);
      return;
    }
    if (stringId(raw.team_id) !== context.teamId) return;
    teamRows += 1;
    const playerId = stringId(raw.player_id);
    if (!playerId) {
      missing.push(`player_stats[${index}].player_id`);
      return;
    }
    const metrics = {} as Record<PlayerMetricKey, number | null>;
    for (const key of PLAYER_METRIC_KEYS) {
      metrics[key] = finiteNumber(raw[playerMetricFields[key]]);
    }
    rows.push({
      eventId,
      playerId,
      teamId: context.teamId,
      minutesPlayed: finiteInteger(raw.minutes_played),
      rating: finiteNumber(raw.rating),
      metrics,
    });
  });

  return {
    data: rows,
    availability: makeAvailability(
      teamRows === 0 ? "unavailable" : missing.length === 0 ? "available" : "partial",
      teamRows === 0 ? "not_captured" : missing.length === 0 ? null : "validation_failed",
      missing,
      makeCoverage(rows.length, teamRows),
    ),
    provenance,
    calculation: null,
  };
}

function sumMetric(rows: readonly PlayerMatchStats[], key: PlayerMetricKey): number | null {
  const values = rows.map((row) => row.metrics[key]).filter((value): value is number => value !== null);
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
}

function aggregateMember(
  playerId: string,
  rows: readonly PlayerMatchStats[],
  minimumSample: number,
): TeamSquadMemberStats {
  const ratings = rows.map((row) => row.rating).filter((value): value is number => value !== null);
  const totals = {} as Record<PlayerMetricKey, number | null>;
  for (const key of PLAYER_METRIC_KEYS) totals[key] = sumMetric(rows, key);

  return {
    playerId,
    appearances: rows.filter((row) => (row.minutesPlayed ?? 0) > 0).length,
    minutes: rows.reduce((total, row) => total + (row.minutesPlayed ?? 0), 0),
    rating: ratings.length >= minimumSample
      ? available(ratings.reduce((total, value) => total + value, 0) / ratings.length)
      : unavailable<number>(ratings.length === 0 ? "not_captured" : "insufficient_coverage"),
    ratingSample: ratings.length,
    totals,
  };
}

export interface TeamSquadAggregationContext extends TeamSquadContext {
  readonly minimumSample?: number;
  readonly matchesCovered: number;
}

/**
 * Unisce la rosa anagrafica alle righe per gara. I giocatori senza gare restano in
 * rosa con `stats: null`; le righe di chi non è più in rosa sono dichiarate fra i
 * campi mancanti invece di essere scartate in silenzio.
 */
export function aggregateTeamSquad(
  members: readonly TeamSquadMember[],
  playerStats: readonly PlayerMatchStats[],
  context: TeamSquadAggregationContext,
): DataEnvelope<TeamSquad> {
  const provenance = makeProvenance(context.capturedAt);
  const minimumSample = context.minimumSample ?? TEAM_MINIMUM_SAMPLE;
  const byPlayer = new Map<string, PlayerMatchStats[]>();
  for (const row of playerStats) {
    const existing = byPlayer.get(row.playerId);
    if (existing) existing.push(row);
    else byPlayer.set(row.playerId, [row]);
  }

  const entries: TeamSquadEntry[] = members.map((profile) => {
    const rows = byPlayer.get(profile.playerId) ?? [];
    return {
      profile,
      stats: rows.length === 0 ? null : aggregateMember(profile.playerId, rows, minimumSample),
    };
  });

  const rostered = new Set(members.map((member) => member.playerId));
  const unmatched = [...byPlayer.keys()].filter((playerId) => !rostered.has(playerId));
  const withStats = entries.filter((entry) => entry.stats !== null).length;

  return {
    data: { teamId: context.teamId, entries, matchesCovered: context.matchesCovered },
    availability: makeAvailability(
      members.length === 0 ? "unavailable" : withStats === members.length ? "available" : "partial",
      members.length === 0
        ? "not_captured"
        : withStats === members.length
          ? null
          : "insufficient_coverage",
      unmatched.map((playerId) => `playerStats.notInSquad[${playerId}]`),
      makeCoverage(withStats, members.length),
    ),
    provenance,
    calculation: {
      formulaVersion: "team-squad-stats.v1",
      sampleSize: context.matchesCovered,
      period: { from: null, to: null },
    },
  };
}

function normalizeVenue(payload: unknown): TeamVenue | null {
  if (!isRecord(payload)) return null;
  const venueId = stringId(payload.id);
  const name = nonEmptyString(payload.name);
  if (!venueId || !name) return null;
  return {
    venueId,
    name,
    city: nonEmptyString(payload.city),
    capacity: finiteInteger(payload.capacity),
    builtYear: finiteInteger(payload.built_year),
  };
}

/**
 * `teams/{id}/` espone soltanto identità e `venue_id`: lo stadio arriva da
 * `venues/{id}/` e l'allenatore va derivato dalle gare, mai dedotto qui.
 */
export function normalizeTeamProfile(
  payload: unknown,
  venuePayload: unknown,
  context: TeamNormalizationContext,
): DataEnvelope<TeamProfile> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["team"]),
      provenance,
      calculation: null,
    };
  }
  const teamId = stringId(payload.id);
  const name = nonEmptyString(payload.name);
  if (!teamId || !name) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["id", "name"]),
      provenance,
      calculation: null,
    };
  }

  const venue = normalizeVenue(venuePayload);
  const missing: string[] = [];
  if (!venue) missing.push("venue");
  const availability = makeAvailability(
    missing.length === 0 ? "available" : "partial",
    missing.length === 0 ? null : "not_captured",
    missing,
  );

  return {
    data: {
      teamId,
      name,
      shortName: nonEmptyString(payload.short_name),
      country: nonEmptyString(payload.country),
      venue,
      availability,
      provenance,
    },
    availability,
    provenance,
    calculation: null,
  };
}

/**
 * `managers/{id}/` può riportare un `current_team_id` diverso dalla squadra
 * richiesta: il contratto lo espone senza interpretarlo, l'allenatore va derivato
 * dalla gara e dichiarato tale.
 */
export interface TeamManagerContext extends TeamNormalizationContext {
  /** Gara da cui è stato derivato l'allenatore, dichiarata nel dato. */
  readonly derivedFromMatchId?: string;
}

export function normalizeTeamManager(
  payload: unknown,
  context: TeamManagerContext,
): DataEnvelope<TeamManagerProfile> {
  const provenance = makeProvenance(context.capturedAt);
  if (!isRecord(payload)) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["manager"]),
      provenance,
      calculation: null,
    };
  }
  const managerId = stringId(payload.id);
  const name = nonEmptyString(payload.name);
  if (!managerId || !name) {
    return {
      data: null,
      availability: makeAvailability("error", "validation_failed", ["id", "name"]),
      provenance,
      calculation: null,
    };
  }

  const aggregates = {
    matchesTotal: finiteInteger(payload.matches_total),
    winPct: finiteNumber(payload.win_pct),
    avgGoalsScored: finiteNumber(payload.avg_goals_scored),
    avgGoalsConceded: finiteNumber(payload.avg_goals_conceded),
    avgPossession: finiteNumber(payload.avg_possession),
    cleanSheetPct: finiteNumber(payload.clean_sheet_pct),
  };
  const missing = Object.entries(aggregates)
    .filter(([, value]) => value === null)
    .map(([field]) => field);
  const availability = makeAvailability(
    missing.length === 0 ? "available" : "partial",
    missing.length === 0 ? null : "not_captured",
    missing,
  );

  return {
    data: {
      managerId,
      name,
      country: nonEmptyString(payload.country),
      tacticalProfile: nonEmptyString(payload.tactical_profile),
      preferredFormation: nonEmptyString(payload.preferred_formation),
      currentTeamId: stringId(payload.current_team_id),
      ...aggregates,
      statsUpdatedAt: isoDateTime(payload.stats_updated_at),
      derivedFromMatchId: context.derivedFromMatchId ?? null,
      availability,
      provenance,
    },
    availability,
    provenance,
    calculation: null,
  };
}
