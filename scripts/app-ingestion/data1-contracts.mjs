import { createHash } from "node:crypto";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integer(value) {
  return Number.isInteger(value) ? value : null;
}

function positiveInteger(value) {
  const parsed = integer(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = integer(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function booleanValue(value) {
  return typeof value === "boolean" ? value : null;
}

function dateOnly(value) {
  const parsed = text(value);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return null;
  return Number.isNaN(Date.parse(`${parsed}T00:00:00Z`)) ? null : parsed;
}

function dateTime(value) {
  const parsed = text(value);
  if (!parsed) return null;
  const milliseconds = Date.parse(parsed);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function contentChecksum(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function normalizedStatus(value) {
  const raw = isRecord(value) ? text(value.name) : text(value);
  const compact = raw?.toLowerCase().replaceAll("-", "").replaceAll("_", "").replaceAll(" ", "");
  switch (compact) {
    case "notstarted":
    case "scheduled":
    case "upcoming":
      return "scheduled";
    case "live":
    case "inprogress":
      return "live";
    case "finished":
    case "final":
    case "fulltime":
      return "finished";
    case "postponed":
      return "postponed";
    case "cancelled":
    case "canceled":
      return "canceled";
    case "abandoned":
      return "abandoned";
    default:
      return "unknown";
  }
}

function matchFreshUntil(status, kickoffAt, observedAt) {
  const observedMilliseconds = Date.parse(observedAt);
  const kickoffDistance = Date.parse(kickoffAt) - observedMilliseconds;
  const ttlMilliseconds =
    status === "live"
      ? 60_000
      : status === "scheduled" && kickoffDistance <= 48 * 60 * 60 * 1000
        ? 15 * 60_000
        : status === "scheduled"
          ? 6 * 60 * 60_000
          : status === "finished"
            ? 24 * 60 * 60_000
            : 60 * 60_000;
  return new Date(observedMilliseconds + ttlMilliseconds).toISOString();
}

function countryName(candidate) {
  if (isRecord(candidate.country)) return text(candidate.country.name);
  return text(candidate.country);
}

function seasonClassification(startsOn, endsOn) {
  if (startsOn.startsWith("2026-") && endsOn.startsWith("2027-")) {
    return { seasonKind: "cross_year", ingestScope: "product_current" };
  }
  if (startsOn.startsWith("2026-") && endsOn.startsWith("2026-")) {
    return { seasonKind: "calendar_year", ingestScope: "product_current" };
  }
  return { seasonKind: "other", ingestScope: "held" };
}

function competitionRecord(candidate, observedAt) {
  if (!isRecord(candidate)) return null;
  const sourceId = positiveInteger(candidate.id);
  const name = text(candidate.name);
  const active = booleanValue(candidate.is_active);
  if (sourceId === null || !name || active === null) return null;
  const normalized = {
    sourceId,
    name,
    countryName: countryName(candidate),
    countryCode: text(candidate.country_code)?.toUpperCase() ?? null,
    competitionKind: "regular_league",
    gender: "men",
    active,
    observedAt,
    sourceUpdatedAt: dateTime(candidate.updated_at ?? candidate.last_updated),
  };
  return {
    ...normalized,
    checksum: contentChecksum({
      sourceId: normalized.sourceId,
      name: normalized.name,
      countryName: normalized.countryName,
      countryCode: normalized.countryCode,
      active: normalized.active,
    }),
  };
}

function seasonRecord(candidate, competitionSourceId, observedAt) {
  if (!isRecord(candidate)) return null;
  const sourceId = positiveInteger(candidate.id);
  const name = text(candidate.name);
  const startsOn = dateOnly(candidate.start_date);
  const endsOn = dateOnly(candidate.end_date);
  if (sourceId === null || !name || !startsOn || !endsOn || endsOn < startsOn) return null;
  const classification = seasonClassification(startsOn, endsOn);
  const normalized = {
    sourceId,
    competitionSourceId,
    name,
    ...classification,
    startsOn,
    endsOn,
    current: true,
    observedAt,
    sourceUpdatedAt: dateTime(candidate.updated_at ?? candidate.last_updated),
  };
  return {
    ...normalized,
    checksum: contentChecksum({
      sourceId: normalized.sourceId,
      competitionSourceId,
      name,
      seasonKind: normalized.seasonKind,
      startsOn,
      endsOn,
      current: true,
      ingestScope: normalized.ingestScope,
    }),
  };
}

export function normalizeCurrentCatalog(payload, supportedCompetitionIds, observedAtValue) {
  const observedAt = dateTime(observedAtValue);
  if (!observedAt) throw new Error("observedAt non valido");
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new Error("Catalogo provider non valido");
  }
  const supported = new Set(supportedCompetitionIds);
  const competitions = [];
  const seasons = [];
  const rejected = [];

  payload.results.forEach((candidate, index) => {
    if (!isRecord(candidate) || !supported.has(candidate.id)) return;
    if (candidate.is_women === true) {
      rejected.push({ index, reason: "policy_gender" });
      return;
    }
    const competition = competitionRecord(candidate, observedAt);
    const season = seasonRecord(candidate.current_season, competition?.sourceId, observedAt);
    if (!competition || !season) {
      rejected.push({ index, reason: "validation_failed" });
      return;
    }
    competitions.push(competition);
    seasons.push(season);
  });

  return {
    competitions,
    seasons,
    productCurrent: seasons.filter((season) => season.ingestScope === "product_current").length,
    held: seasons.filter((season) => season.ingestScope === "held").length,
    rejected,
  };
}

function teamRecord(sourceId, name, observedAt, sourceUpdatedAt = null) {
  if (sourceId === null || !name) return null;
  const normalized = {
    sourceId,
    name,
    shortName: null,
    countryName: null,
    countryCode: null,
    active: null,
    observedAt,
    sourceUpdatedAt,
  };
  return {
    ...normalized,
    checksum: contentChecksum({ sourceId, name }),
  };
}

function matchRecord(candidate, observedAt) {
  if (!isRecord(candidate)) return null;
  const sourceId = positiveInteger(candidate.id);
  const competitionSourceId = positiveInteger(candidate.league_id);
  const seasonSourceId = positiveInteger(candidate.season_id);
  const homeTeamSourceId = positiveInteger(candidate.home_team_id);
  const awayTeamSourceId = positiveInteger(candidate.away_team_id);
  const homeTeamName = text(candidate.home_team);
  const awayTeamName = text(candidate.away_team);
  const kickoffAt = dateTime(candidate.event_date);
  if (
    sourceId === null ||
    competitionSourceId === null ||
    seasonSourceId === null ||
    homeTeamSourceId === null ||
    awayTeamSourceId === null ||
    homeTeamSourceId === awayTeamSourceId ||
    !homeTeamName ||
    !awayTeamName ||
    !kickoffAt
  ) {
    return null;
  }

  const rawHomeScore = nonNegativeInteger(candidate.home_score);
  const rawAwayScore = nonNegativeInteger(candidate.away_score);
  const scorePairAvailable = rawHomeScore !== null && rawAwayScore !== null;
  const homeScore = scorePairAvailable ? rawHomeScore : null;
  const awayScore = scorePairAvailable ? rawAwayScore : null;
  // L'intervallo segue la stessa regola di coppia dei gol finali, piu' la guardia di
  // coerenza: un intervallo maggiore del finale e' un dato rotto e si dichiara assente
  // invece di sceglierne uno. E' la stessa regola di
  // scripts/projection/dataset/export_reference_local.py, cosi' i due percorsi che
  // riempiono football.matches non scrivono verita' diverse nelle stesse colonne.
  const rawHomeScoreHalftime = nonNegativeInteger(candidate.home_score_ht);
  const rawAwayScoreHalftime = nonNegativeInteger(candidate.away_score_ht);
  const halftimeSound =
    scorePairAvailable &&
    rawHomeScoreHalftime !== null &&
    rawAwayScoreHalftime !== null &&
    rawHomeScoreHalftime <= rawHomeScore &&
    rawAwayScoreHalftime <= rawAwayScore;
  const homeScoreHalftime = halftimeSound ? rawHomeScoreHalftime : null;
  const awayScoreHalftime = halftimeSound ? rawAwayScoreHalftime : null;
  const status = normalizedStatus(candidate.status);
  const sourceUpdatedAt = dateTime(candidate.updated_at ?? candidate.last_updated);
  const normalized = {
    sourceId,
    competitionSourceId,
    seasonSourceId,
    homeTeamSourceId,
    awayTeamSourceId,
    homeTeamName,
    awayTeamName,
    kickoffAt,
    status,
    statusDetail: isRecord(candidate.status) ? text(candidate.status.name) : text(candidate.status),
    roundName: text(candidate.round_name) ?? (integer(candidate.round_number) !== null ? String(candidate.round_number) : null),
    homeScore,
    awayScore,
    homeScoreHalftime,
    awayScoreHalftime,
    sourceSequence: nonNegativeInteger(candidate.version ?? candidate.sequence),
    sourceUpdatedAt,
    observedAt,
    freshUntil: matchFreshUntil(status, kickoffAt, observedAt),
  };
  return {
    match: {
      ...normalized,
      checksum: contentChecksum({
        sourceId,
        competitionSourceId,
        seasonSourceId,
        homeTeamSourceId,
        awayTeamSourceId,
        kickoffAt,
        status: normalized.status,
        statusDetail: normalized.statusDetail,
        roundName: normalized.roundName,
        homeScore,
        awayScore,
        homeScoreHalftime,
        awayScoreHalftime,
      }),
    },
    teams: [
      teamRecord(homeTeamSourceId, homeTeamName, observedAt, sourceUpdatedAt),
      teamRecord(awayTeamSourceId, awayTeamName, observedAt, sourceUpdatedAt),
    ],
  };
}

export function normalizeMatchPage(payload, observedAtValue) {
  const observedAt = dateTime(observedAtValue);
  if (!observedAt) throw new Error("observedAt non valido");
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new Error("Pagina gare provider non valida");
  }
  const matches = [];
  const teamsBySource = new Map();
  const rejected = [];
  payload.results.forEach((candidate, index) => {
    const result = matchRecord(candidate, observedAt);
    if (!result) {
      rejected.push({ index, reason: "validation_failed" });
      return;
    }
    matches.push(result.match);
    for (const team of result.teams) {
      if (team) teamsBySource.set(team.sourceId, team);
    }
  });
  return {
    matches,
    teams: [...teamsBySource.values()].sort((left, right) => left.sourceId - right.sourceId),
    declaredTotal: nonNegativeInteger(payload.count) ?? matches.length,
    returned: payload.results.length,
    rejected,
  };
}

function nullableStandingInteger(value, allowNegative = false) {
  const parsed = integer(value);
  if (parsed === null) return null;
  return allowNegative || parsed >= 0 ? parsed : null;
}

export function normalizeStandingSnapshot(payload, observedAtValue) {
  const observedAt = dateTime(observedAtValue);
  if (!observedAt) throw new Error("observedAt non valido");
  if (!isRecord(payload) || !Array.isArray(payload.standings) || !isRecord(payload.season)) {
    throw new Error("Classifica provider non valida");
  }
  const competitionSourceId = positiveInteger(payload.league_id);
  const seasonSourceId = positiveInteger(payload.season.id);
  if (competitionSourceId === null || seasonSourceId === null) {
    throw new Error("Riferimenti classifica non validi");
  }
  const rows = [];
  const teams = [];
  const rejected = [];
  payload.standings.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      rejected.push({ index, reason: "validation_failed" });
      return;
    }
    const teamSourceId = positiveInteger(candidate.team_id);
    const teamName = text(candidate.team_name);
    const position = positiveInteger(candidate.position);
    if (teamSourceId === null || !teamName || position === null) {
      rejected.push({ index, reason: "validation_failed" });
      return;
    }
    const form = text(candidate.form);
    const row = {
      teamSourceId,
      position,
      played: nullableStandingInteger(candidate.played),
      won: nullableStandingInteger(candidate.won),
      drawn: nullableStandingInteger(candidate.drawn),
      lost: nullableStandingInteger(candidate.lost),
      goalsFor: nullableStandingInteger(candidate.gf),
      goalsAgainst: nullableStandingInteger(candidate.ga),
      goalDifference: nullableStandingInteger(candidate.gd, true),
      points: nullableStandingInteger(candidate.pts, true),
      form: form && /^[WDL]*$/.test(form) ? form : null,
      observedAt,
    };
    rows.push(row);
    teams.push(teamRecord(teamSourceId, teamName, observedAt));
  });
  rows.sort((left, right) => left.position - right.position || left.teamSourceId - right.teamSourceId);
  const effectiveAt = dateTime(payload.updated_at ?? payload.last_updated) ?? observedAt;
  return {
    snapshot: {
      competitionSourceId,
      seasonSourceId,
      effectiveAt,
      observedAt,
      sourceUpdatedAt: dateTime(payload.updated_at ?? payload.last_updated),
      checksum: contentChecksum({ competitionSourceId, seasonSourceId, rows }),
      rowCount: rows.length,
      complete: rejected.length === 0 && rows.length > 0,
      rows,
    },
    teams: teams.filter(Boolean),
    rejected,
  };
}

export function assembleData1Batch({ catalog, matchPages, standings, observedAt }) {
  const teams = new Map();
  const matches = [];
  for (const page of matchPages) {
    matches.push(...page.matches);
    for (const team of page.teams) teams.set(team.sourceId, team);
  }
  for (const standing of standings) {
    for (const team of standing.teams) teams.set(team.sourceId, team);
  }
  return {
    observedAt: dateTime(observedAt),
    competitions: catalog.competitions,
    seasons: catalog.seasons,
    teams: [...teams.values()].sort((left, right) => left.sourceId - right.sourceId),
    matches: matches.sort((left, right) => left.sourceId - right.sourceId),
    standings: standings.map((item) => item.snapshot),
  };
}
