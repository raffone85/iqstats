import type {
  DataAvailability,
  DataEnvelope,
  HeadToHeadSample,
  MatchDetail,
  MatchSection,
  ObservedMatchStatsCollection,
  ObservedMetric,
  OddsCollection,
  OddsMarket,
  OddsMovement,
  OddsOutcome,
  StandingEntry,
  StandingTable,
} from "@iqstats/shared";

import {
  getIqstatsPageData,
  type PageApiResult,
} from "@/server/iqstats/page-api";

const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const numberFormatter = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 2,
});

const sectionLabels: Readonly<Record<MatchSection, string>> = {
  odds: "Quote",
  statistics: "Statistiche osservate",
  form: "Forma compatta",
  standings: "Classifica",
  headToHead: "Testa a testa",
  context: "Contesto squadra",
  signals: "Segnali",
};

const observedMetrics: readonly { readonly key: ObservedMetric; readonly label: string }[] = [
  { key: "shots", label: "Tiri" },
  { key: "shotsOnTarget", label: "Tiri in porta" },
  { key: "fouls", label: "Falli" },
  { key: "corners", label: "Calci d’angolo" },
  { key: "yellowCards", label: "Ammonizioni" },
  { key: "goalkeeperSaves", label: "Parate" },
  { key: "offsides", label: "Fuorigioco" },
];

const marketLabels: Readonly<Record<OddsMarket, string>> = {
  "1x2": "1X2",
  btts: "Entrambe segnano",
  over_under_15: "Over/Under 1.5",
  over_under_25: "Over/Under 2.5",
  over_under_35: "Over/Under 3.5",
  double_chance: "Doppia chance",
  draw_no_bet: "Rimborso in caso di pareggio",
  total_corners: "Totale corner",
  corners_1x2: "Corner 1X2",
  total_red_cards: "Totale cartellini rossi",
  red_card: "Cartellino rosso",
};

const outcomeLabels: Readonly<Record<OddsOutcome, string>> = {
  HOME: "Casa",
  DRAW: "Pareggio",
  AWAY: "Trasferta",
  over: "Over",
  under: "Under",
  yes: "Sì",
  no: "No",
  "1X": "1X",
  "12": "12",
  X2: "X2",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Timestamp non disponibile" : dateTimeFormatter.format(date);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatNumber(value: number | null) {
  return value === null ? "Non rilevato" : numberFormatter.format(value);
}

function availabilityLabel(availability: DataAvailability) {
  if (availability.status === "available" || availability.status === "stale") return "Disponibile";
  if (availability.status === "partial") return "Parziale";
  if (availability.status === "error") return "Non disponibile ora";
  return "Non coperta";
}

function envelopeFor<T>(result: PageApiResult<T> | null): DataEnvelope<T> | null {
  if (
    result?.kind !== "success" ||
    result.envelope.data === null ||
    result.envelope.availability.status === "unavailable" ||
    result.envelope.availability.status === "error"
  ) {
    return null;
  }
  return result.envelope;
}

function availabilityFor<T>(result: PageApiResult<T> | null, fallback: DataAvailability) {
  return result?.kind === "success" ? result.envelope.availability : fallback;
}

function SectionMeta({ capturedAt }: Readonly<{ capturedAt: string }>) {
  return <p className="evidence-meta">Fonte esterna normalizzata · acquisita {formatDateTime(capturedAt)}</p>;
}

function PartialCoverage({ availability }: Readonly<{ availability: DataAvailability }>) {
  if (availability.status !== "partial" || availability.missingFields.length === 0) return null;
  return <p className="coverage-note">Copertura parziale: {availability.missingFields.join(", ")} non è stata rilevata.</p>;
}

function StatisticsSection({
  envelope,
  match,
}: Readonly<{
  envelope: DataEnvelope<ObservedMatchStatsCollection>;
  match: MatchDetail;
}>) {
  const statistics = envelope.data;
  if (!statistics) return null;

  const home = statistics.teams.find((team) => team.side === "home");
  const away = statistics.teams.find((team) => team.side === "away");
  if (!home || !away) return null;

  return (
    <section className="evidence-section" aria-labelledby="statistics-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Gara osservata</p>
          <h2 id="statistics-title">Statistiche squadra</h2>
        </div>
        <SectionMeta capturedAt={envelope.provenance.capturedAt} />
      </div>
      <PartialCoverage availability={envelope.availability} />
      <div className="stat-table-frame">
        <table className="stat-comparison">
          <thead>
            <tr>
              <th scope="col">Metrica</th>
              <th scope="col">{match.homeTeam.name}</th>
              <th scope="col">{match.awayTeam.name}</th>
            </tr>
          </thead>
          <tbody>
            {observedMetrics.map((metric) => (
              <tr key={metric.key}>
                <th scope="row">{metric.label}</th>
                <td>{formatNumber(home.metrics[metric.key])}</td>
                <td>{formatNumber(away.metrics[metric.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HeadToHeadSection({
  envelope,
  match,
}: Readonly<{
  envelope: DataEnvelope<HeadToHeadSample>;
  match: MatchDetail;
}>) {
  const history = envelope.data;
  if (!history) return null;

  return (
    <section className="evidence-section" aria-labelledby="h2h-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Campione dichiarato</p>
          <h2 id="h2h-title">Testa a testa</h2>
        </div>
        <SectionMeta capturedAt={envelope.provenance.capturedAt} />
      </div>
      <PartialCoverage availability={envelope.availability} />
      <dl className="h2h-summary">
        <div><dt>Precedenti</dt><dd>{history.totalMatches}</dd></div>
        <div><dt>Vittorie {match.homeTeam.name}</dt><dd>{formatNumber(history.homeWins)}</dd></div>
        <div><dt>Pareggi</dt><dd>{formatNumber(history.draws)}</dd></div>
        <div><dt>Vittorie {match.awayTeam.name}</dt><dd>{formatNumber(history.awayWins)}</dd></div>
        <div><dt>Media gol totali</dt><dd>{formatNumber(history.averageTotalGoals)}</dd></div>
      </dl>
      {history.recentMatches.length > 0 ? (
        <ol className="recent-match-list">
          {history.recentMatches.map((recent, index) => (
            <li key={`${recent.date}-${recent.homeTeam}-${recent.awayTeam}-${index}`}>
              <time dateTime={recent.date}>{formatDate(recent.date)}</time>
              <span>{recent.homeTeam} <strong>{recent.score}</strong> {recent.awayTeam}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="evidence-empty">La fonte non ha restituito precedenti recenti per questa gara.</p>
      )}
    </section>
  );
}

function movementLabel(value: OddsMovement | null) {
  if (value === "shortening") return "In calo";
  if (value === "drifting") return "In salita";
  if (value === "unchanged") return "Invariata";
  return "Non rilevato";
}

function outcomeLabel(outcome: OddsOutcome, line: number | null) {
  const label = outcomeLabels[outcome];
  return line === null ? label : `${label} ${numberFormatter.format(line)}`;
}

function OddsSection({ envelope }: Readonly<{ envelope: DataEnvelope<OddsCollection> }>) {
  const odds = envelope.data;
  if (!odds) return null;

  const bestQuotes = odds.items.filter(
    (quote) => quote.bestPrice.status !== "unavailable" && quote.bestPrice.value,
  );
  const visibleQuotes = bestQuotes.length > 0 ? bestQuotes : odds.items;
  const showsBestPrice = bestQuotes.length > 0;

  return (
    <section className="evidence-section" aria-labelledby="odds-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Snapshot confrontabile</p>
          <h2 id="odds-title">Quote disponibili</h2>
        </div>
        <SectionMeta capturedAt={envelope.provenance.capturedAt} />
      </div>
      <PartialCoverage availability={envelope.availability} />
      {visibleQuotes.length === 0 ? (
        <p className="evidence-empty">L’API non ha restituito quote per questa gara al momento della rilevazione.</p>
      ) : (
        <>
          <p className="evidence-intro">
            {showsBestPrice
              ? "Sono mostrati i record che la fonte segnala come miglior prezzo corrente."
              : "La fonte non segnala il miglior prezzo: sono mostrati i record disponibili senza riorganizzarli."}
          </p>
          <ul className="odds-list">
            {visibleQuotes.map((quote) => (
              <li key={quote.id}>
                <div className="odds-heading">
                  <span>{marketLabels[quote.market]}</span>
                  <strong>{outcomeLabel(quote.outcome, quote.line)}</strong>
                </div>
                <dl>
                  <div><dt>Bookmaker</dt><dd>{quote.bookmaker.name}</dd></div>
                  <div><dt>Quota corrente</dt><dd>{formatNumber(quote.currentDecimalOdds.value)}</dd></div>
                  <div><dt>Precedente</dt><dd>{formatNumber(quote.previousDecimalOdds.value)}</dd></div>
                  <div><dt>Movimento</dt><dd>{movementLabel(quote.movement.value)}</dd></div>
                  <div><dt>Aggiornata</dt><dd>{quote.updatedAt.value ? formatDateTime(quote.updatedAt.value) : "Timestamp non rilevato"}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function standingValue(value: number | null) {
  return value === null ? "Non rilevato" : numberFormatter.format(value);
}

function StandingCard({ row, teamName }: Readonly<{ row: StandingEntry; teamName: string }>) {
  const form = row.compactForm.status === "unavailable" ? "Non rilevata" : row.compactForm.value;
  return (
    <article className="standing-card">
      <h3>{teamName}</h3>
      <dl>
        <div><dt>Posizione</dt><dd>{row.position}</dd></div>
        <div><dt>Punti</dt><dd>{standingValue(row.points)}</dd></div>
        <div><dt>Partite</dt><dd>{standingValue(row.played)}</dd></div>
        <div><dt>V / N / P</dt><dd>{standingValue(row.won)} / {standingValue(row.drawn)} / {standingValue(row.lost)}</dd></div>
        <div><dt>Forma W/D/L</dt><dd>{form}</dd></div>
      </dl>
    </article>
  );
}

function StandingsSection({
  envelope,
  match,
}: Readonly<{
  envelope: DataEnvelope<StandingTable>;
  match: MatchDetail;
}>) {
  const standings = envelope.data;
  if (!standings) return null;

  const home = standings.rows.find((row) => row.teamId === match.homeTeam.id);
  const away = standings.rows.find((row) => row.teamId === match.awayTeam.id);

  return (
    <section className="evidence-section" aria-labelledby="standings-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{standings.seasonName}</p>
          <h2 id="standings-title">Classifica e forma compatta</h2>
        </div>
        <SectionMeta capturedAt={envelope.provenance.capturedAt} />
      </div>
      <PartialCoverage availability={envelope.availability} />
      {home || away ? (
        <div className="standing-grid">
          {home ? <StandingCard row={home} teamName={match.homeTeam.name} /> : null}
          {away ? <StandingCard row={away} teamName={match.awayTeam.name} /> : null}
        </div>
      ) : (
        <p className="evidence-empty">La classifica ricevuta non contiene righe riconciliabili per le due squadre della gara.</p>
      )}
      <p className="evidence-limit">La forma è limitata alla sequenza W/D/L restituita dalla fonte; date, avversari e split casa/trasferta non sono coperti.</p>
    </section>
  );
}

export function MatchEvidenceSectionsLoading() {
  return (
    <section className="dossier-loading" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Dossier in aggiornamento</p>
      <h2>Stiamo verificando le sezioni disponibili.</h2>
      <p>Statistiche, quote, classifica e storico verranno mostrati soltanto se l’API restituisce un contratto utilizzabile.</p>
      <div className="dossier-loading-bars" aria-hidden="true"><span /><span /><span /></div>
    </section>
  );
}

export async function MatchEvidenceSections({ match }: Readonly<{ match: MatchDetail }>) {
  const [statisticsResult, oddsResult, headToHeadResult, standingsResult] = await Promise.all([
    getIqstatsPageData<ObservedMatchStatsCollection>(`/api/iqstats/v1/matches/${match.id}/statistics`),
    getIqstatsPageData<OddsCollection>(`/api/iqstats/v1/matches/${match.id}/odds`),
    getIqstatsPageData<HeadToHeadSample>(`/api/iqstats/v1/matches/${match.id}/h2h`),
    match.seasonId
      ? getIqstatsPageData<StandingTable>(`/api/iqstats/v1/competitions/${match.competition.id}/standings?seasonId=${encodeURIComponent(match.seasonId)}`)
      : Promise.resolve(null),
  ]);

  const availability = {
    ...match.sectionAvailability,
    statistics: availabilityFor(statisticsResult, match.sectionAvailability.statistics),
    odds: availabilityFor(oddsResult, match.sectionAvailability.odds),
    headToHead: availabilityFor(headToHeadResult, match.sectionAvailability.headToHead),
    standings: availabilityFor(standingsResult, match.sectionAvailability.standings),
  };

  const statistics = envelopeFor(statisticsResult);
  const odds = envelopeFor(oddsResult);
  const headToHead = envelopeFor(headToHeadResult);
  const standings = envelopeFor(standingsResult);

  return (
    <>
      <section className="coverage-panel" aria-labelledby="coverage-title">
        <div className="section-heading">
          <div><p className="eyebrow">Copertura del dossier</p><h2 id="coverage-title">Sezioni abilitate dal contratto</h2></div>
          <p>Disponibilità e assenze sono dichiarate prima di mostrare valori.</p>
        </div>
        <ul className="availability-list">
          {(Object.keys(sectionLabels) as MatchSection[]).map((section) => (
            <li key={section}><span>{sectionLabels[section]}</span><strong>{availabilityLabel(availability[section])}</strong></li>
          ))}
        </ul>
      </section>

      {statistics ? <StatisticsSection envelope={statistics} match={match} /> : null}
      {odds ? <OddsSection envelope={odds} /> : null}
      {standings ? <StandingsSection envelope={standings} match={match} /> : null}
      {headToHead ? <HeadToHeadSection envelope={headToHead} match={match} /> : null}
    </>
  );
}
