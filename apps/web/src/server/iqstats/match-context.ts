// Server-only: contesto gara dal provider (BSD /events/{id}/, /referees/{id}/, /venues/{id}/).
// Alimenta la dashboard "Oggi" (venue) e il dossier /match/[id] (verdetto, arbitro, stadio,
// h2h). Riusa il client blindato; TTL cache; fail-closed → null (mai dati inventati).
import "server-only";

import { ProviderClient } from "./provider-client.ts";
import { GatewayError } from "./errors.ts";
import { countryInItalian } from "./country-names.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
const CACHE_TTL_MS = 300_000;

export interface H2HRecentMatch {
  readonly date: string | null;
  readonly home: string | null;
  readonly away: string | null;
  readonly score: string | null;
}

export interface HeadToHead {
  readonly totalMatches: number | null;
  readonly homeWins: number | null;
  readonly draws: number | null;
  readonly awayWins: number | null;
  readonly homeGoals: number | null;
  readonly awayGoals: number | null;
  readonly avgTotalGoals: number | null;
  readonly recent: readonly H2HRecentMatch[];
}

export interface MatchWeather {
  readonly description: string | null;
  readonly temperatureC: number | null;
  readonly windSpeed: number | null;
}

export interface MatchDetail {
  readonly eventId: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeTeamId: number | null;
  readonly awayTeamId: number | null;
  readonly homeCoachId: number | null;
  readonly awayCoachId: number | null;
  readonly venueId: number | null;
  readonly refereeId: number | null;
  readonly kickoff: string;
  readonly status: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly roundName: string | null;
  /** Il numero della giornata, che la fonte dichiara a parte dal nome del turno. */
  readonly roundNumber: number | null;
  readonly leagueId: number | null;
  readonly seasonId: number | null;
  readonly isLocalDerby: boolean | null;
  readonly isNeutralGround: boolean | null;
  readonly travelDistanceKm: number | null;
  readonly attendance: number | null;
  readonly weather: MatchWeather | null;
  readonly headToHead: HeadToHead | null;
}

/** Profilo dell'allenatore: come gioca la sua squadra, con il campione dichiarato. */
export interface ManagerInfo {
  readonly id: number;
  readonly name: string;
  readonly country: string | null;
  readonly tacticalProfile: string | null;
  readonly preferredFormation: string | null;
  readonly matches: number | null;
  readonly wins: number | null;
  readonly draws: number | null;
  readonly losses: number | null;
  readonly avgGoalsScored: number | null;
  readonly avgGoalsConceded: number | null;
  readonly avgPossession: number | null;
  readonly cleanSheetPct: number | null;
  readonly bttsPct: number | null;
  readonly over25Pct: number | null;
  readonly updatedAt: string | null;
}

export interface RefereeInfo {
  readonly id: number;
  readonly name: string;
  readonly country: string | null;
  readonly matches: number | null;
  readonly avgYellowPerMatch: number | null;
  readonly avgRedPerMatch: number | null;
  readonly avgFoulsPerMatch: number | null;
  readonly careerGames: number | null;
}

export interface VenueInfo {
  readonly id: number;
  readonly name: string;
  readonly city: string | null;
  readonly country: string | null;
  readonly capacity: number | null;
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

function normalizeH2H(value: unknown): HeadToHead | null {
  if (typeof value !== "object" || value === null) return null;
  const h = value as Record<string, unknown>;
  const recentRaw = Array.isArray(h.recent_matches) ? h.recent_matches : [];
  const recent: H2HRecentMatch[] = recentRaw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      date: asString(r.date),
      home: asString(r.home),
      away: asString(r.away),
      score: asString(r.score),
    };
  });
  return {
    totalMatches: asNumber(h.total_matches),
    homeWins: asNumber(h.home_wins),
    draws: asNumber(h.draws),
    awayWins: asNumber(h.away_wins),
    homeGoals: asNumber(h.home_goals),
    awayGoals: asNumber(h.away_goals),
    avgTotalGoals: asNumber(h.avg_total_goals),
    recent,
  };
}

const detailCache = new Map<number, { value: MatchDetail | null; expiresAt: number }>();

/**
 * L'esito della richiesta del dossier, in tre stati e non in due.
 *
 * Prima erano due — il dettaglio oppure `null` — e la pagina non poteva distinguere
 * **una gara che non esiste** da **una fonte che in questo momento non risponde**. Le due
 * cose meritano risposte HTTP opposte: la prima e' un 404 definitivo, la seconda e' un 200
 * con una spiegazione, perche' rispondere 404 a una gara vera la fa sparire dagli indici
 * per un guasto passeggero. La distinzione esisteva gia' qui dentro — `fetchJson` risponde
 * `"not_found"` — e veniva buttata via all'uscita.
 */
export type EsitoDelDossier =
  | { readonly stato: "trovato"; readonly detail: MatchDetail }
  /** La fonte ha risposto, e dice che questa gara non c'e'. */
  | { readonly stato: "assente" }
  /** La fonte non ha risposto, o ha risposto qualcosa che non sappiamo leggere. */
  | { readonly stato: "non-leggibile" };

export async function getMatchDetail(eventId: number): Promise<EsitoDelDossier> {
  // Un identificativo che non e' un intero positivo non e' una gara che manca: e' un
  // indirizzo sbagliato, e vale come assente.
  if (!Number.isInteger(eventId) || eventId <= 0) return { stato: "assente" };
  const now = Date.now();
  const cached = detailCache.get(eventId);
  if (cached && cached.expiresAt > now) {
    return cached.value === null
      ? { stato: "assente" }
      : { stato: "trovato", detail: cached.value };
  }

  const payload = await fetchJson(`/api/v2/events/${eventId}/`);
  if (payload === "not_found") {
    detailCache.set(eventId, { value: null, expiresAt: now + CACHE_TTL_MS });
    return { stato: "assente" };
  }
  if (typeof payload !== "object" || payload === null) return { stato: "non-leggibile" };

  const row = payload as Record<string, unknown>;
  const homeTeam = asString(row.home_team);
  const awayTeam = asString(row.away_team);
  // La fonte ha risposto, ma senza le due squadre non e' un dossier: non e' una gara
  // assente, e' una risposta che non sappiamo leggere.
  if (!homeTeam || !awayTeam) return { stato: "non-leggibile" };

  const weatherRow = (row.weather ?? null) as Record<string, unknown> | null;
  // Il meteo arriva anche come "unknown": in quel caso non è un dato, è un segnaposto.
  const weatherDescription = weatherRow ? asString(weatherRow.description) : null;

  const value: MatchDetail = {
    eventId,
    homeTeam,
    awayTeam,
    homeTeamId: asNumber(row.home_team_id),
    awayTeamId: asNumber(row.away_team_id),
    homeCoachId: asNumber(row.home_coach_id),
    awayCoachId: asNumber(row.away_coach_id),
    venueId: asNumber(row.venue_id),
    refereeId: asNumber(row.referee_id),
    kickoff: asString(row.event_date) ?? "",
    status: asString(row.status) ?? "unknown",
    homeScore: asNumber(row.home_score),
    awayScore: asNumber(row.away_score),
    roundName: asString(row.round_name),
    roundNumber: asNumber(row.round_number),
    leagueId: asNumber(row.league_id),
    seasonId: asNumber(row.season_id),
    isLocalDerby: typeof row.is_local_derby === "boolean" ? row.is_local_derby : null,
    isNeutralGround: typeof row.is_neutral_ground === "boolean" ? row.is_neutral_ground : null,
    travelDistanceKm: asNumber(row.travel_distance_km),
    attendance: asNumber(row.attendance),
    weather: weatherRow
      ? {
          description: weatherDescription === "unknown" ? null : weatherDescription,
          temperatureC: asNumber(weatherRow.temperature_c),
          windSpeed: asNumber(weatherRow.wind_speed),
        }
      : null,
    headToHead: normalizeH2H(row.head_to_head),
  };
  detailCache.set(eventId, { value, expiresAt: now + CACHE_TTL_MS });
  return { stato: "trovato", detail: value };
}

const refereeCache = new Map<number, { value: RefereeInfo | null; expiresAt: number }>();

export async function getReferee(refereeId: number): Promise<RefereeInfo | null> {
  if (!Number.isInteger(refereeId) || refereeId <= 0) return null;
  const now = Date.now();
  const cached = refereeCache.get(refereeId);
  if (cached && cached.expiresAt > now) return cached.value;

  const payload = await fetchJson(`/api/v2/referees/${refereeId}/`);
  if (typeof payload !== "object" || payload === null) return null;
  const r = payload as Record<string, unknown>;
  const name = asString(r.name);
  if (!name) return null;

  const value: RefereeInfo = {
    id: refereeId,
    name,
    country: asString(r.country),
    matches: asNumber(r.matches),
    avgYellowPerMatch: asNumber(r.avg_yellow_per_match),
    avgRedPerMatch: asNumber(r.avg_red_per_match),
    avgFoulsPerMatch: asNumber(r.avg_fouls_per_match),
    careerGames: asNumber(r.career_games),
  };
  refereeCache.set(refereeId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

const managerCache = new Map<number, { value: ManagerInfo | null; expiresAt: number }>();

/** Profilo dell'allenatore. Fail-closed → null: una panchina senza dati non si racconta. */
export async function getManager(managerId: number): Promise<ManagerInfo | null> {
  if (!Number.isInteger(managerId) || managerId <= 0) return null;
  const now = Date.now();
  const cached = managerCache.get(managerId);
  if (cached && cached.expiresAt > now) return cached.value;

  const payload = await fetchJson(`/api/v2/managers/${managerId}/`);
  if (typeof payload !== "object" || payload === null) return null;
  const r = payload as Record<string, unknown>;
  const name = asString(r.name);
  if (!name) return null;

  const value: ManagerInfo = {
    id: managerId,
    name,
    country: asString(r.country),
    tacticalProfile: asString(r.tactical_profile),
    preferredFormation: asString(r.preferred_formation),
    matches: asNumber(r.matches_total),
    wins: asNumber(r.wins),
    draws: asNumber(r.draws),
    losses: asNumber(r.losses),
    avgGoalsScored: asNumber(r.avg_goals_scored),
    avgGoalsConceded: asNumber(r.avg_goals_conceded),
    avgPossession: asNumber(r.avg_possession),
    cleanSheetPct: asNumber(r.clean_sheet_pct),
    bttsPct: asNumber(r.btts_pct),
    over25Pct: asNumber(r.over_25_pct),
    updatedAt: asString(r.stats_updated_at),
  };
  managerCache.set(managerId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

const venueCache = new Map<number, { value: VenueInfo | null; expiresAt: number }>();

export async function getVenue(venueId: number): Promise<VenueInfo | null> {
  if (!Number.isInteger(venueId) || venueId <= 0) return null;
  const now = Date.now();
  const cached = venueCache.get(venueId);
  if (cached && cached.expiresAt > now) return cached.value;

  const payload = await fetchJson(`/api/v2/venues/${venueId}/`);
  if (typeof payload !== "object" || payload === null) return null;
  const r = payload as Record<string, unknown>;
  const name = asString(r.name);
  if (!name) return null;

  const value: VenueInfo = {
    id: venueId,
    name,
    city: asString(r.city),
    country: countryInItalian(asString(r.country)),
    capacity: asNumber(r.capacity),
  };
  venueCache.set(venueId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}
