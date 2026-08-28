/**
 * Le letture piu' forti di tutta la gara, messe in fila.
 *
 * **Perche' esiste.** I numeri di questa gara ci sono gia' tutti, ma vivono sparsi in
 * ventuno scale dentro sette card: chi apre la pagina deve confrontarli a mente per capire
 * dove il modello dice qualcosa e dove alza le spalle. Questa e' l'unica cosa che manca,
 * e non richiede un numero nuovo: richiede di ordinare quelli che ci sono.
 *
 * **Il criterio non e' la percentuale, ed e' cambiato il 28 agosto 2026.** Una lettura al
 * 77% su un bersaglio che fuori campione ci prende poco vale meno di una al 69% su un
 * bersaglio che ci prende spesso: fin qui la forza era `|probabilita - 0,5| x affidabilita`.
 *
 * **Quel `0,5` era il difetto.** La distanza dal cinquanta premia le linee lontane
 * dall'atteso, cioe' le ovvie, e non sa niente di quanto quell'evento sia normale in quella
 * lega. Misurato su 235 gare di una competizione reale: «Under 5,5 fuorigioco» stava in
 * cima al 70%, ma in quel campionato succede l'**87%** delle volte, e «Over 7,5 corner» al
 * 70% contro un **77%**. Due delle quattro letture in cima dicevano che l'evento e' **meno**
 * probabile del solito, e la pagina le mostrava come conferme.
 *
 * Ora il riferimento e' **quante volte quella linea succede davvero in quel campionato**:
 * `|probabilita - base| x affidabilita`. Il vecchio criterio non e' stato buttato, e' il
 * caso particolare in cui la base non si conosce e vale cinquanta: senza misura, l'unico
 * riferimento onesto e' la moneta.
 *
 * **Entrano solo le linee gia' accese.** La regola dell'accensione (`daAccendere`) ha
 * gia' scartato le due soglie estreme, che dicono l'ovvio, e quelle a ridosso del valore
 * atteso, dove il verso e' una moneta. Rifare qui una seconda selezione vorrebbe dire
 * avere due regole di prodotto che possono divergere: qui si riusa quella, punto.
 *
 * **Un bersaglio senza affidabilita' misurata resta fuori**, e la pagina lo dice. Non e'
 * un dettaglio: se non sappiamo quanto una lettura regge, non possiamo metterla in cima
 * a una classifica il cui titolo e' proprio «quanto regge».
 *
 * **I mercati dei gol non entrano, per ora.** Nascono da due Poisson e da una griglia, non
 * da un modello calibrato con un campione di riscontro: non hanno una quota di volte in
 * cui, fuori campione, hanno preso. Entreranno quando ne avranno una, e non prima.
 */
import { daAccendere, decisione, soglieReali, type LineaProbabile } from "./linea-scelta";
import type { Linea, ProiezioneDiGara } from "./match";

/** Sotto questa forza una lettura non merita di stare in cima a niente. */
const FORZA_MINIMA = 0.05;

/** Quante letture si mostrano. Oltre la quinta si torna a chiedere «e allora?». */
const QUANTE = 4;

export type LatoDellaGara = "casa" | "trasferta" | "totale";

export interface LetturaForte {
  /** La chiave del bersaglio del motore, per risalire a nome e tinta della famiglia. */
  readonly bersaglio: string;
  readonly lato: LatoDellaGara;
  readonly soglia: number;
  readonly verso: "Over" | "Under";
  /** La probabilita' del verso dichiarato, da 0 a 1. */
  readonly probabilita: number;
  /** Quanto il verso e' deciso: la distanza da cinquanta, da 0 a 0,5. */
  readonly decisione: number;
  /** Quante volte quel verso succede in quella lega, da 0 a 100, o `null` se non si sa. */
  readonly base: number | null;
  /** Su quante gare poggia la base. */
  readonly gareDiBase: number | null;
  /** Il punteggio di affidabilita' del bersaglio, da 0 a 100. */
  readonly affidabilita: number;
  /** Su quante gare di prova poggia quell'affidabilita'. */
  readonly righeDiProva: number;
  /** Quanto la nostra probabilita' si scosta dalla base, da 0 a 1. */
  readonly sorpresa: number;
  /** `sorpresa` per `affidabilita / 100`. E' il numero su cui si ordina. */
  readonly forza: number;
}

export interface LettureDellaGara {
  readonly letture: readonly LetturaForte[];
  /** I bersagli lasciati fuori perche' non sanno dire quanto reggono. */
  readonly senzaMisura: readonly string[];
}

/** Il verso di una linea, o `null` quando i due lati sono pari e non c'e' niente da dire. */
function versoDi(linea: Linea): { verso: "Over" | "Under"; probabilita: number } | null {
  if (linea.probabilitaSopra === linea.probabilitaSotto) return null;
  return linea.probabilitaSopra > linea.probabilitaSotto
    ? { verso: "Over", probabilita: linea.probabilitaSopra }
    : { verso: "Under", probabilita: linea.probabilitaSotto };
}

/** La linea accesa di una scala, o `null` se la scala non ne ha una. */
function accesaDi(linee: readonly Linea[] | null): Linea | null {
  if (linee === null) return null;
  const scala = soglieReali(linee);
  const scelta = daAccendere(scala as readonly LineaProbabile[]);
  if (scelta.prima < 0) return null;
  return scala[scelta.prima] ?? null;
}

/**
 * Tutte le linee accese della gara, senza ordine e senza taglio.
 *
 * Serve al chiamante per sapere **quali basi chiedere** al livello dati prima di ordinare:
 * la soglia di una linea nasce dall'atteso di questa gara, quindi non si puo' precalcolare.
 */
export function candidateDiGara(bersagli: readonly ProiezioneDiGara[]): {
  readonly candidate: readonly LetturaForte[];
  readonly senzaMisura: readonly string[];
} {
  const candidate: LetturaForte[] = [];
  const senzaMisura: string[] = [];

  for (const bersaglio of bersagli) {
    const livello = bersaglio.totale?.affidabilita ?? null;
    if (livello === null) {
      // Nessuna misura di quanto regge: fuori dalla classifica, ma dichiarato.
      senzaMisura.push(bersaglio.target);
      continue;
    }
    const scale: ReadonlyArray<{ lato: LatoDellaGara; linee: readonly Linea[] | null }> = [
      { lato: "casa", linee: bersaglio.linee.casa },
      { lato: "trasferta", linee: bersaglio.linee.trasferta },
      { lato: "totale", linee: bersaglio.totale?.linee ?? null },
    ];
    for (const { lato, linee } of scale) {
      const accesa = accesaDi(linee);
      if (accesa === null) continue;
      const v = versoDi(accesa);
      if (v === null) continue;
      candidate.push({
        bersaglio: bersaglio.target,
        lato,
        soglia: accesa.soglia,
        verso: v.verso,
        probabilita: v.probabilita,
        decisione: decisione(accesa),
        base: null,
        gareDiBase: null,
        affidabilita: livello.punteggio,
        righeDiProva: livello.righeDiProva,
        sorpresa: 0,
        forza: 0,
      });
    }
  }
  return { candidate, senzaMisura };
}

/**
 * Le letture piu' forti della gara, dalla piu' solida in giu'.
 *
 * La forza e' **quanto la nostra probabilita' si scosta da quante volte quella linea
 * succede in quel campionato**, per quanto quel bersaglio regge fuori campione. Dove la
 * base non si conosce il riferimento resta cinquanta, che e' il vecchio criterio: senza
 * misura l'unico paragone onesto e' la moneta.
 *
 * A parita' di forza vince l'affidabilita' piu' alta: fra due letture che dicono la stessa
 * cosa con la stessa sorpresa, si preferisce quella del bersaglio che sbaglia meno.
 */
export function ordinaLetture(
  candidate: readonly LetturaForte[],
  senzaMisura: readonly string[],
  basi: ReadonlyMap<string, { readonly quota: number; readonly gare: number }> | null,
  quante: number = QUANTE,
): LettureDellaGara {
  const letture = candidate
    .map((l) => {
      const b = basi?.get(chiaveDiLinea(l)) ?? null;
      const riferimento = b === null ? 0.5 : b.quota / 100;
      const sorpresa = Math.abs(l.probabilita - riferimento);
      return {
        ...l,
        base: b === null ? null : b.quota,
        gareDiBase: b === null ? null : b.gare,
        sorpresa,
        forza: sorpresa * (l.affidabilita / 100),
      };
    })
    .filter((l) => l.forza >= FORZA_MINIMA);

  letture.sort((a, b) => (b.forza - a.forza) || (b.affidabilita - a.affidabilita));

  // **Una lettura per bersaglio, e non e' una scelta estetica.** Su Bragantino contro
  // Gremio le prime quattro erano «Over 1,5 fuorigioco totale» al 81% e «Under 2,5
  // fuorigioco Gremio» al 77%: lo stesso bersaglio letto da due lati, che messe una sopra
  // l'altra fanno sembrare due informazioni dove ce n'e' una. Il lato piu' forte resta,
  // gli altri due si leggono nella card della famiglia, dove stanno accanto al loro atteso.
  const scelti = new Set<string>();
  const distinte = letture.filter((lettura) => {
    if (scelti.has(lettura.bersaglio)) return false;
    scelti.add(lettura.bersaglio);
    return true;
  });

  return { letture: distinte.slice(0, quante), senzaMisura };
}

/** La chiave con cui una linea ritrova la sua base. Deve combaciare con `base-di-lega`. */
export function chiaveDiLinea(l: {
  readonly bersaglio: string;
  readonly lato: LatoDellaGara;
  readonly soglia: number;
  readonly verso: "Over" | "Under";
}): string {
  return `${l.bersaglio}|${l.lato}|${l.soglia}|${l.verso}`;
}

/** Comodita' per chi non ha basi da passare: il criterio resta quello, col riferimento a 50. */
export function lettureForti(
  bersagli: readonly ProiezioneDiGara[],
  basi: ReadonlyMap<string, { readonly quota: number; readonly gare: number }> | null = null,
  quante: number = QUANTE,
): LettureDellaGara {
  const { candidate, senzaMisura } = candidateDiGara(bersagli);
  return ordinaLetture(candidate, senzaMisura, basi, quante);
}
