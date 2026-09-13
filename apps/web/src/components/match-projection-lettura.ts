// La riga in parole semplici sopra ogni famiglia: «che gara sarà», in italiano piano.
//
// **Perché esiste.** La card porta gli attesi per lato, il totale, la scala O/U e
// l'affidabilità: tutto vero, tutto tecnico. Chi non legge una tabella vuole una frase.
// Questa la costruisce **solo** dai numeri che la card ha già — i due attesi e il totale —
// senza un metro di lega che qui non c'è: quindi non dice «molti» o «pochi», che sarebbe un
// giudizio senza riferimento, ma il totale concreto e chi delle due è avanti. Nessun dato
// inventato, nessun NaN: dove un numero manca, la frase non si scrive.

/**
 * Il sostantivo di ogni famiglia e la concordanza dell'aggettivo. Chiuso: sette bersagli.
 * `attese` solo per le parate, che sono femminili; gli altri sei sono maschili.
 */
const SOSTANTIVO: Readonly<Record<string, { readonly nome: string; readonly attesi: string }>> = {
  total_shots: { nome: "tiri", attesi: "attesi" },
  shots_on_target: { nome: "tiri in porta", attesi: "attesi" },
  corner_kicks: { nome: "corner", attesi: "attesi" },
  fouls: { nome: "falli", attesi: "attesi" },
  yellow_cards: { nome: "cartellini gialli", attesi: "attesi" },
  offsides: { nome: "fuorigioco", attesi: "attesi" },
  goalkeeper_saves: { nome: "parate", attesi: "attese" },
};

/** Sopra questo scarto relativo fra i due lati, uno è «avanti»; sotto, è equilibrio. */
const SCARTO_LEADER = 0.15;

function interoIt(n: number): string {
  return Math.round(n).toLocaleString("it-IT");
}

/**
 * La frase piana, o `null` quando non c'è abbastanza per scriverla senza inventare.
 *
 * @param target   la chiave del bersaglio (`total_shots`…)
 * @param casa     nome squadra di casa
 * @param trasferta nome squadra in trasferta
 * @param attesoCasa / attesoTrasferta / attesoTotale gli attesi già calcolati dal motore
 */
export function letturaSemplice(
  target: string,
  casa: string,
  trasferta: string,
  attesoCasa: number,
  attesoTrasferta: number,
  attesoTotale: number | null,
): string | null {
  const voce = SOSTANTIVO[target];
  if (voce === undefined) return null;
  if (!Number.isFinite(attesoCasa) || !Number.isFinite(attesoTrasferta)) return null;

  const totale = attesoTotale !== null && Number.isFinite(attesoTotale)
    ? attesoTotale
    : attesoCasa + attesoTrasferta;

  const testa = `Circa ${interoIt(totale)} ${voce.nome} ${voce.attesi}`;

  // I due numeri per lato non si ripetono qui: stanno nella tabella subito sotto. La frase
  // dice solo il totale e la tendenza, così non può contraddirla — «avanti X, 1 contro 1»
  // nasceva dall'arrotondamento, e 1+1 non torna al totale. Equilibrio anche quando i due
  // arrotondati coincidono, perché è ciò che il lettore vede nella tabella.
  const massimo = Math.max(attesoCasa, attesoTrasferta);
  const scarto = massimo === 0 ? 0 : Math.abs(attesoCasa - attesoTrasferta) / massimo;
  const arrotondatiUguali = interoIt(attesoCasa) === interoIt(attesoTrasferta);
  if (scarto < SCARTO_LEADER || arrotondatiUguali) {
    return `${testa}, equilibrio fra le due.`;
  }
  const leader = attesoCasa > attesoTrasferta ? casa : trasferta;
  return `${testa}. Avanti ${leader}.`;
}

/**
 * L'etichetta per una famiglia in ripiego: dice che è una stima preliminare e perché la
 * scaletta e l'affidabilità non ci sono ancora.
 *
 * Un ripiego è una baseline: il modello del bersaglio non ha girato, quindi non c'è un
 * intervallo calibrato né un'affidabilità misurata. Restano gli attesi, che valgono come
 * stima, ma vanno dichiarati per quello che sono. Quando il bersaglio dipende dall'arbitro
 * (falli, cartellini, tiri in porta) e l'arbitro non è ancora designato, quella è la causa
 * usuale prima della gara, e si nomina: il numero si affina alla designazione.
 *
 * @param dipendeDaArbitro il modello del bersaglio porta gli ingressi dell'arbitro
 * @param arbitroDesignato l'arbitro di questa gara è già stato designato
 */
export function etichettaPreliminare(
  dipendeDaArbitro: boolean,
  arbitroDesignato: boolean,
): string {
  if (dipendeDaArbitro && !arbitroDesignato) {
    return "Stima preliminare: l’arbitro non è ancora designato. La scaletta Over/Under "
      + "e l’affidabilità arrivano con la designazione.";
  }
  return "Stima preliminare: al modello manca un ingresso per questa gara. Resta l’atteso, "
    + "senza scaletta né affidabilità.";
}

/**
 * La nota per una famiglia che il banco non quota su questa gara, mentre ne quota altre.
 *
 * La probabilità resta nostra e sta nella scaletta; il prezzo no, perché il banco quella
 * linea non l'ha aperta. Dirlo evita la domanda «le quote dove sono?»: non mancano per un
 * difetto, il banco non le apre. Si mostra solo quando la gara ha prezzi altrove — se non
 * ne ha nessuno, lo dichiara già la riga di copertura della sezione.
 */
export function etichettaSenzaQuote(nomeFamiglia: string): string {
  return `Il banco non apre linee di ${nomeFamiglia.toLowerCase()} su questa gara: `
    + "resta la nostra probabilità, senza un prezzo accanto.";
}
