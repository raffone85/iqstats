// Il consuntivo delle letture forti, letto dall'artefatto che lo script offline scrive.
//
// **Perche' non si calcola a richiesta.** Ricostruire una lettura costa una proiezione:
// misurata, fra 227 e 402 ms per gara. Il consuntivo su milleduecento gare chiuse ha
// richiesto due minuti e quattro secondi, e nessuna pagina puo' aspettarlo. Lo scrive
// `scripts/consuntivo-letture.ts`, qui si legge e si dichiara **quando** e' stato scritto.
//
// **Il numero non si abbellisce in lettura.** Le fasce dove la promessa e' piu' alta della
// frequenza restano esattamente come sono: e' il punto della sezione.
import "server-only";

import rapporto from "./artefatti/consuntivo-letture.json" with { type: "json" };

export interface ContoDelleLetture {
  readonly letture: number;
  readonly prese: number;
  /** Da 0 a 1. */
  readonly frequenzaOsservata: number;
  /** Da 0 a 1. */
  readonly probabilitaPromessa: number;
}

export interface Consuntivo {
  readonly calcolatoIl: string;
  readonly gare: number;
  readonly complessivo: ContoDelleLetture;
  readonly perFascia: readonly (ContoDelleLetture & { readonly fascia: string })[];
}

interface Voce {
  readonly letture?: number;
  readonly prese?: number;
  readonly frequenza_osservata?: number;
  readonly probabilita_promessa?: number;
}

/** Un conto, o `null` se l'artefatto non lo porta per intero: mezza riga non si mostra. */
function conto(voce: Voce | undefined): ContoDelleLetture | null {
  if (voce === undefined) return null;
  const { letture, prese, frequenza_osservata: osservata, probabilita_promessa: promessa } = voce;
  if (typeof letture !== "number" || typeof prese !== "number") return null;
  if (typeof osservata !== "number" || typeof promessa !== "number") return null;
  return { letture, prese, frequenzaOsservata: osservata, probabilitaPromessa: promessa };
}

/** Il consuntivo, o `null` se l'artefatto e' vecchio o incompleto. */
export function consuntivoDelleLetture(): Consuntivo | null {
  const complessivo = conto(rapporto.complessivo);
  if (complessivo === null) return null;
  const perFascia = rapporto.per_fascia
    .map((v) => {
      const c = conto(v);
      return c === null ? null : { ...c, fascia: v.fascia };
    })
    .filter((v): v is ContoDelleLetture & { fascia: string } => v !== null);
  return {
    calcolatoIl: rapporto.calcolato_il,
    gare: rapporto.gare_con_almeno_una_lettura,
    complessivo,
    perFascia,
  };
}
