import "server-only";

import { dashboardMatches, type DashboardMatch } from "@/lib/dashboard";

type BsdStatus = string | { name?: string | null } | null | undefined;

type BsdLiveEvent = {
  id?: number | string;
  league_name?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  event_date?: string | null;
  status?: BsdStatus;
  current_minute?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  last_updated?: string | null;
};

type BsdLiveResponse = { count?: number; events?: BsdLiveEvent[] };

export type DashboardFeed = {
  matches: DashboardMatch[];
  source: "bsd" | "demo";
  updatedAt: string;
  notice?: string;
};

function formatTime(isoDate: string | null | undefined) {
  if (!isoDate) return "--:--";

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(date);
}

function statusName(status: BsdStatus) {
  if (typeof status === "string") return status.toLowerCase();
  return status?.name?.toLowerCase() ?? "upcoming";
}

function toDashboardMatch(event: BsdLiveEvent): DashboardMatch | null {
  if (!event.id || !event.home_team || !event.away_team) return null;

  const status = statusName(event.status);
  const minute = event.current_minute ? ` ${event.current_minute}'` : "";
  const isLive = status === "live";

  return {
    id: String(event.id),
    dateTime: event.event_date ?? new Date().toISOString(),
    time: formatTime(event.event_date),
    competition: event.league_name ?? "Competizione BSD",
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    odds: { home: "--", draw: "--", away: "--" },
    movement: { direction: "down", value: "N/D" },
    signal: {
      label: isLive ? `Live${minute}` : status === "finished" ? "Finale" : "Da analizzare",
      tone: isLive ? "positive" : "neutral",
    },
    status: isLive ? `Live${minute}` : status,
    score:
      typeof event.home_score === "number" && typeof event.away_score === "number"
        ? { home: event.home_score, away: event.away_score }
        : undefined,
    source: "bsd",
    updatedAt: event.last_updated ?? undefined,
  };
}

async function getLiveEvents() {
  const token = process.env.BSD_API_TOKEN;
  if (!token) throw new Error("BSD token not configured");

  const baseUrl = process.env.BSD_API_BASE_URL ?? "https://sports.bzzoiro.com/api/v2/";
  const response = await fetch(new URL("/api/v2/events/live/", baseUrl), {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) throw new Error(`BSD request failed with ${response.status}`);
  return (await response.json()) as BsdLiveResponse;
}

export async function getLiveDashboardFeed(): Promise<DashboardFeed> {
  const updatedAt = new Date().toISOString();

  try {
    const payload = await getLiveEvents();
    const matches = (payload.events ?? [])
      .map(toDashboardMatch)
      .filter((match): match is DashboardMatch => match !== null);

    return {
      matches,
      source: "bsd",
      updatedAt,
      notice: matches.length === 0 ? "Nessuna partita live nel feed BSD." : undefined,
    };
  } catch {
    return {
      matches: dashboardMatches,
      source: "demo",
      updatedAt,
      notice: "Il feed live BSD non e disponibile. Mostro i dati dimostrativi locali.",
    };
  }
}
