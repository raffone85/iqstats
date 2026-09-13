/**
 * Il valore di un lato quotato, in punti: quanto la nostra probabilità di quel lato sta
 * sopra la probabilità implicita nel suo prezzo.
 *
 * **Due lati → si toglie il margine; un lato solo → quota grezza.** Il margine sta nella
 * coppia Over/Under: quando ci sono entrambe le quote, normalizzare le due inverse lo
 * elimina e dà una probabilità onesta. Quando il banco apre **un lato solo** — il caso più
 * comune sui tiri, dove lista solo l'Over — si usa `1/quota`, che il margine lo tiene
 * dentro: è una stima **prudente**, il valore che ne esce è un minimo, non gonfiato.
 * `null` solo dove manca la quota di quel lato: senza prezzo non c'è niente da confrontare.
 *
 * @param prob       probabilità nostra del lato quotato, da 0 a 1
 * @param quotaLato  quota di quel lato
 * @param quotaAltro quota dell'altro lato, o `null` se il banco non lo apre
 */
export function valoreSoglia(
  prob: number,
  quotaLato: number | null,
  quotaAltro: number | null,
): number | null {
  const implicita = implicitaSoglia(quotaLato, quotaAltro);
  if (implicita === null || !Number.isFinite(prob)) return null;
  return Math.round((prob - implicita) * 100);
}

/**
 * La probabilità implicita del lato quotato, da 0 a 1, o `null` senza la sua quota.
 * Ripulita dal margine quando c'è anche l'altro lato; grezza (`1/quota`) quando è solo uno.
 */
/**
 * Oltre questi punti il valore non è credibile: un divario così grande, di solito su un
 * mercato di nicchia quotato a un lato solo, dice che il prezzo è pigro o che la nostra
 * probabilità è fuori scala, non che c'è un affare. Sopra il tetto si mostra la quota ma
 * non si dichiara un valore. Un valore vero è modesto.
 */
export const TETTO_VALORE = 15;

export function implicitaSoglia(
  quotaLato: number | null,
  quotaAltro: number | null,
): number | null {
  if (quotaLato === null || !(quotaLato > 0)) return null;
  const invLato = 1 / quotaLato;
  if (quotaAltro === null || !(quotaAltro > 0)) return invLato;
  return invLato / (invLato + 1 / quotaAltro);
}
