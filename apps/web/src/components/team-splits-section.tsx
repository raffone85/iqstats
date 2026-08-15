import {
  TEAM_METRIC_CATALOG,
  type DataAvailability,
  type TeamMetricAverage,
  type TeamMetricGroup,
  type TeamMetricKey,
  type TeamSeasonSplits,
} from "@iqstats/shared";

import { MetricLog } from "./metric-log";
import { TEAM_GROUP_LABELS, TEAM_METRIC_LABELS } from "./team-labels";

type TeamSplitsSectionProps = Readonly<{
  /** Senza il registro gare: quello si scarica su richiesta, metrica per metrica. */
  splits: Omit<TeamSeasonSplits, "matchLog">;
  availability: DataAvailability;
  competitionLabel: string;
  teamName: string;
  teamId: string;
  leagueId: string;
  seasonId: string;
}>;

const GROUP_ORDER: readonly TeamMetricGroup[] = [
  "shooting",
  "possession",
  "defence",
  "goalkeeping",
  "discipline",
];

function formatValue(value: number | null, percentage: boolean): string {
  if (value === null) return "n/d";
  if (percentage) return `${Math.round(value)}%`;
  return value >= 5 ? value.toFixed(1) : value.toFixed(2);
}

function barWidth(value: number | null, reference: number): string {
  if (value === null || reference <= 0) return "0%";
  return `${Math.min(100, Math.round((value / reference) * 100))}%`;
}

function missingNote(entry: TeamMetricAverage, minimumSample: number): string {
  if (entry.sample === 0) return "nessuna gara espone questo dato";
  return `campione ${entry.sample}, sotto il minimo di ${minimumSample}`;
}

function barTone(label: string): string {
  if (label === "Casa") return "is-home";
  return label === "Trasferta" ? "is-away" : "is-all";
}

type MetricRowProps = Readonly<{
  metricKey: TeamMetricKey;
  rows: readonly { readonly label: string; readonly entry: TeamMetricAverage | undefined }[];
  percentage: boolean;
  supports: TeamMetricKey | null;
  minimumSample: number;
  matches: number;
  teamName: string;
  teamId: string;
  leagueId: string;
  seasonId: string;
}>;

function MetricRow({
  metricKey,
  rows,
  percentage,
  supports,
  minimumSample,
  matches,
  teamName,
  teamId,
  leagueId,
  seasonId,
}: MetricRowProps) {
  // Il campione è quello effettivo di questa metrica: un dato assente in una gara
  // la fa uscire dal campione, quindi il filo può essere sbilanciato anche dove le
  // gare giocate sono pari.
  const homeSample = rows[0]?.entry?.sample ?? 0;
  const awaySample = rows[1]?.entry?.sample ?? 0;
  const values = rows.map((row) => row.entry?.average.value ?? null);
  const reference = Math.max(0, ...values.filter((value): value is number => value !== null));
  const [homeValue, awayValue] = values;
  const gap =
    homeValue !== null && homeValue !== undefined && awayValue !== null && awayValue !== undefined
      ? homeValue - awayValue
      : null;

  return (
    <div className="squad-metric">
      <div className="squad-metric-head">
        <span className="squad-metric-name">
          {TEAM_METRIC_LABELS[metricKey]}
          {supports ? (
            <em className="squad-metric-supports">valida {TEAM_METRIC_LABELS[supports]}</em>
          ) : null}
        </span>
        {gap !== null ? (
          <span className="squad-metric-gap">
            {gap === 0
              ? "nessuno scarto"
              : `${gap > 0 ? "+" : "−"}${formatValue(Math.abs(gap), percentage)} in casa`}
          </span>
        ) : null}
      </div>

      {rows.map((row) => (
        <div className="squad-metric-row" key={row.label}>
          <span className="squad-metric-side">{row.label}</span>
          <span className="squad-metric-bar" aria-hidden="true">
            <i
              className={barTone(row.label)}
              style={{ width: barWidth(row.entry?.average.value ?? null, reference) }}
            />
          </span>
          <span className="squad-metric-value">
            {formatValue(row.entry?.average.value ?? null, percentage)}
            {row.entry ? (
              <em
                title={
                  row.entry.average.value === null
                    ? missingNote(row.entry, minimumSample)
                    : undefined
                }
              >
                {row.entry.average.value === null && row.entry.sample > 0
                  ? `solo ${row.entry.sample} gare`
                  : `su ${row.entry.sample} gare`}
              </em>
            ) : null}
          </span>
        </div>
      ))}

      {homeSample + awaySample > 0 ? (
        <div className="squad-thread" aria-hidden="true">
          <i
            className="squad-thread-home"
            style={{ width: `${(homeSample / (homeSample + awaySample)) * 100}%` }}
          />
          <i
            className="squad-thread-away"
            style={{ width: `${(awaySample / (homeSample + awaySample)) * 100}%` }}
          />
        </div>
      ) : null}

      {matches > 0 ? (
        <MetricLog
          teamId={teamId}
          leagueId={leagueId}
          seasonId={seasonId}
          metric={metricKey}
          teamName={teamName}
          matches={matches}
          percentage={percentage}
        />
      ) : null}
    </div>
  );
}

export function TeamSplitsSection({
  splits,
  availability,
  competitionLabel,
  teamName,
  teamId,
  leagueId,
  seasonId,
}: TeamSplitsSectionProps) {
  const byKey = (metrics: readonly TeamMetricAverage[]) =>
    new Map(metrics.map((entry) => [entry.key, entry]));
  const home = byKey(splits.home.metrics);
  const away = byKey(splits.away.metrics);
  const overall = byKey(splits.overall.metrics);
  const core = TEAM_METRIC_CATALOG.filter((descriptor) => descriptor.tier === "core");

  const rowsFor = (key: TeamMetricKey) => [
    { label: "Casa", entry: home.get(key) },
    { label: "Trasferta", entry: away.get(key) },
    { label: "Totale", entry: overall.get(key) },
  ];

  return (
    <section className="dossier-panel" aria-labelledby="splits-title">
      <p className="dossier-kick">Casa, trasferta, totale</p>
      <h2 id="splits-title" className="squad-section-title">
        Come cambia la squadra fuori casa
      </h2>
      <p className="squad-section-note">
        Medie per gara calcolate da noi sulle gare concluse di {competitionLabel}:{" "}
        <b>{splits.home.matches}</b> in casa, <b>{splits.away.matches}</b> in trasferta,{" "}
        <b>{splits.overall.matches}</b> in totale. Nessun endpoint espone medie di squadra già
        aggregate. Ogni metrica si apre sulle gare che la compongono, con il valore
        dell&apos;avversario accanto al nostro: la media resta verificabile riga per riga. Un dato
        assente in una gara esce dal campione e non diventa mai zero; sotto {splits.minimumSample}{" "}
        gare il valore non si mostra.
      </p>

      {availability.status === "unavailable" ? (
        <p className="squad-empty-inline">
          Nessuna gara conclusa in questa competizione e stagione: non c&apos;è nulla da mediare.
        </p>
      ) : (
        <>
          <div className="squad-metric-list">
            {core.map((descriptor) => (
              <MetricRow
                key={descriptor.key}
                metricKey={descriptor.key}
                rows={rowsFor(descriptor.key)}
                percentage={descriptor.percentage}
                supports={null}
                minimumSample={splits.minimumSample}
                matches={splits.overall.matches}
                teamName={teamName}
                teamId={teamId}
                leagueId={leagueId}
                seasonId={seasonId}
              />
            ))}
          </div>

          <p className="squad-section-note squad-section-note-tight">
            Il corredo qui sotto non sostituisce le sette metriche principali: le spiega. Ogni voce
            dichiara quale metrica del nucleo valida.
          </p>

          {GROUP_ORDER.map((group) => {
            const descriptors = TEAM_METRIC_CATALOG.filter(
              (descriptor) => descriptor.tier === "extended" && descriptor.group === group,
            );
            if (descriptors.length === 0) return null;
            return (
              <details className="squad-group" key={group}>
                <summary>
                  {TEAM_GROUP_LABELS[group]}
                  <span>{descriptors.length} metriche</span>
                </summary>
                <div className="squad-metric-list">
                  {descriptors.map((descriptor) => (
                    <MetricRow
                      key={descriptor.key}
                      metricKey={descriptor.key}
                      rows={rowsFor(descriptor.key)}
                      percentage={descriptor.percentage}
                      supports={descriptor.supports}
                      minimumSample={splits.minimumSample}
                      matches={splits.overall.matches}
                      teamName={teamName}
                      teamId={teamId}
                      leagueId={leagueId}
                      seasonId={seasonId}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </>
      )}

      {availability.missingFields.length > 0 && availability.status !== "unavailable" ? (
        <p className="squad-section-note squad-section-note-tight">
          Copertura parziale dichiarata: {availability.missingFields.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
