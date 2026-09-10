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
}

export interface Expected {
  readonly calcolatoIl: string;
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
    return [{ ...g, famiglie, consigliato: consigliato as Consigliato | null }];
  });

  return gare.length === 0 ? null : { calcolatoIl: rapporto.calcolato_il, gare };
}
