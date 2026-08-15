// Server-only: la previsione IQstatS di una gara, in quattro letture.
// Due vengono dagli esiti — chi vince e quanti gol — e due dalle statistiche di gioco e di
// disciplina proiettate dal motore. Una lettura compare solo se poggia su dati veri: dove
// il motore non copre la competizione, le due statistiche restano fuori e si dichiara.
//
// Le regole di scelta vivono soltanto qui e non si mostrano in pagina.
import "server-only";

import type { MarketComparable } from "./match-reading.ts";
import type { MatchOdds } from "./odds.ts";
import type { StatEngineResult, StatMetric, StatLine, MetricProjection } from "./stat-engine.ts";

/** Sotto questa probabilità una lettura non dice abbastanza per essere mostrata. */
const MIN_USEFUL = 58;
/** Sui gol la soglia è più bassa: il mercato stesso vive spesso attorno alla parità. */
const MIN_GOALS_USEFUL = 55;
/** La lettura più utile è quella netta ma non scontata: si sceglie la più vicina a questa. */
const IDEAL = 72;

export type PickArea = "esito" | "gol" | "gioco" | "disciplina";

export interface MatchPick {
  readonly area: PickArea;
  /** Che cosa dice la lettura, già in italiano. */
  readonly label: string;
  readonly probability: number;
  /** Il confronto con il mercato, quando quel mercato è quotato. */
  readonly marketProbability: number | null;
  /**
   * Falso quando su questo esito **non esiste** un mercato con cui confrontarsi: le
   * ammonizioni, per dire, non sono quotate da nessuno — dei cartellini si quotano solo
   * i rossi. È diverso da `marketProbability` nullo, che è un'assenza di questa gara.
   */
  readonly marketQuoted: boolean;
  readonly note: string;
}

const METRIC_LABEL: Record<StatMetric, string> = {
  shots: "tiri",
  sot: "tiri in porta",
  fouls: "falli",
  corners: "corner",
  yellows: "ammonizioni",
  saves: "parate",
  offsides: "fuorigioco",
};

interface LineChoice {
  readonly line: number;
  readonly over: boolean;
  readonly probability: number;
}

/** Fra le soglie di una metrica, la lettura più netta senza essere scontata. */
function bestLine(lines: readonly StatLine[]): LineChoice | null {
  let best: LineChoice | null = null;
  for (const line of lines) {
    const over = line.probOver >= line.probUnder;
    const probability = (over ? line.probOver : line.probUnder) * 100;
    if (probability < MIN_USEFUL) continue;
    if (best === null || Math.abs(probability - IDEAL) < Math.abs(best.probability - IDEAL)) {
      best = { line: line.line, over, probability };
    }
  }
  return best;
}

/**
 * Le metriche del motore che hanno un mercato con cui confrontarsi. Dei cartellini la
 * fonte quota solo i rossi, che il motore non proietta: le ammonizioni e i falli restano
 * fuori, e la pagina lo dichiara invece di accostare numeri di esiti diversi.
 */
const METRIC_MARKET: Partial<Record<StatMetric, string>> = {
  corners: "total_corners",
};

function pickFromMetrics(
  metrics: readonly MetricProjection[],
  candidates: readonly StatMetric[],
  area: PickArea,
  odds: MatchOdds | null,
): MatchPick | null {
  let best: { pick: MatchPick; distance: number } | null = null;

  for (const metric of metrics) {
    if (!candidates.includes(metric.metric)) continue;
    const choice = bestLine(metric.totalLines);
    if (choice === null) continue;

    const name = METRIC_LABEL[metric.metric];
    // Le soglie del motore sono sempre .5, le stesse che la fonte quota: la chiave
    // dell'esito combacia senza conversioni.
    const market = METRIC_MARKET[metric.metric];
    const outcomeKey = (choice.over ? "over@" : "under@").concat(String(choice.line));
    const pick: MatchPick = {
      area,
      label: (choice.over ? "Più di " : "Meno di ").concat(
        String(choice.line).replace(".", ","),
        " ",
        name,
      ),
      probability: choice.probability,
      marketProbability: market === undefined ? null : marketProb(odds, market, outcomeKey),
      marketQuoted: market !== undefined,
      note: "Attesi ".concat(
        metric.expectedTotal.toFixed(1).replace(".", ","),
        " ",
        name,
        " nella gara",
        metric.refereeAdjustment !== null ? ", con il metro dell'arbitro applicato" : "",
      ),
    };
    const distance = Math.abs(choice.probability - IDEAL);
    if (best === null || distance < best.distance) best = { pick, distance };
  }

  return best?.pick ?? null;
}

function marketProb(odds: MatchOdds | null, market: string, key: string): number | null {
  return odds?.markets[market]?.find((o) => o.key === key)?.impliedProb ?? null;
}

/**
 * Le quattro letture della gara. Ritorna solo quelle che poggiano su dati disponibili:
 * l'elenco può contenerne meno di quattro, e il chiamante dichiara ciò che manca.
 */
export function buildMatchPicks(
  prediction: MarketComparable | null,
  engine: StatEngineResult,
  odds: MatchOdds | null,
  homeTeam: string,
  awayTeam: string,
): readonly MatchPick[] {
  const picks: MatchPick[] = [];

  // 1 — chi vince
  if (prediction) {
    const outcomes = [
      { label: homeTeam, prob: prediction.probHome, market: marketProb(odds, "1x2", "HOME") },
      { label: "Pareggio", prob: prediction.probDraw, market: marketProb(odds, "1x2", "DRAW") },
      { label: awayTeam, prob: prediction.probAway, market: marketProb(odds, "1x2", "AWAY") },
    ].filter((o): o is { label: string; prob: number; market: number | null } => o.prob !== null);

    if (outcomes.length > 0) {
      const top = outcomes.reduce((best, o) => (o.prob > best.prob ? o : best));
      picks.push({
        area: "esito",
        label: top.label === "Pareggio" ? "Pareggio" : top.label.concat(" avanti"),
        probability: top.prob,
        marketProbability: top.market,
        marketQuoted: true,
        note: "L'esito più probabile fra i tre",
      });
    }

    // 2 — quanti gol. Una lettura in bilico non è una lettura: sotto la soglia si tace.
    const goalsProb =
      prediction.probOver25 === null
        ? null
        : Math.max(prediction.probOver25, 100 - prediction.probOver25);
    if (prediction.probOver25 !== null && goalsProb !== null && goalsProb >= MIN_GOALS_USEFUL) {
      const over = prediction.probOver25 >= 50;
      picks.push({
        area: "gol",
        label: over ? "Più di 2,5 gol" : "Meno di 2,5 gol",
        probability: over ? prediction.probOver25 : 100 - prediction.probOver25,
        marketProbability: over
          ? marketProb(odds, "over_under_25", "over@2.5")
          : marketProb(odds, "over_under_25", "under@2.5"),
        marketQuoted: true,
        note: "Il totale dei gol della gara",
      });
    }
  }

  // 3 e 4 — le due letture statistiche, solo dove il motore copre la competizione
  if (engine.available) {
    const play = pickFromMetrics(engine.metrics, ["corners", "shots", "sot"], "gioco", odds);
    if (play) picks.push(play);
    const discipline = pickFromMetrics(engine.metrics, ["yellows", "fouls"], "disciplina", odds);
    if (discipline) picks.push(discipline);
  }

  return picks;
}
