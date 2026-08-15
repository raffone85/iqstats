import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const REQUEST_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 4;
const EVENT_PAGE_SIZE = 100;
const MIN_MATCHES = 50;
const TARGET_MATCHES = 200;
const METRIC_FIELDS = {
  shots: "total_shots",
  sot: "shots_on_target",
  fouls: "fouls",
  corners: "corner_kicks",
  yellows: "yellow_cards",
  saves: "goalkeeper_saves",
  offsides: "offsides",
} as const;

const REGULAR_MEN_LEAGUE_IDS = [
  70, // Australia — NPL Queensland
  14, // Belgium — Pro League
  9, // Brazil — Serie A
  34, // Brazil — Serie B
  22, // Bulgaria — Parva Liga
  52, // China — Chinese Super League
  80, // Colombia — Categoria Primera A
  1, // England — Premier League
  12, // England — Championship
  55, // Finland — Veikkausliiga
  6, // France — Ligue 1
  5, // Germany — Bundesliga
  24, // Greece — Super League
  4, // Italy — Serie A
  49, // Japan — J1 League
  19, // Mexico — Liga MX Apertura
  20, // Mexico — Liga MX Clausura
  53, // Morocco — Botola Pro
  10, // Netherlands — Eredivisie
  28, // Nigeria — Premier Football League
  54, // Norway — Eliteserien
  25, // Poland — Ekstraklasa
  2, // Portugal — Liga Portugal
  82, // Portugal — Liga 3
  23, // Romania — Superliga
  17, // Saudi Arabia — Saudi Pro League
  13, // Scotland — Premiership
  50, // South Korea — K League 1
  3, // Spain — La Liga
  38, // Spain — Segunda Division
  26, // Sweden — Allsvenskan
  15, // Switzerland — Super League
  47, // Tunisia — Ligue Professionnelle 1
  11, // Turkey — Super Lig
  18, // USA — MLS
  57, // USA — USL Championship
] as const;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SCRIPT_DIR, "data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const ROWS_DIR = path.join(DATA_DIR, "rows");
const DATASET_PATH = path.join(DATA_DIR, "dataset.csv");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const DRY_RUN_MANIFEST_PATH = path.join(DATA_DIR, "manifest.dry-run.json");
const DATASET_HEADER =
  "league_id,match_id,date,team,side,shots,sot,fouls,corners,yellows,saves,offsides\n";

type JsonRecord = Record<string, unknown>;

type CurrentSeason = {
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
  currentSeason: CurrentSeason | null;
};

type MatchEvent = {
  id: number;
  leagueId: number;
  seasonId: number | null;
  eventDate: string;
  homeTeam: string;
  awayTeam: string;
};

type DateRange = {
  from: string;
  to: string;
  source: "current-season-completed" | "previous-complete-window";
  yearsShifted: number;
};

type CliOptions = {
  mode: "dry-run" | "execute" | "help";
  leagueIds: Set<number>;
  maxMatches: number | null;
};

type LeagueManifest = {
  leagueId: number;
  name: string;
  country: string;
  dateFrom: string;
  dateTo: string;
  rangeSource: DateRange["source"];
  yearsShifted: number;
  providerMatchCount: number | null;
  plannedMatchCount: number | null;
  harvestedMatchCount: number;
  resumedMatchCount: number;
  status: "pending" | "planned" | "running" | "completed" | "failed";
  sampleStatus: "unknown" | "insufficient" | "below-target" | "target-met";
  error?: string;
};

type Manifest = {
  schemaVersion: 1;
  runId: string;
  mode: "dry-run" | "execute";
  status: "running" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  selectionPolicy: {
    gender: "men";
    competitionType: "regular-domestic-league";
    separation: "league_id";
    allowlistedLeagueIds: number[];
    selectedLeagueIds: number[];
    excludedCatalogEntries: Array<{
      leagueId: number;
      name: string;
      country: string;
      reason: "women" | "not-allowlisted" | "inactive";
    }>;
  };
  requestPolicy: {
    eventFilter: "league_id";
    statsEndpoint: "events/{id}/stats/";
    minimumIntervalMs: number;
    maximumAttempts: number;
    missingValues: "null-or-empty-never-zero";
  };
  options: {
    requestedLeagueIds: number[];
    maxMatches: number | null;
  };
  outputs: {
    dataset: "scripts/calibration/data/dataset.csv";
    rawDirectory: "scripts/calibration/data/raw";
    rowDirectory: "scripts/calibration/data/rows";
  };
  catalogCount: number;
  selectedLeagueCount: number;
  totals: {
    providerMatches: number;
    plannedMatches: number;
    harvestedMatches: number;
    resumedMatches: number;
  };
  leagues: LeagueManifest[];
  error?: string;
};

type EventPage = {
  count: number;
  next: string | null;
  results: unknown[];
};

function printUsage(): void {
  console.log(`CAL-1 — IQstatS calibration dataset harvester

Usage:
  node --env-file=apps/web/.env.local --experimental-strip-types scripts/calibration/buildDataset.ts --dry-run
  node --env-file=apps/web/.env.local --experimental-strip-types scripts/calibration/buildDataset.ts --execute

Options:
  --dry-run           Validate catalog, date windows and event counts. No stats or CSV.
  --execute           Harvest stats and build the resumable dataset.
  --league-id=<id>    Restrict the run to one allowlisted league. Repeatable.
  --max-matches=<n>   Limit matches per league for a controlled smoke run.
  --help              Show this message.
`);
}

function parseCli(args: string[]): CliOptions {
  let mode: CliOptions["mode"] | null = null;
  const leagueIds = new Set<number>();
  let maxMatches: number | null = null;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      mode = "help";
      continue;
    }
    if (arg === "--dry-run" || arg === "--execute") {
      const nextMode = arg === "--dry-run" ? "dry-run" : "execute";
      if (mode && mode !== nextMode) {
        throw new Error("Usare una sola modalita: --dry-run oppure --execute.");
      }
      mode = nextMode;
      continue;
    }
    if (arg.startsWith("--league-id=")) {
      const value = parsePositiveInteger(arg.slice("--league-id=".length), "league-id");
      leagueIds.add(value);
      continue;
    }
    if (arg.startsWith("--max-matches=")) {
      maxMatches = parsePositiveInteger(arg.slice("--max-matches=".length), "max-matches");
      continue;
    }
    throw new Error(`Argomento non riconosciuto: ${arg}`);
  }

  if (!mode) {
    throw new Error("Specificare --dry-run oppure --execute.");
  }

  return { mode, leagueIds, maxMatches };
}

function parsePositiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} deve essere un intero positivo.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} deve essere un intero positivo.`);
  }
  return parsed;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: campo ${key} assente o non valido.`);
  }
  return value;
}

function requiredNumber(record: JsonRecord, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${context}: campo ${key} assente o non valido.`);
  }
  return value;
}

function optionalNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseLeague(value: unknown): League {
  if (!isRecord(value)) throw new Error("Catalogo leghe: record non valido.");
  const id = requiredNumber(value, "id", "Catalogo leghe");
  const name = requiredString(value, "name", `Lega ${id}`);
  const country = requiredString(value, "country", `Lega ${id}`);
  const isWomen = value.is_women;
  const isActive = value.is_active;
  if (typeof isWomen !== "boolean" || typeof isActive !== "boolean") {
    throw new Error(`Lega ${id}: flag genere/attivita non valido.`);
  }

  let currentSeason: CurrentSeason | null = null;
  if (value.current_season !== null && value.current_season !== undefined) {
    if (!isRecord(value.current_season)) {
      throw new Error(`Lega ${id}: current_season non valido.`);
    }
    const startDate = requiredString(value.current_season, "start_date", `Lega ${id}`);
    const endDate = requiredString(value.current_season, "end_date", `Lega ${id}`);
    if (!isDateOnly(startDate) || !isDateOnly(endDate) || startDate > endDate) {
      throw new Error(`Lega ${id}: intervallo stagione non valido.`);
    }
    currentSeason = {
      id: requiredNumber(value.current_season, "id", `Lega ${id}`),
      name: requiredString(value.current_season, "name", `Lega ${id}`),
      year: requiredNumber(value.current_season, "year", `Lega ${id}`),
      startDate,
      endDate,
    };
  }

  return { id, name, country, isWomen, isActive, currentSeason };
}

function parseEvent(value: unknown, expectedLeagueId: number): MatchEvent {
  if (!isRecord(value)) throw new Error(`Lega ${expectedLeagueId}: evento non valido.`);
  const id = requiredNumber(value, "id", `Evento lega ${expectedLeagueId}`);
  const leagueId = requiredNumber(value, "league_id", `Evento ${id}`);
  if (leagueId !== expectedLeagueId) {
    throw new Error(`Evento ${id}: league_id inatteso (${leagueId}).`);
  }
  const eventDate = requiredString(value, "event_date", `Evento ${id}`);
  if (Number.isNaN(new Date(eventDate).getTime())) {
    throw new Error(`Evento ${id}: event_date non valido.`);
  }
  return {
    id,
    leagueId,
    seasonId: optionalNumber(value, "season_id"),
    eventDate,
    homeTeam: requiredString(value, "home_team", `Evento ${id}`),
    awayTeam: requiredString(value, "away_team", `Evento ${id}`),
  };
}

function shiftYear(dateOnly: string, years: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function lastCompleteSeasonRange(league: League, today: string): DateRange {
  const season = league.currentSeason;
  if (!season) throw new Error(`Lega ${league.id}: stagione corrente assente.`);

  let from = season.startDate;
  let to = season.endDate;
  let yearsShifted = 0;
  while (to >= today) {
    from = shiftYear(from, -1);
    to = shiftYear(to, -1);
    yearsShifted += 1;
    if (yearsShifted > 5) {
      throw new Error(`Lega ${league.id}: impossibile derivare una stagione completa.`);
    }
  }

  return {
    from,
    to,
    source: yearsShifted === 0 ? "current-season-completed" : "previous-complete-window",
    yearsShifted,
  };
}

class ProviderClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private lastRequestStartedAt = 0;

  constructor() {
    const token = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
    if (!token) {
      throw new Error("Token provider server-side non configurato.");
    }
    const configuredBaseUrl =
      process.env.IQSTATS_PROVIDER_BASE_URL ??
      process.env.BSD_API_BASE_URL ??
      "https://sports.bzzoiro.com";
    try {
      this.baseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new Error("Base URL provider non valida.");
    }
    if (!/^https?:$/.test(this.baseUrl.protocol)) {
      throw new Error("Base URL provider non valida.");
    }
    this.token = token;
  }

  async getJson(target: string): Promise<unknown> {
    const url = new URL(target, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new Error("La paginazione ha restituito un host non autorizzato.");
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.throttle();
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Token ${this.token}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return (await response.json()) as unknown;

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw new Error(`Richiesta provider fallita con HTTP ${response.status}.`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Richiesta provider")) {
          throw error;
        }
        if (attempt === MAX_ATTEMPTS) {
          throw new Error("Richiesta provider fallita dopo i retry.");
        }
      }
      await delay(750 * 2 ** (attempt - 1));
    }
    throw new Error("Richiesta provider non completata.");
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestStartedAt;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await delay(REQUEST_INTERVAL_MS - elapsed);
    }
    this.lastRequestStartedAt = Date.now();
  }
}

function pageFromPayload(value: unknown, context: string): EventPage {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new Error(`${context}: payload paginato non valido.`);
  }
  const count = value.count;
  const next = value.next;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${context}: count non valido.`);
  }
  if (next !== null && typeof next !== "string") {
    throw new Error(`${context}: next non valido.`);
  }
  return { count, next, results: value.results };
}

async function fetchLeagueCatalog(client: ProviderClient): Promise<League[]> {
  const leagues: League[] = [];
  const seen = new Set<number>();
  let next: string | null = "/api/v2/leagues/?limit=100";

  while (next) {
    const page = pageFromPayload(await client.getJson(next), "Catalogo leghe");
    for (const item of page.results) {
      const league = parseLeague(item);
      if (seen.has(league.id)) throw new Error(`Catalogo leghe: ID duplicato ${league.id}.`);
      seen.add(league.id);
      leagues.push(league);
    }
    next = page.next;
  }

  return leagues;
}

function eventsPath(leagueId: number, range: DateRange, limit: number): string {
  const params = new URLSearchParams({
    league_id: String(leagueId),
    status: "finished",
    date_from: range.from,
    date_to: range.to,
    limit: String(limit),
  });
  return `/api/v2/events/?${params.toString()}`;
}

async function fetchEventPreview(
  client: ProviderClient,
  league: League,
  range: DateRange,
): Promise<EventPage> {
  const page = pageFromPayload(
    await client.getJson(eventsPath(league.id, range, 1)),
    `Eventi lega ${league.id}`,
  );
  for (const value of page.results) parseEvent(value, league.id);
  return page;
}

async function fetchAllEvents(
  client: ProviderClient,
  league: League,
  range: DateRange,
): Promise<{ providerCount: number; events: MatchEvent[] }> {
  const events: MatchEvent[] = [];
  const seen = new Set<number>();
  let providerCount: number | null = null;
  let next: string | null = eventsPath(league.id, range, EVENT_PAGE_SIZE);

  while (next) {
    const page = pageFromPayload(await client.getJson(next), `Eventi lega ${league.id}`);
    providerCount ??= page.count;
    if (providerCount !== page.count) {
      throw new Error(`Lega ${league.id}: count eventi cambiato durante la paginazione.`);
    }
    for (const value of page.results) {
      const event = parseEvent(value, league.id);
      if (seen.has(event.id)) throw new Error(`Lega ${league.id}: evento duplicato ${event.id}.`);
      seen.add(event.id);
      events.push(event);
    }
    next = page.next;
  }

  if (providerCount === null || events.length !== providerCount) {
    throw new Error(
      `Lega ${league.id}: paginazione incompleta (${events.length}/${providerCount ?? "?"}).`,
    );
  }

  events.sort((left, right) =>
    left.eventDate === right.eventDate
      ? left.id - right.id
      : left.eventDate.localeCompare(right.eventDate),
  );
  return { providerCount, events };
}

function classifySample(count: number): LeagueManifest["sampleStatus"] {
  if (count < MIN_MATCHES) return "insufficient";
  if (count < TARGET_MATCHES) return "below-target";
  return "target-met";
}

function metricValue(side: JsonRecord, field: string, eventId: number): number | null {
  const value = side[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  throw new Error(`Evento ${eventId}: metrica ${field} non valida.`);
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildMatchRows(event: MatchEvent, payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.stats)) {
    throw new Error(`Evento ${event.id}: payload stats non valido.`);
  }
  const home = payload.stats.home;
  const away = payload.stats.away;
  if (!isRecord(home) || !isRecord(away)) {
    throw new Error(`Evento ${event.id}: stats home/away assenti.`);
  }

  const date = new Date(event.eventDate).toISOString().slice(0, 10);
  const makeRow = (team: string, sideName: "home" | "away", stats: JsonRecord): string => {
    const values: Array<string | number | null> = [
      event.leagueId,
      event.id,
      date,
      team,
      sideName,
      ...Object.values(METRIC_FIELDS).map((field) => metricValue(stats, field, event.id)),
    ];
    return values.map(csvCell).join(",");
  };

  return `${makeRow(event.homeTeam, "home", home)}\n${makeRow(event.awayTeam, "away", away)}\n`;
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

function safeName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "-");
}

async function harvestMatch(
  client: ProviderClient,
  event: MatchEvent,
): Promise<{ rowPath: string; resumed: boolean }> {
  const leagueDirectory = String(event.leagueId);
  const fileName = `${safeName(String(event.id))}.json`;
  const rawPath = path.join(RAW_DIR, leagueDirectory, fileName);
  const rowPath = path.join(ROWS_DIR, leagueDirectory, `${safeName(String(event.id))}.csv`);
  const rawExists = await pathExists(rawPath);
  const rowExists = await pathExists(rowPath);

  const payload = rawExists
    ? await readJson(rawPath, `Evento ${event.id}`)
    : await client.getJson(`/api/v2/events/${event.id}/stats/`);
  const rows = buildMatchRows(event, payload);

  if (!rawExists) await writeJson(rawPath, payload);
  if (rowExists) {
    const existingRows = (await readFile(rowPath, "utf8")).replaceAll("\r\n", "\n");
    if (existingRows !== rows) {
      throw new Error(`Evento ${event.id}: shard CSV esistente non coerente con il raw.`);
    }
  } else {
    await atomicWrite(rowPath, rows);
  }

  return { rowPath, resumed: rawExists && rowExists };
}

async function buildDataset(rowPaths: string[]): Promise<void> {
  const chunks = [DATASET_HEADER];
  for (const rowPath of rowPaths) {
    const content = (await readFile(rowPath, "utf8")).replaceAll("\r\n", "\n");
    const lines = content.trimEnd().split("\n");
    if (lines.length !== 2) {
      throw new Error(`Shard CSV non valido: ${path.basename(rowPath)}.`);
    }
    chunks.push(`${lines.join("\n")}\n`);
  }
  await atomicWrite(DATASET_PATH, chunks.join(""));
}

async function countRowShards(leagueId: number): Promise<number> {
  const directory = path.join(ROWS_DIR, String(leagueId));
  if (!(await pathExists(directory))) return 0;
  return (await readdir(directory)).filter((name) => name.endsWith(".csv")).length;
}

function updateTotals(manifest: Manifest): void {
  manifest.totals = manifest.leagues.reduce(
    (totals, league) => ({
      providerMatches: totals.providerMatches + (league.providerMatchCount ?? 0),
      plannedMatches: totals.plannedMatches + (league.plannedMatchCount ?? 0),
      harvestedMatches: totals.harvestedMatches + league.harvestedMatchCount,
      resumedMatches: totals.resumedMatches + league.resumedMatchCount,
    }),
    { providerMatches: 0, plannedMatches: 0, harvestedMatches: 0, resumedMatches: 0 },
  );
  manifest.updatedAt = new Date().toISOString();
}

function createManifest(
  options: CliOptions & { mode: "dry-run" | "execute" },
  catalog: League[],
  selected: League[],
  ranges: Map<number, DateRange>,
): Manifest {
  const allowlist = new Set<number>(REGULAR_MEN_LEAGUE_IDS);
  const excludedCatalogEntries = catalog
    .filter((league) => !selected.some((item) => item.id === league.id))
    .map((league) => ({
      leagueId: league.id,
      name: league.name,
      country: league.country,
      reason: league.isWomen
        ? ("women" as const)
        : !league.isActive
          ? ("inactive" as const)
          : !allowlist.has(league.id)
            ? ("not-allowlisted" as const)
            : ("not-allowlisted" as const),
    }));
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: now.replaceAll(/[:.]/g, "-"),
    mode: options.mode,
    status: "running",
    startedAt: now,
    updatedAt: now,
    selectionPolicy: {
      gender: "men",
      competitionType: "regular-domestic-league",
      separation: "league_id",
      allowlistedLeagueIds: [...REGULAR_MEN_LEAGUE_IDS],
      selectedLeagueIds: selected.map((league) => league.id),
      excludedCatalogEntries,
    },
    requestPolicy: {
      eventFilter: "league_id",
      statsEndpoint: "events/{id}/stats/",
      minimumIntervalMs: REQUEST_INTERVAL_MS,
      maximumAttempts: MAX_ATTEMPTS,
      missingValues: "null-or-empty-never-zero",
    },
    options: {
      requestedLeagueIds: [...options.leagueIds].sort((left, right) => left - right),
      maxMatches: options.maxMatches,
    },
    outputs: {
      dataset: "scripts/calibration/data/dataset.csv",
      rawDirectory: "scripts/calibration/data/raw",
      rowDirectory: "scripts/calibration/data/rows",
    },
    catalogCount: catalog.length,
    selectedLeagueCount: selected.length,
    totals: {
      providerMatches: 0,
      plannedMatches: 0,
      harvestedMatches: 0,
      resumedMatches: 0,
    },
    leagues: selected.map((league) => {
      const range = ranges.get(league.id);
      if (!range) throw new Error(`Lega ${league.id}: intervallo non disponibile.`);
      return {
        leagueId: league.id,
        name: league.name,
        country: league.country,
        dateFrom: range.from,
        dateTo: range.to,
        rangeSource: range.source,
        yearsShifted: range.yearsShifted,
        providerMatchCount: null,
        plannedMatchCount: null,
        harvestedMatchCount: 0,
        resumedMatchCount: 0,
        status: "pending",
        sampleStatus: "unknown",
      };
    }),
  };
}

function selectLeagues(catalog: League[], options: CliOptions): League[] {
  const allowlist = new Set<number>(REGULAR_MEN_LEAGUE_IDS);
  for (const requested of options.leagueIds) {
    if (!allowlist.has(requested)) {
      throw new Error(`La lega ${requested} non appartiene all'allowlist CAL-1.`);
    }
  }

  const selected = catalog
    .filter(
      (league) =>
        allowlist.has(league.id) &&
        league.isActive &&
        !league.isWomen &&
        (options.leagueIds.size === 0 || options.leagueIds.has(league.id)),
    )
    .sort((left, right) => left.id - right.id);

  const selectedIds = new Set(selected.map((league) => league.id));
  const expectedIds = options.leagueIds.size > 0 ? options.leagueIds : allowlist;
  const missing = [...expectedIds].filter((id) => !selectedIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Catalogo incompleto o policy non rispettata per league_id: ${missing.join(", ")}.`);
  }
  return selected;
}

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  if (options.mode === "help") {
    printUsage();
    return;
  }

  const client = new ProviderClient();
  const catalog = await fetchLeagueCatalog(client);
  const selected = selectLeagues(catalog, options);
  const today = new Date().toISOString().slice(0, 10);
  const ranges = new Map<number, DateRange>();
  for (const league of selected) ranges.set(league.id, lastCompleteSeasonRange(league, today));

  const manifest = createManifest({ ...options, mode: options.mode }, catalog, selected, ranges);
  const manifestPath = options.mode === "dry-run" ? DRY_RUN_MANIFEST_PATH : MANIFEST_PATH;
  await writeJson(manifestPath, manifest);

  try {
    if (options.mode === "dry-run") {
      for (const league of selected) {
        const range = ranges.get(league.id);
        const leagueManifest = manifest.leagues.find((item) => item.leagueId === league.id);
        if (!range || !leagueManifest) throw new Error(`Lega ${league.id}: stato mancante.`);

        const preview = await fetchEventPreview(client, league, range);
        const planned = options.maxMatches
          ? Math.min(preview.count, options.maxMatches)
          : preview.count;
        leagueManifest.providerMatchCount = preview.count;
        leagueManifest.plannedMatchCount = planned;
        leagueManifest.sampleStatus = classifySample(preview.count);
        leagueManifest.status = "planned";
        updateTotals(manifest);
        await writeJson(manifestPath, manifest);
        console.log(
          `[CAL-1] ${league.id} ${league.name}: ${preview.count} eventi (${range.from} -> ${range.to}).`,
        );
      }
    } else {
      const rowPaths: string[] = [];
      for (const league of selected) {
        const range = ranges.get(league.id);
        const leagueManifest = manifest.leagues.find((item) => item.leagueId === league.id);
        if (!range || !leagueManifest) throw new Error(`Lega ${league.id}: stato mancante.`);

        leagueManifest.status = "running";
        await writeJson(manifestPath, manifest);
        const { providerCount, events: allEvents } = await fetchAllEvents(client, league, range);
        const events = options.maxMatches ? allEvents.slice(0, options.maxMatches) : allEvents;
        leagueManifest.providerMatchCount = providerCount;
        leagueManifest.plannedMatchCount = events.length;
        leagueManifest.sampleStatus = classifySample(providerCount);

        for (const event of events) {
          const result = await harvestMatch(client, event);
          rowPaths.push(result.rowPath);
          leagueManifest.harvestedMatchCount += 1;
          if (result.resumed) leagueManifest.resumedMatchCount += 1;
          if (leagueManifest.harvestedMatchCount % 10 === 0) {
            updateTotals(manifest);
            await writeJson(manifestPath, manifest);
          }
        }

        leagueManifest.status = "completed";
        updateTotals(manifest);
        await writeJson(manifestPath, manifest);
        const shardCount = await countRowShards(league.id);
        console.log(
          `[CAL-1] ${league.id} ${league.name}: ${events.length} eventi processati, ${shardCount} shard disponibili.`,
        );
      }
      await buildDataset(rowPaths);
    }

    manifest.status = "completed";
    manifest.completedAt = new Date().toISOString();
    updateTotals(manifest);
    await writeJson(manifestPath, manifest);
    console.log(
      `[CAL-1] ${options.mode} completato: ${manifest.selectedLeagueCount} leghe, ${manifest.totals.plannedMatches} match pianificati.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto.";
    const activeLeague = manifest.leagues.find((league) => league.status === "running");
    if (activeLeague) {
      activeLeague.status = "failed";
      activeLeague.error = message;
    }
    manifest.status = "failed";
    manifest.error = message;
    updateTotals(manifest);
    await writeJson(manifestPath, manifest);
    throw error;
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Errore sconosciuto.";
  console.error(`[CAL-1] ${message}`);
  process.exitCode = 1;
});
