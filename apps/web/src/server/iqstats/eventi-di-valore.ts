import "server-only";

import type { LatoDiRiga, RigaQuotata } from "./expected-famiglie.ts";
import { soglieReali } from "./projection/linea-scelta.ts";
import type { Linea, ProiezioneDiGara } from "./projection/match.ts";
import { implicitaSoglia, valoreSoglia } from "./projection/valore.ts";

/**
 * Gli eventi di valore per l'analisi finale: le poche soglie dove la nostra probabilità
 * **batte il prezzo** del banco di un margine netto, ordinate per quel margine.
 *
 * **Stesso calcolo del verdetto inline nella scaletta.** L'evento e il tag «valore +N»
 * sotto la soglia nascono dallo stesso `valoreSoglia`, sulla stessa linea accesa: così non
 * si contraddicono. La linea è quella scelta dal motore (`candidateDiGara`), il valore è al
 * netto del margine del banco (le due quote Over/Under normalizzate).
 *
 * **Il valore non è un edge provato.** È vero rispetto a quel prezzo, ma manca lo storico
 * quote per dire che regge nel tempo: la pagina scrive «diamo più del prezzo», mai «vince».
 */

/** Sotto questi punti un evento è la norma del prezzo, non un valore. Scelto +5. */
export const EDGE_MINIMO = 5;

/** Quanti eventi al massimo: oltre il quarto si torna a scorrere, non a leggere. */
const QUANTI = 4;

export interface EventoValore {
  readonly bersaglio: string;
  readonly lato: LatoDiRiga;
  readonly soglia: number;
  readonly verso: "Over" | "Under";
  /** La nostra probabilità del lato, da 0 a 100. */
  readonly nostra: number;
  readonly quota: number;
  /** La probabilità implicita nel prezzo, ripulita dal margine, da 0 a 100. */
  readonly implicita: number;
  /** Quanti punti la nostra probabilità sta sopra il prezzo. */
  readonly valore: number;
}

function quotaDi(
  quote: readonly RigaQuotata[],
  bersaglio: string,
  lato: LatoDiRiga,
  soglia: number,
  verso: string,
): number | null {
  const r = quote.find(
    (q) => q.bersaglio === bersaglio && q.lato === lato && q.soglia === soglia && q.verso === verso,
  );
  return r === undefined ? null : r.quota;
}

export function eventiDiValore(
  bersagli: readonly ProiezioneDiGara[],
  quote: readonly RigaQuotata[],
): readonly EventoValore[] {
  const eventi: EventoValore[] = [];
  for (const b of bersagli) {
    if (b.casa.stato !== "prevista" || b.trasferta.stato !== "prevista") continue;
    const scale: ReadonlyArray<{ lato: LatoDiRiga; linee: readonly Linea[] | null }> = [
      { lato: "casa", linee: b.linee.casa },
      { lato: "trasferta", linee: b.linee.trasferta },
      { lato: "totale", linee: b.totale?.linee ?? null },
    ];
    for (const { lato, linee } of scale) {
      if (linee === null) continue;
      // **Le stesse soglie della scaletta**, così il valore qui e il tag inline coincidono.
      for (const linea of soglieReali(linee)) {
        if (linea.probabilitaSopra === linea.probabilitaSotto) continue;
        const guidaSopra = linea.probabilitaSopra > linea.probabilitaSotto;
        const verso = guidaSopra ? "Over" : "Under";
        const probLead = guidaSopra ? linea.probabilitaSopra : linea.probabilitaSotto;
        const quotaLead = quotaDi(quote, b.target, lato, linea.soglia, verso);
        const quotaAltro = quotaDi(quote, b.target, lato, linea.soglia, guidaSopra ? "Under" : "Over");
        const valore = valoreSoglia(probLead, quotaLead, quotaAltro);
        const implicita = implicitaSoglia(quotaLead, quotaAltro);
        if (valore === null || valore < EDGE_MINIMO || quotaLead === null || implicita === null) {
          continue;
        }
        eventi.push({
          bersaglio: b.target,
          lato,
          soglia: linea.soglia,
          verso,
          nostra: probLead * 100,
          quota: quotaLead,
          implicita: implicita * 100,
          valore,
        });
      }
    }
  }
  // Una riga per bersaglio: fra le soglie e i lati dello stesso bersaglio resta il valore più
  // alto, così «Over e Under dei corner» non occupano due dei quattro posti.
  const perBersaglio = new Map<string, EventoValore>();
  for (const e of eventi) {
    const gia = perBersaglio.get(e.bersaglio);
    if (gia === undefined || e.valore > gia.valore) perBersaglio.set(e.bersaglio, e);
  }
  return [...perBersaglio.values()]
    .sort((a, b) => b.valore - a.valore)
    .slice(0, QUANTI);
}
