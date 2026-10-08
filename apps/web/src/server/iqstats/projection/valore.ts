/**
 * La nostra probabilità combinata con quella del prezzo: logit(p') = a + b·logit(p) + c·logit(i).
 *
 * **Perché non la probabilità del motore da sola.** Misurato l'8 ottobre 2026 su 411 gare
 * chiuse e 16.978 linee quotate (`scripts/consuntivo-valore-corretto.ts`): sulle soglie del
 * banco il motore è sovraconfidente - promette 67,4% dove esce 58,4% - e il «valore» grezzo
 * era in gran parte quella sovraconfidenza. Fuori campione il prezzo prevede meglio del
 * motore (Brier 0,2216 contro 0,2260) e la combinazione meglio di entrambi (0,2206), in tutti
 * e due i periodi: il motore aggiunge informazione al prezzo, per circa un quarto. Con la
 * combinata la promessa torna alla frequenza vera; un valore positivo non è un guadagno
 * provato (resa da -0,3 a +1,1 sopra +4 punti, intervalli che contengono lo zero).
 * Coefficienti stimati sull'intero campione: rifarli quando il campione cresce.
 */
const COMBINATA = { a: -0.006, b: 0.279, c: 0.796 } as const;

export function probabilitaCombinata(prob: number, implicita: number): number {
  const logit = (p: number) => {
    const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
    return Math.log(q / (1 - q));
  };
  return 1 / (1 + Math.exp(-(COMBINATA.a + COMBINATA.b * logit(prob) + COMBINATA.c * logit(implicita))));
}

/**
 * Il valore di un lato quotato, in punti: quanto la nostra probabilità combinata di quel
 * lato (`probabilitaCombinata`) sta sopra la probabilità implicita nel suo prezzo.
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
  return Math.round((probabilitaCombinata(prob, implicita) - implicita) * 100);
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

/**
 * La probabilità implicita di un esito dentro il suo gruppo chiuso: 1X2 (tre esiti), doppia
 * chance, gol/nogol, un Over con il suo Under, un intervallo di multigol da solo.
 *
 * Stessa regola di `implicitaSoglia`, estesa ai gruppi di più esiti: con il gruppo intero il
 * margine si toglie riportando la somma delle inverse a `copertura` (1 per esiti che si
 * escludono, 2 per la doppia chance, dove ogni risultato cade in due esiti su tre); se al
 * gruppo manca un prezzo si usa `1/quota`, stima prudente. `null` senza la quota dell'esito.
 *
 * @param gruppo le quote di tutti gli esiti del gruppo, esito compreso, `null` dove mancano
 */
export function implicitaInGruppo(
  quota: number | null,
  gruppo: readonly (number | null)[],
  copertura = 1,
): number | null {
  if (quota === null || !(quota > 0)) return null;
  if (gruppo.length < 2 || gruppo.some((q) => q === null || !(q > 0))) return 1 / quota;
  const somma = gruppo.reduce<number>((s, q) => s + 1 / (q as number), 0);
  return (copertura / quota) / somma;
}

/** Il verdetto scritto accanto a un prezzo: una sola frase per tutto il dossier. */
export function testoValore(valore: number): string {
  return valore > TETTO_VALORE
    ? "valore non valutabile"
    : valore > 0 ? `valore +${valore}` : "senza valore";
}

export function implicitaSoglia(
  quotaLato: number | null,
  quotaAltro: number | null,
): number | null {
  if (quotaLato === null || !(quotaLato > 0)) return null;
  const invLato = 1 / quotaLato;
  if (quotaAltro === null || !(quotaAltro > 0)) return invLato;
  return invLato / (invLato + 1 / quotaAltro);
}
