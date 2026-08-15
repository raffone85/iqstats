import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const REQUEST_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 4;
const PAGE_SIZE = 100;
const SNAPSHOT_START_DISTANCE_DAYS = 60;
const COHORTS = ["previous", "calibration", "current"] as const;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const CONTEXT_DATA_DIR = path.join(SCRIPT_DIR, "context", "data");
const DRY_RUN_MANIFEST_PATH = path.join(CONTEXT_DATA_DIR, "manifest.dry-run.json");
const CALIBRATION_REPORT_PATH = path.join(SCRIPT_DIR, "output", "CALIBRATION_REPORT.json");

type JsonRecord = Record<string, unknown>;
type Cohort = (typeof COHORTS)[number];
type RunMode = "help" | "dry-run" | "execute";
type Status = "pending" | "running" | "planned" | "completed" | "failed";

type CliOptions = {
  mode: RunMode;
  leagueIds: Set<number>;
  maxTeamsPerLeague: number | null;
  asOf: string;
};

type Season = {
  id: number;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
};

type League = {
  id: number;
  name: string;
  country: string;
  isWomen: boolean;
  isActive: boolean;
  currentSeason: Season | null;
};

type LeagueWithSeason = League & { currentSeason: Season };

type CalibrationLeague = {
  leagueId: number;
  name: string;
  country: string;
  dateFrom: string;
  dateTo: string;
  metrics: string[];
};

type DateWindow = {
  dateFrom: string;
  dateTo: string;
  status: "finished" | null;
  seasonId: number | null;
};

type LeaguePlan = {
  league: LeagueWithSeason;
  calibration: CalibrationLeague;
  windows: Record<Cohort, DateWindow>;
};

type NormalizedEvent = {
  eventId: number;
  eventDate: string;
  date: string;
  status: string;
  seasonId: number | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeCoachId: number | null;
  awayCoachId: number | null;
  missingFields: string[];
};

type EventContract = {
  schemaVersion: 1;
  contract: "iqstats-context-events";
  capturedAt: string;
  asOf: string;
  source: {
    resource: "events";
    filters: {
      leagueId: number;
      status: "finished" | null;
      dateFrom: string;
      dateTo: string;
    };
  };
  leagueId: number;
  league: string;
  cohort: Cohort;
  seasonWindow: DateWindow;
  providerCount: number;
  events: NormalizedEvent[];
  completeTeamEvents: number;
  teamIdCoverage: number | null;
  missingTeamAssignments: number;
  missingCoachAssignments: number;
};

type RosterPlayer = {
  playerId: number;
  currentTeamId: number | null;
  position: string | null;
  specificPosition: string | null;
  marketValueEur: number | null;
  contractUntil: string | null;
  missingFields: string[];
};

type RosterContract = {
  schemaVersion: 1;
  contract: "iqstats-current-roster-snapshot";
  capturedAt: string;
  asOf: string;
  source: { resource: "players"; filters: { teamId: number } };
  teamId: number;
  providerCount: number;
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
  playerId: number;
  fromTeamId: number | null;
  toTeamId: number | null;
  transferDate: string;
  feeEur: number | null;
  typeCode: number | string | null;
  missingFields: string[];
};

type TransferContract = {
  schemaVersion: 1;
  contract: "iqstats-transfer-window";
  capturedAt: string;
  asOf: string;
  source: {
    resource: "transfers";
    filters: { teamId: number; dateFrom: string; dateTo: string };
  };
  leagueId: number;
  teamId: number;
  window: { dateFrom: string; dateTo: string };
  requestStatus: "completed" | "not-requested";
  requestExclusionReason: string | null;
  providerCount: number;
  transfers: NormalizedTransfer[];
};

type PlayerSnapshotContract = {
  schemaVersion: 1;
  contract: "iqstats-current-player-value-snapshot";
  capturedAt: string;
  asOf: string;
  source: { resource: "player-detail"; playerId: number };
  playerId: number;
  availability: "available" | "not-found";
  unavailableReason: string | null;
  currentTeamId: number | null;
  position: string | null;
  specificPosition: string | null;
  marketValueEur: number | null;
  contractUntil: string | null;
  missingFields: string[];
};

type ManagerSnapshotContract = {
  schemaVersion: 1;
  contract: "iqstats-current-manager-profile-snapshot";
  capturedAt: string;
  asOf: string;
  source: { resource: "manager-detail"; managerId: number };
  managerId: number;
  availability: "available" | "not-found";
  unavailableReason: string | null;
  currentTeamId: number | null;
  preferredFormation: string | null;
  tacticalProfile: string | null;
  statsUpdatedAt: string | null;
  profileMetrics: {
    matchesTotal: number | null;
    winPct: number | null;
    avgPossession: number | null;
    avgGoalsScored: number | null;
    avgGoalsConceded: number | null;
  };
  missingFields: string[];
};

type CoachObservation = {
  managerId: number;
  eventId: number;
  eventDate: string;
  selectionRule: string;
};

type TeamContextContract = {
  schemaVersion: 1;
  contract: "iqstats-team-context-index-input";
  generatedAt: string;
  asOf: string;
  source: { resource: "derived-from-normalized-context-shards" };
  leagueId: number;
  teamId: number;
  currentSeasonStartDate: string;
  snapshotEligibility: {
    status: "eligible" | "excluded";
    signedDistanceDays: number;
    absoluteDistanceDays: number;
    rule: "absolute-distance-from-season-start<=60-days";
    exclusionReason: string | null;
  };
  calibrationLastCoach: CoachObservation | null;
  currentObservedCoach: CoachObservation | null;
  missingFields: string[];
  artifacts: {
    roster: string;
    transfers: string;
    calibrationEvents: string;
    currentEvents: string;
  };
};

type Page = {
  count: number;
  next: string | null;
  results: unknown[];
};

type CohortManifest = {
  cohort: Cohort;
  dateFrom: string;
  dateTo: string;
  statusFilter: "finished" | null;
  status: Status;
  providerCount: number | null;
  normalizedEvents: number;
  resumed: boolean;
  artifact: string;
  error?: string;
};

type LeagueManifest = {
  leagueId: number;
  name: string;
  country: string;
  currentSeasonId: number;
  currentSeasonStartDate: string;
  metricsWithBaseline: string[];
  cohorts: CohortManifest[];
  calibrationTeamCount: number | null;
  plannedTeamCount: number | null;
  status: Status;
  error?: string;
};

type TeamManifest = {
  leagueId: number;
  teamId: number;
  status: Status;
  rosterPlayers: number;
  transfers: number;
  rosterResumed: boolean;
  transfersResumed: boolean;
  contextArtifact: string;
  snapshotEligibility: "eligible" | "excluded" | null;
  error?: string;
};

type EntityManifest = {
  id: number;
  status: Status;
  resumed: boolean;
  availability: "available" | "not-found" | null;
  artifact: string;
  error?: string;
};

type Manifest = {
  schemaVersion: 1;
  contract: "iqstats-context-harvest-manifest";
  runId: string;
  mode: "dry-run" | "execute";
  status: "running" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  asOf: string;
  selection: {
    source: "CALIBRATION_REPORT leagues with at least one baseline";
    availableLeagueIds: number[];
    requestedLeagueIds: number[];
    selectedLeagueIds: number[];
    maxTeamsPerLeague: number | null;
  };
  requestPolicy: {
    serverSideOnly: true;
    minimumIntervalMs: number;
    maximumAttempts: number;
    pageSize: number;
    eventFilter: "league_id";
    teamFilter: "team_id";
    transferDateFilters: "date_from/date_to";
    rawPayloadPersistence: "forbidden";
  };
  pointInTimePolicy: {
    snapshotType: "current-capture-proxy-never-historical-value";
    startDistanceDays: number;
    eligibilityRule: "absolute-distance-from-season-start<=60-days";
    missingValues: "null-with-reason-never-zero";
  };
  outputs: {
    snapshotDirectory: string | null;
    manifest: string;
  };
  totals: {
    requestsStarted: number;
    leagues: number;
    eventCohorts: number;
    eventCohortsCompleted: number;
    eventCohortsResumed: number;
    normalizedEvents: number;
    teams: number;
    teamsCompleted: number;
    rostersResumed: number;
    transfersResumed: number;
    rosterPlayers: number;
    transfers: number;
    transferOnlyPlayerSnapshots: number;
    transferOnlyPlayerSnapshotsCompleted: number;
    transferOnlyPlayerSnapshotsResumed: number;
    prunedPlayerSnapshotFiles: number;
    managers: number;
    managersCompleted: number;
    managersResumed: number;
  };
  leagues: LeagueManifest[];
  teams: TeamManifest[];
  playerSnapshots: EntityManifest[];
  managers: EntityManifest[];
  error?: string;
};

function printUsage(): void {
  console.log(`CAL-4B — IQstatS point-in-time context dataset harvester

Usage:
  node --env-file=apps/web/.env.local --experimental-strip-types scripts/calibration/buildContextDataset.ts --dry-run [options]
  node --env-file=apps/web/.env.local --experimental-strip-types scripts/calibration/buildContextDataset.ts --execute [options]

Options:
  --dry-run                 Validate catalog, cohort windows and event counts only.
  --execute                 Harvest normalized, resumable context contracts.
  --league-id=<id>          Restrict to a baseline-bearing league; repeatable.
  --max-teams=<n>           Limit teams per league for a controlled smoke run.
  --as-of=YYYY-MM-DD        Snapshot date; defaults to today in Europe/Rome.
  --help                    Show this message.

Outputs:
  Dry-run: scripts/calibration/context/data/manifest.dry-run.json
  Execute: scripts/calibration/context/data/{asOf}/manifest.json and normalized shards

No raw provider payload, token or authorization header is persisted or printed.
`);
}

function todayInRome(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parsePositiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} deve essere un intero positivo.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} deve essere un intero positivo.`);
  }
  return parsed;
}

function parseCli(args: string[]): CliOptions {
  let mode: RunMode | null = null;
  const leagueIds = new Set<number>();
  let maxTeamsPerLeague: number | null = null;
  let asOf = todayInRome();
  for (const argument of args) {
    if (argument === "--help" || argument === "-h") {
      mode = "help";
    } else if (argument === "--dry-run" || argument === "--execute") {
      const nextMode: RunMode = argument === "--dry-run" ? "dry-run" : "execute";
      if (mode !== null && mode !== nextMode && mode !== "help") {
        throw new Error("Usare una sola modalità: --dry-run oppure --execute.");
      }
      mode = nextMode;
    } else if (argument.startsWith("--league-id=")) {
      leagueIds.add(
        parsePositiveInteger(argument.slice("--league-id=".length), "league-id"),
      );
    } else if (argument.startsWith("--max-teams=")) {
      maxTeamsPerLeague = parsePositiveInteger(
        argument.slice("--max-teams=".length),
        "max-teams",
      );
    } else if (argument.startsWith("--as-of=")) {
      asOf = argument.slice("--as-of=".length);
      if (!isDateOnly(asOf)) throw new Error("as-of deve usare il formato YYYY-MM-DD.");
    } else {
      throw new Error(`Argomento non riconosciuto: ${argument}.`);
    }
  }
  if (mode === null) throw new Error("Specificare --dry-run oppure --execute.");
  return { mode, leagueIds, maxTeamsPerLeague, asOf };
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

function optionalString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function requiredInteger(record: JsonRecord, key: string, context: string): number {
  const value = record[key];
  if (!Number.isSafeInteger(value)) throw new Error(`${context}.${key}: intero non valido.`);
  return value as number;
}

function optionalInteger(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function optionalNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalScalar(record: JsonRecord, key: string): number | string | null {
  const value = record[key];
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
    ? value
    : null;
}

function artifactPath(target: string): string {
  return path.relative(PROJECT_ROOT, target).replaceAll("\\", "/");
}

function shiftDate(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftYear(dateOnly: string, years: number): string {
  const [yearText, monthText, dayText] = dateOnly.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const shifted = new Date(Date.UTC(year + years, month - 1, day));
  if (shifted.getUTCMonth() !== month - 1) shifted.setUTCDate(0);
  return shifted.toISOString().slice(0, 10);
}

function signedDayDistance(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicWrite(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, "utf8");
  try {
    await rename(temporary, target);
  } catch (error) {
    if (isRecord(error) && (error.code === "EEXIST" || error.code === "EPERM")) {
      const backup = `${target}.${process.pid}.${Date.now()}.bak`;
      let backupCreated = false;
      try {
        await rename(target, backup);
        backupCreated = true;
        await rename(temporary, target);
        await rm(backup, { force: true });
        return;
      } catch (replacementError) {
        if (backupCreated && !(await pathExists(target))) {
          await rename(backup, target);
        } else if (backupCreated) {
          await rm(backup, { force: true });
        }
        await rm(temporary, { force: true });
        throw replacementError;
      }
    }
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await atomicWrite(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(target: string, context: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(target, "utf8")) as unknown;
  } catch {
    throw new Error(`${context}: JSON non leggibile.`);
  }
}

class ProviderClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private lastRequestStartedAt = 0;
  requestCount = 0;

  constructor() {
    const token = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
    if (!token) throw new Error("Configurazione provider server-side non disponibile.");
    const configuredBaseUrl =
      process.env.IQSTATS_PROVIDER_BASE_URL ??
      process.env.BSD_API_BASE_URL ??
      "https://sports.bzzoiro.com";
    try {
      this.baseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new Error("Base URL provider non valida.");
    }
    if (!/^https?:$/.test(this.baseUrl.protocol)) throw new Error("Base URL provider non valida.");
    this.token = token;
  }

  async getJson(target: string, allowNotFound = false): Promise<unknown | null> {
    const url = new URL(target, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new Error("La paginazione ha restituito un host non autorizzato.");
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.throttle();
      this.requestCount += 1;
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Token ${this.token}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return (await response.json()) as unknown;
        if (allowNotFound && response.status === 404) return null;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw new Error(`Richiesta esterna fallita con HTTP ${response.status}.`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Richiesta esterna")) {
          throw error;
        }
        if (attempt === MAX_ATTEMPTS) {
          throw new Error("Richiesta esterna fallita dopo i retry.");
        }
      }
      await delay(750 * 2 ** (attempt - 1));
    }
    throw new Error("Richiesta esterna non completata.");
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestStartedAt;
    if (elapsed < REQUEST_INTERVAL_MS) await delay(REQUEST_INTERVAL_MS - elapsed);
    this.lastRequestStartedAt = Date.now();
  }
}

function pageFromPayload(value: unknown, context: string): Page {
  const record = requiredRecord(value, context);
  if (!Array.isArray(record.results)) throw new Error(`${context}.results: array non valido.`);
  const count = requiredInteger(record, "count", context);
  const nextValue = record.next;
  if (nextValue !== null && typeof nextValue !== "string") {
    throw new Error(`${context}.next: valore non valido.`);
  }
  return { count, next: nextValue, results: record.results };
}

async function fetchAllPages(
  client: ProviderClient,
  initialPath: string,
  context: string,
): Promise<{ count: number; results: unknown[] }> {
  const results: unknown[] = [];
  const visited = new Set<string>();
  let next: string | null = initialPath;
  let expectedCount: number | null = null;
  while (next !== null) {
    if (visited.has(next)) throw new Error(`${context}: ciclo nella paginazione.`);
    visited.add(next);
    const payload = await client.getJson(next);
    if (payload === null) throw new Error(`${context}: payload inatteso non disponibile.`);
    const page = pageFromPayload(payload, context);
    expectedCount ??= page.count;
    if (page.count !== expectedCount) throw new Error(`${context}: count instabile tra pagine.`);
    results.push(...page.results);
    next = page.next;
  }
  if (expectedCount === null || results.length !== expectedCount) {
    throw new Error(`${context}: paginazione incompleta (${results.length}/${expectedCount ?? 0}).`);
  }
  return { count: expectedCount, results };
}

async function fetchCount(client: ProviderClient, target: string, context: string): Promise<number> {
  const payload = await client.getJson(target);
  if (payload === null) throw new Error(`${context}: payload inatteso non disponibile.`);
  return pageFromPayload(payload, context).count;
}

function parseLeague(value: unknown): League {
  const record = requiredRecord(value, "Catalogo leghe");
  const seasonValue = record.current_season;
  let currentSeason: Season | null = null;
  if (seasonValue !== null && seasonValue !== undefined) {
    const seasonRecord = requiredRecord(seasonValue, "Catalogo leghe.current_season");
    const startDate = requiredString(
      seasonRecord,
      "start_date",
      "Catalogo leghe.current_season",
    );
    const endDate = requiredString(seasonRecord, "end_date", "Catalogo leghe.current_season");
    if (!isDateOnly(startDate) || !isDateOnly(endDate)) {
      throw new Error("Catalogo leghe: date stagione non valide.");
    }
    currentSeason = {
      id: requiredInteger(seasonRecord, "id", "Catalogo leghe.current_season"),
      name: requiredString(seasonRecord, "name", "Catalogo leghe.current_season"),
      year: requiredInteger(seasonRecord, "year", "Catalogo leghe.current_season"),
      startDate,
      endDate,
    };
  }
  return {
    id: requiredInteger(record, "id", "Catalogo leghe"),
    name: requiredString(record, "name", "Catalogo leghe"),
    country: requiredString(record, "country", "Catalogo leghe"),
    isWomen: record.is_women === true,
    isActive: record.is_active === true,
    currentSeason,
  };
}

async function fetchLeagueCatalog(client: ProviderClient): Promise<League[]> {
  const page = await fetchAllPages(client, `/api/v2/leagues/?limit=${PAGE_SIZE}`, "Catalogo leghe");
  const leagues = page.results.map(parseLeague);
  const ids = new Set<number>();
  for (const league of leagues) {
    if (ids.has(league.id)) throw new Error(`Catalogo leghe: ID duplicato ${league.id}.`);
    ids.add(league.id);
  }
  return leagues;
}

async function readCalibrationLeagues(): Promise<CalibrationLeague[]> {
  const value = await readJson(CALIBRATION_REPORT_PATH, "CALIBRATION_REPORT");
  const root = requiredRecord(value, "CALIBRATION_REPORT");
  if (root.status !== "completed") throw new Error("CALIBRATION_REPORT: stato non completato.");
  if (!Array.isArray(root.leagues)) throw new Error("CALIBRATION_REPORT.leagues: array mancante.");
  const leagues: CalibrationLeague[] = [];
  for (const [index, leagueValue] of root.leagues.entries()) {
    const context = `CALIBRATION_REPORT.leagues[${index}]`;
    const league = requiredRecord(leagueValue, context);
    const metrics = requiredRecord(league.metrics, `${context}.metrics`);
    const metricNames = Object.keys(metrics);
    if (metricNames.length === 0) continue;
    const dateFrom = requiredString(league, "dateFrom", context);
    const dateTo = requiredString(league, "dateTo", context);
    if (!isDateOnly(dateFrom) || !isDateOnly(dateTo)) {
      throw new Error(`${context}: intervallo calibrazione non valido.`);
    }
    leagues.push({
      leagueId: requiredInteger(league, "leagueId", context),
      name: requiredString(league, "name", context),
      country: requiredString(league, "country", context),
      dateFrom,
      dateTo,
      metrics: metricNames.sort(),
    });
  }
  return leagues.sort((left, right) => left.leagueId - right.leagueId);
}

function selectPlans(
  catalog: League[],
  calibrationLeagues: CalibrationLeague[],
  options: CliOptions,
): LeaguePlan[] {
  const availableIds = new Set(calibrationLeagues.map((league) => league.leagueId));
  for (const requested of options.leagueIds) {
    if (!availableIds.has(requested)) {
      throw new Error(`La lega ${requested} non ha baseline CAL-3 ed è fuori scope CAL-4B.`);
    }
  }
  const catalogById = new Map(catalog.map((league) => [league.id, league]));
  const selectedCalibration = calibrationLeagues.filter(
    (league) => options.leagueIds.size === 0 || options.leagueIds.has(league.leagueId),
  );
  return selectedCalibration.map((calibration) => {
    const league = catalogById.get(calibration.leagueId);
    if (
      league === undefined ||
      !league.isActive ||
      league.isWomen ||
      league.currentSeason === null
    ) {
      throw new Error(`Catalogo: league_id ${calibration.leagueId} non disponibile come lega attiva maschile.`);
    }
    const selectedLeague: LeagueWithSeason = {
      ...league,
      currentSeason: league.currentSeason,
    };
    return {
      league: selectedLeague,
      calibration,
      windows: {
        previous: {
          dateFrom: shiftYear(calibration.dateFrom, -1),
          dateTo: shiftYear(calibration.dateTo, -1),
          status: "finished",
          seasonId: null,
        },
        calibration: {
          dateFrom: calibration.dateFrom,
          dateTo: calibration.dateTo,
          status: "finished",
          seasonId: null,
        },
        current: {
          dateFrom: selectedLeague.currentSeason.startDate,
          dateTo: selectedLeague.currentSeason.endDate,
          status: null,
          seasonId: selectedLeague.currentSeason.id,
        },
      },
    };
  });
}

function eventPath(leagueId: number, window: DateWindow, limit = PAGE_SIZE): string {
  const params = new URLSearchParams({
    league_id: String(leagueId),
    date_from: window.dateFrom,
    date_to: window.dateTo,
    limit: String(limit),
  });
  if (window.status !== null) params.set("status", window.status);
  return `/api/v2/events/?${params.toString()}`;
}

function normalizeStatus(value: unknown): string {
  if (typeof value === "string" && value !== "") return value;
  if (isRecord(value) && typeof value.name === "string" && value.name !== "") return value.name;
  return "unknown";
}

function parseEvent(value: unknown, leagueId: number, window: DateWindow): NormalizedEvent {
  const context = `Evento league_id=${leagueId}`;
  const record = requiredRecord(value, context);
  const observedLeagueId = requiredInteger(record, "league_id", context);
  if (observedLeagueId !== leagueId) throw new Error(`${context}: league_id incoerente.`);
  const eventDate = requiredString(record, "event_date", context);
  const date = eventDate.slice(0, 10);
  if (!isDateOnly(date) || date < window.dateFrom || date > window.dateTo) {
    throw new Error(`${context}: data evento fuori finestra.`);
  }
  const status = normalizeStatus(record.status);
  if (window.status === "finished" && status.toLowerCase() !== "finished") {
    throw new Error(`${context}: evento storico non finished.`);
  }
  const homeTeamId = optionalInteger(record, "home_team_id");
  const awayTeamId = optionalInteger(record, "away_team_id");
  const homeCoachId = optionalInteger(record, "home_coach_id");
  const awayCoachId = optionalInteger(record, "away_coach_id");
  const missingFields: string[] = [];
  if (homeTeamId === null) missingFields.push("homeTeamId");
  if (awayTeamId === null) missingFields.push("awayTeamId");
  if (homeCoachId === null) missingFields.push("homeCoachId");
  if (awayCoachId === null) missingFields.push("awayCoachId");
  return {
    eventId: requiredInteger(record, "id", context),
    eventDate,
    date,
    status,
    seasonId: optionalInteger(record, "season_id"),
    homeTeamId,
    awayTeamId,
    homeCoachId,
    awayCoachId,
    missingFields,
  };
}

function eventContractPath(snapshotRoot: string, leagueId: number, cohort: Cohort): string {
  return path.join(snapshotRoot, "events", String(leagueId), `${cohort}.json`);
}

function validateEventContract(
  value: unknown,
  plan: LeaguePlan,
  cohort: Cohort,
  asOf: string,
): EventContract {
  const record = requiredRecord(value, `${plan.league.name}/${cohort} event contract`);
  if (
    record.schemaVersion !== 1 ||
    record.contract !== "iqstats-context-events" ||
    record.asOf !== asOf ||
    record.leagueId !== plan.league.id ||
    record.cohort !== cohort ||
    !Array.isArray(record.events)
  ) {
    throw new Error(`${plan.league.name}/${cohort}: shard eventi esistente incompatibile.`);
  }
  return value as EventContract;
}

async function loadOrFetchEvents(
  client: ProviderClient,
  plan: LeaguePlan,
  cohort: Cohort,
  asOf: string,
  capturedAt: string,
  target: string,
): Promise<{ contract: EventContract; resumed: boolean }> {
  if (await pathExists(target)) {
    return {
      contract: validateEventContract(await readJson(target, "Shard eventi"), plan, cohort, asOf),
      resumed: true,
    };
  }
  const window = plan.windows[cohort];
  const page = await fetchAllPages(
    client,
    eventPath(plan.league.id, window),
    `${plan.league.name}/${cohort} eventi`,
  );
  const events = page.results.map((value) => parseEvent(value, plan.league.id, window));
  events.sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.eventId - right.eventId);
  const ids = new Set<number>();
  for (const event of events) {
    if (ids.has(event.eventId)) throw new Error(`${plan.league.name}/${cohort}: evento duplicato ${event.eventId}.`);
    ids.add(event.eventId);
  }
  const completeTeamEvents = events.filter(
    (event) => event.homeTeamId !== null && event.awayTeamId !== null,
  ).length;
  const contract: EventContract = {
    schemaVersion: 1,
    contract: "iqstats-context-events",
    capturedAt,
    asOf,
    source: {
      resource: "events",
      filters: {
        leagueId: plan.league.id,
        status: window.status,
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
      },
    },
    leagueId: plan.league.id,
    league: plan.league.name,
    cohort,
    seasonWindow: window,
    providerCount: page.count,
    events,
    completeTeamEvents,
    teamIdCoverage: events.length === 0 ? null : completeTeamEvents / events.length,
    missingTeamAssignments: events.reduce(
      (count, event) =>
        count + Number(event.homeTeamId === null) + Number(event.awayTeamId === null),
      0,
    ),
    missingCoachAssignments: events.reduce(
      (count, event) =>
        count + Number(event.homeCoachId === null) + Number(event.awayCoachId === null),
      0,
    ),
  };
  await writeJson(target, contract);
  return { contract, resumed: false };
}

function parseRosterPlayer(value: unknown, teamId: number): RosterPlayer {
  const context = `Rosa team_id=${teamId}`;
  const record = requiredRecord(value, context);
  const currentTeamId = optionalInteger(record, "current_team_id");
  const marketValueEur = optionalNumber(record, "market_value_eur");
  if (marketValueEur !== null && marketValueEur < 0) {
    throw new Error(`${context}: market_value_eur negativo.`);
  }
  const missingFields: string[] = [];
  if (currentTeamId === null) missingFields.push("currentTeamId");
  if (marketValueEur === null) missingFields.push("marketValueEur");
  return {
    playerId: requiredInteger(record, "id", context),
    currentTeamId,
    position: optionalString(record, "position"),
    specificPosition: optionalString(record, "specific_position"),
    marketValueEur,
    contractUntil: optionalString(record, "contract_until"),
    missingFields,
  };
}

function rosterPath(snapshotRoot: string, teamId: number): string {
  return path.join(snapshotRoot, "rosters", `${teamId}.json`);
}

function validateRosterContract(value: unknown, teamId: number, asOf: string): RosterContract {
  const record = requiredRecord(value, `Rosa team_id=${teamId}`);
  if (
    record.schemaVersion !== 1 ||
    record.contract !== "iqstats-current-roster-snapshot" ||
    record.asOf !== asOf ||
    record.teamId !== teamId ||
    !Array.isArray(record.players)
  ) {
    throw new Error(`Rosa team_id=${teamId}: shard esistente incompatibile.`);
  }
  return value as RosterContract;
}

async function loadOrFetchRoster(
  client: ProviderClient,
  teamId: number,
  asOf: string,
  capturedAt: string,
  target: string,
): Promise<{ contract: RosterContract; resumed: boolean }> {
  if (await pathExists(target)) {
    return {
      contract: validateRosterContract(await readJson(target, "Rosa"), teamId, asOf),
      resumed: true,
    };
  }
  const page = await fetchAllPages(
    client,
    `/api/v2/players/?team_id=${teamId}&limit=${PAGE_SIZE}`,
    `Rosa team_id=${teamId}`,
  );
  const players = page.results.map((value) => parseRosterPlayer(value, teamId));
  players.sort((left, right) => left.playerId - right.playerId);
  const ids = new Set<number>();
  for (const player of players) {
    if (ids.has(player.playerId)) throw new Error(`Rosa team_id=${teamId}: player duplicato.`);
    ids.add(player.playerId);
  }
  const marketValuePresent = players.filter((player) => player.marketValueEur !== null).length;
  const currentTeamIdPresent = players.filter((player) => player.currentTeamId !== null).length;
  const contract: RosterContract = {
    schemaVersion: 1,
    contract: "iqstats-current-roster-snapshot",
    capturedAt,
    asOf,
    source: { resource: "players", filters: { teamId } },
    teamId,
    providerCount: page.count,
    players,
    coverage: {
      playerRows: players.length,
      marketValuePresent,
      marketValueCoverage: players.length === 0 ? null : marketValuePresent / players.length,
      currentTeamIdPresent,
      currentTeamIdCoverage: players.length === 0 ? null : currentTeamIdPresent / players.length,
    },
  };
  await writeJson(target, contract);
  return { contract, resumed: false };
}

function parseTransfer(
  value: unknown,
  leagueId: number,
  teamId: number,
  dateFrom: string,
  dateTo: string,
): NormalizedTransfer {
  const context = `Trasferimenti league_id=${leagueId}, team_id=${teamId}`;
  const record = requiredRecord(value, context);
  const player = requiredRecord(record.player, `${context}.player`);
  const transferDate = requiredString(record, "transfer_date", context);
  if (!isDateOnly(transferDate) || transferDate < dateFrom || transferDate > dateTo) {
    throw new Error(`${context}: transfer_date fuori finestra.`);
  }
  const fromTeamId = optionalInteger(record, "from_team_id");
  const toTeamId = optionalInteger(record, "to_team_id");
  if (fromTeamId !== teamId && toTeamId !== teamId) {
    throw new Error(`${context}: trasferimento non collegato alla squadra filtrata.`);
  }
  const feeEur = optionalNumber(record, "fee_eur");
  if (feeEur !== null && feeEur < 0) throw new Error(`${context}: fee_eur negativa.`);
  const missingFields: string[] = [];
  if (fromTeamId === null) missingFields.push("fromTeamId");
  if (toTeamId === null) missingFields.push("toTeamId");
  if (feeEur === null) missingFields.push("feeEur");
  const typeCode = optionalScalar(record, "transfer_type");
  if (typeCode === null) missingFields.push("typeCode");
  return {
    transferId: requiredInteger(record, "id", context),
    playerId: requiredInteger(player, "id", `${context}.player`),
    fromTeamId,
    toTeamId,
    transferDate,
    feeEur,
    typeCode,
    missingFields,
  };
}

function transferPath(snapshotRoot: string, leagueId: number, teamId: number): string {
  return path.join(snapshotRoot, "transfers", String(leagueId), `${teamId}.json`);
}

function validateTransferContract(
  value: unknown,
  leagueId: number,
  teamId: number,
  asOf: string,
): TransferContract {
  const record = requiredRecord(value, `Trasferimenti ${leagueId}/${teamId}`);
  if (
    record.schemaVersion !== 1 ||
    record.contract !== "iqstats-transfer-window" ||
    record.asOf !== asOf ||
    record.leagueId !== leagueId ||
    record.teamId !== teamId ||
    !Array.isArray(record.transfers)
  ) {
    throw new Error(`Trasferimenti ${leagueId}/${teamId}: shard esistente incompatibile.`);
  }
  return value as TransferContract;
}

async function loadOrFetchTransfers(
  client: ProviderClient,
  leagueId: number,
  teamId: number,
  currentSeasonStartDate: string,
  asOf: string,
  capturedAt: string,
  target: string,
): Promise<{ contract: TransferContract; resumed: boolean }> {
  if (await pathExists(target)) {
    return {
      contract: validateTransferContract(
        await readJson(target, "Trasferimenti"),
        leagueId,
        teamId,
        asOf,
      ),
      resumed: true,
    };
  }
  const dateFrom = shiftDate(currentSeasonStartDate, -SNAPSHOT_START_DISTANCE_DAYS);
  const dateTo = asOf;
  let providerCount = 0;
  let transfers: NormalizedTransfer[] = [];
  let requestStatus: TransferContract["requestStatus"] = "completed";
  let requestExclusionReason: string | null = null;
  if (dateTo < dateFrom) {
    requestStatus = "not-requested";
    requestExclusionReason = "as-of-before-transfer-window";
  } else {
    const params = new URLSearchParams({
      team_id: String(teamId),
      date_from: dateFrom,
      date_to: dateTo,
      limit: String(PAGE_SIZE),
    });
    const page = await fetchAllPages(
      client,
      `/api/v2/transfers/?${params.toString()}`,
      `Trasferimenti league_id=${leagueId}, team_id=${teamId}`,
    );
    providerCount = page.count;
    transfers = page.results.map((value) =>
      parseTransfer(value, leagueId, teamId, dateFrom, dateTo),
    );
    transfers.sort(
      (left, right) =>
        left.transferDate.localeCompare(right.transferDate) || left.transferId - right.transferId,
    );
    const ids = new Set<number>();
    for (const transfer of transfers) {
      if (ids.has(transfer.transferId)) {
        throw new Error(`Trasferimenti ${leagueId}/${teamId}: ID duplicato.`);
      }
      ids.add(transfer.transferId);
    }
  }
  const contract: TransferContract = {
    schemaVersion: 1,
    contract: "iqstats-transfer-window",
    capturedAt,
    asOf,
    source: { resource: "transfers", filters: { teamId, dateFrom, dateTo } },
    leagueId,
    teamId,
    window: { dateFrom, dateTo },
    requestStatus,
    requestExclusionReason,
    providerCount,
    transfers,
  };
  await writeJson(target, contract);
  return { contract, resumed: false };
}

function parsePlayerSnapshot(
  value: unknown | null,
  playerId: number,
  asOf: string,
  capturedAt: string,
): PlayerSnapshotContract {
  if (value === null) {
    return {
      schemaVersion: 1,
      contract: "iqstats-current-player-value-snapshot",
      capturedAt,
      asOf,
      source: { resource: "player-detail", playerId },
      playerId,
      availability: "not-found",
      unavailableReason: "player-detail-not-found",
      currentTeamId: null,
      position: null,
      specificPosition: null,
      marketValueEur: null,
      contractUntil: null,
      missingFields: [
        "currentTeamId",
        "position",
        "specificPosition",
        "marketValueEur",
        "contractUntil",
      ],
    };
  }
  const context = `Player ${playerId}`;
  const record = requiredRecord(value, context);
  if (requiredInteger(record, "id", context) !== playerId) {
    throw new Error(`${context}: ID incoerente.`);
  }
  const marketValueEur = optionalNumber(record, "market_value_eur");
  if (marketValueEur !== null && marketValueEur < 0) throw new Error(`${context}: valore negativo.`);
  const currentTeamId = optionalInteger(record, "current_team_id");
  const position = optionalString(record, "position");
  const specificPosition = optionalString(record, "specific_position");
  const contractUntil = optionalString(record, "contract_until");
  const missingFields = [
    ["currentTeamId", currentTeamId],
    ["position", position],
    ["specificPosition", specificPosition],
    ["marketValueEur", marketValueEur],
    ["contractUntil", contractUntil],
  ].filter(([, field]) => field === null).map(([field]) => field as string);
  return {
    schemaVersion: 1,
    contract: "iqstats-current-player-value-snapshot",
    capturedAt,
    asOf,
    source: { resource: "player-detail", playerId },
    playerId,
    availability: "available",
    unavailableReason: null,
    currentTeamId,
    position,
    specificPosition,
    marketValueEur,
    contractUntil,
    missingFields,
  };
}

function playerSnapshotPath(snapshotRoot: string, playerId: number): string {
  return path.join(snapshotRoot, "players", `${playerId}.json`);
}

function validatePlayerSnapshot(
  value: unknown,
  playerId: number,
  asOf: string,
): PlayerSnapshotContract {
  const record = requiredRecord(value, `Player ${playerId}`);
  if (
    record.schemaVersion !== 1 ||
    record.contract !== "iqstats-current-player-value-snapshot" ||
    record.asOf !== asOf ||
    record.playerId !== playerId
  ) {
    throw new Error(`Player ${playerId}: shard esistente incompatibile.`);
  }
  return value as PlayerSnapshotContract;
}

async function loadOrFetchPlayerSnapshot(
  client: ProviderClient,
  playerId: number,
  asOf: string,
  capturedAt: string,
  target: string,
): Promise<{ contract: PlayerSnapshotContract; resumed: boolean }> {
  if (await pathExists(target)) {
    return {
      contract: validatePlayerSnapshot(await readJson(target, "Player"), playerId, asOf),
      resumed: true,
    };
  }
  const payload = await client.getJson(`/api/v2/players/${playerId}/`, true);
  const contract = parsePlayerSnapshot(payload, playerId, asOf, capturedAt);
  await writeJson(target, contract);
  return { contract, resumed: false };
}

function parseManagerSnapshot(
  value: unknown | null,
  managerId: number,
  asOf: string,
  capturedAt: string,
): ManagerSnapshotContract {
  if (value === null) {
    return {
      schemaVersion: 1,
      contract: "iqstats-current-manager-profile-snapshot",
      capturedAt,
      asOf,
      source: { resource: "manager-detail", managerId },
      managerId,
      availability: "not-found",
      unavailableReason: "manager-detail-not-found",
      currentTeamId: null,
      preferredFormation: null,
      tacticalProfile: null,
      statsUpdatedAt: null,
      profileMetrics: {
        matchesTotal: null,
        winPct: null,
        avgPossession: null,
        avgGoalsScored: null,
        avgGoalsConceded: null,
      },
      missingFields: [
        "currentTeamId",
        "preferredFormation",
        "tacticalProfile",
        "statsUpdatedAt",
      ],
    };
  }
  const context = `Manager ${managerId}`;
  const record = requiredRecord(value, context);
  if (requiredInteger(record, "id", context) !== managerId) {
    throw new Error(`${context}: ID incoerente.`);
  }
  const currentTeamId = optionalInteger(record, "current_team_id");
  const preferredFormation = optionalString(record, "preferred_formation");
  const tacticalProfile = optionalString(record, "tactical_profile");
  const statsUpdatedAt = optionalString(record, "stats_updated_at");
  const missingFields = [
    ["currentTeamId", currentTeamId],
    ["preferredFormation", preferredFormation],
    ["tacticalProfile", tacticalProfile],
    ["statsUpdatedAt", statsUpdatedAt],
  ].filter(([, field]) => field === null).map(([field]) => field as string);
  return {
    schemaVersion: 1,
    contract: "iqstats-current-manager-profile-snapshot",
    capturedAt,
    asOf,
    source: { resource: "manager-detail", managerId },
    managerId,
    availability: "available",
    unavailableReason: null,
    currentTeamId,
    preferredFormation,
    tacticalProfile,
    statsUpdatedAt,
    profileMetrics: {
      matchesTotal: optionalNumber(record, "matches_total"),
      winPct: optionalNumber(record, "win_pct"),
      avgPossession: optionalNumber(record, "avg_possession"),
      avgGoalsScored: optionalNumber(record, "avg_goals_scored"),
      avgGoalsConceded: optionalNumber(record, "avg_goals_conceded"),
    },
    missingFields,
  };
}

function managerSnapshotPath(snapshotRoot: string, managerId: number): string {
  return path.join(snapshotRoot, "managers", `${managerId}.json`);
}

function validateManagerSnapshot(
  value: unknown,
  managerId: number,
  asOf: string,
): ManagerSnapshotContract {
  const record = requiredRecord(value, `Manager ${managerId}`);
  if (
    record.schemaVersion !== 1 ||
    record.contract !== "iqstats-current-manager-profile-snapshot" ||
    record.asOf !== asOf ||
    record.managerId !== managerId
  ) {
    throw new Error(`Manager ${managerId}: shard esistente incompatibile.`);
  }
  return value as ManagerSnapshotContract;
}

async function loadOrFetchManagerSnapshot(
  client: ProviderClient,
  managerId: number,
  asOf: string,
  capturedAt: string,
  target: string,
): Promise<{ contract: ManagerSnapshotContract; resumed: boolean }> {
  if (await pathExists(target)) {
    return {
      contract: validateManagerSnapshot(await readJson(target, "Manager"), managerId, asOf),
      resumed: true,
    };
  }
  const payload = await client.getJson(`/api/v2/managers/${managerId}/`, true);
  const contract = parseManagerSnapshot(payload, managerId, asOf, capturedAt);
  await writeJson(target, contract);
  return { contract, resumed: false };
}

function teamIds(events: NormalizedEvent[]): number[] {
  const ids = events
    .flatMap((event) => [event.homeTeamId, event.awayTeamId])
    .filter((teamId): teamId is number => teamId !== null);
  return [...new Set(ids)].sort((left, right) => left - right);
}

function coachForTeam(event: NormalizedEvent, teamId: number): number | null {
  if (event.homeTeamId === teamId) return event.homeCoachId;
  if (event.awayTeamId === teamId) return event.awayCoachId;
  return null;
}

function lastHistoricalCoach(events: NormalizedEvent[], teamId: number): CoachObservation | null {
  const candidates = events
    .filter((event) => coachForTeam(event, teamId) !== null)
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate) || right.eventId - left.eventId);
  const event = candidates[0];
  if (event === undefined) return null;
  const managerId = coachForTeam(event, teamId);
  return managerId === null
    ? null
    : {
        managerId,
        eventId: event.eventId,
        eventDate: event.eventDate,
        selectionRule: "latest calibration-season event with non-null coach assignment",
      };
}

function currentObservedCoach(
  events: NormalizedEvent[],
  teamId: number,
  asOf: string,
): CoachObservation | null {
  const candidates = events.filter((event) => coachForTeam(event, teamId) !== null);
  const future = candidates
    .filter((event) => event.date >= asOf)
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.eventId - right.eventId);
  const past = candidates
    .filter((event) => event.date < asOf)
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate) || right.eventId - left.eventId);
  const event = future[0] ?? past[0];
  if (event === undefined) return null;
  const managerId = coachForTeam(event, teamId);
  return managerId === null
    ? null
    : {
        managerId,
        eventId: event.eventId,
        eventDate: event.eventDate,
        selectionRule:
          future.length > 0
            ? "earliest current-season event on or after asOf with non-null coach assignment"
            : "latest current-season event before asOf with non-null coach assignment",
      };
}

function teamContextPath(snapshotRoot: string, leagueId: number, teamId: number): string {
  return path.join(snapshotRoot, "team-context", String(leagueId), `${teamId}.json`);
}

function buildTeamContext(
  plan: LeaguePlan,
  teamId: number,
  calibrationEvents: EventContract,
  currentEvents: EventContract,
  asOf: string,
  generatedAt: string,
  snapshotRoot: string,
): TeamContextContract {
  const signedDistanceDays = signedDayDistance(plan.league.currentSeason.startDate, asOf);
  const absoluteDistanceDays = Math.abs(signedDistanceDays);
  const eligible = absoluteDistanceDays <= SNAPSHOT_START_DISTANCE_DAYS;
  const calibrationLastCoach = lastHistoricalCoach(calibrationEvents.events, teamId);
  const currentCoach = currentObservedCoach(currentEvents.events, teamId, asOf);
  const missingFields: string[] = [];
  if (calibrationLastCoach === null) missingFields.push("calibrationLastCoach");
  if (currentCoach === null) missingFields.push("currentObservedCoach");
  return {
    schemaVersion: 1,
    contract: "iqstats-team-context-index-input",
    generatedAt,
    asOf,
    source: { resource: "derived-from-normalized-context-shards" },
    leagueId: plan.league.id,
    teamId,
    currentSeasonStartDate: plan.league.currentSeason.startDate,
    snapshotEligibility: {
      status: eligible ? "eligible" : "excluded",
      signedDistanceDays,
      absoluteDistanceDays,
      rule: "absolute-distance-from-season-start<=60-days",
      exclusionReason: eligible
        ? null
        : signedDistanceDays < 0
          ? "snapshot-more-than-60-days-before-current-season-start"
          : "snapshot-more-than-60-days-after-current-season-start",
    },
    calibrationLastCoach,
    currentObservedCoach: currentCoach,
    missingFields,
    artifacts: {
      roster: artifactPath(rosterPath(snapshotRoot, teamId)),
      transfers: artifactPath(transferPath(snapshotRoot, plan.league.id, teamId)),
      calibrationEvents: artifactPath(
        eventContractPath(snapshotRoot, plan.league.id, "calibration"),
      ),
      currentEvents: artifactPath(eventContractPath(snapshotRoot, plan.league.id, "current")),
    },
  };
}

function createManifest(
  options: CliOptions & { mode: "dry-run" | "execute" },
  calibrationLeagues: CalibrationLeague[],
  plans: LeaguePlan[],
  manifestPath: string,
  snapshotRoot: string | null,
): Manifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    contract: "iqstats-context-harvest-manifest",
    runId: now.replaceAll(/[:.]/g, "-"),
    mode: options.mode,
    status: "running",
    startedAt: now,
    updatedAt: now,
    asOf: options.asOf,
    selection: {
      source: "CALIBRATION_REPORT leagues with at least one baseline",
      availableLeagueIds: calibrationLeagues.map((league) => league.leagueId),
      requestedLeagueIds: [...options.leagueIds].sort((left, right) => left - right),
      selectedLeagueIds: plans.map((plan) => plan.league.id),
      maxTeamsPerLeague: options.maxTeamsPerLeague,
    },
    requestPolicy: {
      serverSideOnly: true,
      minimumIntervalMs: REQUEST_INTERVAL_MS,
      maximumAttempts: MAX_ATTEMPTS,
      pageSize: PAGE_SIZE,
      eventFilter: "league_id",
      teamFilter: "team_id",
      transferDateFilters: "date_from/date_to",
      rawPayloadPersistence: "forbidden",
    },
    pointInTimePolicy: {
      snapshotType: "current-capture-proxy-never-historical-value",
      startDistanceDays: SNAPSHOT_START_DISTANCE_DAYS,
      eligibilityRule: "absolute-distance-from-season-start<=60-days",
      missingValues: "null-with-reason-never-zero",
    },
    outputs: {
      snapshotDirectory: snapshotRoot === null ? null : artifactPath(snapshotRoot),
      manifest: artifactPath(manifestPath),
    },
    totals: {
      requestsStarted: 0,
      leagues: plans.length,
      eventCohorts: plans.length * COHORTS.length,
      eventCohortsCompleted: 0,
      eventCohortsResumed: 0,
      normalizedEvents: 0,
      teams: 0,
      teamsCompleted: 0,
      rostersResumed: 0,
      transfersResumed: 0,
      rosterPlayers: 0,
      transfers: 0,
      transferOnlyPlayerSnapshots: 0,
      transferOnlyPlayerSnapshotsCompleted: 0,
      transferOnlyPlayerSnapshotsResumed: 0,
      prunedPlayerSnapshotFiles: 0,
      managers: 0,
      managersCompleted: 0,
      managersResumed: 0,
    },
    leagues: plans.map((plan) => ({
      leagueId: plan.league.id,
      name: plan.league.name,
      country: plan.league.country,
      currentSeasonId: plan.league.currentSeason.id,
      currentSeasonStartDate: plan.league.currentSeason.startDate,
      metricsWithBaseline: plan.calibration.metrics,
      cohorts: COHORTS.map((cohort) => ({
        cohort,
        dateFrom: plan.windows[cohort].dateFrom,
        dateTo: plan.windows[cohort].dateTo,
        statusFilter: plan.windows[cohort].status,
        status: "pending",
        providerCount: null,
        normalizedEvents: 0,
        resumed: false,
        artifact:
          snapshotRoot === null
            ? "not-written-in-dry-run"
            : artifactPath(eventContractPath(snapshotRoot, plan.league.id, cohort)),
      })),
      calibrationTeamCount: null,
      plannedTeamCount: null,
      status: "pending",
    })),
    teams: [],
    playerSnapshots: [],
    managers: [],
  };
}

function refreshManifest(manifest: Manifest, client: ProviderClient): void {
  manifest.updatedAt = new Date().toISOString();
  manifest.totals.requestsStarted = client.requestCount;
  manifest.totals.eventCohortsCompleted = manifest.leagues.reduce(
    (count, league) => count + league.cohorts.filter((cohort) => cohort.status === "completed").length,
    0,
  );
  manifest.totals.eventCohortsResumed = manifest.leagues.reduce(
    (count, league) => count + league.cohorts.filter((cohort) => cohort.resumed).length,
    0,
  );
  manifest.totals.normalizedEvents = manifest.leagues.reduce(
    (count, league) =>
      count + league.cohorts.reduce((subtotal, cohort) => subtotal + cohort.normalizedEvents, 0),
    0,
  );
  manifest.totals.teams = manifest.teams.length;
  manifest.totals.teamsCompleted = manifest.teams.filter((team) => team.status === "completed").length;
  manifest.totals.rostersResumed = manifest.teams.filter((team) => team.rosterResumed).length;
  manifest.totals.transfersResumed = manifest.teams.filter((team) => team.transfersResumed).length;
  manifest.totals.rosterPlayers = manifest.teams.reduce((count, team) => count + team.rosterPlayers, 0);
  manifest.totals.transfers = manifest.teams.reduce((count, team) => count + team.transfers, 0);
  manifest.totals.transferOnlyPlayerSnapshots = manifest.playerSnapshots.length;
  manifest.totals.transferOnlyPlayerSnapshotsCompleted = manifest.playerSnapshots.filter(
    (item) => item.status === "completed",
  ).length;
  manifest.totals.transferOnlyPlayerSnapshotsResumed = manifest.playerSnapshots.filter(
    (item) => item.resumed,
  ).length;
  manifest.totals.managers = manifest.managers.length;
  manifest.totals.managersCompleted = manifest.managers.filter(
    (item) => item.status === "completed",
  ).length;
  manifest.totals.managersResumed = manifest.managers.filter((item) => item.resumed).length;
}

async function persistManifest(
  manifestPath: string,
  manifest: Manifest,
  client: ProviderClient,
): Promise<void> {
  refreshManifest(manifest, client);
  await writeJson(manifestPath, manifest);
}

async function pruneUnreferencedPlayerSnapshots(
  snapshotRoot: string,
  expectedPlayerIds: Set<number>,
): Promise<number> {
  const directory = path.join(snapshotRoot, "players");
  if (!(await pathExists(directory))) return 0;
  let pruned = 0;
  for (const name of await readdir(directory)) {
    const match = /^(\d+)\.json$/.exec(name);
    if (match === null) {
      throw new Error(`Directory player snapshot: file inatteso ${name}.`);
    }
    const playerId = Number(match[1]);
    if (!Number.isSafeInteger(playerId) || playerId <= 0) {
      throw new Error(`Directory player snapshot: ID non valido in ${name}.`);
    }
    if (!expectedPlayerIds.has(playerId)) {
      const target = path.resolve(directory, name);
      if (path.dirname(target) !== path.resolve(directory)) {
        throw new Error("Directory player snapshot: target di pulizia non sicuro.");
      }
      await rm(target);
      pruned += 1;
    }
  }
  return pruned;
}

async function runDry(
  client: ProviderClient,
  plans: LeaguePlan[],
  manifest: Manifest,
  manifestPath: string,
): Promise<void> {
  for (const plan of plans) {
    const leagueManifest = manifest.leagues.find((item) => item.leagueId === plan.league.id);
    if (leagueManifest === undefined) throw new Error("Manifest lega mancante.");
    leagueManifest.status = "running";
    for (const cohort of COHORTS) {
      const cohortManifest = leagueManifest.cohorts.find((item) => item.cohort === cohort);
      if (cohortManifest === undefined) throw new Error("Manifest coorte mancante.");
      cohortManifest.status = "running";
      await persistManifest(manifestPath, manifest, client);
      const count = await fetchCount(
        client,
        eventPath(plan.league.id, plan.windows[cohort], 1),
        `${plan.league.name}/${cohort} preview`,
      );
      cohortManifest.providerCount = count;
      cohortManifest.status = "planned";
      console.log(`[CAL-4B] ${plan.league.id} ${cohort}: ${count} eventi pianificati.`);
    }
    leagueManifest.status = "planned";
    await persistManifest(manifestPath, manifest, client);
  }
}

async function runExecute(
  client: ProviderClient,
  plans: LeaguePlan[],
  options: CliOptions,
  manifest: Manifest,
  manifestPath: string,
  snapshotRoot: string,
): Promise<void> {
  const eventContracts = new Map<string, EventContract>();
  for (const plan of plans) {
    const leagueManifest = manifest.leagues.find((item) => item.leagueId === plan.league.id);
    if (leagueManifest === undefined) throw new Error("Manifest lega mancante.");
    leagueManifest.status = "running";
    for (const cohort of COHORTS) {
      const cohortManifest = leagueManifest.cohorts.find((item) => item.cohort === cohort);
      if (cohortManifest === undefined) throw new Error("Manifest coorte mancante.");
      cohortManifest.status = "running";
      await persistManifest(manifestPath, manifest, client);
      const target = eventContractPath(snapshotRoot, plan.league.id, cohort);
      const result = await loadOrFetchEvents(
        client,
        plan,
        cohort,
        options.asOf,
        new Date().toISOString(),
        target,
      );
      eventContracts.set(`${plan.league.id}|${cohort}`, result.contract);
      cohortManifest.providerCount = result.contract.providerCount;
      cohortManifest.normalizedEvents = result.contract.events.length;
      cohortManifest.resumed = result.resumed;
      cohortManifest.status = "completed";
      await persistManifest(manifestPath, manifest, client);
    }
  }

  const rosterCache = new Map<number, { contract: RosterContract; resumed: boolean }>();
  const rosterPlayerIds = new Set<number>();
  const transferPlayerIds = new Set<number>();
  const managerIds = new Set<number>();

  for (const plan of plans) {
    const calibrationEvents = eventContracts.get(`${plan.league.id}|calibration`);
    const currentEvents = eventContracts.get(`${plan.league.id}|current`);
    if (calibrationEvents === undefined || currentEvents === undefined) {
      throw new Error(`${plan.league.name}: coorti necessarie mancanti.`);
    }
    const allTeamIds = teamIds(calibrationEvents.events);
    const selectedTeamIds =
      options.maxTeamsPerLeague === null
        ? allTeamIds
        : allTeamIds.slice(0, options.maxTeamsPerLeague);
    const leagueManifest = manifest.leagues.find((item) => item.leagueId === plan.league.id);
    if (leagueManifest === undefined) throw new Error("Manifest lega mancante.");
    leagueManifest.calibrationTeamCount = allTeamIds.length;
    leagueManifest.plannedTeamCount = selectedTeamIds.length;

    for (const teamId of selectedTeamIds) {
      const contextTarget = teamContextPath(snapshotRoot, plan.league.id, teamId);
      const teamManifest: TeamManifest = {
        leagueId: plan.league.id,
        teamId,
        status: "running",
        rosterPlayers: 0,
        transfers: 0,
        rosterResumed: false,
        transfersResumed: false,
        contextArtifact: artifactPath(contextTarget),
        snapshotEligibility: null,
      };
      manifest.teams.push(teamManifest);
      await persistManifest(manifestPath, manifest, client);
      try {
        let rosterResult = rosterCache.get(teamId);
        if (rosterResult === undefined) {
          rosterResult = await loadOrFetchRoster(
            client,
            teamId,
            options.asOf,
            new Date().toISOString(),
            rosterPath(snapshotRoot, teamId),
          );
          rosterCache.set(teamId, rosterResult);
        } else {
          rosterResult = { contract: rosterResult.contract, resumed: true };
        }
        const transferResult = await loadOrFetchTransfers(
          client,
          plan.league.id,
          teamId,
          plan.league.currentSeason.startDate,
          options.asOf,
          new Date().toISOString(),
          transferPath(snapshotRoot, plan.league.id, teamId),
        );
        const teamContext = buildTeamContext(
          plan,
          teamId,
          calibrationEvents,
          currentEvents,
          options.asOf,
          new Date().toISOString(),
          snapshotRoot,
        );
        await writeJson(contextTarget, teamContext);
        for (const player of rosterResult.contract.players) rosterPlayerIds.add(player.playerId);
        for (const transfer of transferResult.contract.transfers) {
          transferPlayerIds.add(transfer.playerId);
        }
        if (teamContext.calibrationLastCoach !== null) {
          managerIds.add(teamContext.calibrationLastCoach.managerId);
        }
        if (teamContext.currentObservedCoach !== null) {
          managerIds.add(teamContext.currentObservedCoach.managerId);
        }
        teamManifest.rosterPlayers = rosterResult.contract.players.length;
        teamManifest.transfers = transferResult.contract.transfers.length;
        teamManifest.rosterResumed = rosterResult.resumed;
        teamManifest.transfersResumed = transferResult.resumed;
        teamManifest.snapshotEligibility = teamContext.snapshotEligibility.status;
        teamManifest.status = "completed";
        await persistManifest(manifestPath, manifest, client);
      } catch (error) {
        teamManifest.status = "failed";
        teamManifest.error = error instanceof Error ? error.message : "Errore sconosciuto.";
        await persistManifest(manifestPath, manifest, client);
        throw error;
      }
    }
    leagueManifest.status = "completed";
    await persistManifest(manifestPath, manifest, client);
    console.log(
      `[CAL-4B] ${plan.league.id} ${plan.league.name}: ${selectedTeamIds.length}/${allTeamIds.length} team processati.`,
    );
  }

  const transferOnlyPlayerIds = [...transferPlayerIds]
    .filter((playerId) => !rosterPlayerIds.has(playerId))
    .sort((left, right) => left - right);
  manifest.playerSnapshots = transferOnlyPlayerIds.map((playerId) => ({
    id: playerId,
    status: "pending",
    resumed: false,
    availability: null,
    artifact: artifactPath(playerSnapshotPath(snapshotRoot, playerId)),
  }));
  if (options.leagueIds.size === 0 && options.maxTeamsPerLeague === null) {
    manifest.totals.prunedPlayerSnapshotFiles = await pruneUnreferencedPlayerSnapshots(
      snapshotRoot,
      new Set(transferOnlyPlayerIds),
    );
  }
  await persistManifest(manifestPath, manifest, client);
  for (const [index, item] of manifest.playerSnapshots.entries()) {
    item.status = "running";
    try {
      const result = await loadOrFetchPlayerSnapshot(
        client,
        item.id,
        options.asOf,
        new Date().toISOString(),
        playerSnapshotPath(snapshotRoot, item.id),
      );
      item.resumed = result.resumed;
      item.availability = result.contract.availability;
      item.status = "completed";
      if ((index + 1) % 10 === 0 || index === manifest.playerSnapshots.length - 1) {
        await persistManifest(manifestPath, manifest, client);
      }
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : "Errore sconosciuto.";
      await persistManifest(manifestPath, manifest, client);
      throw error;
    }
  }

  manifest.managers = [...managerIds]
    .sort((left, right) => left - right)
    .map((managerId) => ({
      id: managerId,
      status: "pending",
      resumed: false,
      availability: null,
      artifact: artifactPath(managerSnapshotPath(snapshotRoot, managerId)),
    }));
  await persistManifest(manifestPath, manifest, client);
  for (const [index, item] of manifest.managers.entries()) {
    item.status = "running";
    try {
      const result = await loadOrFetchManagerSnapshot(
        client,
        item.id,
        options.asOf,
        new Date().toISOString(),
        managerSnapshotPath(snapshotRoot, item.id),
      );
      item.resumed = result.resumed;
      item.availability = result.contract.availability;
      item.status = "completed";
      if ((index + 1) % 10 === 0 || index === manifest.managers.length - 1) {
        await persistManifest(manifestPath, manifest, client);
      }
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : "Errore sconosciuto.";
      await persistManifest(manifestPath, manifest, client);
      throw error;
    }
  }
}

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.mode === "help") {
    printUsage();
    return;
  }
  const calibrationLeagues = await readCalibrationLeagues();
  const client = new ProviderClient();
  const catalog = await fetchLeagueCatalog(client);
  const plans = selectPlans(catalog, calibrationLeagues, options);
  const snapshotRoot =
    options.mode === "execute" ? path.join(CONTEXT_DATA_DIR, options.asOf) : null;
  const manifestPath =
    options.mode === "execute"
      ? path.join(snapshotRoot as string, "manifest.json")
      : DRY_RUN_MANIFEST_PATH;
  const manifest = createManifest(
    { ...options, mode: options.mode },
    calibrationLeagues,
    plans,
    manifestPath,
    snapshotRoot,
  );
  await persistManifest(manifestPath, manifest, client);
  try {
    if (options.mode === "dry-run") {
      await runDry(client, plans, manifest, manifestPath);
    } else {
      await runExecute(
        client,
        plans,
        options,
        manifest,
        manifestPath,
        snapshotRoot as string,
      );
    }
    manifest.status = "completed";
    manifest.completedAt = new Date().toISOString();
    await persistManifest(manifestPath, manifest, client);
    console.log(
      `[CAL-4B] ${options.mode} completato: ${plans.length} leghe, ${manifest.totals.requestsStarted} richieste, ${manifest.totals.teamsCompleted} team.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto.";
    manifest.status = "failed";
    manifest.error = message;
    const activeLeague = manifest.leagues.find((league) => league.status === "running");
    if (activeLeague !== undefined) {
      activeLeague.status = "failed";
      activeLeague.error = message;
    }
    await persistManifest(manifestPath, manifest, client);
    throw error;
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Errore sconosciuto.";
  console.error(`[CAL-4B] ${message}`);
  process.exitCode = 1;
});
