import {
  SQUAD_ROLE_METRICS,
  type DataAvailability,
  type SquadPosition,
  type TeamSquad,
  type TeamSquadEntry,
} from "@iqstats/shared";

import { PLAYER_METRIC_LABELS, SQUAD_POSITION_LABELS } from "./team-labels";
import { VerifiedMediaImage } from "./verified-media-image";

type TeamSquadSectionProps = Readonly<{
  squad: TeamSquad;
  availability: DataAvailability;
  minimumSample: number;
}>;

const ROLE_ORDER: readonly SquadPosition[] = ["goalkeeper", "defender", "midfielder", "forward"];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTotal(value: number | null): string {
  if (value === null) return "n/d";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function PlayerRow({ entry, minimumSample }: Readonly<{ entry: TeamSquadEntry; minimumSample: number }>) {
  const { profile, stats } = entry;
  const metrics = profile.position ? SQUAD_ROLE_METRICS[profile.position] : [];

  return (
    <li className="squad-player">
      <span className="squad-player-id">
        <span className="squad-player-photo">
          <span aria-hidden="true">{initials(profile.name)}</span>
          <VerifiedMediaImage
            src={`/api/media/player/${profile.playerId}`}
            className="squad-player-img"
            width={44}
            height={44}
          />
        </span>
        <span className="squad-player-name">
          <b>{profile.name}</b>
          <em>
            {profile.jerseyNumber !== null ? `#${profile.jerseyNumber}` : "senza numero"}
            {profile.nationality ? ` · ${profile.nationality}` : ""}
          </em>
        </span>
      </span>

      {stats === null ? (
        <span className="squad-player-empty">nessuna gara nel campione</span>
      ) : stats.appearances === 0 ? (
        // In distinta ma mai in campo: i totali sarebbero zeri veri e però illeggibili
        // come statistiche. Si dichiara il fatto, non si mostra una griglia di zeri.
        <span className="squad-player-empty">in distinta, mai in campo nel campione</span>
      ) : (
        <span className="squad-player-stats">
          <span className="squad-stat">
            <em>Presenze</em>
            <b>{stats.appearances}</b>
          </span>
          <span className="squad-stat">
            <em>Minuti</em>
            <b>{stats.minutes}</b>
          </span>
          <span className="squad-stat">
            <em>Voto medio</em>
            <b>
              {stats.rating.value !== null
                ? stats.rating.value.toFixed(2)
                : stats.ratingSample === 0
                  ? "n/d"
                  : `n/d · ${stats.ratingSample} su ${minimumSample}`}
            </b>
          </span>
          {metrics.map((metric) => (
            <span className="squad-stat" key={metric}>
              <em>{PLAYER_METRIC_LABELS[metric] ?? metric}</em>
              <b>{formatTotal(stats.totals[metric])}</b>
            </span>
          ))}
        </span>
      )}
    </li>
  );
}

export function TeamSquadSection({ squad, availability, minimumSample }: TeamSquadSectionProps) {
  const played = squad.entries.filter((entry) => entry.stats !== null).length;

  return (
    <section className="dossier-panel" aria-labelledby="squad-title">
      <p className="dossier-kick">Rosa</p>
      <h2 id="squad-title" className="squad-section-title">
        Chi la compone, e quanto ha giocato
      </h2>
      <p className="squad-section-note">
        Totali di stagione per giocatore aggregati sulle stesse {squad.matchesCovered} gare delle
        medie di squadra: una richiesta per gara, mai una per giocatore.{" "}
        <b>{played}</b> tesserati su {squad.entries.length} hanno almeno una presenza nel campione.
        Le metriche mostrate cambiano per ruolo; il voto medio compare da{" "}
        {minimumSample} gare in su.
      </p>

      {ROLE_ORDER.map((role) => {
        const entries = squad.entries
          .filter((entry) => entry.profile.position === role)
          .sort((left, right) => (right.stats?.minutes ?? -1) - (left.stats?.minutes ?? -1));
        if (entries.length === 0) return null;
        return (
          <details className="squad-group" key={role} open={role === "forward"}>
            <summary>
              {SQUAD_POSITION_LABELS[role]}
              <span>{entries.length} in rosa</span>
            </summary>
            <ul className="squad-player-list">
              {entries.map((entry) => (
                <PlayerRow key={entry.profile.playerId} entry={entry} minimumSample={minimumSample} />
              ))}
            </ul>
          </details>
        );
      })}

      {availability.missingFields.length > 0 ? (
        <p className="squad-section-note squad-section-note-tight">
          Dichiarato: {availability.missingFields.length} riga/e statistiche appartengono a giocatori
          non più in rosa e non sono state attribuite.
        </p>
      ) : null}
    </section>
  );
}
