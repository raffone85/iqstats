import {
  aggregateTeamSeasonSplits,
  aggregateTeamSquad,
  indexCompetitions,
  normalizeCompetitionCatalog,
  normalizeEventPlayerStats,
  normalizeHeadToHead,
  normalizeMatchDetail,
  normalizeMatchList,
  normalizeObservedMatchStats,
  normalizeOddsPages,
  normalizeRefereeDirectory,
  normalizeRefereeProfile,
  normalizeSeasonCatalog,
  normalizeStandingTable,
  normalizeTeamManager,
  normalizeTeamMatchMetrics,
  normalizeTeamProfile,
  normalizeTeamSquad,
  type CompetitionSummary,
  type DataEnvelope,
  type HeadToHeadSample,
  type MatchDetail,
  type MatchList,
  type MatchSummary,
  type ObservedMatchStatsCollection,
  type OddsCollection,
  type PlayerMatchStats,
  type RefereeDirectory,
  type RefereeProfile,
  type SeasonSummary,
  type StandingTable,
  type TeamManagerProfile,
  type TeamMatchMetrics,
  type TeamProfile,
  type TeamSeasonSplits,
  type TeamSquad,
} from "@iqstats/shared";

import { GatewayError } from "./errors.ts";
import { providerStatus, type MatchQuery } from "./query.ts";
import type { JsonSource } from "./provider-client.ts";

type UnknownRecord = Record<string, unknown>;

interface PageBatch {
  readonly payloads: readonly UnknownRecord[];
  readonly combined: UnknownRecord;
  readonly complete: boolean;
  readonly available: number;
  readonly total: number;
}

const CATALOG_PAGE_SIZE = 100;
const CATALOG_MAX_PAGES = 3;
const ODDS_PAGE_SIZE = 200;
const ODDS_MAX_PAGES = 5;
/** Una sola pagina copre l'intera stagione di una squadra: 38 gare su 50 osservate. */
const TEAM_EVENTS_PAGE_SIZE = 50;
/**
 * Gare aggregate: l'intera pagina di gare concluse della stagione, non un
 * sottoinsieme. Il costo si paga una volta sola perché una gara conclusa è immutabile.
 */
const TEAM_SEASON_MATCH_LIMIT = TEAM_EVENTS_PAGE_SIZE;
const TEAM_FIXTURES_LIMIT = 10;
const TEAM_STATS_CONCURRENCY = 4;
/** Una pagina copre tutti gli arbitri di una lega: 42 osservati in Serie A. */
const REFEREE_DIRECTORY_LIMIT = 100;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function stringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function assertPage(value: unknown): UnknownRecord & { readonly results: readonly unknown[] } {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new GatewayError("source_invalid_response");
  }
  return value as UnknownRecord & { readonly results: readonly unknown[] };
}

function requireEnvelope<T>(envelope: DataEnvelope<T>): DataEnvelope<T> {
  if (envelope.data === null || envelope.availability.status === "error") {
    throw new GatewayError("source_invalid_response");
  }
  return envelope;
}

function markPartial<T>(
  envelope: DataEnvelope<T>,
  missingField: string,
  available: number,
  total: number,
): DataEnvelope<T> {
  const missingFields = [...new Set([...envelope.availability.missingFields, missingField])];
  return {
    ...envelope,
    availability: {
      status: "partial",
      reason: "insufficient_coverage",
      missingFields,
      coverage: {
        available,
        total,
        ratio: total > 0 ? available / total : null,
      },
    },
  };
}

function appendPartial<T>(envelope: DataEnvelope<T>, missingField: string): DataEnvelope<T> {
  return {
    ...envelope,
    availability: {
      status: "partial",
      reason: "insufficient_coverage",
      missingFields: [
        ...new Set([...envelope.availability.missingFields, missingField]),
      ],
      coverage: envelope.availability.coverage,
    },
  };
}

async function fetchPages(
  source: JsonSource,
  pathForOffset: (offset: number) => string,
  pageSize: number,
  maxPages: number,
): Promise<PageBatch> {
  const payloads: UnknownRecord[] = [];
  const results: unknown[] = [];
  let declaredTotal: number | null = null;
  let complete = false;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const payload = assertPage(await source.getJson(pathForOffset(pageIndex * pageSize)));
    const pageTotal = nonNegativeInteger(payload.count);
    if (pageTotal !== null) {
      if (declaredTotal !== null && pageTotal !== declaredTotal) {
        throw new GatewayError("source_invalid_response");
      }
      declaredTotal = pageTotal;
    }

    payloads.push(payload);
    results.push(...payload.results);
    const hasNext = payload.next !== null && payload.next !== undefined;
    if (!hasNext || payload.results.length === 0) {
      complete = true;
      break;
    }
  }

  const total = declaredTotal ?? results.length;
  if (results.length >= total) complete = true;

  return {
    payloads,
    combined: {
      count: total,
      next: complete ? null : "capped",
      previous: null,
      results,
    },
    complete,
    available: results.length,
    total,
  };
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index] as T);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function teamSide(match: MatchSummary, teamId: string): "home" | "away" | null {
  if (match.homeTeam.id === teamId) return "home";
  if (match.awayTeam.id === teamId) return "away";
  return null;
}

/** Gare più recenti prima, con il filtro competizione applicato prima del taglio. */
function recentMatches(
  matches: readonly MatchSummary[],
  leagueId: string | null,
  limit: number,
): readonly MatchSummary[] {
  return matches
    .filter((match) => leagueId === null || match.competition.id === leagueId)
    .toSorted((left, right) => right.kickoffAt.localeCompare(left.kickoffAt))
    .slice(0, limit);
}

function matchPeriod(matches: readonly MatchSummary[]): {
  readonly from: string | null;
  readonly to: string | null;
} {
  const dates = matches.map((match) => match.kickoffAt).toSorted();
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null };
}

export interface TeamSeasonQuery {
  readonly seasonId: string;
  readonly leagueId: string | null;
  readonly limit?: number;
}

export class IqstatsGateway {
  readonly #source: JsonSource;
  readonly #clock: () => string;

  constructor(source: JsonSource, clock: () => string = () => new Date().toISOString()) {
    this.#source = source;
    this.#clock = clock;
  }

  async getCompetitions(): Promise<DataEnvelope<readonly CompetitionSummary[]>> {
    const batch = await fetchPages(
      this.#source,
      (offset) => `/api/v2/leagues/?limit=${CATALOG_PAGE_SIZE}&offset=${offset}`,
      CATALOG_PAGE_SIZE,
      CATALOG_MAX_PAGES,
    );
    let envelope = requireEnvelope(normalizeCompetitionCatalog(batch.combined, this.#clock()));
    if (!batch.complete) {
      envelope = markPartial(
        envelope,
        "pagination",
        batch.available,
        batch.total,
      );
    }
    return envelope;
  }

  async #competitionIndex(): Promise<{
    readonly index: Readonly<Record<string, CompetitionSummary>>;
    readonly partial: boolean;
  }> {
    const envelope = await this.getCompetitions();
    return {
      index: indexCompetitions(envelope.data ?? []),
      partial: envelope.availability.status === "partial",
    };
  }

  async getMatches(query: MatchQuery): Promise<DataEnvelope<MatchList>> {
    const params = new URLSearchParams({
      league_id: query.leagueId,
      date_from: query.date,
      date_to: query.date,
      limit: String(query.limit),
      offset: String(query.offset),
    });
    const mappedStatus = providerStatus(query.status);
    if (mappedStatus !== null) params.set("status", mappedStatus);

    const [catalog, payload] = await Promise.all([
      this.#competitionIndex(),
      this.#source.getJson(`/api/v2/events/?${params.toString()}`),
    ]);
    let envelope = requireEnvelope(
      normalizeMatchList(payload, {
        capturedAt: this.#clock(),
        competitions: catalog.index,
      }),
    );
    if (
      envelope.data?.items.some(
        (match) =>
          match.competition.id !== query.leagueId ||
          (query.status !== null && match.status !== query.status),
      )
    ) {
      throw new GatewayError("source_invalid_response");
    }
    if (catalog.partial) {
      envelope = appendPartial(envelope, "competitionCatalog.pagination");
    }
    return envelope;
  }

  async getMatchDetail(matchId: string): Promise<DataEnvelope<MatchDetail>> {
    const [catalog, payload] = await Promise.all([
      this.#competitionIndex(),
      this.#source.getJson(`/api/v2/events/${matchId}/`),
    ]);
    let envelope = requireEnvelope(
      normalizeMatchDetail(payload, {
        capturedAt: this.#clock(),
        competitions: catalog.index,
      }),
    );
    if (envelope.data?.id !== matchId) throw new GatewayError("source_invalid_response");
    if (catalog.partial) {
      envelope = appendPartial(envelope, "competitionCatalog.pagination");
    }
    return envelope;
  }

  async getOdds(matchId: string): Promise<DataEnvelope<OddsCollection>> {
    const batch = await fetchPages(
      this.#source,
      (offset) => {
        const params = new URLSearchParams({
          event_id: matchId,
          limit: String(ODDS_PAGE_SIZE),
          offset: String(offset),
        });
        return `/api/v2/odds/?${params.toString()}`;
      },
      ODDS_PAGE_SIZE,
      ODDS_MAX_PAGES,
    );
    let envelope = requireEnvelope(
      normalizeOddsPages(batch.payloads, { matchId, capturedAt: this.#clock() }),
    );
    if (!batch.complete && envelope.availability.status !== "partial") {
      envelope = markPartial(envelope, "pagination", batch.available, batch.total);
    }
    return envelope;
  }

  async getStatistics(matchId: string): Promise<DataEnvelope<ObservedMatchStatsCollection>> {
    const detail = await this.#source.getJson(`/api/v2/events/${matchId}/`);
    if (!isRecord(detail)) throw new GatewayError("source_invalid_response");
    const homeTeamId = stringId(detail.home_team_id);
    const awayTeamId = stringId(detail.away_team_id);
    if (!homeTeamId || !awayTeamId) throw new GatewayError("source_invalid_response");

    const payload = await this.#source.getJson(`/api/v2/events/${matchId}/stats/`);
    return requireEnvelope(
      normalizeObservedMatchStats(payload, {
        matchId,
        homeTeamId,
        awayTeamId,
        capturedAt: this.#clock(),
      }),
    );
  }

  async getHeadToHead(matchId: string): Promise<DataEnvelope<HeadToHeadSample>> {
    const payload = await this.#source.getJson(`/api/v2/events/${matchId}/h2h/`);
    return requireEnvelope(
      normalizeHeadToHead(payload, { matchId, capturedAt: this.#clock() }),
    );
  }

  async getStandings(
    leagueId: string,
    seasonId: string,
  ): Promise<DataEnvelope<StandingTable>> {
    const params = new URLSearchParams({ season_id: seasonId });
    const payload = await this.#source.getJson(
      `/api/v2/leagues/${leagueId}/standings/?${params.toString()}`,
    );
    const envelope = requireEnvelope(
      normalizeStandingTable(payload, { capturedAt: this.#clock() }),
    );
    if (
      envelope.data?.leagueId !== leagueId ||
      envelope.data.seasonId !== seasonId
    ) {
      throw new GatewayError("source_invalid_response");
    }
    return envelope;
  }

  async getSeasons(leagueId: string): Promise<DataEnvelope<readonly SeasonSummary[]>> {
    const payload = await this.#source.getJson(`/api/v2/leagues/${leagueId}/seasons/`);
    return requireEnvelope(normalizeSeasonCatalog(payload, this.#clock()));
  }

  /**
   * `teams/{id}/` espone soltanto identità e `venue_id`. Lo stadio è un secondo
   * GET: se non risponde la testata resta disponibile e dichiara il campo mancante.
   */
  async getTeamProfile(teamId: string): Promise<DataEnvelope<TeamProfile>> {
    const payload = await this.#source.getJson(`/api/v2/teams/${teamId}/`);
    if (!isRecord(payload) || stringId(payload.id) !== teamId) {
      throw new GatewayError("source_invalid_response");
    }

    const venueId = stringId(payload.venue_id);
    let venuePayload: unknown = null;
    if (venueId !== null) {
      try {
        venuePayload = await this.#source.getJson(`/api/v2/venues/${venueId}/`);
      } catch {
        venuePayload = null;
      }
    }
    return requireEnvelope(
      normalizeTeamProfile(payload, venuePayload, { capturedAt: this.#clock() }),
    );
  }

  /**
   * L'allenatore non è esposto da `teams/{id}/` e `managers/{id}/` può dichiarare
   * un `current_team_id` diverso: si deriva dai `*_coach_id` della prossima gara,
   * e la gara di provenienza resta dichiarata nel dato.
   */
  async getTeamManager(teamId: string): Promise<DataEnvelope<TeamManagerProfile>> {
    const params = new URLSearchParams({
      status: "notstarted",
      limit: String(TEAM_FIXTURES_LIMIT),
    });
    const fixtures = assertPage(
      await this.#source.getJson(`/api/v2/teams/${teamId}/fixtures/?${params.toString()}`),
    );
    const capturedAt = this.#clock();

    let managerId: string | null = null;
    let matchId: string | null = null;
    for (const candidate of fixtures.results) {
      if (!isRecord(candidate)) continue;
      const isHome = stringId(candidate.home_team_id) === teamId;
      const isAway = stringId(candidate.away_team_id) === teamId;
      if (!isHome && !isAway) continue;
      const coachId = stringId(isHome ? candidate.home_coach_id : candidate.away_coach_id);
      if (coachId === null) continue;
      managerId = coachId;
      matchId = stringId(candidate.id);
      break;
    }

    if (managerId === null) {
      return {
        data: null,
        availability: {
          status: "unavailable",
          reason: "not_captured",
          missingFields: ["manager"],
          coverage: null,
        },
        provenance: {
          sourceKind: "external-data",
          capturedAt,
          sourceUpdatedAt: null,
          asOf: null,
        },
        calculation: null,
      };
    }

    const payload = await this.#source.getJson(`/api/v2/managers/${managerId}/`);
    const envelope = requireEnvelope(
      normalizeTeamManager(payload, {
        capturedAt,
        ...(matchId === null ? {} : { derivedFromMatchId: matchId }),
      }),
    );
    if (envelope.data?.managerId !== managerId) {
      throw new GatewayError("source_invalid_response");
    }
    return envelope;
  }

  /**
   * `teams/{id}/fixtures/?status=finished` copre solo una finestra attorno a oggi:
   * lo storico stagionale passa da `events/?team_id=&season_id=`.
   */
  async getTeamFinishedMatches(
    teamId: string,
    seasonId: string | null,
  ): Promise<DataEnvelope<MatchList>> {
    const params = new URLSearchParams({
      team_id: teamId,
      status: "finished",
      limit: String(TEAM_EVENTS_PAGE_SIZE),
    });
    // Senza `season_id` la fonte restituisce lo storico completo, il più recente
    // prima: è così che si risolve la competizione di riferimento di una squadra.
    if (seasonId !== null) params.set("season_id", seasonId);
    return this.#teamMatches(teamId, `/api/v2/events/?${params.toString()}`);
  }

  async getTeamUpcomingMatches(teamId: string): Promise<DataEnvelope<MatchList>> {
    const params = new URLSearchParams({
      status: "notstarted",
      limit: String(TEAM_FIXTURES_LIMIT),
    });
    return this.#teamMatches(teamId, `/api/v2/teams/${teamId}/fixtures/?${params.toString()}`);
  }

  async #teamMatches(teamId: string, path: string): Promise<DataEnvelope<MatchList>> {
    const [catalog, payload] = await Promise.all([
      this.#competitionIndex(),
      this.#source.getJson(path),
    ]);
    let envelope = requireEnvelope(
      normalizeMatchList(payload, {
        capturedAt: this.#clock(),
        competitions: catalog.index,
      }),
    );
    if (envelope.data?.items.some((match) => teamSide(match, teamId) === null)) {
      throw new GatewayError("source_invalid_response");
    }
    if (catalog.partial) {
      envelope = appendPartial(envelope, "competitionCatalog.pagination");
    }
    return envelope;
  }

  async #finishedSelection(
    teamId: string,
    query: TeamSeasonQuery,
  ): Promise<readonly MatchSummary[]> {
    const matches = await this.getTeamFinishedMatches(teamId, query.seasonId);
    return recentMatches(
      matches.data?.items ?? [],
      query.leagueId,
      query.limit ?? TEAM_SEASON_MATCH_LIMIT,
    );
  }

  /**
   * Nessun endpoint restituisce medie di squadra: si aggregano le gare concluse,
   * una richiesta per gara, con il campione dichiarato metrica per metrica.
   */
  async getTeamSeasonSplits(
    teamId: string,
    query: TeamSeasonQuery,
  ): Promise<DataEnvelope<TeamSeasonSplits>> {
    const selected = await this.#finishedSelection(teamId, query);
    const capturedAt = this.#clock();
    const rows = await mapLimited(selected, TEAM_STATS_CONCURRENCY, async (match) => {
      const side = teamSide(match, teamId);
      if (side === null) return null;
      let payload: unknown;
      try {
        payload = await this.#source.getJson(`/api/v2/events/${match.id}/stats/`);
      } catch {
        return null;
      }
      return normalizeTeamMatchMetrics(payload, {
        eventId: match.id,
        teamId,
        side,
        capturedAt,
        playedAt: match.kickoffAt,
        opponentName: side === "home" ? match.awayTeam.name : match.homeTeam.name,
        refereeId: match.refereeId,
      }).data;
    });

    const observed = rows.filter((row): row is TeamMatchMetrics => row !== null);
    let envelope = aggregateTeamSeasonSplits(observed, {
      teamId,
      seasonId: query.seasonId,
      capturedAt,
      period: matchPeriod(selected),
    });
    if (observed.length < selected.length) {
      envelope = markPartial(envelope, "eventStats", observed.length, selected.length);
    }
    return envelope;
  }

  /**
   * `events/{id}/player-stats/` copre entrambe le formazioni in un solo GET: la
   * rosa statistica costa quanto le medie di squadra, non un GET per giocatore.
   */
  async getTeamSquadStats(
    teamId: string,
    query: TeamSeasonQuery,
  ): Promise<DataEnvelope<TeamSquad>> {
    const selected = await this.#finishedSelection(teamId, query);
    const capturedAt = this.#clock();
    const squad = requireEnvelope(
      normalizeTeamSquad(await this.#source.getJson(`/api/v2/teams/${teamId}/squad/`), {
        teamId,
        capturedAt,
      }),
    );

    const pages = await mapLimited(selected, TEAM_STATS_CONCURRENCY, async (match) => {
      let payload: unknown;
      try {
        payload = await this.#source.getJson(`/api/v2/events/${match.id}/player-stats/`);
      } catch {
        return null;
      }
      return normalizeEventPlayerStats(payload, { teamId, capturedAt }).data;
    });

    const covered = pages.filter((page): page is readonly PlayerMatchStats[] => page !== null);
    let envelope = aggregateTeamSquad(squad.data ?? [], covered.flat(), {
      teamId,
      capturedAt,
      matchesCovered: covered.length,
    });
    if (covered.length < selected.length) {
      envelope = markPartial(envelope, "eventPlayerStats", covered.length, selected.length);
    }
    return envelope;
  }

  /**
   * Un solo GET porta tutti gli arbitri della lega con nome e aggregati: è insieme
   * l'anagrafica e il metro con cui leggere il singolo arbitro.
   */
  async getRefereeDirectory(leagueId: string): Promise<DataEnvelope<RefereeDirectory>> {
    const params = new URLSearchParams({
      league_id: leagueId,
      limit: String(REFEREE_DIRECTORY_LIMIT),
    });
    return requireEnvelope(
      normalizeRefereeDirectory(
        await this.#source.getJson(`/api/v2/referees/?${params.toString()}`),
        { leagueId, capturedAt: this.#clock() },
      ),
    );
  }

  /** Fallback per un arbitro che non compare nel catalogo della competizione. */
  async getRefereeProfile(refereeId: string): Promise<DataEnvelope<RefereeProfile>> {
    const payload = await this.#source.getJson(`/api/v2/referees/${refereeId}/`);
    const envelope = requireEnvelope(
      normalizeRefereeProfile(payload, { capturedAt: this.#clock() }),
    );
    if (envelope.data?.refereeId !== refereeId) {
      throw new GatewayError("source_invalid_response");
    }
    return envelope;
  }
}
