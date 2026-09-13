/**
 * Il valore di una soglia quotata, in punti: quanto la nostra probabilità del lato più
 * probabile sta sopra la probabilità implicita nel prezzo, ripulita dal margine del banco.
 *
 * **Serve la quota di entrambi i lati.** Il margine sta nella coppia Over/Under, non in un
 * lato solo: `1/quota` da sola porta dentro la stortura del banco. Normalizzando le due
 * inverse si toglie il margine e si confronta con una probabilità onesta. `null` dove manca
 * una delle due quote: senza, non è una differenza, è un'assenza.
 *
 * Vive qui, in un modulo puro senza React, perché lo usano **due** posti che devono dare lo
 * stesso numero: il verdetto inline sulla scaletta e gli eventi di valore dell'analisi
 * finale. Scritto due volte, divergerebbe in silenzio.
 *
 * @param probLead probabilità nostra del lato più probabile, da 0 a 1
 * @param quotaLead  quota del lato più probabile
 * @param quotaAltro quota dell'altro lato
 */
export function valoreSoglia(
  probLead: number,
  quotaLead: number | null,
  quotaAltro: number | null,
): number | null {
  if (quotaLead === null || quotaAltro === null) return null;
  if (!(quotaLead > 0) || !(quotaAltro > 0) || !Number.isFinite(probLead)) return null;
  const invLead = 1 / quotaLead;
  const implicita = invLead / (invLead + 1 / quotaAltro);
  return Math.round((probLead - implicita) * 100);
}

/** La probabilità implicita del lato più probabile, ripulita dal margine, da 0 a 1, o `null`. */
export function implicitaSoglia(
  quotaLead: number | null,
  quotaAltro: number | null,
): number | null {
  if (quotaLead === null || quotaAltro === null) return null;
  if (!(quotaLead > 0) || !(quotaAltro > 0)) return null;
  const invLead = 1 / quotaLead;
  return invLead / (invLead + 1 / quotaAltro);
}
