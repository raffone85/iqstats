// Expected: le famiglie del motore per le gare in arrivo, lette dall'artefatto offline.
//
// **Perche' non si calcola a richiesta.** Una proiezione costa fra 227 e 402 ms per gara, e
// qui ne servono sette per gara: un giorno di calcio sono minuti, e nessuna pagina puo'
// aspettarli. Lo scrive `scripts/expected-famiglie.ts`, qui si legge e si dichiara **quando**.
//
// **Una gara gia' cominciata esce da sola.** Come la vetrina: passata l'ora del calcio
// d'inizio non e' piu' una proiezione, e' un archivio senza esito.
//
// **Il nome del file non e' `expected.ts`** perche' quel nome e' del banco di prova, che si
// chiamava Expected fino al 10 settembre 2026 e adesso sta in `banco-di-prova.ts`. Due
// moduli con lo stesso nome erano gia' bastati a far sovrascrivere quello sbagliato.
import "server-only";

import rapporto from "./artefatti/expected-famiglie.json" with { type: "json" };

export type LatoDiRiga = "casa" | "trasferta" | "totale";

export interface RigaDiFamiglia {
  readonly bersaglio: string;
  readonly lato: LatoDiRiga;
  readonly soglia: number;
  readonly verso: string;
  /** Da 0 a 1. */
  readonly probabilita: number;
  /** Quanto quella linea succede in quel campionato, da 0 a 100, o `null` se non si sa. */
  readonly base: number | null;
  /** Su quante gare poggia la base. `null` dove la base manca. */
  readonly gareDiBase: number | null;
  /** Da 0 a 100. */
  readonly affidabilita: number;
  /** Il valore che il motore attende su quella scala: la soglia nasce da qui, non viceversa. */
  readonly atteso: number;
  readonly intervallo: { readonly basso: number; readonly alto: number } | null;
  /**
   * Da dove viene il numero, e quanto ci mette il modello.
   *
   * Sotto `miscela` l'atteso e' `peso x modello + (1 - peso) x baseline`: le cause
   * spiegano la quota del modello, non tutto il numero, e la pagina lo deve dire. Misurato
   * l'11 settembre 2026 su 591 righe: **356 sono miscela**, 235 modello pieno.
   */
  readonly origine: "modello" | "miscela" | "ripiego";
  readonly pesoDelModello: number;
  /** Che cosa ha mosso l'atteso, dalla causa piu' grande. */
  readonly cause: readonly CausaDellAtteso[];
}

/** Una causa dell'atteso: il nome che si legge e la quota di cui lo sposta. */
export interface CausaDellAtteso {
  readonly nome: string;
  /** Quota dell'atteso: `+0,08` vuol dire che questa causa lo alza dell'otto per cento. */
  readonly effetto: number;
}

export interface Consigliato extends RigaDiFamiglia {
  /** Punti percentuali fra la nostra probabilita' e la frequenza della lega. */
  readonly scarto: number | null;
}

export interface GaraExpected {
  readonly gara: number;
  readonly casa: string;
  readonly fuori: string;
  /** Gli identificativi servono agli stemmi: senza, la riga mostra solo le iniziali. */
  readonly casaId: number | null;
  readonly fuoriId: number | null;
  readonly legaId: number | null;
  readonly lega: string | null;
  readonly kickoff: string;
  readonly consigliato: Consigliato | null;
  readonly famiglie: readonly RigaDiFamiglia[];
  /**
   * Le famiglie che questa gara non produce. Sono quasi sempre le tre che dipendono
   * dall'arbitro - falli, cartellini, tiri in porta - e restano scritte invece che
   * sparire: una copertura assente si dichiara, non si riempie.
   */
  readonly senzaMisura: readonly string[];
  /**
   * Le linee che il bookmaker quota davvero, per i due lati e per il totale.
   *
   * **La soglia e' sua, la probabilita' e' nostra.** Il verso e' l'opposto delle
   * `famiglie`: li' il motore sceglie la soglia dal proprio atteso e un prezzo accanto si
   * trovava nel 9,5% dei casi, qui ogni linea ha la sua quota perche' e' il banco ad
   * averla aperta. Vuoto dove la gara non si aggancia al palinsesto.
   */
  readonly quote: readonly RigaQuotata[];
  /**
   * Quanto il motore attende da ogni famiglia, sui due lati e sul totale.
   *
   * E' la materia del riepilogo, e non si ricava dalle altre due liste: una riga di
   * famiglia porta l'atteso del solo lato scelto, e una riga quotata esiste solo dove il
   * banco ha aperto quel mercato.
   */
  readonly attesi: readonly AttesiDiFamiglia[];
  /** I mercati sui gol, i nostri e quelli del banco. `null` senza il materiale nostro. */
  readonly gol: GolDiGara | null;
}

/** L'atteso di una famiglia sui tre lati. `null` dove quella scala non esce. */
export interface AttesiDiFamiglia {
  readonly bersaglio: string;
  readonly casa: number | null;
  readonly trasferta: number | null;
  readonly totale: number | null;
}

/** Una linea quotata dal banco, con la nostra probabilita' su quella stessa soglia. */
export interface RigaQuotata {
  readonly bersaglio: string;
  readonly lato: LatoDiRiga;
  readonly soglia: number;
  readonly verso: string;
  /** La quota del banco: sempre maggiore di 1, perche' lo zero e' un mercato sospeso. */
  readonly quota: number;
  /** Da 0 a 1, oppure `null` dove quella scala non ha una calibrazione utilizzabile. */
  readonly probabilita: number | null;
  readonly atteso: number;
  /** La soglia cade fuori dalle cinque su cui la calibrazione e' stata misurata. */
  readonly fuoriFinestra: boolean;
}

/** Un intervallo di gol: «multigol 2-4», con la probabilita' nostra o la quota del banco. */
export interface IntervalloDiGol {
  readonly da: number;
  readonly a: number;
  readonly probabilita?: number;
  readonly quota?: number;
}

/** Una linea sui gol: la soglia e i due versi. */
export interface LineaDiGol {
  readonly linea: number;
  readonly sopra: number;
  readonly sotto: number;
}

export interface GolDiGara {
  readonly nostri: {
    readonly attesiCasa: number;
    readonly attesiTrasferta: number;
    /** Su quante gare per lato poggiano le forze, e su quante la media di lega. */
    readonly campioneCasa: number;
    readonly campioneTrasferta: number;
    readonly campioneLega: number;
    /** Gli xG delle stesse gare, e il metro della competizione: si mostrano, non contano. */
    readonly xgCasa: number | null;
    readonly xgTrasferta: number | null;
    readonly xgLegaCasa: number | null;
    readonly xgLegaTrasferta: number | null;
    readonly esito: { readonly uno: number; readonly x: number; readonly due: number };
    readonly doppiaChance: {
      readonly unoX: number;
      readonly xDue: number;
      readonly unoDue: number;
    };
    readonly overUnder: readonly LineaDiGol[];
    readonly gg: number;
    readonly ng: number;
    readonly multigolPartita: readonly IntervalloDiGol[];
    readonly multigolCasa: readonly IntervalloDiGol[];
    readonly multigolTrasferta: readonly IntervalloDiGol[];
  };
  readonly quote: {
    readonly esito: { readonly uno: number; readonly x: number; readonly due: number } | null;
    readonly doppiaChance: {
      readonly unoX: number;
      readonly xDue: number;
      readonly unoDue: number;
    } | null;
    readonly overUnder: ReadonlyArray<{
      readonly soglia: number;
      readonly verso: string;
      readonly quota: number;
    }>;
    readonly gol: number | null;
    readonly noGol: number | null;
    readonly multigolPartita: readonly IntervalloDiGol[];
    readonly multigolCasa: readonly IntervalloDiGol[];
    readonly multigolTrasferta: readonly IntervalloDiGol[];
  } | null;
}

export interface Expected {
  readonly calcolatoIl: string;
  /** Quando il palinsesto delle quote e' stato raccolto, o `null` se l'artefatto non ne ha. */
  readonly quoteRaccolteIl: string | null;
  readonly gare: readonly GaraExpected[];
}

function lato(valore: string): LatoDiRiga | null {
  return valore === "casa" || valore === "trasferta" || valore === "totale" ? valore : null;
}

function riga<T extends { lato: string }>(v: T): (T & { lato: LatoDiRiga }) | null {
  const dove = lato(v.lato);
  return dove === null ? null : { ...v, lato: dove };
}

/**
 * Le linee quotate di una gara sola, per il dossier.
 *
 * **Perche' esiste.** Le 3.397 linee di Fastbet stavano solo nella pagina Expected, e il
 * dossier - quello che si apre cliccando una gara dal tabellone - mostrava 101 soglie del
 * motore senza un prezzo accanto. La stessa gara raccontata in due posti, e il prezzo in
 * quello dove non si arriva cliccando.
 *
 * Non filtra per calcio d'inizio, a differenza di `expectedDelleGare`: il dossier si apre
 * anche su una gara gia' cominciata, e li' il prezzo raccolto prima resta un fatto storico
 * - la sezione dichiara **quando** e' stato raccolto.
 */
export function quoteDiGara(gara: number): readonly RigaQuotata[] {
  const g = rapporto.gare.find((x) => x.gara === gara);
  if (g === undefined) return [];
  return g.quote.map(riga).filter((r): r is RigaQuotata => r !== null);
}

/** Quando il palinsesto e' stato raccolto, o `null` se l'artefatto non lo dichiara. */
export function quoteRaccolteIl(): string | null {
  return rapporto.quote_raccolte_il ?? null;
}

/**
 * Fin quando arriva il palinsesto raccolto: il calcio d'inizio piu' lontano fra le gare
 * che hanno almeno una linea quotata.
 *
 * **Perche' serve.** `fastbet-quote.py --giorni 3` prende gli eventi da adesso a tre
 * giorni, quindi una gara piu' lontana non ha prezzi e non e' un difetto del dossier: e'
 * fuori dalla finestra della raccolta. Senza questo dato la pagina non puo' distinguere
 * «il banco non apre linee su questa gara» da «questa gara il banco non l'ha ancora
 * aperta», e finora non distingueva: dove i prezzi mancavano, spariva anche la riga che
 * dice da dove vengono. Misurato il 12 settembre 2026 sull'artefatto in produzione: 161
 * gare, 128 con linee, copertura fino al 13 settembre.
 */
export function quoteCoperteFino(): string | null {
  let fino: string | null = null;
  for (const g of rapporto.gare) {
    if (g.quote.length === 0) continue;
    if (fino === null || g.kickoff > fino) fino = g.kickoff;
  }
  return fino;
}

/**
 * Perche' una gara non ha prezzi: perche' e' oltre la finestra raccolta, o perche' il banco
 * non apre nessuna delle linee che il motore proietta.
 *
 * `null` dove i prezzi ci sono, e anche dove la finestra non si conosce: senza sapere fin
 * quando arriva il palinsesto non si puo' dire quale delle due assenze sia, e una ragione
 * inventata sarebbe peggio del silenzio.
 */
export function motivoSenzaQuote(
  quante: number,
  kickoff: string,
  fino: string | null = quoteCoperteFino(),
): "fuori-copertura" | "banco-non-apre" | null {
  if (quante > 0) return null;
  if (fino === null) return null;
  // Le due date arrivano dallo stesso artefatto e dalla stessa fonte, in ISO con la zona:
  // il confronto e' sull'istante, non sulle stringhe, perche' «+00:00» e «Z» sono lo stesso
  // momento scritto in due modi e l'ordine alfabetico li separerebbe.
  const quando = new Date(kickoff).getTime();
  const limite = new Date(fino).getTime();
  if (!Number.isFinite(quando) || !Number.isFinite(limite)) return null;
  return quando > limite ? "fuori-copertura" : "banco-non-apre";
}

/**
 * Le gare in arrivo che non sono ancora cominciate, o `null` se non ne resta nessuna.
 *
 * `adesso` si passa da fuori perche' la funzione resti verificabile senza aspettare che
 * passi il tempo, come per la vetrina.
 */
export function expectedDelleGare(adesso: Date = new Date()): Expected | null {
  const gare: GaraExpected[] = rapporto.gare.flatMap((g) => {
    if (new Date(g.kickoff).getTime() <= adesso.getTime()) return [];
    const famiglie = g.famiglie.map(riga).filter((r): r is RigaDiFamiglia => r !== null);
    if (famiglie.length === 0) return [];
    const consigliato = g.consigliato === null ? null : riga(g.consigliato);
    const quote = g.quote.map(riga).filter((r): r is RigaQuotata => r !== null);
    return [{ ...g, famiglie, quote, consigliato: consigliato as Consigliato | null }];
  });

  if (gare.length === 0) return null;
  // L'artefatto puo' essere stato scritto prima che le quote esistessero: il campo si
  // legge se c'e' e la pagina tace se non c'e', invece di dichiarare un'ora inventata.
  const raccolte: unknown = (rapporto as { readonly quote_raccolte_il?: unknown })
    .quote_raccolte_il;
  return {
    calcolatoIl: rapporto.calcolato_il,
    quoteRaccolteIl: typeof raccolte === "string" ? raccolte : null,
    gare,
  };
}
