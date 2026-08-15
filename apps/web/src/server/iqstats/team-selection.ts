// Regola di selezione di competizione e stagione della scheda squadra.
// Modulo puro: nessuna chiamata alla fonte, così la regola è verificabile con i test.

export interface TeamCompetitionOption {
  readonly leagueId: string;
  readonly leagueName: string;
  readonly seasonId: string;
  readonly matches: number;
  readonly lastMatchAt: string;
}

export interface TeamSelectionRequest {
  readonly leagueId: string | null;
  readonly seasonId: string | null;
}

export interface TeamSelectionContext {
  /** Stagione dichiarata corrente dalla fonte, per lega. */
  readonly currentSeasonByLeague: ReadonlyMap<string, string | null>;
  /**
   * Gare concluse che la stagione corrente deve avere per diventare quella di
   * riferimento: il doppio del campione minimo, perché casa e trasferta lo
   * raggiungano entrambi. Sotto questa soglia resta la stagione precedente, dichiarata.
   */
  readonly currentSeasonThreshold: number;
}

function mostRecent(
  left: TeamCompetitionOption,
  right: TeamCompetitionOption,
): TeamCompetitionOption {
  return right.lastMatchAt > left.lastMatchAt ? right : left;
}

/**
 * Due passi, in quest'ordine:
 * 1. il campionato di riferimento è quello che domina lo storico della squadra, non
 *    quello con la gara più recente: altrimenti in estate vincerebbero le amichevoli;
 * 2. dentro quel campionato vale la stagione corrente appena ha gare sufficienti,
 *    altrimenti la stagione più recente che ha dati.
 */
export function selectCompetition(
  options: readonly TeamCompetitionOption[],
  requested: TeamSelectionRequest,
  context: TeamSelectionContext,
): TeamCompetitionOption | null {
  if (options.length === 0) return null;

  const exact = options.find(
    (option) =>
      option.leagueId === requested.leagueId && option.seasonId === requested.seasonId,
  );
  if (exact) return exact;

  const scope =
    requested.leagueId !== null
      ? options.filter((option) => option.leagueId === requested.leagueId)
      : options;
  if (scope.length === 0) return options[0] ?? null;

  const byLeague = new Map<string, TeamCompetitionOption[]>();
  for (const option of scope) {
    const existing = byLeague.get(option.leagueId);
    if (existing) existing.push(option);
    else byLeague.set(option.leagueId, [option]);
  }

  let leagueOptions: readonly TeamCompetitionOption[] = [];
  let leagueMatches = -1;
  let leagueLastMatchAt = "";
  for (const candidates of byLeague.values()) {
    const matches = candidates.reduce((total, option) => total + option.matches, 0);
    const lastMatchAt = candidates.reduce(mostRecent).lastMatchAt;
    if (matches > leagueMatches || (matches === leagueMatches && lastMatchAt > leagueLastMatchAt)) {
      leagueOptions = candidates;
      leagueMatches = matches;
      leagueLastMatchAt = lastMatchAt;
    }
  }
  if (leagueOptions.length === 0) return null;

  const currentSeasonId = context.currentSeasonByLeague.get(leagueOptions[0]!.leagueId) ?? null;
  const current = leagueOptions.find((option) => option.seasonId === currentSeasonId);
  if (current && current.matches >= context.currentSeasonThreshold) return current;

  // La stagione corrente sotto soglia esce anche dal ripiego: è pur sempre la più
  // recente, e senza questa esclusione tornerebbe dentro dalla finestra.
  const previous = leagueOptions.filter((option) => option.seasonId !== currentSeasonId);
  return (previous.length > 0 ? previous : leagueOptions).reduce(mostRecent);
}
