import type { RefereeAxis, RefereeAxisLevel } from "@iqstats/shared";

import type { TeamRefereePanel, TeamRefereeEntry } from "@/server/iqstats/team-page";

type TeamRefereesSectionProps = Readonly<{
  panel: TeamRefereePanel;
  competitionLabel: string;
  teamName: string;
}>;

/**
 * Falli e cartellini restano due letture distinte: un arbitro può fischiare molto e
 * ammonire poco. Ogni etichetta è ancorata alla media degli arbitri della lega.
 */
const FOULS_LABELS: Readonly<Record<RefereeAxisLevel, string>> = {
  lenient: "lascia correre",
  inline: "in linea con la lega",
  strict: "fischia stretto",
};

const CARDS_LABELS: Readonly<Record<RefereeAxisLevel, string>> = {
  lenient: "parco di cartellini",
  inline: "in linea con la lega",
  strict: "facile al cartellino",
};

function formatDecimal(value: number | null, digits = 2): string {
  return value === null ? "n/d" : value.toFixed(digits);
}

function AxisTag({
  axis,
  labels,
}: Readonly<{ axis: RefereeAxis; labels: Readonly<Record<RefereeAxisLevel, string>> }>) {
  if (axis.level === null) {
    return <span className="referee-axis is-unknown">metro non calcolabile</span>;
  }
  return (
    <span className={`referee-axis is-${axis.level}`}>
      {labels[axis.level]}
      <em>
        {formatDecimal(axis.value, 2)} contro {formatDecimal(axis.leagueAverage, 2)} di lega
      </em>
    </span>
  );
}

function RefereeCard({
  entry,
  teamName,
  teamFoulsPerMatch,
  teamYellowsPerMatch,
}: Readonly<{
  entry: TeamRefereeEntry;
  teamName: string;
  teamFoulsPerMatch: number | null;
  teamYellowsPerMatch: number | null;
}>) {
  const { record, profile, reading } = entry;

  return (
    <li className="referee-card">
      <p className="referee-name">
        {profile?.name ?? `Arbitro ${record.refereeId}`}
        <em>
          {record.matches === 1 ? "1 gara" : `${record.matches} gare`} con {teamName}
        </em>
      </p>

      {reading ? (
        <div className="referee-axes">
          <AxisTag axis={reading.fouls} labels={FOULS_LABELS} />
          <AxisTag axis={reading.cards} labels={CARDS_LABELS} />
        </div>
      ) : (
        <p className="squad-empty-inline">
          Il profilo di questo arbitro non è fra quelli esposti per la competizione: nessuna
          lettura viene dedotta.
        </p>
      )}

      <dl className="squad-facts">
        <div>
          <dt>Falli di {teamName}</dt>
          <dd>
            {formatDecimal(record.teamFoulsPerMatch, 1)}
            <em>media {formatDecimal(teamFoulsPerMatch, 1)}</em>
          </dd>
        </div>
        <div>
          <dt>Gialli di {teamName}</dt>
          <dd>
            {formatDecimal(record.teamYellowsPerMatch, 2)}
            <em>media {formatDecimal(teamYellowsPerMatch, 2)}</em>
          </dd>
        </div>
        <div>
          <dt>Falli avversari</dt>
          <dd>{formatDecimal(record.opponentFoulsPerMatch, 1)}</dd>
        </div>
        <div>
          <dt>Gialli avversari</dt>
          <dd>{formatDecimal(record.opponentYellowsPerMatch, 2)}</dd>
        </div>
      </dl>

      {profile ? (
        <p className="referee-career">
          Carriera: {profile.careerGames ?? "n/d"} gare · {profile.careerYellowCards ?? "n/d"}{" "}
          gialli · {profile.careerRedCards ?? "n/d"} rossi. Aggregato recente della fonte:{" "}
          {profile.matches ?? "n/d"} gare, {formatDecimal(profile.avgGoalsPerMatch, 2)} gol a gara.
        </p>
      ) : null}
    </li>
  );
}

export function TeamRefereesSection({
  panel,
  competitionLabel,
  teamName,
}: TeamRefereesSectionProps) {
  return (
    <section className="dossier-panel" aria-labelledby="referees-title">
      <p className="dossier-kick">Arbitri</p>
      <h2 id="referees-title" className="squad-section-title">
        Chi le ha fischiato contro
      </h2>
      <p className="squad-section-note">
        Arbitri incontrati nelle {panel.matches} gare di {competitionLabel}, con falli e cartellini
        delle due squadre sotto ciascuno: è calcolato da noi sulle stesse gare delle medie, non
        chiesto alla fonte.{" "}
        {panel.benchmark && panel.benchmark.avgFoulsPerMatch !== null ? (
          <>
            Il metro di riferimento è la media dei <b>{panel.benchmark.referees}</b> arbitri della
            competizione: <b>{formatDecimal(panel.benchmark.avgFoulsPerMatch, 2)}</b> falli e{" "}
            <b>{formatDecimal(panel.benchmark.avgYellowPerMatch, 2)}</b> gialli a gara.
            L&apos;etichetta è una scelta nostra e non un dato della fonte.
          </>
        ) : (
          <>Il metro di lega non è disponibile: nessuna etichetta viene assegnata.</>
        )}
      </p>

      {panel.entries.length === 0 ? (
        <p className="squad-empty-inline">
          Nessuna gara del campione dichiara l&apos;arbitro: il blocco resta vuoto invece di
          attribuire designazioni.
        </p>
      ) : (
        <ul className="referee-list">
          {panel.entries.map((entry) => (
            <RefereeCard
              key={entry.record.refereeId}
              entry={entry}
              teamName={teamName}
              teamFoulsPerMatch={panel.teamFoulsPerMatch}
              teamYellowsPerMatch={panel.teamYellowsPerMatch}
            />
          ))}
        </ul>
      )}

      {panel.matchesWithReferee < panel.matches ? (
        <p className="squad-section-note squad-section-note-tight">
          Copertura dichiarata: {panel.matchesWithReferee} gare su {panel.matches} riportano
          l&apos;arbitro.
        </p>
      ) : null}
    </section>
  );
}
