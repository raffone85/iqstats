// ENG-1B — harvest riprendibile delle statistiche gara della stagione corrente.
// Estrae solo le sette metriche osservate per lato; nessun payload raw persistito,
// nessun segreto stampato. Cap GET approvato dall'utente il 13 agosto 2026.
//
// Uso:
//   node --env-file=apps/web/.env.local --experimental-strip-types scripts/engine/harvest.ts

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const MIN_REQUEST_INTERVAL_MS = 500; // massimo 2 richieste al secondo
const GET_BUDGET = 1_100;
const PAGE_LIMIT = 200;

const OUTPUT_DIR = join("scripts", "engine", "data", "current");

// Stesse chiavi provider usate da scripts/calibration/buildDataset.ts.
const METRIC_FIELDS = {
  shots: "total_shots",
  sot: "shots_on_target",
  fouls: "fouls",
  corners: "corner_kicks",
  yellows: "yellow_cards",
  saves: "goalkeeper_saves",
  offsides: "offsides",
} as const;

type MetricKey = keyof typeof METRIC_FIELDS;
const METRIC_KEYS = Object.keys(METRIC_FIELDS) as MetricKey[];

// Fasce A+B approvate, ridotte alle leghe che il motore puo' davvero servire.
// Escluse 28 (Nigeria) e 20 (Liga MX Clausura): la loro stagione "corrente" secondo il
// provider e' gia' nel dataset storico CAL-1.
// Escluse 52, 26, 49, 82: prive di baseline calibrata CAL-3 (scartate dal QA CAL-2),
// quindi il motore non produrrebbe comunque alcuna lettura. Risparmio: 318 GET.
// Esclusa 53 (Botola): verificato il 13 agosto 2026 che la stagione dichiarata "corrente"
// dal provider (1085, 25/26) e' conclusa il 28 giugno 2026 ed e' gia' interamente nel seed
// CAL-1; le 63 gare esposte ne sono un sottoinsieme. Trattarle come correnti le
// conterebbe due volte.
const LEAGUE_IDS = [18, 9, 19, 23, 22, 25, 15, 13, 2, 10, 14];

/** `--leagues=13,49` limita il run a un sottoinsieme (smoke). Default: tutte. */
function selectedLeagues(): number[] {
  const arg = process.argv.find((value) => value.startsWith("--leagues="));
  if (!arg) return LEAGUE_IDS;
  const wanted = new Set(
    arg
      .slice("--leagues=".length)
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value)),
  );
  return LEAGUE_IDS.filter((id) => wanted.has(id));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class ProviderClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private lastRequestStartedAt = 0;
  private requestCount = 0;

  constructor() {
    const token = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
    if (!token) throw new Error("Token provider server-side non configurato.");
    const configuredBaseUrl =
      process.env.IQSTATS_PROVIDER_BASE_URL ??
      process.env.BSD_API_BASE_URL ??
      "https://sports.bzzoiro.com";
    this.baseUrl = new URL(configuredBaseUrl);
    if (!/^https?:$/.test(this.baseUrl.protocol)) {
      throw new Error("Base URL provider non valida.");
    }
    this.token = token;
  }

  get spent(): number {
    return this.requestCount;
  }

  get remaining(): number {
    return GET_BUDGET - this.requestCount;
  }

  async getJson(target: string): Promise<unknown> {
    if (this.requestCount >= GET_BUDGET) {
      throw new Error(`Cap GET raggiunto (${GET_BUDGET}).`);
    }
    const url = new URL(target, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) throw new Error("Host non autorizzato.");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.throttle();
      this.requestCount += 1;
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Token ${this.token}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return (await response.json()) as unknown;
        if (response.status === 404) return null;

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("HTTP ")) throw error;
        if (attempt === MAX_ATTEMPTS) throw new Error("Richiesta fallita dopo i retry.");
      }
      await delay(750 * 2 ** (attempt - 1));
    }
    throw new Error("Richiesta non completata.");
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestStartedAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await delay(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    this.lastRequestStartedAt = Date.now();
  }
}

type MetricRow = Record<MetricKey, number | null>;

type EventRow = {
  eventId: number;
  leagueId: number;
  seasonId: number;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  refereeId: number | null;
  home: MetricRow;
  away: MetricRow;
};

type Shard = {
  schemaVersion: 1;
  leagueId: number;
  seasonId: number;
  seasonName: string;
  capturedAt: string;
  events: EventRow[];
  missingStats: number[];
};

/** Legge una metrica: assente o non numerica resta null, mai zero. */
function metricValue(stats: unknown, field: string): number | null {
  if (!isRecord(stats)) return null;
  const raw = stats[field];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  // Alcuni campi arrivano come { value, total, pct }: si usa `value`.
  if (isRecord(raw) && typeof raw.value === "number" && Number.isFinite(raw.value)) {
    return raw.value;
  }
  return null;
}

function readMetrics(stats: unknown): MetricRow {
  const row = {} as MetricRow;
  for (const key of METRIC_KEYS) row[key] = metricValue(stats, METRIC_FIELDS[key]);
  return row;
}

function loadShard(leagueId: number): Shard | null {
  const path = join(OUTPUT_DIR, `${leagueId}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Shard;
  } catch {
    return null;
  }
}

function saveShard(shard: Shard): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, `${shard.leagueId}.json`), JSON.stringify(shard, null, 1));
}

async function listFinishedEvents(
  client: ProviderClient,
  leagueId: number,
  seasonId: number,
): Promise<Omit<EventRow, "home" | "away">[]> {
  const events: Omit<EventRow, "home" | "away">[] = [];
  let offset = 0;

  for (;;) {
    const payload = await client.getJson(
      `/api/v2/events/?league_id=${leagueId}&season_id=${seasonId}` +
        `&status=finished&limit=${PAGE_LIMIT}&offset=${offset}`,
    );
    if (!isRecord(payload) || !Array.isArray(payload.results)) break;

    for (const entry of payload.results) {
      if (!isRecord(entry)) continue;
      const eventId = entry.id;
      const homeTeamId = entry.home_team_id;
      const awayTeamId = entry.away_team_id;
      const date = entry.event_date;
      if (
        typeof eventId !== "number" ||
        typeof homeTeamId !== "number" ||
        typeof awayTeamId !== "number" ||
        typeof date !== "string"
      ) {
        continue;
      }
      events.push({
        eventId,
        leagueId,
        seasonId,
        date,
        homeTeamId,
        awayTeamId,
        refereeId: typeof entry.referee_id === "number" ? entry.referee_id : null,
      });
    }

    const count = typeof payload.count === "number" ? payload.count : events.length;
    offset += PAGE_LIMIT;
    if (offset >= count) break;
  }

  return events;
}

async function main(): Promise<void> {
  const client = new ProviderClient();
  const startedAt = new Date().toISOString();
  const summary: {
    leagueId: number;
    stagione: string;
    nuove: number;
    totali: number;
    senzaStats: number;
  }[] = [];

  for (const leagueId of selectedLeagues()) {
    if (client.remaining < 5) {
      console.log(`Cap quasi esaurito: lega ${leagueId} e successive non elaborate.`);
      break;
    }

    const seasonPayload = await client.getJson(`/api/v2/leagues/${leagueId}/season/`);
    const season = isRecord(seasonPayload) ? seasonPayload.season : null;
    if (!isRecord(season) || typeof season.id !== "number") {
      console.log(`Lega ${leagueId}: stagione corrente non risolta, saltata.`);
      continue;
    }
    const seasonId = season.id;
    const seasonName = typeof season.name === "string" ? season.name : "n/d";

    const existing = loadShard(leagueId);
    const reusable = existing && existing.seasonId === seasonId ? existing : null;
    const known = new Set(reusable?.events.map((e) => e.eventId) ?? []);
    const missing = new Set(reusable?.missingStats ?? []);

    const listed = await listFinishedEvents(client, leagueId, seasonId);
    const todo = listed.filter((e) => !known.has(e.eventId) && !missing.has(e.eventId));

    const shard: Shard = reusable ?? {
      schemaVersion: 1,
      leagueId,
      seasonId,
      seasonName,
      capturedAt: startedAt,
      events: [],
      missingStats: [],
    };
    shard.capturedAt = startedAt;
    shard.seasonName = seasonName;

    let added = 0;
    for (const event of todo) {
      if (client.remaining < 2) break;
      const payload = await client.getJson(`/api/v2/events/${event.eventId}/stats/`);
      const stats = isRecord(payload) ? payload.stats : null;
      if (!isRecord(stats) || !isRecord(stats.home) || !isRecord(stats.away)) {
        shard.missingStats.push(event.eventId);
        continue;
      }
      shard.events.push({
        ...event,
        home: readMetrics(stats.home),
        away: readMetrics(stats.away),
      });
      added += 1;
      if (added % 50 === 0) saveShard(shard);
    }

    shard.events.sort((a, b) => a.date.localeCompare(b.date));
    saveShard(shard);

    summary.push({
      leagueId,
      stagione: seasonName,
      nuove: added,
      totali: shard.events.length,
      senzaStats: shard.missingStats.length,
    });
    console.log(
      `lega ${leagueId} ${seasonName}: +${added} (tot ${shard.events.length}, ` +
        `senza stats ${shard.missingStats.length}) — GET ${client.spent}/${GET_BUDGET}`,
    );
  }

  console.log("\nENG-1B — harvest stagione corrente\n");
  console.table(summary);
  const totale = summary.reduce((sum, r) => sum + r.totali, 0);
  console.log(`GET spesi: ${client.spent} / ${GET_BUDGET}`);
  console.log(`Gare con metriche raccolte: ${totale}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "errore");
  process.exitCode = 1;
});
