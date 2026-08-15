import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const METRICS = ["shots", "sot", "fouls", "corners", "yellows", "saves", "offsides"] as const;
const DATASET_HEADER = ["league_id", "match_id", "date", "team", "side", ...METRICS] as const;
const STARTER_APPEARANCE_THRESHOLD = 0.6;
const MINIMUM_COVERAGE = 0.8;
const VALUE_WEIGHT = 0.6;
const STARTER_WEIGHT = 0.4;
const LOW_STABILITY_THRESHOLD = 0.7;
const TACTICAL_SHIFT_DISTANCE_THRESHOLD = 0.5;
const FORMULA_VERSION = "cal-4c-context-v1";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const CONTEXT_DATA_DIR = path.join(SCRIPT_DIR, "context", "data");
const DATASET_PATH = path.join(SCRIPT_DIR, "data", "dataset.csv");
const RAW_DATA_DIR = path.join(SCRIPT_DIR, "data", "raw");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");
const BASELINES_PATH = path.join(OUTPUT_DIR, "LEAGUE_BASELINES.generated.ts");
const REPORT_JSON_PATH = path.join(OUTPUT_DIR, "CONTEXT_REPORT.json");
const REPORT_MARKDOWN_PATH = path.join(OUTPUT_DIR, "CONTEXT_REPORT.md");
const SQUAD_CONTEXT_PATH = path.join(OUTPUT_DIR, "SQUAD_CONTEXT.generated.ts");

type JsonRecord = Record<string, unknown>;
type Metric = (typeof METRICS)[number];
type Side = "home" | "away";

type CliOptions = {
  help: boolean;
  selfTest: boolean;
  noWrite: boolean;
  quiet: boolean;
  asOf: string | null;
  leagueIds: Set<number>;
  maxTeamsPerLeague: number | null;
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

type NormalizedEvent = {
  eventId: number;
  eventDate: string;
  date: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeCoachId: number | null;
  awayCoachId: number | null;
};

type EventContract = {
  schemaVersion: number;
  contract: string;
  capturedAt: string;
  asOf: string;
  leagueId: number;
  league: string;
  cohort: string;
  events: NormalizedEvent[];
  completeTeamEvents: number;
  teamIdCoverage: number | null;
};

type RosterPlayer = {
  playerId: number;
  currentTeamId: number | null;
  marketValueEur: number | null;
};

type RosterContract = {
  schemaVersion: number;
  contract: string;
  capturedAt: string;
  asOf: string;
  teamId: number;
  players: RosterPlayer[];
  coverage: {
    playerRows: number;
    marketValuePresent: number;
    marketValueCoverage: number | null;
    currentTeamIdPresent: number;
    currentTeamIdCoverage: number | null;
  };
};

type NormalizedTransfer = {
  transferId: number;
  playerId: number | null;
  fromTeamId: number | null;
  toTeamId: number | null;
  transferDate: string | null;
};

type TransferContract = {
  schemaVersion: number;
  contract: string;
  capturedAt: string;
  asOf: string;
  leagueId: number;
  teamId: number;
  requestStatus: string;
  requestExclusionReason: string | null;
  transfers: NormalizedTransfer[];
};

type PlayerSnapshot = {
  schemaVersion: number;
  contract: string;
  capturedAt: string;
  asOf: string;
  playerId: number;
  availability: string;
  marketValueEur: number | null;
};

type ManagerSnapshot = {
  schemaVersion: number;
  contract: string;
  capturedAt: string;
  asOf: string;
  managerId: number;
  availability: string;
  preferredFormation: string | null;
  tacticalProfile: string | null;
};

type CoachObservation = {
  managerId: number;
  eventId: number;
  eventDate: string;
  selectionRule: string;
};

type TeamContextContract = {
  schemaVersion: number;
  contract: string;
  generatedAt: string;
  asOf: string;
  leagueId: number;
  teamId: number;
  snapshotEligibility: {
    status: "eligible" | "excluded";
    signedDistanceDays: number;
    absoluteDistanceDays: number;
    rule: string;
    exclusionReason: string | null;
  };
  calibrationLastCoach: CoachObservation | null;
  currentObservedCoach: CoachObservation | null;
};

type HistoricalStarterEvidence = {
  totalMatches: number;
  coveredMatches: number;
  matchCoverage: number | null;
  invalidPlayerEntries: number;
  threshold: number;
  minimumAppearances: number | null;
  starterCount: number;
  starterPlayerIds: number[];
  appearances: Array<{ playerId: number; matches: number; share: number }>;
};

type CoverageGate = {
  historicalMatchCoverage: number | null;
  rosterCoverage: number | null;
  rosterMarketValueCoverage: number | null;
  transferMarketValueCoverage: number | null;
  minimumRequired: number;
  passed: boolean;
  failedRequirements: string[];
};

type SquadStability = {
  value: number | null;
  unavailableReason: string | null;
  formulaVersion: string;
  formula: string;
  marketValueContinuity: number | null;
  starterContinuity: number | null;
  currentRosterKnownValueEur: number | null;
  incomingKnownValueEur: number | null;
  outgoingKnownValueEur: number | null;
  incomingPlayers: number;
  outgoingPlayers: number;
  outgoingHistoricalStarters: number;
  transferPlayersRequiringValue: number;
  transferPlayersWithValue: number;
};

type CoachContext = {
  historicalCoach: CoachObservation | null;
  currentCoach: CoachObservation | null;
  coachChanged: boolean | null;
  coachChangedUnavailableReason: string | null;
  historicalProfile: {
    availability: string;
    managerId: number;
    preferredFormation: string | null;
    tacticalProfile: string | null;
  } | null;
  currentProfile: {
    availability: string;
    managerId: number;
    preferredFormation: string | null;
    tacticalProfile: string | null;
  } | null;
  formationDistance: number | null;
  profileDistance: number | null;
  tacticalDistance: number | null;
  tacticalShift: boolean | null;
  tacticalShiftUnavailableReason: string | null;
  distanceFormula: string;
};

type ConfidenceRecommendation = {
  regimeUncertain: boolean;
  confidenceCap: "medium" | null;
  widenNoBetZone: boolean;
  reasons: string[];
  expectedAdjustmentAllowed: false;
};

type TeamContextIndex = {
  leagueId: number;
  league: string;
  teamId: number;
  asOf: string;
  capturedAt: {
    roster: string;
    transfers: string;
    historicalManager: string | null;
    currentManager: string | null;
  };
  snapshotEligibility: TeamContextContract["snapshotEligibility"];
  historicalStarters: HistoricalStarterEvidence;
  coverageGate: CoverageGate;
  squadStability: SquadStability;
  coach: CoachContext;
  confidenceRecommendation: ConfidenceRecommendation;
  missingReasons: string[];
};

type DescriptiveStats = {
  n: number;
  mean: number | null;
  sd: number | null;
};

type PromotedMetric = {
  status: "available" | "unavailable";
  unavailableReason: string | null;
  completeMatchesInvolvingPromoted: number;
  home: DescriptiveStats;
  away: DescriptiveStats;
  match: DescriptiveStats;
};

type PromotedBaseline = {
  status: "available" | "unavailable";
  unavailableReason: string | null;
  identificationRule: string;
  previousTeamIdCoverage: number | null;
  calibrationTeamCount: number;
  previousTeamCount: number;
  teamIdOverlapCount: number;
  calibrationTeamOverlapCoverage: number | null;
  promotedTeamCount: number;
  promotedTeamIds: number[];
  matchesInvolvingPromoted: number;
  metrics: Partial<Record<Metric, PromotedMetric>>;
};

type BaselineMetricShape = {
  completeMatches: number;
  home: DescriptiveStats;
  away: DescriptiveStats;
  match: DescriptiveStats;
  homeAwayRatio: number | null;
};

type BaselineLeagueShape = {
  leagueId: number;
  name: string;
  country: string;
  metrics: Partial<Record<Metric, BaselineMetricShape>>;
  promoted?: PromotedBaseline;
  [key: string]: unknown;
};

type BaselineArtifact = {
  schemaVersion: number;
  formulaVersion: string;
  generatedAt: string;
  aggregation: string;
  leagues: Record<string, BaselineLeagueShape>;
  contextEnrichment?: {
    schemaVersion: number;
    formulaVersion: string;
    generatedAt: string;
    asOf: string;
    expectedAdjustmentAllowed: false;
    allowedForAppIntegration: false;
  };
  [key: string]: unknown;
};

type ContextReport = {
  schemaVersion: 1;
  formulaVersion: string;
  generatedAt: string;
  status: "completed";
  nextGate: "human-confirmation-required-before-app-integration";
  allowedForAppIntegration: false;
  expectedAdjustmentAllowed: false;
  source: {
    contextManifest: string;
    contextRunId: string;
    contextCompletedAt: string;
    asOf: string;
    dataset: string;
    rawMatchDirectory: string;
    leagueBaselines: string;
    baselineGeneratedAt: string;
  };
  rules: {
    starterDefinition: string;
    minimumCoverage: number;
    squadStability: string;
    marketValueContinuity: string;
    starterContinuity: string;
    tacticalDistance: string;
    tacticalShiftThreshold: number;
    confidenceOnly: string;
    missingValues: string;
    promotedIdentification: string;
    promotedSamples: string;
  };
  scope: {
    mode: "full" | "filtered";
    leagueIds: number[] | null;
    maxTeamsPerLeague: number | null;
    writesEnabled: boolean;
  };
  summary: {
    leagues: number;
    teams: number;
    squadStabilityAvailable: number;
    squadStabilityUnavailable: number;
    coachChangeAvailable: number;
    coachChanged: number;
    tacticalShiftAvailable: number;
    tacticalShiftDetected: number;
    regimeUncertain: number;
    promotedBaselinesAvailable: number;
    promotedBaselinesUnavailable: number;
    promotedTeams: number;
  };
  leagues: Array<{
    leagueId: number;
    name: string;
    teamCount: number;
    teams: TeamContextIndex[];
    promoted: PromotedBaseline;
  }>;
};

function printUsage(): void {
  console.log(`CAL-4C — IQstatS context indices and promoted-team baselines

Usage:
  node --experimental-strip-types scripts/calibration/contextIndex.ts [options]

Options:
  --as-of <YYYY-MM-DD>    Use a completed CAL-4B snapshot (default: latest).
  --league-id <id>        Limit a smoke run to a league; repeatable.
  --max-teams <n>         Limit teams per selected league for a smoke run.
  --no-write              Calculate and validate without writing outputs.
  --self-test             Run deterministic formula tests and exit.
  --quiet                 Suppress the team-level console table.
  -h, --help              Show this help.

Inputs:
  scripts/calibration/context/data/{asOf}/
  scripts/calibration/data/dataset.csv
  scripts/calibration/data/raw/{leagueId}/{matchId}.json
  scripts/calibration/output/LEAGUE_BASELINES.generated.ts

Outputs (full run only):
  scripts/calibration/output/CONTEXT_REPORT.json
  scripts/calibration/output/CONTEXT_REPORT.md
  scripts/calibration/output/SQUAD_CONTEXT.generated.ts
  scripts/calibration/output/LEAGUE_BASELINES.generated.ts (promoted enrichment)

Filtered runs require --no-write. Context indices can only change confidence advice;
expectedAdjustmentAllowed is always false and app integration requires a human gate.
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
    noWrite: false,
    quiet: false,
    asOf: null,
    leagueIds: new Set<number>(),
    maxTeamsPerLeague: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") options.help = true;
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--no-write") options.noWrite = true;
    else if (argument === "--quiet") options.quiet = true;
    else if (argument === "--as-of") {
      const value = args[index + 1];
      if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error("--as-of richiede YYYY-MM-DD.");
      }
      options.asOf = value;
      index += 1;
    } else if (argument === "--league-id") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--league-id richiede un valore.");
      options.leagueIds.add(parsePositiveInteger(value, "--league-id"));
      index += 1;
    } else if (argument === "--max-teams") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--max-teams richiede un valore.");
      options.maxTeamsPerLeague = parsePositiveInteger(value, "--max-teams");
      index += 1;
    } else {
      throw new Error(`Argomento non riconosciuto: ${argument}.`);
    }
  }
  if ((options.leagueIds.size > 0 || options.maxTeamsPerLeague !== null) && !options.noWrite) {
    throw new Error("I run filtrati richiedono --no-write.");
  }
  if (
    options.selfTest &&
    (options.asOf !== null || options.leagueIds.size > 0 || options.maxTeamsPerLeague !== null || options.noWrite)
  ) {
    throw new Error("--self-test deve essere eseguito senza filtri, --as-of o --no-write.");
  }
  return options;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, context: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${context}: oggetto mancante o non valido.`);
  return value;
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context}: array mancante o non valido.`);
  return value;
}

function requireString(record: JsonRecord, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${context}.${key}: stringa mancante o non valida.`);
  }
  return value;
}

function requireNumber(record: JsonRecord, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}.${key}: numero mancante o non valido.`);
  }
  return value;
}

function requireInteger(record: JsonRecord, key: string, context: string): number {
  const value = requireNumber(record, key, context);
  if (!Number.isSafeInteger(value)) throw new Error(`${context}.${key}: intero non valido.`);
  return value;
}

function nullableInteger(record: JsonRecord, key: string, context: string): number | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${context}.${key}: intero/null non valido.`);
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

function nullableString(record: JsonRecord, key: string, context: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${context}.${key}: stringa/null non valida.`);
  return value;
}

async function readJsonUnknown(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path.relative(PROJECT_ROOT, filePath)}: JSON non valido.`);
  }
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
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  if (quoted) throw new Error("dataset.csv: quoting non chiuso.");
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function metricRecord<T>(factory: (metric: Metric) => T): Record<Metric, T> {
  return Object.fromEntries(METRICS.map((metric) => [metric, factory(metric)])) as Record<Metric, T>;
}

function parseDataset(text: string): MatchRows[] {
  const [header = [], ...dataRows] = parseCsv(text);
  if (header.length !== DATASET_HEADER.length || !DATASET_HEADER.every((field, i) => header[i] === field)) {
    throw new Error(`dataset.csv: header non valido; atteso ${DATASET_HEADER.join(",")}.`);
  }
  const grouped = new Map<string, Partial<Record<Side, DatasetRow>>>();
  for (const [rowIndex, cells] of dataRows.entries()) {
    const context = `dataset.csv riga ${rowIndex + 2}`;
    if (cells.length !== DATASET_HEADER.length) throw new Error(`${context}: colonne non valide.`);
    const leagueId = parsePositiveInteger(cells[0] ?? "", `${context} league_id`);
    const matchId = parsePositiveInteger(cells[1] ?? "", `${context} match_id`);
    const date = cells[2] ?? "";
    const team = cells[3] ?? "";
    const sideValue = cells[4] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${context}: data non valida.`);
    if (team.trim() === "") throw new Error(`${context}: team mancante.`);
    if (sideValue !== "home" && sideValue !== "away") throw new Error(`${context}: side non valido.`);
    const metrics = metricRecord<number | null>((metric) => {
      const value = cells[DATASET_HEADER.indexOf(metric)] ?? "";
      if (value === "") return null;
      if (!/^\d+$/.test(value)) throw new Error(`${context}: ${metric} non valido.`);
      return Number(value);
    });
    const row: DatasetRow = { leagueId, matchId, date, team, side: sideValue, metrics };
    const key = `${leagueId}|${matchId}`;
    const group = grouped.get(key) ?? {};
    if (group[sideValue] !== undefined) throw new Error(`${context}: duplicato ${key}|${sideValue}.`);
    group[sideValue] = row;
    grouped.set(key, group);
  }
  const matches: MatchRows[] = [];
  for (const [key, group] of grouped) {
    if (group.home === undefined || group.away === undefined) {
      throw new Error(`dataset.csv: coppia home/away incompleta per ${key}.`);
    }
    matches.push({
      leagueId: group.home.leagueId,
      matchId: group.home.matchId,
      date: group.home.date,
      home: group.home,
      away: group.away,
    });
  }
  return matches.sort((a, b) => a.leagueId - b.leagueId || a.date.localeCompare(b.date) || a.matchId - b.matchId);
}

function parseEvent(value: unknown, context: string): NormalizedEvent {
  const root = requireRecord(value, context);
  return {
    eventId: requireInteger(root, "eventId", context),
    eventDate: requireString(root, "eventDate", context),
    date: requireString(root, "date", context),
    homeTeamId: nullableInteger(root, "homeTeamId", context),
    awayTeamId: nullableInteger(root, "awayTeamId", context),
    homeCoachId: nullableInteger(root, "homeCoachId", context),
    awayCoachId: nullableInteger(root, "awayCoachId", context),
  };
}

function parseEventContract(value: unknown, expectedLeagueId: number, expectedCohort: string, asOf: string): EventContract {
  const context = `events ${expectedLeagueId}/${expectedCohort}`;
  const root = requireRecord(value, context);
  const parsed: EventContract = {
    schemaVersion: requireInteger(root, "schemaVersion", context),
    contract: requireString(root, "contract", context),
    capturedAt: requireString(root, "capturedAt", context),
    asOf: requireString(root, "asOf", context),
    leagueId: requireInteger(root, "leagueId", context),
    league: requireString(root, "league", context),
    cohort: requireString(root, "cohort", context),
    events: requireArray(root.events, `${context}.events`).map((item, index) => parseEvent(item, `${context}.events[${index}]`)),
    completeTeamEvents: requireInteger(root, "completeTeamEvents", context),
    teamIdCoverage: nullableNumber(root, "teamIdCoverage", context),
  };
  if (parsed.contract !== "iqstats-context-events" || parsed.schemaVersion !== 1) throw new Error(`${context}: contratto inatteso.`);
  if (parsed.leagueId !== expectedLeagueId || parsed.cohort !== expectedCohort || parsed.asOf !== asOf) {
    throw new Error(`${context}: chiavi o asOf incoerenti.`);
  }
  return parsed;
}

function parseRoster(value: unknown, expectedTeamId: number, asOf: string): RosterContract {
  const context = `roster ${expectedTeamId}`;
  const root = requireRecord(value, context);
  const coverage = requireRecord(root.coverage, `${context}.coverage`);
  const parsed: RosterContract = {
    schemaVersion: requireInteger(root, "schemaVersion", context),
    contract: requireString(root, "contract", context),
    capturedAt: requireString(root, "capturedAt", context),
    asOf: requireString(root, "asOf", context),
    teamId: requireInteger(root, "teamId", context),
    players: requireArray(root.players, `${context}.players`).map((item, index) => {
      const player = requireRecord(item, `${context}.players[${index}]`);
      return {
        playerId: requireInteger(player, "playerId", `${context}.players[${index}]`),
        currentTeamId: nullableInteger(player, "currentTeamId", `${context}.players[${index}]`),
        marketValueEur: nullableNumber(player, "marketValueEur", `${context}.players[${index}]`),
      };
    }),
    coverage: {
      playerRows: requireInteger(coverage, "playerRows", `${context}.coverage`),
      marketValuePresent: requireInteger(coverage, "marketValuePresent", `${context}.coverage`),
      marketValueCoverage: nullableNumber(coverage, "marketValueCoverage", `${context}.coverage`),
      currentTeamIdPresent: requireInteger(coverage, "currentTeamIdPresent", `${context}.coverage`),
      currentTeamIdCoverage: nullableNumber(coverage, "currentTeamIdCoverage", `${context}.coverage`),
    },
  };
  if (parsed.schemaVersion !== 1 || parsed.contract !== "iqstats-current-roster-snapshot" || parsed.teamId !== expectedTeamId || parsed.asOf !== asOf) {
    throw new Error(`${context}: contratto, chiave o asOf inatteso.`);
  }
  return parsed;
}

function parseTransfer(value: unknown, expectedLeagueId: number, expectedTeamId: number, asOf: string): TransferContract {
  const context = `transfers ${expectedLeagueId}/${expectedTeamId}`;
  const root = requireRecord(value, context);
  const parsed: TransferContract = {
    schemaVersion: requireInteger(root, "schemaVersion", context),
    contract: requireString(root, "contract", context),
    capturedAt: requireString(root, "capturedAt", context),
    asOf: requireString(root, "asOf", context),
    leagueId: requireInteger(root, "leagueId", context),
    teamId: requireInteger(root, "teamId", context),
    requestStatus: requireString(root, "requestStatus", context),
    requestExclusionReason: nullableString(root, "requestExclusionReason", context),
    transfers: requireArray(root.transfers, `${context}.transfers`).map((item, index) => {
      const transfer = requireRecord(item, `${context}.transfers[${index}]`);
      return {
        transferId: requireInteger(transfer, "transferId", `${context}.transfers[${index}]`),
        playerId: nullableInteger(transfer, "playerId", `${context}.transfers[${index}]`),
        fromTeamId: nullableInteger(transfer, "fromTeamId", `${context}.transfers[${index}]`),
        toTeamId: nullableInteger(transfer, "toTeamId", `${context}.transfers[${index}]`),
        transferDate: nullableString(transfer, "transferDate", `${context}.transfers[${index}]`),
      };
    }),
  };
  if (parsed.schemaVersion !== 1 || parsed.contract !== "iqstats-transfer-window" || parsed.leagueId !== expectedLeagueId || parsed.teamId !== expectedTeamId || parsed.asOf !== asOf) {
    throw new Error(`${context}: contratto, chiavi o asOf inattesi.`);
  }
  return parsed;
}

function parseCoachObservation(value: unknown, context: string): CoachObservation | null {
  if (value === null) return null;
  const root = requireRecord(value, context);
  return {
    managerId: requireInteger(root, "managerId", context),
    eventId: requireInteger(root, "eventId", context),
    eventDate: requireString(root, "eventDate", context),
    selectionRule: requireString(root, "selectionRule", context),
  };
}

function parseTeamContext(value: unknown, expectedLeagueId: number, expectedTeamId: number, asOf: string): TeamContextContract {
  const context = `team context ${expectedLeagueId}/${expectedTeamId}`;
  const root = requireRecord(value, context);
  const eligibility = requireRecord(root.snapshotEligibility, `${context}.snapshotEligibility`);
  const status = requireString(eligibility, "status", `${context}.snapshotEligibility`);
  if (status !== "eligible" && status !== "excluded") throw new Error(`${context}: eligibility status non valido.`);
  const parsed: TeamContextContract = {
    schemaVersion: requireInteger(root, "schemaVersion", context),
    contract: requireString(root, "contract", context),
    generatedAt: requireString(root, "generatedAt", context),
    asOf: requireString(root, "asOf", context),
    leagueId: requireInteger(root, "leagueId", context),
    teamId: requireInteger(root, "teamId", context),
    snapshotEligibility: {
      status,
      signedDistanceDays: requireInteger(eligibility, "signedDistanceDays", `${context}.snapshotEligibility`),
      absoluteDistanceDays: requireInteger(eligibility, "absoluteDistanceDays", `${context}.snapshotEligibility`),
      rule: requireString(eligibility, "rule", `${context}.snapshotEligibility`),
      exclusionReason: nullableString(eligibility, "exclusionReason", `${context}.snapshotEligibility`),
    },
    calibrationLastCoach: parseCoachObservation(root.calibrationLastCoach, `${context}.calibrationLastCoach`),
    currentObservedCoach: parseCoachObservation(root.currentObservedCoach, `${context}.currentObservedCoach`),
  };
  if (parsed.schemaVersion !== 1 || parsed.contract !== "iqstats-team-context-index-input" || parsed.leagueId !== expectedLeagueId || parsed.teamId !== expectedTeamId || parsed.asOf !== asOf) {
    throw new Error(`${context}: contratto, chiavi o asOf inattesi.`);
  }
  return parsed;
}

function parsePlayerSnapshot(value: unknown, expectedPlayerId: number, asOf: string): PlayerSnapshot {
  const context = `player snapshot ${expectedPlayerId}`;
  const root = requireRecord(value, context);
  const parsed: PlayerSnapshot = {
    schemaVersion: requireInteger(root, "schemaVersion", context),
    contract: requireString(root, "contract", context),
    capturedAt: requireString(root, "capturedAt", context),
    asOf: requireString(root, "asOf", context),
    playerId: requireInteger(root, "playerId", context),
    availability: requireString(root, "availability", context),
    marketValueEur: nullableNumber(root, "marketValueEur", context),
  };
  if (parsed.schemaVersion !== 1 || parsed.contract !== "iqstats-current-player-value-snapshot" || parsed.playerId !== expectedPlayerId || parsed.asOf !== asOf) {
    throw new Error(`${context}: contratto, chiave o asOf inatteso.`);
  }
  return parsed;
}

function parseManagerSnapshot(value: unknown, expectedManagerId: number, asOf: string): ManagerSnapshot {
  const context = `manager snapshot ${expectedManagerId}`;
  const root = requireRecord(value, context);
  const parsed: ManagerSnapshot = {
    schemaVersion: requireInteger(root, "schemaVersion", context),
    contract: requireString(root, "contract", context),
    capturedAt: requireString(root, "capturedAt", context),
    asOf: requireString(root, "asOf", context),
    managerId: requireInteger(root, "managerId", context),
    availability: requireString(root, "availability", context),
    preferredFormation: nullableString(root, "preferredFormation", context),
    tacticalProfile: nullableString(root, "tacticalProfile", context),
  };
  if (parsed.schemaVersion !== 1 || parsed.contract !== "iqstats-current-manager-profile-snapshot" || parsed.managerId !== expectedManagerId || parsed.asOf !== asOf) {
    throw new Error(`${context}: contratto, chiave o asOf inatteso.`);
  }
  return parsed;
}

function parseBaselines(text: string): BaselineArtifact {
  const match = text.match(/export const LEAGUE_BASELINES = ([\s\S]+) as const;\s*$/);
  if (match?.[1] === undefined) throw new Error("LEAGUE_BASELINES.generated.ts: formato inatteso.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]) as unknown;
  } catch {
    throw new Error("LEAGUE_BASELINES.generated.ts: payload JSON non valido.");
  }
  const root = requireRecord(parsed, "LEAGUE_BASELINES");
  if (requireInteger(root, "schemaVersion", "LEAGUE_BASELINES") !== 1) throw new Error("LEAGUE_BASELINES: schemaVersion inatteso.");
  const leagues = requireRecord(root.leagues, "LEAGUE_BASELINES.leagues");
  for (const [key, value] of Object.entries(leagues)) {
    const league = requireRecord(value, `LEAGUE_BASELINES.leagues.${key}`);
    if (String(requireInteger(league, "leagueId", `LEAGUE_BASELINES.leagues.${key}`)) !== key) {
      throw new Error(`LEAGUE_BASELINES.leagues.${key}: chiave incoerente.`);
    }
  }
  return parsed as BaselineArtifact;
}

async function resolveSnapshot(asOf: string | null): Promise<{ asOf: string; directory: string; manifest: JsonRecord }> {
  const candidates = asOf === null
    ? (await readdir(CONTEXT_DATA_DIR, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .reverse()
    : [asOf];
  for (const candidate of candidates) {
    const directory = path.join(CONTEXT_DATA_DIR, candidate);
    try {
      const manifest = requireRecord(await readJsonUnknown(path.join(directory, "manifest.json")), `manifest ${candidate}`);
      if (manifest.status === "completed" && manifest.asOf === candidate) return { asOf: candidate, directory, manifest };
    } catch (error) {
      if (asOf !== null) throw error;
    }
  }
  throw new Error(asOf === null ? "Nessuno snapshot CAL-4B completato disponibile." : `Snapshot CAL-4B ${asOf} non completato.`);
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function descriptiveStats(values: number[]): DescriptiveStats {
  if (values.length === 0) return { n: 0, mean: null, sd: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) return { n: 1, mean: round(mean), sd: null };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { n: values.length, mean: round(mean), sd: round(Math.sqrt(variance)) };
}

async function buildHistoricalStarterEvidence(
  leagueId: number,
  events: NormalizedEvent[],
  selectedTeamIds: Set<number>,
): Promise<Map<number, HistoricalStarterEvidence>> {
  const accumulators = new Map<number, {
    totalMatches: number;
    coveredMatches: number;
    invalidPlayerEntries: number;
    appearances: Map<number, number>;
  }>();
  for (const teamId of selectedTeamIds) {
    accumulators.set(teamId, { totalMatches: 0, coveredMatches: 0, invalidPlayerEntries: 0, appearances: new Map() });
  }
  await Promise.all(events.map(async (event) => {
    const assignments: Array<{ teamId: number; side: Side }> = [];
    if (event.homeTeamId !== null && selectedTeamIds.has(event.homeTeamId)) assignments.push({ teamId: event.homeTeamId, side: "home" });
    if (event.awayTeamId !== null && selectedTeamIds.has(event.awayTeamId)) assignments.push({ teamId: event.awayTeamId, side: "away" });
    if (assignments.length === 0) return;
    for (const assignment of assignments) accumulators.get(assignment.teamId)!.totalMatches += 1;
    let raw: JsonRecord | null = null;
    try {
      raw = requireRecord(await readJsonUnknown(path.join(RAW_DATA_DIR, String(leagueId), `${event.eventId}.json`)), `raw ${leagueId}/${event.eventId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("ENOENT")) throw error;
    }
    if (raw === null) return;
    const averagePositions = isRecord(raw.average_positions) ? raw.average_positions : null;
    for (const assignment of assignments) {
      const accumulator = accumulators.get(assignment.teamId)!;
      const entries = averagePositions === null || !Array.isArray(averagePositions[assignment.side])
        ? null
        : averagePositions[assignment.side] as unknown[];
      if (entries === null) continue;
      const players = new Set<number>();
      for (const item of entries) {
        if (!isRecord(item) || typeof item.player_id !== "number" || !Number.isSafeInteger(item.player_id) || item.player_id <= 0) {
          accumulator.invalidPlayerEntries += 1;
          continue;
        }
        players.add(item.player_id);
      }
      if (players.size === 0) continue;
      accumulator.coveredMatches += 1;
      for (const playerId of players) {
        accumulator.appearances.set(playerId, (accumulator.appearances.get(playerId) ?? 0) + 1);
      }
    }
  }));
  const result = new Map<number, HistoricalStarterEvidence>();
  for (const [teamId, accumulator] of accumulators) {
    const appearances = [...accumulator.appearances.entries()]
      .map(([playerId, matches]) => ({ playerId, matches, share: accumulator.coveredMatches === 0 ? 0 : round(matches / accumulator.coveredMatches) }))
      .sort((a, b) => b.matches - a.matches || a.playerId - b.playerId);
    const starterPlayerIds = appearances
      .filter((entry) => entry.share >= STARTER_APPEARANCE_THRESHOLD)
      .map((entry) => entry.playerId)
      .sort((a, b) => a - b);
    result.set(teamId, {
      totalMatches: accumulator.totalMatches,
      coveredMatches: accumulator.coveredMatches,
      matchCoverage: rate(accumulator.coveredMatches, accumulator.totalMatches),
      invalidPlayerEntries: accumulator.invalidPlayerEntries,
      threshold: STARTER_APPEARANCE_THRESHOLD,
      minimumAppearances: accumulator.coveredMatches === 0 ? null : Math.ceil(STARTER_APPEARANCE_THRESHOLD * accumulator.coveredMatches),
      starterCount: starterPlayerIds.length,
      starterPlayerIds,
      appearances,
    });
  }
  return result;
}

function transferMovements(contract: TransferContract, teamId: number): { incoming: NormalizedTransfer[]; outgoing: NormalizedTransfer[] } {
  const unique = new Map<number, NormalizedTransfer>();
  for (const transfer of contract.transfers) unique.set(transfer.transferId, transfer);
  const incoming: NormalizedTransfer[] = [];
  const outgoing: NormalizedTransfer[] = [];
  for (const transfer of unique.values()) {
    if (transfer.toTeamId === teamId && transfer.fromTeamId !== teamId) incoming.push(transfer);
    if (transfer.fromTeamId === teamId && transfer.toTeamId !== teamId) outgoing.push(transfer);
  }
  return { incoming, outgoing };
}

function buildSquadStability(
  historical: HistoricalStarterEvidence,
  roster: RosterContract,
  transfers: TransferContract,
  playerValues: Map<number, number | null>,
  eligible: boolean,
): { coverageGate: CoverageGate; stability: SquadStability } {
  const movements = transferMovements(transfers, roster.teamId);
  const transferPlayerIds = new Set<number>();
  for (const movement of [...movements.incoming, ...movements.outgoing]) {
    if (movement.playerId !== null) transferPlayerIds.add(movement.playerId);
  }
  const transferPlayersWithValue = [...transferPlayerIds].filter((playerId) => playerValues.get(playerId) !== null && playerValues.get(playerId) !== undefined).length;
  const transferMarketValueCoverage = transferPlayerIds.size === 0 ? 1 : transferPlayersWithValue / transferPlayerIds.size;
  const failedRequirements: string[] = [];
  if (!eligible) failedRequirements.push("snapshot-outside-start-window");
  if (historical.matchCoverage === null || historical.matchCoverage < MINIMUM_COVERAGE) failedRequirements.push("historical-average-positions-coverage-below-80pct");
  if (roster.coverage.currentTeamIdCoverage === null || roster.coverage.currentTeamIdCoverage < MINIMUM_COVERAGE || roster.players.length === 0) failedRequirements.push("roster-coverage-below-80pct");
  if (roster.coverage.marketValueCoverage === null || roster.coverage.marketValueCoverage < MINIMUM_COVERAGE) failedRequirements.push("roster-market-value-coverage-below-80pct");
  if (transferMarketValueCoverage < MINIMUM_COVERAGE) failedRequirements.push("transfer-market-value-coverage-below-80pct");
  if (transfers.requestStatus !== "completed") failedRequirements.push("transfer-window-not-completed");
  if (historical.starterCount === 0) failedRequirements.push("historical-starters-unavailable");
  const coverageGate: CoverageGate = {
    historicalMatchCoverage: historical.matchCoverage,
    rosterCoverage: roster.coverage.currentTeamIdCoverage,
    rosterMarketValueCoverage: roster.coverage.marketValueCoverage,
    transferMarketValueCoverage,
    minimumRequired: MINIMUM_COVERAGE,
    passed: failedRequirements.length === 0,
    failedRequirements,
  };
  const knownRosterValues = roster.players
    .map((player) => player.marketValueEur)
    .filter((value): value is number => value !== null);
  const currentRosterKnownValueEur = knownRosterValues.length === 0 ? null : knownRosterValues.reduce((sum, value) => sum + value, 0);
  const sumMovementValues = (items: NormalizedTransfer[]): number | null => {
    const ids = new Set(items.map((item) => item.playerId).filter((id): id is number => id !== null));
    if (ids.size === 0) return 0;
    const values = [...ids].map((id) => playerValues.get(id)).filter((value): value is number => value !== null && value !== undefined);
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  };
  const incomingKnownValueEur = sumMovementValues(movements.incoming);
  const outgoingKnownValueEur = sumMovementValues(movements.outgoing);
  const starterSet = new Set(historical.starterPlayerIds);
  const outgoingHistoricalStarters = new Set(
    movements.outgoing.map((item) => item.playerId).filter((id): id is number => id !== null && starterSet.has(id)),
  ).size;
  let marketValueContinuity: number | null = null;
  let starterContinuity: number | null = null;
  let value: number | null = null;
  let unavailableReason: string | null = failedRequirements.length === 0 ? null : failedRequirements.join(";");
  if (coverageGate.passed) {
    if (currentRosterKnownValueEur === null || currentRosterKnownValueEur <= 0 || incomingKnownValueEur === null || outgoingKnownValueEur === null) {
      unavailableReason = "known-market-value-denominator-unavailable";
    } else {
      const incomingShare = incomingKnownValueEur / currentRosterKnownValueEur;
      const outgoingShare = outgoingKnownValueEur / currentRosterKnownValueEur;
      marketValueContinuity = clamp01(1 - (incomingShare + outgoingShare) / 2);
      const incomingPlayerCount = new Set(movements.incoming.map((item) => item.playerId).filter((id): id is number => id !== null)).size;
      const incomingReplacementShare = Math.min(incomingPlayerCount, historical.starterCount) / historical.starterCount;
      const outgoingStarterShare = outgoingHistoricalStarters / historical.starterCount;
      starterContinuity = clamp01(1 - (incomingReplacementShare + outgoingStarterShare) / 2);
      value = VALUE_WEIGHT * marketValueContinuity + STARTER_WEIGHT * starterContinuity;
    }
  }
  return {
    coverageGate,
    stability: {
      value: value === null ? null : round(value),
      unavailableReason,
      formulaVersion: FORMULA_VERSION,
      formula: "0.60*marketValueContinuity + 0.40*starterContinuity",
      marketValueContinuity: marketValueContinuity === null ? null : round(marketValueContinuity),
      starterContinuity: starterContinuity === null ? null : round(starterContinuity),
      currentRosterKnownValueEur,
      incomingKnownValueEur,
      outgoingKnownValueEur,
      incomingPlayers: new Set(movements.incoming.map((item) => item.playerId).filter((id): id is number => id !== null)).size,
      outgoingPlayers: new Set(movements.outgoing.map((item) => item.playerId).filter((id): id is number => id !== null)).size,
      outgoingHistoricalStarters,
      transferPlayersRequiringValue: transferPlayerIds.size,
      transferPlayersWithValue,
    },
  };
}

function normalizedLabel(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "" ? null : normalized;
}

function buildCoachContext(
  teamContext: TeamContextContract,
  managerSnapshots: Map<number, ManagerSnapshot>,
): CoachContext {
  const historical = teamContext.calibrationLastCoach;
  const current = teamContext.currentObservedCoach;
  const base = {
    historicalCoach: historical,
    currentCoach: current,
    distanceFormula: "0.50*formationMismatch + 0.50*tacticalProfileMismatch; shift if distance>=0.50",
  };
  if (historical === null || current === null) {
    const reason = historical === null ? "historical-coach-unavailable" : "current-coach-unavailable";
    return {
      ...base,
      coachChanged: null,
      coachChangedUnavailableReason: reason,
      historicalProfile: null,
      currentProfile: null,
      formationDistance: null,
      profileDistance: null,
      tacticalDistance: null,
      tacticalShift: null,
      tacticalShiftUnavailableReason: reason,
    };
  }
  const historicalSnapshot = managerSnapshots.get(historical.managerId) ?? null;
  const currentSnapshot = managerSnapshots.get(current.managerId) ?? null;
  const profileView = (snapshot: ManagerSnapshot | null) => snapshot === null ? null : ({
    availability: snapshot.availability,
    managerId: snapshot.managerId,
    preferredFormation: snapshot.preferredFormation,
    tacticalProfile: snapshot.tacticalProfile,
  });
  if (historical.managerId === current.managerId) {
    return {
      ...base,
      coachChanged: false,
      coachChangedUnavailableReason: null,
      historicalProfile: profileView(historicalSnapshot),
      currentProfile: profileView(currentSnapshot),
      formationDistance: 0,
      profileDistance: 0,
      tacticalDistance: 0,
      tacticalShift: false,
      tacticalShiftUnavailableReason: null,
    };
  }
  const historicalFormation = normalizedLabel(historicalSnapshot?.preferredFormation ?? null);
  const currentFormation = normalizedLabel(currentSnapshot?.preferredFormation ?? null);
  const historicalProfile = normalizedLabel(historicalSnapshot?.tacticalProfile ?? null);
  const currentProfile = normalizedLabel(currentSnapshot?.tacticalProfile ?? null);
  if (
    historicalSnapshot?.availability !== "available" || currentSnapshot?.availability !== "available" ||
    historicalFormation === null || currentFormation === null || historicalProfile === null || currentProfile === null
  ) {
    return {
      ...base,
      coachChanged: true,
      coachChangedUnavailableReason: null,
      historicalProfile: profileView(historicalSnapshot),
      currentProfile: profileView(currentSnapshot),
      formationDistance: null,
      profileDistance: null,
      tacticalDistance: null,
      tacticalShift: null,
      tacticalShiftUnavailableReason: "changed-coach-profile-or-formation-unavailable",
    };
  }
  const formationDistance = historicalFormation === currentFormation ? 0 : 1;
  const profileDistance = historicalProfile === currentProfile ? 0 : 1;
  const tacticalDistance = (formationDistance + profileDistance) / 2;
  return {
    ...base,
    coachChanged: true,
    coachChangedUnavailableReason: null,
    historicalProfile: profileView(historicalSnapshot),
    currentProfile: profileView(currentSnapshot),
    formationDistance,
    profileDistance,
    tacticalDistance,
    tacticalShift: tacticalDistance >= TACTICAL_SHIFT_DISTANCE_THRESHOLD,
    tacticalShiftUnavailableReason: null,
  };
}

function confidenceRecommendation(stability: SquadStability, coach: CoachContext): ConfidenceRecommendation {
  const reasons: string[] = [];
  if (stability.value === null) reasons.push("squad-stability-unavailable");
  else if (stability.value < LOW_STABILITY_THRESHOLD) reasons.push("squad-stability-below-0.70");
  if (coach.tacticalShift === null) reasons.push("tactical-shift-unavailable");
  else if (coach.tacticalShift) reasons.push("tactical-shift-detected");
  const regimeUncertain = reasons.length > 0;
  return {
    regimeUncertain,
    confidenceCap: regimeUncertain ? "medium" : null,
    widenNoBetZone: regimeUncertain,
    reasons,
    expectedAdjustmentAllowed: false,
  };
}

function teamIds(events: NormalizedEvent[]): Set<number> {
  const result = new Set<number>();
  for (const event of events) {
    if (event.homeTeamId !== null) result.add(event.homeTeamId);
    if (event.awayTeamId !== null) result.add(event.awayTeamId);
  }
  return result;
}

function buildPromotedBaseline(
  baseline: BaselineLeagueShape,
  previous: EventContract,
  calibration: EventContract,
  matches: MatchRows[],
): PromotedBaseline {
  const calibrationTeams = teamIds(calibration.events);
  const previousTeams = teamIds(previous.events);
  const teamIdOverlapCount = [...calibrationTeams].filter((teamId) => previousTeams.has(teamId)).length;
  const base = {
    identificationRule: "calibration team ID absent from previous cohort of the same league, after non-zero interseason team-ID overlap",
    previousTeamIdCoverage: previous.teamIdCoverage,
    calibrationTeamCount: calibrationTeams.size,
    previousTeamCount: previousTeams.size,
    teamIdOverlapCount,
    calibrationTeamOverlapCoverage: rate(teamIdOverlapCount, calibrationTeams.size),
  };
  if (previous.events.length === 0 || previous.teamIdCoverage === null || previous.teamIdCoverage < MINIMUM_COVERAGE) {
    return {
      ...base,
      status: "unavailable",
      unavailableReason: previous.events.length === 0 ? "previous-cohort-empty" : "previous-team-id-coverage-below-80pct",
      promotedTeamCount: 0,
      promotedTeamIds: [],
      matchesInvolvingPromoted: 0,
      metrics: {},
    };
  }
  if (teamIdOverlapCount === 0) {
    return {
      ...base,
      status: "unavailable",
      unavailableReason: "previous-calibration-team-id-overlap-zero",
      promotedTeamCount: 0,
      promotedTeamIds: [],
      matchesInvolvingPromoted: 0,
      metrics: {},
    };
  }
  const promotedTeamIds = [...calibrationTeams].filter((teamId) => !previousTeams.has(teamId)).sort((a, b) => a - b);
  if (promotedTeamIds.length === 0) {
    return {
      ...base,
      status: "unavailable",
      unavailableReason: "no-promoted-team-id-detected",
      promotedTeamCount: 0,
      promotedTeamIds: [],
      matchesInvolvingPromoted: 0,
      metrics: {},
    };
  }
  const promotedSet = new Set(promotedTeamIds);
  const eventsById = new Map(calibration.events.map((event) => [event.eventId, event]));
  const leagueMatches = matches.filter((match) => match.leagueId === baseline.leagueId);
  const linked = leagueMatches.map((match) => {
    const event = eventsById.get(match.matchId);
    if (event === undefined) throw new Error(`Lega ${baseline.leagueId}: match ${match.matchId} assente nel contratto CAL-4B.`);
    return { match, event };
  });
  const involvedMatches = new Set<number>();
  for (const item of linked) {
    if (
      (item.event.homeTeamId !== null && promotedSet.has(item.event.homeTeamId)) ||
      (item.event.awayTeamId !== null && promotedSet.has(item.event.awayTeamId))
    ) involvedMatches.add(item.match.matchId);
  }
  const metrics: Partial<Record<Metric, PromotedMetric>> = {};
  for (const metric of METRICS) {
    if (baseline.metrics[metric] === undefined) continue;
    const homeValues: number[] = [];
    const awayValues: number[] = [];
    const matchValues: number[] = [];
    let completeMatchesInvolvingPromoted = 0;
    for (const { match, event } of linked) {
      const homeValue = match.home.metrics[metric];
      const awayValue = match.away.metrics[metric];
      if (homeValue === null || awayValue === null) continue;
      const homePromoted = event.homeTeamId !== null && promotedSet.has(event.homeTeamId);
      const awayPromoted = event.awayTeamId !== null && promotedSet.has(event.awayTeamId);
      if (homePromoted) homeValues.push(homeValue);
      if (awayPromoted) awayValues.push(awayValue);
      if (homePromoted || awayPromoted) {
        completeMatchesInvolvingPromoted += 1;
        matchValues.push(homeValue + awayValue);
      }
    }
    const available = homeValues.length >= 2 && awayValues.length >= 2 && matchValues.length >= 2;
    metrics[metric] = {
      status: available ? "available" : "unavailable",
      unavailableReason: available ? null : "fewer-than-two-complete-observations-for-home-away-or-match",
      completeMatchesInvolvingPromoted,
      home: descriptiveStats(homeValues),
      away: descriptiveStats(awayValues),
      match: descriptiveStats(matchValues),
    };
  }
  const allAvailable = Object.values(metrics).every((metric) => metric?.status === "available");
  return {
    ...base,
    status: allAvailable ? "available" : "unavailable",
    unavailableReason: allAvailable ? null : "one-or-more-admitted-metrics-unavailable",
    promotedTeamCount: promotedTeamIds.length,
    promotedTeamIds,
    matchesInvolvingPromoted: involvedMatches.size,
    metrics,
  };
}

async function loadManagerSnapshots(directory: string, ids: Set<number>, asOf: string): Promise<Map<number, ManagerSnapshot>> {
  const result = new Map<number, ManagerSnapshot>();
  await Promise.all([...ids].map(async (id) => {
    const snapshot = parseManagerSnapshot(await readJsonUnknown(path.join(directory, "managers", `${id}.json`)), id, asOf);
    result.set(id, snapshot);
  }));
  return result;
}

async function loadGlobalPlayerValues(directory: string, asOf: string): Promise<Map<number, number | null>> {
  const result = new Map<number, number | null>();
  const merge = (playerId: number, value: number | null, source: string): void => {
    const existing = result.get(playerId);
    if (existing !== undefined && existing !== null && value !== null && existing !== value) {
      throw new Error(`Player ${playerId}: valori mercato conflittuali (${existing} vs ${value}) in ${source}.`);
    }
    if (!result.has(playerId) || (existing === null && value !== null)) result.set(playerId, value);
  };
  const rosterFiles = (await readdir(path.join(directory, "rosters"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+\.json$/.test(entry.name))
    .map((entry) => entry.name);
  await Promise.all(rosterFiles.map(async (fileName) => {
    const teamId = Number(fileName.slice(0, -5));
    const roster = parseRoster(await readJsonUnknown(path.join(directory, "rosters", fileName)), teamId, asOf);
    for (const player of roster.players) merge(player.playerId, player.marketValueEur, `roster ${teamId}`);
  }));
  const playerFiles = (await readdir(path.join(directory, "players"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+\.json$/.test(entry.name))
    .map((entry) => entry.name);
  await Promise.all(playerFiles.map(async (fileName) => {
    const playerId = Number(fileName.slice(0, -5));
    const snapshot = parsePlayerSnapshot(await readJsonUnknown(path.join(directory, "players", fileName)), playerId, asOf);
    merge(playerId, snapshot.availability === "available" ? snapshot.marketValueEur : null, `player snapshot ${playerId}`);
  }));
  return result;
}

async function buildTeamIndex(
  directory: string,
  asOf: string,
  leagueId: number,
  leagueName: string,
  teamId: number,
  historical: HistoricalStarterEvidence,
  globalPlayerValues: Map<number, number | null>,
): Promise<TeamContextIndex> {
  const [teamContext, roster, transfers] = await Promise.all([
    readJsonUnknown(path.join(directory, "team-context", String(leagueId), `${teamId}.json`)).then((value) => parseTeamContext(value, leagueId, teamId, asOf)),
    readJsonUnknown(path.join(directory, "rosters", `${teamId}.json`)).then((value) => parseRoster(value, teamId, asOf)),
    readJsonUnknown(path.join(directory, "transfers", String(leagueId), `${teamId}.json`)).then((value) => parseTransfer(value, leagueId, teamId, asOf)),
  ]);
  const managerIds = new Set<number>();
  if (teamContext.calibrationLastCoach !== null) managerIds.add(teamContext.calibrationLastCoach.managerId);
  if (teamContext.currentObservedCoach !== null) managerIds.add(teamContext.currentObservedCoach.managerId);
  const managerSnapshots = await loadManagerSnapshots(directory, managerIds, asOf);
  const { coverageGate, stability } = buildSquadStability(
    historical,
    roster,
    transfers,
    globalPlayerValues,
    teamContext.snapshotEligibility.status === "eligible",
  );
  const coach = buildCoachContext(teamContext, managerSnapshots);
  const recommendation = confidenceRecommendation(stability, coach);
  const missingReasons = [...coverageGate.failedRequirements];
  if (stability.unavailableReason !== null && coverageGate.failedRequirements.length === 0 && !missingReasons.includes(stability.unavailableReason)) missingReasons.push(stability.unavailableReason);
  if (coach.coachChangedUnavailableReason !== null) missingReasons.push(coach.coachChangedUnavailableReason);
  if (coach.tacticalShiftUnavailableReason !== null && !missingReasons.includes(coach.tacticalShiftUnavailableReason)) missingReasons.push(coach.tacticalShiftUnavailableReason);
  return {
    leagueId,
    league: leagueName,
    teamId,
    asOf,
    capturedAt: {
      roster: roster.capturedAt,
      transfers: transfers.capturedAt,
      historicalManager: teamContext.calibrationLastCoach === null ? null : managerSnapshots.get(teamContext.calibrationLastCoach.managerId)?.capturedAt ?? null,
      currentManager: teamContext.currentObservedCoach === null ? null : managerSnapshots.get(teamContext.currentObservedCoach.managerId)?.capturedAt ?? null,
    },
    snapshotEligibility: teamContext.snapshotEligibility,
    historicalStarters: historical,
    coverageGate,
    squadStability: stability,
    coach,
    confidenceRecommendation: recommendation,
    missingReasons: [...new Set(missingReasons)].sort(),
  };
}

function buildMarkdown(report: ContextReport): string {
  const lines = [
    "# CAL-4C — indici di contesto e baseline neopromosse",
    "",
    `Generato: ${report.generatedAt}`,
    `Snapshot: ${report.source.asOf}`,
    "",
    "> Questi indici possono modificare soltanto la raccomandazione di confidenza. `expectedAdjustmentAllowed` è `false` e l'integrazione nell'app richiede conferma umana.",
    "",
    "## Regole",
    "",
    `- Titolare storico: ${Math.round(STARTER_APPEARANCE_THRESHOLD * 100)}% dei match coperti da average_positions.`,
    `- Copertura minima: ${Math.round(MINIMUM_COVERAGE * 100)}% per match, rosa e valori richiesti.`,
    `- Stabilità: ${Math.round(VALUE_WEIGHT * 100)}% continuità valore + ${Math.round(STARTER_WEIGHT * 100)}% continuità titolari.`,
    "- Valore assente: null con motivo; nessuna imputazione a zero.",
    "- Neopromosse: team ID presenti nella calibrazione e assenti nella coorte precedente della stessa lega.",
    "",
    "## Riepilogo",
    "",
    `- Leghe: ${report.summary.leagues}`,
    `- Team: ${report.summary.teams}`,
    `- Squad stability disponibile: ${report.summary.squadStabilityAvailable}; non disponibile: ${report.summary.squadStabilityUnavailable}`,
    `- Cambi allenatore osservati: ${report.summary.coachChanged}; tactical shift rilevati: ${report.summary.tacticalShiftDetected}`,
    `- Regime incerto: ${report.summary.regimeUncertain}`,
    `- Baseline neopromosse disponibili: ${report.summary.promotedBaselinesAvailable}; non disponibili: ${report.summary.promotedBaselinesUnavailable}`,
    `- Team identificati come neopromossi: ${report.summary.promotedTeams}`,
    "",
    "## Copertura per lega",
    "",
    "| ID | Lega | Team | Stability | Coach change | Tactical shift | Regime incerto | Promoted | Team promoted |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
  ];
  for (const league of report.leagues) {
    lines.push(
      `| ${league.leagueId} | ${league.name.replaceAll("|", "\\|")} | ${league.teamCount} | ${league.teams.filter((team) => team.squadStability.value !== null).length} | ${league.teams.filter((team) => team.coach.coachChanged !== null).length} | ${league.teams.filter((team) => team.coach.tacticalShift !== null).length} | ${league.teams.filter((team) => team.confidenceRecommendation.regimeUncertain).length} | ${league.promoted.status} | ${league.promoted.promotedTeamCount} |`,
    );
  }
  lines.push("", "## Team con dati mancanti", "");
  const missing = report.leagues.flatMap((league) => league.teams).filter((team) => team.missingReasons.length > 0);
  if (missing.length === 0) lines.push("Nessuno.");
  else {
    lines.push("| Lega | Team ID | Motivi |", "| ---: | ---: | --- |");
    for (const team of missing) lines.push(`| ${team.leagueId} | ${team.teamId} | ${team.missingReasons.join(", ")} |`);
  }
  lines.push("", "## Gate", "", "Nessun output è autorizzato per l'integrazione nell'app prima della revisione umana post-CAL-4.", "");
  return `${lines.join("\n")}\n`;
}

function generatedTypeScript(name: string, value: unknown, note: string): string {
  return `// Generated by scripts/calibration/contextIndex.ts.\n// ${note}\n\nexport const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;
}

async function atomicWrite(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, "utf8");
  try {
    await rename(temporary, target);
  } catch (error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
    if (code === "EEXIST" || code === "EPERM") {
      const backup = `${target}.${process.pid}.${Date.now()}.bak`;
      try {
        await rename(target, backup);
        await rename(temporary, target);
        await rm(backup, { force: true });
        return;
      } catch (replacementError) {
        await rm(temporary, { force: true });
        try {
          await rename(backup, target);
        } catch {
          // Preserve the original replacement error when recovery is not possible.
        }
        throw replacementError;
      }
    }
    await rm(temporary, { force: true });
    throw error;
  }
}

function assertClose(actual: number, expected: number, context: string): void {
  if (Math.abs(actual - expected) > 1e-12) throw new Error(`${context}: atteso ${expected}, ottenuto ${actual}.`);
}

function runSelfTest(): void {
  const historical: HistoricalStarterEvidence = {
    totalMatches: 10,
    coveredMatches: 10,
    matchCoverage: 1,
    invalidPlayerEntries: 0,
    threshold: 0.6,
    minimumAppearances: 6,
    starterCount: 10,
    starterPlayerIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    appearances: [],
  };
  const roster: RosterContract = {
    schemaVersion: 1,
    contract: "iqstats-current-roster-snapshot",
    capturedAt: "test",
    asOf: "2026-07-23",
    teamId: 1,
    players: [{ playerId: 101, currentTeamId: 1, marketValueEur: 100 }],
    coverage: { playerRows: 1, marketValuePresent: 1, marketValueCoverage: 1, currentTeamIdPresent: 1, currentTeamIdCoverage: 1 },
  };
  const transfers: TransferContract = {
    schemaVersion: 1,
    contract: "iqstats-transfer-window",
    capturedAt: "test",
    asOf: "2026-07-23",
    leagueId: 1,
    teamId: 1,
    requestStatus: "completed",
    requestExclusionReason: null,
    transfers: [
      { transferId: 1, playerId: 1, fromTeamId: 1, toTeamId: 2, transferDate: "2026-07-01" },
      { transferId: 2, playerId: 20, fromTeamId: 2, toTeamId: 1, transferDate: "2026-07-01" },
    ],
  };
  const result = buildSquadStability(historical, roster, transfers, new Map([[1, 10], [20, 10]]), true);
  if (!result.coverageGate.passed || result.stability.value === null) throw new Error("Self-test stability non calcolata.");
  assertClose(result.stability.marketValueContinuity!, 0.9, "marketValueContinuity");
  assertClose(result.stability.starterContinuity!, 0.9, "starterContinuity");
  assertClose(result.stability.value, 0.9, "squadStability");
  const stats = descriptiveStats([1, 2, 3]);
  assertClose(stats.mean!, 2, "mean");
  assertClose(stats.sd!, 1, "sample sd");
  const sameCoach: TeamContextContract = {
    schemaVersion: 1,
    contract: "iqstats-team-context-index-input",
    generatedAt: "test",
    asOf: "2026-07-23",
    leagueId: 1,
    teamId: 1,
    snapshotEligibility: { status: "eligible", signedDistanceDays: 0, absoluteDistanceDays: 0, rule: "test", exclusionReason: null },
    calibrationLastCoach: { managerId: 1, eventId: 1, eventDate: "test", selectionRule: "test" },
    currentObservedCoach: { managerId: 1, eventId: 2, eventDate: "test", selectionRule: "test" },
  };
  const coach = buildCoachContext(sameCoach, new Map());
  if (coach.coachChanged !== false || coach.tacticalShift !== false || coach.tacticalDistance !== 0) {
    throw new Error("Self-test same-coach fallito.");
  }
  console.log("[CAL-4C] Self-test formule superato.");
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
  const snapshot = await resolveSnapshot(options.asOf);
  const manifest = snapshot.manifest;
  if (requireString(manifest, "contract", "manifest") !== "iqstats-context-harvest-manifest") throw new Error("Manifest CAL-4B inatteso.");
  const contextRunId = requireString(manifest, "runId", "manifest");
  const contextCompletedAt = requireString(manifest, "completedAt", "manifest");
  const [datasetText, baselineText] = await Promise.all([readFile(DATASET_PATH, "utf8"), readFile(BASELINES_PATH, "utf8")]);
  const matches = parseDataset(datasetText);
  const baselineArtifact = parseBaselines(baselineText);
  const globalPlayerValues = await loadGlobalPlayerValues(snapshot.directory, snapshot.asOf);
  if (baselineArtifact.aggregation !== "league-id-only") throw new Error("LEAGUE_BASELINES: aggregazione non separata per lega.");
  const allLeagueIds = Object.keys(baselineArtifact.leagues).map(Number).sort((a, b) => a - b);
  const selectedLeagueIds = options.leagueIds.size === 0 ? allLeagueIds : allLeagueIds.filter((id) => options.leagueIds.has(id));
  if (options.leagueIds.size > 0 && selectedLeagueIds.length !== options.leagueIds.size) throw new Error("Uno o più --league-id non hanno baseline CAL-3.");
  const reportLeagues: ContextReport["leagues"] = [];
  for (const leagueId of selectedLeagueIds) {
    const baseline = baselineArtifact.leagues[String(leagueId)];
    if (baseline === undefined) throw new Error(`Baseline lega ${leagueId} assente.`);
    const [previous, calibration] = await Promise.all([
      readJsonUnknown(path.join(snapshot.directory, "events", String(leagueId), "previous.json")).then((value) => parseEventContract(value, leagueId, "previous", snapshot.asOf)),
      readJsonUnknown(path.join(snapshot.directory, "events", String(leagueId), "calibration.json")).then((value) => parseEventContract(value, leagueId, "calibration", snapshot.asOf)),
    ]);
    const datasetMatchIds = new Set(matches.filter((match) => match.leagueId === leagueId).map((match) => match.matchId));
    const calibrationEventIds = new Set(calibration.events.map((event) => event.eventId));
    if (datasetMatchIds.size !== calibrationEventIds.size || [...datasetMatchIds].some((id) => !calibrationEventIds.has(id))) {
      throw new Error(`Lega ${leagueId}: match CAL-1 e coorte calibration CAL-4B non riconciliati.`);
    }
    let selectedTeamIds = [...teamIds(calibration.events)].sort((a, b) => a - b);
    if (options.maxTeamsPerLeague !== null) selectedTeamIds = selectedTeamIds.slice(0, options.maxTeamsPerLeague);
    const selectedTeamSet = new Set(selectedTeamIds);
    const historicalByTeam = await buildHistoricalStarterEvidence(leagueId, calibration.events, selectedTeamSet);
    const teams: TeamContextIndex[] = [];
    for (const teamId of selectedTeamIds) {
      const historical = historicalByTeam.get(teamId);
      if (historical === undefined) throw new Error(`Lega ${leagueId}, team ${teamId}: evidenza storica assente.`);
      teams.push(await buildTeamIndex(snapshot.directory, snapshot.asOf, leagueId, baseline.name, teamId, historical, globalPlayerValues));
    }
    const promoted = buildPromotedBaseline(baseline, previous, calibration, matches);
    reportLeagues.push({ leagueId, name: baseline.name, teamCount: teams.length, teams, promoted });
    console.log(`[CAL-4C] ${leagueId} ${baseline.name}: ${teams.length} team, stability ${teams.filter((team) => team.squadStability.value !== null).length}, promoted ${promoted.status}.`);
  }
  const allTeams = reportLeagues.flatMap((league) => league.teams);
  const generatedAt = new Date().toISOString();
  const report: ContextReport = {
    schemaVersion: 1,
    formulaVersion: FORMULA_VERSION,
    generatedAt,
    status: "completed",
    nextGate: "human-confirmation-required-before-app-integration",
    allowedForAppIntegration: false,
    expectedAdjustmentAllowed: false,
    source: {
      contextManifest: `scripts/calibration/context/data/${snapshot.asOf}/manifest.json`,
      contextRunId,
      contextCompletedAt,
      asOf: snapshot.asOf,
      dataset: "scripts/calibration/data/dataset.csv",
      rawMatchDirectory: "scripts/calibration/data/raw/{leagueId}/{matchId}.json",
      leagueBaselines: "scripts/calibration/output/LEAGUE_BASELINES.generated.ts",
      baselineGeneratedAt: baselineArtifact.generatedAt,
    },
    rules: {
      starterDefinition: "valid player_id in average_positions in at least 60% of covered historical team matches",
      minimumCoverage: MINIMUM_COVERAGE,
      squadStability: "0.60*marketValueContinuity + 0.40*starterContinuity",
      marketValueContinuity: "1 - mean(incomingKnownValue/currentRosterKnownValue, outgoingKnownValue/currentRosterKnownValue), clamped to [0,1]",
      starterContinuity: "1 - mean(min(incomingPlayers, historicalStarters)/historicalStarters, outgoingHistoricalStarters/historicalStarters), clamped to [0,1]",
      tacticalDistance: "0.50*exactFormationMismatch + 0.50*exactTacticalProfileMismatch",
      tacticalShiftThreshold: TACTICAL_SHIFT_DISTANCE_THRESHOLD,
      confidenceOnly: "context may cap confidence, flag uncertain regime and widen no-bet zone; it never changes expected values",
      missingValues: "null-with-reason-never-zero-or-imputed",
      promotedIdentification: "calibration team ID absent from previous cohort in the same league with >=80% previous team-ID coverage and non-zero interseason team-ID overlap",
      promotedSamples: "complete home/away metric pairs only; home/away observations apply to promoted side, match total counted once when either side is promoted",
    },
    scope: {
      mode: options.leagueIds.size === 0 && options.maxTeamsPerLeague === null ? "full" : "filtered",
      leagueIds: options.leagueIds.size === 0 ? null : selectedLeagueIds,
      maxTeamsPerLeague: options.maxTeamsPerLeague,
      writesEnabled: !options.noWrite,
    },
    summary: {
      leagues: reportLeagues.length,
      teams: allTeams.length,
      squadStabilityAvailable: allTeams.filter((team) => team.squadStability.value !== null).length,
      squadStabilityUnavailable: allTeams.filter((team) => team.squadStability.value === null).length,
      coachChangeAvailable: allTeams.filter((team) => team.coach.coachChanged !== null).length,
      coachChanged: allTeams.filter((team) => team.coach.coachChanged === true).length,
      tacticalShiftAvailable: allTeams.filter((team) => team.coach.tacticalShift !== null).length,
      tacticalShiftDetected: allTeams.filter((team) => team.coach.tacticalShift === true).length,
      regimeUncertain: allTeams.filter((team) => team.confidenceRecommendation.regimeUncertain).length,
      promotedBaselinesAvailable: reportLeagues.filter((league) => league.promoted.status === "available").length,
      promotedBaselinesUnavailable: reportLeagues.filter((league) => league.promoted.status === "unavailable").length,
      promotedTeams: reportLeagues.reduce((sum, league) => sum + league.promoted.promotedTeamCount, 0),
    },
    leagues: reportLeagues,
  };
  if (!options.quiet) {
    console.table(allTeams.map((team) => ({
      leagueId: team.leagueId,
      teamId: team.teamId,
      matchCoverage: team.historicalStarters.matchCoverage === null ? null : round(team.historicalStarters.matchCoverage, 3),
      stability: team.squadStability.value,
      coachChanged: team.coach.coachChanged,
      tacticalShift: team.coach.tacticalShift,
      regimeUncertain: team.confidenceRecommendation.regimeUncertain,
    })));
  }
  if (options.noWrite) {
    console.log(`[CAL-4C] Run senza scritture completato: ${report.summary.leagues} leghe, ${report.summary.teams} team.`);
    return;
  }
  if (report.scope.mode !== "full") throw new Error("Solo il run completo può scrivere output.");
  const squadContext = {
    schemaVersion: 1,
    formulaVersion: FORMULA_VERSION,
    generatedAt,
    asOf: snapshot.asOf,
    allowedForAppIntegration: false,
    expectedAdjustmentAllowed: false,
    nextGate: report.nextGate,
    leagues: Object.fromEntries(reportLeagues.map((league) => [String(league.leagueId), {
      leagueId: league.leagueId,
      name: league.name,
      teams: Object.fromEntries(league.teams.map((team) => [String(team.teamId), team])),
    }])),
  };
  baselineArtifact.contextEnrichment = {
    schemaVersion: 1,
    formulaVersion: FORMULA_VERSION,
    generatedAt,
    asOf: snapshot.asOf,
    expectedAdjustmentAllowed: false,
    allowedForAppIntegration: false,
  };
  for (const league of reportLeagues) baselineArtifact.leagues[String(league.leagueId)]!.promoted = league.promoted;
  await Promise.all([
    atomicWrite(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`),
    atomicWrite(REPORT_MARKDOWN_PATH, buildMarkdown(report)),
    atomicWrite(SQUAD_CONTEXT_PATH, generatedTypeScript("SQUAD_CONTEXT", squadContext, "Confidence-only context; expectedAdjustmentAllowed is always false.")),
    atomicWrite(BASELINES_PATH, generatedTypeScript("LEAGUE_BASELINES", baselineArtifact, "CAL-3 baselines enriched by CAL-4C with league-separated promoted-team evidence.")),
  ]);
  console.log(`[CAL-4C] Output scritti: ${report.summary.teams} team, ${report.summary.promotedBaselinesAvailable}/${report.summary.leagues} baseline promoted disponibili.`);
  console.log("[CAL-4C] Checkpoint umano richiesto prima di qualsiasi integrazione nell'app.");
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Errore sconosciuto.";
  console.error(`[CAL-4C] ${message}`);
  process.exitCode = 1;
});
