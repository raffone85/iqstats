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
