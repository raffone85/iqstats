// Server-only: traduce le letture del modello in direzioni leggibili.
// I numeri restano dove sono, qui nasce la frase che dice che cosa vogliono dire.
// Le soglie vivono solo in questo file, sono una scelta nostra e non si mostrano in pagina.
import "server-only";

import type { DashboardPrediction, Outcome } from "./predictions.ts";
import type { MatchOdds, MarketOutcome } from "./odds.ts";

/** Sopra questa quota l'esito domina gli altri due. */
const CLEAR_FAVOURITE = 60;
/** Sopra questa quota c'è una favorita, sotto c'è solo un vantaggio. */
const FAVOURITE = 47;
/** Distanza fra i primi due esiti sotto la quale la gara resta aperta. */
const OPEN_GAP = 4;
const GOALS_MANY = 58;
const GOALS_FEW = 42;

export interface MatchReading {
  /** La direzione della gara, in prosa. */
  readonly headline: string;
  /** Il verso sui gol, quando è netto; altrimenti resta assente. */
  readonly goals: string | null;
  /** Proporzioni del filo 1X2: assenti se il modello non copre l'esito. */
  readonly thread: { readonly home: number; readonly draw: number; readonly away: number } | null;
}

interface Row {
  readonly key: Outcome;
  readonly name: string;
  readonly prob: number;
}

/**
 * Lettura di una gara in programma. Ritorna null quando il modello non espone l'esito:
 * una frase inventata sarebbe peggio del silenzio.
 */
export function readMatch(
  prediction: MarketComparable,
  homeTeam: string,
  awayTeam: string,
): MatchReading | null {
  const rows: Row[] = [
    { key: "H" as const, name: homeTeam, prob: prediction.probHome ?? -1 },
    { key: "D" as const, name: "il pareggio", prob: prediction.probDraw ?? -1 },
    { key: "A" as const, name: awayTeam, prob: prediction.probAway ?? -1 },
  ].filter((row) => row.prob >= 0);

  if (rows.length < 2) return null;
  const ranked = [...rows].sort((a, b) => b.prob - a.prob);
  const top = ranked[0];
  const second = ranked[1];

  let headline: string;
  if (top.prob - second.prob < OPEN_GAP) {
    headline = "Gara aperta, nessun favorito";
  } else if (top.key === "D") {
    headline = "Equilibrio: il pareggio è l'esito più probabile";
  } else if (top.prob >= CLEAR_FAVOURITE) {
    headline = top.name.concat(" nettamente avanti");
  } else if (top.prob >= FAVOURITE) {
    headline = top.name.concat(" favorita");
  } else {
    headline = top.name.concat(" leggermente avanti");
  }

  const over = prediction.probOver25;
  const goals =
    over === null ? null : over >= GOALS_MANY ? "molti gol attesi" : over <= GOALS_FEW ? "pochi gol attesi" : null;

  const thread =
    prediction.probHome !== null && prediction.probDraw !== null && prediction.probAway !== null
      ? { home: prediction.probHome, draw: prediction.probDraw, away: prediction.probAway }
      : null;

  return { headline, goals, thread };
}

/** Scarto sotto il quale modello e mercato dicono la stessa cosa. */
const MARKET_AGREE = 4;
/** Sopra questo scarto la distanza fra le due letture è netta. */
const MARKET_WIDE = 10;

/** Il minimo che serve per il confronto: vale sia per l'elenco sia per la singola gara. */
export interface MarketComparable {
  readonly probHome: number | null;
  readonly probDraw: number | null;
  readonly probAway: number | null;
  readonly probOver25: number | null;
  readonly probBtts: number | null;
}

export interface MarketRow {
  readonly label: string;
  readonly model: number | null;
  readonly market: number | null;
  readonly odds: number | null;
  readonly moving: boolean;
}

export interface MarketReading {
  readonly rows: readonly MarketRow[];
  /** Dove le due letture si allontanano di più, detto in prosa. */
  readonly sentence: string;
  /** Il movimento delle ultime ore, quando è netto. */
  readonly movement: string | null;
}

function outcome(odds: MatchOdds, market: string, key: string): MarketOutcome | null {
  return odds.markets[market]?.find((o) => o.key === key) ?? null;
}

function row(label: string, model: number | null, market: MarketOutcome | null): MarketRow {
  return {
    label,
    model,
    market: market?.impliedProb ?? null,
    odds: market?.consensusOdds ?? null,
    moving: market?.drift === "verso",
  };
}

/**
 * Modello e mercato affiancati. Nessun operatore viene nominato: restano la probabilità
 * implicita, la quota di consenso e il verso del movimento.
 */
export function readMarket(
  prediction: MarketComparable | null,
  odds: MatchOdds,
  homeTeam: string,
  awayTeam: string,
): MarketReading | null {
  const rows: MarketRow[] = [
    row(homeTeam, prediction?.probHome ?? null, outcome(odds, "1x2", "HOME")),
    row("Pareggio", prediction?.probDraw ?? null, outcome(odds, "1x2", "DRAW")),
    row(awayTeam, prediction?.probAway ?? null, outcome(odds, "1x2", "AWAY")),
    row("Over 2.5", prediction?.probOver25 ?? null, outcome(odds, "over_under_25", "over@2.5")),
    row("Gol/Gol", prediction?.probBtts ?? null, outcome(odds, "btts", "yes")),
  ].filter((r) => r.market !== null);

  if (rows.length === 0) return null;

  const comparable = rows.filter((r) => r.model !== null && r.market !== null);
  let sentence = "Il mercato quota questa gara; la lettura del modello non copre gli stessi esiti.";

  if (comparable.length > 0) {
    const widest = comparable.reduce((worst, r) =>
      Math.abs((r.model as number) - (r.market as number)) >
      Math.abs((worst.model as number) - (worst.market as number))
        ? r
        : worst,
    );
    const gap = (widest.model as number) - (widest.market as number);
    const size = Math.abs(gap);
    if (size < MARKET_AGREE) {
      sentence = "Modello e mercato leggono la gara allo stesso modo.";
    } else {
      const direction = gap > 0 ? "più fiducioso" : "più prudente";
      const distance = size >= MARKET_WIDE ? "molto " : "";
      // La frase mette l'esito in fondo: così non serve accordare l'articolo con nomi
      // che possono essere una squadra, un pareggio o una soglia di gol.
      sentence = "Il modello è ".concat(distance, direction, " del mercato su ", widest.label, ".");
    }
  }

  const moving = rows.filter((r) => r.moving);
  const movement =
    moving.length === 1
      ? "Nelle ultime ore il mercato si è spostato verso ".concat(
          moving[0].label === "Pareggio" ? "il pareggio" : moving[0].label,
          ".",
        )
      : null;

  return { rows, sentence, movement };
}

/**
 * Riscontro di una gara conclusa: che cosa era stato letto e che cosa è successo.
 * Nessun punteggio di bravura, solo il confronto. Null quando manca uno dei due lati.
 */
export function readOutcome(
  prediction: DashboardPrediction,
  homeScore: number | null,
  awayScore: number | null,
): string | null {
  if (homeScore === null || awayScore === null) return null;
  const called = prediction.predicted ?? prediction.favorite;
  if (called === null) return null;

  const happened: Outcome = homeScore > awayScore ? "H" : homeScore < awayScore ? "A" : "D";
  const exact =
    prediction.mostLikelyScore === String(homeScore).concat("-", String(awayScore))
      ? ", risultato esatto"
      : "";
  return called === happened ? "Esito confermato".concat(exact) : "Esito diverso da quello letto";
}
