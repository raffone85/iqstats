export type DashboardSource = "bsd" | "demo";

export type DashboardMatch = {
  id: string;
  dateTime: string;
  time: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  odds: { home: string; draw: string; away: string };
  movement: { direction: "up" | "down"; value: string };
  signal: { label: string; tone: "positive" | "caution" | "neutral" };
  status: string;
  score?: { home: number; away: number };
  source: DashboardSource;
  updatedAt?: string;
};

export const competitions = ["Tutte", "Brasile", "Europa", "Inghilterra"];
export const markets = ["1X2", "Gol", "Over 2.5", "Corner"];

export const dashboardMatches: DashboardMatch[] = [
  {
    id: "atletico-mg-bahia",
    dateTime: "2026-07-22T00:30:00-03:00",
    time: "00:30",
    competition: "Brasile - Serie A",
    homeTeam: "Atletico-MG",
    awayTeam: "Bahia",
    odds: { home: "1.95", draw: "3.50", away: "3.90" },
    movement: { direction: "down", value: "0.15" },
    signal: { label: "Gol - 63.5%", tone: "positive" },
    status: "Programmata",
    source: "demo",
  },
  {
    id: "avai-america-mineiro",
    dateTime: "2026-07-22T00:30:00-03:00",
    time: "00:30",
    competition: "Brasile - Serie B",
    homeTeam: "Avai",
    awayTeam: "America Mineiro",
    odds: { home: "2.20", draw: "3.10", away: "3.50" },
    movement: { direction: "up", value: "0.05" },
    signal: { label: "Over 1.5", tone: "caution" },
    status: "Programmata",
    source: "demo",
  },
  {
    id: "novorizontino-criciuma",
    dateTime: "2026-07-22T00:30:00-03:00",
    time: "00:30",
    competition: "Brasile - Serie B",
    homeTeam: "Novorizontino",
    awayTeam: "Criciuma",
    odds: { home: "2.10", draw: "3.00", away: "3.60" },
    movement: { direction: "down", value: "0.10" },
    signal: { label: "Da analizzare", tone: "neutral" },
    status: "Programmata",
    source: "demo",
  },
];
