import fs from "node:fs";
import path from "node:path";

const REQUEST_CAP = 3;
const REQUEST_INTERVAL_MS = 550;
const REQUEST_TIMEOUT_MS = 20_000;
const EXISTING_PROVIDER_CLIENT_PATH = path.resolve("apps/web/src/lib/bsd.ts");

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

function mediaSemantic(key) {
  const normalized = key.toLowerCase();
  if (/(logo|badge|crest|emblem)/.test(normalized)) return "logo_like";
  if (/(image|photo|avatar|icon)/.test(normalized)) return "photo_like";
  return null;
}

function summarizeMediaFields(value, summary = new Map(), depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return summary;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 250)) summarizeMediaFields(item, summary, depth + 1);
    return summary;
  }
  for (const [key, child] of Object.entries(value)) {
    const semantic = mediaSemantic(key);
    if (semantic) {
      const types = summary.get(semantic) ?? new Set();
      types.add(valueType(child));
      summary.set(semantic, types);
    }
    summarizeMediaFields(child, summary, depth + 1);
  }
  return summary;
}

function sanitiseMediaSummary(value) {
  return [...summarizeMediaFields(value)]
    .map(([semantic, types]) => ({ semantic, valueTypes: [...types].sort() }))
    .sort((left, right) => left.semantic.localeCompare(right.semantic));
}

function firstRecord(payload) {
  if (!isRecord(payload)) return null;
  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(payload[key]) && isRecord(payload[key][0])) return payload[key][0];
  }
  return payload;
}

function catalogRecords(payload) {
  if (!isRecord(payload)) return [];
  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(payload[key])) return payload[key].filter(isRecord);
  }
  return [];
}

function matchSamplePath(catalogPayload) {
  const competition = catalogRecords(catalogPayload).find((candidate) => {
    const season = candidate.current_season;
    return (
      Number.isInteger(candidate.id) &&
      candidate.id > 0 &&
      candidate.is_active !== false &&
      candidate.is_women !== true &&
      isRecord(season) &&
      typeof season.start_date === "string" &&
      typeof season.end_date === "string"
    );
  });
  if (!competition) return null;
  const parameters = new URLSearchParams({
    league_id: String(competition.id),
    date_from: competition.current_season.start_date,
    date_to: competition.current_season.end_date,
    limit: "1",
    offset: "0",
  });
  return `/api/v2/events/?${parameters.toString()}`;
}

function teamRecords(match) {
  if (!isRecord(match)) return [];
  const candidates = [];
  for (const key of ["home_team", "away_team", "home", "away", "team", "teams"]) {
    const value = match[key];
    if (isRecord(value)) candidates.push(value);
    if (Array.isArray(value)) candidates.push(...value.filter(isRecord));
  }
  return candidates;
}

function teamIdentifier(match) {
  if (!isRecord(match)) return null;
  for (const key of ["home_team_id", "away_team_id", "team_id"]) {
    if (Number.isInteger(match[key]) && match[key] > 0) return match[key];
  }
  for (const team of teamRecords(match)) {
    if (Number.isInteger(team.id) && team.id > 0) return team.id;
  }
  return null;
}

function readExistingBaseFallback() {
  if (!fs.existsSync(EXISTING_PROVIDER_CLIENT_PATH)) return null;
  const source = fs.readFileSync(EXISTING_PROVIDER_CLIENT_PATH, "utf8");
  const match = source.match(
    /process\.env\.BSD_API_BASE_URL\s*\?\?\s*["'](https?:\/\/[^"']+)["']/s,
  );
  return match?.[1] ?? null;
}

function providerConfiguration() {
  const credential = process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN;
  const configuredBase =
    process.env.IQSTATS_PROVIDER_BASE_URL ?? process.env.BSD_API_BASE_URL ?? readExistingBaseFallback();
  assert(credential && configuredBase, "provider_configuration_missing");
  let baseUrl;
  try {
    baseUrl = new URL(configuredBase);
  } catch {
    throw new Error("provider_configuration_invalid");
  }
  assert(/^https?:$/.test(baseUrl.protocol), "provider_configuration_invalid");
  return { credential, baseUrl };
}

async function main() {
  const configuration = providerConfiguration();
  const metrics = { started: 0, completed: 0 };
  let lastRequestAt = 0;

  async function getJson(path) {
    assert(metrics.started < REQUEST_CAP, "request_cap_reached");
    const target = new URL(path, configuration.baseUrl);
    assert(target.origin === configuration.baseUrl.origin, "target_out_of_scope");
    const delay = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    metrics.started += 1;
    lastRequestAt = Date.now();
    let response;
    try {
      response = await fetch(target, {
        method: "GET",
        headers: { Authorization: `Token ${configuration.credential}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, code: "provider_unavailable", payload: null };
    }
    metrics.completed += 1;
    if (!response.ok) return { ok: false, code: "provider_unavailable", payload: null };
    try {
      return { ok: true, code: null, payload: JSON.parse(await response.text()) };
    } catch {
      return { ok: false, code: "provider_response_invalid", payload: null };
    }
  }

  const catalog = await getJson("/api/v2/leagues/?limit=200&offset=0");
  const samplePath = catalog.ok ? matchSamplePath(catalog.payload) : null;
  const match = samplePath
    ? await getJson(samplePath)
    : { ok: false, code: "match_sample_unavailable", payload: null };
  const matchRecord = firstRecord(match.payload);
  const teamMedia = sanitiseMediaSummary(teamRecords(matchRecord));
  let teamDetail = { status: "not_needed", mediaFields: [] };

  if (match.ok && teamMedia.length === 0) {
    const selectedTeam = teamIdentifier(matchRecord);
    if (selectedTeam === null) {
      teamDetail = { status: "unavailable", mediaFields: [] };
    } else {
      const detail = await getJson(`/api/v2/teams/${selectedTeam}/`);
      teamDetail = {
        status: detail.ok ? "sampled" : detail.code,
        mediaFields: detail.ok ? sanitiseMediaSummary(firstRecord(detail.payload)) : [],
      };
    }
  }

  const report = {
    schemaVersion: "iqstats.media-discovery.v1",
    status: "completed",
    requests: {
      method: "GET",
      started: metrics.started,
      completed: metrics.completed,
      cap: REQUEST_CAP,
      maxPerSecond: 2,
      providerWrites: 0,
      remoteDatabaseAccesses: 0,
      rawResponsesPersisted: 0,
    },
    competitions: {
      status: catalog.ok ? "sampled" : catalog.code,
      mediaFields: catalog.ok ? sanitiseMediaSummary(catalog.payload) : [],
    },
    matchTeams: {
      status: match.ok ? "sampled" : match.code,
      mediaFields: match.ok ? teamMedia : [],
    },
    teamDetail,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "media_discovery_failed";
  process.stderr.write(`Media discovery stopped: ${code}.\n`);
  process.exitCode = 1;
});
