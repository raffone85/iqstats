import type {
  FinishedMatchStats,
  MatchIncident,
  MatchShot,
  MatchStatRow,
  ShotOutcome,
} from "@/server/iqstats/match-finished";

/**
 * Il mezzo campo è disegnato in metri veri: 68 di larghezza, 52,5 di profondità.
 * Le posizioni della fonte arrivano nella stessa unità — la distanza dalla porta è in
 * metri, la fascia in centesimi di larghezza — e questo si verifica da solo: i tiri oltre
 * i 16,5 metri coincidono con i «tiri da fuori area» del tabellino.
 */
const PITCH_WIDTH = 68;
const PITCH_DEPTH = 52.5;
/** Un margine sopra la linea di porta, per non tagliare i pallini più vicini. */
const MARGIN = 3;
/** Sotto i trenta metri non si scende: serve comunque a vedere che c'è un campo. */
const MIN_DEPTH = 30;

/**
 * Quanto mezzo campo mostrare. Se in tutta la gara nessuno ha tirato da oltre i trenta
 * metri, disegnare cinquantadue metri e mezzo significa lasciare vuota metà figura e
 * rimpicciolire i pallini per niente. La profondità si calcola **una volta sola su tutti i
 * tiri della gara**: le due squadre devono restare alla stessa scala, altrimenti il
 * confronto fra le due metà mente.
 */
function pitchDepth(shots: readonly MatchShot[]): number {
  const deepest = shots.reduce((max, shot) => Math.max(max, shot.goalDistance), 0);
  return Math.min(PITCH_DEPTH, Math.max(MIN_DEPTH, Math.ceil(deepest) + 4));
}

const BOX_DEPTH = 16.5;
const BOX_WIDTH = 40.32;
const GOAL_AREA_DEPTH = 5.5;
const GOAL_AREA_WIDTH = 18.32;
const GOAL_WIDTH = 7.32;
const PENALTY_SPOT = 11;
const ARC_RADIUS = 9.15;

const OUTCOME_WORD: Record<ShotOutcome, string> = {
  goal: "gol",
  onTarget: "nello specchio",
  offTarget: "fuori",
  blocked: "respinto",
  woodwork: "sul legno",
};

/** Il minuto come si dice: il recupero è un più, non un numero più grande. */
function minuteLabel(minute: number, addedTime: number | null): string {
  const base = minute < 0 ? "pre" : String(minute).concat("'");
  if (addedTime === null || addedTime <= 0) return base;
  return base.concat("+", String(addedTime));
}

function shotTitle(shot: MatchShot): string {
  const parts = [minuteLabel(shot.minute, shot.addedTime), OUTCOME_WORD[shot.outcome]];
  if (shot.xg !== null) parts.push("xG ".concat(shot.xg.toFixed(2).replace(".", ",")));
  if (shot.body !== null) parts.push("di ".concat(shot.body));
  if (shot.situation !== null) parts.push(shot.situation);
  parts.push(String(Math.round(shot.goalDistance)).concat(" metri"));
  return parts.join(" · ");
}

/**
 * Il raggio cresce con la radice dell'xG, così è l'area del pallino a essere
 * proporzionale al valore e non il suo diametro: un tiro doppio si vede doppio.
 * Un tiro senza xG resta al minimo e non finge di valere qualcosa.
 */
function shotRadius(xg: number | null): number {
  if (xg === null || xg <= 0) return 0.8;
  return 0.9 + 2.4 * Math.sqrt(Math.min(1, xg));
}

/** I gol stanno sopra a tutto, i respinti sotto: un gol non si nasconde dietro un tiro. */
const DRAW_ORDER: Record<ShotOutcome, number> = {
  blocked: 0,
  offTarget: 1,
  onTarget: 2,
  woodwork: 3,
  goal: 4,
};

function HalfPitch({
  teamName,
  shots,
  depth,
}: {
  teamName: string;
  shots: readonly MatchShot[];
  depth: number;
}) {
  const boxLeft = (PITCH_WIDTH - BOX_WIDTH) / 2;
  const goalAreaLeft = (PITCH_WIDTH - GOAL_AREA_WIDTH) / 2;
  const goalLeft = (PITCH_WIDTH - GOAL_WIDTH) / 2;
  const ordered = [...shots].sort((a, b) => DRAW_ORDER[a.outcome] - DRAW_ORDER[b.outcome]);
  const goals = shots.filter((shot) => shot.outcome === "goal").length;

  return (
    <figure className="shotmap-half">
      <figcaption className="shotmap-team">
        {teamName}
        <em>
          {shots.length === 1 ? "1 tiro" : String(shots.length).concat(" tiri")}
          {goals > 0 ? (goals === 1 ? ", 1 gol" : ", ".concat(String(goals), " gol")) : null}
        </em>
      </figcaption>
      <svg
        className="shotmap-svg"
        viewBox={"0 -".concat(String(MARGIN), " ", String(PITCH_WIDTH), " ", String(depth + MARGIN))}
        role="img"
        aria-label={"Mappa dei tiri di ".concat(
          teamName,
          ": ",
          String(shots.length),
          shots.length === 1 ? " tiro" : " tiri",
          ". Ogni pallino è un tiro, più è grande più l'occasione era buona; il pieno è nello specchio, il vuoto è fuori.",
        )}
      >
        <g className="shotmap-lines" fill="none">
          <rect x={0.2} y={0} width={PITCH_WIDTH - 0.4} height={depth} />
          <rect x={boxLeft} y={0} width={BOX_WIDTH} height={BOX_DEPTH} />
          <rect x={goalAreaLeft} y={0} width={GOAL_AREA_WIDTH} height={GOAL_AREA_DEPTH} />
          <path
            d={"M ".concat(
              String(PITCH_WIDTH / 2 - ARC_RADIUS * 0.87),
              " ",
              String(BOX_DEPTH),
              " A ",
              String(ARC_RADIUS),
              " ",
              String(ARC_RADIUS),
              " 0 0 0 ",
              String(PITCH_WIDTH / 2 + ARC_RADIUS * 0.87),
              " ",
              String(BOX_DEPTH),
            )}
          />
          <circle cx={PITCH_WIDTH / 2} cy={PENALTY_SPOT} r={0.3} className="shotmap-spot" />
          <line x1={goalLeft} y1={0} x2={goalLeft + GOAL_WIDTH} y2={0} className="shotmap-goal" />
        </g>
        <g className="shotmap-shots">
          {ordered.map((shot, index) => (
            <circle
              key={String(index).concat("-", String(shot.minute))}
              className={"shotmap-shot is-".concat(shot.outcome)}
              cx={(shot.lateral / 100) * PITCH_WIDTH}
              cy={Math.min(depth - 1, shot.goalDistance)}
              r={shotRadius(shot.xg)}
            >
              <title>{shotTitle(shot)}</title>
            </circle>
          ))}
        </g>
      </svg>
    </figure>
  );
}

function StatRow({ row }: { row: MatchStatRow }) {
  const share = row.homeShare;
  return (
    <div className="gamestat-row">
      <span className="gamestat-val">{row.home}</span>
      <span className="gamestat-label">{row.label}</span>
      <span className="gamestat-val gamestat-val-away">{row.away}</span>
      {share === null ? (
        <span className="gamestat-bar is-empty" aria-hidden="true" />
      ) : (
        <span className="gamestat-bar" aria-hidden="true">
          <i style={{ width: "".concat(String(Math.round(share * 100)), "%") }} />
        </span>
      )}
    </div>
  );
}

const INCIDENT_WORD: Record<MatchIncident["kind"], string> = {
  goal: "Gol",
  card: "Cartellino",
  substitution: "Cambio",
  period: "Intervallo",
};

/**
 * Statistiche, mappa dei tiri e cronologia della gara già giocata. Compare solo quando la
 * gara è conclusa e la fonte espone qualcosa: un blocco vuoto non si mostra.
 */
export function MatchFinishedSection({
  stats,
  incidents,
  homeTeam,
  awayTeam,
}: {
  stats: FinishedMatchStats | null;
  incidents: readonly MatchIncident[] | null;
  homeTeam: string;
  awayTeam: string;
}) {
  const shots = stats?.shots ?? [];
  const homeShots = shots.filter((shot) => shot.home);
  const awayShots = shots.filter((shot) => !shot.home);
  const depth = pitchDepth(shots);
  const hasStats = (stats?.headline.length ?? 0) > 0 || (stats?.rest.length ?? 0) > 0;
  const hasShots = shots.length > 0;
  const hasIncidents = (incidents?.length ?? 0) > 0;
  if (!hasStats && !hasShots && !hasIncidents) return null;

  return (
    <>
      {hasStats || hasShots ? (
        <section className="dossier-panel" aria-labelledby="played-title">
          <p className="dossier-kick">La gara giocata</p>
          <h2 id="played-title" className="sr-only-heading">
            Statistiche e tiri della gara conclusa
          </h2>

          {hasStats ? (
            <>
              <div className="gamestat-heads">
                <span>{homeTeam}</span>
                <span>{awayTeam}</span>
              </div>
              <div className="gamestat-table">
                {stats?.headline.map((row) => <StatRow key={row.label} row={row} />)}
              </div>
              {(stats?.rest.length ?? 0) > 0 ? (
                <details className="gamestat-more">
                  <summary>Tutto il resto della gara</summary>
                  <div className="gamestat-table">
                    {stats?.rest.map((row) => <StatRow key={row.label} row={row} />)}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}

          {hasShots ? (
            <div className="shotmap">
              <HalfPitch teamName={homeTeam} shots={homeShots} depth={depth} />
              <HalfPitch teamName={awayTeam} shots={awayShots} depth={depth} />
              <ul className="shotmap-legend">
                <li><span className="shotmap-key is-goal" aria-hidden="true" />gol</li>
                <li><span className="shotmap-key is-onTarget" aria-hidden="true" />nello specchio</li>
                <li><span className="shotmap-key is-offTarget" aria-hidden="true" />fuori</li>
                <li><span className="shotmap-key is-blocked" aria-hidden="true" />respinto</li>
                <li><span className="shotmap-key is-woodwork" aria-hidden="true" />sul legno</li>
              </ul>
            </div>
          ) : null}

          <p className="dossier-src">
            {hasShots ? (
              <>
                Ogni squadra attacca la propria porta, in alto: il pallino sta dove è partito
                il tiro e la sua dimensione dice quanto valeva l&apos;occasione. Passandoci
                sopra si leggono minuto, esito e distanza. Il campo arriva fino al tiro più
                lontano della gara — qui {Math.round(depth)} metri — ed è lo stesso per
                entrambe: le due metà si confrontano alla stessa scala.{" "}
              </>
            ) : null}
            Numeri della sola gara conclusa, non medie di stagione.
          </p>
        </section>
      ) : null}

      {hasIncidents ? (
        <section className="dossier-panel" aria-labelledby="timeline-title">
          <p className="dossier-kick">Come si è svolta</p>
          <h2 id="timeline-title" className="sr-only-heading">
            Cronologia della gara
          </h2>
          <ol className="timeline">
            {incidents?.map((incident, index) => (
              <li
                key={String(index).concat("-", String(incident.minute))}
                className={"timeline-row is-".concat(incident.kind)}
              >
                <span className="timeline-minute">
                  {minuteLabel(incident.minute, incident.addedTime)}
                </span>
                <span className="timeline-body">
                  <span className="timeline-what">
                    <span className="sr-only-heading">{INCIDENT_WORD[incident.kind]}: </span>
                    {incident.title}
                  </span>
                  {incident.detail ? <em>{incident.detail}</em> : null}
                </span>
                <span className="timeline-side">
                  {incident.home === null
                    ? incident.score ?? ""
                    : incident.home
                      ? homeTeam
                      : awayTeam}
                  {incident.kind === "goal" && incident.score ? (
                    <b>{incident.score}</b>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <p className="dossier-src">
            Tutti gli episodi registrati, dal fischio d&apos;inizio alla fine.
          </p>
        </section>
      ) : null}
    </>
  );
}
