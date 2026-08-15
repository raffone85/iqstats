import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve("scripts/app-discovery/output/2026-08-13-team-profile");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const MAX_REQUESTS = 30;
const REQUEST_INTERVAL_MS = 550;
const REQUEST_TIMEOUT_MS = 12_000;

const TEAM_ID = 63; // AC Milan
const LEAGUE_ID = 4; // Serie A
const STATS_SAMPLE_SIZE = 3;

function printHelp() {
  console.log(`Usage:
  node --env-file=apps/web/.env.local scripts/app-discovery/discoverTeamProfile.mjs --dry-run
  node --env-file=apps/web/.env.local scripts/app-discovery/discoverTeamProfile.mjs --execute

Scopo:
  Ricognizione in sola lettura per la scheda squadra /squadre/[teamId].
  Verifica profilo, rosa, fixtures, stagioni, classifica, storico eventi filtrato
  per team_id e le statistiche per gara che alimentano le medie casa/trasferta.

Safety:
  Solo GET, tetto ${MAX_REQUESTS} richieste, al massimo due richieste al secondo,
  nessuna scrittura al provider, nessuna modifica dell'app, output sanificati.`);
}

function isSensitiveKey(key) {
  return /(^|[_-])(authorization|token|api[_-]?key|password|passwd|secret|cookie|set[_-]?cookie)([_-]|$)/i.test(
    key,
  );
}

function sanitizeString(value) {
  return value
    .replace(/(authorization\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/((?:token|api[_-]?key|password|secret)=)[^&\s]+/gi, "$1[REDACTED]");
}

function sanitize(value, seen = new WeakSet()) {
  if (typeof value === "string") return sanitizeString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitize(child, seen);
  }
  return output;
}

function topLevelSummary(value) {
  if (Array.isArray(value)) {
    return {
      kind: "array",
      count: value.length,
      itemKeys:
        value[0] && typeof value[0] === "object" && !Array.isArray(value[0])
          ? Object.keys(value[0])
          : [],
    };
  }
  if (value && typeof value === "object") {
    const arrayEntry = Object.entries(value).find(([, child]) => Array.isArray(child));
    return {
      kind: "object",
      keys: Object.keys(value),
      count:
        typeof value.count === "number"
          ? value.count
          : arrayEntry
            ? arrayEntry[1].length
            : null,
      arrayField: arrayEntry?.[0] ?? null,
      itemKeys:
        arrayEntry?.[1]?.[0] && typeof arrayEntry[1][0] === "object"
          ? Object.keys(arrayEntry[1][0])
          : [],
    };
  }
  return { kind: value === null ? "null" : typeof value, count: null };
}

function selectOpenApiEvidence(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { paths: {}, components: { schemas: {} }, missing: ["invalid_openapi_document"] };
  }

  const wanted = [
    "/api/v2/teams/",
    "/api/v2/teams/{id}/",
    "/api/v2/teams/{id}/squad/",
    "/api/v2/teams/{id}/fixtures/",
    "/api/v2/teams/{id}/social/",
    "/api/v2/leagues/{id}/standings/",
    "/api/v2/leagues/{id}/top/{stat}/",
    "/api/v2/managers/{id}/",
    "/api/v2/players/{id}/stats/",
    "/api/v2/events/{id}/stats/",
  ];
  const paths = {};
  const missing = [];
  for (const key of wanted) {
    if (document.paths?.[key]) paths[key] = document.paths[key];
    else missing.push(key);
  }

  const schemaNames = Object.keys(document.components?.schemas ?? {}).filter((name) =>
    /team|squad|player|manager|standing|stat/i.test(name),
  );
  const schemas = {};
  for (const name of schemaNames) schemas[name] = document.components.schemas[name];

  return { openapi: document.openapi ?? null, paths, components: { schemas }, missing };
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function assertResumableOutputDirectory() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.scope !== "team-profile") {
    throw new Error("La directory di output appartiene a un'altra ricognizione.");
  }
  return manifest;
}

function providerConfig() {
  const token = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
  const configuredBaseUrl =
    process.env.IQSTATS_PROVIDER_BASE_URL ??
    process.env.BSD_API_BASE_URL ??
    "https://sports.bzzoiro.com";
  if (!token) throw new Error("Token provider server-side non configurato.");

  let baseUrl;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("Base URL provider non valida.");
  }
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("Base URL provider non valida.");
  return { token, baseUrl };
}

async function execute() {
  const { token, baseUrl } = providerConfig();

  const previousManifest = assertResumableOutputDirectory();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest = {
    schemaVersion: "iqstats.app-discovery.manifest.v1",
    runDate: "2026-08-13",
    scope: "team-profile",
    status: "running",
    policy: {
      method: "GET",
      sampleTeamId: TEAM_ID,
      sampleLeagueId: LEAGUE_ID,
      maxRequests: MAX_REQUESTS,
      requestsPerSecondMax: 2,
      appModified: false,
      writesToProvider: false,
    },
    requestsStarted: previousManifest?.requestsCompleted ?? 0,
    requestsCompleted: previousManifest?.requestsCompleted ?? 0,
    entries: previousManifest?.entries ?? [],
  };
  writeJsonAtomic(MANIFEST_PATH, manifest);

  let lastRequestAt = 0;

  async function get(label, requestPath, transform) {
    const cachedPath = path.join(OUTPUT_DIR, `${label}.json`);
    if (fs.existsSync(cachedPath)) {
      console.log(`${label}: già acquisito, nessuna richiesta`);
      return JSON.parse(fs.readFileSync(cachedPath, "utf8"));
    }
    if (manifest.requestsStarted >= MAX_REQUESTS) throw new Error("Tetto richieste raggiunto.");
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
    }

    manifest.requestsStarted += 1;
    lastRequestAt = Date.now();
    const url = new URL(requestPath, baseUrl);
    if (url.origin !== baseUrl.origin) throw new Error("Target esterno alla base URL autorizzata.");

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Token ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error(`Richiesta ${label} non completata.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    let body;
    if (contentType.includes("json")) body = await response.json();
    else body = { text: (await response.text()).slice(0, 10_000) };

    const sanitized = sanitize(transform ? transform(body) : body);
    const file = `${label}.json`;
    writeJsonAtomic(path.join(OUTPUT_DIR, file), sanitized);

    manifest.entries.push({
      label,
      requestPath,
      status: response.status,
      capturedAt: new Date().toISOString(),
      contentType,
      file,
      summary: topLevelSummary(sanitized),
    });
    manifest.requestsCompleted += 1;
    writeJsonAtomic(MANIFEST_PATH, manifest);
    console.log(`${label}: HTTP ${response.status}`);
    return sanitized;
  }

  await get("openapi-team-contracts", "/openapi.json", selectOpenApiEvidence);
  await get("team-detail", `/api/v2/teams/${TEAM_ID}/`);
  await get("team-squad", `/api/v2/teams/${TEAM_ID}/squad/`);
  await get("team-fixtures-finished", `/api/v2/teams/${TEAM_ID}/fixtures/?status=finished&limit=20`);
  await get("team-fixtures-upcoming", `/api/v2/teams/${TEAM_ID}/fixtures/?status=notstarted&limit=10`);

  const seasons = await get("league-seasons", `/api/v2/leagues/${LEAGUE_ID}/seasons/`);
  const seasonRows = Array.isArray(seasons?.seasons) ? seasons.seasons : [];
  const currentSeason = seasonRows.find((row) => row?.is_current) ?? null;
  const completedSeasons = seasonRows
    .filter((row) => row && row.id !== currentSeason?.id && typeof row.year === "number")
    .sort((a, b) => b.year - a.year);
  const previousSeason = completedSeasons[0] ?? null;

  if (currentSeason) {
    await get(
      "standings-current-season",
      `/api/v2/leagues/${LEAGUE_ID}/standings/?season_id=${currentSeason.id}`,
    );
  }
  if (previousSeason) {
    await get(
      "standings-previous-season",
      `/api/v2/leagues/${LEAGUE_ID}/standings/?season_id=${previousSeason.id}`,
    );
    await get(
      "league-top-scorers-previous-season",
      `/api/v2/leagues/${LEAGUE_ID}/top/scorers/?season_id=${previousSeason.id}`,
    );
  }

  let finishedEvents = { results: [] };
  if (previousSeason) {
    finishedEvents = await get(
      "events-by-team-previous-season",
      `/api/v2/events/?team_id=${TEAM_ID}&season_id=${previousSeason.id}&status=finished&limit=50`,
    );
  }
  const eventRows = Array.isArray(finishedEvents?.results) ? finishedEvents.results : [];
  const foreignRows = eventRows.filter(
    (row) => row?.home_team_id !== TEAM_ID && row?.away_team_id !== TEAM_ID,
  );

  const homeSample = eventRows.filter((row) => row?.home_team_id === TEAM_ID).slice(0, STATS_SAMPLE_SIZE);
  const awaySample = eventRows.filter((row) => row?.away_team_id === TEAM_ID).slice(0, STATS_SAMPLE_SIZE);
  for (const [index, row] of homeSample.entries()) {
    await get(`event-stats-home-${index + 1}`, `/api/v2/events/${row.id}/stats/`);
  }
  for (const [index, row] of awaySample.entries()) {
    await get(`event-stats-away-${index + 1}`, `/api/v2/events/${row.id}/stats/`);
  }

  const playerStatsSample = homeSample[0] ?? awaySample[0] ?? null;
  if (playerStatsSample) {
    await get("event-player-stats-1", `/api/v2/events/${playerStatsSample.id}/player-stats/`);
  }

  const coachId = homeSample[0]?.home_coach_id ?? awaySample[0]?.away_coach_id ?? null;
  if (coachId) await get("manager-detail", `/api/v2/managers/${coachId}/`);

  const venueId = eventRows.find((row) => row?.home_team_id === TEAM_ID)?.venue_id ?? null;
  if (venueId) await get("venue-detail", `/api/v2/venues/${venueId}/`);

  const refereeId = eventRows.find((row) => row?.referee_id)?.referee_id ?? null;
  if (refereeId) await get("referee-detail", `/api/v2/referees/${refereeId}/`);
  await get("referees-league", `/api/v2/referees/?league_id=${LEAGUE_ID}&limit=100`);

  manifest.status = "completed";
  manifest.completedAt = new Date().toISOString();
  manifest.findings = {
    teamIdFilterHonoured: eventRows.length > 0 && foreignRows.length === 0,
    finishedEventsDeclared: typeof finishedEvents?.count === "number" ? finishedEvents.count : null,
    finishedEventsReturned: eventRows.length,
    homeMatchesInPage: eventRows.filter((row) => row?.home_team_id === TEAM_ID).length,
    awayMatchesInPage: eventRows.filter((row) => row?.away_team_id === TEAM_ID).length,
    currentSeasonId: currentSeason?.id ?? null,
    previousSeasonId: previousSeason?.id ?? null,
  };
  writeJsonAtomic(MANIFEST_PATH, manifest);
  console.log(
    `Discovery completata: ${manifest.requestsCompleted}/${MAX_REQUESTS} richieste consentite, output sanificati.`,
  );
}

const mode = process.argv[2] ?? "--help";
if (mode === "--execute") {
  await execute();
} else if (mode === "--dry-run") {
  console.log(
    JSON.stringify(
      {
        outputDir: OUTPUT_DIR,
        maxRequests: MAX_REQUESTS,
        teamId: TEAM_ID,
        leagueId: LEAGUE_ID,
        plannedSequence: [
          "openapi-team-contracts",
          "team-detail",
          "team-squad",
          "team-fixtures-finished",
          "team-fixtures-upcoming",
          "league-seasons",
          "standings-current-season",
          "standings-previous-season",
          "league-top-scorers-previous-season",
          "events-by-team-previous-season",
          `event-stats-home x${STATS_SAMPLE_SIZE}`,
          `event-stats-away x${STATS_SAMPLE_SIZE}`,
          "event-player-stats-1",
          "manager-detail",
          "venue-detail",
          "referee-detail",
          "referees-league",
        ],
      },
      null,
      2,
    ),
  );
} else {
  printHelp();
}
