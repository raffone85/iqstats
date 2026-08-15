import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const METRICS = ["shots", "sot", "fouls", "corners", "yellows", "saves", "offsides"] as const;
const DATASET_HEADER = [
  "league_id",
  "match_id",
  "date",
  "team",
  "side",
  ...METRICS,
] as const;
const POISSON_FALLBACK_THRESHOLD = 1.05;
const LEAGUE_OVERRIDE_THRESHOLD = 0.1;
const FORMULA_VERSION = "cal-3-sample-variance-v1";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SCRIPT_DIR, "data");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");
const DATASET_PATH = path.join(DATA_DIR, "dataset.csv");
const QUALITY_PATH = path.join(OUTPUT_DIR, "DATASET_QUALITY.json");
const REPORT_JSON_PATH = path.join(OUTPUT_DIR, "CALIBRATION_REPORT.json");
const REPORT_MARKDOWN_PATH = path.join(OUTPUT_DIR, "CALIBRATION_REPORT.md");
const DISPERSION_PATH = path.join(OUTPUT_DIR, "MARKET_DISPERSION.generated.ts");
const BASELINES_PATH = path.join(OUTPUT_DIR, "LEAGUE_BASELINES.generated.ts");

type JsonRecord = Record<string, unknown>;
type Metric = (typeof METRICS)[number];
type Side = "home" | "away";
type SampleStatus = "insufficient" | "below-target" | "target-met";
type CalibrationDecision = "exclude" | "include-with-caveat" | "include";

type CliOptions = {
  help: boolean;
  leagueIds: Set<number>;
  limitMatches: number | null;
  noWrite: boolean;
  quiet: boolean;
};

type MetricQuality = {
  matches: number;
  completeMatches: number;
  missingMatches: number;
  missingMatchRate: number | null;
  excluded: boolean;
  exclusionReason: string | null;
};

type LeagueQuality = {
  leagueId: number;
  name: string;
  country: string;
  dateFrom: string;
  dateTo: string;
  matchCount: number;
  teamRowCount: number;
  sampleStatus: SampleStatus;
  calibrationDecision: CalibrationDecision;
  metrics: Record<Metric, MetricQuality>;
};

type QualityReport = {
  schemaVersion: number;
  generatedAt: string;
  status: string;
  nextGate: string;
  source: {
    dataset: string;
    manifest: string;
    manifestRunId: string;
    manifestStartedAt: string;
    manifestCompletedAt: string | null;
  };
  rules: {
    minimumMatches: number;
    targetMatches: number;
    maximumMissingMatchRate: number;
    matchMissingDefinition: string;
    missingValues: string;
  };
  integrity: {
    status: string;
    passedChecks: number;
    totalChecks: number;
  };
  summary: {
    leagueCount: number;
    matchCount: number;
    teamRowCount: number;
    includedLeagueMetrics: number;
    excludedLeagueMetrics: number;
  };
  leagues: LeagueQuality[];
};

type DatasetRow = {
  leagueId: number;
  matchId: number;
  date: string;
  team: string;
  side: Side;
  metrics: Record<Metric, number | null>;
};

type MatchRows = {
  leagueId: number;
  matchId: number;
  date: string;
  home: DatasetRow;
  away: DatasetRow;
};

type Dataset = {
  rows: DatasetRow[];
  matches: MatchRows[];
};

type DescriptiveStats = {
  n: number;
  mean: number | null;
  variance: number | null;
  sd: number | null;
  dispersion: number | null;
};

type MetricAnalysis = {
  metric: Metric;
  completeMatches: number;
  missingMatches: number;
  missingMatchRate: number | null;
  team: DescriptiveStats;
  home: DescriptiveStats;
  away: DescriptiveStats;
  match: DescriptiveStats;
  homeAwayRatio: number | null;
};

type LeagueAnalysis = {
  leagueId: number;
  name: string;
  country: string;
  dateFrom: string;
  dateTo: string;
  observedDateFrom: string | null;
  observedDateTo: string | null;
  matchCount: number;
  sampleStatus: SampleStatus;
  calibrationDecision: CalibrationDecision;
  caveats: string[];
  metrics: Partial<Record<Metric, MetricAnalysis>>;
};

type GlobalMetricAnalysis = MetricAnalysis & {
  contributingLeagues: number;
};

type Exclusion = {
  leagueId: number;
  league: string;
  metric: Metric;
  reason: string;
  matches: number;
  completeMatches: number;
  missingMatches: number;
  missingMatchRate: number | null;
};

type AnalysisReport = {
  schemaVersion: 1;
  formulaVersion: typeof FORMULA_VERSION;
  generatedAt: string;
  status: "completed";
  nextGate: "human-confirmation-required-before-CAL-4";
  source: {
    dataset: "scripts/calibration/data/dataset.csv";
    qualityReport: "scripts/calibration/output/DATASET_QUALITY.json";
    qualityGeneratedAt: string;
    manifest: string;
    manifestRunId: string;
    manifestStartedAt: string;
    manifestCompletedAt: string | null;
  };
  rules: {
    observationPolicy: "complete-home-away-matches-only";
    missingValues: "excluded-never-imputed";
    variance: "sample-n-minus-1";
    dispersion: "sample-variance-divided-by-mean";
    poissonFallbackThreshold: number;
    poissonFallbackRule: "D<=1.05 becomes 1.00 in generated constants";
    leagueOverrideThreshold: number;
    leagueOverrideRule: "absolute-raw-D-difference-from-global>0.10";
    baselineAggregation: "league-id-only";
    globalAggregation: "dispersion-reference-only-not-a-baseline";
  };
  scope: {
    mode: "full" | "smoke";
    leagueIds: number[] | null;
    limitMatchesPerLeague: number | null;
    writesEnabled: boolean;
  };
  summary: {
    selectedLeagues: number;
    datasetRows: number;
    datasetMatches: number;
    analyzedMatches: number;
    includedLeagueMetrics: number;
    excludedLeagueMetrics: number;
    globalMetrics: number;
    belowTargetLeagues: number;
  };
  global: Partial<Record<Metric, GlobalMetricAnalysis>>;
  leagues: LeagueAnalysis[];
  exclusions: Exclusion[];
};

type MetricObservations = {
  contributingLeagueIds: Set<number>;
  candidateMatches: number;
  missingMatches: number;
  home: number[];
  away: number[];
  match: number[];
};

function printUsage(): void {
  console.log(`CAL-3 — IQstatS dispersion and league baselines

Usage:
  node --experimental-strip-types scripts/calibration/analyze.ts [options]

Options:
  --league-id <id>       Limit a smoke run to a league; repeatable.
  --limit-matches <n>    Limit each selected league to the first n chronological matches.
  --no-write             Calculate and validate without writing generated outputs.
  --quiet                Suppress the detailed console table.
  -h, --help             Show this help.

Inputs:
  scripts/calibration/data/dataset.csv
  scripts/calibration/output/DATASET_QUALITY.json

Outputs (full run only):
  scripts/calibration/output/CALIBRATION_REPORT.json
  scripts/calibration/output/CALIBRATION_REPORT.md
  scripts/calibration/output/MARKET_DISPERSION.generated.ts
  scripts/calibration/output/LEAGUE_BASELINES.generated.ts

Filtered or limited runs require --no-write so partial results cannot overwrite the
full calibration outputs.
`);
}

function parsePositiveInteger(value: string, option: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${option}: intero positivo non valido.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option}: intero positivo non valido.`);
  }
  return parsed;
}

function parseCli(args: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    leagueIds: new Set<number>(),
    limitMatches: null,
    noWrite: false,
    quiet: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "--league-id") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--league-id richiede un valore.");
      options.leagueIds.add(parsePositiveInteger(value, "--league-id"));
      index += 1;
    } else if (argument === "--limit-matches") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--limit-matches richiede un valore.");
      options.limitMatches = parsePositiveInteger(value, "--limit-matches");
      index += 1;
    } else if (argument === "--no-write") {
      options.noWrite = true;
    } else if (argument === "--quiet") {
      options.quiet = true;
    } else {
      throw new Error(`Argomento non riconosciuto: ${argument}.`);
    }
  }
  if ((options.leagueIds.size > 0 || options.limitMatches !== null) && !options.noWrite) {
    throw new Error("I run filtrati o limitati richiedono --no-write.");
  }
  return options;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, context: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${context}: oggetto non valido.`);
  return value;
}

function requiredString(record: JsonRecord, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: campo ${key} assente o non valido.`);
  }
  return value;
}

function nullableString(record: JsonRecord, key: string, context: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: campo ${key} non valido.`);
  }
  return value;
}

function requiredInteger(record: JsonRecord, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context}: campo ${key} assente o non valido.`);
  }
  return value;
}

function requiredNumber(record: JsonRecord, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}: campo ${key} assente o non valido.`);
  }
  return value;
}

function nullableNumber(record: JsonRecord, key: string, context: string): number | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}: campo ${key} non valido.`);
  }
  return value;
}

function requiredBoolean(record: JsonRecord, key: string, context: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${context}: campo ${key} assente o non valido.`);
  }
  return value;
}

function metricRecord<T>(factory: (metric: Metric) => T): Record<Metric, T> {
  return Object.fromEntries(METRICS.map((metric) => [metric, factory(metric)])) as Record<
    Metric,
    T
  >;
}

function parseSampleStatus(value: string, context: string): SampleStatus {
  if (value !== "insufficient" && value !== "below-target" && value !== "target-met") {
    throw new Error(`${context}: sampleStatus non valido.`);
  }
  return value;
}

function parseCalibrationDecision(value: string, context: string): CalibrationDecision {
  if (value !== "exclude" && value !== "include-with-caveat" && value !== "include") {
    throw new Error(`${context}: calibrationDecision non valida.`);
  }
  return value;
}

function parseQualityReport(value: unknown): QualityReport {
  const record = requiredRecord(value, "DATASET_QUALITY");
  const source = requiredRecord(record.source, "DATASET_QUALITY source");
  const rules = requiredRecord(record.rules, "DATASET_QUALITY rules");
  const integrity = requiredRecord(record.integrity, "DATASET_QUALITY integrity");
  const summary = requiredRecord(record.summary, "DATASET_QUALITY summary");
  if (!Array.isArray(record.leagues)) {
    throw new Error("DATASET_QUALITY: leagues non valido.");
  }
  const leagues = record.leagues.map((item, index): LeagueQuality => {
    const context = `DATASET_QUALITY lega ${index}`;
    const league = requiredRecord(item, context);
    const metricsRecord = requiredRecord(league.metrics, `${context} metrics`);
    const metrics = metricRecord<MetricQuality>((metric) => {
      const metricContext = `${context} metrica ${metric}`;
      const quality = requiredRecord(metricsRecord[metric], metricContext);
      return {
        matches: requiredInteger(quality, "matches", metricContext),
        completeMatches: requiredInteger(quality, "completeMatches", metricContext),
        missingMatches: requiredInteger(quality, "missingMatches", metricContext),
        missingMatchRate: nullableNumber(quality, "missingMatchRate", metricContext),
        excluded: requiredBoolean(quality, "excluded", metricContext),
        exclusionReason: nullableString(quality, "exclusionReason", metricContext),
      };
    });
    return {
      leagueId: requiredInteger(league, "leagueId", context),
      name: requiredString(league, "name", context),
      country: requiredString(league, "country", context),
      dateFrom: requiredString(league, "dateFrom", context),
      dateTo: requiredString(league, "dateTo", context),
      matchCount: requiredInteger(league, "matchCount", context),
      teamRowCount: requiredInteger(league, "teamRowCount", context),
      sampleStatus: parseSampleStatus(requiredString(league, "sampleStatus", context), context),
      calibrationDecision: parseCalibrationDecision(
        requiredString(league, "calibrationDecision", context),
        context,
      ),
      metrics,
    };
  });
  const schemaVersion = requiredInteger(record, "schemaVersion", "DATASET_QUALITY");
  if (schemaVersion !== 1) throw new Error(`DATASET_QUALITY: schemaVersion ${schemaVersion} non supportata.`);
  return {
    schemaVersion,
    generatedAt: requiredString(record, "generatedAt", "DATASET_QUALITY"),
    status: requiredString(record, "status", "DATASET_QUALITY"),
    nextGate: requiredString(record, "nextGate", "DATASET_QUALITY"),
    source: {
      dataset: requiredString(source, "dataset", "DATASET_QUALITY source"),
      manifest: requiredString(source, "manifest", "DATASET_QUALITY source"),
      manifestRunId: requiredString(source, "manifestRunId", "DATASET_QUALITY source"),
      manifestStartedAt: requiredString(source, "manifestStartedAt", "DATASET_QUALITY source"),
      manifestCompletedAt: nullableString(
        source,
        "manifestCompletedAt",
        "DATASET_QUALITY source",
      ),
    },
    rules: {
      minimumMatches: requiredInteger(rules, "minimumMatches", "DATASET_QUALITY rules"),
      targetMatches: requiredInteger(rules, "targetMatches", "DATASET_QUALITY rules"),
      maximumMissingMatchRate: requiredNumber(
        rules,
        "maximumMissingMatchRate",
        "DATASET_QUALITY rules",
      ),
      matchMissingDefinition: requiredString(
        rules,
        "matchMissingDefinition",
        "DATASET_QUALITY rules",
      ),
      missingValues: requiredString(rules, "missingValues", "DATASET_QUALITY rules"),
    },
    integrity: {
      status: requiredString(integrity, "status", "DATASET_QUALITY integrity"),
      passedChecks: requiredInteger(
        integrity,
        "passedChecks",
        "DATASET_QUALITY integrity",
      ),
      totalChecks: requiredInteger(integrity, "totalChecks", "DATASET_QUALITY integrity"),
    },
    summary: {
      leagueCount: requiredInteger(summary, "leagueCount", "DATASET_QUALITY summary"),
      matchCount: requiredInteger(summary, "matchCount", "DATASET_QUALITY summary"),
      teamRowCount: requiredInteger(summary, "teamRowCount", "DATASET_QUALITY summary"),
      includedLeagueMetrics: requiredInteger(
        summary,
        "includedLeagueMetrics",
        "DATASET_QUALITY summary",
      ),
      excludedLeagueMetrics: requiredInteger(
        summary,
        "excludedLeagueMetrics",
        "DATASET_QUALITY summary",
      ),
    },
    leagues,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("dataset.csv: quoting non chiuso.");
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function parseDataset(text: string): Dataset {
  const [header = [], ...dataRows] = parseCsv(text);
  if (
    header.length !== DATASET_HEADER.length ||
    !DATASET_HEADER.every((field, index) => header[index] === field)
  ) {
    throw new Error(`dataset.csv: header non valido; atteso ${DATASET_HEADER.join(",")}.`);
  }
  const rows: DatasetRow[] = [];
  const grouped = new Map<string, Partial<Record<Side, DatasetRow>>>();
  for (const [rowIndex, cells] of dataRows.entries()) {
    const context = `dataset.csv riga ${rowIndex + 2}`;
    if (cells.length !== DATASET_HEADER.length) {
      throw new Error(`${context}: numero colonne non valido.`);
    }
    const leagueId = parsePositiveInteger(cells[0] ?? "", `${context} league_id`);
    const matchId = parsePositiveInteger(cells[1] ?? "", `${context} match_id`);
    const date = cells[2] ?? "";
    const team = cells[3] ?? "";
    const sideValue = cells[4] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${context}: data non valida.`);
    if (team.trim() === "") throw new Error(`${context}: squadra mancante.`);
    if (sideValue !== "home" && sideValue !== "away") {
      throw new Error(`${context}: side non valido.`);
    }
    const metrics = metricRecord<number | null>((metric) => {
      const value = cells[DATASET_HEADER.indexOf(metric)] ?? "";
      if (value === "") return null;
      if (!/^\d+$/.test(value)) throw new Error(`${context}: ${metric} non valido.`);
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`${context}: ${metric} non valido.`);
      }
      return parsed;
    });
    const side = sideValue;
    const parsedRow: DatasetRow = { leagueId, matchId, date, team, side, metrics };
    const key = `${leagueId}|${matchId}`;
    const group = grouped.get(key) ?? {};
    if (group[side] !== undefined) throw new Error(`${context}: duplicato ${key}|${side}.`);
    group[side] = parsedRow;
    grouped.set(key, group);
    rows.push(parsedRow);
  }
  const matches: MatchRows[] = [];
  for (const [key, group] of grouped) {
    if (group.home === undefined || group.away === undefined) {
      throw new Error(`dataset.csv: coppia home/away incompleta per ${key}.`);
    }
    if (group.home.date !== group.away.date) {
      throw new Error(`dataset.csv: date home/away discordanti per ${key}.`);
    }
    matches.push({
      leagueId: group.home.leagueId,
      matchId: group.home.matchId,
      date: group.home.date,
      home: group.home,
      away: group.away,
    });
  }
  matches.sort(
    (left, right) =>
      left.leagueId - right.leagueId ||
      left.date.localeCompare(right.date) ||
      left.matchId - right.matchId,
  );
  return { rows, matches };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function descriptiveStats(values: number[]): DescriptiveStats {
  if (values.length === 0) {
    return { n: 0, mean: null, variance: null, sd: null, dispersion: null };
  }
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  if (values.length === 1) {
    return { n: 1, mean, variance: null, sd: null, dispersion: null };
  }
  const squaredDeviations = values.reduce((total, value) => {
    const difference = value - mean;
    return total + difference * difference;
  }, 0);
  const variance = squaredDeviations / (values.length - 1);
  const sd = Math.sqrt(variance);
  const dispersion = mean === 0 ? null : variance / mean;
  return { n: values.length, mean, variance, sd, dispersion };
}

function pairedSums(home: number[], away: number[], context: string): number[] {
  if (home.length !== away.length) throw new Error(`${context}: coppie home/away incoerenti.`);
  return home.map((homeValue, index) => {
    const awayValue = away[index];
    if (awayValue === undefined) throw new Error(`${context}: valore away assente.`);
    return homeValue + awayValue;
  });
}

function interleave(home: number[], away: number[], context: string): number[] {
  if (home.length !== away.length) throw new Error(`${context}: coppie home/away incoerenti.`);
  return home.flatMap((homeValue, index) => {
    const awayValue = away[index];
    if (awayValue === undefined) throw new Error(`${context}: valore away assente.`);
    return [homeValue, awayValue];
  });
}

function analyzeMetric(
  metric: Metric,
  matches: MatchRows[],
): {
  analysis: MetricAnalysis;
  observations: Pick<MetricObservations, "home" | "away" | "match">;
} {
  const home: number[] = [];
  const away: number[] = [];
  for (const match of matches) {
    const homeValue = match.home.metrics[metric];
    const awayValue = match.away.metrics[metric];
    if (homeValue === null || awayValue === null) continue;
    home.push(homeValue);
    away.push(awayValue);
  }
  const matchTotals = pairedSums(home, away, `${metric}, match`);
  const homeStats = descriptiveStats(home);
  const awayStats = descriptiveStats(away);
  const analysis: MetricAnalysis = {
    metric,
    completeMatches: home.length,
    missingMatches: matches.length - home.length,
    missingMatchRate: rate(matches.length - home.length, matches.length),
    team: descriptiveStats(interleave(home, away, `${metric}, team`)),
    home: homeStats,
    away: awayStats,
    match: descriptiveStats(matchTotals),
    homeAwayRatio:
      homeStats.mean === null || awayStats.mean === null || awayStats.mean === 0
        ? null
        : homeStats.mean / awayStats.mean,
  };
  return { analysis, observations: { home, away, match: matchTotals } };
}

function assertDefinedStats(stats: DescriptiveStats, context: string): void {
  if (
    stats.n < 2 ||
    stats.mean === null ||
    stats.variance === null ||
    stats.sd === null ||
    stats.dispersion === null ||
    !Number.isFinite(stats.mean) ||
    !Number.isFinite(stats.variance) ||
    !Number.isFinite(stats.sd) ||
    !Number.isFinite(stats.dispersion)
  ) {
    throw new Error(`${context}: statistiche non definite per un output completo.`);
  }
}

function analyze(
  dataset: Dataset,
  quality: QualityReport,
  options: CliOptions,
  generatedAt: string,
): AnalysisReport {
  const isFullScope = options.leagueIds.size === 0 && options.limitMatches === null;
  const qualityByLeague = new Map(quality.leagues.map((league) => [league.leagueId, league]));
  for (const leagueId of options.leagueIds) {
    if (!qualityByLeague.has(leagueId)) {
      throw new Error(`--league-id ${leagueId}: lega assente dal contratto QA.`);
    }
  }
  const matchesByLeague = new Map<number, MatchRows[]>();
  for (const match of dataset.matches) {
    const matches = matchesByLeague.get(match.leagueId) ?? [];
    matches.push(match);
    matchesByLeague.set(match.leagueId, matches);
  }
  const selectedQualities = quality.leagues.filter(
    (league) => options.leagueIds.size === 0 || options.leagueIds.has(league.leagueId),
  );
  const globalObservations = metricRecord<MetricObservations>(() => ({
    contributingLeagueIds: new Set<number>(),
    candidateMatches: 0,
    missingMatches: 0,
    home: [],
    away: [],
    match: [],
  }));
  const leagues: LeagueAnalysis[] = [];
  const exclusions: Exclusion[] = [];
  let analyzedMatches = 0;

  for (const qualityLeague of selectedQualities) {
    const allMatches = matchesByLeague.get(qualityLeague.leagueId) ?? [];
    if (isFullScope && allMatches.length !== qualityLeague.matchCount) {
      throw new Error(
        `Lega ${qualityLeague.leagueId}: ${allMatches.length} match nel dataset, ${qualityLeague.matchCount} nel QA.`,
      );
    }
    const matches =
      options.limitMatches === null ? allMatches : allMatches.slice(0, options.limitMatches);
    analyzedMatches += matches.length;
    const metricAnalyses: Partial<Record<Metric, MetricAnalysis>> = {};
    for (const metric of METRICS) {
      const metricQuality = qualityLeague.metrics[metric];
      if (metricQuality.excluded) {
        exclusions.push({
          leagueId: qualityLeague.leagueId,
          league: qualityLeague.name,
          metric,
          reason: metricQuality.exclusionReason ?? "qa-excluded-without-reason",
          matches: metricQuality.matches,
          completeMatches: metricQuality.completeMatches,
          missingMatches: metricQuality.missingMatches,
          missingMatchRate: metricQuality.missingMatchRate,
        });
        continue;
      }
      const { analysis, observations } = analyzeMetric(metric, matches);
      if (isFullScope && analysis.completeMatches !== metricQuality.completeMatches) {
        throw new Error(
          `Lega ${qualityLeague.leagueId}, ${metric}: ${analysis.completeMatches} match completi osservati, ${metricQuality.completeMatches} nel QA.`,
        );
      }
      if (isFullScope) {
        assertDefinedStats(analysis.team, `Lega ${qualityLeague.leagueId}, ${metric}, team`);
        assertDefinedStats(analysis.home, `Lega ${qualityLeague.leagueId}, ${metric}, home`);
        assertDefinedStats(analysis.away, `Lega ${qualityLeague.leagueId}, ${metric}, away`);
        assertDefinedStats(analysis.match, `Lega ${qualityLeague.leagueId}, ${metric}, match`);
      }
      metricAnalyses[metric] = analysis;
      const global = globalObservations[metric];
      global.contributingLeagueIds.add(qualityLeague.leagueId);
      global.candidateMatches += matches.length;
      global.missingMatches += analysis.missingMatches;
      global.home.push(...observations.home);
      global.away.push(...observations.away);
      global.match.push(...observations.match);
    }
    const dates = matches.map((match) => match.date).sort();
    const caveats =
      qualityLeague.sampleStatus === "below-target"
        ? [
            `Campione sotto il target QA di ${quality.rules.targetMatches} match: ${qualityLeague.matchCount}.`,
          ]
        : [];
    leagues.push({
      leagueId: qualityLeague.leagueId,
      name: qualityLeague.name,
      country: qualityLeague.country,
      dateFrom: qualityLeague.dateFrom,
      dateTo: qualityLeague.dateTo,
      observedDateFrom: dates[0] ?? null,
      observedDateTo: dates.at(-1) ?? null,
      matchCount: matches.length,
      sampleStatus: qualityLeague.sampleStatus,
      calibrationDecision: qualityLeague.calibrationDecision,
      caveats,
      metrics: metricAnalyses,
    });
  }

  const global: Partial<Record<Metric, GlobalMetricAnalysis>> = {};
  for (const metric of METRICS) {
    const observations = globalObservations[metric];
    if (observations.contributingLeagueIds.size === 0) continue;
    const homeStats = descriptiveStats(observations.home);
    const awayStats = descriptiveStats(observations.away);
    const analysis: GlobalMetricAnalysis = {
      metric,
      contributingLeagues: observations.contributingLeagueIds.size,
      completeMatches: observations.match.length,
      missingMatches: observations.missingMatches,
      missingMatchRate: rate(observations.missingMatches, observations.candidateMatches),
      team: descriptiveStats(interleave(observations.home, observations.away, `Globale ${metric}, team`)),
      home: homeStats,
      away: awayStats,
      match: descriptiveStats(observations.match),
      homeAwayRatio:
        homeStats.mean === null || awayStats.mean === null || awayStats.mean === 0
          ? null
          : homeStats.mean / awayStats.mean,
    };
    if (isFullScope) {
      assertDefinedStats(analysis.team, `Globale ${metric}, team`);
      assertDefinedStats(analysis.home, `Globale ${metric}, home`);
      assertDefinedStats(analysis.away, `Globale ${metric}, away`);
      assertDefinedStats(analysis.match, `Globale ${metric}, match`);
    }
    global[metric] = analysis;
  }

  const includedLeagueMetrics = leagues.reduce(
    (total, league) => total + Object.keys(league.metrics).length,
    0,
  );
  const report: AnalysisReport = {
    schemaVersion: 1,
    formulaVersion: FORMULA_VERSION,
    generatedAt,
    status: "completed",
    nextGate: "human-confirmation-required-before-CAL-4",
    source: {
      dataset: "scripts/calibration/data/dataset.csv",
      qualityReport: "scripts/calibration/output/DATASET_QUALITY.json",
      qualityGeneratedAt: quality.generatedAt,
      manifest: quality.source.manifest,
      manifestRunId: quality.source.manifestRunId,
      manifestStartedAt: quality.source.manifestStartedAt,
      manifestCompletedAt: quality.source.manifestCompletedAt,
    },
    rules: {
      observationPolicy: "complete-home-away-matches-only",
      missingValues: "excluded-never-imputed",
      variance: "sample-n-minus-1",
      dispersion: "sample-variance-divided-by-mean",
      poissonFallbackThreshold: POISSON_FALLBACK_THRESHOLD,
      poissonFallbackRule: "D<=1.05 becomes 1.00 in generated constants",
      leagueOverrideThreshold: LEAGUE_OVERRIDE_THRESHOLD,
      leagueOverrideRule: "absolute-raw-D-difference-from-global>0.10",
      baselineAggregation: "league-id-only",
      globalAggregation: "dispersion-reference-only-not-a-baseline",
    },
    scope: {
      mode: isFullScope ? "full" : "smoke",
      leagueIds: options.leagueIds.size === 0 ? null : [...options.leagueIds].sort((a, b) => a - b),
      limitMatchesPerLeague: options.limitMatches,
      writesEnabled: !options.noWrite,
    },
    summary: {
      selectedLeagues: leagues.length,
      datasetRows: dataset.rows.length,
      datasetMatches: dataset.matches.length,
      analyzedMatches,
      includedLeagueMetrics,
      excludedLeagueMetrics: exclusions.length,
      globalMetrics: Object.keys(global).length,
      belowTargetLeagues: leagues.filter((league) => league.sampleStatus === "below-target").length,
    },
    global,
    leagues,
    exclusions,
  };
  validateReport(report, quality, isFullScope);
  return report;
}

function validateReport(
  report: AnalysisReport,
  quality: QualityReport,
  isFullScope: boolean,
): void {
  const includedKeys = new Set<string>();
  for (const league of report.leagues) {
    for (const metric of METRICS) {
      const analysis = league.metrics[metric];
      if (analysis === undefined) continue;
      const key = `${league.leagueId}|${metric}`;
      if (includedKeys.has(key)) throw new Error(`Risultato duplicato: ${key}.`);
      includedKeys.add(key);
      if (analysis.completeMatches !== analysis.home.n || analysis.completeMatches !== analysis.away.n) {
        throw new Error(`${key}: campioni home/away incoerenti.`);
      }
      if (analysis.team.n !== analysis.completeMatches * 2 || analysis.match.n !== analysis.completeMatches) {
        throw new Error(`${key}: granularità team/match incoerente.`);
      }
    }
  }
  const excludedKeys = new Set(report.exclusions.map((item) => `${item.leagueId}|${item.metric}`));
  for (const key of includedKeys) {
    if (excludedKeys.has(key)) throw new Error(`${key}: combinazione inclusa ed esclusa.`);
  }
  if (!isFullScope) return;
  if (report.summary.datasetRows !== quality.summary.teamRowCount) {
    throw new Error("Run completo: numero righe diverso dal contratto QA.");
  }
  if (report.summary.datasetMatches !== quality.summary.matchCount) {
    throw new Error("Run completo: numero match diverso dal contratto QA.");
  }
  if (report.summary.selectedLeagues !== quality.summary.leagueCount) {
    throw new Error("Run completo: numero leghe diverso dal contratto QA.");
  }
  if (report.summary.includedLeagueMetrics !== quality.summary.includedLeagueMetrics) {
    throw new Error("Run completo: combinazioni incluse diverse dal contratto QA.");
  }
  if (report.summary.excludedLeagueMetrics !== quality.summary.excludedLeagueMetrics) {
    throw new Error("Run completo: combinazioni escluse diverse dal contratto QA.");
  }
  if (report.summary.globalMetrics !== METRICS.length) {
    throw new Error("Run completo: riferimento globale incompleto.");
  }
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function requiredDispersion(stats: DescriptiveStats, context: string): number {
  if (stats.dispersion === null || !Number.isFinite(stats.dispersion)) {
    throw new Error(`${context}: dispersione assente.`);
  }
  return stats.dispersion;
}

function normalizedDispersion(raw: number): number {
  return raw <= POISSON_FALLBACK_THRESHOLD ? 1 : round(raw);
}

function buildDispersionScope(report: AnalysisReport, scope: "team" | "match"): JsonRecord {
  const global: JsonRecord = {};
  const byLeague: JsonRecord = {};
  for (const metric of METRICS) {
    const globalAnalysis = report.global[metric];
    if (globalAnalysis === undefined) continue;
    const raw = requiredDispersion(globalAnalysis[scope], `Globale ${metric}, ${scope}`);
    global[metric] = {
      n: globalAnalysis[scope].n,
      raw: round(raw),
      value: normalizedDispersion(raw),
    };
  }
  for (const league of report.leagues) {
    const metrics: JsonRecord = {};
    for (const metric of METRICS) {
      const analysis = league.metrics[metric];
      const globalAnalysis = report.global[metric];
      if (analysis === undefined || globalAnalysis === undefined) continue;
      const raw = requiredDispersion(analysis[scope], `Lega ${league.leagueId}, ${metric}, ${scope}`);
      const globalRaw = requiredDispersion(globalAnalysis[scope], `Globale ${metric}, ${scope}`);
      const delta = raw - globalRaw;
      if (Math.abs(delta) <= LEAGUE_OVERRIDE_THRESHOLD) continue;
      metrics[metric] = {
        n: analysis[scope].n,
        raw: round(raw),
        value: normalizedDispersion(raw),
        deltaFromGlobal: round(delta),
      };
    }
    if (Object.keys(metrics).length > 0) {
      byLeague[String(league.leagueId)] = {
        leagueId: league.leagueId,
        name: league.name,
        sampleStatus: league.sampleStatus,
        caveats: league.caveats,
        metrics,
      };
    }
  }
  return { global, byLeague };
}

function buildMarketDispersion(report: AnalysisReport): JsonRecord {
  return {
    schemaVersion: report.schemaVersion,
    formulaVersion: report.formulaVersion,
    generatedAt: report.generatedAt,
    source: report.source,
    poissonFallbackThreshold: POISSON_FALLBACK_THRESHOLD,
    leagueOverrideThreshold: LEAGUE_OVERRIDE_THRESHOLD,
    team: buildDispersionScope(report, "team"),
    match: buildDispersionScope(report, "match"),
  };
}

function baselineStats(stats: DescriptiveStats, context: string): JsonRecord {
  if (stats.mean === null || stats.sd === null) {
    throw new Error(`${context}: baseline non definita.`);
  }
  return { n: stats.n, mean: round(stats.mean), sd: round(stats.sd) };
}

function buildLeagueBaselines(report: AnalysisReport): JsonRecord {
  const leagues: JsonRecord = {};
  for (const league of report.leagues) {
    const metrics: JsonRecord = {};
    for (const metric of METRICS) {
      const analysis = league.metrics[metric];
      if (analysis === undefined) continue;
      metrics[metric] = {
        completeMatches: analysis.completeMatches,
        home: baselineStats(analysis.home, `Lega ${league.leagueId}, ${metric}, home`),
        away: baselineStats(analysis.away, `Lega ${league.leagueId}, ${metric}, away`),
        match: baselineStats(analysis.match, `Lega ${league.leagueId}, ${metric}, match`),
        homeAwayRatio:
          analysis.homeAwayRatio === null ? null : round(analysis.homeAwayRatio),
      };
    }
    if (Object.keys(metrics).length === 0) continue;
    leagues[String(league.leagueId)] = {
      leagueId: league.leagueId,
      name: league.name,
      country: league.country,
      dateFrom: league.dateFrom,
      dateTo: league.dateTo,
      observedDateFrom: league.observedDateFrom,
      observedDateTo: league.observedDateTo,
      matchCount: league.matchCount,
      sampleStatus: league.sampleStatus,
      caveats: league.caveats,
      metrics,
    };
  }
  return {
    schemaVersion: report.schemaVersion,
    formulaVersion: report.formulaVersion,
    generatedAt: report.generatedAt,
    source: report.source,
    aggregation: "league-id-only",
    leagues,
  };
}

function generatedTypeScript(exportName: string, value: JsonRecord): string {
  return `// Generated by scripts/calibration/analyze.ts.
// Do not edit by hand. Values come from complete home/away matches admitted by CAL-2.

export const ${exportName} = ${JSON.stringify(value, null, 2)} as const;
`;
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function numberText(value: number | null, digits = 4): string {
  return value === null ? "n/d" : value.toFixed(digits);
}

function percentText(value: number | null): string {
  return value === null ? "n/d" : `${(value * 100).toFixed(1)}%`;
}

function buildMarkdown(report: AnalysisReport): string {
  const lines: string[] = [
    "# CAL-3 — dispersione e baseline di lega",
    "",
    `Generato: ${report.generatedAt}`,
    `Formula: \`${report.formulaVersion}\``,
    `Manifest: \`${report.source.manifestRunId}\``,
    "Stato: **completed**",
    "",
    "CAL-4 non è stato eseguito. I risultati richiedono conferma umana prima di sanity check, backtest o integrazione nell'app.",
    "",
    "## Metodo",
    "",
    "- Entrano nei calcoli soltanto match con valore presente sia home sia away per la metrica.",
    "- I null sono esclusi e non vengono mai imputati o convertiti in zero.",
    "- Varianza e SD sono campionarie, con denominatore `n - 1`; `D = varianza / media`.",
    "- Le baseline sono calcolate separatamente per `league_id`; il globale è soltanto un riferimento di dispersione.",
    `- Nelle costanti generate, D <= ${POISSON_FALLBACK_THRESHOLD.toFixed(2)} diventa 1.00.`,
    `- Un override di lega è emesso quando |D lega - D globale| > ${LEAGUE_OVERRIDE_THRESHOLD.toFixed(2)} sul D grezzo.`,
    "",
    "## Sintesi",
    "",
    `- Leghe: ${report.summary.selectedLeagues}.`,
    `- Match nel dataset: ${report.summary.datasetMatches}.`,
    `- Righe team-gara: ${report.summary.datasetRows}.`,
    `- Combinazioni lega/metrica analizzate: ${report.summary.includedLeagueMetrics}.`,
    `- Combinazioni escluse dal QA: ${report.summary.excludedLeagueMetrics}.`,
    `- Leghe sotto target incluse con caveat: ${report.summary.belowTargetLeagues}.`,
    "",
    "## Riferimento globale di dispersione",
    "",
    "Questo aggregato non è una baseline di lega.",
    "",
    "| Metrica | Leghe | Match completi | Team n | Team media | Team SD | Team D | Match media | Match SD | Match D | Home/Away |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const metric of METRICS) {
    const item = report.global[metric];
    if (item === undefined) continue;
    lines.push(
      `| ${metric} | ${item.contributingLeagues} | ${item.completeMatches} | ${item.team.n} | ${numberText(item.team.mean)} | ${numberText(item.team.sd)} | ${numberText(item.team.dispersion)} | ${numberText(item.match.mean)} | ${numberText(item.match.sd)} | ${numberText(item.match.dispersion)} | ${numberText(item.homeAwayRatio)} |`,
    );
  }
  lines.push(
    "",
    "## Risultati per lega e metrica",
    "",
    "| ID | Lega | Campione | Metrica | Match completi | Missing | Team media | Team SD | Team D | Home media | Home SD | Home D | Away media | Away SD | Away D | Match media | Match SD | Match D | H/A |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const league of report.leagues) {
    for (const metric of METRICS) {
      const item = league.metrics[metric];
      if (item === undefined) continue;
      lines.push(
        `| ${league.leagueId} | ${markdownEscape(league.name)} | ${league.sampleStatus} | ${metric} | ${item.completeMatches} | ${item.missingMatches} (${percentText(item.missingMatchRate)}) | ${numberText(item.team.mean)} | ${numberText(item.team.sd)} | ${numberText(item.team.dispersion)} | ${numberText(item.home.mean)} | ${numberText(item.home.sd)} | ${numberText(item.home.dispersion)} | ${numberText(item.away.mean)} | ${numberText(item.away.sd)} | ${numberText(item.away.dispersion)} | ${numberText(item.match.mean)} | ${numberText(item.match.sd)} | ${numberText(item.match.dispersion)} | ${numberText(item.homeAwayRatio)} |`,
      );
    }
  }
  lines.push(
    "",
    "## Caveat campione",
    "",
  );
  const caveatLeagues = report.leagues.filter((league) => league.caveats.length > 0);
  if (caveatLeagues.length === 0) lines.push("Nessun caveat di campione.");
  for (const league of caveatLeagues) {
    lines.push(`- ${league.name} (ID ${league.leagueId}): ${league.caveats.join(" ")}`);
  }
  lines.push(
    "",
    "## Combinazioni escluse dal QA",
    "",
    "| ID | Lega | Metrica | Motivo | Match | Completi | Missing |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: |",
  );
  for (const exclusion of report.exclusions) {
    lines.push(
      `| ${exclusion.leagueId} | ${markdownEscape(exclusion.league)} | ${exclusion.metric} | ${exclusion.reason} | ${exclusion.matches} | ${exclusion.completeMatches} | ${exclusion.missingMatches} (${percentText(exclusion.missingMatchRate)}) |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function printConsoleTable(report: AnalysisReport): void {
  const rows: JsonRecord[] = [];
  for (const league of report.leagues) {
    for (const metric of METRICS) {
      const analysis = league.metrics[metric];
      if (analysis === undefined) continue;
      for (const scope of ["team", "home", "away", "match"] as const) {
        const stats = analysis[scope];
        rows.push({
          leagueId: league.leagueId,
          league: league.name,
          metric,
          scope,
          n: stats.n,
          mean: stats.mean === null ? null : round(stats.mean, 4),
          sd: stats.sd === null ? null : round(stats.sd, 4),
          D: stats.dispersion === null ? null : round(stats.dispersion, 4),
          completeMatches: analysis.completeMatches,
          homeAwayRatio:
            analysis.homeAwayRatio === null ? null : round(analysis.homeAwayRatio, 4),
        });
      }
    }
  }
  console.table(rows);
}

async function atomicWrite(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, "utf8");
  try {
    await rename(temporary, target);
  } catch (error) {
    if (isRecord(error) && (error.code === "EEXIST" || error.code === "EPERM")) {
      await writeFile(target, contents, "utf8");
      await rm(temporary, { force: true });
      return;
    }
    await rm(temporary, { force: true });
    throw error;
  }
}

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const [qualityText, datasetText] = await Promise.all([
    readFile(QUALITY_PATH, "utf8"),
    readFile(DATASET_PATH, "utf8"),
  ]);
  const quality = parseQualityReport(JSON.parse(qualityText) as unknown);
  if (quality.integrity.status !== "passed") {
    throw new Error("DATASET_QUALITY: integrità non superata; CAL-3 interrotto.");
  }
  if (quality.status !== "ready" && quality.status !== "ready-with-exclusions") {
    throw new Error(`DATASET_QUALITY: stato ${quality.status} non eseguibile.`);
  }
  if (quality.source.dataset !== "scripts/calibration/data/dataset.csv") {
    throw new Error("DATASET_QUALITY: sorgente dataset inattesa.");
  }
  const dataset = parseDataset(datasetText);
  console.log(`[CAL-3] Dataset letto: ${dataset.rows.length} righe, ${dataset.matches.length} match.`);
  const report = analyze(dataset, quality, options, new Date().toISOString());
  if (!options.quiet) printConsoleTable(report);
  console.log(
    `[CAL-3] Calcolate ${report.summary.includedLeagueMetrics} combinazioni; ${report.summary.excludedLeagueMetrics} escluse dal QA.`,
  );
  if (options.noWrite) {
    console.log("[CAL-3] Run senza scritture completato.");
    return;
  }
  const marketDispersion = buildMarketDispersion(report);
  const leagueBaselines = buildLeagueBaselines(report);
  await atomicWrite(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(REPORT_MARKDOWN_PATH, buildMarkdown(report));
  await atomicWrite(
    DISPERSION_PATH,
    generatedTypeScript("MARKET_DISPERSION", marketDispersion),
  );
  await atomicWrite(
    BASELINES_PATH,
    generatedTypeScript("LEAGUE_BASELINES", leagueBaselines),
  );
  console.log("[CAL-3] Output completi scritti in scripts/calibration/output/.");
  console.log("[CAL-3] Checkpoint umano richiesto prima di CAL-4.");
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Errore sconosciuto.";
  console.error(`[CAL-3] ${message}`);
  process.exitCode = 1;
});
