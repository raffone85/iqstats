// Server-only: il mercato di una gara, letto come probabilità e direzione.
// Non si nominano gli operatori e non si porta fuori nessun collegamento: di ogni esito
// restano la quota di consenso, la probabilità implicita ripulita dal margine e il verso
// del movimento. Fail-closed → null: un mercato assente resta assente.
import "server-only";

import { ProviderClient } from "./provider-client.ts";
import { GatewayError } from "./errors.ts";
import { mediana } from "./statistica.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
const CACHE_TTL_MS = 120_000;
/** Sotto questa quota di operatori concordi il movimento non si dichiara. */
const DRIFT_MAJORITY = 0.6;

export type Drift = "verso" | "contro";

export interface MarketOutcome {
  readonly key: string;
  readonly label: string | null;
  readonly consensusOdds: number | null;
  /** 0–100, ripulita dal margine quando il mercato è a due o tre esiti. */
  readonly impliedProb: number | null;
  readonly drift: Drift | null;
  readonly books: number;
}

export interface MatchOdds {
  readonly bookmakers: number;
  readonly updatedAt: string | null;
  readonly markets: Readonly<Record<string, readonly MarketOutcome[]>>;
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



interface RawOutcome {
  readonly key: string;
  readonly label: string | null;
  readonly odds: number | null;
  readonly drift: Drift | null;
  readonly books: number;
  readonly latest: string | null;
}

/** Un esito: quota di consenso (mediana, non il prezzo migliore) e verso prevalente. */
function readOutcome(key: string, value: unknown): RawOutcome | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const books = (row.bookmakers ?? {}) as Record<string, unknown>;

  const quotes: number[] = [];
  let shortening = 0;
  let drifting = 0;
  let latest: string | null = null;

  for (const entry of Object.values(books)) {
    if (typeof entry !== "object" || entry === null) continue;
    const b = entry as Record<string, unknown>;
    const odds = typeof b.decimal_odds === "number" && b.decimal_odds > 1 ? b.decimal_odds : null;
    if (odds !== null) quotes.push(odds);
    if (b.movement === "SHORTENING") shortening += 1;
    else if (b.movement === "DRIFTING") drifting += 1;
    const updated = typeof b.updated_at === "string" ? b.updated_at : null;
    if (updated !== null && (latest === null || updated > latest)) latest = updated;
  }

  const moves = shortening + drifting;
  const drift =
    moves === 0
      ? null
      : shortening / moves >= DRIFT_MAJORITY
        ? "verso"
        : drifting / moves >= DRIFT_MAJORITY
          ? "contro"
          : null;

  return {
    key,
    label: typeof row.outcome_name === "string" && row.outcome_name.length > 0 ? row.outcome_name : null,
    odds: mediana(quotes),
    drift,
    books: quotes.length,
    latest,
  };
}

const cache = new Map<number, { value: MatchOdds | null; expiresAt: number }>();

/**
 * Mercato di una gara. Le probabilità implicite dei mercati a due o tre esiti vengono
 * riportate a somma cento: la somma grezza supera sempre il cento, ed è il margine di chi
 * quota, non una probabilità.
 */
export async function getMatchOdds(eventId: number): Promise<MatchOdds | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  const now = Date.now();
  const cached = cache.get(eventId);
  if (cached && cached.expiresAt > now) return cached.value;

  const config = resolveProviderConfig();
  if (!config) return null;

  let payload: unknown;
  try {
    const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
    payload = await client.getJson("/api/v2/events/".concat(String(eventId), "/odds/comparison/"));
  } catch (reason) {
    if (reason instanceof GatewayError && reason.code === "not_found") {
      cache.set(eventId, { value: null, expiresAt: now + CACHE_TTL_MS });
    }
    return null;
  }

  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as Record<string, unknown>;
  const rawMarkets = (root.markets ?? {}) as Record<string, unknown>;

  const markets: Record<string, MarketOutcome[]> = {};
  let updatedAt: string | null = null;

  for (const [marketKey, marketValue] of Object.entries(rawMarkets)) {
    if (typeof marketValue !== "object" || marketValue === null) continue;
    const outcomes: RawOutcome[] = [];
    for (const [outcomeKey, outcomeValue] of Object.entries(marketValue as Record<string, unknown>)) {
      const outcome = readOutcome(outcomeKey, outcomeValue);
      if (outcome !== null && outcome.odds !== null) outcomes.push(outcome);
    }
    if (outcomes.length === 0) continue;

    // Il margine si toglie solo dentro un insieme chiuso di esiti. Un mercato a soglie
    // ne contiene molti: i corner arrivano con diciassette linee tutte insieme, e
    // sommarle sarebbe come sommare diciassette scommesse diverse. L'insieme chiuso è
    // la singola linea — sopra e sotto la stessa soglia — quindi si raggruppa per quella.
    const lineOf = (key: string): string => {
      const at = key.indexOf("@");
      return at === -1 ? "" : key.slice(at + 1);
    };
    const groupSum = new Map<string, number>();
    const groupSize = new Map<string, number>();
    for (const o of outcomes) {
      const group = lineOf(o.key);
      groupSum.set(group, (groupSum.get(group) ?? 0) + 1 / (o.odds as number));
      groupSize.set(group, (groupSize.get(group) ?? 0) + 1);
    }

    markets[marketKey] = outcomes.map((o) => {
      const raw = 1 / (o.odds as number);
      const group = lineOf(o.key);
      const size = groupSize.get(group) ?? 0;
      const sum = groupSum.get(group) ?? 0;
      const closed = size === 2 || size === 3;
      if (o.latest !== null && (updatedAt === null || o.latest > updatedAt)) updatedAt = o.latest;
      return {
        key: o.key,
        label: o.label,
        consensusOdds: o.odds,
        impliedProb: closed && sum > 0 ? (raw / sum) * 100 : raw * 100,
        drift: o.drift,
        books: o.books,
      };
    });
  }

  if (Object.keys(markets).length === 0) {
    cache.set(eventId, { value: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }

  const bookmakers = typeof root.bookmakers_count === "number" ? root.bookmakers_count : 0;
  const value: MatchOdds = { bookmakers, updatedAt, markets };
  cache.set(eventId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}
