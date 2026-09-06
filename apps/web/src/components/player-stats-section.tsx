import {
  SQUAD_ROLE_METRICS,
  type PlayerMetricKey,
  type PlayerStatsBlock,
  type SquadPosition,
} from "@iqstats/shared";

import { PLAYER_METRIC_LABELS } from "./team-labels";

type PlayerStatsSectionProps = Readonly<{
  kick: string;
  title: string;
  /** Da dove vengono le gare del blocco: competizione e stagione, oppure la carriera. */
  scope: string;
  block: PlayerStatsBlock;
  position: SquadPosition | null;
  emptyMessage: string;
}>;

/**
 * Le quattro che valgono per ogni ruolo. Il resto lo decide il ruolo, con la stessa
 * selezione della rosa: le sessantanove metriche non stanno in una pagina di telefono.
 */
const CORE_METRICS: readonly PlayerMetricKey[] = ["goals", "goalAssist", "yellowCard", "fouls"];

function formatTotal(value: number | null): string {
  if (value === null) return "n/d";
  if (Number.isInteger(value)) return value.toLocaleString("it-IT");
  return value.toFixed(2).replace(".", ",");
}

export function PlayerStatsSection({
  kick,
  title,
  scope,
  block,
  position,
  emptyMessage,
}: PlayerStatsSectionProps) {
  const metrics = [
    ...CORE_METRICS,
    ...(position ? SQUAD_ROLE_METRICS[position] : []),
  ].filter((metric, index, all) => all.indexOf(metric) === index);

  return (
    <section className="dossier-panel" aria-labelledby={`player-${kick.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="dossier-kick">{kick}</p>
      <h2 id={`player-${kick.toLowerCase().replace(/\s+/g, "-")}`} className="squad-section-title">
        {title}
      </h2>

      {block.rows === 0 ? (
        <p className="squad-empty-inline">{emptyMessage}</p>
      ) : (
        <>
          <p className="squad-section-note">
            {scope}. <b>{block.rows}</b> gare nel campione, {block.appearances} con almeno un
            minuto in campo e {block.minutes.toLocaleString("it-IT")} minuti giocati.
            {block.rows < block.declared ? (
              <>
                {" "}
                La fonte ne dichiara <b>{block.declared}</b>: il totale qui sotto è quello delle{" "}
                {block.rows} lette, non della carriera intera.
              </>
            ) : null}
          </p>
          <span className="squad-player-stats">
            <span className="squad-stat">
              <em>Presenze</em>
              <b>{block.appearances}</b>
            </span>
            <span className="squad-stat">
              <em>Minuti</em>
              <b>{block.minutes.toLocaleString("it-IT")}</b>
            </span>
            {metrics.map((metric) => (
              <span className="squad-stat" key={metric}>
                <em>{PLAYER_METRIC_LABELS[metric] ?? metric}</em>
                <b>{formatTotal(block.totals[metric])}</b>
              </span>
            ))}
          </span>
        </>
      )}
    </section>
  );
}
