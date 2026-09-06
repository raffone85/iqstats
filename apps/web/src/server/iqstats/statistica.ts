// Le poche misure che servono a piu' sezioni, scritte una volta sola.
//
// Nasce il 2 settembre 2026 da una duplicazione vera: la mediana esisteva in `odds.ts` per
// la quota di consenso e in `ritmo.ts` per la posizione nel campionato, con due
// comportamenti diversi sul caso vuoto - una tornava `null`, l'altra `NaN`. Due copie della
// stessa funzione sono due occasioni di divergere, e la seconda era gia' divergente.
//
// Non e' un modulo di utilita' generiche e non deve diventarlo: qui entra solo cio' che
// serve davvero a piu' di un chiamante.

/** La mediana, o `null` quando non c'e' niente da mediare. Mai `NaN`. */
export function mediana(valori: readonly number[]): number | null {
  if (valori.length === 0) return null;
  const ordinati = [...valori].sort((a, b) => a - b);
  const mezzo = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 === 0
    ? (ordinati[mezzo - 1] + ordinati[mezzo]) / 2
    : ordinati[mezzo];
}
