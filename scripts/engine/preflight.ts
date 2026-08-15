// ENG-1A — preflight che conta le gare concluse della stagione corrente.
// Non scarica statistiche: usa solo la risoluzione stagione e il `count` della
// lista eventi paginata. Nessun payload persistito, nessun segreto stampato.
//
// Uso:
//   node --env-file=apps/web/.env.local --experimental-strip-types scripts/engine/preflight.ts

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const MIN_REQUEST_INTERVAL_MS = 500; // massimo 2 richieste al secondo
const GET_BUDGET = 90;

// Leghe con prior storico in scripts/calibration/data/dataset.csv.
const LEAGUE_IDS = [
  1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 22, 23, 24, 25, 26, 28,
  38, 47, 49, 52, 53, 82,
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ProviderClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private lastRequestStartedAt = 0;
  private requestCount = 0;

  constructor() {
    const token = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
    if (!token) {
      throw new Error("Token provider server-side non configurato.");
    }
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

  async getJson(target: string): Promise<unknown> {
    if (this.requestCount >= GET_BUDGET) {
      throw new Error(`Budget preflight esaurito (${GET_BUDGET} GET).`);
    }
    const url = new URL(target, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new Error("Host non autorizzato.");
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

type Row = {
  leagueId: number;
  league: string;
  season: string;
  start: string;
  finished: number | null;
  nota: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "n/d";
}

async function main(): Promise<void> {
  const client = new ProviderClient();
  const rows: Row[] = [];

  // Nomi lega in una sola richiesta: /leagues/{id}/season/ non li espone.
  const names = new Map<number, string>();
  const catalog = asRecord(await client.getJson("/api/v2/leagues/?limit=100"));
  const results = Array.isArray(catalog?.results) ? catalog.results : [];
  for (const entry of results) {
    const league = asRecord(entry);
    if (typeof league?.id === "number") names.set(league.id, text(league.name));
  }

  for (const leagueId of LEAGUE_IDS) {
    let row: Row = {
      leagueId,
      league: "n/d",
      season: "n/d",
      start: "n/d",
      finished: null,
      nota: "",
    };

    try {
      const payload = asRecord(await client.getJson(`/api/v2/leagues/${leagueId}/season/`));
      const seasonPayload = asRecord(payload?.season);
      row.league = names.get(leagueId) ?? "n/d";
      row.season = text(seasonPayload?.name);
      row.start = text(seasonPayload?.start_date);

      const seasonId = seasonPayload?.id;
      if (typeof seasonId !== "number") {
        row.nota = "stagione corrente non risolta";
        rows.push(row);
        continue;
      }

      const listPayload = asRecord(
        await client.getJson(
          `/api/v2/events/?league_id=${leagueId}&season_id=${seasonId}&status=finished&limit=1`,
        ),
      );
      const count = listPayload?.count;
      row.finished = typeof count === "number" ? count : null;
      if (row.finished === null) row.nota = "count assente";
    } catch (error) {
      row.nota = error instanceof Error ? error.message : "errore";
    }

    rows.push(row);
  }

  rows.sort((a, b) => (b.finished ?? -1) - (a.finished ?? -1));

  console.log("\nENG-1A — gare concluse nella stagione corrente (prior CAL-1)\n");
  console.table(
    rows.map((r) => ({
      lega: `${r.leagueId} ${r.league}`,
      stagione: r.season,
      inizio: r.start,
      concluse: r.finished ?? "n/d",
      nota: r.nota,
    })),
  );

  const withData = rows.filter((r) => (r.finished ?? 0) > 0);
  const totale = withData.reduce((sum, r) => sum + (r.finished ?? 0), 0);

  console.log(`GET spesi: ${client.spent} / ${GET_BUDGET}`);
  console.log(`Leghe con almeno una gara conclusa: ${withData.length} / ${rows.length}`);
  console.log(`Gare concluse totali (= GET del backfill /events/{id}/stats/): ${totale}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "errore");
  process.exitCode = 1;
});
