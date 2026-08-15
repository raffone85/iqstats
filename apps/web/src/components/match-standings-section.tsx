import type { StandingEntry } from "@iqstats/shared";

import type { MatchStandingRows, TeamFormEntry } from "@/server/iqstats/team-page";

function shortDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Rome",
  });
}

const OUTCOME_WORD: Record<TeamFormEntry["outcome"], string> = {
  V: "vinta",
  N: "pareggiata",
  P: "persa",
};

/**
 * La forma come sequenza di gare, la più recente a sinistra. La lettera porta il
 * significato: il colore lo rinforza e non lo sostituisce, e ogni gettone dichiara per
 * esteso data, avversario e punteggio.
 */
function Form({ entries }: { entries: readonly TeamFormEntry[] }) {
  if (entries.length === 0) {
    return <p className="standing-empty">Nessuna gara conclusa da cui leggere la forma.</p>;
  }
  return (
    <>
      <ol className="standing-form">
        {entries.map((entry) => (
          <li
            key={entry.matchId}
            className={"standing-chip is-".concat(entry.outcome)}
            title={shortDay(entry.kickoffAt)
              .concat(" · ", entry.atHome ? "in casa con " : "in trasferta con ", entry.opponent)
              .concat(" · ", String(entry.goalsFor), "-", String(entry.goalsAgainst))
              .concat(" · ", entry.competition)}
          >
            <span className="sr-only-heading">
              {OUTCOME_WORD[entry.outcome]} con {entry.opponent}
            </span>
            <span aria-hidden="true">{entry.outcome}</span>
          </li>
        ))}
      </ol>
      <p className="standing-last">
        L&apos;ultima: {shortDay(entries[0].kickoffAt)}
        {entries[0].atHome ? " in casa con " : " in trasferta con "}
        {entries[0].opponent} {entries[0].goalsFor}-{entries[0].goalsAgainst}
      </p>
    </>
  );
}

function Row({
  teamName,
  entry,
  teams,
  form,
}: {
  teamName: string;
  entry: StandingEntry | null;
  teams: number;
  form: readonly TeamFormEntry[] | null;
}) {
  return (
    <div className="standing-team">
      <p className="standing-name">{teamName}</p>
      {entry ? (
        <>
          <p className="standing-rank">
            <b>{entry.position}ª</b> su {teams}
            {entry.points !== null ? <> · {entry.points} punti</> : null}
          </p>
          <dl className="standing-figures">
            {entry.played !== null ? (
              <div><dt>Giocate</dt><dd>{entry.played}</dd></div>
            ) : null}
            {entry.won !== null && entry.drawn !== null && entry.lost !== null ? (
              <div>
                <dt>V · N · P</dt>
                <dd>{entry.won} · {entry.drawn} · {entry.lost}</dd>
              </div>
            ) : null}
            {entry.goalsFor !== null && entry.goalsAgainst !== null ? (
              <div><dt>Reti</dt><dd>{entry.goalsFor} fatte, {entry.goalsAgainst} subite</dd></div>
            ) : null}
            {/* L'unico verso di questo blocco: lo zero è il riferimento. */}
            {entry.goalDifference !== null ? (
              <div>
                <dt>Differenza</dt>
                <dd
                  className={
                    entry.goalDifference > 0
                      ? "standing-up"
                      : entry.goalDifference < 0
                        ? "standing-down"
                        : undefined
                  }
                >
                  {entry.goalDifference > 0 ? "+" : ""}
                  {entry.goalDifference}
                </dd>
              </div>
            ) : null}
          </dl>
        </>
      ) : (
        <p className="standing-empty">
          Questa squadra non compare nella classifica della competizione.
        </p>
      )}
      {form ? <Form entries={form} /> : null}
    </div>
  );
}

/**
 * Dove stanno le due squadre e come ci sono arrivate. La classifica viene dalla tabella
 * della competizione, la forma dalle gare davvero giocate: sono due letture diverse e la
 * pagina lo dichiara, perché la stringa di forma della tabella non è allineata al giocato.
 */
export function MatchStandingsSection({
  standings,
  homeTeam,
  awayTeam,
  homeForm,
  awayForm,
}: {
  standings: MatchStandingRows | null;
  homeTeam: string;
  awayTeam: string;
  homeForm: readonly TeamFormEntry[] | null;
  awayForm: readonly TeamFormEntry[] | null;
}) {
  const hasStanding = standings !== null && (standings.home !== null || standings.away !== null);
  const hasForm = (homeForm?.length ?? 0) > 0 || (awayForm?.length ?? 0) > 0;
  if (!hasStanding && !hasForm) return null;

  return (
    <section className="dossier-panel" aria-labelledby="standings-title">
      <p className="dossier-kick">Classifica e forma</p>
      <h2 id="standings-title" className="sr-only-heading">
        Dove stanno le due squadre
      </h2>
      <div className="standing-grid">
        <Row
          teamName={homeTeam}
          entry={standings?.home ?? null}
          teams={standings?.teams ?? 0}
          form={homeForm}
        />
        <Row
          teamName={awayTeam}
          entry={standings?.away ?? null}
          teams={standings?.teams ?? 0}
          form={awayForm}
        />
      </div>
      <p className="dossier-src">
        {standings ? <>Classifica di {standings.seasonName}. </> : null}
        {hasForm ? (
          <>
            La forma è letta dalle ultime gare concluse, la più recente a sinistra: ogni
            gettone è una gara vera, con la sua data e il suo punteggio, e può appartenere a
            una competizione diversa da questa.
          </>
        ) : null}
      </p>
    </section>
  );
}
