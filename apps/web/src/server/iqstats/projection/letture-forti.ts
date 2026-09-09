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

/** Le frequenze gia' lette dal livello dati, per linea. `null` quando non si sanno. */
type Basi = ReadonlyMap<string, { readonly quota: number; readonly gare: number }> | null;

/**
 * Oltre questa probabilita' una lettura non entra, e non e' prudenza generica.
 *
 * Il consuntivo su 1.200 gare chiuse - 599 con almeno una lettura - dice dove la taratura
 * tiene e dove cede: nella fascia 60-70% il modello promette 66,5% e rende 64,4%, nella
 * 70-80% promette 75,7% e rende 75,0%, ma sopra l'80% promette 82,4% e rende 78,9% su 660
 * candidate. La cima non si prende dove il modello sbaglia di piu': **le letture sopra
 * l'80% restano nella card della loro famiglia, non salgono in cima.**
 *
 * Il criterio e' stato scelto il 6 settembre 2026 con `npm run criterio-vetrina`, cinque a
 * confronto sulle stesse candidate. Le fasce vengono dal consuntivo rifatto il 7 settembre
 * 2026 dopo il fix dell'arbitro: i valori di prima erano di gare ricostruite senza.
 */
const FASCIA_MASSIMA = 0.8;

/**
 * I falli non salgono in cima, e la ragione e' misurata.
 *
 * Sul consuntivo rifatto il 7 settembre 2026, dopo il fix dell'arbitro, i falli promettono
 * 67,9% e rendono 57,5% su 141 letture: **dieci punti e mezzo di scarto**, dove le altre sei
 * famiglie stanno entro 3,3 - fuorigioco -3,2, corner +2,9, parate -0,0. E' la stessa forma
 * del tetto qui sopra, una lettura che promette piu' di quanto rende, e la risposta e' la
 * stessa: **restano nella card della loro famiglia, non diventano il pronostico e non
 * entrano in vetrina.**
 *
 * Il campione e' un terzo di quello dei fuorigioco, 141 contro 462, e da qui in avanti il
 * consuntivo non contera' piu' queste letture: per riaprire la decisione si toglie il
 * filtro e si rimisura.
 */
const FUORI_DALLA_CIMA = "fouls";

/** Quante letture si mostrano. Oltre la quinta si torna a chiedere «e allora?». */
const QUANTE = 4;

export type LatoDellaGara = "casa" | "trasferta" | "totale";

/**
 * Quante volte quel verso succede **nelle gare di una delle due squadre**, dal lato che
 * giochera' qui. Accanto alla base di lega, non al suo posto: la lega e' il metro del
 * campionato, questa e' il metro di chi scende in campo.
 */
export interface BaseDiSquadra {
  readonly lato: "casa" | "trasferta";
  /** Da 0 a 100. */
  readonly quota: number;
  /** Su quante gare di quella squadra, da quel lato. */
  readonly gare: number;
}

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
  /**
   * La stessa frequenza nelle gare delle squadre in campo: una voce per le linee di lato,
   * due per quelle di totale, nessuna dove il campione non regge. Non entra nella forza:
   * l'ordine resta quello dello scostamento dalla lega.
   */
  readonly squadre: readonly BaseDiSquadra[];
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
        squadre: [],
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
 * Le letture piu' forti della gara, dalla piu' probabile in giu'.
 *
 * **Il criterio e' cambiato il 6 settembre 2026, e la ragione e' misurata.** Prima ordinava
 * per forza, cioe' `|probabilita - base di lega| x affidabilita`: quella regola premia per
 * costruzione gli scostamenti piu' grandi, e su 1.200 gare chiuse portava in cima letture
 * che rendevano **63,2% contro il 65,1% promesso**, con il **44%** di esse sopra sia alla
 * base di lega sia alla storia della squadra. Ordinando per probabilita' dentro la fascia
 * dove la taratura tiene, le stesse gare danno **77,9% contro 76,6%**, il sopra-entrambe
 * scende al **25,9%** e **nessuna** lettura si scosta oltre quaranta punti dalla frequenza
 * storica delle squadre in campo.
 *
 * `sorpresa` e `forza` restano nel contratto - dicono quanto la lettura si stacca dalla
 * lega, ed e' informazione che la pagina scrive - ma non decidono piu' l'ordine.
 *
 * A parita' di probabilita' vince l'affidabilita' piu' alta: fra due letture che dicono la
 * stessa cosa, si preferisce quella del bersaglio che sbaglia meno.
 */
/**
 * Le candidate con il loro riferimento, la sorpresa e la forza, **senza filtrare niente**.
 *
 * Sta a parte da `ordinaLetture` per una ragione sola: misurare un criterio d'ordinamento
 * diverso da quello di produzione richiede l'insieme intero, non quello che la forza
 * minima ha gia' scremato. Chi vuole la vetrina passa da `ordinaLetture`; chi vuole
 * misurare un criterio alternativo parte da qui. Nessuna delle due riscrive l'altra.
 */
export function arricchisci(
  candidate: readonly LetturaForte[],
  basi: Basi,
  basiCasa: Basi = null,
  basiFuori: Basi = null,
): readonly LetturaForte[] {
  return candidate.map((l) => {
    const chiave = chiaveDiLinea(l);
    const b = basi?.get(chiave) ?? null;
    const riferimento = b === null ? 0.5 : b.quota / 100;
    const sorpresa = Math.abs(l.probabilita - riferimento);
    // Una linea di lato riguarda una squadra sola; una di totale le riguarda entrambe.
    const squadre: BaseDiSquadra[] = [];
    const dellaCasa = l.lato === "trasferta" ? undefined : basiCasa?.get(chiave);
    if (dellaCasa !== undefined) squadre.push({ lato: "casa", ...dellaCasa });
    const dellaFuori = l.lato === "casa" ? undefined : basiFuori?.get(chiave);
    if (dellaFuori !== undefined) squadre.push({ lato: "trasferta", ...dellaFuori });
    return {
      ...l,
      base: b === null ? null : b.quota,
      gareDiBase: b === null ? null : b.gare,
      squadre,
      sorpresa,
      forza: sorpresa * (l.affidabilita / 100),
    };
  });
}

export function ordinaLetture(
  candidate: readonly LetturaForte[],
  senzaMisura: readonly string[],
  basi: Basi,
  basiCasa: Basi = null,
  basiFuori: Basi = null,
  quante: number = QUANTE,
): LettureDellaGara {
  const letture = arricchisci(candidate, basi, basiCasa, basiFuori)
    .filter((l) => l.probabilita <= FASCIA_MASSIMA && l.bersaglio !== FUORI_DALLA_CIMA)
    .slice()
    // **L'ordine e' per punto percentuale, non per decimale.** Con il tetto all'ottanta le
    // prime letture si schiacciano contro il tetto: sulla vetrina del 6 settembre le dieci
    // in cima andavano da 0,7997 a 0,7956, cioe' tutte 80% una volta scritte, e ordinarle
    // per quel quarto decimale sarebbe stato ordinare del rumore. A parita' di punto
    // decide l'affidabilita', che e' una differenza che si vede e si spiega.
    .sort((a, b) =>
      (Math.round(b.probabilita * 100) - Math.round(a.probabilita * 100))
      || (b.affidabilita - a.affidabilita));

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
  basi: Basi = null,
  quante: number = QUANTE,
): LettureDellaGara {
  const { candidate, senzaMisura } = candidateDiGara(bersagli);
  return ordinaLetture(candidate, senzaMisura, basi, null, null, quante);
}
