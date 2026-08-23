/**
 * Quale delle cinque soglie merita di essere accesa, e quale la segue da vicino.
 *
 * Sta in un modulo suo, e non dentro il componente, per una ragione sola: e' una regola
 * di prodotto con dei numeri dentro, e una regola con dei numeri dentro va provata.
 *
 * **Il criterio: la piu' robusta fra le vicine, mai la piu' ovvia.** Su cinque soglie
 * costruite attorno al valore atteso, le due estreme dicono quasi sempre la cosa scontata
 * — con un atteso di 9,3 «Over 6,5 al 75%» non e' una lettura solida, e' la constatazione
 * che la soglia sta lontana. Restano le tre centrali: fra quelle si accende la soglia su
 * cui il verso e' piu' deciso, cioe' quella la cui probabilita' si allontana di piu' dal
 * cinquanta. A ridosso del valore previsto il verso e' una moneta, e una moneta non e' una
 * lettura.
 *
 * La seconda si accende solo quando dista meno di tre punti dalla prima: sotto quella
 * soglia il modello non sa distinguerle, e mostrarne una sola fingerebbe una preferenza
 * che i numeri non danno.
 */

/** Il minimo scarto che rende due letture distinguibili. Sotto, si accendono entrambe. */
const QUASI_UGUALI = 0.03;

export interface LineaProbabile {
  readonly soglia: number;
  readonly probabilitaSopra: number;
  readonly probabilitaSotto: number;
}

export interface Accensione {
  /** L'indice della linea accesa, oppure -1 se non ce ne sono abbastanza. */
  readonly prima: number;
  /** L'indice della seconda, tenue, oppure `null`. */
  readonly seconda: number | null;
}

/**
 * Quanto il verso di una linea e' deciso: la distanza da cinquanta.
 *
 * Zero e' una moneta, cinquanta e' una certezza. Ha senso solo confrontata fra linee
 * vicine al valore atteso: su una soglia lontana un numero alto viene dalla distanza.
 */
export function decisione(linea: LineaProbabile): number {
  return Math.abs(linea.probabilitaSopra - 0.5);
}

/** La linea da accendere e l'eventuale seconda quasi identica. */
export function daAccendere(linee: readonly LineaProbabile[]): Accensione {
  // Con meno di tre soglie non esistono «le centrali»: non si accende niente invece di
  // accendere l'unica che c'e' e farla sembrare una scelta.
  if (linee.length < 3) return { prima: -1, seconda: null };

  const primo = 1;
  const ultimo = linee.length - 2;
  let prima = primo;
  for (let i = primo; i <= ultimo; i += 1) {
    if (decisione(linee[i]) > decisione(linee[prima])) prima = i;
  }

  let seconda: number | null = null;
  for (let i = primo; i <= ultimo; i += 1) {
    if (i === prima) continue;
    if (Math.abs(decisione(linee[i]) - decisione(linee[prima])) >= QUASI_UGUALI) continue;
    if (seconda === null || decisione(linee[i]) > decisione(linee[seconda])) seconda = i;
  }

  return { prima, seconda };
}
