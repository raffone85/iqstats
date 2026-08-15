// Sezione "Giocate statistiche" del dossier: rende la lettura del motore ENG-1.
// Non calcola nulla e non chiama fonti: riceve l'envelope già prodotto lato server.
import type { StatEngineResult, StatLine, StatMetric } from "@/server/iqstats/stat-engine";

const METRIC_LABELS: Record<StatMetric, string> = {
  shots: "Tiri",
  sot: "Tiri in porta",
  fouls: "Falli",
  corners: "Corner",
  yellows: "Cartellini gialli",
  saves: "Parate",
  offsides: "Fuorigioco",
};

const UNAVAILABLE_TEXT: Record<string, string> = {
  invalid_input: "La gara non espone lega o squadre identificate: nessuna lettura viene stimata.",
  league_not_calibrated:
    "Questo campionato non ha una baseline calibrata da IQstatS: copertura assente, nessun valore viene inventato.",
  team_rating_missing:
    "Almeno una delle due squadre non ha ancora un rating osservato in questo campionato: copertura assente.",
  no_metric_covered:
    "Nessuna delle sette metriche ha baseline e rating sufficienti per questa gara: copertura assente.",
};

function formatValue(value: number): string {
  return value.toFixed(1);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const generatedAtFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "data non disponibile" : generatedAtFormatter.format(date);
}

type Props = {
  readonly reading: StatEngineResult;
  readonly homeTeam: string;
  readonly awayTeam: string;
};

/** Una soglia della scala: mostra il lato più probabile, l'altro è il complemento. */
function EngineStep({ line }: { readonly line: StatLine }) {
  const over = formatPercent(line.probOver);
  const under = formatPercent(line.probUnder);
  // Con le due percentuali mostrate identiche non c'è un lato più probabile:
  // indicarne uno sarebbe un segnale che il modello non dà.
  const tied = over === under;
  const overLeads = line.probOver > line.probUnder;

  return (
    <li className={line.isCentral ? "engine-step is-central" : "engine-step"}>
      <span className="engine-step-line">{line.line.toFixed(1)}</span>
      <span className="engine-step-prob">
        {tied ? "pari 50%" : `${overLeads ? "Over" : "Under"} ${overLeads ? over : under}`}
      </span>
    </li>
  );
}

/** Una voce della metrica: chi, quanto ci si attende e la scala di soglie. */
function EngineSplit({ who, expected, lines }: {
  readonly who: string;
  readonly expected: number;
  readonly lines: readonly StatLine[];
}) {
  return (
    <li className="engine-split">
      <span className="engine-who">{who}</span>
      <span className="engine-exp">{formatValue(expected)}</span>
      <ol className="engine-ladder">
        {lines.map((line) => <EngineStep key={line.line} line={line} />)}
      </ol>
    </li>
  );
}

export function StatEngineSection({ reading, homeTeam, awayTeam }: Props) {
  if (!reading.available) {
    return (
      <section className="dossier-panel" aria-labelledby="engine-title">
        <p className="dossier-kick">Giocate statistiche</p>
        <h2 id="engine-title" className="sr-only-heading">Giocate statistiche del motore IQstatS</h2>
        <p className="dossier-empty">{UNAVAILABLE_TEXT[reading.reason] ?? "Copertura assente."}</p>
      </section>
    );
  }

  const { coverage, referee, metrics } = reading;
  const current = coverage.tier === "current-season";
  const adjusted = metrics.some((metric) => metric.refereeAdjustment !== null);

  return (
    <section className="dossier-panel" aria-labelledby="engine-title">
      <p className="dossier-kick">Giocate statistiche</p>
      <h2 id="engine-title" className="sr-only-heading">Giocate statistiche del motore IQstatS</h2>

      {current ? (
        <p className="engine-badge">
          Stagione corrente{coverage.seasonName ? ` · ${coverage.seasonName}` : ""}
        </p>
      ) : (
        <p className="engine-badge is-previous" role="note">
          Dati stagione precedente · valore informativo
        </p>
      )}

      <ul className={current ? "engine-rows" : "engine-rows is-previous"}>
        {metrics.map((metric) => (
          <li key={metric.metric} className="engine-row">
            <p className="engine-metric">{METRIC_LABELS[metric.metric]}</p>
            <ul className="engine-splits">
              <EngineSplit who={homeTeam} expected={metric.expectedHome} lines={metric.homeLines} />
              <EngineSplit who={awayTeam} expected={metric.expectedAway} lines={metric.awayLines} />
              <EngineSplit who="Totale gara" expected={metric.expectedTotal} lines={metric.totalLines} />
            </ul>
          </li>
        ))}
      </ul>

      <p className="dossier-src">
        Ogni metrica è letta tre volte: quanto ne produce ciascuna squadra e quanto ne esce
        dalla gara. Il numero grande a sinistra è il valore atteso; accanto, cinque soglie con
        il lato più probabile &mdash; l&apos;altro lato è il complemento a 100%. La soglia{" "}
        <b>evidenziata</b> è quella più vicina all&apos;atteso. È una lettura probabilistica,
        non un consiglio di giocata.
      </p>

      {current ? null : (
        <p className="dossier-src">
          Il dato di stagione corrente arriva quando <b>entrambe</b> le squadre hanno giocato almeno{" "}
          {coverage.requiredHome} gare in casa e {coverage.requiredAway} in trasferta. Ora:{" "}
          {homeTeam} {coverage.home.currentHome} casa / {coverage.home.currentAway} trasferta ·{" "}
          {awayTeam} {coverage.away.currentHome} casa / {coverage.away.currentAway} trasferta.
        </p>
      )}

      {referee ? (
        <p className="dossier-src">
          {referee.tier === "current-season" && adjusted ? (
            <>Tendenza arbitrale applicata a falli e cartellini su <b>{referee.currentMatches}</b> gare arbitrate in stagione corrente.</>
          ) : (
            <>Tendenza arbitrale della stagione corrente disponibile dalla <b>{referee.requiredMatches}ª</b> gara arbitrata (ora: {referee.currentMatches}). Restano validi i dati di carriera del pannello arbitro.</>
          )}
        </p>
      ) : null}

      {reading.missingMetrics.length > 0 ? (
        <p className="dossier-src">
          Metriche senza copertura in questo campionato:{" "}
          {reading.missingMetrics.map((metric) => METRIC_LABELS[metric]).join(", ")}.
        </p>
      ) : null}

      {/* Il vincolo dell'utente vieta di esporre calcoli e formule: restano dichiarati
          soltanto freschezza e campione, che invece vanno sempre detti. */}
      <p className="dossier-src">
        Letture del motore IQstatS · aggiornate al {formatGeneratedAt(reading.generatedAt)} ·
        letture, non certezze.
      </p>
    </section>
  );
}
