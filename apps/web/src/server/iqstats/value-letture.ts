/**
 * Lo scarto fra la probabilita' del modello e la quota di consenso.
 *
 * edge = p * quota - 1. Positivo: il modello da' all'esito piu' di quanto
 * chieda il prezzo. Non e' un consiglio di giocata: e' un confronto numerico.
 * Senza quota o senza probabilita' la voce non nasce.
 */
import type { MarketRow } from "./match-reading.ts";

export interface ValueVoce {
  readonly etichetta: string;
  readonly probabilita: number;
  readonly quota: number;
  readonly implicita: number | null;
  /** p * quota - 1. Puo' essere negativo. */
  readonly edge: number;
}

export function valueDelleQuote(righe: readonly MarketRow[]): readonly ValueVoce[] {
  const voci: ValueVoce[] = [];
  for (const riga of righe) {
    if (riga.model === null || riga.odds === null || riga.odds <= 1) continue;
    const probabilita = riga.model / 100;
    if (!(probabilita > 0) || probabilita > 1) continue;
    voci.push({
      etichetta: riga.label,
      probabilita,
      quota: riga.odds,
      implicita: riga.market === null ? null : riga.market / 100,
      edge: probabilita * riga.odds - 1,
    });
  }
  return [...voci].sort((a, b) => b.edge - a.edge);
}

/** Quante voci hanno edge sopra la soglia dichiarata. */
export const SOGLIA_VALUE = 0.03;

export function valueSopraSoglia(voci: readonly ValueVoce[]): readonly ValueVoce[] {
  return voci.filter((v) => v.edge >= SOGLIA_VALUE);
}
