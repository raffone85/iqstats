// Server-only: le formazioni di una gara. Prima del fischio la fonte dà un undici previsto
// con una confidenza dichiarata; a ridosso diventa confermato. La differenza fra i due casi
// non si nasconde: una previsione non è una formazione.
import "server-only";

import { unstable_cache } from "next/cache";

import { motivoInItaliano, type Indisponibile } from "./indisponibili.ts";

import { ProviderClient } from "./provider-client.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
/** Cinque minuti: a ridosso del fischio le formazioni cambiano, più in là no. */
const CACHE_TTL_SECONDS = 300;

export interface LineupPlayer {
  readonly id: number | null;
  readonly name: string;
  readonly position: string | null;
  readonly shirt: number | null;
}

export interface TeamLineup {
  readonly teamId: number | null;
  readonly teamName: string | null;
  readonly formation: string | null;
  /** 0–1 dichiarata dalla fonte, solo quando l'undici è previsto. */
  readonly confidence: number | null;
  readonly starters: readonly LineupPlayer[];
  readonly benchCount: number;
  readonly unavailable: readonly Indisponibile[];
}

export interface MatchLineups {
  readonly confirmed: boolean;
  /** La fonte marca questo endpoint come beta: su 30 gare provate, 30 volte su 30. */
  readonly beta: boolean;
  readonly home: TeamLineup | null;
  readonly away: TeamLineup | null;
  readonly updatedAt: string | null;
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

function normalizePlayer(row: unknown): LineupPlayer | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const name = asString(r.short_name) ?? asString(r.name);
  if (!name) return null;
  return {
    id: asNumber(r.id),
    name,
    position: asString(r.position),
    shirt: asNumber(r.jersey_number),
  };
}

function normalizeSide(row: unknown, unavailableRow: unknown): TeamLineup | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const players = Array.isArray(r.players) ? r.players : [];
  const starters = players
    .map(normalizePlayer)
    .filter((p): p is LineupPlayer => p !== null);
  if (starters.length === 0) return null;

  const unavailableList = Array.isArray(unavailableRow) ? unavailableRow : [];
  const unavailable = unavailableList
    .map((row): Indisponibile | null => {
      if (typeof row === "string") return { nome: row, stato: "altro", motivo: null };
      const p = normalizePlayer(row);
      if (p === null) return null;
      const r = row as Record<string, unknown>;
      const letto = motivoInItaliano(asString(r.status), asString(r.reason));
      return { nome: p.name, stato: letto.stato, motivo: letto.motivo };
    })
    .filter((v): v is Indisponibile => v !== null);

  return {
    teamId: asNumber(r.team_id),
    teamName: asString(r.team_name),
    formation: asString(r.formation),
    confidence: asNumber(r.confidence),
    starters,
    benchCount: Array.isArray(r.substitutes) ? r.substitutes.length : 0,
    unavailable,
  };
}

/**
 * Il nome della voce di cache di questa gara.
 *
 * La cache è quella condivisa di Next, non una mappa in memoria: su più istanze una
 * mappa vale solo per l'istanza che l'ha riempita, e il lavoro pianificato che rinfresca
 * le formazioni gira quasi sempre altrove. Con un nome condiviso, invece, ciò che la
 * sveglia rilegge lo trova anche chi apre la pagina.
 */
export function lineupsCacheTag(eventId: number): string {
  return "lineups:".concat(String(eventId));
}

async function loadLineups(eventId: number): Promise<MatchLineups | null> {
  const config = resolveProviderConfig();
  if (!config) return null;

  let payload: unknown;
  try {
    const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
    payload = await client.getJson("/api/v2/events/".concat(String(eventId), "/lineups/"));
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as Record<string, unknown>;
  const sides = (root.lineups ?? {}) as Record<string, unknown>;
  const unavailable = (root.unavailable_players ?? {}) as Record<string, unknown>;

  const home = normalizeSide(sides.home, unavailable.home);
  const away = normalizeSide(sides.away, unavailable.away);
  if (home === null && away === null) return null;

  return {
    confirmed: asString(root.lineup_status) === "confirmed",
    beta: root.beta === true,
    home,
    away,
    updatedAt: asString(root.updated_at),
  };
}

/** Formazioni della gara. Fail-closed → null: un undici inventato non esiste. */
export async function getMatchLineups(eventId: number): Promise<MatchLineups | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  const load = unstable_cache(
    () => loadLineups(eventId),
    ["iqstats-lineups", String(eventId)],
    { tags: [lineupsCacheTag(eventId)], revalidate: CACHE_TTL_SECONDS },
  );
  return load();
}
