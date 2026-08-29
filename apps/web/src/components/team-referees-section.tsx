import type { Giudizio } from "@/server/iqstats/referees";
import type { TeamRefereePanel, TeamRefereeEntry } from "@/server/iqstats/team-page";

type TeamRefereesSectionProps = Readonly<{
  panel: TeamRefereePanel;
  competitionLabel: string;
  teamName: string;
}>;

/**
 * Falli e cartellini restano due letture distinte: un arbitro può fischiare molto e
 * ammonire poco, e un aggettivo solo mentirebbe.
 *
 * **L'etichetta viene da `giudizioSulMetro`, la stessa del dossier:** mezza dispersione fra
 * i colleghi che dirigono questa competizione, non uno scarto percentuale deciso da noi.
 */
const FALLI_LABELS: Readonly<Record<Giudizio, string>> = {
  permissivo: "lascia correre",
  "in linea": "in linea con la lega",
  severo: "fischia stretto",
};

const GIALLI_LABELS: Readonly<Record<Giudizio, string>> = {
  permissivo: "parco di cartellini",
  "in linea": "in linea con la lega",
  severo: "facile al cartellino",
};

function formatDecimal(value: number | null, digits = 2): string {
  return value === null ? "n/d" : value.toFixed(digits).replace(".", ",");
}

function Etichetta({
  giudizio,
  labels,
  valore,
  metro,
  cifre,
}: Readonly<{
  giudizio: Giudizio | null;
  labels: Readonly<Record<Giudizio, string>>;
  valore: number | null;
  metro: number | null;
  cifre: number;
}>) {
  if (giudizio === null) {
    return <span className="referee-axis is-unknown">metro non calcolabile</span>;
  }
  // Le tre classi restano quelle del foglio di stile: cambiano nome le parole, non il verso.
  const classe = giudizio === "severo"
    ? "strict"
    : giudizio === "permissivo" ? "lenient" : "inline";
  return (
    <span className={`referee-axis is-${classe}`}>
      {labels[giudizio]}
      <em>
        {formatDecimal(valore, cifre)} contro {formatDecimal(metro, cifre)} dei colleghi
      </em>
    </span>
  );
}

function RefereeCard({
  entry,
  teamName,
  teamFoulsPerMatch,
  teamYellowsPerMatch,
  metro,
}: Readonly<{
  entry: TeamRefereeEntry;
  teamName: string;
  teamFoulsPerMatch: number | null;
  teamYellowsPerMatch: number | null;
  metro: TeamRefereePanel["metro"];
}>) {
  const { record, nome, lettura } = entry;

  return (
    <li className="referee-card">
      <p className="referee-name">
        {nome ?? `Arbitro ${record.refereeId}`}
        <em>
          {record.matches === 1 ? "1 gara" : `${record.matches} gare`} con {teamName}
        </em>
      </p>

      {lettura === null ? (
        <p className="squad-empty-inline">
          Di questo arbitro non abbiamo ancora abbastanza gare osservate in questa
          competizione: nessun carattere viene dedotto da un campione troppo piccolo.
        </p>
      ) : (
        <>
          <div className="referee-axes">
            <Etichetta
              giudizio={lettura.giudizioFalli}
              labels={FALLI_LABELS}
              valore={lettura.falli}
              metro={metro?.falli ?? null}
              cifre={1}
            />
            <Etichetta
              giudizio={lettura.giudizioGialli}
              labels={GIALLI_LABELS}
              valore={lettura.gialli}
              metro={metro?.gialli ?? null}
              cifre={2}
            />
          </div>
          <p className="referee-career">
            Le due medie qui sopra stanno su <b>{lettura.gare}</b> gare che gli abbiamo
            osservato in questa competizione, non sulla sua carriera.
          </p>
        </>
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
        {panel.metro && panel.metro.falli !== null ? (
          <>
            Il metro è la media dei <b>{panel.metro.arbitri}</b> arbitri che dirigono questa
            competizione, sulle <b>{panel.metro.gare}</b> gare che abbiamo osservato:{" "}
            <b>{formatDecimal(panel.metro.falli, 1)}</b> falli e{" "}
            <b>{formatDecimal(panel.metro.gialli, 2)}</b> gialli a gara. Un arbitro esce dalla
            media quando si stacca di <b>mezza dispersione</b> dai colleghi: dove si somigliano
            basta poco, dove variano molto serve di più.
          </>
        ) : (
          <>
            Il metro di questa competizione non è calcolabile: nessuna etichetta viene
            assegnata.
          </>
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
              metro={panel.metro}
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
