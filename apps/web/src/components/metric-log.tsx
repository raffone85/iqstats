"use client";

import { useState } from "react";

type LogEntry = Readonly<{
  eventId: string;
  playedAt: string | null;
  opponentName: string | null;
  side: "home" | "away";
  value: number | null;
  opponentValue: number | null;
}>;

type MetricLogProps = Readonly<{
  teamId: string;
  leagueId: string;
  seasonId: string;
  metric: string;
  teamName: string;
  matches: number;
  percentage: boolean;
}>;

const dayFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Rome",
});

function formatValue(value: number | null, percentage: boolean): string {
  if (value === null) return "n/d";
  if (percentage) return `${Math.round(value)}%`;
  if (Number.isInteger(value)) return String(value);
  return value >= 5 ? value.toFixed(1) : value.toFixed(2);
}

function formatDay(iso: string | null): string {
  if (iso === null) return "data n/d";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "data n/d" : dayFormatter.format(date);
}

type SideFilter = "tutte" | "home" | "away";

const SIDE_FILTERS: readonly { value: SideFilter; label: string }[] = [
  { value: "tutte", label: "Tutte" },
  { value: "home", label: "In casa" },
  { value: "away", label: "In trasferta" },
];

/** Il nome della squadra consultata resta in evidenza: l'occhio deve trovarla senza cercarla. */
function MatchTitle({ entry, teamName }: Readonly<{ entry: LogEntry; teamName: string }>) {
  const opponent = entry.opponentName ?? "avversario";
  if (entry.side === "home") {
    return (
      <>
        <b className="squad-log-self">{teamName}</b>–{opponent}
      </>
    );
  }
  return (
    <>
      {opponent}–<b className="squad-log-self">{teamName}</b>
    </>
  );
}

/**
 * Le gare che compongono la media si scaricano solo quando servono: stamparle in
 * pagina per tutte le metriche significherebbe megabyte di HTML su rete mobile.
 */
export function MetricLog({
  teamId,
  leagueId,
  seasonId,
  metric,
  teamName,
  matches,
  percentage,
}: MetricLogProps) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [entries, setEntries] = useState<readonly LogEntry[]>([]);
  // Il filtro lavora sulle gare già scaricate: cambiare campo non costa una richiesta.
  const [side, setSide] = useState<SideFilter>("tutte");

  const homeCount = entries.filter((entry) => entry.side === "home").length;
  const awayCount = entries.length - homeCount;
  const visible = side === "tutte" ? entries : entries.filter((entry) => entry.side === side);

  function countFor(value: SideFilter) {
    if (value === "home") return homeCount;
    if (value === "away") return awayCount;
    return entries.length;
  }

  async function load() {
    if (state !== "idle") return;
    setState("loading");
    const query = new URLSearchParams({ metric, leagueId, seasonId });
    try {
      const response = await fetch(`/api/squadre/${teamId}/registro?${query.toString()}`);
      if (!response.ok) throw new Error("richiesta non riuscita");
      const payload = (await response.json()) as { entries?: readonly LogEntry[] };
      setEntries(payload.entries ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <details
      className="squad-log"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>vedi le {matches} gare</summary>
      {state === "loading" ? <p className="squad-log-note">lettura delle gare…</p> : null}
      {state === "error" ? (
        <p className="squad-log-note">
          Le gare non sono state caricate. Nessun valore viene mostrato a memoria.
        </p>
      ) : null}
      {state === "ready" && entries.length === 0 ? (
        <p className="squad-log-note">Nessuna gara espone questa metrica.</p>
      ) : null}
      {state === "ready" && entries.length > 0 ? (
        <>
          <div className="squad-log-filter" role="group" aria-label="Mostra solo le gare in casa o in trasferta">
            {SIDE_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={option.value === side ? "is-active" : undefined}
                aria-pressed={option.value === side}
                onClick={() => setSide(option.value)}
              >
                {option.label} <em>{countFor(option.value)}</em>
              </button>
            ))}
          </div>

          <p className="squad-log-head">
            <span className="squad-log-self">{teamName}</span> contro avversario
          </p>

          {visible.length === 0 ? (
            <p className="squad-log-note">
              Nessuna gara {side === "home" ? "in casa" : "in trasferta"} con questa metrica.
            </p>
          ) : (
            <ul>
              {visible.map((entry) => (
                <li key={entry.eventId}>
                  <span className="squad-log-day">{formatDay(entry.playedAt)}</span>
                  <span className="squad-log-match">
                    <MatchTitle entry={entry} teamName={teamName} />
                    <em>{entry.side === "home" ? "casa" : "fuori"}</em>
                  </span>
                  <span className="squad-log-values">
                    <b>{formatValue(entry.value, percentage)}</b>
                    <span aria-hidden="true">–</span>
                    <i>{formatValue(entry.opponentValue, percentage)}</i>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </details>
  );
}
