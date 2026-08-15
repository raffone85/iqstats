import fs from "node:fs";
import path from "node:path";

const RUN_DATE = "2026-08-09";
const AS_OF_DATE = "2026-08-09";
const OUTPUT_DIR = path.resolve(`scripts/app-ingestion/output/${RUN_DATE}`);
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const REPORT_JSON_PATH = path.join(OUTPUT_DIR, "DATA-0-REPORT.json");
const REPORT_MD_PATH = path.join(OUTPUT_DIR, "DATA-0-REPORT.md");
const CALIBRATION_MANIFEST_PATH = path.resolve("scripts/calibration/data/manifest.json");
const EXISTING_PROVIDER_CLIENT_PATH = path.resolve(
  "scripts/app-discovery/discoverMvpContracts.mjs",
);

const MAX_REQUESTS = 50;
const REQUEST_INTERVAL_MS = 550;
const REQUEST_TIMEOUT_MS = 15_000;
const CATALOG_LIMIT = 200;

function printHelp() {
  console.log(`DATA-0 provider preflight

Usage:
  node --env-file=apps/web/.env.local scripts/app-ingestion/preflight.mjs --dry-run
  node --env-file=apps/web/.env.local scripts/app-ingestion/preflight.mjs --execute
  node scripts/app-ingestion/preflight.mjs --reaudit

Safety contract:
  GET only; hard cap ${MAX_REQUESTS}; at most two requests/second; no remote writes;
  no raw response persistence; local aggregate reports contain no remote identifiers,
  public URLs, request metadata or credential material.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readExistingBaseFallback() {
  if (!fs.existsSync(EXISTING_PROVIDER_CLIENT_PATH)) return null;
  const source = fs.readFileSync(EXISTING_PROVIDER_CLIENT_PATH, "utf8");
  const match = source.match(
    /process\.env\.BSD_API_BASE_URL\s*\?\?\s*["'](https?:\/\/[^"']+)["']/s,
  );
  return match?.[1] ?? null;
}

function writeAtomic(filePath, content) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function assertEmptyOutputDirectory() {
  if (!fs.existsSync(OUTPUT_DIR)) return;
  const entries = fs.readdirSync(OUTPUT_DIR);
  assert(entries.length === 0, "La directory DATA-0 esiste gia e non e vuota.");
}

function resultRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  const preferredKeys = ["results", "standings", "items", "data"];
  for (const key of preferredKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  const firstArray = Object.values(payload).find(Array.isArray);
  return firstArray ?? [];
}

function numericCount(payload, rows) {
  if (isRecord(payload) && Number.isInteger(payload.count) && payload.count >= 0) {
    return payload.count;
  }
  if (rows.length > 0) return rows.length;
  return isRecord(payload) && Object.keys(payload).length > 0 ? 1 : 0;
}

function responseSummary(payload, bytes) {
  const rows = resultRows(payload);
  return {
    shape: Array.isArray(payload) ? "array" : isRecord(payload) ? "object" : "scalar",
    explicitTotal: numericCount(payload, rows),
    returnedRows: rows.length,
    topLevelFieldCount: isRecord(payload) ? Object.keys(payload).length : null,
    sampleRowFieldCount: isRecord(rows[0]) ? Object.keys(rows[0]).length : null,
    paginationDeclared:
      isRecord(payload) && (Object.hasOwn(payload, "next") || Object.hasOwn(payload, "previous")),
    responseBytes: bytes,
  };
}

function collectKeys(value, keys = new Set(), depth = 0) {
  if (depth > 5 || value === null || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 3)) collectKeys(item, keys, depth + 1);
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key.toLowerCase());
    collectKeys(child, keys, depth + 1);
  }
  return keys;
}

function semanticCoverage(payload) {
  const keys = collectKeys(payload);
  const has = (pattern) => [...keys].some((key) => pattern.test(key));
  return {
    competition: has(/league|competition/),
    season: has(/season/),
    kickoff: has(/start|kick|date|time/),
    status: has(/status|state/),
    teams: has(/team|home|away/),
    score: has(/score|goal/),
    venue: has(/venue|stadium/),
    referee: has(/referee|official/),
    manager: has(/manager|coach/),
    player: has(/player/),
    lineup: has(/lineup|formation|starter|substitute/),
    statistics: has(/stat|shot|corner|foul|card|offside|save/),
    odds: has(/odd|market|bookmaker|price|line/),
    transfer: has(/transfer|fee|from_team|to_team/),
  };
}

function firstInteger(record, keys) {
  if (!isRecord(record)) return null;
  for (const key of keys) {
    if (Number.isInteger(record[key]) && record[key] > 0) return record[key];
  }
  return null;
}

function nestedInteger(record, relationKeys) {
  if (!isRecord(record)) return null;
  for (const relationKey of relationKeys) {
    const nested = record[relationKey];
    if (isRecord(nested)) {
      const value = firstInteger(nested, ["id"]);
      if (value !== null) return value;
    }
  }
  return null;
}

function eventIdentifier(event) {
  return firstInteger(event, ["id", "event_id", "match_id"]);
}

function teamIdentifier(event) {
  return (
    firstInteger(event, ["home_team_id", "away_team_id", "team_id"]) ??
    nestedInteger(event, ["home_team", "away_team", "team"])
  );
}

function deepIdentifier(value, relationPattern, depth = 0) {
  if (depth > 5 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const child of value.slice(0, 10)) {
      const found = deepIdentifier(child, relationPattern, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (relationPattern.test(key)) {
      if (Number.isInteger(child) && child > 0) return child;
      if (isRecord(child)) {
        const found = firstInteger(child, ["id"]);
        if (found !== null) return found;
      }
    }
    const nested = deepIdentifier(child, relationPattern, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

function normalizedPath(value) {
  return value.replace(/\/+$/, "");
}

function classifySpecPath(specPath) {
  const lower = specPath.toLowerCase();
  if (lower.includes("standing")) return "standings";
  if (lower.includes("lineup")) return "lineups";
  if (lower.includes("h2h") || lower.includes("head-to-head")) return "headToHead";
  if (lower.includes("stat")) return "statistics";
  if (lower.includes("odd")) return "odds";
  if (lower.includes("transfer")) return "transfers";
  if (lower.includes("player")) return "players";
  if (lower.includes("manager") || lower.includes("coach")) return "managers";
  if (lower.includes("referee") || lower.includes("official")) return "referees";
  if (lower.includes("venue") || lower.includes("stadium")) return "venues";
  if (lower.includes("team")) return "teams";
  if (lower.includes("season")) return "seasons";
  if (lower.includes("league") || lower.includes("competition")) return "competitions";
  if (lower.includes("event") || lower.includes("match")) return "matches";
  return "other";
}

function footballGetInventory(openApiDocument) {
  const counts = {};
  const getPaths = [];
  if (!isRecord(openApiDocument) || !isRecord(openApiDocument.paths)) {
    return { total: 0, counts, getPaths };
  }
  for (const [specPath, operations] of Object.entries(openApiDocument.paths)) {
    if (!isRecord(operations) || !isRecord(operations.get)) continue;
    if (!specPath.toLowerCase().includes("/api/v2/")) continue;
    const domain = classifySpecPath(specPath);
    counts[domain] = (counts[domain] ?? 0) + 1;
    getPaths.push(specPath);
  }
  return { total: getPaths.length, counts, getPaths };
}

function findSpecPath(getPaths, predicate) {
  return getPaths.find((candidate) => predicate(candidate.toLowerCase())) ?? null;
}

function hasSpecPath(getPaths, expected) {
  const normalizedExpected = normalizedPath(expected);
  return getPaths.some((candidate) => normalizedPath(candidate) === normalizedExpected);
}

function replaceSingleIdentifier(specPath, identifier) {
  return specPath.replace(/\{[^}]+\}/g, String(identifier));
}

function seasonClass(season) {
  if (!isRecord(season)) return "unknown";
  const start = typeof season.start_date === "string" ? season.start_date : "";
  const end = typeof season.end_date === "string" ? season.end_date : "";
  if (start.startsWith("2026-") && end.startsWith("2027-")) return "crossYear2026_27";
  if (start.startsWith("2026-") && end.startsWith("2026-")) return "calendar2026";
  return "otherCurrent";
}

function currentSeason(league) {
  return isRecord(league?.current_season) ? league.current_season : null;
}

function seasonDate(season, key) {
  const value = season?.[key];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function safeOutputScan(content) {
  const forbidden = [
    /https?:\/\//i,
    /\/api\/v\d+\//i,
    /authorization/i,
    /bearer\s/i,
    /token/i,
    /x-api/i,
    /api[-_]?key/i,
    /price_[a-z0-9_]+/i,
    /"(?:id|[a-z_]+_id|[a-z]+Id)"\s*:/,
  ];
  return forbidden.filter((pattern) => pattern.test(content)).map((pattern) => pattern.source);
}

function reportMarkdown(report) {
  const domainRows = Object.entries(report.contracts)
    .map(
      ([domain, value]) =>
        `| ${domain} | ${value.status} | ${value.requests} | ${value.successfulResponses} | ${value.explicitRows ?? "—"} |`,
    )
    .join("\n");
  const inventoryRows = Object.entries(report.endpointInventory.byDomain)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, count]) => `| ${domain} | ${count} |`)
    .join("\n");

  return `# DATA-0 — Provider preflight per APP-3D

## Esito

Preflight completato in sola lettura. Sono state avviate ${report.requests.started} richieste GET
su un massimo autorizzato di ${report.requests.limit}, con frequenza non superiore a due al
secondo. Non sono state effettuate scritture remote e non sono state conservate risposte grezze.

Il catalogo locale di prodotto definisce ${report.scope.regularLeaguePolicyCount} campionati
regolari supportati. Il catalogo corrente ne rende interrogabili
${report.scope.providerCurrentSeasonCount}; ${report.scope.productFreshSeasonEligibleCount}
rispettano già la finestra prodotto stretta. Le stagioni sono interpretate tramite il marcatore
corrente del provider: ${report.scope.seasonClasses.crossYear2026_27} stagioni 2026/27,
${report.scope.seasonClasses.calendar2026} stagioni nell'anno solare 2026 e
${report.scope.seasonClasses.otherCurrent} casi correnti con altra finestra esplicita. Questi
ultimi restano sospesi da DATA-1 fino al rollover del catalogo o a una conferma umana.

## Volume corrente osservato

- gare dichiarate nelle finestre di stagione corrente: ${report.volume.currentSeasonMatches};
- campionati interrogati per il calendario: ${report.scope.scheduleRequests};
- campionati con calendario vuoto: ${report.scope.emptySchedules};
- stima tecnica del solo nucleo relazionale gare e indici: ${report.volume.coreStorageMiBLow}–${report.volume.coreStorageMiBHigh} MiB;
- le proiezioni di quote, statistiche e formazioni restano separate finché il campione non è
  rappresentativo: non vengono moltiplicate artificialmente per tutte le gare.

## Inventario GET calcistico

Il contratto macchina dichiara ${report.endpointInventory.totalGetOperations} operazioni GET
nel perimetro calcistico/versionato osservato. Il conteggio seguente è per dominio e non espone
percorsi o indirizzi.

| Dominio | Operazioni dichiarate |
| --- | ---: |
${inventoryRows}

## Contratti campionati

| Dominio | Stato | Richieste | Risposte utili | Righe esplicite |
| --- | --- | ---: | ---: | ---: |
${domainRows}

## Decisione architetturale

PostgreSQL normalizzato resta adeguato per velocità, capacità e qualità: caricamenti a batch,
upsert idempotenti, indici composti sulle chiavi di lettura, snapshot solo quando cambiano e
raw payload esclusi dal database di prodotto. Il volume del nucleo corrente non giustifica
partizionamento anticipato; quote e snapshot verranno rivalutati dopo DATA-1/DATA-3.

## Limiti e gate

- DATA-0 dimostra disponibilità, forma e volumi; non è il caricamento completo.
- Il totale gare include anche i ${report.scope.heldForSeasonRollover} campionati sospesi e non
  rappresenta ancora il conteggio definitivo del perimetro fresco DATA-1.
- La copertura di una sonda non implica copertura uniforme su tutti i campionati o tutte le gare.
- I campi mancanti restano mancanti e non vengono convertiti in zero.
- Prima di migrazioni o letture/scritture sul database remoto resta obbligatorio un checkpoint
  umano sul contratto SQL locale e sul piano di ingestione DATA-1.
`;
}

async function execute() {
  assert(fs.existsSync(CALIBRATION_MANIFEST_PATH), "Manifest locale della policy campionati assente.");
  const calibrationManifest = readJson(CALIBRATION_MANIFEST_PATH);
  const supportedIdentifiers = calibrationManifest?.selectionPolicy?.allowlistedLeagueIds;
  assert(Array.isArray(supportedIdentifiers) && supportedIdentifiers.length > 0, "Policy campionati non valida.");
  assert(supportedIdentifiers.every((value) => Number.isInteger(value) && value > 0), "Policy campionati non valida.");

  const credential = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
  const configuredBase =
    process.env.IQSTATS_PROVIDER_BASE_URL ??
    process.env.BSD_API_BASE_URL ??
    readExistingBaseFallback();
  assert(credential && configuredBase, "Configurazione provider server-side incompleta.");

  let baseUrl;
  try {
    baseUrl = new URL(configuredBase);
  } catch {
    throw new Error("Configurazione provider non valida.");
  }
  assert(/^https?:$/.test(baseUrl.protocol), "Configurazione provider non valida.");

  assertEmptyOutputDirectory();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest = {
    schemaVersion: "iqstats.data0.manifest.v1",
    runDate: RUN_DATE,
    status: "running",
    policy: {
      method: "GET",
      requestLimit: MAX_REQUESTS,
      requestsPerSecondMax: 2,
      remoteWrites: 0,
      rawResponsesPersisted: 0,
      remoteIdentifiersPersisted: 0,
    },
    requestsStarted: 0,
    requestsCompleted: 0,
    entries: [],
  };

  let lastRequestAt = 0;
  async function getJson(domain, requestPath) {
    assert(manifest.requestsStarted < MAX_REQUESTS, "Tetto richieste DATA-0 raggiunto.");
    const url = new URL(requestPath, baseUrl);
    assert(url.origin === baseUrl.origin, "Target fuori dal perimetro autorizzato.");

    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
    }

    manifest.requestsStarted += 1;
    const requestNumber = manifest.requestsStarted;
    lastRequestAt = Date.now();

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Token ${credential}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      manifest.entries.push({
        requestNumber,
        domain,
        completed: false,
        statusCode: null,
        summary: null,
      });
      throw new Error(`Richiesta DATA-0 ${requestNumber} non completata.`);
    }

    const text = await response.text();
    const bytes = Buffer.byteLength(text, "utf8");
    let payload = null;
    try {
      payload = text.length === 0 ? null : JSON.parse(text);
    } catch {
      payload = null;
    }

    const summary = responseSummary(payload, bytes);
    manifest.requestsCompleted += 1;
    manifest.entries.push({
      requestNumber,
      domain,
      completed: true,
      statusCode: response.status,
      summary,
    });
    console.log(`DATA-0 ${requestNumber}/${MAX_REQUESTS}: ${domain}, stato ${response.status}.`);
    return { ok: response.ok, status: response.status, payload, summary };
  }

  const contracts = {};
  function addContract(domain, result) {
    const current = contracts[domain] ?? {
      status: "unavailable",
      requests: 0,
      successfulResponses: 0,
      explicitRows: 0,
      semantics: {},
    };
    current.requests += 1;
    if (result.ok) {
      current.successfulResponses += 1;
      current.status = result.summary.returnedRows > 0 || result.summary.explicitTotal > 0 ? "sampled" : "empty-sample";
      current.explicitRows += result.summary.explicitTotal;
      const semantic = semanticCoverage(result.payload);
      for (const [key, present] of Object.entries(semantic)) {
        current.semantics[key] = Boolean(current.semantics[key] || present);
      }
    } else if (current.successfulResponses === 0) {
      current.status = "unavailable";
    }
    contracts[domain] = current;
  }

  const openApiResult = await getJson("contractCatalog", "/openapi.json");
  addContract("contractCatalog", openApiResult);
  const inventory = footballGetInventory(openApiResult.payload);

  const leagueCatalogResult = await getJson("competitions", `/api/v2/leagues/?limit=${CATALOG_LIMIT}&offset=0`);
  addContract("competitions", leagueCatalogResult);
  const leagueRows = resultRows(leagueCatalogResult.payload);
  const leagueByIdentifier = new Map(
    leagueRows
      .filter((row) => isRecord(row) && Number.isInteger(row.id))
      .map((row) => [row.id, row]),
  );

  const seasonClasses = { crossYear2026_27: 0, calendar2026: 0, otherCurrent: 0, unknown: 0 };
  const eligibleLeagues = [];
  let catalogMissing = 0;
  let policyUnavailable = 0;
  for (const identifier of supportedIdentifiers) {
    const league = leagueByIdentifier.get(identifier);
    if (!league) {
      catalogMissing += 1;
      continue;
    }
    const season = currentSeason(league);
    const startDate = seasonDate(season, "start_date");
    const endDate = seasonDate(season, "end_date");
    if (league.is_active === false || league.is_women === true || !season || !startDate || !endDate) {
      policyUnavailable += 1;
      continue;
    }
    const classification = seasonClass(season);
    seasonClasses[classification] += 1;
    eligibleLeagues.push({ identifier, season, startDate, endDate });
  }

  let currentSeasonMatches = 0;
  let scheduleRequests = 0;
  let emptySchedules = 0;
  let sampleEvent = null;
  let fallbackEvent = null;
  let sampleLeague = null;
  const eventSampleSizes = [];

  for (const league of eligibleLeagues) {
    if (manifest.requestsStarted >= MAX_REQUESTS - 12) break;
    const params = new URLSearchParams({
      league_id: String(league.identifier),
      date_from: league.startDate,
      date_to: league.endDate,
      limit: "1",
      offset: "0",
    });
    const result = await getJson("matches", `/api/v2/events/?${params.toString()}`);
    addContract("matches", result);
    scheduleRequests += 1;
    if (!result.ok) continue;

    currentSeasonMatches += result.summary.explicitTotal;
    if (result.summary.explicitTotal === 0) emptySchedules += 1;
    const rows = resultRows(result.payload);
    if (isRecord(rows[0])) {
      eventSampleSizes.push(Buffer.byteLength(JSON.stringify(rows[0]), "utf8"));
      const candidate = rows[0];
      const candidateStatus = String(candidate.status ?? candidate.state ?? "").toLowerCase();
      if (fallbackEvent === null) {
        fallbackEvent = candidate;
        sampleLeague = league;
      }
      if (sampleEvent === null && /finished|complete|full.?time|\bft\b/.test(candidateStatus)) {
        sampleEvent = candidate;
        sampleLeague = league;
      }
    }
  }
  sampleEvent ??= fallbackEvent;

  async function probe(domain, requestPath) {
    if (manifest.requestsStarted >= MAX_REQUESTS) return null;
    const result = await getJson(domain, requestPath);
    addContract(domain, result);
    return result;
  }

  let detailResult = null;
  let playerListResult = null;
  if (sampleEvent && sampleLeague) {
    const matchValue = eventIdentifier(sampleEvent);
    const seasonValue = firstInteger(sampleLeague.season, ["id"]);
    const leagueValue = sampleLeague.identifier;
    if (matchValue !== null && seasonValue !== null) {
      const standingsTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => candidate.includes("league") && candidate.includes("standing") && candidate.includes("{"),
      );
      if (standingsTemplate) {
        await probe(
          "standings",
          `${replaceSingleIdentifier(standingsTemplate, leagueValue)}?season_id=${seasonValue}`,
        );
      }

      const detailTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => /events?\/\{[^}]+\}\/?$/.test(candidate),
      );
      if (detailTemplate) detailResult = await probe("matchDetail", replaceSingleIdentifier(detailTemplate, matchValue));

      const fixedEventProbes = [
        ["statistics", `/api/v2/events/{id}/stats/`],
        ["headToHead", `/api/v2/events/{id}/h2h/`],
        ["oddsCurrent", `/api/v2/events/{id}/odds/`],
        ["oddsComparison", `/api/v2/events/{id}/odds/comparison/`],
      ];
      for (const [domain, template] of fixedEventProbes) {
        if (hasSpecPath(inventory.getPaths, template)) {
          await probe(domain, replaceSingleIdentifier(template, matchValue));
        }
      }

      const lineupTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => candidate.includes("lineup") && candidate.includes("{"),
      );
      if (lineupTemplate) await probe("lineups", replaceSingleIdentifier(lineupTemplate, matchValue));

      const oddsListTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => /odds?\/?$/.test(candidate) && !candidate.includes("events") && !candidate.includes("{"),
      );
      if (oddsListTemplate) {
        const separator = oddsListTemplate.includes("?") ? "&" : "?";
        await probe("oddsDetailed", `${oddsListTemplate}${separator}event_id=${matchValue}&limit=1&offset=0`);
      }

      const detailPayload = detailResult?.payload ?? sampleEvent;
      const selectedTeam = teamIdentifier(detailPayload) ?? teamIdentifier(sampleEvent);
      const managerValue = deepIdentifier(detailPayload, /manager|coach/);

      const playerListTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => /players?\/?$/.test(candidate) && !candidate.includes("{"),
      );
      if (selectedTeam !== null && playerListTemplate) {
        const separator = playerListTemplate.includes("?") ? "&" : "?";
        playerListResult = await probe("players", `${playerListTemplate}${separator}team_id=${selectedTeam}&limit=1&offset=0`);
      }

      const playerValue = eventIdentifier(resultRows(playerListResult?.payload)[0]);
      const playerDetailTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => /players?\/\{[^}]+\}\/?$/.test(candidate),
      );
      if (playerValue !== null && playerDetailTemplate) {
        await probe("playerDetail", replaceSingleIdentifier(playerDetailTemplate, playerValue));
      }

      const managerDetailTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => /(managers?|coaches?)\/\{[^}]+\}\/?$/.test(candidate),
      );
      if (managerValue !== null && managerDetailTemplate) {
        await probe("managerDetail", replaceSingleIdentifier(managerDetailTemplate, managerValue));
      }

      const transferListTemplate = findSpecPath(
        inventory.getPaths,
        (candidate) => /transfers?\/?$/.test(candidate) && !candidate.includes("{"),
      );
      if (selectedTeam !== null && transferListTemplate) {
        const params = new URLSearchParams({
          team_id: String(selectedTeam),
          date_from: sampleLeague.startDate,
          date_to: AS_OF_DATE,
          limit: "1",
          offset: "0",
        });
        await probe("transfers", `${transferListTemplate}?${params.toString()}`);
      }
    }
  }

  const averageEventBytes =
    eventSampleSizes.length === 0
      ? null
      : Math.round(eventSampleSizes.reduce((sum, value) => sum + value, 0) / eventSampleSizes.length);
  const coreStorageMiBLow = Number(((currentSeasonMatches * 2 * 1024) / 1024 ** 2).toFixed(1));
  const coreStorageMiBHigh = Number(((currentSeasonMatches * 6 * 1024) / 1024 ** 2).toFixed(1));

  const report = {
    schemaVersion: "iqstats.data0.report.v1",
    generatedAt: new Date().toISOString(),
    status: "completed-awaiting-local-schema-review",
    scope: {
      regularLeaguePolicyCount: supportedIdentifiers.length,
      catalogRowsReturned: leagueRows.length,
      catalogMissing,
      policyUnavailable,
      currentSeasonEligibleCount: eligibleLeagues.length,
      providerCurrentSeasonCount: eligibleLeagues.length,
      productFreshSeasonEligibleCount:
        seasonClasses.crossYear2026_27 + seasonClasses.calendar2026,
      heldForSeasonRollover: seasonClasses.otherCurrent + seasonClasses.unknown,
      scheduleRequests,
      emptySchedules,
      seasonClasses,
    },
    requests: {
      method: "GET",
      started: manifest.requestsStarted,
      completed: manifest.requestsCompleted,
      limit: MAX_REQUESTS,
      requestsPerSecondMax: 2,
      remoteWrites: 0,
    },
    endpointInventory: {
      totalGetOperations: inventory.total,
      byDomain: inventory.counts,
      rawPathsPersisted: 0,
    },
    volume: {
      currentSeasonMatches,
      observedEventSampleCount: eventSampleSizes.length,
      averageObservedEventBytes: averageEventBytes,
      coreStorageMiBLow,
      coreStorageMiBHigh,
      estimateBasis: "engineering range of 2-6 KiB per normalized match including core indexes",
      volatileDomainProjection: null,
    },
    contracts,
    verification: {
      withinRequestLimit: manifest.requestsStarted <= MAX_REQUESTS,
      onlyGet: true,
      rateLimitMilliseconds: REQUEST_INTERVAL_MS,
      remoteWrites: 0,
      rawResponsesPersisted: 0,
      remoteIdentifiersPersisted: 0,
      appFilesModified: 0,
      databaseTouched: false,
    },
    decision: {
      database: "normalized PostgreSQL",
      ingestion: "idempotent batch upsert with adaptive freshness and change-only snapshots",
      partitioning: "defer until measured snapshot volume requires it",
      ingestScope: "only cross-year 2026/27 and calendar-year 2026; hold other current windows",
      nextGate: "review local SQL contract and DATA-1 ingest plan before any remote database action",
    },
  };

  manifest.status = "completed";
  manifest.completedAt = new Date().toISOString();
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const reportJsonContent = `${JSON.stringify(report, null, 2)}\n`;
  const reportMarkdownContent = reportMarkdown(report);
  const combinedFindings = [
    ...safeOutputScan(manifestContent),
    ...safeOutputScan(reportJsonContent),
    ...safeOutputScan(reportMarkdownContent),
  ];
  assert(combinedFindings.length === 0, "La scansione di sicurezza degli output DATA-0 non e pulita.");
  assert(manifest.requestsStarted <= MAX_REQUESTS, "Limite richieste superato.");
  assert(manifest.requestsStarted === manifest.requestsCompleted, "Richieste incomplete nel manifest.");

  writeAtomic(MANIFEST_PATH, manifestContent);
  writeAtomic(REPORT_JSON_PATH, reportJsonContent);
  writeAtomic(REPORT_MD_PATH, reportMarkdownContent);
  console.log(
    JSON.stringify(
      {
        status: report.status,
        requests: report.requests.started,
        requestLimit: report.requests.limit,
        supportedCompetitions: report.scope.regularLeaguePolicyCount,
        currentSeasonEligible: report.scope.currentSeasonEligibleCount,
        currentSeasonMatches: report.volume.currentSeasonMatches,
        remoteWrites: 0,
        rawResponsesPersisted: 0,
        safetyFindings: 0,
      },
      null,
      2,
    ),
  );
}

function reauditExistingOutput() {
  assert(fs.existsSync(MANIFEST_PATH), "Manifest DATA-0 non trovato.");
  assert(fs.existsSync(REPORT_JSON_PATH), "Report DATA-0 non trovato.");
  const manifest = readJson(MANIFEST_PATH);
  const report = readJson(REPORT_JSON_PATH);
  assert(manifest.status === "completed", "Manifest DATA-0 non completato.");

  for (const entry of manifest.entries ?? []) {
    const summary = entry?.summary;
    if (
      entry?.statusCode >= 200 &&
      entry?.statusCode < 300 &&
      summary?.explicitTotal === 0 &&
      summary?.returnedRows === 0 &&
      Number.isInteger(summary?.topLevelFieldCount) &&
      summary.topLevelFieldCount > 0
    ) {
      summary.explicitTotal = 1;
    }
  }

  for (const [domain, contract] of Object.entries(report.contracts ?? {})) {
    const entries = (manifest.entries ?? []).filter((entry) => entry.domain === domain);
    const successful = entries.filter(
      (entry) => entry.statusCode >= 200 && entry.statusCode < 300,
    );
    const explicitRows = successful.reduce(
      (sum, entry) => sum + (entry.summary?.explicitTotal ?? 0),
      0,
    );
    contract.requests = entries.length;
    contract.successfulResponses = successful.length;
    contract.explicitRows = explicitRows;
    contract.status =
      successful.length === 0 ? "unavailable" : explicitRows > 0 ? "sampled" : "empty-sample";
  }

  const seasonClasses = report.scope?.seasonClasses ?? {};
  const freshCount =
    (seasonClasses.crossYear2026_27 ?? 0) + (seasonClasses.calendar2026 ?? 0);
  const heldCount = (seasonClasses.otherCurrent ?? 0) + (seasonClasses.unknown ?? 0);
  report.scope.providerCurrentSeasonCount = report.scope.currentSeasonEligibleCount;
  report.scope.productFreshSeasonEligibleCount = freshCount;
  report.scope.heldForSeasonRollover = heldCount;
  report.verification.offlineReaudit = true;
  report.decision.ingestScope =
    "only cross-year 2026/27 and calendar-year 2026; hold other current windows";

  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const reportJsonContent = `${JSON.stringify(report, null, 2)}\n`;
  const reportMarkdownContent = reportMarkdown(report);
  const findings = [
    ...safeOutputScan(manifestContent),
    ...safeOutputScan(reportJsonContent),
    ...safeOutputScan(reportMarkdownContent),
  ];
  assert(findings.length === 0, "La scansione di sicurezza del reaudit non e pulita.");
  writeAtomic(MANIFEST_PATH, manifestContent);
  writeAtomic(REPORT_JSON_PATH, reportJsonContent);
  writeAtomic(REPORT_MD_PATH, reportMarkdownContent);
  console.log(
    JSON.stringify(
      {
        mode: "offline-reaudit",
        remoteRequests: 0,
        remoteWrites: 0,
        productFreshSeasonEligible: freshCount,
        heldForSeasonRollover: heldCount,
        safetyFindings: 0,
      },
      null,
      2,
    ),
  );
}

const args = new Set(process.argv.slice(2));
if (args.size === 0 || args.has("--help")) {
  printHelp();
} else if (args.size === 1 && args.has("--dry-run")) {
  const manifest = readJson(CALIBRATION_MANIFEST_PATH);
  const policyCount = manifest?.selectionPolicy?.allowlistedLeagueIds?.length ?? 0;
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        remoteRequests: 0,
        remoteWrites: 0,
        regularLeaguePolicyCount: policyCount,
        plannedRequestMinimum: 2 + policyCount,
        plannedRequestMaximum: MAX_REQUESTS,
        rawResponsesPersisted: 0,
      },
      null,
      2,
    ),
  );
} else if (args.size === 1 && args.has("--execute")) {
  await execute();
} else if (args.size === 1 && args.has("--reaudit")) {
  reauditExistingOutput();
} else {
  throw new Error("Opzione non riconosciuta. Usare --help.");
}
