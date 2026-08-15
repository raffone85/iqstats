import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve("scripts/app-discovery/output/2026-08-01");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const MAX_REQUESTS = 18;
const REQUEST_INTERVAL_MS = 550;
const REQUEST_TIMEOUT_MS = 12_000;

const EVENT_FINISHED = 7198;
const EVENT_UPCOMING = 7208;
const LEAGUE_ID = 9;
const SEASON_ID = 28;

const targets = [
  {
    label: "openapi-relevant-contracts",
    requestPath: "/openapi.json",
    transform: selectOpenApiEvidence,
  },
  {
    label: "events-finished-sample",
    requestPath:
      "/api/v2/events/?league_id=9&date_from=2026-07-25&date_to=2026-08-01&status=finished&limit=10",
  },
  {
    label: "events-upcoming-sample",
    requestPath:
      "/api/v2/events/?league_id=9&date_from=2026-08-01&date_to=2026-08-10&limit=10",
  },
  { label: "event-finished-detail", requestPath: `/api/v2/events/${EVENT_FINISHED}/` },
  { label: "event-upcoming-detail", requestPath: `/api/v2/events/${EVENT_UPCOMING}/` },
  { label: "event-finished-odds", requestPath: `/api/v2/events/${EVENT_FINISHED}/odds/` },
  { label: "event-upcoming-odds", requestPath: `/api/v2/events/${EVENT_UPCOMING}/odds/` },
  {
    label: "event-finished-odds-comparison",
    requestPath: `/api/v2/events/${EVENT_FINISHED}/odds/comparison/`,
  },
  {
    label: "event-upcoming-odds-comparison",
    requestPath: `/api/v2/events/${EVENT_UPCOMING}/odds/comparison/`,
  },
  {
    label: "event-finished-odds-list",
    requestPath: `/api/v2/odds/?event_id=${EVENT_FINISHED}&limit=500&offset=0`,
  },
  {
    label: "event-upcoming-odds-list",
    requestPath: `/api/v2/odds/?event_id=${EVENT_UPCOMING}&limit=500&offset=0`,
  },
  { label: "event-finished-h2h", requestPath: `/api/v2/events/${EVENT_FINISHED}/h2h/` },
  { label: "event-upcoming-h2h", requestPath: `/api/v2/events/${EVENT_UPCOMING}/h2h/` },
  {
    label: "league-standings",
    requestPath: `/api/v2/leagues/${LEAGUE_ID}/standings/?season_id=${SEASON_ID}`,
  },
  { label: "event-upcoming-pregame", requestPath: `/api/v2/events/${EVENT_UPCOMING}/pregame/` },
  {
    label: "event-upcoming-team-stats",
    requestPath: `/api/v2/events/${EVENT_UPCOMING}/team-stats/`,
  },
];

const oddsCompletionTargets = [
  {
    label: "event-finished-odds-list-offset-200",
    requestPath: `/api/v2/odds/?event_id=${EVENT_FINISHED}&limit=200&offset=200`,
  },
  {
    label: "event-finished-odds-list-offset-400",
    requestPath: `/api/v2/odds/?event_id=${EVENT_FINISHED}&limit=200&offset=400`,
  },
];

function printHelp() {
  console.log(`Usage:
  node --env-file=apps/web/.env.local scripts/app-discovery/discoverMvpContracts.mjs --dry-run
  node --env-file=apps/web/.env.local scripts/app-discovery/discoverMvpContracts.mjs --execute

Options:
  --help       Show this help.
  --dry-run    Print the fixed allowlist without network or writes.
  --execute    Run the bounded discovery and write sanitized fixtures.
  --complete-odds-pages
               Fetch the two fixed remaining pages for the finished sample.

Safety:
  GET only, ${targets.length} planned calls, ${MAX_REQUESTS} hard request cap,
  at most two requests/second, only two fixed odds pagination follow-ups.`);
}

function selectOpenApiEvidence(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { paths: {}, components: { schemas: {} }, missing: ["invalid_openapi_document"] };
  }

  const allowedPaths = [
    "/api/v2/events/",
    "/api/v2/events/{id}/",
    "/api/v2/events/{id}/h2h/",
    "/api/v2/events/{id}/odds/",
    "/api/v2/events/{id}/odds/comparison/",
    "/api/v2/leagues/{id}/standings/",
    "/api/v2/odds/",
    "/api/v2/odds/{id}/",
    "/api/v2/odds/best/",
    "/api/v2/events/{id}/pregame/",
    "/api/v2/events/{id}/team-stats/",
  ];
  const paths = {};
  const missing = [];
  for (const key of allowedPaths) {
    if (document.paths?.[key]) paths[key] = document.paths[key];
    else missing.push(key);
  }

  const schemaNames = ["OddsItemV2Schema", "BookmakerV2Schema"];
  const schemas = {};
  for (const name of schemaNames) {
    const schema = document.components?.schemas?.[name];
    if (schema) schemas[name] = schema;
    else missing.push(`#/components/schemas/${name}`);
  }

  return {
    openapi: document.openapi ?? null,
    paths,
    components: { schemas },
    missing,
  };
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

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function assertEmptyOutputDirectory() {
  if (!fs.existsSync(OUTPUT_DIR)) return;
  const entries = fs.readdirSync(OUTPUT_DIR);
  if (entries.length > 0) {
    throw new Error("La directory di output esiste già e non è vuota; il run non la sovrascrive.");
  }
}

async function execute() {
  if (targets.length > MAX_REQUESTS) {
    throw new Error("La allowlist supera il tetto richieste.");
  }

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
  if (!/^https?:$/.test(baseUrl.protocol)) {
    throw new Error("Base URL provider non valida.");
  }

  assertEmptyOutputDirectory();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest = {
    schemaVersion: "iqstats.app-discovery.manifest.v1",
    runDate: "2026-08-01",
    status: "running",
    policy: {
      method: "GET",
      sampleEventIds: [EVENT_FINISHED, EVENT_UPCOMING],
      maxSampleEvents: 3,
      plannedRequests: targets.length,
      maxRequests: MAX_REQUESTS,
      requestsPerSecondMax: 2,
      followsPagination: false,
      appModified: false,
    },
    requestsStarted: 0,
    requestsCompleted: 0,
    entries: [],
  };
  writeJsonAtomic(MANIFEST_PATH, manifest);

  let lastRequestAt = 0;
  for (const target of targets) {
    if (manifest.requestsStarted >= MAX_REQUESTS) {
      throw new Error("Tetto richieste raggiunto.");
    }
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
    }

    manifest.requestsStarted += 1;
    lastRequestAt = Date.now();
    const url = new URL(target.requestPath, baseUrl);
    if (url.origin !== baseUrl.origin) throw new Error("Target esterno alla base URL autorizzata.");

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Token ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error(`Richiesta ${target.label} non completata.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    let body;
    if (contentType.includes("json")) body = await response.json();
    else body = { text: (await response.text()).slice(0, 10_000) };

    const transformed = target.transform ? target.transform(body) : body;
    const sanitized = sanitize(transformed);
    const file = `${target.label}.json`;
    writeJsonAtomic(path.join(OUTPUT_DIR, file), sanitized);

    manifest.entries.push({
      label: target.label,
      requestPath: target.requestPath,
      status: response.status,
      capturedAt: new Date().toISOString(),
      contentType,
      file,
      summary: topLevelSummary(sanitized),
    });
    manifest.requestsCompleted += 1;
    writeJsonAtomic(MANIFEST_PATH, manifest);
    console.log(`${target.label}: HTTP ${response.status}`);
  }

  manifest.status = "completed";
  manifest.completedAt = new Date().toISOString();
  writeJsonAtomic(MANIFEST_PATH, manifest);
  console.log(
    `Discovery completata: ${manifest.requestsCompleted}/${targets.length} richieste, output sanificati.`,
  );
}

async function completeOddsPages() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error("Manifest canonico non trovato.");
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.status !== "completed" || manifest.requestsCompleted !== targets.length) {
    throw new Error("Il run canonico non è completo.");
  }
  if (manifest.entries.some((entry) => oddsCompletionTargets.some((target) => target.label === entry.label))) {
    throw new Error("Le pagine quote aggiuntive risultano già acquisite.");
  }
  if (manifest.requestsStarted + oddsCompletionTargets.length > MAX_REQUESTS) {
    throw new Error("I follow-up supererebbero il tetto richieste.");
  }

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

  let lastRequestAt = 0;
  for (const target of oddsCompletionTargets) {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
    }
    manifest.requestsStarted += 1;
    lastRequestAt = Date.now();

    const url = new URL(target.requestPath, baseUrl);
    if (url.origin !== baseUrl.origin) throw new Error("Target esterno alla base URL autorizzata.");
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Token ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error(`Richiesta ${target.label} non completata.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("json")
      ? await response.json()
      : { text: (await response.text()).slice(0, 10_000) };
    const sanitized = sanitize(body);
    const file = `${target.label}.json`;
    writeJsonAtomic(path.join(OUTPUT_DIR, file), sanitized);
    manifest.entries.push({
      label: target.label,
      requestPath: target.requestPath,
      status: response.status,
      capturedAt: new Date().toISOString(),
      contentType,
      file,
      summary: topLevelSummary(sanitized),
    });
    manifest.requestsCompleted += 1;
    writeJsonAtomic(MANIFEST_PATH, manifest);
    console.log(`${target.label}: HTTP ${response.status}`);
  }

  manifest.policy.followsPagination = "two-fixed-odds-pages-only";
  manifest.policy.oddsPaginationFollowUps = oddsCompletionTargets.length;
  manifest.completedAt = new Date().toISOString();
  writeJsonAtomic(MANIFEST_PATH, manifest);
  console.log(`Quote completate: ${manifest.requestsCompleted}/${MAX_REQUESTS} richieste canoniche.`);
}

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.size === 0) {
  printHelp();
} else if (args.has("--dry-run")) {
  console.log(
    JSON.stringify(
      {
        method: "GET",
        plannedRequests: targets.length,
        maxRequests: MAX_REQUESTS,
        followsPagination: false,
        sampleEventIds: [EVENT_FINISHED, EVENT_UPCOMING],
        targets: targets.map(({ label, requestPath }) => ({ label, requestPath })),
      },
      null,
      2,
    ),
  );
} else if (args.has("--execute")) {
  await execute();
} else if (args.has("--complete-odds-pages")) {
  await completeOddsPages();
} else {
  throw new Error("Opzione non riconosciuta. Usare --help.");
}
