// Il riassunto pre-gara: poche frasi scritte dai numeri del motore, niente di piu'.
//
// **Ogni frase ha un campo dell'artefatto dietro, e senza quel campo non si scrive.**
// Deciso con l'utente il 19 settembre 2026 su Stoke-Sheffield United: chi apre una gara
// vuole capire che partita sara' prima di leggere le tessere e le linee. Il testo non
// aggiunge letture: il consigliato resta il solo pronostico, qui viene solo nominato, e la
// sua scrittura arriva da fuori (`consiglio` in `expected-voce`) perche' ne esista una sola.
import type { GaraExpected } from "./expected-famiglie.ts";

/** Una cifra decimale con la virgola: «1,5». */
function uno(valore: number): string {
  return String(Math.round(valore * 10) / 10).replace(".", ",");
}

function per(valore: number): string {
  return `${Math.round(valore * 100)}%`;
}

function atteso(g: GaraExpected, bersaglio: string, lato: "casa" | "trasferta" | "totale"): number | null {
  return g.attesi.find((a) => a.bersaglio === bersaglio)?.[lato] ?? null;
}

/** Le frasi del riassunto, nell'ordine in cui si leggono. Vuoto se non c'e' niente da dire. */
export function frasiDellaGara(g: GaraExpected, letturaConsigliata: string | null): string[] {
  const frasi: string[] = [];
  const nostri = g.gol?.nostri ?? null;

  if (nostri !== null) {
    const { uno: p1, x, due: p2 } = nostri.esito;
    // Stessa soglia di «Che partita sara'»: sotto otto punti nessuna delle due si stacca.
    if (Math.abs(p1 - p2) < 0.08) {
      frasi.push(`Gara in equilibrio: ${per(p1)} ${g.casa}, ${per(p2)} ${g.fuori}, pareggio al ${per(x)}.`);
    } else {
      const casaAvanti = p1 > p2;
      frasi.push(
        `${casaAvanti ? g.casa : g.fuori} parte avanti. Il motore gli dà il ${per(Math.max(p1, p2))}`
        + ` contro il ${per(Math.min(p1, p2))} di ${casaAvanti ? g.fuori : g.casa}, con`
        + ` ${uno(casaAvanti ? nostri.attesiCasa : nostri.attesiTrasferta)} gol attesi contro`
        + ` ${uno(casaAvanti ? nostri.attesiTrasferta : nostri.attesiCasa)}.`,
      );
    }
    const sopra = nostri.overUnder.find((l) => l.linea === 2.5)?.sopra ?? null;
    if (sopra !== null) {
      // Cinque punti attorno alla meta': dentro, dire «pochi» o «tanti» sarebbe una forzatura.
      const tono = sopra >= 0.55 ? "Gara da tanti gol" : sopra <= 0.45 ? "Gara da pochi gol" : "Gara equilibrata sui gol";
      frasi.push(
        `${tono}: ${uno(nostri.attesiCasa + nostri.attesiTrasferta)} in tutto, più di 2,5 al`
        + ` ${per(sopra)}, entrambe a segno al ${per(nostri.gg)}.`,
      );
    }
  }

  const tiriC = atteso(g, "total_shots", "casa");
  const tiriT = atteso(g, "total_shots", "trasferta");
  const cornerC = atteso(g, "corner_kicks", "casa");
  const cornerT = atteso(g, "corner_kicks", "trasferta");
  if (tiriC !== null && tiriT !== null) {
    const corner = cornerC === null || cornerT === null ? "" : ` e ${Math.round(cornerC)} corner contro ${Math.round(cornerT)}`;
    // Il gioco lo fa chi tira almeno il 15% in piu': sotto, i due attesi non si distinguono.
    const chi = tiriC >= tiriT * 1.15 ? g.casa : tiriT >= tiriC * 1.15 ? g.fuori : null;
    frasi.push(chi === null
      ? `Tiri attesi in equilibrio: ${Math.round(tiriC)} contro ${Math.round(tiriT)}${corner}.`
      : `Il gioco dovrebbe farlo ${chi}: ${Math.round(tiriC)} tiri attesi contro ${Math.round(tiriT)}${corner}.`);
  }

  const falli = atteso(g, "fouls", "totale");
  const gialli = atteso(g, "yellow_cards", "totale");
  if (falli !== null && gialli !== null) {
    const cartellini = g.esiti?.find((e) => e.bersaglio === "yellow_cards")?.probabilita ?? null;
    const chi = cartellini === null || Math.abs(cartellini.uno - cartellini.due) < 0.05 ? ""
      : cartellini.uno > cartellini.due
        ? `, con ${g.casa} un po' più esposto al cartellino (${per(cartellini.uno)} contro ${per(cartellini.due)})`
        : `, con ${g.fuori} un po' più esposto al cartellino (${per(cartellini.due)} contro ${per(cartellini.uno)})`;
    frasi.push(`Sul piano disciplinare circa ${Math.round(falli)} falli e ${uno(gialli)} gialli in tutto${chi}.`);
  }

  if (g.consigliato !== null && letturaConsigliata !== null) {
    const c = g.consigliato;
    const scarto = c.scarto === null || c.scarto <= 0 ? ""
      : `, ${uno(c.scarto)} punti sopra la frequenza del torneo`;
    frasi.push(
      `La lettura consigliata è ${letturaConsigliata} al`
      + ` ${per(c.probabilita)}${scarto}.`,
    );
  }

  if (nostri !== null) {
    frasi.push(
      `Un limite da tenere presente: le forze poggiano su ${nostri.campioneCasa} gare in casa`
      + ` e ${nostri.campioneTrasferta} fuori.`,
    );
  }
  return frasi;
}
