/**
 * Gli eventi piu' probabili della gara: le letture delle famiglie e i mercati dei gol
 * ammessi, in un elenco solo.
 *
 * **Perche' esiste.** Le letture delle sette famiglie vivono in `letture-forti.ts` e i
 * mercati dei gol in `gol.ts`, ognuno con la sua forma: chi apre la gara non ha un posto
 * dove vedere, in fila, che cosa il modello si aspetta davvero. Questa funzione non calcola
 * niente di nuovo - prende i numeri che ci sono e li mette in un ordine.
 *
 * **Il criterio e' quello di produzione, esteso ai gol, e la scelta e' del 12 settembre
 * 2026 dopo la misura.** Tetto all'80%, dove il consuntivo dice che promesso e reso
 * coincidono, e **una riga per famiglia**, perche' lo stesso bersaglio letto da due lati
 * fa sembrare due informazioni dove ce n'e' una. Non si ordina per scarto dalla norma di
 * lega: misurato su 1.200 gare chiuse, quell'ordine rende 64,4% contro 66,5% promesso,
 * mentre questo rende 74,9% contro 74,8%. L'elenco resta calibrato, e la banalita' la
 * smaschera la pagina scrivendo accanto a ogni riga quanto quel campionato fa da solo.
 *
 * **Quali mercati dei gol entrano, e perche' solo quelli.** `consuntivo-gol.ts`, 1.200 gare
 * chiuse e 314 con i mercati, verso piu' probabile dentro il tetto:
 *
 * | mercato | preso su promesso | previsioni |
 * | --- | --- | ---: |
 * | multigol di partita | 65,2% su 64,8% | 1759 |
 * | over / under gol | 65,1% su 65,6% | 866 |
 * | multigol di squadra | 62,4% su 62,6% | 2158 |
 * | doppia chance | 68,0% su 69,8% | 640 |
 * | *gol / nogol* | *56,1% su 59,9%* | *312* |
 * | *esito 1X2* | *46,4% su 58,8%* | *166* |
 *
 * I due in corsivo restano fuori: il metro e' quello gia' applicato alle famiglie, dove le
 * sei buone stanno entro 3,3 punti e i falli, a 10,5, sono esclusi dalla cima. L'esito paga
 * per intero il limite che `gol.ts` dichiara di se' - due Poisson indipendenti sottostimano
 * i punteggi in parita' - e il pareggio e' uno dei suoi tre rami; il multigol no, perche'
 * e' un intervallo sul totale, e infatti e' il mercato meglio tarato di tutti.
 *
 * **Il tetto non e' una formalita' sui multigol.** Il loro intervallo piu' probabile prende
 * 89,8% su 89,6% promesso: tarato e inutile, perche' e' «fra uno e sei gol». Senza tetto
 * l'elenco si aprirebbe con quello.
 *
 * Questo file non tocca ne' la rete ne' il database: prende numeri e restituisce numeri.
 */
import type { MercatiGol } from "./gol.ts";
import type { LetturaForte } from "./letture-forti.ts";

/**
 * Oltre questa probabilita' un evento non entra. Lo stesso tetto di `letture-forti.ts`, e
 * per la stessa ragione: sopra l'80% il modello promette piu' di quanto rende.
 */
const FASCIA_MASSIMA = 0.8;

/**
 * Quante righe mostra l'elenco.
 *
 * **Numero scelto, non misurato.** Le letture delle famiglie si fermano a quattro su sette
 * candidate; qui le famiglie candidate sono undici - le sette del motore piu' i quattro
 * mercati dei gol ammessi - e sei tiene la stessa proporzione. Va verificato sull'altezza
 * della pagina, non sul conteggio.
 */
const QUANTE = 6;

/** I mercati dei gol ammessi, con l'etichetta che la pagina usa per raggrupparli. */
export const MERCATI_DI_GOL = {
  "over-under": "Gol totali",
  "multigol-partita": "Multigol",
  "multigol-squadra": "Multigol di squadra",
  "doppia-chance": "Doppia chance",
} as const;

export type MercatoDiGol = keyof typeof MERCATI_DI_GOL;

/**
 * Quanto ogni mercato ammesso ha reso, contro quanto prometteva.
 *
 * Da `scripts/projection/dataset/output/consuntivo-gol.json`, calcolato il 12 settembre 2026
 * su 1.200 gare chiuse - 314 con i mercati - contando il verso o l'intervallo piu' probabile
 * dentro il tetto dell'80%. **E' la meta' obbligatoria di ogni riga dei gol:** una famiglia
 * porta in pagina la sua affidabilita' misurata, un mercato dei gol non ne ha una per la
 * singola linea, e senza questo numero la sua riga starebbe in un elenco che dichiara
 * quanto regge senza saper dire quanto regge lei.
 *
 * Si rifa' con `npm run consuntivo-gol -- --gare 1200`.
 */
export const CONSUNTIVO_DI_MERCATO: Readonly<Record<MercatoDiGol, {
  /** La frequenza osservata, da 0 a 100. */
  readonly reso: number;
  /** La probabilita' media promessa, da 0 a 100. */
  readonly promesso: number;
  readonly previsioni: number;
}>> = {
  "multigol-partita": { reso: 65.2, promesso: 64.8, previsioni: 1759 },
  "over-under": { reso: 65.1, promesso: 65.6, previsioni: 866 },
  "multigol-squadra": { reso: 62.4, promesso: 62.6, previsioni: 2158 },
  "doppia-chance": { reso: 68.0, promesso: 69.8, previsioni: 640 },
};

/**
 * Una riga dell'elenco. Le due forme restano distinte perche' portano cose diverse: una
 * lettura di famiglia ha un'affidabilita' misurata e una norma di lega, un mercato dei gol
 * ha la sua taratura nel consuntivo ma non una norma per la singola linea.
 */
export type EventoProbabile =
  | ({ readonly da: "famiglia" } & LetturaForte)
  | {
    readonly da: "gol";
    readonly mercato: MercatoDiGol;
    /** Il verso o l'intervallo, come la pagina lo scrive: «Over 2,5», «1-3», «1X». */
    readonly voce: string;
    readonly probabilita: number;
    /** Il lato, sui mercati che ne hanno uno; `null` sui mercati di partita. */
    readonly lato: "casa" | "trasferta" | null;
  };

/** La famiglia di una riga: il bersaglio del motore, o il mercato dei gol. */
export function famigliaDi(evento: EventoProbabile): string {
  return evento.da === "famiglia" ? evento.bersaglio : evento.mercato;
}

/** La probabilita' di una riga, qualunque sia la sua forma. */
function probabilitaDi(evento: EventoProbabile): number {
  return evento.probabilita;
}

/**
 * Il verso o l'intervallo piu' probabile di un gruppo, se sta sotto il tetto.
 *
 * I mercati dei gol offrono piu' righe della stessa famiglia - quindici intervalli di
 * multigol, una coppia per ogni linea dei gol - e mostrarle tutte sarebbe ripetere la
 * stessa informazione con estremi diversi. Entra la piu' probabile fra quelle ammesse.
 */
function migliore(
  righe: readonly { readonly voce: string; readonly probabilita: number; readonly lato: "casa" | "trasferta" | null }[],
  mercato: MercatoDiGol,
): EventoProbabile | null {
  let scelta: typeof righe[number] | null = null;
  for (const riga of righe) {
    if (riga.probabilita > FASCIA_MASSIMA) continue;
    if (scelta === null || riga.probabilita > scelta.probabilita) scelta = riga;
  }
  return scelta === null ? null : { da: "gol", mercato, ...scelta };
}

/** Le righe che i quattro mercati ammessi offrono, prima del taglio. */
function righeDiGol(mercati: MercatiGol): readonly EventoProbabile[] {
  const elenco: EventoProbabile[] = [];

  const gol = migliore(
    mercati.overUnder.flatMap((l) => [
      { voce: `Over ${l.linea}`, probabilita: l.sopra, lato: null },
      { voce: `Under ${l.linea}`, probabilita: l.sotto, lato: null },
    ]),
    "over-under",
  );
  if (gol !== null) elenco.push(gol);

  const multigol = migliore(
    mercati.multigolPartita.map((i) => ({
      voce: `${i.da}-${i.a}`, probabilita: i.probabilita, lato: null,
    })),
    "multigol-partita",
  );
  if (multigol !== null) elenco.push(multigol);

  // **Una riga sola per il multigol di squadra, non una per squadra.** Due righe della
  // stessa famiglia - «casa 1-2» e «trasferta 0-1» - occuperebbero un terzo dell'elenco
  // dicendo la stessa cosa da due lati, che e' la ragione per cui le famiglie hanno una
  // riga sola. Entra il lato piu' probabile, l'altro si legge nella sezione Gol.
  const diSquadra = migliore(
    [
      ...mercati.casa.multigol.map((i) => ({
        voce: `${i.da}-${i.a}`, probabilita: i.probabilita, lato: "casa" as const,
      })),
      ...mercati.trasferta.multigol.map((i) => ({
        voce: `${i.da}-${i.a}`, probabilita: i.probabilita, lato: "trasferta" as const,
      })),
    ],
    "multigol-squadra",
  );
  if (diSquadra !== null) elenco.push(diSquadra);

  const doppia = migliore(
    [
      { voce: "1X", probabilita: mercati.doppiaChance.unoX, lato: null },
      { voce: "X2", probabilita: mercati.doppiaChance.xDue, lato: null },
      { voce: "12", probabilita: mercati.doppiaChance.unoDue, lato: null },
    ],
    "doppia-chance",
  );
  if (doppia !== null) elenco.push(doppia);

  return elenco;
}

/**
 * Gli eventi piu' probabili della gara, dal piu' probabile in giu'.
 *
 * `letture` sono quelle che `ordinaLetture` ha gia' scelto: hanno gia' il tetto, i falli
 * fuori dalla cima e una riga per bersaglio, e qui non si riapplica nessuna di quelle
 * regole. `mercati` e' `null` sulle gare dove i gol attesi non si calcolano, e allora
 * l'elenco resta di sole famiglie: **su 1.200 gare chiuse i mercati c'erano su 314**, cioe'
 * il 26,2%, quindi la pagina deve saper vivere senza.
 *
 * A parita' di punto percentuale viene prima la riga che porta una misura di quanto regge,
 * cioe' una lettura di famiglia: fra due righe che dicono la stessa cosa si preferisce
 * quella che sa dire anche quanto ci si puo' contare.
 */
export function eventiProbabili(
  letture: readonly LetturaForte[],
  mercati: MercatiGol | null,
  quante: number = QUANTE,
): readonly EventoProbabile[] {
  const famiglie: EventoProbabile[] = letture
    .filter((l) => l.probabilita <= FASCIA_MASSIMA)
    .map((l) => ({ da: "famiglia" as const, ...l }));
  const gol = mercati === null ? [] : righeDiGol(mercati);

  return [...famiglie, ...gol]
    .sort((a, b) =>
      (Math.round(probabilitaDi(b) * 100) - Math.round(probabilitaDi(a) * 100))
      || (Number(b.da === "famiglia") - Number(a.da === "famiglia"))
      || (b.da === "famiglia" && a.da === "famiglia" ? b.affidabilita - a.affidabilita : 0))
    .slice(0, quante);
}
