import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIN_MATCHES = 50;
const TARGET_MATCHES = 200;
const MAX_MISSING_MATCH_RATE = 0.2;
const DATASET_HEADER = [
  "league_id",
  "match_id",
  "date",
  "team",
  "side",
  "shots",
  "sot",
  "fouls",
  "corners",
  "yellows",
  "saves",
  "offsides",
] as const;
const METRICS = ["shots", "sot", "fouls", "corners", "yellows", "saves", "offsides"] as const;
const RAW_METRIC_FIELDS = {
  shots: "total_shots",
  sot: "shots_on_target",
  fouls: "fouls",
  corners: "corner_kicks",
  yellows: "yellow_cards",
  saves: "goalkeeper_saves",
  offsides: "offsides",
} as const;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SCRIPT_DIR, "data");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");
const DATASET_PATH = path.join(DATA_DIR, "dataset.csv");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const RAW_DIR = path.join(DATA_DIR, "raw");
const ROWS_DIR = path.join(DATA_DIR, "rows");
const REPORT_JSON_PATH = path.join(OUTPUT_DIR, "DATASET_QUALITY.json");
const REPORT_MARKDOWN_PATH = path.join(OUTPUT_DIR, "DATASET_QUALITY.md");

type JsonRecord = Record<string, unknown>;
type Metric = (typeof METRICS)[number];
type Side = "home" | "away";
type SampleStatus = "insufficient" | "below-target" | "target-met";
type MetricExclusionReason =
  | "insufficient-league-sample"
  | "missingness-above-20-percent"
  | null;

type LeagueManifest = {
  leagueId: number;
  name: string;
  country: string;
  dateFrom: string;
  dateTo: string;
  plannedMatchCount: number;
  harvestedMatchCount: number;
  status: string;
  sampleStatus: string;
};

type Manifest = {
  runId: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  selectedLeagueCount: number;
  totals: {
    plannedMatches: number;
    harvestedMatches: number;
  };
  leagues: LeagueManifest[];
};

type DatasetRow = {
  leagueId: number;
  matchId: number;
  date: string;
  team: string;
  side: Side;
  metrics: Record<Metric, number | null>;
  cells: string[];
};

type CsvDocument = {
  rows: string[][];
  unclosedQuote: boolean;
};

type DatasetAudit = {
  rows: DatasetRow[];
  allDataCells: string[][];
  headerExact: boolean;
  unclosedQuote: boolean;
  badColumnRows: number;
  invalidIntegerIds: number;
  missingCoreFields: number;
  invalidDates: number;
  invalidMetricCells: number;
  duplicateLeagueMatchSides: number;
  badHomeAwayPairs: number;
  matches: Map<string, DatasetRow[]>;
  rowBySideKey: Map<string, DatasetRow>;
};

type RawAudit = {
  fileCount: number;
  filesByLeague: Map<number, number>;
  invalidJson: number;
  pathMismatches: number;
  missingContracts: number;
  invalidMetricCells: number;
  rowsMissingFromDataset: number;
  metricMismatches: number;
  sensitiveKeyMatches: number;
};

type ShardAudit = {
  fileCount: number;
  filesByLeague: Map<number, number>;
  unclosedQuotes: number;
  badRowCountFiles: number;
  badColumnRows: number;
  pathMismatches: number;
  datasetRowsMissingFromShards: number;
  shardRowsMissingFromDataset: number;
};

type IntegrityCheck = {
  id: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
};

type MetricQuality = {
  teamRows: number;
  missingTeamRows: number;
  missingTeamRate: number | null;
  matches: number;
  completeMatches: number;
  missingMatches: number;
  missingMatchRate: number | null;
  excluded: boolean;
  exclusionReason: MetricExclusionReason;
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
  calibrationDecision: "exclude" | "include-with-caveat" | "include";
  metrics: Record<Metric, MetricQuality>;
};

type QualityReport = {
  schemaVersion: 1;
  generatedAt: string;
  status: "failed" | "ready" | "ready-with-exclusions";
  nextGate: "human-confirmation-required-before-CAL-3";
  source: {
    dataset: "scripts/calibration/data/dataset.csv";
    manifest: "scripts/calibration/data/manifest.json";
    manifestRunId: string;
    manifestStartedAt: string;
    manifestCompletedAt: string | null;
  };
  rules: {
    minimumMatches: number;
    targetMatches: number;
    maximumMissingMatchRate: number;
    matchMissingDefinition: string;
    missingValues: "null-or-empty-never-zero";
  };
  integrity: {
    status: "passed" | "failed";
    passedChecks: number;
    totalChecks: number;
    checks: IntegrityCheck[];
  };
  summary: {
    leagueCount: number;
    matchCount: number;
    teamRowCount: number;
    targetMetLeagues: number;
    belowTargetLeagues: number;
    insufficientLeagues: number;
    includedLeagueMetrics: number;
    excludedLeagueMetrics: number;
    missingnessExcludedLeagueMetrics: number;
  };
  leagues: LeagueQuality[];
};

function printUsage(): void {
  console.log(`CAL-2 — IQstatS dataset quality audit

Usage:
  node --experimental-strip-types scripts/calibration/qaDataset.ts

Inputs:
  scripts/calibration/data/dataset.csv
  scripts/calibration/data/manifest.json
  scripts/calibration/data/raw/**
  scripts/calibration/data/rows/**

Outputs:
  scripts/calibration/output/DATASET_QUALITY.json
  scripts/calibration/output/DATASET_QUALITY.md
`);
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

function requiredInteger(record: JsonRecord, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context}: campo ${key} assente o non valido.`);
  }
  return value;
}

function parseManifest(value: unknown): Manifest {
  const record = requiredRecord(value, "Manifest");
  const totals = requiredRecord(record.totals, "Manifest totals");
  if (!Array.isArray(record.leagues)) throw new Error("Manifest: leagues non valido.");
  const leagues = record.leagues.map((item, index): LeagueManifest => {
    const league = requiredRecord(item, `Manifest lega ${index}`);
    return {
      leagueId: requiredInteger(league, "leagueId", `Manifest lega ${index}`),
      name: requiredString(league, "name", `Manifest lega ${index}`),
      country: requiredString(league, "country", `Manifest lega ${index}`),
      dateFrom: requiredString(league, "dateFrom", `Manifest lega ${index}`),
      dateTo: requiredString(league, "dateTo", `Manifest lega ${index}`),
      plannedMatchCount: requiredInteger(league, "plannedMatchCount", `Manifest lega ${index}`),
      harvestedMatchCount: requiredInteger(
        league,
        "harvestedMatchCount",
        `Manifest lega ${index}`,
      ),
      status: requiredString(league, "status", `Manifest lega ${index}`),
      sampleStatus: requiredString(league, "sampleStatus", `Manifest lega ${index}`),
    };
  });
  return {
    runId: requiredString(record, "runId", "Manifest"),
    mode: requiredString(record, "mode", "Manifest"),
    status: requiredString(record, "status", "Manifest"),
    startedAt: requiredString(record, "startedAt", "Manifest"),
    completedAt: typeof record.completedAt === "string" ? record.completedAt : null,
    selectedLeagueCount: requiredInteger(record, "selectedLeagueCount", "Manifest"),
    totals: {
      plannedMatches: requiredInteger(totals, "plannedMatches", "Manifest totals"),
      harvestedMatches: requiredInteger(totals, "harvestedMatches", "Manifest totals"),
    },
    leagues,
  };
}

function parseCsv(text: string): CsvDocument {
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
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return { rows, unclosedQuote: quoted };
}

function positiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function metricInteger(value: string): number | null | "invalid" {
  if (value === "") return null;
  if (!/^\d+$/.test(value)) return "invalid";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : "invalid";
}

function metricRecord<T>(factory: (metric: Metric) => T): Record<Metric, T> {
  return Object.fromEntries(METRICS.map((metric) => [metric, factory(metric)])) as Record<
    Metric,
    T
  >;
}

function sideKey(leagueId: number, matchId: number, side: Side): string {
  return `${leagueId}|${matchId}|${side}`;
}

function matchKey(leagueId: number, matchId: number): string {
  return `${leagueId}|${matchId}`;
}

function auditDataset(text: string): DatasetAudit {
  const csv = parseCsv(text);
  const [header = [], ...allDataCells] = csv.rows;
  const headerExact =
    header.length === DATASET_HEADER.length &&
    DATASET_HEADER.every((field, index) => header[index] === field);
  const rows: DatasetRow[] = [];
  const matches = new Map<string, DatasetRow[]>();
  const rowBySideKey = new Map<string, DatasetRow>();
  let badColumnRows = 0;
  let invalidIntegerIds = 0;
  let missingCoreFields = 0;
  let invalidDates = 0;
  let invalidMetricCells = 0;
  let duplicateLeagueMatchSides = 0;

  for (const cells of allDataCells) {
    if (cells.length !== DATASET_HEADER.length) {
      badColumnRows += 1;
      continue;
    }
    const leagueId = positiveInteger(cells[0] ?? "");
    const matchId = positiveInteger(cells[1] ?? "");
    const date = cells[2] ?? "";
    const team = cells[3] ?? "";
    const sideValue = cells[4] ?? "";
    if (leagueId === null || matchId === null) {
      invalidIntegerIds += 1;
      continue;
    }
    if (team.trim() === "" || (sideValue !== "home" && sideValue !== "away")) {
      missingCoreFields += 1;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalidDates += 1;
    const parsedMetrics = metricRecord<number | null>(() => null);
    let metricsValid = true;
    for (const [metricIndex, metric] of METRICS.entries()) {
      const parsed = metricInteger(cells[metricIndex + 5] ?? "");
      if (parsed === "invalid") {
        invalidMetricCells += 1;
        metricsValid = false;
      } else {
        parsedMetrics[metric] = parsed;
      }
    }
    if (!metricsValid) continue;
    const side = sideValue;
    const row: DatasetRow = {
      leagueId,
      matchId,
      date,
      team,
      side,
      metrics: parsedMetrics,
      cells,
    };
    const rowKey = sideKey(leagueId, matchId, side);
    if (rowBySideKey.has(rowKey)) duplicateLeagueMatchSides += 1;
    else rowBySideKey.set(rowKey, row);
    const groupKey = matchKey(leagueId, matchId);
    const group = matches.get(groupKey) ?? [];
    group.push(row);
    matches.set(groupKey, group);
    rows.push(row);
  }

  let badHomeAwayPairs = 0;
  for (const group of matches.values()) {
    const sides = new Set(group.map((row) => row.side));
    if (group.length !== 2 || sides.size !== 2 || !sides.has("home") || !sides.has("away")) {
      badHomeAwayPairs += 1;
    }
  }
  return {
    rows,
    allDataCells,
    headerExact,
    unclosedQuote: csv.unclosedQuote,
    badColumnRows,
    invalidIntegerIds,
    missingCoreFields,
    invalidDates,
    invalidMetricCells,
    duplicateLeagueMatchSides,
    badHomeAwayPairs,
    matches,
    rowBySideKey,
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function walkFiles(directory: string, extension: string): Promise<string[]> {
  if (!(await pathExists(directory))) return [];
  const result: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(target, extension)));
    else if (entry.isFile() && entry.name.endsWith(extension)) result.push(target);
  }
  return result;
}

function increment(map: Map<number, number>, key: number): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function rawMetric(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return "invalid";
}

async function auditRaw(dataset: DatasetAudit): Promise<RawAudit> {
  const files = await walkFiles(RAW_DIR, ".json");
  const filesByLeague = new Map<number, number>();
  let invalidJson = 0;
  let pathMismatches = 0;
  let missingContracts = 0;
  let invalidMetricCells = 0;
  let rowsMissingFromDataset = 0;
  let metricMismatches = 0;
  let sensitiveKeyMatches = 0;
  const sensitiveKeyPattern = /"(?:authorization|token|api[-_]?key|x-api-key)"\s*:/gi;

  for (const file of files) {
    const leagueId = positiveInteger(path.basename(path.dirname(file)));
    const matchId = positiveInteger(path.basename(file, ".json"));
    if (leagueId === null || matchId === null) {
      pathMismatches += 1;
      continue;
    }
    increment(filesByLeague, leagueId);
    const text = await readFile(file, "utf8");
    sensitiveKeyMatches += text.match(sensitiveKeyPattern)?.length ?? 0;
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      invalidJson += 1;
      continue;
    }
    if (!isRecord(value)) {
      missingContracts += 1;
      continue;
    }
    const eventId =
      typeof value.event_id === "number"
        ? value.event_id
        : typeof value.event_id === "string" && /^\d+$/.test(value.event_id)
          ? Number(value.event_id)
          : null;
    if (eventId !== matchId) pathMismatches += 1;
    if (!isRecord(value.stats) || !isRecord(value.stats.home) || !isRecord(value.stats.away)) {
      missingContracts += 1;
      continue;
    }
    for (const side of ["home", "away"] as const) {
      const datasetRow = dataset.rowBySideKey.get(sideKey(leagueId, matchId, side));
      if (!datasetRow) {
        rowsMissingFromDataset += 1;
        continue;
      }
      const stats = value.stats[side];
      if (!isRecord(stats)) {
        missingContracts += 1;
        continue;
      }
      for (const metric of METRICS) {
        const parsed = rawMetric(stats[RAW_METRIC_FIELDS[metric]]);
        if (parsed === "invalid") {
          invalidMetricCells += 1;
        } else if (parsed !== datasetRow.metrics[metric]) {
          metricMismatches += 1;
        }
      }
    }
  }
  return {
    fileCount: files.length,
    filesByLeague,
    invalidJson,
    pathMismatches,
    missingContracts,
    invalidMetricCells,
    rowsMissingFromDataset,
    metricMismatches,
    sensitiveKeyMatches,
  };
}

function multiset(cells: string[][]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of cells) {
    const key = JSON.stringify(row);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

async function auditShards(dataset: DatasetAudit): Promise<ShardAudit> {
  const files = await walkFiles(ROWS_DIR, ".csv");
  const filesByLeague = new Map<number, number>();
  const remainingDatasetRows = multiset(dataset.allDataCells);
  let unclosedQuotes = 0;
  let badRowCountFiles = 0;
  let badColumnRows = 0;
  let pathMismatches = 0;
  let shardRowsMissingFromDataset = 0;

  for (const file of files) {
    const leagueId = positiveInteger(path.basename(path.dirname(file)));
    const matchId = positiveInteger(path.basename(file, ".csv"));
    if (leagueId === null || matchId === null) {
      pathMismatches += 1;
      continue;
    }
    increment(filesByLeague, leagueId);
    const parsed = parseCsv(await readFile(file, "utf8"));
    if (parsed.unclosedQuote) unclosedQuotes += 1;
    if (parsed.rows.length !== 2) badRowCountFiles += 1;
    for (const row of parsed.rows) {
      if (row.length !== DATASET_HEADER.length) {
        badColumnRows += 1;
        continue;
      }
      if (row[0] !== String(leagueId) || row[1] !== String(matchId)) pathMismatches += 1;
      const key = JSON.stringify(row);
      const available = remainingDatasetRows.get(key) ?? 0;
      if (available === 0) shardRowsMissingFromDataset += 1;
      else if (available === 1) remainingDatasetRows.delete(key);
      else remainingDatasetRows.set(key, available - 1);
    }
  }
  const datasetRowsMissingFromShards = [...remainingDatasetRows.values()].reduce(
    (total, count) => total + count,
    0,
  );
  return {
    fileCount: files.length,
    filesByLeague,
    unclosedQuotes,
    badRowCountFiles,
    badColumnRows,
    pathMismatches,
    datasetRowsMissingFromShards,
    shardRowsMissingFromDataset,
  };
}

function classifySample(matchCount: number): SampleStatus {
  if (matchCount < MIN_MATCHES) return "insufficient";
  if (matchCount < TARGET_MATCHES) return "below-target";
  return "target-met";
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(6));
}

function leagueQualities(manifest: Manifest, dataset: DatasetAudit): LeagueQuality[] {
  const rowsByLeague = new Map<number, DatasetRow[]>();
  const matchesByLeague = new Map<number, DatasetRow[][]>();
  for (const row of dataset.rows) {
    const rows = rowsByLeague.get(row.leagueId) ?? [];
    rows.push(row);
    rowsByLeague.set(row.leagueId, rows);
  }
  for (const group of dataset.matches.values()) {
    const leagueId = group[0]?.leagueId;
    if (leagueId === undefined) continue;
    const matches = matchesByLeague.get(leagueId) ?? [];
    matches.push(group);
    matchesByLeague.set(leagueId, matches);
  }

  return manifest.leagues.map((league): LeagueQuality => {
    const rows = rowsByLeague.get(league.leagueId) ?? [];
    const matches = matchesByLeague.get(league.leagueId) ?? [];
    const sampleStatus = classifySample(matches.length);
    const metrics = metricRecord<MetricQuality>((metric) => {
      const missingTeamRows = rows.filter((row) => row.metrics[metric] === null).length;
      const missingMatches = matches.filter((match) =>
        match.some((row) => row.metrics[metric] === null),
      ).length;
      const missingMatchRate = rate(missingMatches, matches.length);
      const exclusionReason: MetricExclusionReason =
        matches.length < MIN_MATCHES
          ? "insufficient-league-sample"
          : missingMatchRate !== null && missingMatchRate > MAX_MISSING_MATCH_RATE
            ? "missingness-above-20-percent"
            : null;
      return {
        teamRows: rows.length,
        missingTeamRows,
        missingTeamRate: rate(missingTeamRows, rows.length),
        matches: matches.length,
        completeMatches: matches.length - missingMatches,
        missingMatches,
        missingMatchRate,
        excluded: exclusionReason !== null,
        exclusionReason,
      };
    });
    return {
      leagueId: league.leagueId,
      name: league.name,
      country: league.country,
      dateFrom: league.dateFrom,
      dateTo: league.dateTo,
      matchCount: matches.length,
      teamRowCount: rows.length,
      sampleStatus,
      calibrationDecision:
        sampleStatus === "insufficient"
          ? "exclude"
          : sampleStatus === "below-target"
            ? "include-with-caveat"
            : "include",
      metrics,
    };
  });
}

function buildChecks(
  manifest: Manifest,
  dataset: DatasetAudit,
  raw: RawAudit,
  shards: ShardAudit,
): IntegrityCheck[] {
  const checks: IntegrityCheck[] = [];
  const add = (
    id: string,
    label: string,
    passed: boolean,
    expected: string | number,
    actual: string | number,
  ): void => {
    checks.push({ id, label, passed, expected: String(expected), actual: String(actual) });
  };
  const manifestMatches = manifest.totals.harvestedMatches;
  const leagueCountMismatches = manifest.leagues.filter((league) => {
    const datasetMatches = [...dataset.matches.values()].filter(
      (rows) => rows[0]?.leagueId === league.leagueId,
    ).length;
    return (
      league.status !== "completed" ||
      league.plannedMatchCount !== league.harvestedMatchCount ||
      datasetMatches !== league.harvestedMatchCount ||
      (raw.filesByLeague.get(league.leagueId) ?? 0) !== league.harvestedMatchCount ||
      (shards.filesByLeague.get(league.leagueId) ?? 0) !== league.harvestedMatchCount
    );
  }).length;
  add("manifest-mode", "Manifest di esecuzione", manifest.mode === "execute", "execute", manifest.mode);
  add(
    "manifest-status",
    "Manifest completato",
    manifest.status === "completed" && manifest.completedAt !== null,
    "completed con completedAt",
    `${manifest.status}; completedAt=${manifest.completedAt ?? "null"}`,
  );
  add(
    "manifest-leagues",
    "Leghe selezionate e completate",
    manifest.selectedLeagueCount === manifest.leagues.length &&
      manifest.leagues.every((league) => league.status === "completed"),
    manifest.selectedLeagueCount,
    manifest.leagues.filter((league) => league.status === "completed").length,
  );
  add(
    "manifest-totals",
    "Match pianificati e raccolti",
    manifest.totals.plannedMatches === manifestMatches,
    manifest.totals.plannedMatches,
    manifestMatches,
  );
  add("dataset-header", "Schema CSV", dataset.headerExact, DATASET_HEADER.join(","), dataset.headerExact ? "esatto" : "diverso");
  add("dataset-quotes", "Quoting CSV", !dataset.unclosedQuote, 0, dataset.unclosedQuote ? 1 : 0);
  add("dataset-columns", "Numero colonne CSV", dataset.badColumnRows === 0, 0, dataset.badColumnRows);
  add("dataset-rows", "Righe team-gara", dataset.rows.length === manifestMatches * 2, manifestMatches * 2, dataset.rows.length);
  add("dataset-matches", "Grana match", dataset.matches.size === manifestMatches, manifestMatches, dataset.matches.size);
  add("dataset-pairs", "Coppie home/away", dataset.badHomeAwayPairs === 0, 0, dataset.badHomeAwayPairs);
  add("dataset-duplicates", "Duplicati league/match/side", dataset.duplicateLeagueMatchSides === 0, 0, dataset.duplicateLeagueMatchSides);
  add("dataset-ids", "ID non validi", dataset.invalidIntegerIds === 0, 0, dataset.invalidIntegerIds);
  add("dataset-core", "Campi chiave mancanti", dataset.missingCoreFields === 0, 0, dataset.missingCoreFields);
  add("dataset-dates", "Date non valide", dataset.invalidDates === 0, 0, dataset.invalidDates);
  add("dataset-metrics", "Valori metrici non validi", dataset.invalidMetricCells === 0, 0, dataset.invalidMetricCells);
  add("league-counts", "Conteggi per lega", leagueCountMismatches === 0, 0, leagueCountMismatches);
  add("raw-count", "Raw JSON", raw.fileCount === manifestMatches, manifestMatches, raw.fileCount);
  add("raw-json", "Raw JSON non parseabili", raw.invalidJson === 0, 0, raw.invalidJson);
  add("raw-paths", "Percorsi raw incoerenti", raw.pathMismatches === 0, 0, raw.pathMismatches);
  add("raw-contract", "Contratti stats.home/away mancanti", raw.missingContracts === 0, 0, raw.missingContracts);
  add("raw-metrics", "Metriche raw non valide", raw.invalidMetricCells === 0, 0, raw.invalidMetricCells);
  add("raw-rows", "Righe dataset senza raw", raw.rowsMissingFromDataset === 0, 0, raw.rowsMissingFromDataset);
  add("raw-values", "Differenze raw/dataset", raw.metricMismatches === 0, 0, raw.metricMismatches);
  add("raw-secrets", "Chiavi sensibili nei raw", raw.sensitiveKeyMatches === 0, 0, raw.sensitiveKeyMatches);
  add("shard-count", "Shard CSV", shards.fileCount === manifestMatches, manifestMatches, shards.fileCount);
  add("shard-quotes", "Shard con quoting non chiuso", shards.unclosedQuotes === 0, 0, shards.unclosedQuotes);
  add("shard-rows", "Shard con numero righe errato", shards.badRowCountFiles === 0, 0, shards.badRowCountFiles);
  add("shard-columns", "Righe shard con colonne errate", shards.badColumnRows === 0, 0, shards.badColumnRows);
  add("shard-paths", "Percorsi shard incoerenti", shards.pathMismatches === 0, 0, shards.pathMismatches);
  add("shard-to-dataset", "Righe shard assenti nel dataset", shards.shardRowsMissingFromDataset === 0, 0, shards.shardRowsMissingFromDataset);
  add("dataset-to-shard", "Righe dataset assenti negli shard", shards.datasetRowsMissingFromShards === 0, 0, shards.datasetRowsMissingFromShards);
  return checks;
}

function makeReport(
  manifest: Manifest,
  dataset: DatasetAudit,
  raw: RawAudit,
  shards: ShardAudit,
): QualityReport {
  const checks = buildChecks(manifest, dataset, raw, shards);
  const integrityPassed = checks.every((check) => check.passed);
  const leagues = leagueQualities(manifest, dataset);
  const metricQualities = leagues.flatMap((league) => Object.values(league.metrics));
  const excludedLeagueMetrics = metricQualities.filter((metric) => metric.excluded).length;
  const missingnessExcludedLeagueMetrics = metricQualities.filter(
    (metric) => metric.exclusionReason === "missingness-above-20-percent",
  ).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: !integrityPassed
      ? "failed"
      : excludedLeagueMetrics > 0
        ? "ready-with-exclusions"
        : "ready",
    nextGate: "human-confirmation-required-before-CAL-3",
    source: {
      dataset: "scripts/calibration/data/dataset.csv",
      manifest: "scripts/calibration/data/manifest.json",
      manifestRunId: manifest.runId,
      manifestStartedAt: manifest.startedAt,
      manifestCompletedAt: manifest.completedAt,
    },
    rules: {
      minimumMatches: MIN_MATCHES,
      targetMatches: TARGET_MATCHES,
      maximumMissingMatchRate: MAX_MISSING_MATCH_RATE,
      matchMissingDefinition:
        "Un match e mancante per una metrica quando il valore home o away e assente.",
      missingValues: "null-or-empty-never-zero",
    },
    integrity: {
      status: integrityPassed ? "passed" : "failed",
      passedChecks: checks.filter((check) => check.passed).length,
      totalChecks: checks.length,
      checks,
    },
    summary: {
      leagueCount: leagues.length,
      matchCount: dataset.matches.size,
      teamRowCount: dataset.rows.length,
      targetMetLeagues: leagues.filter((league) => league.sampleStatus === "target-met").length,
      belowTargetLeagues: leagues.filter((league) => league.sampleStatus === "below-target").length,
      insufficientLeagues: leagues.filter((league) => league.sampleStatus === "insufficient").length,
      includedLeagueMetrics: metricQualities.length - excludedLeagueMetrics,
      excludedLeagueMetrics,
      missingnessExcludedLeagueMetrics,
    },
    leagues,
  };
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function percent(value: number | null): string {
  return value === null ? "n/d" : `${(value * 100).toFixed(1)}%`;
}

function buildMarkdown(report: QualityReport): string {
  const lines: string[] = [
    "# CAL-2 — qualità del dataset di calibrazione",
    "",
    `Generato: ${report.generatedAt}`,
    `Manifest: ${report.source.manifestRunId}`,
    `Stato: **${report.status}**`,
    "",
    "CAL-3 non è stato eseguito. È richiesta conferma umana prima di procedere.",
    "",
    "## Regole",
    "",
    `- Campione minimo per lega: ${report.rules.minimumMatches} match.`,
    `- Target per lega: ${report.rules.targetMatches} match.`,
    `- Esclusione metrica: missingness match > ${(report.rules.maximumMissingMatchRate * 100).toFixed(0)}%.`,
    `- Definizione: ${report.rules.matchMissingDefinition}`,
    "- I valori mancanti restano vuoti/null e non vengono convertiti in zero.",
    "",
    "## Integrità",
    "",
    `Esito: **${report.integrity.status}** (${report.integrity.passedChecks}/${report.integrity.totalChecks} controlli superati).`,
    "",
    "| Controllo | Esito | Atteso | Osservato |",
    "| --- | --- | ---: | ---: |",
  ];
  for (const check of report.integrity.checks) {
    lines.push(
      `| ${markdownEscape(check.label)} | ${check.passed ? "OK" : "ERRORE"} | ${markdownEscape(check.expected)} | ${markdownEscape(check.actual)} |`,
    );
  }
  lines.push(
    "",
    "## Sintesi campione",
    "",
    `- Leghe: ${report.summary.leagueCount}.`,
    `- Match: ${report.summary.matchCount}.`,
    `- Righe team-gara: ${report.summary.teamRowCount}.`,
    `- Target raggiunto: ${report.summary.targetMetLeagues} leghe.`,
    `- Sotto target ma sopra il minimo: ${report.summary.belowTargetLeagues} leghe.`,
    `- Campione insufficiente: ${report.summary.insufficientLeagues} leghe.`,
    `- Combinazioni lega/metrica incluse: ${report.summary.includedLeagueMetrics}.`,
    `- Combinazioni lega/metrica escluse: ${report.summary.excludedLeagueMetrics}, di cui ${report.summary.missingnessExcludedLeagueMetrics} per missingness >20%.`,
    "",
    "## Decisione per lega",
    "",
    "| ID | Lega | Paese | Match | Campione | Decisione | Metriche escluse |",
    "| ---: | --- | --- | ---: | --- | --- | --- |",
  );
  for (const league of report.leagues) {
    const excluded = METRICS.filter((metric) => league.metrics[metric].excluded);
    lines.push(
      `| ${league.leagueId} | ${markdownEscape(league.name)} | ${markdownEscape(league.country)} | ${league.matchCount} | ${league.sampleStatus} | ${league.calibrationDecision} | ${excluded.length > 0 ? excluded.join(", ") : "nessuna"} |`,
    );
  }
  lines.push(
    "",
    "## Missingness per lega e metrica",
    "",
    "Ogni cella riporta match mancanti / match totali, percentuale e stato di esclusione.",
    "",
    `| ID | Lega | ${METRICS.join(" | ")} |`,
    `| ---: | --- | ${METRICS.map(() => "---:").join(" | ")} |`,
  );
  for (const league of report.leagues) {
    const cells = METRICS.map((metric) => {
      const quality = league.metrics[metric];
      const base = `${quality.missingMatches}/${quality.matches} (${percent(quality.missingMatchRate)})`;
      return quality.excluded ? `${base} — esclusa` : base;
    });
    lines.push(`| ${league.leagueId} | ${markdownEscape(league.name)} | ${cells.join(" | ")} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
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
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    printUsage();
    return;
  }
  if (args.length > 0) throw new Error(`Argomenti non riconosciuti: ${args.join(" ")}.`);

  const manifest = parseManifest(JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown);
  const dataset = auditDataset(await readFile(DATASET_PATH, "utf8"));
  console.log(`[CAL-2] Dataset letto: ${dataset.rows.length} righe, ${dataset.matches.size} match.`);
  const raw = await auditRaw(dataset);
  console.log(`[CAL-2] Raw verificati: ${raw.fileCount}.`);
  const shards = await auditShards(dataset);
  console.log(`[CAL-2] Shard verificati: ${shards.fileCount}.`);
  const report = makeReport(manifest, dataset, raw, shards);
  await atomicWrite(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(REPORT_MARKDOWN_PATH, buildMarkdown(report));
  console.log(
    `[CAL-2] Report completato: ${report.integrity.passedChecks}/${report.integrity.totalChecks} controlli; ${report.summary.excludedLeagueMetrics} combinazioni lega/metrica escluse.`,
  );
  if (report.integrity.status !== "passed") process.exitCode = 1;
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Errore sconosciuto.";
  console.error(`[CAL-2] ${message}`);
  process.exitCode = 1;
});
