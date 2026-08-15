import type { DataEnvelope, MatchList, MatchStatus, MatchSummary } from "@iqstats/shared";
import Link from "next/link";

import { countryCode } from "@/server/iqstats/country-names";

import { LeagueIdentity, numericId } from "./league-identity";
import { TeamCrest } from "./team-crest";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: MatchStatus) {
  const labels: Readonly<Record<MatchStatus, string>> = {
    not_started: "Programmata",
    live: "In corso",
    finished: "Conclusa",
    postponed: "Rinviata",
    cancelled: "Annullata",
    unknown: "Stato non disponibile",
  };
  return labels[status];
}

function scoreLabel(match: MatchSummary) {
  if (match.score.status === "available" || match.score.status === "stale") {
    return `${match.score.value.home}–${match.score.value.away}`;
  }
  return "Risultato non disponibile";
}

function sourceLabel(sourceKind: DataEnvelope<MatchList>["provenance"]["sourceKind"]) {
  if (sourceKind === "iqstats-calibration") return "Calibrazione IQstatS";
  if (sourceKind === "iqstats-derived") return "Elaborazione IQstatS";
  return "Fonte esterna normalizzata";
}

export function MatchListView({
  envelope,
  detailSearch,
}: Readonly<{
  envelope: DataEnvelope<MatchList>;
  detailSearch: string;
}>) {
  if (!envelope.data || envelope.availability.status === "unavailable" || envelope.availability.status === "error") {
    return (
      <section className="data-state" role="status">
        <p className="eyebrow">Copertura della lista</p>
        <h2>Lista non disponibile</h2>
        <p>La fonte non ha restituito una lista utilizzabile per questi filtri.</p>
      </section>
    );
  }

  const { items, total, hasNextPage } = envelope.data;
  if (items.length === 0) {
    return (
      <section className="data-state" role="status">
        <p className="eyebrow">Copertura della lista</p>
        <h2>Nessuna gara trovata</h2>
        <p>Non sono disponibili gare per la combinazione selezionata. Modifica i filtri e riprova.</p>
      </section>
    );
  }

  return (
    <section className="match-results" aria-labelledby="results-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Risultati normalizzati</p>
          <h2 id="results-title">{items.length} gare visibili{total !== items.length ? ` su ${total}` : ""}</h2>
        </div>
        <p>Fonte: {sourceLabel(envelope.provenance.sourceKind)} · acquisita {formatDateTime(envelope.provenance.capturedAt)}</p>
      </div>
      {envelope.availability.status === "partial" ? (
        <p className="coverage-note" role="status">Copertura parziale: alcuni campi o record possono mancare.</p>
      ) : null}
      <ol className="match-list">
        {items.map((match) => (
          <li key={match.id}>
            <Link
              className="match-row"
              href={`/match/${match.id}${detailSearch}`}
              aria-label={`Apri dossier: ${match.homeTeam.name} contro ${match.awayTeam.name}`}
            >
              <time className="match-kickoff" dateTime={match.kickoffAt}>{formatDateTime(match.kickoffAt)}</time>
              <span className="match-competition">
                <LeagueIdentity
                  leagueId={numericId(match.competition.id)}
                  name={match.competition.name}
                  code={countryCode(match.competition.country)}
                  size="sm"
                />
              </span>
              <span className="match-teams">
                <strong><TeamCrest name={match.homeTeam.name} teamId={numericId(match.homeTeam.id)} />{match.homeTeam.name}</strong>
                <span><TeamCrest name={match.awayTeam.name} teamId={numericId(match.awayTeam.id)} />{match.awayTeam.name}</span>
              </span>
              <span className="match-score">{scoreLabel(match)}</span>
              <span className="match-status">{statusLabel(match.status)}</span>
              <span className="match-open">Apri dossier</span>
            </Link>
          </li>
        ))}
      </ol>
      {hasNextPage ? <p className="coverage-note">La fonte indica altri risultati oltre questa pagina.</p> : null}
    </section>
  );
}
