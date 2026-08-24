// Server-only: gare per data dal provider (BSD /events/) + indice leghe (id → nome/paese,
// perché la lista /events/ espone solo league_id). Alimenta /partite (oggi-per-prima).
// Riusa il client blindato; TTL cache; fail-closed → vuoto con motivo (mai dati inventati).
import "server-only";

import { ProviderClient } from "./provider-client.ts";
import { GatewayError } from "./errors.ts";
import { countryCode, countryInItalian } from "./country-names.ts";
import { previousUtcDay, romeDayOf } from "./rome-day.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
const MATCHES_TTL_MS = 120_000;
const LEAGUES_TTL_MS = 3_600_000;
/** Pagina massima ammessa dalla fonte. */
const PAGE_LIMIT = 200;
/** Freno di sicurezza: oltre questo la pagina dichiara l'elenco incompleto. */
const MAX_PAGES = 5;

export interface MatchListItem {
  readonly eventId: number;
  readonly leagueId: number | null;
  readonly leagueName: string | null;
  readonly leagueCountry: string | null;
  readonly leagueCountryCode: string | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeTeamId: number | null;
  readonly awayTeamId: number | null;
  readonly kickoff: string;
  readonly status: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly roundName: string | null;
  /** Il numero di giornata dichiarato dalla fonte: serve a raggruppare per turno. */
  readonly roundNumber: number | null;
  /** L'arbitro designato, quando la fonte lo dichiara: prima della vigilia spesso e' nullo. */
  readonly refereeId: number | null;
}

export interface MatchesByDateResult {
  readonly matches: readonly MatchListItem[];
  readonly source: "provider" | "unavailable";
  readonly reason?: string;
  /** Vero solo se il freno di sicurezza ha fermato la lettura: l'elenco è incompleto e va detto. */
  readonly truncated?: boolean;
  /**
   * Quando la fonte è stata letta davvero, non quando la pagina è stata disegnata.
   *
   * L'endpoint del calendario non espone nessun campo di aggiornamento — misurato su 50
   * gare: `last_updated`, `updated_at`, `latest` e `as_of` sono tutti assenti — quindi
   * l'unico istante vero è quello della nostra richiesta. Vive dentro la busta perché la
   * risposta resta in cache per 120 secondi: `new Date()` al render direbbe un'ora che
   * nessuno ha chiesto alla fonte.
   */
  readonly lettoIl?: string;
}

interface LeagueMeta {
  readonly name: string | null;
  readonly country: string | null;
  readonly countryCode: string | null;
}

function resolveProviderConfig(): { baseUrl: string; token: string } | null {
  const token = (process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN ?? "").trim();
  if (!token) return null;
  const baseUrl =
    process.env.IQSTATS_PROVIDER_BASE_URL?.trim() ||
    process.env.BSD_API_BASE_URL?.trim() ||
    DEFAULT_PROVIDER_BASE_URL;
  return { baseUrl, token };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function fetchJson(path: string): Promise<unknown | null> {
  const config = resolveProviderConfig();
  if (!config) return null;
  try {
    const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
    return await client.getJson(path);
  } catch (reason) {
    if (reason instanceof GatewayError && reason.code === "not_found") return "not_found";
    return null;
  }
}

// ---- Indice leghe (id → nome/paese) ----------------------------------------
let leaguesCache: { value: Map<number, LeagueMeta>; expiresAt: number } | null = null;

export async function getLeaguesIndex(): Promise<Map<number, LeagueMeta>> {
  const now = Date.now();
  if (leaguesCache && leaguesCache.expiresAt > now) return leaguesCache.value;

  const payload = await fetchJson(`/api/v2/leagues/?limit=100`);
  const results = (payload as { results?: unknown } | null)?.results;
  const index = new Map<number, LeagueMeta>();
  if (Array.isArray(results)) {
    for (const row of results) {
      const r = (row ?? {}) as Record<string, unknown>;
      const id = asNumber(r.id);
      if (id !== null) {
        const country = asString(r.country);
        index.set(id, {
          name: asString(r.name),
          country: countryInItalian(country),
          countryCode: countryCode(country),
        });
      }
    }
  }
  // Cache anche un indice vuoto per un tempo breve, così non martelliamo se la fonte è giù.
  leaguesCache = { value: index, expiresAt: now + (index.size > 0 ? LEAGUES_TTL_MS : MATCHES_TTL_MS) };
  return index;
}

// ---- Gare per data ----------------------------------------------------------
const matchesCache = new Map<string, { value: MatchesByDateResult; expiresAt: number }>();

function normalizeMatch(row: unknown, leagues: Map<number, LeagueMeta>): MatchListItem | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const eventId = asNumber(r.id);
  const homeTeam = asString(r.home_team);
  const awayTeam = asString(r.away_team);
  if (eventId === null || !homeTeam || !awayTeam) return null;
  const leagueId = asNumber(r.league_id);
  const meta = leagueId !== null ? leagues.get(leagueId) : undefined;
  return {
    eventId,
    leagueId,
    leagueName: meta?.name ?? null,
    leagueCountry: meta?.country ?? null,
    leagueCountryCode: meta?.countryCode ?? null,
    homeTeam,
    awayTeam,
    homeTeamId: asNumber(r.home_team_id),
    awayTeamId: asNumber(r.away_team_id),
    kickoff: asString(r.event_date) ?? "",
    status: asString(r.status) ?? "unknown",
    homeScore: asNumber(r.home_score),
    awayScore: asNumber(r.away_score),
    roundName: asString(r.round_name),
    roundNumber: asNumber(r.round_number),
    refereeId: asNumber(r.referee_id),
  };
}

/** Legge tutte le pagine fino a esaurimento: un tetto fisso mentirebbe sul conteggio. */
async function fetchAllRows(
  path: string,
  query: URLSearchParams,
): Promise<{ rows: unknown[]; truncated: boolean } | null> {
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    query.set("limit", String(PAGE_LIMIT));
    query.set("offset", String(page * PAGE_LIMIT));
    const payload = await fetchJson(path.concat("?", query.toString()));
    if (payload === null || payload === "not_found") {
      return page === 0 ? null : { rows, truncated: false };
    }
    const results = (payload as { results?: unknown }).results;
    const batch = Array.isArray(results) ? results : [];
    rows.push(...batch);
    if (batch.length < PAGE_LIMIT) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * Gare di un giorno italiano (YYYY-MM-DD), opzionalmente filtrate per lega. Ordinate per kickoff.
 * La fonte divide i giorni in ora universale, quindi si legge anche il giorno precedente e si
 * tiene solo ciò che in Italia cade davvero in quel giorno.
 * Fail-closed → lista vuota con motivo. `dateIso` deve essere già validato dal chiamante.
 */
const rangeCache = new Map<string, { value: MatchesByDateResult; expiresAt: number }>();

/**
 * Le gare fra due giorni universali, in una lettura sola.
 *
 * `getMatchesByDate` chiede un giorno per volta perche' i conteggi del giorno devono
 * tornare esatti in ora italiana. Qui serve l'opposto: una finestra larga, perche' la
 * prossima giornata di un campionato si spalma su tre o quattro giorni e chiederla giorno
 * per giorno costerebbe una richiesta per giorno.
 */
export async function getMatchesInRange(
  daIso: string,
  aIso: string,
): Promise<MatchesByDateResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(daIso) || !/^\d{4}-\d{2}-\d{2}$/.test(aIso)) {
    return { matches: [], source: "unavailable", reason: "invalid_date" };
  }
  const cacheKey = `${daIso}:${aIso}`;
  const now = Date.now();
  const cached = rangeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const config = resolveProviderConfig();
  if (!config) return { matches: [], source: "unavailable", reason: "source_not_configured" };

  const leagues = await getLeaguesIndex();
  const query = new URLSearchParams({ date_from: daIso, date_to: aIso });
  const collected = await fetchAllRows("/api/v2/events/", query);
  if (collected === null) {
    return { matches: [], source: "unavailable", reason: "source_unavailable" };
  }

  const matches = collected.rows
    .map((row) => normalizeMatch(row, leagues))
    .filter((m): m is MatchListItem => m !== null)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const value: MatchesByDateResult = {
    matches, source: "provider", truncated: collected.truncated, lettoIl: new Date(now).toISOString(),
  };
  rangeCache.set(cacheKey, { value, expiresAt: now + MATCHES_TTL_MS });
  return value;
}

export async function getMatchesByDate(dateIso: string, leagueId?: number): Promise<MatchesByDateResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { matches: [], source: "unavailable", reason: "invalid_date" };
  }
  const cacheKey = `${dateIso}:${leagueId ?? "all"}`;
  const now = Date.now();
  const cached = matchesCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const config = resolveProviderConfig();
  if (!config) {
    return { matches: [], source: "unavailable", reason: "source_not_configured" };
  }

  const leagues = await getLeaguesIndex();
  const query = new URLSearchParams({ date_from: previousUtcDay(dateIso), date_to: dateIso });
  if (leagueId) query.set("league_id", String(leagueId));
  const collected = await fetchAllRows("/api/v2/events/", query);
  if (collected === null) {
    return { matches: [], source: "unavailable", reason: "source_unavailable" };
  }

  const matches = collected.rows
    .map((row) => normalizeMatch(row, leagues))
    .filter((m): m is MatchListItem => m !== null && romeDayOf(m.kickoff) === dateIso)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const value: MatchesByDateResult = {
    matches, source: "provider", truncated: collected.truncated, lettoIl: new Date(now).toISOString(),
  };
  matchesCache.set(cacheKey, { value, expiresAt: now + MATCHES_TTL_MS });
  return value;
}
