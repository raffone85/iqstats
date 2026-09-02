// Server-only: la previsione IQstatS di una gara, in quattro letture.
// Due vengono dagli esiti — chi vince e quanti gol — e due dalle statistiche di gioco e di
// disciplina proiettate dal motore. Una lettura compare solo se poggia su dati veri: dove
// il motore non copre la competizione, le due statistiche restano fuori e si dichiara.
//
// Le regole di scelta vivono soltanto qui e non si mostrano in pagina.
//
// **Dal 2 settembre 2026 questo modulo e' anche il punto dove probabilita' e quota si
// incontrano.** Prima le due cose stavano separate: la lettura sceglieva l'esito, il
// pannello del mercato accostava i numeri, e il margine fra i due non lo calcolava
// nessuno. Adesso ogni lettura porta la quota, la probabilita' implicita, il margine,
// l'affidabilita' e il campione, dove esistono. Dove non esistono restano `null`: un
// margine senza quota non e' zero, e' un margine che non si puo' misurare.
//
// **Il modello e' uno solo per volta.** I mercati dei gol e i sette bersagli vengono dal
// motore di proiezione quando quello copre la gara; sotto, dal motore di base. Non si
// mescolano: due numeri diversi per la stessa domanda non sono una lettura piu' ricca,
// sono una lettura che si contraddice.
import "server-only";

import type { MarketComparable } from "./match-reading.ts";
import type { MatchOdds } from "./odds.ts";
import type { MercatiGol } from "./projection/gol.ts";
import type { LivelloDiAffidabilita } from "./projection/production.ts";
import { previstaDalModello, type ProiezioneDiGara } from "./projection/match.ts";
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
  /** La quota di consenso su cui poggia la probabilità implicita. */
  readonly odds: number | null;
  /**
   * Quanti punti percentuali il modello sta sopra il mercato. Positivo dove il modello
   * dà l'esito più probabile di quanto lo prezzi il mercato, negativo dove è più prudente.
   * `null` quando manca uno dei due lati: senza entrambi non è una differenza, è un'assenza.
   */
  readonly edge: number | null;
  /**
   * Quanto quella previsione ha retto fuori campione, da 0 a 100. `null` dove non è stata
   * misurata — i mercati dei gol nascono da una distribuzione sugli attesi e nessuno ne ha
   * misurato la copertura — e un margine senza affidabilità **non si dichiara forte**.
   */
  readonly reliability: number | null;
  /** Su quante gare poggia la lettura: il numero più piccolo fra i due lati. */
  readonly sample: number | null;
  /**
   * Vero solo quando il margine è positivo **e** l'affidabilità supera la soglia che
   * l'artefatto stesso dichiara per quel bersaglio.
   *
   * La soglia non è decisa qui: viene misurata all'addestramento e viaggia dentro
   * `LivelloDiAffidabilita.soglia`. Dove l'affidabilità non è stata misurata — i mercati
   * dei gol, il motore di base — questo resta **falso**: un margine da solo non è una
   * lettura solida, è un margine di cui non si sa quanto fidarsi.
   */
  readonly solida: boolean;
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
    const mercato = market === undefined ? null : marketProb(odds, market, outcomeKey);
    const pick: MatchPick = {
      area,
      label: (choice.over ? "Più di " : "Meno di ").concat(
        String(choice.line).replace(".", ","),
        " ",
        name,
      ),
      probability: choice.probability,
      marketProbability: mercato,
      odds: market === undefined ? null : marketOdds(odds, market, outcomeKey),
      edge: margine(choice.probability, mercato),
      // Il motore di base non porta una curva di affidabilita' misurata, e il campione
      // della singola gara non lo espone: due assenze dichiarate, non due zeri.
      reliability: null,
      sample: null,
      solida: false,
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

function marketOdds(odds: MatchOdds | null, market: string, key: string): number | null {
  return odds?.markets[market]?.find((o) => o.key === key)?.consensusOdds ?? null;
}

/**
 * Il margine fra la nostra probabilita' e quella che il mercato prezza, in punti.
 *
 * Positivo dove diamo l'esito piu' probabile del mercato. `null` quando uno dei due lati
 * manca: la differenza fra un numero e un'assenza non e' zero, non esiste.
 */
function margine(probabilita: number, mercato: number | null): number | null {
  if (mercato === null || !Number.isFinite(mercato) || !Number.isFinite(probabilita)) return null;
  return Math.round((probabilita - mercato) * 10) / 10;
}

/**
 * I nostri mercati dei gol nella forma che il confronto con il mercato gia' conosce.
 *
 * Serve a una cosa sola, ed e' il motivo per cui esiste: fino al 2 settembre 2026 la
 * colonna «Modello» del pannello del mercato veniva dalla **previsione della fonte**, non
 * dalla nostra. Con questo adattatore la stessa funzione di confronto legge i numeri che
 * escono dai nostri attesi, senza che nessuno riscriva il confronto.
 */
export function comparabileDaGol(mercati: MercatiGol): MarketComparable {
  const over25 = mercati.overUnder.find((l) => l.linea === 2.5) ?? null;
  // Si arrotonda al decimo qui, una volta sola: `0,57 * 100` in virgola mobile fa
  // 56,99999999999999, e quella coda finirebbe dentro ogni margine calcolato piu' avanti.
  const percento = (quota: number) => Math.round(quota * 1000) / 10;
  return {
    probHome: percento(mercati.esito.uno),
    probDraw: percento(mercati.esito.x),
    probAway: percento(mercati.esito.due),
    probOver25: over25 === null ? null : percento(over25.sopra),
    probBtts: percento(mercati.gg),
  };
}

/**
 * I bersagli del motore che hanno un mercato con cui confrontarsi, e come si chiamano.
 *
 * Dei cartellini la fonte quota solo i rossi, che il motore non proietta; tiri, falli,
 * fuorigioco e parate non sono quotati. Resta il corner. La mappa e' corta perche' e'
 * corta la realta', non perche' sia un abbozzo.
 */
const BERSAGLIO_MERCATO: Record<string, { readonly mercato: string; readonly nome: string }> = {
  corner_kicks: { mercato: "total_corners", nome: "corner" },
};

/**
 * Una lettura e' solida quando il margine e' positivo e l'affidabilita' supera la soglia
 * che l'artefatto dichiara per quel bersaglio.
 *
 * Le due condizioni servono tutte e due, e la seconda e' quella che si dimentica: un
 * margine di dieci punti su una previsione che fuori campione sta sotto la propria soglia
 * non e' un'occasione, e' rumore con una quota accanto.
 */
function solidaSecondoLArtefatto(
  edge: number | null,
  affidabilita: LivelloDiAffidabilita | null,
): boolean {
  if (edge === null || edge <= 0 || affidabilita === null) return false;
  return affidabilita.punteggio >= affidabilita.soglia;
}

/** Su quante gare poggia la lettura: il lato con meno storia, che e' quello che comanda. */
function campioneDi(proiezione: ProiezioneDiGara): number | null {
  const lati = [proiezione.casa, proiezione.trasferta]
    .filter(previstaDalModello)
    .map((lato) => lato.evidenze.garePrecedenti)
    .filter((gare): gare is number => typeof gare === "number");
  return lati.length === 2 ? Math.min(...lati) : null;
}

/**
 * La lettura di gioco quando a proiettare e' il motore di proiezione.
 *
 * Stessa scelta di `pickFromMetrics` — la linea piu' netta senza essere scontata — ma sui
 * bersagli veri, con l'affidabilita' misurata e il campione che il motore gia' porta.
 */
function pickDaiBersagli(
  bersagli: readonly ProiezioneDiGara[],
  odds: MatchOdds | null,
): MatchPick | null {
  let best: { pick: MatchPick; distance: number } | null = null;

  for (const proiezione of bersagli) {
    const quotabile = BERSAGLIO_MERCATO[proiezione.target];
    if (quotabile === undefined) continue;
    const totale = proiezione.totale;
    if (totale === null || totale.linee === null) continue;

    for (const linea of totale.linee) {
      const sopra = linea.probabilitaSopra >= linea.probabilitaSotto;
      const probability = (sopra ? linea.probabilitaSopra : linea.probabilitaSotto) * 100;
      if (probability < MIN_USEFUL) continue;
      const distance = Math.abs(probability - IDEAL);
      if (best !== null && distance >= best.distance) continue;

      const chiave = (sopra ? "over@" : "under@").concat(String(linea.soglia));
      const mercato = marketProb(odds, quotabile.mercato, chiave);
      best = {
        distance,
        pick: {
          area: "gioco",
          label: (sopra ? "Più di " : "Meno di ").concat(
            String(linea.soglia).replace(".", ","),
            " ",
            quotabile.nome,
          ),
          probability,
          marketProbability: mercato,
          odds: marketOdds(odds, quotabile.mercato, chiave),
          edge: margine(probability, mercato),
          reliability: totale.affidabilita?.punteggio ?? null,
          sample: campioneDi(proiezione),
          solida: solidaSecondoLArtefatto(margine(probability, mercato), totale.affidabilita),
          marketQuoted: true,
          note: "Attesi ".concat(
            totale.valoreAtteso.toFixed(1).replace(".", ","),
            " ",
            quotabile.nome,
            " nella gara",
          ),
        },
      };
    }
  }

  return best?.pick ?? null;
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
  /**
   * I bersagli del motore di proiezione. Quando ce ne sono, la lettura di gioco esce da
   * qui e **non** dal motore di base: e' lo stesso aut-aut che la pagina applica ai due
   * pannelli, e vale anche per le letture, altrimenti il numero della lettura e quello
   * della card sotto non combacerebbero.
   */
  bersagli: readonly ProiezioneDiGara[] = [],
  /** Su quante gare poggiano le due forze dei gol: il lato con meno storia fra i due. */
  campioneGol: number | null = null,
): readonly MatchPick[] {
  const picks: MatchPick[] = [];

  // 1 — chi vince
  if (prediction) {
    const outcomes = [
      { label: homeTeam, prob: prediction.probHome, key: "HOME" },
      { label: "Pareggio", prob: prediction.probDraw, key: "DRAW" },
      { label: awayTeam, prob: prediction.probAway, key: "AWAY" },
    ]
      .map((o) => ({ ...o, market: marketProb(odds, "1x2", o.key) }))
      .filter((o): o is { label: string; prob: number; key: string; market: number | null } =>
        o.prob !== null,
      );

    if (outcomes.length > 0) {
      const top = outcomes.reduce((best, o) => (o.prob > best.prob ? o : best));
      picks.push({
        area: "esito",
        label: top.label === "Pareggio" ? "Pareggio" : top.label.concat(" avanti"),
        probability: top.prob,
        marketProbability: top.market,
        odds: marketOdds(odds, "1x2", top.key),
        edge: margine(top.prob, top.market),
        reliability: null,
        sample: campioneGol,
        solida: false,
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
      const chiaveGol = over ? "over@2.5" : "under@2.5";
      const mercatoGol = marketProb(odds, "over_under_25", chiaveGol);
      const probabilitaGol = over ? prediction.probOver25 : 100 - prediction.probOver25;
      picks.push({
        area: "gol",
        label: over ? "Più di 2,5 gol" : "Meno di 2,5 gol",
        probability: probabilitaGol,
        marketProbability: mercatoGol,
        odds: marketOdds(odds, "over_under_25", chiaveGol),
        edge: margine(probabilitaGol, mercatoGol),
        reliability: null,
        sample: campioneGol,
        solida: false,
        marketQuoted: true,
        note: "Il totale dei gol della gara",
      });
    }
  }

  // 3 e 4 — le due letture statistiche. Il motore di proiezione ha la precedenza: dove
  // copre, la lettura di gioco esce dai suoi bersagli, con affidabilita' e campione. Sotto,
  // resta il motore di base, che quei due numeri non li ha e li dichiara assenti.
  const gioco = bersagli.length > 0 ? pickDaiBersagli(bersagli, odds) : null;
  if (gioco) {
    picks.push(gioco);
  } else if (engine.available) {
    const play = pickFromMetrics(engine.metrics, ["corners", "shots", "sot"], "gioco", odds);
    if (play) picks.push(play);
  }
  if (engine.available && bersagli.length === 0) {
    const discipline = pickFromMetrics(engine.metrics, ["yellows", "fouls"], "disciplina", odds);
    if (discipline) picks.push(discipline);
  }

  return picks;
}
