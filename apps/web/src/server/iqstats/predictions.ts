// Server-only: pronostici modello del provider (BSD /predictions/) per la dashboard "Oggi".
// Riusa il client blindato ProviderClient (token server-side, allowlist /api/v2/, timeout).
// Cache TTL in-memory per non chiamare il provider a ogni render (rispetta la disciplina GET).
import { ProviderClient } from "./provider-client.ts";
import { GatewayError } from "./errors.ts";
import { nextUtcDay, previousUtcDay, romeDayOf } from "./rome-day.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
const CACHE_TTL_MS = 120_000;

export type Outcome = "H" | "D" | "A";

export interface DashboardPrediction {
  readonly eventId: number;
  readonly kickoff: string; // ISO UTC
  readonly status: string;
  readonly leagueId: number | null;
  readonly leagueName: string | null;
  readonly homeTeamId: number | null;
  readonly awayTeamId: number | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly probHome: number | null;
  readonly probDraw: number | null;
  readonly probAway: number | null;
  readonly predicted: Outcome | null;
  readonly xgHome: number | null;
  readonly xgAway: number | null;
  readonly probOver25: number | null;
  readonly probBtts: number | null;
  readonly mostLikelyScore: string | null;
  readonly favorite: Outcome | null;
  /**
   * La fonte pubblica anche `model.confidence`. **Non si normalizza, ed e' misurato:** su
   * 200 righe confrontate e' esattamente questo stesso numero, zero righe diverse, scarto
   * massimo 0,05 punti. Un secondo nome per la stessa cifra non e' una seconda misura, e in
   * pagina si leggeva come un'affidabilita' che non c'e'. La nota per esteso sta in
   * `sbilanci.ts`; l'affidabilita' vera la calcola il nostro motore, dossier per dossier.
   */
  readonly favoriteProb: number | null;
  readonly modelVersion: string | null;
  readonly createdAt: string | null;
}

export interface DashboardPredictionsResult {
  readonly predictions: readonly DashboardPrediction[];
  readonly source: "provider" | "unavailable";
  readonly modelVersion: string | null;
  readonly reason?: string;
  /**
   * Quando la fonte è stata letta davvero. Gemello di `MatchesByDateResult.lettoIl`, e per
   * la stessa ragione: la risposta resta in cache per 120 secondi, quindi l'istante del
   * render non è l'istante della lettura.
   */
  readonly lettoIl?: string;
}

interface CacheEntry {
  readonly value: DashboardPredictionsResult;
  readonly expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

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

function asOutcome(value: unknown): Outcome | null {
  return value === "H" || value === "D" || value === "A" ? value : null;
}

function normalize(row: unknown): DashboardPrediction | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const event = (r.event ?? {}) as Record<string, unknown>;
  const eventId = asNumber(event.id);
  const homeTeam = asString(event.home_team);
  const awayTeam = asString(event.away_team);
  if (eventId === null || !homeTeam || !awayTeam) return null;

  const markets = (r.markets ?? {}) as Record<string, unknown>;
  const matchResult = (markets.match_result ?? {}) as Record<string, unknown>;
  const xg = (markets.expected_goals ?? {}) as Record<string, unknown>;
  const overUnder = (markets.over_under ?? {}) as Record<string, unknown>;
  const btts = (markets.btts ?? {}) as Record<string, unknown>;
  const score = (markets.score ?? {}) as Record<string, unknown>;
  const recs = (r.recommendations ?? {}) as Record<string, unknown>;
  const model = (r.model ?? {}) as Record<string, unknown>;

  const favoriteRaw = recs.favorite;
  const favorite =
    favoriteRaw === "H" || favoriteRaw === "A" || favoriteRaw === "D" ? favoriteRaw : null;

  return {
    eventId,
    kickoff: asString(event.event_date) ?? "",
    status: asString(event.status) ?? "unknown",
    leagueId: asNumber(event.league_id),
    leagueName: asString(event.league_name),
    homeTeamId: asNumber(event.home_team_id),
    awayTeamId: asNumber(event.away_team_id),
    homeTeam,
    awayTeam,
    probHome: asNumber(matchResult.prob_home),
    probDraw: asNumber(matchResult.prob_draw),
    probAway: asNumber(matchResult.prob_away),
    predicted: asOutcome(matchResult.predicted),
    xgHome: asNumber(xg.home),
    xgAway: asNumber(xg.away),
    probOver25: asNumber(overUnder.prob_over_25),
    probBtts: asNumber(btts.prob_yes),
    mostLikelyScore: asString(score.most_likely),
    favorite,
    favoriteProb: asNumber(recs.favorite_prob),
    modelVersion: asString(model.version),
    createdAt: asString(r.created_at),
  };
}

/** Fin dove si guarda avanti: misurato, tutti i pronostici stanno entro 14 giorni. */
const GIORNI_AVANTI = 30;

/**
 * Pronostici delle gare in arrivo, ordinati per data di kickoff.
 * Fail-closed: se la fonte non è configurata o non risponde, ritorna lista vuota
 * con motivo (la UI mostra "copertura assente", mai dati inventati).
 *
 * **La finestra ha sostituito `upcoming=true` il 24 agosto 2026.** La fonte quel parametro
 * non lo accetta più e rispondeva `400 Unknown query parameter(s): upcoming`, che il client
 * traduce in `source_unavailable`: `/pronostici` era vuota in produzione e diceva «riprova
 * fra qualche minuto», cioè una cosa falsa, perché riprovare non poteva servire a niente.
 * Misurato lo stesso giorno: con `date_from` e `date_to` la fonte risponde 200 e dà 471
 * pronostici a sette giorni, 473 a quattordici, e nessuno oltre.
 */
export async function getUpcomingPredictions(limit = 50): Promise<DashboardPredictionsResult> {
  const cacheKey = `upcoming:${limit}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const config = resolveProviderConfig();
  if (!config) {
    return { predictions: [], source: "unavailable", modelVersion: null, reason: "source_not_configured" };
  }

  let payload: unknown;
  try {
    const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
    // `date_from` e' l'istante, non il giorno: una gara gia' iniziata non e' «in arrivo».
    const da = new Date(now).toISOString();
    const a = new Date(now + GIORNI_AVANTI * 24 * 60 * 60 * 1000).toISOString();
    payload = await client.getJson(
      `/api/v2/predictions/?date_from=${da}&date_to=${a}&limit=${limit}`,
    );
  } catch (reason) {
    const code = reason instanceof GatewayError ? reason.code : "source_unavailable";
    return { predictions: [], source: "unavailable", modelVersion: null, reason: code };
  }

  const results = (payload as { results?: unknown })?.results;
  const rows = Array.isArray(results) ? results : [];
  const predictions = rows
    .map(normalize)
    .filter((p): p is DashboardPrediction => p !== null)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const modelVersion = predictions.find((p) => p.modelVersion)?.modelVersion ?? null;
  const value: DashboardPredictionsResult = {
    predictions, source: "provider", modelVersion, lettoIl: new Date(now).toISOString(),
  };
  cache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

const PAGE_LIMIT = 200;
const MAX_PAGES = 5;
const byDateCache = new Map<string, CacheEntry>();

/**
 * Letture del modello per un giorno italiano, lette fino a esaurimento delle pagine.
 * Stesso perimetro delle gare: si chiede anche il giorno universale precedente e si tiene
 * solo ciò che in Italia cade in quel giorno, così i due conteggi si possono confrontare.
 */
export async function getPredictionsByDate(dateIso: string): Promise<DashboardPredictionsResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { predictions: [], source: "unavailable", modelVersion: null, reason: "invalid_date" };
  }
  const now = Date.now();
  const cached = byDateCache.get(dateIso);
  if (cached && cached.expiresAt > now) return cached.value;

  const config = resolveProviderConfig();
  if (!config) {
    return { predictions: [], source: "unavailable", modelVersion: null, reason: "source_not_configured" };
  }

  const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
  // Qui il limite superiore è escluso, quindi si chiede il giorno dopo per avere tutto il giorno.
  const query = new URLSearchParams({ date_from: previousUtcDay(dateIso), date_to: nextUtcDay(dateIso) });
  const rows: unknown[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    query.set("limit", String(PAGE_LIMIT));
    query.set("offset", String(page * PAGE_LIMIT));
    let payload: unknown;
    try {
      payload = await client.getJson("/api/v2/predictions/".concat("?", query.toString()));
    } catch (reason) {
      // La prima pagina che fallisce è un'assenza; una pagina successiva lascia un elenco
      // parziale, che è comunque meglio di un elenco vuoto e resta dichiarato dal conteggio.
      if (page === 0) {
        const code = reason instanceof GatewayError ? reason.code : "source_unavailable";
        return { predictions: [], source: "unavailable", modelVersion: null, reason: code };
      }
      break;
    }
    const results = (payload as { results?: unknown })?.results;
    const batch = Array.isArray(results) ? results : [];
    rows.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
  }

  const predictions = rows
    .map(normalize)
    .filter((p): p is DashboardPrediction => p !== null && romeDayOf(p.kickoff) === dateIso)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const modelVersion = predictions.find((p) => p.modelVersion)?.modelVersion ?? null;
  const value: DashboardPredictionsResult = {
    predictions, source: "provider", modelVersion, lettoIl: new Date(now).toISOString(),
  };
  byDateCache.set(dateIso, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

export interface MatchPrediction {
  readonly probHome: number | null;
  readonly probDraw: number | null;
  readonly probAway: number | null;
  readonly predicted: Outcome | null;
  readonly xgHome: number | null;
  readonly xgAway: number | null;
  readonly probOver15: number | null;
  readonly probOver25: number | null;
  readonly probOver35: number | null;
  readonly probBtts: number | null;
  readonly mostLikelyScore: string | null;
  readonly favorite: Outcome | null;
  readonly favoriteProb: number | null;
  readonly modelVersion: string | null;
}

const matchPredictionCache = new Map<number, { value: MatchPrediction | null; expiresAt: number }>();

/** Verdetto del modello per una singola gara. Fail-closed → null. */
export async function getMatchPrediction(eventId: number): Promise<MatchPrediction | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  const now = Date.now();
  const cached = matchPredictionCache.get(eventId);
  if (cached && cached.expiresAt > now) return cached.value;

  const config = resolveProviderConfig();
  if (!config) return null;

  let payload: unknown;
  try {
    const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
    payload = await client.getJson(`/api/v2/events/${eventId}/prediction/`);
  } catch (reason) {
    if (reason instanceof GatewayError && reason.code === "not_found") {
      matchPredictionCache.set(eventId, { value: null, expiresAt: now + CACHE_TTL_MS });
    }
    return null;
  }

  const r = (payload ?? {}) as Record<string, unknown>;
  const markets = (r.markets ?? {}) as Record<string, unknown>;
  const matchResult = (markets.match_result ?? {}) as Record<string, unknown>;
  const xg = (markets.expected_goals ?? {}) as Record<string, unknown>;
  const overUnder = (markets.over_under ?? {}) as Record<string, unknown>;
  const btts = (markets.btts ?? {}) as Record<string, unknown>;
  const score = (markets.score ?? {}) as Record<string, unknown>;
  const recs = (r.recommendations ?? {}) as Record<string, unknown>;
  const model = (r.model ?? {}) as Record<string, unknown>;
  const favoriteRaw = recs.favorite;

  const value: MatchPrediction = {
    probHome: asNumber(matchResult.prob_home),
    probDraw: asNumber(matchResult.prob_draw),
    probAway: asNumber(matchResult.prob_away),
    predicted: asOutcome(matchResult.predicted),
    xgHome: asNumber(xg.home),
    xgAway: asNumber(xg.away),
    probOver15: asNumber(overUnder.prob_over_15),
    probOver25: asNumber(overUnder.prob_over_25),
    probOver35: asNumber(overUnder.prob_over_35),
    probBtts: asNumber(btts.prob_yes),
    mostLikelyScore: asString(score.most_likely),
    favorite: favoriteRaw === "H" || favoriteRaw === "A" || favoriteRaw === "D" ? favoriteRaw : null,
    favoriteProb: asNumber(recs.favorite_prob),
    modelVersion: asString(model.version),
  };

  if (value.probHome === null && value.probAway === null && value.favorite === null) {
    matchPredictionCache.set(eventId, { value: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }
  matchPredictionCache.set(eventId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}
