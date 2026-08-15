import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assembleData1Batch,
  normalizeCurrentCatalog,
  normalizeMatchPage,
  normalizeStandingSnapshot,
} from "./data1-contracts.mjs";

const DATA0_REPORT_PATH = path.resolve(
  "scripts/app-ingestion/output/2026-08-09/DATA-0-REPORT.json",
);
const POLICY_PATH = path.resolve("scripts/calibration/data/manifest.json");
const OUTPUT_ROOT = path.resolve("scripts/app-ingestion/output");
const PAGE_SIZE = 200;
const REQUEST_INTERVAL_MS = 550;
const REQUEST_TIMEOUT_MS = 20_000;
const RECOMMENDED_REQUEST_CAP = 200;

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readExistingServerProviderBase() {
  const bsdModulePath = path.resolve("apps/web/src/lib/bsd.ts");
  if (!fs.existsSync(bsdModulePath)) return undefined;

  const bsdModule = fs.readFileSync(bsdModulePath, "utf8");
  return bsdModule.match(/BSD_API_BASE_URL\s*\?\?\s*"([^"]+)"/)?.[1];
}

function integerArgument(value, name) {
  assert(/^\d+$/.test(value ?? ""), `invalid_${name}`);
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed > 0, `invalid_${name}`);
  return parsed;
}

export function parseData1Args(argv) {
  const modeFlags = argv.filter((value) => value === "--plan" || value === "--execute-local");
  assert(modeFlags.length <= 1, "conflicting_mode");
  const mode = modeFlags[0] === "--execute-local" ? "execute-local" : "plan";
  const resume = argv.includes("--resume-local");
  const approvalArg = argv.find((value) => value.startsWith("--approved-read-cap="));
  const allowed = new Set(["--plan", "--execute-local", "--resume-local", "--help"]);
  for (const value of argv) {
    assert(allowed.has(value) || value.startsWith("--approved-read-cap="), "unknown_argument");
  }

  if (mode === "plan") {
    assert(!approvalArg, "approval_not_valid_in_plan");
    assert(!resume, "resume_not_valid_in_plan");
    return { mode, resume: false, approvedReadCap: null };
  }

  assert(approvalArg, "explicit_read_cap_required");
  const approvedReadCap = integerArgument(approvalArg.split("=", 2)[1], "approved_read_cap");
  assert(approvedReadCap <= RECOMMENDED_REQUEST_CAP, "read_cap_above_reviewed_limit");
  return { mode, resume, approvedReadCap };
}

export function buildData1Plan(data0Report) {
  const freshCompetitions = data0Report?.scope?.productFreshSeasonEligibleCount;
  const heldCompetitions = data0Report?.scope?.heldForSeasonRollover;
  const observedMatches = data0Report?.volume?.currentSeasonMatches;
  assert(Number.isInteger(freshCompetitions) && freshCompetitions > 0, "invalid_data0_scope");
  assert(Number.isInteger(heldCompetitions) && heldCompetitions >= 0, "invalid_data0_scope");
  assert(Number.isInteger(observedMatches) && observedMatches >= 0, "invalid_data0_volume");

  const optimisticMatchPages = Math.ceil(observedMatches / PAGE_SIZE);
  const conservativeMatchPages = Math.ceil(observedMatches / 100) + freshCompetitions;
  return {
    schemaVersion: "iqstats.data1.plan.v1",
    mode: "plan",
    networkCalls: 0,
    databaseWrites: 0,
    scope: {
      regularLeaguePolicyCount: data0Report.scope.regularLeaguePolicyCount,
      productFreshCompetitions: freshCompetitions,
      heldCompetitions,
      seasonPolicy: "cross-year 2026/27 and calendar-year 2026",
    },
    providerReadPlan: {
      method: "GET",
      hardCapRecommended: RECOMMENDED_REQUEST_CAP,
      requestsPerSecondMax: 2,
      estimatedRequestsLow: 1 + optimisticMatchPages + freshCompetitions,
      estimatedRequestsHigh: 1 + conservativeMatchPages + freshCompetitions,
      remoteWrites: 0,
      rawResponsesPersisted: 0,
    },
    destination: "local normalized PostgreSQL only",
    nextHumanCheckpoint: "explicit provider GET cap approval",
  };
}

export function assertSanitizedReport(value) {
  const serialized = JSON.stringify(value);
  const forbidden = [
    /https?:\/\//i,
    /authorization/i,
    /request_headers?/i,
    /price[_ -]?id/i,
    /(?:api|access|secret)[_ -]?(?:key|token)/i,
    /\b[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/i,
  ];
  assert(forbidden.every((pattern) => !pattern.test(serialized)), "unsafe_report_content");
  return value;
}

function printHelp() {
  process.stdout.write(`DATA-1 local ingestion\n\nUsage:\n  npm run plan:data1-ingest\n  node --env-file=apps/web/.env.local scripts/app-ingestion/data1-harvest.mjs --execute-local --approved-read-cap=<authorized-cap>\n\nThe default plan performs zero network calls and zero database writes. Execution is GET-only, rate-limited, capped, normalized in memory and writes only to local PostgreSQL.\n`);
}

function providerConfiguration() {
  const credential = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
  const configuredBase =
    process.env.IQSTATS_PROVIDER_BASE_URL ??
    process.env.BSD_API_BASE_URL ??
    readExistingServerProviderBase();
  assert(credential && configuredBase, "provider_configuration_missing");
  let baseUrl;
  try {
    baseUrl = new URL(configuredBase);
  } catch {
    throw new Error("provider_configuration_invalid");
  }
  assert(baseUrl.protocol === "https:" || baseUrl.protocol === "http:", "provider_configuration_invalid");
  return { credential, baseUrl };
}

function localDockerExecutable() {
  const executable = path.join(
    process.env.LOCALAPPDATA ?? "",
    "Programs",
    "DockerDesktop",
    "resources",
    "bin",
    "docker.exe",
  );
  assert(fs.existsSync(executable), "local_docker_missing");
  return executable;
}

function localPostgres(dockerExecutable) {
  const result = spawnSync(dockerExecutable, ["ps", "--format", "{{json .}}"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert(result.status === 0, "local_docker_unavailable");
  const candidates = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((item) => /postgres/i.test(String(item.Image)));
  assert(candidates.length === 1, "local_postgres_not_unique");
  return candidates[0].ID;
}

function runLocalSql(dockerExecutable, container, sql) {
  const result = spawnSync(
    dockerExecutable,
    ["exec", "-i", container, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
  );
  assert(result.status === 0, "local_database_query_failed");
  return result.stdout.trim();
}

function sqlJson(value) {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes("$iqstats$"), "invalid_normalized_batch");
  return `$iqstats$${serialized}$iqstats$`;
}

function beginRun(database, requestLimit) {
  const output = runLocalSql(
    database.docker,
    database.container,
    `insert into private.football_sync_runs(data_slice, run_mode, status, source_read_only, requests_limit) values ('DATA-1', 'backfill', 'running', true, ${requestLimit}) returning id;`,
  );
  const runId = Number(output.split(/\r?\n/).at(-1));
  assert(Number.isSafeInteger(runId) && runId > 0, "local_run_not_created");
  return runId;
}

function finishRun(database, runId, status, metrics, errorCode = null) {
  const safeError = errorCode === null ? "null" : `'${String(errorCode).replaceAll("'", "")}'`;
  runLocalSql(
    database.docker,
    database.container,
    `update private.football_sync_runs set status='${status}', requests_started=${metrics.requestsStarted}, requests_completed=${metrics.requestsCompleted}, rows_observed=${metrics.rowsObserved}, rows_upserted=${metrics.rowsUpserted}, rows_unchanged=0, rows_rejected=${metrics.rowsRejected}, error_code=${safeError}, completed_at=now() where id=${runId};`,
  );
}

function applyBatch(database, batch) {
  const output = runLocalSql(
    database.docker,
    database.container,
    `select private.apply_football_data1_batch(${sqlJson(batch)}::jsonb)::text;`,
  );
  return JSON.parse(output.split(/\r?\n/).at(-1));
}

function readResumeCatalog(database) {
  const output = runLocalSql(
    database.docker,
    database.container,
    `select jsonb_build_object(
      'competitions', coalesce((
        select jsonb_agg(jsonb_build_object('sourceId', source_id) order by id)
        from football.competitions
      ), '[]'::jsonb),
      'seasons', coalesce((
        select jsonb_agg(jsonb_build_object(
          'sourceId', s.source_id,
          'competitionSourceId', c.source_id,
          'startsOn', s.starts_on::text,
          'endsOn', s.ends_on::text,
          'ingestScope', s.ingest_scope,
          'resumeCompleted', exists (select 1 from football.matches m where m.season_id = s.id)
            or exists (select 1 from football.standing_snapshots ss where ss.season_id = s.id)
        ) order by s.id)
        from football.seasons s
        join football.competitions c on c.id = s.competition_id
      ), '[]'::jsonb)
    )::text;`,
  );
  const catalog = JSON.parse(output.split(/\r?\n/).at(-1));
  assert(Array.isArray(catalog.competitions) && Array.isArray(catalog.seasons), "resume_catalog_invalid");
  return {
    ...catalog,
    productCurrent: catalog.seasons.filter((season) => season.ingestScope === "product_current").length,
    held: catalog.seasons.filter((season) => season.ingestScope === "held").length,
  };
}

export function isStandingCoverageAbsent(payload) {
  return (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.standings === undefined &&
    payload.season !== null &&
    typeof payload.season === "object" &&
    !Array.isArray(payload.season) &&
    Number.isInteger(payload.league_id) &&
    payload.league_id > 0 &&
    Number.isInteger(payload.season.id) &&
    payload.season.id > 0
  );
}

function createReader(configuration, requestCap, metrics) {
  let lastRequestAt = 0;
  return async function getJson(domain, relativePath, { allowNotFound = false } = {}) {
    assert(metrics.requestsStarted < requestCap, "provider_request_cap_reached");
    const target = new URL(relativePath, configuration.baseUrl);
    assert(target.origin === configuration.baseUrl.origin, "provider_target_out_of_scope");
    const waitMilliseconds = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMilliseconds > 0) await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));

    metrics.requestsStarted += 1;
    lastRequestAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(target, {
        method: "GET",
        headers: { Authorization: `Token ${configuration.credential}` },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      throw new Error("provider_read_failed");
    } finally {
      clearTimeout(timeout);
    }
    metrics.requestsCompleted += 1;
    if (allowNotFound && response.status === 404) return null;
    assert(response.ok, `provider_${domain}_unavailable`);
    const contentLength = Number(response.headers.get("content-length"));
    assert(!Number.isFinite(contentLength) || contentLength <= 32 * 1024 * 1024, "provider_response_too_large");
    try {
      return JSON.parse(await response.text());
    } catch {
      throw new Error("provider_response_invalid");
    }
  };
}

function executionReport(metrics, catalog, startedAt) {
  return assertSanitizedReport({
    schemaVersion: "iqstats.data1.ingest-report.v1",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    destination: "local normalized PostgreSQL",
    scope: {
      productFreshCompetitions: catalog.productCurrent,
      heldCompetitions: catalog.held,
    },
    requests: {
      method: "GET",
      started: metrics.requestsStarted,
      completed: metrics.requestsCompleted,
      limit: metrics.requestLimit,
      requestsPerSecondMax: 2,
      remoteWrites: 0,
    },
    normalized: {
      matches: metrics.matches,
      standingSnapshots: metrics.standingSnapshots,
      standingRows: metrics.standingRows,
      unavailableStandings: metrics.unavailableStandings,
      rejectedRows: metrics.rowsRejected,
      rawResponsesPersisted: 0,
    },
    database: {
      batchesApplied: metrics.batchesApplied,
      rowsObserved: metrics.rowsObserved,
      rowsAccepted: metrics.rowsUpserted,
    },
  });
}

function writeExecutionReport(report) {
  const stamp = report.completedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const directory = path.join(OUTPUT_ROOT, report.completedAt.slice(0, 10));
  fs.mkdirSync(directory, { recursive: true });
  const reportPath = path.join(directory, `DATA-1-INGEST-REPORT-${stamp}.json`);
  assert(!fs.existsSync(reportPath), "ingest_report_already_exists");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}${os.EOL}`, { flag: "wx" });
  return path.relative(process.cwd(), reportPath).replaceAll("\\", "/");
}

function supportedCompetitionIds() {
  const policy = readJson(POLICY_PATH);
  const identifiers = policy?.selectionPolicy?.allowlistedLeagueIds;
  assert(Array.isArray(identifiers) && identifiers.length > 0, "competition_policy_invalid");
  assert(identifiers.every((value) => Number.isInteger(value) && value > 0), "competition_policy_invalid");
  return identifiers;
}

async function executeLocal(requestLimit, { resume = false } = {}) {
  const startedAt = new Date().toISOString();
  const metrics = {
    requestLimit,
    requestsStarted: 0,
    requestsCompleted: 0,
    matches: 0,
    standingSnapshots: 0,
    standingRows: 0,
    unavailableStandings: 0,
    batchesApplied: 0,
    rowsObserved: 0,
    rowsUpserted: 0,
    rowsRejected: 0,
  };
  const configuration = providerConfiguration();
  const docker = localDockerExecutable();
  const database = { docker, container: localPostgres(docker) };
  const getJson = createReader(configuration, requestLimit, metrics);
  const runId = beginRun(database, requestLimit);
  let phase = "initialization";

  try {
    const observedAt = new Date().toISOString();
    let catalog;
    if (resume) {
      phase = "resume_catalog_read";
      catalog = readResumeCatalog(database);
    } else {
      phase = "catalog_fetch";
      const catalogPayload = await getJson("catalog", `/api/v2/leagues/?limit=${PAGE_SIZE}&offset=0`);
      phase = "catalog_normalization";
      catalog = normalizeCurrentCatalog(catalogPayload, supportedCompetitionIds(), observedAt);
    }
    assert(catalog.productCurrent > 0, "fresh_scope_empty");

    if (!resume) {
      phase = "catalog_batch_apply";
      const catalogBatch = assembleData1Batch({ catalog, matchPages: [], standings: [], observedAt });
      const catalogResult = applyBatch(database, catalogBatch);
      metrics.batchesApplied += 1;
      metrics.rowsObserved += catalogBatch.competitions.length + catalogBatch.seasons.length;
      metrics.rowsUpserted += catalogResult.competitionsAccepted + catalogResult.seasonsAccepted;
    }

    const freshSeasons = catalog.seasons.filter(
      (season) => season.ingestScope === "product_current" && (!resume || !season.resumeCompleted),
    );
    for (let index = 0; index < freshSeasons.length; index += 1) {
      const season = freshSeasons[index];
      const competition = catalog.competitions.find((item) => item.sourceId === season.competitionSourceId);
      assert(competition, "fresh_competition_missing");
      const matchPages = [];
      let offset = 0;
      let declaredTotal = null;
      let returnedRows = 0;

      do {
        const params = new URLSearchParams({
          league_id: String(competition.sourceId),
          date_from: season.startsOn,
          date_to: season.endsOn,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        phase = "match_fetch";
        const payload = await getJson("matches", `/api/v2/events/?${params.toString()}`);
        const pageObservedAt = new Date().toISOString();
        phase = "match_normalization";
        const page = normalizeMatchPage(payload, pageObservedAt);
        assert(
          page.matches.every(
            (match) =>
              match.competitionSourceId === competition.sourceId && match.seasonSourceId === season.sourceId,
          ),
          "match_scope_mismatch",
        );
        matchPages.push(page);
        declaredTotal ??= page.declaredTotal;
        returnedRows += page.returned;
        offset += page.returned;
        metrics.rowsRejected += page.rejected.length;
        if (page.returned === 0) break;
      } while (returnedRows < declaredTotal);

      assert(declaredTotal === null || returnedRows >= declaredTotal, "match_pagination_incomplete");
      phase = "standings_fetch";
      const standingsPayload = await getJson(
        "standings",
        `/api/v2/leagues/${competition.sourceId}/standings/?season_id=${season.sourceId}`,
        { allowNotFound: true },
      );
      const standings = [];
      if (standingsPayload === null || isStandingCoverageAbsent(standingsPayload)) {
        metrics.unavailableStandings += 1;
      } else {
        phase = "standings_normalization";
        const standing = normalizeStandingSnapshot(standingsPayload, new Date().toISOString());
        assert(
          standing.snapshot.competitionSourceId === competition.sourceId &&
            standing.snapshot.seasonSourceId === season.sourceId,
          "standing_scope_mismatch",
        );
        standings.push(standing);
        metrics.rowsRejected += standing.rejected.length;
      }

      const batch = assembleData1Batch({
        catalog: { competitions: [], seasons: [] },
        matchPages,
        standings,
        observedAt: new Date().toISOString(),
      });
      phase = "competition_batch_apply";
      const result = applyBatch(database, batch);
      metrics.batchesApplied += 1;
      metrics.matches += batch.matches.length;
      metrics.standingSnapshots += batch.standings.length;
      metrics.standingRows += batch.standings.reduce((sum, snapshot) => sum + snapshot.rows.length, 0);
      metrics.rowsObserved +=
        batch.teams.length +
        batch.matches.length +
        batch.standings.length +
        batch.standings.reduce((sum, snapshot) => sum + snapshot.rows.length, 0);
      metrics.rowsUpserted +=
        result.teamsAccepted +
        result.matchesAccepted +
        result.snapshotsInserted +
        result.standingRowsInserted;
      process.stdout.write(`DATA-1 competition ${index + 1}/${freshSeasons.length} completed.\n`);
    }

    phase = "run_completion";
    finishRun(database, runId, "completed", metrics);
    const report = executionReport(metrics, catalog, startedAt);
    const reportPath = writeExecutionReport(report);
    process.stdout.write(`${JSON.stringify({ status: "completed", report: reportPath, ...report.requests, ...report.normalized })}\n`);
  } catch (error) {
    const code =
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : `data1_${phase}_failed`;
    try {
      finishRun(database, runId, "failed", metrics, code);
    } catch {
      // Preserve the original sanitized failure code.
    }
    throw new Error(code);
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  const options = parseData1Args(process.argv.slice(2));
  if (options.mode === "plan") {
    const plan = assertSanitizedReport(buildData1Plan(readJson(DATA0_REPORT_PATH)));
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  await executeLocal(options.approvedReadCap, { resume: options.resume });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "data1_ingest_failed";
    process.stderr.write(`DATA-1 stopped: ${code}.\n`);
    process.exitCode = 1;
  });
}
