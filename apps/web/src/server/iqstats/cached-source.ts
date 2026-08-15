import "server-only";

import { unstable_cache } from "next/cache";

import type { JsonSource } from "./provider-client.ts";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface CachePolicy {
  readonly tag: string;
  readonly revalidate: number;
}

function match(pattern: RegExp, pathname: string): string | null {
  return pattern.exec(pathname)?.[1] ?? null;
}

/**
 * Politiche di cache della scheda squadra, come da contratto TEAM-1 §4.
 *
 * Le statistiche di una gara conclusa sono immutabili e valgono il 95% del costo:
 * hanno la freschezza più lunga. Questa sorgente è usata soltanto dalle rotte
 * squadra, che chiedono statistiche di gare già concluse; le rotte gara
 * continuano a usare la sorgente non cacheata.
 *
 * Un percorso senza politica non viene cacheato: il default resta il passante.
 */
function policyFor(pathname: string, params: URLSearchParams): CachePolicy | null {
  const eventStats = match(/^\/api\/v2\/events\/(\d+)\/stats\/$/, pathname);
  if (eventStats) return { tag: `event-stats:${eventStats}`, revalidate: 30 * DAY };

  const playerStats = match(/^\/api\/v2\/events\/(\d+)\/player-stats\/$/, pathname);
  if (playerStats) return { tag: `event-player-stats:${playerStats}`, revalidate: 30 * DAY };

  const venue = match(/^\/api\/v2\/venues\/(\d+)\/$/, pathname);
  if (venue) return { tag: `venue:${venue}`, revalidate: 30 * DAY };

  const team = match(/^\/api\/v2\/teams\/(\d+)\/$/, pathname);
  if (team) return { tag: `team:${team}`, revalidate: DAY };

  const squad = match(/^\/api\/v2\/teams\/(\d+)\/squad\/$/, pathname);
  if (squad) return { tag: `team-squad:${squad}`, revalidate: DAY };

  const fixtures = match(/^\/api\/v2\/teams\/(\d+)\/fixtures\/$/, pathname);
  if (fixtures) return { tag: `team-fixtures:${fixtures}`, revalidate: 5 * MINUTE };

  const manager = match(/^\/api\/v2\/managers\/(\d+)\/$/, pathname);
  if (manager) return { tag: `manager:${manager}`, revalidate: DAY };

  const referee = match(/^\/api\/v2\/referees\/(\d+)\/$/, pathname);
  if (referee) return { tag: `referee:${referee}`, revalidate: DAY };

  // Anagrafica e metro di lega degli arbitri: un solo GET, freschezza lunga.
  if (pathname === "/api/v2/referees/" && params.has("league_id")) {
    return { tag: `referees:${params.get("league_id")}`, revalidate: DAY };
  }

  const seasons = match(/^\/api\/v2\/leagues\/(\d+)\/seasons\/$/, pathname);
  if (seasons) return { tag: `seasons:${seasons}`, revalidate: DAY };

  const standings = match(/^\/api\/v2\/leagues\/(\d+)\/standings\/$/, pathname);
  if (standings) {
    const seasonId = params.get("season_id") ?? "current";
    return { tag: `standings:${standings}:${seasonId}`, revalidate: 10 * MINUTE };
  }

  if (pathname === "/api/v2/leagues/") return { tag: "competitions", revalidate: DAY };

  // L'elenco gare della squadra è l'unica chiamata che deve accorgersi di una
  // nuova gara conclusa: freschezza breve, così l'aggregato si ricompone da solo.
  if (pathname === "/api/v2/events/" && params.has("team_id")) {
    return { tag: `team-events:${params.get("team_id")}`, revalidate: 5 * MINUTE };
  }

  return null;
}

export class CachedJsonSource implements JsonSource {
  readonly #source: JsonSource;

  constructor(source: JsonSource) {
    this.#source = source;
  }

  async getJson(path: string): Promise<unknown> {
    const url = new URL(path, "https://iqstats.invalid");
    const policy = policyFor(url.pathname, url.searchParams);
    if (policy === null) return this.#source.getJson(path);

    const load = unstable_cache(() => this.#source.getJson(path), ["iqstats-provider", path], {
      tags: [policy.tag],
      revalidate: policy.revalidate,
    });
    return load();
  }
}
