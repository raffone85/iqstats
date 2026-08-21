// Server-only: la gara che è già stata giocata. Due letture e non quattro — le
// statistiche di squadra e la mappa dei tiri arrivano dalla stessa richiesta, la cronologia
// è l'unica in più. Una gara conclusa non cambia più: la cache è lunga.
import "server-only";

import { unstable_cache } from "next/cache";

import { ProviderClient } from "./provider-client.ts";

const DEFAULT_PROVIDER_BASE_URL = "https://sports.bzzoiro.com/api/v2/";
/** Un'ora: il tabellino di una gara finita si assesta subito e poi resta fermo. */
const CACHE_TTL_SECONDS = 3600;

/** Come è finito il tiro. Il legno resta distinto: non è né dentro né fuori. */
export type ShotOutcome = "goal" | "onTarget" | "offTarget" | "blocked" | "woodwork";

export interface MatchShot {
  readonly home: boolean;
  readonly minute: number;
  readonly addedTime: number | null;
  readonly xg: number | null;
  readonly outcome: ShotOutcome;
  readonly body: string | null;
  readonly situation: string | null;
  /** Quanto era lontano dalla linea di porta attaccata, nella scala della fonte. */
  readonly goalDistance: number;
  /** Da fascia a fascia: 50 è il centro dello specchio. */
  readonly lateral: number;
}

export interface MatchStatRow {
  readonly label: string;
  readonly home: string;
  readonly away: string;
  /** Quota di casa sul totale delle due, per la barra. `null` quando non è confrontabile. */
  readonly homeShare: number | null;
}

export interface FinishedMatchStats {
  readonly headline: readonly MatchStatRow[];
  readonly rest: readonly MatchStatRow[];
  readonly shots: readonly MatchShot[];
}

export type IncidentKind = "goal" | "card" | "substitution" | "period";

export interface MatchIncident {
  readonly kind: IncidentKind;
  readonly minute: number;
  readonly addedTime: number | null;
  /** `null` quando l'evento non appartiene a una squadra, come la fine di un tempo. */
  readonly home: boolean | null;
  readonly title: string;
  readonly detail: string | null;
  readonly score: string | null;
}

type MetricKind = "count" | "percent" | "decimal" | "ratio";

interface MetricDef {
  readonly key: string;
  readonly label: string;
  readonly kind: MetricKind;
}

/** Le otto che spiegano il risultato: si leggono in un colpo d'occhio. */
const HEADLINE_METRICS: readonly MetricDef[] = [
  { key: "ball_possession", label: "Possesso", kind: "percent" },
  { key: "total_shots", label: "Tiri", kind: "count" },
  { key: "shots_on_target", label: "Tiri in porta", kind: "count" },
  { key: "xg.actual", label: "xG", kind: "decimal" },
  { key: "big_chances", label: "Grandi occasioni", kind: "count" },
  { key: "corner_kicks", label: "Corner", kind: "count" },
  { key: "fouls", label: "Falli", kind: "count" },
  { key: "yellow_cards", label: "Ammoniti", kind: "count" },
];

/**
 * Tutto il resto, dietro a un blocco richiudibile.
 *
 * Due campi della fonte restano fuori di proposito: `expected_goals` arriva a zero anche
 * quando `xg.actual` vale più di due — mostrarlo significherebbe spacciare un campo non
 * popolato per una misura — e la media voti è un giudizio, non un dato osservato.
 */
const REST_METRICS: readonly MetricDef[] = [
  { key: "passes", label: "Passaggi", kind: "count" },
  { key: "accurate_passes", label: "Passaggi riusciti", kind: "count" },
  { key: "pass_accuracy_pct", label: "Precisione dei passaggi", kind: "percent" },
  { key: "shots_inside_box", label: "Tiri dall'area", kind: "count" },
  { key: "shots_outside_box", label: "Tiri da fuori", kind: "count" },
  { key: "shots_off_target", label: "Tiri fuori", kind: "count" },
  { key: "blocked_shots", label: "Tiri respinti", kind: "count" },
  { key: "big_chances_missed", label: "Grandi occasioni fallite", kind: "count" },
  { key: "hit_woodwork", label: "Legni colpiti", kind: "count" },
  { key: "goalkeeper_saves", label: "Parate", kind: "count" },
  { key: "high_claims", label: "Uscite alte", kind: "count" },
  { key: "duels", label: "Duelli vinti", kind: "percent" },
  { key: "ground_duels", label: "Duelli a terra", kind: "ratio" },
  { key: "aerial_duels", label: "Duelli aerei", kind: "ratio" },
  { key: "total_tackles", label: "Contrasti", kind: "count" },
  { key: "tackles_won", label: "Contrasti riusciti", kind: "percent" },
  { key: "interceptions", label: "Intercetti", kind: "count" },
  { key: "clearances", label: "Respinte", kind: "count" },
  { key: "recoveries", label: "Palloni recuperati", kind: "count" },
  { key: "dispossessed", label: "Palloni persi", kind: "count" },
  { key: "dribbles", label: "Dribbling", kind: "ratio" },
  { key: "crosses", label: "Cross", kind: "ratio" },
  { key: "long_balls", label: "Lanci lunghi", kind: "ratio" },
  { key: "final_third_entries", label: "Ingressi nell'ultimo terzo", kind: "count" },
  { key: "touches_in_penalty_area", label: "Tocchi in area", kind: "count" },
  { key: "fouled_in_final_third", label: "Falli subiti nell'ultimo terzo", kind: "count" },
  { key: "offsides", label: "Fuorigioco", kind: "count" },
  { key: "free_kicks", label: "Punizioni", kind: "count" },
  { key: "throw_ins", label: "Rimesse laterali", kind: "count" },
  { key: "goal_kicks", label: "Rinvii dal fondo", kind: "count" },
];

/** Come si dice in italiano il modo in cui è nato il tiro. */
const SITUATION_LABEL: Record<string, string> = {
  assisted: "servito",
  regular: "azione",
  corner: "da corner",
  "fast-break": "in ripartenza",
  "set-piece": "su palla ferma",
  "free-kick": "su punizione",
  "throw-in-set-piece": "da rimessa",
  penalty: "su rigore",
};

/** E con che cosa è stato calciato. */
const BODY_LABEL: Record<string, string> = {
  "right-foot": "destro",
  "left-foot": "sinistro",
  head: "testa",
  other: "altro",
};

const OUTCOME_BY_TYPE: Record<string, ShotOutcome> = {
  goal: "goal",
  save: "onTarget",
  miss: "offTarget",
  block: "blocked",
  post: "woodwork",
};

function resolveProviderConfig(): { baseUrl: string; token: string } | null {
  const token = (process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN ?? "").trim();
  if (!token) return null;
  const baseUrl =
    process.env.IQSTATS_PROVIDER_BASE_URL?.trim() ||
    process.env.BSD_API_BASE_URL?.trim() ||
    DEFAULT_PROVIDER_BASE_URL;
  return { baseUrl, token };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Le cifre si scrivono all'italiana: la virgola separa i decimali. */
function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

/** Il valore grezzo di una metrica, seguendo anche un percorso con il punto. */
function readRaw(side: Record<string, unknown>, key: string): unknown {
  if (!key.includes(".")) return side[key];
  let current: unknown = side;
  for (const step of key.split(".")) {
    const record = asRecord(current);
    if (record === null) return undefined;
    current = record[step];
  }
  return current;
}

/** Il numero su cui si costruisce la barra, indipendente da come si scrive il valore. */
function metricWeight(raw: unknown, kind: MetricKind): number | null {
  if (kind === "ratio") {
    const record = asRecord(raw);
    return record === null ? null : asNumber(record.value);
  }
  return asNumber(raw);
}

/** Come si scrive il valore accanto alla barra. Un dato assente resta assente. */
function metricText(raw: unknown, kind: MetricKind): string {
  if (kind === "ratio") {
    const record = asRecord(raw);
    if (record === null) return "n/d";
    const value = asNumber(record.value);
    const total = asNumber(record.total);
    if (value === null || total === null) return "n/d";
    return String(value).concat(" su ", String(total));
  }
  const value = asNumber(raw);
  if (value === null) return "n/d";
  if (kind === "percent") return decimal(value, Number.isInteger(value) ? 0 : 1).concat("%");
  if (kind === "decimal") return decimal(value, 2);
  return String(value);
}

function buildRows(
  home: Record<string, unknown>,
  away: Record<string, unknown>,
  metrics: readonly MetricDef[],
): readonly MatchStatRow[] {
  const rows: MatchStatRow[] = [];
  for (const metric of metrics) {
    const rawHome = readRaw(home, metric.key);
    const rawAway = readRaw(away, metric.key);
    const homeText = metricText(rawHome, metric.kind);
    const awayText = metricText(rawAway, metric.kind);
    // Una riga senza nessuno dei due valori non dice niente: non compare.
    if (homeText === "n/d" && awayText === "n/d") continue;

    const weightHome = metricWeight(rawHome, metric.kind);
    const weightAway = metricWeight(rawAway, metric.kind);
    const total =
      weightHome !== null && weightAway !== null ? weightHome + weightAway : null;
    rows.push({
      label: metric.label,
      home: homeText,
      away: awayText,
      homeShare: total !== null && total > 0 ? (weightHome as number) / total : null,
    });
  }
  return rows;
}

function normalizeShot(row: unknown): MatchShot | null {
  const raw = asRecord(row);
  if (raw === null) return null;
  const outcome = OUTCOME_BY_TYPE[asString(raw.type) ?? ""];
  const home = asBoolean(raw.home);
  const position = asRecord(raw.pos);
  const minute = asNumber(raw.min);
  if (!outcome || home === null || position === null || minute === null) return null;

  const goalDistance = asNumber(position.x);
  const lateral = asNumber(position.y);
  if (goalDistance === null || lateral === null) return null;

  const situation = asString(raw.sit);
  const body = asString(raw.body);
  return {
    home,
    minute,
    addedTime: asNumber(raw.added),
    xg: asNumber(raw.xg),
    outcome,
    body: body === null ? null : (BODY_LABEL[body] ?? null),
    situation: situation === null ? null : (SITUATION_LABEL[situation] ?? null),
    goalDistance,
    lateral,
  };
}

async function loadStats(eventId: number): Promise<FinishedMatchStats | null> {
  const config = resolveProviderConfig();
  if (!config) return null;

  let payload: unknown;
  try {
    const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
    payload = await client.getJson("/api/v2/events/".concat(String(eventId), "/stats/"));
  } catch {
    return null;
  }

  const root = asRecord(payload);
  const stats = root === null ? null : asRecord(root.stats);
  const home = stats === null ? null : asRecord(stats.home);
  const away = stats === null ? null : asRecord(stats.away);

  const rawShots = root !== null && Array.isArray(root.shotmap) ? root.shotmap : [];
  const shots = rawShots
    .map(normalizeShot)
    .filter((shot): shot is MatchShot => shot !== null);

  if (home === null || away === null) {
    // Senza le due colonne restano comunque i tiri, se ci sono: è un'informazione intera.
    return shots.length > 0 ? { headline: [], rest: [], shots } : null;
  }

  const headline = buildRows(home, away, HEADLINE_METRICS);
  const rest = buildRows(home, away, REST_METRICS);
  if (headline.length === 0 && rest.length === 0 && shots.length === 0) return null;
  return { headline, rest, shots };
}

function cardTitle(raw: Record<string, unknown>): string {
  const type = asString(raw.card_type);
  if (type === "red") return "Espulsione";
  if (type === "yellowRed") return "Seconda ammonizione";
  return "Ammonizione";
}

function normalizeIncident(row: unknown): MatchIncident | null {
  const raw = asRecord(row);
  if (raw === null) return null;
  const type = asString(raw.type);
  const minute = asNumber(raw.minute);
  if (type === null || minute === null) return null;

  const addedTime = asNumber(raw.added_time);
  const home = asBoolean(raw.is_home);
  const player = asString(raw.player);
  const homeScore = asNumber(raw.home_score);
  const awayScore = asNumber(raw.away_score);
  const score =
    homeScore !== null && awayScore !== null
      ? String(homeScore).concat("–", String(awayScore))
      : null;

  if (type === "goal") {
    const assist = asString(raw.assist);
    const goalType = asString(raw.goal_type);
    const notes: string[] = [];
    if (goalType === "own") notes.push("autorete");
    if (goalType === "penalty") notes.push("su rigore");
    if (assist !== null) notes.push("servito da ".concat(assist));
    return {
      kind: "goal",
      minute,
      addedTime,
      home,
      title: player ?? "Gol",
      detail: notes.length > 0 ? notes.join(" · ") : null,
      score,
    };
  }

  if (type === "card") {
    const isManager = asBoolean(raw.is_manager) === true;
    const name = player ?? (isManager ? "Panchina" : null);
    if (name === null) return null;
    const notes: string[] = [cardTitle(raw)];
    if (isManager) notes.push("alla panchina");
    return {
      kind: "card",
      minute,
      addedTime,
      home,
      title: name,
      detail: notes.join(" · "),
      score: null,
    };
  }

  if (type === "substitution") {
    const playerIn = asString(raw.player_in);
    const playerOut = asString(raw.player_out);
    if (playerIn === null && playerOut === null) return null;
    return {
      kind: "substitution",
      minute,
      addedTime,
      home,
      title: playerIn ?? "Entra",
      detail: playerOut === null ? null : "al posto di ".concat(playerOut),
      score: null,
    };
  }

  if (type === "period") {
    const text = asString(raw.text);
    const label = text === "HT" ? "Fine primo tempo" : text === "FT" ? "Fine gara" : null;
    if (label === null) return null;
    return { kind: "period", minute, addedTime: null, home: null, title: label, detail: null, score };
  }

  return null;
}

async function loadIncidents(eventId: number): Promise<readonly MatchIncident[] | null> {
  const config = resolveProviderConfig();
  if (!config) return null;

  let payload: unknown;
  try {
    const client = new ProviderClient({ baseUrl: config.baseUrl, token: config.token });
    payload = await client.getJson("/api/v2/events/".concat(String(eventId), "/incidents/"));
  } catch {
    return null;
  }

  const root = asRecord(payload);
  if (root === null || !Array.isArray(root.incidents)) return null;
  const incidents = root.incidents
    .map(normalizeIncident)
    .filter((incident): incident is MatchIncident => incident !== null);
  if (incidents.length === 0) return null;

  // La fonte le dà dall'ultima alla prima: la cronologia si legge dal fischio d'inizio.
  // La fine di un tempo chiude tutto ciò che porta il suo stesso minuto, recupero compreso:
  // senza questo un gol al 90'+2 finirebbe sotto «Fine gara», che è una bugia.
  const rank = (incident: MatchIncident): number =>
    incident.kind === "period"
      ? incident.minute + 0.99
      : incident.minute + (incident.addedTime ?? 0) / 100;
  return [...incidents].sort((a, b) => rank(a) - rank(b));
}

/** Statistiche e mappa dei tiri della gara conclusa. Fail-closed → null. */
export async function getFinishedMatchStats(eventId: number): Promise<FinishedMatchStats | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  const load = unstable_cache(
    () => loadStats(eventId),
    ["iqstats-match-stats", String(eventId)],
    { revalidate: CACHE_TTL_SECONDS },
  );
  return load();
}

/** Cronologia della gara conclusa, dal fischio d'inizio in poi. Fail-closed → null. */
export async function getMatchIncidents(eventId: number): Promise<readonly MatchIncident[] | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  const load = unstable_cache(
    () => loadIncidents(eventId),
    ["iqstats-match-incidents", String(eventId)],
    { revalidate: CACHE_TTL_SECONDS },
  );
  return load();
}
