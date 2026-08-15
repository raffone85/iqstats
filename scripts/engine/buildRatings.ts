// ENG-1 — costruzione dei rating attacco/difesa per metrica.
// Fase offline: nessuna rete. Unisce il seed storico CAL-1 (chiavi squadra dai
// contratti CAL-4B) con le gare della stagione corrente raccolte da harvest.ts,
// e produce un artefatto letto in sola lettura dall'app.
//
// Uso:
//   node --experimental-strip-types scripts/engine/buildRatings.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LEAGUE_BASELINES } from "../calibration/output/LEAGUE_BASELINES.generated.ts";
import { MARKET_DISPERSION } from "../calibration/output/MARKET_DISPERSION.generated.ts";

const FORMULA_VERSION = "eng-1-multiplicative-shrunk-v1";

// Peso del campione: una squadra con n gare pesa n/(n+K) contro il riferimento.
// Al gate di prodotto (4 gare) il peso e' 0.40: prudente per costruzione.
const SHRINKAGE_K = 6;

const METRIC_KEYS = ["shots", "sot", "fouls", "corners", "yellows", "saves", "offsides"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

const DATASET_PATH = join("scripts", "calibration", "data", "dataset.csv");
const CONTEXT_EVENTS_DIR = join(
  "scripts", "calibration", "context", "data", "2026-07-23", "events",
);
const CURRENT_DIR = join("scripts", "engine", "data", "current");
const OUTPUT_DIR = join("scripts", "engine", "output");
// `.vercelignore` esclude scripts/ dal deploy: l'app riceve una copia dell'artefatto
// dentro il proprio albero, importata staticamente dal modulo server (sola lettura).
const APP_DATA_DIR = join("apps", "web", "src", "server", "iqstats", "data");

type Side = "home" | "away";

type Observation = {
  leagueId: number;
  teamId: number;
  opponentId: number;
  side: Side;
  values: Record<MetricKey, number | null>;
  conceded: Record<MetricKey, number | null>;
};

type Accumulator = {
  /** somma dei rapporti osservato/baseline, per metrica, e conteggio */
  attSum: Record<MetricKey, number>;
  attN: Record<MetricKey, number>;
  defSum: Record<MetricKey, number>;
  defN: Record<MetricKey, number>;
  homeMatches: number;
  awayMatches: number;
};

function emptyAccumulator(): Accumulator {
  const zero = () => Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Record<MetricKey, number>;
  return {
    attSum: zero(), attN: zero(), defSum: zero(), defN: zero(),
    homeMatches: 0, awayMatches: 0,
  };
}

// ---------------------------------------------------------------- baseline

type Baseline = { home: number; away: number };

const baselines = LEAGUE_BASELINES.leagues as Record<string, unknown>;

/** Media reale osservata per lega/metrica/lato. Assente => la lega non e' calibrata. */
function baselineFor(leagueId: number, metric: MetricKey): Baseline | null {
  const league = baselines[String(leagueId)] as
    | { metrics?: Record<string, { home?: { mean?: number }; away?: { mean?: number } }> }
    | undefined;
  const entry = league?.metrics?.[metric];
  const home = entry?.home?.mean;
  const away = entry?.away?.mean;
  if (typeof home !== "number" || typeof away !== "number") return null;
  if (home <= 0 || away <= 0) return null;
  return { home, away };
}

// ---------------------------------------------------------------- seed storico

type CsvRow = {
  leagueId: number;
  matchId: number;
  date: string;
  side: Side;
  values: Record<MetricKey, number | null>;
};

function parseDataset(): Map<string, CsvRow[]> {
  const text = readFileSync(DATASET_PATH, "utf8").trim().split("\n");
  const byMatch = new Map<string, CsvRow[]>();

  for (const line of text.slice(1)) {
    const cells = line.split(",");
    // team puo' contenere virgole? il generatore CAL-1 non le emette; si valida la grana.
    if (cells.length !== 12) continue;
    const leagueId = Number.parseInt(cells[0], 10);
    const matchId = Number.parseInt(cells[1], 10);
    const side = cells[4] === "home" ? "home" : "away";
    if (!Number.isInteger(leagueId) || !Number.isInteger(matchId)) continue;

    const values = {} as Record<MetricKey, number | null>;
    METRIC_KEYS.forEach((key, index) => {
      const raw = cells[5 + index];
      const parsed = raw === "" ? Number.NaN : Number(raw);
      values[key] = Number.isFinite(parsed) ? parsed : null;
    });

    const key = `${leagueId}:${matchId}`;
    const bucket = byMatch.get(key);
    const row: CsvRow = { leagueId, matchId, date: cells[2], side, values };
    if (bucket) bucket.push(row);
    else byMatch.set(key, [row]);
  }

  return byMatch;
}

/** eventId -> {homeTeamId, awayTeamId} dai contratti CAL-4B della coorte di calibrazione. */
function loadEventTeamMap(): Map<number, { home: number; away: number }> {
  const map = new Map<number, { home: number; away: number }>();
  if (!existsSync(CONTEXT_EVENTS_DIR)) return map;

  for (const leagueDir of readdirSync(CONTEXT_EVENTS_DIR)) {
    const path = join(CONTEXT_EVENTS_DIR, leagueDir, "calibration.json");
    if (!existsSync(path)) continue;
    let payload: { events?: unknown };
    try {
      payload = JSON.parse(readFileSync(path, "utf8")) as { events?: unknown };
    } catch {
      continue;
    }
    if (!Array.isArray(payload.events)) continue;
    for (const entry of payload.events) {
      if (typeof entry !== "object" || entry === null) continue;
      const event = entry as Record<string, unknown>;
      const id = event.eventId;
      const home = event.homeTeamId;
      const away = event.awayTeamId;
      if (typeof id === "number" && typeof home === "number" && typeof away === "number") {
        map.set(id, { home, away });
      }
    }
  }
  return map;
}

function historicalObservations(): { rows: Observation[]; unjoined: number } {
  const byMatch = parseDataset();
  const teams = loadEventTeamMap();
  const rows: Observation[] = [];
  let unjoined = 0;

  for (const bucket of byMatch.values()) {
    const home = bucket.find((r) => r.side === "home");
    const away = bucket.find((r) => r.side === "away");
    if (!home || !away) continue;

    const ids = teams.get(home.matchId);
    if (!ids) {
      unjoined += 1;
      continue;
    }

    rows.push({
      leagueId: home.leagueId, teamId: ids.home, opponentId: ids.away,
      side: "home", values: home.values, conceded: away.values,
    });
    rows.push({
      leagueId: away.leagueId, teamId: ids.away, opponentId: ids.home,
      side: "away", values: away.values, conceded: home.values,
    });
  }

  return { rows, unjoined };
}

// ------------------------------------------------------------ stagione corrente

type CurrentShard = {
  leagueId: number;
  seasonId: number;
  seasonName: string;
  events: {
    eventId: number; date: string; homeTeamId: number; awayTeamId: number;
    refereeId: number | null;
    home: Record<MetricKey, number | null>; away: Record<MetricKey, number | null>;
  }[];
};

function currentObservations(): {
  rows: Observation[];
  seasons: Map<number, string>;
  referees: Map<number, { leagueId: number; matches: number; yellows: number; fouls: number }>;
} {
  const rows: Observation[] = [];
  const seasons = new Map<number, string>();
  const referees = new Map<number, { leagueId: number; matches: number; yellows: number; fouls: number }>();
  if (!existsSync(CURRENT_DIR)) return { rows, seasons, referees };

  for (const file of readdirSync(CURRENT_DIR)) {
    if (!file.endsWith(".json")) continue;
    let shard: CurrentShard;
    try {
      shard = JSON.parse(readFileSync(join(CURRENT_DIR, file), "utf8")) as CurrentShard;
    } catch {
      continue;
    }
    seasons.set(shard.leagueId, shard.seasonName);

    for (const event of shard.events) {
      rows.push({
        leagueId: shard.leagueId, teamId: event.homeTeamId, opponentId: event.awayTeamId,
        side: "home", values: event.home, conceded: event.away,
      });
      rows.push({
        leagueId: shard.leagueId, teamId: event.awayTeamId, opponentId: event.homeTeamId,
        side: "away", values: event.away, conceded: event.home,
      });

      if (event.refereeId !== null) {
        const current = referees.get(event.refereeId) ?? {
          leagueId: shard.leagueId, matches: 0, yellows: 0, fouls: 0,
        };
        const yellows = (event.home.yellows ?? 0) + (event.away.yellows ?? 0);
        const fouls = (event.home.fouls ?? 0) + (event.away.fouls ?? 0);
        const hasYellows = event.home.yellows !== null && event.away.yellows !== null;
        const hasFouls = event.home.fouls !== null && event.away.fouls !== null;
        current.matches += 1;
        if (hasYellows) current.yellows += yellows;
        if (hasFouls) current.fouls += fouls;
        referees.set(event.refereeId, current);
      }
    }
  }

  return { rows, seasons, referees };
}

// ---------------------------------------------------------------- aggregazione

function accumulate(rows: Observation[]): Map<string, Accumulator> {
  const acc = new Map<string, Accumulator>();

  for (const row of rows) {
    const key = `${row.leagueId}:${row.teamId}`;
    const bucket = acc.get(key) ?? emptyAccumulator();

    if (row.side === "home") bucket.homeMatches += 1;
    else bucket.awayMatches += 1;

    for (const metric of METRIC_KEYS) {
      const baseline = baselineFor(row.leagueId, metric);
      if (!baseline) continue;

      // Attacco: quanto produce la squadra rispetto alla media reale del suo lato.
      const own = row.values[metric];
      if (own !== null) {
        bucket.attSum[metric] += own / baseline[row.side];
        bucket.attN[metric] += 1;
      }

      // Difesa: quanto concede, rispetto alla media reale del lato avversario.
      const against = row.conceded[metric];
      const oppSide: Side = row.side === "home" ? "away" : "home";
      if (against !== null) {
        bucket.defSum[metric] += against / baseline[oppSide];
        bucket.defN[metric] += 1;
      }
    }

    acc.set(key, bucket);
  }

  return acc;
}

/** Rapporto centrato su 1, tirato verso il riferimento quando il campione e' piccolo. */
function shrink(sum: number, n: number, toward: number): number | null {
  if (n === 0) return null;
  const raw = sum / n;
  const weight = n / (n + SHRINKAGE_K);
  return toward + (raw - toward) * weight;
}

// ---------------------------------------------------------------- output

function main(): void {
  const historical = historicalObservations();
  const current = currentObservations();

  const histAcc = accumulate(historical.rows);
  const currAcc = accumulate(current.rows);

  const keys = new Set([...histAcc.keys(), ...currAcc.keys()]);
  const teams: Record<string, unknown> = {};
  let calibratedLeagues = 0;
  const leaguesSeen = new Set<number>();
  const leaguesWithoutBaseline = new Set<number>();

  for (const key of keys) {
    const [leagueRaw, teamRaw] = key.split(":");
    const leagueId = Number.parseInt(leagueRaw, 10);
    const teamId = Number.parseInt(teamRaw, 10);
    leaguesSeen.add(leagueId);

    const hist = histAcc.get(key);
    const curr = currAcc.get(key);

    const metrics: Record<string, unknown> = {};
    let anyMetric = false;

    for (const metric of METRIC_KEYS) {
      if (!baselineFor(leagueId, metric)) {
        leaguesWithoutBaseline.add(leagueId);
        continue;
      }

      // Il prior storico e' tirato verso 1 (squadra media della lega).
      const attPrior = hist ? shrink(hist.attSum[metric], hist.attN[metric], 1) : null;
      const defPrior = hist ? shrink(hist.defSum[metric], hist.defN[metric], 1) : null;

      // La stagione corrente e' tirata verso il prior, non verso 1.
      const attBase = attPrior ?? 1;
      const defBase = defPrior ?? 1;
      const att = curr ? shrink(curr.attSum[metric], curr.attN[metric], attBase) : null;
      const def = curr ? shrink(curr.defSum[metric], curr.defN[metric], defBase) : null;

      const attack = att ?? attPrior;
      const defence = def ?? defPrior;
      if (attack === null || defence === null) continue;

      anyMetric = true;
      metrics[metric] = {
        attack: Math.round(attack * 10000) / 10000,
        defence: Math.round(defence * 10000) / 10000,
        historicalSample: hist?.attN[metric] ?? 0,
        currentSample: curr?.attN[metric] ?? 0,
      };
    }

    if (!anyMetric) continue;

    teams[key] = {
      leagueId,
      teamId,
      historical: {
        home: hist?.homeMatches ?? 0,
        away: hist?.awayMatches ?? 0,
      },
      current: {
        home: curr?.homeMatches ?? 0,
        away: curr?.awayMatches ?? 0,
      },
      metrics,
    };
  }

  for (const leagueId of leaguesSeen) {
    if (!leaguesWithoutBaseline.has(leagueId)) calibratedLeagues += 1;
  }

  const refereeEntries: Record<string, unknown> = {};
  for (const [refereeId, value] of current.referees) {
    refereeEntries[String(refereeId)] = {
      refereeId,
      leagueId: value.leagueId,
      currentMatches: value.matches,
      yellowsPerMatch: value.matches > 0
        ? Math.round((value.yellows / value.matches) * 100) / 100
        : null,
      foulsPerMatch: value.matches > 0
        ? Math.round((value.fouls / value.matches) * 100) / 100
        : null,
    };
  }

  // Baseline e dispersione viaggiano nell'artefatto: il modulo server dell'app non
  // ricopia costanti nel sorgente e non raggiunge scripts/, escluso dal deploy.
  const baselineTable: Record<string, Record<string, Baseline>> = {};
  for (const leagueId of leaguesSeen) {
    const metrics: Record<string, Baseline> = {};
    for (const metric of METRIC_KEYS) {
      const baseline = baselineFor(leagueId, metric);
      if (baseline) metrics[metric] = baseline;
    }
    if (Object.keys(metrics).length > 0) baselineTable[String(leagueId)] = metrics;
  }

  const dispersionFor = (granularity: "team" | "match"): Record<string, number> => {
    const global = MARKET_DISPERSION[granularity].global as Record<string, { value: number }>;
    const values: Record<string, number> = {};
    for (const metric of METRIC_KEYS) {
      const entry = global[metric];
      if (entry && Number.isFinite(entry.value)) values[metric] = entry.value;
    }
    return values;
  };

  const state = {
    schemaVersion: 1,
    formulaVersion: FORMULA_VERSION,
    generatedAt: new Date().toISOString(),
    shrinkageK: SHRINKAGE_K,
    baselines: baselineTable,
    dispersion: {
      poissonFallbackThreshold: MARKET_DISPERSION.poissonFallbackThreshold,
      team: dispersionFor("team"),
      match: dispersionFor("match"),
    },
    dispersionSource: {
      artifact: "scripts/calibration/output/MARKET_DISPERSION.generated.ts",
      formulaVersion: MARKET_DISPERSION.formulaVersion,
      granularity: "team e match, valori globali per metrica",
      poissonFallbackThreshold: MARKET_DISPERSION.poissonFallbackThreshold,
      leagueOverrideUsed: false,
      leagueOverrideReason:
        "MODEL_VALIDATION: la NB globale vince 162/310 righe contro 46 dell'override di lega.",
    },
    baselineSource: {
      artifact: "scripts/calibration/output/LEAGUE_BASELINES.generated.ts",
      formulaVersion: LEAGUE_BASELINES.formulaVersion,
      note: "medie reali home/away per lega; nessun moltiplicatore di vantaggio casalingo inventato",
    },
    currentSeasons: Object.fromEntries(current.seasons),
    teams,
    referees: refereeEntries,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const serialized = JSON.stringify(state);
  writeFileSync(join(OUTPUT_DIR, "RATINGS_STATE.generated.json"), serialized);
  mkdirSync(APP_DATA_DIR, { recursive: true });
  writeFileSync(join(APP_DATA_DIR, "ratings-state.generated.json"), serialized);

  const report = {
    generatedAt: state.generatedAt,
    formulaVersion: FORMULA_VERSION,
    historical: {
      observations: historical.rows.length,
      matchesWithoutTeamIds: historical.unjoined,
    },
    current: {
      observations: current.rows.length,
      leagues: current.seasons.size,
      referees: current.referees.size,
    },
    teams: Object.keys(teams).length,
    leaguesSeen: leaguesSeen.size,
    leaguesFullyCalibrated: calibratedLeagues,
    leaguesWithMetricsWithoutBaseline: [...leaguesWithoutBaseline].sort((a, b) => a - b),
  };
  writeFileSync(join(OUTPUT_DIR, "ENGINE_REPORT.json"), JSON.stringify(report, null, 2));

  console.log("\nENG-1 — rating attacco/difesa\n");
  console.table([
    { voce: "osservazioni storiche", valore: report.historical.observations },
    { voce: "gare storiche senza team id", valore: report.historical.matchesWithoutTeamIds },
    { voce: "osservazioni stagione corrente", valore: report.current.observations },
    { voce: "leghe con gare correnti", valore: report.current.leagues },
    { voce: "arbitri con campione corrente", valore: report.current.referees },
    { voce: "squadre con rating", valore: report.teams },
    { voce: "leghe viste", valore: report.leaguesSeen },
    { voce: "leghe interamente calibrate", valore: report.leaguesFullyCalibrated },
  ]);
  if (report.leaguesWithMetricsWithoutBaseline.length > 0) {
    console.log(
      "Leghe con almeno una metrica priva di baseline calibrata (esclusa dal motore):",
      report.leaguesWithMetricsWithoutBaseline.join(", "),
    );
  }
}

main();
