import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const METRICS = ["shots", "sot", "fouls", "corners", "yellows", "saves", "offsides"] as const;
const GRANULARITIES = ["team", "match"] as const;
const DATASET_HEADER = [
  "league_id",
  "match_id",
  "date",
  "team",
  "side",
  ...METRICS,
] as const;
const TRAIN_DATE_SHARE = 0.7;
const CENTRAL_INTERVAL_MASS = 0.8;
const PAIRED_INTERVAL_Z = 1.96;
const POISSON_FALLBACK_THRESHOLD = 1.05;
const LEAGUE_OVERRIDE_THRESHOLD = 0.1;
const SANITY_DISTANCE_THRESHOLD = 0.5;
const FORMULA_VERSION = "cal-4a-temporal-distribution-backtest-v1";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.join(SCRIPT_DIR, "data", "dataset.csv");
const QUALITY_PATH = path.join(SCRIPT_DIR, "output", "DATASET_QUALITY.json");
const CALIBRATION_PATH = path.join(SCRIPT_DIR, "output", "CALIBRATION_REPORT.json");
const REPORT_JSON_PATH = path.join(SCRIPT_DIR, "output", "MODEL_VALIDATION.json");
const REPORT_MARKDOWN_PATH = path.join(SCRIPT_DIR, "output", "MODEL_VALIDATION.md");
const GENERATED_PATH = path.join(SCRIPT_DIR, "output", "MODEL_VALIDATION.generated.ts");

type JsonRecord = Record<string, unknown>;
type Metric = (typeof METRICS)[number];
type Side = "home" | "away";
type Granularity = (typeof GRANULARITIES)[number];
type ModelName = "poisson" | "negative-binomial-global" | "negative-binomial-league-override";
type DistributionKind = "poisson" | "negative-binomial";

type CliOptions = {
  help: boolean;
  selfTest: boolean;
  leagueIds: Set<number>;
  limitMatches: number | null;
  noWrite: boolean;
  quiet: boolean;
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

type DefinedStats = {
  n: number;
  mean: number;
  variance: number;
  sd: number;
  dispersion: number;
};

type MetricQuality = {
  excluded: boolean;
  exclusionReason: string | null;
};

type LeagueQuality = {
  leagueId: number;
  name: string;
  country: string;
  sampleStatus: string;
  calibrationDecision: string;
  metrics: Record<Metric, MetricQuality>;
};

type QualityReport = {
  schemaVersion: number;
  generatedAt: string;
  status: string;
  source: {
    dataset: string;
    manifest: string;
    manifestRunId: string;
  };
  integrity: {
    status: string;
    passedChecks: number;
    totalChecks: number;
  };
  summary: {
    matchCount: number;
    teamRowCount: number;
    includedLeagueMetrics: number;
  };
  leagues: LeagueQuality[];
};

type CalibrationMetric = {
  team: DescriptiveStats;
  home: DescriptiveStats;
  away: DescriptiveStats;
  match: DescriptiveStats;
};

type CalibrationLeague = {
  leagueId: number;
  name: string;
  country: string;
  sampleStatus: string;
  calibrationDecision: string;
  caveats: string[];
  metrics: Partial<Record<Metric, CalibrationMetric>>;
};

type CalibrationReport = {
  schemaVersion: number;
  formulaVersion: string;
  generatedAt: string;
  status: string;
  source: {
    dataset: string;
    qualityReport: string;
    qualityGeneratedAt: string;
    manifestRunId: string;
  };
  summary: {
    datasetRows: number;
    datasetMatches: number;
    includedLeagueMetrics: number;
  };
  leagues: CalibrationLeague[];
};

type LeagueSplit = {
  leagueId: number;
  league: string;
  distinctDates: number;
  trainDateCount: number;
  testDateCount: number;
  trainDateFrom: string;
  trainDateTo: string;
  testDateFrom: string;
  testDateTo: string;
  trainMatches: MatchRows[];
  testMatches: MatchRows[];
};

type DistributionParameters = {
  kind: DistributionKind;
  mean: number;
  requestedDispersion: number;
  effectiveDispersion: number;
  size: number | null;
  probability: number | null;
};

type ModelEvaluation = {
  model: ModelName;
  requestedDispersion: number;
  effectiveDispersion: number;
  distribution: DistributionKind;
  observations: number;
  meanNll: number;
  central80: {
    mass: number;
    observations: number;
    covered: number;
    coverage: number;
  };
  lossByMatch: Record<string, number>;
};

type PairedComparison = {
  candidate: ModelName;
  reference: ModelName;
  pairingUnit: "match";
  pairs: number;
  meanNllDifference: number;
  standardError: number | null;
  interval95: {
    method: "normal-approximation";
    lower: number | null;
    upper: number | null;
  };
  interpretation: "candidate-lower" | "reference-lower" | "inconclusive";
};

type CompletedValidation = {
  status: "completed";
  leagueId: number;
  league: string;
  country: string;
  sampleStatus: string;
  caveats: string[];
  metric: Metric;
  granularity: Granularity;
  split: {
    trainMatches: number;
    testMatches: number;
    trainCompleteMatches: number;
    testCompleteMatches: number;
  };
  trainParameters: {
    mean: number | { home: number; away: number };
    globalDispersion: number;
    leagueDispersion: number;
    leagueOverrideApplied: boolean;
    overrideDispersion: number;
  };
  models: Record<ModelName, ModelEvaluation>;
  pairedComparisons: PairedComparison[];
  bestMeanNllModel: ModelName;
};

type IncompleteValidation = {
  status: "not-evaluable";
  leagueId: number;
  league: string;
  country: string;
  sampleStatus: string;
  caveats: string[];
  metric: Metric;
  granularity: Granularity;
  reason: string;
  split: {
    trainMatches: number;
    testMatches: number;
    trainCompleteMatches: number;
    testCompleteMatches: number;
  };
};

type ValidationResult = CompletedValidation | IncompleteValidation;

type Evidence = {
  availability: "numerical" | "directional" | "unavailable";
  source: string;
  url: string | null;
  range: { lower: number; upper: number } | null;
  note: string;
};

type SanityResult = {
  metric: Metric;
  observedTeamDispersion: number;
  threshold: number;
  pilot: Evidence & { distance: number | null };
  external: Evidence & { distance: number | null };
  suspicious: boolean;
  assessment:
    | "suspicious"
    | "not-suspicious"
    | "not-assessable-with-two-numerical-references";
};

type GlobalTraining = {
  metric: Metric;
  granularity: Granularity;
  contributingLeagues: number;
  completeTrainMatches: number;
  observations: number;
  mean: number;
  variance: number;
  dispersion: number;
};

type ValidationReport = {
  schemaVersion: 1;
  formulaVersion: typeof FORMULA_VERSION;
  generatedAt: string;
  status: "completed-awaiting-human-review" | "completed-with-suspicions-awaiting-human-review";
  nextGate: "human-review-required-after-CAL-4-before-app-integration";
  source: {
    dataset: "scripts/calibration/data/dataset.csv";
    qualityReport: "scripts/calibration/output/DATASET_QUALITY.json";
    qualityGeneratedAt: string;
    calibrationReport: "scripts/calibration/output/CALIBRATION_REPORT.json";
    calibrationGeneratedAt: string;
    manifestRunId: string;
  };
  rules: JsonRecord;
  scope: {
    mode: "full" | "smoke";
    leagueIds: number[] | null;
    limitMatchesPerLeague: number | null;
    writesEnabled: boolean;
  };
  summary: {
    selectedLeagues: number;
    eligibleLeagueMetrics: number;
    validationRows: number;
    completedRows: number;
    notEvaluableRows: number;
    suspiciousSanityMetrics: number;
    bestMeanNllModels: Record<ModelName, number>;
  };
  sanity: {
    leagueId: 4;
    league: "Serie A";
    rule: string;
    status: "passed" | "suspicious-metrics-found";
    results: SanityResult[];
  };
  splits: Array<Omit<LeagueSplit, "trainMatches" | "testMatches"> & { trainMatches: number; testMatches: number }>;
  globalTraining: GlobalTraining[];
  results: ValidationResult[];
  caveats: string[];
};

const SANITY_REFERENCES: Record<Metric, { pilot: Evidence; external: Evidence }> = {
  shots: {
    pilot: numericalEvidence(
      "Pilota IQstatS, 12 gare, maggio 2026",
      null,
      2.33,
      2.33,
      "D team pilota circa 2,33.",
    ),
    external: unavailableEvidence("Nessun riferimento esterno numerico pertinente registrato."),
  },
  sot: {
    pilot: numericalEvidence(
      "Pilota IQstatS, 12 gare, maggio 2026",
      null,
      1.4,
      1.4,
      "D team pilota circa 1,40.",
    ),
    external: unavailableEvidence("Nessun riferimento esterno numerico pertinente registrato."),
  },
  fouls: {
    pilot: numericalEvidence(
      "Pilota IQstatS, 12 gare, maggio 2026",
      null,
      0.97,
      1.2,
      "Intervallo D team pilota 0,97–1,20.",
    ),
    external: unavailableEvidence("Nessun riferimento esterno numerico pertinente registrato."),
  },
  corners: {
    pilot: numericalEvidence(
      "Pilota IQstatS, 12 gare, maggio 2026",
      null,
      1.25,
      1.25,
      "D team pilota circa 1,25.",
    ),
    external: numericalEvidence(
      "Yip et al. (2024), Forecasting number of corner kicks taken in association football using compound Poisson distribution",
      "https://doi.org/10.1080/01605682.2024.2306170",
      1.25,
      1.25,
      "Riferimento numerico Serie A registrato dal task: D circa 1,25.",
    ),
  },
  yellows: {
    pilot: numericalEvidence(
      "Pilota IQstatS, 12 gare, maggio 2026",
      null,
      0.45,
      0.64,
      "Intervallo D team pilota 0,45–0,64.",
    ),
    external: numericalEvidence(
      "Philipson (2026), Yellow fever: modelling the incidence of yellow cards in football",
      "https://doi.org/10.1093/jrsssa/qnag014",
      0.79,
      0.8,
      "La tabella Serie A riporta D home 0,80 e away 0,79; confronto con il D team aggregato dichiarato come approssimazione.",
    ),
  },
  saves: {
    pilot: numericalEvidence(
      "Pilota IQstatS, 12 gare, maggio 2026",
      null,
      1.36,
      1.62,
      "Intervallo D team pilota 1,36–1,62.",
    ),
    external: unavailableEvidence("Nessun riferimento esterno numerico pertinente registrato."),
  },
  offsides: {
    pilot: unavailableEvidence("Il task non registra un valore pilota per i fuorigioco."),
    external: unavailableEvidence("Nessun riferimento esterno numerico pertinente registrato."),
  },
};

function numericalEvidence(
  source: string,
  url: string | null,
  lower: number,
  upper: number,
  note: string,
): Evidence {
  return { availability: "numerical", source, url, range: { lower, upper }, note };
}

function unavailableEvidence(note: string): Evidence {
  return { availability: "unavailable", source: "non disponibile", url: null, range: null, note };
}

function printUsage(): void {
  console.log(`CAL-4A — IQstatS model sanity check and temporal distribution backtest

Usage:
  node --experimental-strip-types scripts/calibration/validateModel.ts [options]

Options:
  --league-id <id>       Limit a smoke run to a league; repeatable.
  --limit-matches <n>    Limit each selected league to the first n chronological matches.
  --no-write             Validate without writing generated outputs.
  --self-test            Run deterministic Poisson/NB distribution tests and exit.
  --quiet                Suppress the detailed console table.
  -h, --help             Show this help.

Inputs:
  scripts/calibration/data/dataset.csv
  scripts/calibration/output/DATASET_QUALITY.json
  scripts/calibration/output/CALIBRATION_REPORT.json

Outputs (full run only):
  scripts/calibration/output/MODEL_VALIDATION.json
  scripts/calibration/output/MODEL_VALIDATION.md
  scripts/calibration/output/MODEL_VALIDATION.generated.ts

Filtered or limited runs require --no-write. This is a distribution backtest; the
dataset has no odds or market lines, so no economic performance is estimated.
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
    selfTest: false,
    leagueIds: new Set<number>(),
    limitMatches: null,
    noWrite: false,
    quiet: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "--self-test") {
      options.selfTest = true;
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
  if (
    options.selfTest &&
    (options.leagueIds.size > 0 || options.limitMatches !== null || options.noWrite)
  ) {
    throw new Error("--self-test deve essere eseguito senza filtri o --no-write.");
  }
  return options;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, context: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${context}: oggetto mancante o non valido.`);
  return value;
}

function requiredString(record: JsonRecord, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${context}.${key}: stringa mancante o non valida.`);
  }
  return value;
}

function nullableString(record: JsonRecord, key: string, context: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${context}.${key}: stringa/null non valida.`);
  return value;
}

function requiredNumber(record: JsonRecord, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}.${key}: numero mancante o non valido.`);
  }
  return value;
}

function nullableNumber(record: JsonRecord, key: string, context: string): number | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}.${key}: numero/null non valido.`);
  }
  return value;
}

function requiredInteger(record: JsonRecord, key: string, context: string): number {
  const value = requiredNumber(record, key, context);
  if (!Number.isSafeInteger(value)) throw new Error(`${context}.${key}: intero non valido.`);
  return value;
}

function requiredBoolean(record: JsonRecord, key: string, context: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`${context}.${key}: booleano non valido.`);
  return value;
}

function metricRecord<T>(factory: (metric: Metric) => T): Record<Metric, T> {
  return Object.fromEntries(METRICS.map((metric) => [metric, factory(metric)])) as Record<Metric, T>;
}

function parseStats(value: unknown, context: string): DescriptiveStats {
  const record = requiredRecord(value, context);
  return {
    n: requiredInteger(record, "n", context),
    mean: nullableNumber(record, "mean", context),
    variance: nullableNumber(record, "variance", context),
    sd: nullableNumber(record, "sd", context),
    dispersion: nullableNumber(record, "dispersion", context),
  };
}

function parseQualityReport(value: unknown): QualityReport {
  const root = requiredRecord(value, "DATASET_QUALITY");
  const source = requiredRecord(root.source, "DATASET_QUALITY.source");
  const integrity = requiredRecord(root.integrity, "DATASET_QUALITY.integrity");
  const summary = requiredRecord(root.summary, "DATASET_QUALITY.summary");
  if (!Array.isArray(root.leagues)) throw new Error("DATASET_QUALITY.leagues: array mancante.");
  const leagues = root.leagues.map((leagueValue, leagueIndex): LeagueQuality => {
    const context = `DATASET_QUALITY.leagues[${leagueIndex}]`;
    const league = requiredRecord(leagueValue, context);
    const metrics = requiredRecord(league.metrics, `${context}.metrics`);
    return {
      leagueId: requiredInteger(league, "leagueId", context),
      name: requiredString(league, "name", context),
      country: requiredString(league, "country", context),
      sampleStatus: requiredString(league, "sampleStatus", context),
      calibrationDecision: requiredString(league, "calibrationDecision", context),
      metrics: metricRecord((metric) => {
        const metricContext = `${context}.metrics.${metric}`;
        const item = requiredRecord(metrics[metric], metricContext);
        return {
          excluded: requiredBoolean(item, "excluded", metricContext),
          exclusionReason: nullableString(item, "exclusionReason", metricContext),
        };
      }),
    };
  });
  return {
    schemaVersion: requiredInteger(root, "schemaVersion", "DATASET_QUALITY"),
    generatedAt: requiredString(root, "generatedAt", "DATASET_QUALITY"),
    status: requiredString(root, "status", "DATASET_QUALITY"),
    source: {
      dataset: requiredString(source, "dataset", "DATASET_QUALITY.source"),
      manifest: requiredString(source, "manifest", "DATASET_QUALITY.source"),
      manifestRunId: requiredString(source, "manifestRunId", "DATASET_QUALITY.source"),
    },
    integrity: {
      status: requiredString(integrity, "status", "DATASET_QUALITY.integrity"),
      passedChecks: requiredInteger(integrity, "passedChecks", "DATASET_QUALITY.integrity"),
      totalChecks: requiredInteger(integrity, "totalChecks", "DATASET_QUALITY.integrity"),
    },
    summary: {
      matchCount: requiredInteger(summary, "matchCount", "DATASET_QUALITY.summary"),
      teamRowCount: requiredInteger(summary, "teamRowCount", "DATASET_QUALITY.summary"),
      includedLeagueMetrics: requiredInteger(
        summary,
        "includedLeagueMetrics",
        "DATASET_QUALITY.summary",
      ),
    },
    leagues,
  };
}

function parseCalibrationReport(value: unknown): CalibrationReport {
  const root = requiredRecord(value, "CALIBRATION_REPORT");
  const source = requiredRecord(root.source, "CALIBRATION_REPORT.source");
  const summary = requiredRecord(root.summary, "CALIBRATION_REPORT.summary");
  if (!Array.isArray(root.leagues)) throw new Error("CALIBRATION_REPORT.leagues: array mancante.");
  const leagues = root.leagues.map((leagueValue, leagueIndex): CalibrationLeague => {
    const context = `CALIBRATION_REPORT.leagues[${leagueIndex}]`;
    const league = requiredRecord(leagueValue, context);
    const metricsValue = requiredRecord(league.metrics, `${context}.metrics`);
    const metrics: Partial<Record<Metric, CalibrationMetric>> = {};
    for (const metric of METRICS) {
      const metricValue = metricsValue[metric];
      if (metricValue === undefined) continue;
      const metricRecordValue = requiredRecord(metricValue, `${context}.metrics.${metric}`);
      metrics[metric] = {
        team: parseStats(metricRecordValue.team, `${context}.metrics.${metric}.team`),
        home: parseStats(metricRecordValue.home, `${context}.metrics.${metric}.home`),
        away: parseStats(metricRecordValue.away, `${context}.metrics.${metric}.away`),
        match: parseStats(metricRecordValue.match, `${context}.metrics.${metric}.match`),
      };
    }
    const caveatsValue = league.caveats;
    if (!Array.isArray(caveatsValue) || !caveatsValue.every((item) => typeof item === "string")) {
      throw new Error(`${context}.caveats: array di stringhe non valido.`);
    }
    return {
      leagueId: requiredInteger(league, "leagueId", context),
      name: requiredString(league, "name", context),
      country: requiredString(league, "country", context),
      sampleStatus: requiredString(league, "sampleStatus", context),
      calibrationDecision: requiredString(league, "calibrationDecision", context),
      caveats: caveatsValue,
      metrics,
    };
  });
  return {
    schemaVersion: requiredInteger(root, "schemaVersion", "CALIBRATION_REPORT"),
    formulaVersion: requiredString(root, "formulaVersion", "CALIBRATION_REPORT"),
    generatedAt: requiredString(root, "generatedAt", "CALIBRATION_REPORT"),
    status: requiredString(root, "status", "CALIBRATION_REPORT"),
    source: {
      dataset: requiredString(source, "dataset", "CALIBRATION_REPORT.source"),
      qualityReport: requiredString(source, "qualityReport", "CALIBRATION_REPORT.source"),
      qualityGeneratedAt: requiredString(
        source,
        "qualityGeneratedAt",
        "CALIBRATION_REPORT.source",
      ),
      manifestRunId: requiredString(source, "manifestRunId", "CALIBRATION_REPORT.source"),
    },
    summary: {
      datasetRows: requiredInteger(summary, "datasetRows", "CALIBRATION_REPORT.summary"),
      datasetMatches: requiredInteger(summary, "datasetMatches", "CALIBRATION_REPORT.summary"),
      includedLeagueMetrics: requiredInteger(
        summary,
        "includedLeagueMetrics",
        "CALIBRATION_REPORT.summary",
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

function requiredStats(stats: DescriptiveStats, context: string): DefinedStats {
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
    throw new Error(`${context}: statistiche non definite.`);
  }
  return stats as DefinedStats;
}

function completeMatches(matches: MatchRows[], metric: Metric): MatchRows[] {
  return matches.filter(
    (match) => match.home.metrics[metric] !== null && match.away.metrics[metric] !== null,
  );
}

function observations(matches: MatchRows[], metric: Metric, granularity: Granularity): number[] {
  const values: number[] = [];
  for (const match of completeMatches(matches, metric)) {
    const home = match.home.metrics[metric];
    const away = match.away.metrics[metric];
    if (home === null || away === null) throw new Error("Filtro completeMatches incoerente.");
    if (granularity === "team") values.push(home, away);
    else values.push(home + away);
  }
  return values;
}

function splitLeagueMatches(league: CalibrationLeague, matches: MatchRows[]): LeagueSplit {
  const dates = [...new Set(matches.map((match) => match.date))].sort();
  if (dates.length < 2) {
    throw new Error(`${league.name}: servono almeno due date distinte per lo split temporale.`);
  }
  const trainDateCount = Math.max(1, Math.min(dates.length - 1, Math.floor(dates.length * TRAIN_DATE_SHARE)));
  const trainDates = new Set(dates.slice(0, trainDateCount));
  const trainMatches = matches.filter((match) => trainDates.has(match.date));
  const testMatches = matches.filter((match) => !trainDates.has(match.date));
  const trainDateFrom = dates[0];
  const trainDateTo = dates[trainDateCount - 1];
  const testDateFrom = dates[trainDateCount];
  const testDateTo = dates[dates.length - 1];
  if (
    trainDateFrom === undefined ||
    trainDateTo === undefined ||
    testDateFrom === undefined ||
    testDateTo === undefined ||
    trainMatches.length === 0 ||
    testMatches.length === 0
  ) {
    throw new Error(`${league.name}: split 70/30 non definito.`);
  }
  if (trainDateTo >= testDateFrom) {
    throw new Error(`${league.name}: leakage temporale nello split (${trainDateTo}/${testDateFrom}).`);
  }
  return {
    leagueId: league.leagueId,
    league: league.name,
    distinctDates: dates.length,
    trainDateCount,
    testDateCount: dates.length - trainDateCount,
    trainDateFrom,
    trainDateTo,
    testDateFrom,
    testDateTo,
    trainMatches,
    testMatches,
  };
}

function logGamma(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) throw new Error("logGamma: argomento non valido.");
  const coefficients = [
    0.9999999999998099,
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    0.000009984369578019572,
    0.00000015056327351493116,
  ];
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  const shifted = value - 1;
  let series = coefficients[0] ?? 0;
  for (let index = 1; index < coefficients.length; index += 1) {
    series += (coefficients[index] ?? 0) / (shifted + index);
  }
  const t = shifted + coefficients.length - 1.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

function distributionParameters(mean: number, dispersion: number): DistributionParameters {
  if (!(mean >= 0) || !Number.isFinite(mean)) throw new Error("Media predittiva non valida.");
  if (!(dispersion >= 0) || !Number.isFinite(dispersion)) {
    throw new Error("Dispersione predittiva non valida.");
  }
  if (dispersion <= POISSON_FALLBACK_THRESHOLD || mean === 0) {
    return {
      kind: "poisson",
      mean,
      requestedDispersion: dispersion,
      effectiveDispersion: 1,
      size: null,
      probability: null,
    };
  }
  const size = mean / (dispersion - 1);
  const probability = size / (size + mean);
  if (!(size > 0) || !(probability > 0 && probability < 1)) {
    throw new Error("Parametri Binomiale Negativa non validi.");
  }
  return {
    kind: "negative-binomial",
    mean,
    requestedDispersion: dispersion,
    effectiveDispersion: dispersion,
    size,
    probability,
  };
}

function logProbability(count: number, parameters: DistributionParameters): number {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Conteggio osservato non valido.");
  if (parameters.mean === 0) return count === 0 ? 0 : Number.NEGATIVE_INFINITY;
  if (parameters.kind === "poisson") {
    return count * Math.log(parameters.mean) - parameters.mean - logGamma(count + 1);
  }
  const size = parameters.size;
  const probability = parameters.probability;
  if (size === null || probability === null) throw new Error("Parametri NB mancanti.");
  return (
    logGamma(count + size) -
    logGamma(size) -
    logGamma(count + 1) +
    size * Math.log(probability) +
    count * Math.log1p(-probability)
  );
}

function centralInterval(parameters: DistributionParameters): { lower: number; upper: number } {
  if (parameters.mean === 0) return { lower: 0, upper: 0 };
  const lowerProbability = (1 - CENTRAL_INTERVAL_MASS) / 2;
  const upperProbability = 1 - lowerProbability;
  const variance = parameters.effectiveDispersion * parameters.mean;
  const maxCount = Math.max(100, Math.ceil(parameters.mean + 20 * Math.sqrt(variance) + 100));
  let cumulative = 0;
  let lower: number | null = null;
  for (let count = 0; count <= maxCount; count += 1) {
    cumulative += Math.exp(logProbability(count, parameters));
    if (lower === null && cumulative >= lowerProbability) lower = count;
    if (cumulative >= upperProbability) return { lower: lower ?? 0, upper: count };
  }
  throw new Error("Intervallo predittivo non convergente.");
}

function evaluateModel(
  model: ModelName,
  matches: MatchRows[],
  metric: Metric,
  granularity: Granularity,
  means: number | { home: number; away: number },
  dispersion: number,
): ModelEvaluation {
  let lossTotal = 0;
  let observationsCount = 0;
  let covered = 0;
  let observedDistribution: DistributionKind | null = null;
  let observedEffectiveDispersion: number | null = null;
  const lossByMatch: Record<string, number> = {};
  for (const match of matches) {
    const home = match.home.metrics[metric];
    const away = match.away.metrics[metric];
    if (home === null || away === null) throw new Error("Test match incompleto passato al modello.");
    const matchLosses: number[] = [];
    const cases =
      granularity === "team"
        ? [
            { count: home, mean: (means as { home: number; away: number }).home },
            { count: away, mean: (means as { home: number; away: number }).away },
          ]
        : [{ count: home + away, mean: means as number }];
    for (const item of cases) {
      const parameters = distributionParameters(item.mean, dispersion);
      observedDistribution ??= parameters.kind;
      observedEffectiveDispersion ??= parameters.effectiveDispersion;
      if (
        observedDistribution !== parameters.kind ||
        observedEffectiveDispersion !== parameters.effectiveDispersion
      ) {
        throw new Error("Parametrizzazione incoerente tra osservazioni dello stesso modello.");
      }
      const logP = logProbability(item.count, parameters);
      if (!Number.isFinite(logP)) throw new Error(`${model}: log-probabilità non finita.`);
      const loss = -logP;
      const interval = centralInterval(parameters);
      if (item.count >= interval.lower && item.count <= interval.upper) covered += 1;
      lossTotal += loss;
      observationsCount += 1;
      matchLosses.push(loss);
    }
    lossByMatch[String(match.matchId)] =
      matchLosses.reduce((total, value) => total + value, 0) / matchLosses.length;
  }
  if (
    observationsCount === 0 ||
    observedDistribution === null ||
    observedEffectiveDispersion === null
  ) {
    throw new Error(`${model}: nessuna osservazione valutata.`);
  }
  return {
    model,
    requestedDispersion: dispersion,
    effectiveDispersion: observedEffectiveDispersion,
    distribution: observedDistribution,
    observations: observationsCount,
    meanNll: lossTotal / observationsCount,
    central80: {
      mass: CENTRAL_INTERVAL_MASS,
      observations: observationsCount,
      covered,
      coverage: covered / observationsCount,
    },
    lossByMatch,
  };
}

function pairedComparison(candidate: ModelEvaluation, reference: ModelEvaluation): PairedComparison {
  const candidateIds = Object.keys(candidate.lossByMatch).sort((left, right) => Number(left) - Number(right));
  const referenceIds = Object.keys(reference.lossByMatch).sort((left, right) => Number(left) - Number(right));
  if (
    candidateIds.length !== referenceIds.length ||
    candidateIds.some((matchId, index) => matchId !== referenceIds[index])
  ) {
    throw new Error(`${candidate.model}/${reference.model}: unità appaiate incoerenti.`);
  }
  const differences = candidateIds.map((matchId) => {
    const candidateLoss = candidate.lossByMatch[matchId];
    const referenceLoss = reference.lossByMatch[matchId];
    if (candidateLoss === undefined || referenceLoss === undefined) {
      throw new Error("Perdita appaiata mancante.");
    }
    return candidateLoss - referenceLoss;
  });
  const stats = descriptiveStats(differences);
  if (stats.mean === null) throw new Error("Differenza NLL appaiata non definita.");
  const standardError = stats.sd === null ? null : stats.sd / Math.sqrt(stats.n);
  const lower = standardError === null ? null : stats.mean - PAIRED_INTERVAL_Z * standardError;
  const upper = standardError === null ? null : stats.mean + PAIRED_INTERVAL_Z * standardError;
  const interpretation =
    upper !== null && upper < 0
      ? "candidate-lower"
      : lower !== null && lower > 0
        ? "reference-lower"
        : "inconclusive";
  return {
    candidate: candidate.model,
    reference: reference.model,
    pairingUnit: "match",
    pairs: differences.length,
    meanNllDifference: stats.mean,
    standardError,
    interval95: { method: "normal-approximation", lower, upper },
    interpretation,
  };
}

function distanceToEvidence(value: number, evidence: Evidence): number | null {
  if (evidence.availability !== "numerical" || evidence.range === null) return null;
  if (value < evidence.range.lower) return evidence.range.lower - value;
  if (value > evidence.range.upper) return value - evidence.range.upper;
  return 0;
}

function buildSanity(calibration: CalibrationReport): ValidationReport["sanity"] {
  const serieA = calibration.leagues.find((league) => league.leagueId === 4);
  if (serieA === undefined) throw new Error("CALIBRATION_REPORT: Serie A (league_id=4) assente.");
  const results = METRICS.map((metric): SanityResult => {
    const analysis = serieA.metrics[metric];
    const observed = analysis?.team.dispersion;
    if (observed === undefined || observed === null) {
      throw new Error(`CALIBRATION_REPORT: D team Serie A assente per ${metric}.`);
    }
    const references = SANITY_REFERENCES[metric];
    const pilotDistance = distanceToEvidence(observed, references.pilot);
    const externalDistance = distanceToEvidence(observed, references.external);
    const hasTwoNumericalReferences = pilotDistance !== null && externalDistance !== null;
    const suspicious =
      hasTwoNumericalReferences &&
      pilotDistance > SANITY_DISTANCE_THRESHOLD &&
      externalDistance > SANITY_DISTANCE_THRESHOLD;
    return {
      metric,
      observedTeamDispersion: observed,
      threshold: SANITY_DISTANCE_THRESHOLD,
      pilot: { ...references.pilot, distance: pilotDistance },
      external: { ...references.external, distance: externalDistance },
      suspicious,
      assessment: suspicious
        ? "suspicious"
        : hasTwoNumericalReferences
          ? "not-suspicious"
          : "not-assessable-with-two-numerical-references",
    };
  });
  const suspicious = results.some((result) => result.suspicious);
  return {
    leagueId: 4,
    league: "Serie A",
    rule:
      "suspicious only when distance is >0.5 from both the pilot and a pertinent external numerical reference",
    status: suspicious ? "suspicious-metrics-found" : "passed",
    results,
  };
}

function eligibleLeagueMetrics(
  quality: QualityReport,
  calibration: CalibrationReport,
  options: CliOptions,
): Array<{ quality: LeagueQuality; calibration: CalibrationLeague; metric: Metric }> {
  const calibrationById = new Map(calibration.leagues.map((league) => [league.leagueId, league]));
  const eligible: Array<{ quality: LeagueQuality; calibration: CalibrationLeague; metric: Metric }> = [];
  for (const qualityLeague of quality.leagues) {
    if (options.leagueIds.size > 0 && !options.leagueIds.has(qualityLeague.leagueId)) continue;
    const calibrationLeague = calibrationById.get(qualityLeague.leagueId);
    if (calibrationLeague === undefined) {
      throw new Error(`CALIBRATION_REPORT: league_id ${qualityLeague.leagueId} assente.`);
    }
    for (const metric of METRICS) {
      const admittedByQa = !qualityLeague.metrics[metric].excluded;
      const presentInCalibration = calibrationLeague.metrics[metric] !== undefined;
      if (admittedByQa !== presentInCalibration) {
        throw new Error(
          `${qualityLeague.name}/${metric}: disaccordo tra QA e CALIBRATION_REPORT.`,
        );
      }
      if (admittedByQa) {
        eligible.push({ quality: qualityLeague, calibration: calibrationLeague, metric });
      }
    }
  }
  if (options.leagueIds.size > 0) {
    const foundIds = new Set(eligible.map((item) => item.quality.leagueId));
    const missing = [...options.leagueIds].filter((leagueId) => !foundIds.has(leagueId));
    if (missing.length > 0) throw new Error(`Leghe senza metriche ammesse: ${missing.join(", ")}.`);
  }
  return eligible.sort(
    (left, right) =>
      left.quality.leagueId - right.quality.leagueId ||
      METRICS.indexOf(left.metric) - METRICS.indexOf(right.metric),
  );
}

function bestModel(models: Record<ModelName, ModelEvaluation>): ModelName {
  return (Object.values(models) as ModelEvaluation[]).reduce((best, candidate) =>
    candidate.meanNll < best.meanNll ? candidate : best,
  ).model;
}

function buildValidation(
  item: { quality: LeagueQuality; calibration: CalibrationLeague; metric: Metric },
  split: LeagueSplit,
  granularity: Granularity,
  global: GlobalTraining,
): ValidationResult {
  const trainComplete = completeMatches(split.trainMatches, item.metric);
  const testComplete = completeMatches(split.testMatches, item.metric);
  const base = {
    leagueId: item.quality.leagueId,
    league: item.quality.name,
    country: item.quality.country,
    sampleStatus: item.quality.sampleStatus,
    caveats: item.calibration.caveats,
    metric: item.metric,
    granularity,
    split: {
      trainMatches: split.trainMatches.length,
      testMatches: split.testMatches.length,
      trainCompleteMatches: trainComplete.length,
      testCompleteMatches: testComplete.length,
    },
  };
  const minimumTrainMatches = granularity === "team" ? 1 : 2;
  if (trainComplete.length < minimumTrainMatches || testComplete.length < 1) {
    return {
      status: "not-evaluable",
      ...base,
      reason: `campione insufficiente dopo lo split: train completi ${trainComplete.length}, test completi ${testComplete.length}`,
    };
  }
  const leagueStats = requiredStats(
    descriptiveStats(observations(trainComplete, item.metric, granularity)),
    `${item.quality.name}/${item.metric}/${granularity} train`,
  );
  let means: number | { home: number; away: number };
  if (granularity === "team") {
    const homeStats = descriptiveStats(
      trainComplete.map((match) => match.home.metrics[item.metric] as number),
    );
    const awayStats = descriptiveStats(
      trainComplete.map((match) => match.away.metrics[item.metric] as number),
    );
    if (homeStats.mean === null || awayStats.mean === null) {
      throw new Error(`${item.quality.name}/${item.metric}: medie side train assenti.`);
    }
    means = { home: homeStats.mean, away: awayStats.mean };
  } else {
    means = leagueStats.mean;
  }
  const leagueOverrideApplied =
    Math.abs(leagueStats.dispersion - global.dispersion) > LEAGUE_OVERRIDE_THRESHOLD;
  const overrideDispersion = leagueOverrideApplied ? leagueStats.dispersion : global.dispersion;
  const poisson = evaluateModel(
    "poisson",
    testComplete,
    item.metric,
    granularity,
    means,
    1,
  );
  const globalNb = evaluateModel(
    "negative-binomial-global",
    testComplete,
    item.metric,
    granularity,
    means,
    global.dispersion,
  );
  const overrideNb = evaluateModel(
    "negative-binomial-league-override",
    testComplete,
    item.metric,
    granularity,
    means,
    overrideDispersion,
  );
  const models: Record<ModelName, ModelEvaluation> = {
    poisson,
    "negative-binomial-global": globalNb,
    "negative-binomial-league-override": overrideNb,
  };
  return {
    status: "completed",
    ...base,
    trainParameters: {
      mean: means,
      globalDispersion: global.dispersion,
      leagueDispersion: leagueStats.dispersion,
      leagueOverrideApplied,
      overrideDispersion,
    },
    models,
    pairedComparisons: [
      pairedComparison(globalNb, poisson),
      pairedComparison(overrideNb, poisson),
      pairedComparison(overrideNb, globalNb),
    ],
    bestMeanNllModel: bestModel(models),
  };
}

function buildReport(
  dataset: Dataset,
  quality: QualityReport,
  calibration: CalibrationReport,
  options: CliOptions,
  generatedAt: string,
): ValidationReport {
  const eligible = eligibleLeagueMetrics(quality, calibration, options);
  const selectedLeagueIds = [...new Set(eligible.map((item) => item.quality.leagueId))].sort(
    (left, right) => left - right,
  );
  const calibrationById = new Map(calibration.leagues.map((league) => [league.leagueId, league]));
  const splitByLeagueId = new Map<number, LeagueSplit>();
  for (const leagueId of selectedLeagueIds) {
    const league = calibrationById.get(leagueId);
    if (league === undefined) throw new Error(`CALIBRATION_REPORT: league_id ${leagueId} assente.`);
    let matches = dataset.matches.filter((match) => match.leagueId === leagueId);
    if (options.limitMatches !== null) matches = matches.slice(0, options.limitMatches);
    splitByLeagueId.set(leagueId, splitLeagueMatches(league, matches));
  }
  const globalTraining: GlobalTraining[] = [];
  for (const metric of METRICS) {
    const metricItems = eligible.filter((item) => item.metric === metric);
    if (metricItems.length === 0) continue;
    for (const granularity of GRANULARITIES) {
      const values: number[] = [];
      let completeTrainMatches = 0;
      const contributingLeagues = new Set<number>();
      for (const item of metricItems) {
        const split = splitByLeagueId.get(item.quality.leagueId);
        if (split === undefined) throw new Error("Split di lega mancante.");
        const complete = completeMatches(split.trainMatches, metric);
        if (complete.length === 0) continue;
        completeTrainMatches += complete.length;
        contributingLeagues.add(item.quality.leagueId);
        values.push(...observations(complete, metric, granularity));
      }
      const stats = requiredStats(descriptiveStats(values), `${metric}/${granularity} globale train`);
      globalTraining.push({
        metric,
        granularity,
        contributingLeagues: contributingLeagues.size,
        completeTrainMatches,
        observations: stats.n,
        mean: stats.mean,
        variance: stats.variance,
        dispersion: stats.dispersion,
      });
    }
  }
  const results: ValidationResult[] = [];
  for (const item of eligible) {
    const split = splitByLeagueId.get(item.quality.leagueId);
    if (split === undefined) throw new Error("Split di lega mancante.");
    for (const granularity of GRANULARITIES) {
      const global = globalTraining.find(
        (entry) => entry.metric === item.metric && entry.granularity === granularity,
      );
      if (global === undefined) throw new Error("Dispersione globale train mancante.");
      results.push(buildValidation(item, split, granularity, global));
    }
  }
  const completed = results.filter((result): result is CompletedValidation => result.status === "completed");
  const sanity = buildSanity(calibration);
  const suspiciousSanityMetrics = sanity.results.filter((result) => result.suspicious).length;
  const bestMeanNllModels: Record<ModelName, number> = {
    poisson: 0,
    "negative-binomial-global": 0,
    "negative-binomial-league-override": 0,
  };
  for (const result of completed) bestMeanNllModels[result.bestMeanNllModel] += 1;
  const fullRun = options.leagueIds.size === 0 && options.limitMatches === null;
  if (fullRun && eligible.length !== quality.summary.includedLeagueMetrics) {
    throw new Error(
      `Run completo: attese ${quality.summary.includedLeagueMetrics} combinazioni, osservate ${eligible.length}.`,
    );
  }
  if (fullRun && results.some((result) => result.status !== "completed")) {
    throw new Error("Run completo: almeno una combinazione ammessa non è valutabile.");
  }
  return {
    schemaVersion: 1,
    formulaVersion: FORMULA_VERSION,
    generatedAt,
    status:
      suspiciousSanityMetrics === 0
        ? "completed-awaiting-human-review"
        : "completed-with-suspicions-awaiting-human-review",
    nextGate: "human-review-required-after-CAL-4-before-app-integration",
    source: {
      dataset: "scripts/calibration/data/dataset.csv",
      qualityReport: "scripts/calibration/output/DATASET_QUALITY.json",
      qualityGeneratedAt: quality.generatedAt,
      calibrationReport: "scripts/calibration/output/CALIBRATION_REPORT.json",
      calibrationGeneratedAt: calibration.generatedAt,
      manifestRunId: quality.source.manifestRunId,
    },
    rules: {
      backtestScope: "distribution-only-not-economic-no-odds-or-market-lines-in-dataset",
      split: {
        targetTrainDateShare: TRAIN_DATE_SHARE,
        unit: "whole-distinct-dates-within-each-league",
        boundary: "floor(0.70 * distinct-date-count), clipped to preserve train and test",
        order: "date-ascending-then-match-id",
      },
      leakageControl: "all means and dispersions estimated from train observations only",
      completeMatchPolicy: "metric included only when both home and away values are present",
      missingValues: "excluded-never-imputed",
      teamMean: "separate train home and away means",
      matchMean: "train mean of home-plus-away totals",
      variance: "sample-n-minus-1",
      dispersion: "sample-variance-divided-by-mean",
      negativeBinomial: "variance=D*mean; size=mean/(D-1)",
      poissonFallback: `requested D<=${POISSON_FALLBACK_THRESHOLD.toFixed(2)} uses Poisson`,
      leagueOverride: `use league train D only when absolute difference from global train D>${LEAGUE_OVERRIDE_THRESHOLD.toFixed(2)}`,
      meanNll: "average negative log probability on chronological test observations",
      pairedInterval95:
        "candidate-minus-reference mean NLL difference; match-paired normal interval mean±1.96*SE",
      teamPairing: "home and away losses averaged within match before paired interval",
      centralPredictionInterval: {
        mass: CENTRAL_INTERVAL_MASS,
        quantiles: [0.1, 0.9],
        discreteRule: "smallest integer with CDF at or above the target probability",
      },
      sanityThreshold: SANITY_DISTANCE_THRESHOLD,
      sanityRule:
        "flag only if distance is >0.5 from both pilot and pertinent external numerical evidence",
    },
    scope: {
      mode: fullRun ? "full" : "smoke",
      leagueIds: options.leagueIds.size === 0 ? null : [...options.leagueIds].sort((a, b) => a - b),
      limitMatchesPerLeague: options.limitMatches,
      writesEnabled: !options.noWrite,
    },
    summary: {
      selectedLeagues: selectedLeagueIds.length,
      eligibleLeagueMetrics: eligible.length,
      validationRows: results.length,
      completedRows: completed.length,
      notEvaluableRows: results.length - completed.length,
      suspiciousSanityMetrics,
      bestMeanNllModels,
    },
    sanity,
    splits: [...splitByLeagueId.values()].map((split) => ({
      leagueId: split.leagueId,
      league: split.league,
      distinctDates: split.distinctDates,
      trainDateCount: split.trainDateCount,
      testDateCount: split.testDateCount,
      trainDateFrom: split.trainDateFrom,
      trainDateTo: split.trainDateTo,
      testDateFrom: split.testDateFrom,
      testDateTo: split.testDateTo,
      trainMatches: split.trainMatches.length,
      testMatches: split.testMatches.length,
    })),
    globalTraining,
    results,
    caveats: [
      "Il dataset non contiene quote o linee: il backtest misura fit distributivo, non redditività o calibrazione economica.",
      "Il test copre una singola stagione storica per lega; non dimostra stabilità inter-stagionale.",
      "Gli intervalli al 95% usano un'approssimazione normale appaiata per match e non correggono per clustering tra giornate, dipendenza seriale o confronti multipli.",
      "La copertura centrale 80% è discreta e può superare nominalmente l'80% per effetto della massa ai bordi.",
      "L'assenza di letteratura numerica per una metrica non è trattata come conferma del sanity check.",
      "I risultati restano confinati a scripts/calibration/ e non autorizzano integrazione o modifica degli expected nell'app.",
    ],
  };
}

function formatNumber(value: number | null, digits = 4): string {
  return value === null ? "n/d" : value.toFixed(digits);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatInterval(comparison: PairedComparison): string {
  return `${formatNumber(comparison.meanNllDifference)} [${formatNumber(comparison.interval95.lower)}, ${formatNumber(comparison.interval95.upper)}]`;
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildMarkdown(report: ValidationReport): string {
  const lines: string[] = [
    "# CAL-4A — sanity check e backtest distributivo temporale",
    "",
    `Generato: ${report.generatedAt}`,
    `Formula: \`${report.formulaVersion}\``,
    `Stato: **${report.status}**`,
    `Gate: **${report.nextGate}**`,
    "",
    "Il dataset non contiene quote o linee: questo è un backtest distributivo, non economico.",
    "Nessun risultato è integrato nell'app.",
    "",
    "## Metodo",
    "",
    "- Split cronologico 70/30 sulle date distinte di ogni lega; una data non compare mai in entrambi i segmenti.",
    "- Medie home/away, media match, D globale e D di lega sono stimati esclusivamente sul train.",
    "- Entrano soltanto match completi home+away per la metrica; i null non sono imputati.",
    "- Confronti: Poisson, NB con D globale train, NB con override di lega train oltre |ΔD| > 0,10.",
    "- D <= 1,05 usa il fallback Poisson. La NB usa Var=D·μ e size=μ/(D−1).",
    "- Intervalli al 95%: differenza NLL candidato−riferimento, appaiata per match, media ± 1,96 SE.",
    "- Copertura: intervallo predittivo discreto centrale 80% (quantili 10% e 90%).",
    "",
    "## Sintesi",
    "",
    `- Leghe selezionate: ${report.summary.selectedLeagues}.`,
    `- Combinazioni lega/metrica: ${report.summary.eligibleLeagueMetrics}.`,
    `- Righe metrica/granularità completate: ${report.summary.completedRows}/${report.summary.validationRows}.`,
    `- Metriche sanity sospette: ${report.summary.suspiciousSanityMetrics}.`,
    `- Miglior NLL medio — Poisson: ${report.summary.bestMeanNllModels.poisson}; NB globale: ${report.summary.bestMeanNllModels["negative-binomial-global"]}; NB override: ${report.summary.bestMeanNllModels["negative-binomial-league-override"]}.`,
    "",
    "## Sanity check Serie A",
    "",
    "Una metrica è sospetta solo se dista oltre 0,5 sia dal pilota sia da un riferimento esterno numerico pertinente. Evidenza assente non equivale a conferma.",
    "",
    "| Metrica | D team | Distanza pilota | Distanza esterna | Evidenza esterna | Sospetta |",
    "| --- | ---: | ---: | ---: | --- | --- |",
  ];
  for (const result of report.sanity.results) {
    lines.push(
      `| ${result.metric} | ${formatNumber(result.observedTeamDispersion)} | ${formatNumber(result.pilot.distance)} | ${formatNumber(result.external.distance)} | ${markdownEscape(result.external.availability)} | ${result.suspicious ? "sì" : "no"} |`,
    );
  }
  lines.push(
    "",
    "Fonti esterne numeriche pertinenti registrate:",
    "",
    "- Corner: Yip et al. (2024), DOI `10.1080/01605682.2024.2306170`.",
    "- Cartellini: Philipson (2026), DOI `10.1093/jrsssa/qnag014`; D Serie A home 0,80 e away 0,79.",
    "",
    "## Split per lega",
    "",
    "| ID | Lega | Date train/test | Match train/test | Ultima train | Prima test |",
    "| ---: | --- | ---: | ---: | --- | --- |",
  );
  for (const split of report.splits) {
    lines.push(
      `| ${split.leagueId} | ${markdownEscape(split.league)} | ${split.trainDateCount}/${split.testDateCount} | ${split.trainMatches}/${split.testMatches} | ${split.trainDateTo} | ${split.testDateFrom} |`,
    );
  }
  lines.push(
    "",
    "## Dispersioni globali stimate sul solo train",
    "",
    "| Metrica | Grana | Leghe | Match completi | Osservazioni | Media | D |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const global of report.globalTraining) {
    lines.push(
      `| ${global.metric} | ${global.granularity} | ${global.contributingLeagues} | ${global.completeTrainMatches} | ${global.observations} | ${formatNumber(global.mean)} | ${formatNumber(global.dispersion)} |`,
    );
  }
  lines.push(
    "",
    "## Risultati fuori campione",
    "",
    "Δ e intervalli sono NLL candidato−riferimento: valori negativi favoriscono il candidato.",
    "",
    "| ID | Lega | Metrica | Grana | Test n | D globale/lega | Override | NLL P/G/O | ΔG−P 95% | ΔO−P 95% | ΔO−G 95% | Cop. P/G/O | Migliore |",
    "| ---: | --- | --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  );
  for (const result of report.results) {
    if (result.status === "not-evaluable") {
      lines.push(
        `| ${result.leagueId} | ${markdownEscape(result.league)} | ${result.metric} | ${result.granularity} | ${result.split.testCompleteMatches} | n/d | no | ${markdownEscape(result.reason)} | n/d | n/d | n/d | n/d | non valutabile |`,
      );
      continue;
    }
    const poisson = result.models.poisson;
    const global = result.models["negative-binomial-global"];
    const override = result.models["negative-binomial-league-override"];
    const globalVsPoisson = result.pairedComparisons[0];
    const overrideVsPoisson = result.pairedComparisons[1];
    const overrideVsGlobal = result.pairedComparisons[2];
    if (
      globalVsPoisson === undefined ||
      overrideVsPoisson === undefined ||
      overrideVsGlobal === undefined
    ) {
      throw new Error("Confronti appaiati mancanti nel report.");
    }
    lines.push(
      `| ${result.leagueId} | ${markdownEscape(result.league)} | ${result.metric} | ${result.granularity} | ${result.split.testCompleteMatches} | ${formatNumber(result.trainParameters.globalDispersion)}/${formatNumber(result.trainParameters.leagueDispersion)} | ${result.trainParameters.leagueOverrideApplied ? "sì" : "no"} | ${formatNumber(poisson.meanNll)}/${formatNumber(global.meanNll)}/${formatNumber(override.meanNll)} | ${formatInterval(globalVsPoisson)} | ${formatInterval(overrideVsPoisson)} | ${formatInterval(overrideVsGlobal)} | ${formatPercent(poisson.central80.coverage)}/${formatPercent(global.central80.coverage)}/${formatPercent(override.central80.coverage)} | ${result.bestMeanNllModel} |`,
    );
  }
  lines.push("", "## Caveat", "");
  for (const caveat of report.caveats) lines.push(`- ${caveat}`);
  lines.push(
    "",
    "## Gate",
    "",
    "CAL-4A è completato tecnicamente. Il lavoro può proseguire a CAL-4B, ma nessun output di CAL-4 può entrare nell'app prima della revisione umana finale post-CAL-4.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function generatedTypeScript(report: ValidationReport): string {
  const validationConstant = {
    schemaVersion: report.schemaVersion,
    formulaVersion: report.formulaVersion,
    generatedAt: report.generatedAt,
    status: report.status,
    nextGate: report.nextGate,
    reportArtifact: "scripts/calibration/output/MODEL_VALIDATION.json",
    backtestScope: "distribution-only-not-economic",
    allowedForAppIntegration: false,
    sanity: {
      status: report.sanity.status,
      suspiciousMetrics: report.sanity.results
        .filter((result) => result.suspicious)
        .map((result) => result.metric),
    },
    summary: report.summary,
    caveats: report.caveats,
  };
  return `// Generated by scripts/calibration/validateModel.ts.
// Do not edit manually. This artifact is not integrated into the production app.
export const MODEL_VALIDATION = ${JSON.stringify(validationConstant, null, 2)} as const;
`;
}

function printConsoleTable(report: ValidationReport): void {
  console.table(
    report.results.map((result) => {
      if (result.status === "not-evaluable") {
        return {
          leagueId: result.leagueId,
          metric: result.metric,
          granularity: result.granularity,
          testN: result.split.testCompleteMatches,
          status: result.status,
        };
      }
      return {
        leagueId: result.leagueId,
        metric: result.metric,
        granularity: result.granularity,
        testN: result.split.testCompleteMatches,
        poissonNll: Number(result.models.poisson.meanNll.toFixed(4)),
        globalNbNll: Number(
          result.models["negative-binomial-global"].meanNll.toFixed(4),
        ),
        overrideNbNll: Number(
          result.models["negative-binomial-league-override"].meanNll.toFixed(4),
        ),
        best: result.bestMeanNllModel,
      };
    }),
  );
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

function assertClose(actual: number, expected: number, tolerance: number, context: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${context}: atteso ${expected}, osservato ${actual}.`);
  }
}

function distributionMoments(mean: number, dispersion: number): {
  probability: number;
  mean: number;
  variance: number;
} {
  const parameters = distributionParameters(mean, dispersion);
  const maxCount = 300;
  let probability = 0;
  let firstMoment = 0;
  let secondMoment = 0;
  for (let count = 0; count <= maxCount; count += 1) {
    const mass = Math.exp(logProbability(count, parameters));
    probability += mass;
    firstMoment += count * mass;
    secondMoment += count * count * mass;
  }
  return {
    probability,
    mean: firstMoment,
    variance: secondMoment - firstMoment * firstMoment,
  };
}

function runSelfTest(): void {
  assertClose(logGamma(1), 0, 1e-12, "logGamma(1)");
  assertClose(logGamma(6), Math.log(120), 1e-12, "logGamma(6)");
  const poisson = distributionMoments(3.2, 1);
  assertClose(poisson.probability, 1, 1e-12, "Poisson massa totale");
  assertClose(poisson.mean, 3.2, 1e-11, "Poisson media");
  assertClose(poisson.variance, 3.2, 1e-10, "Poisson varianza");
  const negativeBinomial = distributionMoments(4, 1.8);
  assertClose(negativeBinomial.probability, 1, 1e-11, "NB massa totale");
  assertClose(negativeBinomial.mean, 4, 1e-10, "NB media");
  assertClose(negativeBinomial.variance, 7.2, 1e-9, "NB varianza");
  const fallbackPoisson = distributionParameters(4, POISSON_FALLBACK_THRESHOLD);
  if (fallbackPoisson.kind !== "poisson" || fallbackPoisson.effectiveDispersion !== 1) {
    throw new Error("Fallback Poisson D<=1.05 non rispettato.");
  }
  const poissonInterval = centralInterval(distributionParameters(3.2, 1));
  const nbInterval = centralInterval(distributionParameters(4, 1.8));
  if (poissonInterval.lower > poissonInterval.upper || nbInterval.lower > nbInterval.upper) {
    throw new Error("Intervallo predittivo non ordinato.");
  }
  console.log("[CAL-4A] Self-test PMF Poisson/NB superato.");
}

function validateSources(
  dataset: Dataset,
  quality: QualityReport,
  calibration: CalibrationReport,
): void {
  if (quality.integrity.status !== "passed") {
    throw new Error("DATASET_QUALITY: integrità non superata; CAL-4A interrotto.");
  }
  if (quality.status !== "ready" && quality.status !== "ready-with-exclusions") {
    throw new Error(`DATASET_QUALITY: stato ${quality.status} non eseguibile.`);
  }
  if (calibration.status !== "completed") {
    throw new Error(`CALIBRATION_REPORT: stato ${calibration.status} non eseguibile.`);
  }
  if (
    quality.source.dataset !== "scripts/calibration/data/dataset.csv" ||
    calibration.source.dataset !== "scripts/calibration/data/dataset.csv" ||
    calibration.source.qualityReport !== "scripts/calibration/output/DATASET_QUALITY.json"
  ) {
    throw new Error("Provenance dataset/report inattesa.");
  }
  if (
    quality.source.manifestRunId !== calibration.source.manifestRunId ||
    quality.generatedAt !== calibration.source.qualityGeneratedAt
  ) {
    throw new Error("Provenance QA/CAL-3 incoerente.");
  }
  if (
    dataset.rows.length !== quality.summary.teamRowCount ||
    dataset.matches.length !== quality.summary.matchCount ||
    dataset.rows.length !== calibration.summary.datasetRows ||
    dataset.matches.length !== calibration.summary.datasetMatches ||
    quality.summary.includedLeagueMetrics !== calibration.summary.includedLeagueMetrics
  ) {
    throw new Error("Conteggi dataset/QA/CAL-3 incoerenti.");
  }
}

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  const [datasetText, qualityText, calibrationText] = await Promise.all([
    readFile(DATASET_PATH, "utf8"),
    readFile(QUALITY_PATH, "utf8"),
    readFile(CALIBRATION_PATH, "utf8"),
  ]);
  const dataset = parseDataset(datasetText);
  const quality = parseQualityReport(JSON.parse(qualityText) as unknown);
  const calibration = parseCalibrationReport(JSON.parse(calibrationText) as unknown);
  validateSources(dataset, quality, calibration);
  console.log(`[CAL-4A] Dataset letto: ${dataset.rows.length} righe, ${dataset.matches.length} match.`);
  const report = buildReport(dataset, quality, calibration, options, new Date().toISOString());
  if (!options.quiet) printConsoleTable(report);
  console.log(
    `[CAL-4A] Valutate ${report.summary.completedRows}/${report.summary.validationRows} righe metrica/granularità; sanity sospette ${report.summary.suspiciousSanityMetrics}.`,
  );
  if (options.noWrite) {
    console.log("[CAL-4A] Run senza scritture completato.");
    return;
  }
  await atomicWrite(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(REPORT_MARKDOWN_PATH, buildMarkdown(report));
  await atomicWrite(GENERATED_PATH, generatedTypeScript(report));
  console.log("[CAL-4A] Output completi scritti in scripts/calibration/output/.");
  console.log("[CAL-4A] Nessuna integrazione app autorizzata; gate umano richiesto dopo CAL-4.");
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Errore sconosciuto.";
  console.error(`[CAL-4A] ${message}`);
  process.exitCode = 1;
});
