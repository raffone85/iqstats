import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REQUEST_TIMEOUT_MS = 20_000;

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function localPostgres() {
  const docker = path.join(
    process.env.LOCALAPPDATA ?? "",
    "Programs",
    "DockerDesktop",
    "resources",
    "bin",
    "docker.exe",
  );
  assert(fs.existsSync(docker), "local_docker_missing");
  const containers = spawnSync(docker, ["ps", "--format", "{{json .}}"], {
    encoding: "utf8",
    windowsHide: true,
  }).stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((item) => /postgres/i.test(String(item.Image)));
  assert(containers.length === 1, "local_postgres_not_unique");
  return { docker, container: containers[0].ID };
}

function readLocalSql(database, sql) {
  const result = spawnSync(
    database.docker,
    ["exec", "-i", database.container, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", windowsHide: true },
  );
  assert(result.status === 0, "local_database_query_failed");
  return result.stdout.trim();
}

function readExistingServerProviderBase() {
  const bsdModulePath = path.resolve("apps/web/src/lib/bsd.ts");
  if (!fs.existsSync(bsdModulePath)) return undefined;
  return fs.readFileSync(bsdModulePath, "utf8").match(/BSD_API_BASE_URL\s*\?\?\s*"([^"]+)"/)?.[1];
}

function providerConfiguration() {
  const credential = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
  const configuredBase =
    process.env.IQSTATS_PROVIDER_BASE_URL ??
    process.env.BSD_API_BASE_URL ??
    readExistingServerProviderBase();
  assert(credential && configuredBase, "provider_configuration_missing");
  const baseUrl = new URL(configuredBase);
  assert(baseUrl.protocol === "https:" || baseUrl.protocol === "http:", "provider_configuration_invalid");
  return { credential, baseUrl };
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function valueShape(value) {
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "record";
  if (value === null || value === undefined) return "absent";
  return "scalar";
}

function rowCollectionVariant(payload) {
  const variants = [
    ["primary", payload.standings],
    ["tabular", payload.table],
    ["result_list", payload.results],
    ["data_list", payload.data],
    ["ranking_list", payload.ranking],
    ["item_list", payload.items],
  ];
  return variants.find(([, value]) => Array.isArray(value))?.[0] ?? "absent";
}

function firstUnappliedSeason(database) {
  const sql = [
    "select json_build_object(",
    "  'competitionSourceId', c.source_id,",
    "  'seasonSourceId', s.source_id",
    ")::text",
    "from football.seasons s",
    "join football.competitions c on c.id = s.competition_id",
    "where s.ingest_scope = 'product_current'",
    "  and not exists (select 1 from football.matches m where m.season_id = s.id)",
    "  and not exists (select 1 from football.standing_snapshots ss where ss.season_id = s.id)",
    "order by s.id",
    "limit 1;",
  ].join("\n");
  const output = readLocalSql(database, sql);
  assert(output, "unapplied_season_missing");
  return JSON.parse(output);
}

async function main() {
  const database = localPostgres();
  const targetSeason = firstUnappliedSeason(database);
  const { credential, baseUrl } = providerConfiguration();
  const target = new URL(
    "/api/v2/leagues/" + targetSeason.competitionSourceId + "/standings/?season_id=" + targetSeason.seasonSourceId,
    baseUrl,
  );
  assert(target.origin === baseUrl.origin, "provider_target_out_of_scope");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(target, {
      method: "GET",
      headers: { Authorization: "Token " + credential },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new Error("provider_read_failed");
  } finally {
    clearTimeout(timeout);
  }

  assert(response.ok, "provider_standings_unavailable");
  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw new Error("provider_response_invalid");
  }

  const rootRecord = payload !== null && typeof payload === "object" && !Array.isArray(payload);
  const rows = rootRecord ? payload.standings : undefined;
  const season = rootRecord ? payload.season : undefined;
  const summary = {
    schemaVersion: "iqstats.data1.standing-contract-diagnostic.v1",
    status: "completed",
    requests: {
      method: "GET",
      started: 1,
      completed: 1,
      cap: 1,
      maxPerSecond: 2,
      providerWrites: 0,
      remoteDatabaseAccesses: 0,
      rawResponsesPersisted: 0,
    },
    classification: {
      response: rootRecord ? "record" : valueShape(payload),
      rowsCollection: valueShape(rows),
      alternateRowsVariant: rootRecord ? rowCollectionVariant(payload) : "absent",
      seasonEnvelope: valueShape(season),
      competitionReference: rootRecord && positiveInteger(payload.league_id) ? "valid" : "missing_or_invalid",
      seasonReference: season !== null && typeof season === "object" && positiveInteger(season.id) ? "valid" : "missing_or_invalid",
      rowsObserved: Array.isArray(rows) ? rows.length : null,
    },
  };
  process.stdout.write(JSON.stringify(summary) + "\n");
}

main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "diagnostic_failed";
  process.stderr.write("DATA-1 diagnostic stopped: " + code + ".\n");
  process.exitCode = 1;
});
