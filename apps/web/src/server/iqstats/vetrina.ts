// La vetrina delle letture in arrivo, letta dall'artefatto che lo script offline scrive.
//
// **Perche' non si calcola a richiesta.** Una lettura costa una proiezione, fra 227 e 402 ms
// per gara: un giorno di calcio sono oltre cento gare, e nessuna pagina puo' aspettare
// quindici secondi. Lo scrive `scripts/vetrina-letture.ts`, qui si legge e si dichiara
// **quando**.
//
// **Una vetrina vecchia non si mostra.** A differenza del consuntivo, che parla di gare gia'
// giocate e non invecchia, questa parla di gare in arrivo: passata la loro ora non e' piu'
// una vetrina, e' un archivio senza esito. Le letture di gare gia' iniziate escono da sole,
// e se non ne resta nessuna la sezione non compare invece di mostrarsi vuota.
import "server-only";

import rapporto from "./artefatti/vetrina-letture.json" with { type: "json" };

export interface VoceDiVetrina {
  readonly gara: number;
  readonly casa: string;
  readonly fuori: string;
  readonly lega: string;
  readonly kickoff: string;
  readonly bersaglio: string;
  readonly lato: "casa" | "trasferta" | "totale";
  readonly soglia: number;
  readonly verso: string;
  readonly probabilita: number;
  /** Quante volte quella linea succede in quel campionato. `null` dove non si sa. */
  readonly base: number | null;
  readonly affidabilita: number;
}

export interface Vetrina {
  readonly calcolataIl: string;
  readonly letture: readonly VoceDiVetrina[];
}

function lato(valore: string): VoceDiVetrina["lato"] | null {
  return valore === "casa" || valore === "trasferta" || valore === "totale" ? valore : null;
}

/**
 * Le letture in arrivo che non sono ancora cominciate, o `null` se non ne resta nessuna.
 *
 * `adesso` si passa da fuori perche' la funzione resti verificabile senza aspettare che
 * passi il tempo: una vetrina che dipende dall'orologio di sistema non si sa provare.
 */
export function vetrinaDelleLetture(adesso: Date = new Date()): Vetrina | null {
  const letture: VoceDiVetrina[] = rapporto.letture.flatMap((voce) => {
    const dove = lato(voce.lato);
    if (dove === null) return [];
    if (new Date(voce.kickoff).getTime() <= adesso.getTime()) return [];
    return [{ ...voce, lato: dove }];
  });

  return letture.length === 0
    ? null
    : { calcolataIl: rapporto.calcolato_il, letture };
}
