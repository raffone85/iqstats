// Server-only: l'assistente della gara, che risponde alle domande sulle linee.
//
// **Il modello capisce la domanda, i numeri li calcola il motore.** Un modello linguistico
// traduce la frase in una richiesta - quale famiglia, quale lato, quale verso, quali soglie
// - e si ferma li'. Probabilita', quota e valore escono dalle stesse funzioni che disegnano
// il dossier. E' lo stesso criterio dell'assistente di `/cerca`, voce 19 del piano: chi
// scrive la risposta puo' inventare una cifra, quindi qui il modello non ne scrive nessuna.
//
// **Quello che il modello restituisce e' un ingresso non fidato.** Passa da `leggiRichiesta`
// prima di toccare qualunque conto: una famiglia che non esiste, una soglia intera o un
// testo al posto del JSON diventano «non ho capito», non una risposta approssimata.
import "server-only";

import type { Risposta, RigaDiRisposta } from "./assistente.ts";
import type { RigaQuotata } from "./expected-famiglie.ts";
import { ARTEFATTI_DI_PRODUZIONE } from "./projection-artefatti.ts";
import { type ProiezioneDiGara, soglieDi } from "./projection/match.ts";
import { probabilitaSopra } from "./projection/predictor.ts";
import { testoValore, valoreSoglia } from "./projection/valore.ts";
import type { GolDellaGara } from "./projection-runtime.ts";
import type { Giudizio } from "./referees.ts";
import type { Voce, VociDeiGol } from "./voci-dei-gol.ts";

/** Le sette famiglie del motore, col nome che si legge in pagina. */
export const FAMIGLIE_CHIESTE = {
  total_shots: "tiri",
  shots_on_target: "tiri in porta",
  corner_kicks: "corner",
  fouls: "falli",
  yellow_cards: "cartellini gialli",
  offsides: "fuorigioco",
  goalkeeper_saves: "parate",
} as const;

export type Lato = "casa" | "trasferta" | "totale";

export interface Richiesta {
  readonly bersaglio: keyof typeof FAMIGLIE_CHIESTE;
  readonly lato: Lato;
  readonly verso: "Over" | "Under";
  /** Sempre col mezzo punto, in ordine crescente. Vuoto: «che linee ci sono?». */
  readonly soglie: readonly number[];
}

/** Oltre quattro soglie non e' una domanda, e' una tabella: quella sta gia' nel dossier. */
const SOGLIE_MASSIME = 4;

/**
 * Dal JSON del modello a una richiesta, o `null` se non lo e'.
 *
 * Lato e verso hanno un valore di ripiego dichiarato in risposta - il totale e l'Over, che
 * sono cio' che si intende quando non si dice altro. La famiglia no: senza, non si sa di
 * che cosa si sta parlando.
 */
export function leggiRichiesta(grezzo: unknown): Richiesta | null {
  if (typeof grezzo !== "object" || grezzo === null) return null;
  const r = grezzo as Record<string, unknown>;
  if (typeof r.bersaglio !== "string" || !(r.bersaglio in FAMIGLIE_CHIESTE)) return null;
  const lato: Lato = r.lato === "casa" || r.lato === "trasferta" ? r.lato : "totale";
  return {
    bersaglio: r.bersaglio as Richiesta["bersaglio"],
    lato,
    verso: r.verso === "under" ? "Under" : "Over",
    soglie: soglieDa(r.soglie),
  };
}

/** Le soglie che si possono usare: numeri col mezzo punto, senza doppioni, in ordine. */
function soglieDa(grezze: unknown): readonly number[] {
  if (!Array.isArray(grezze)) return [];
  return [...new Set(grezze.filter(
    (s): s is number => typeof s === "number" && s > 0 && s < 100 && s % 1 === 0.5,
  ))].sort((a, b) => a - b).slice(0, SOGLIE_MASSIME);
}

const MERCATI_GOL = [
  "esito", "doppia_chance", "draw_no_bet", "over_under", "gol_nogol", "multigol", "risultato",
] as const;
export type MercatoGol = (typeof MERCATI_GOL)[number];

/**
 * Una domanda letta: di che cosa parla, e con quali parametri.
 *
 * Quattro temi, uno per capitolo del dossier che sa rispondere con numeri gia' calcolati.
 * Un tema in piu' si aggiunge qui e in `ISTRUZIONI`, con la sua funzione di risposta: il
 * modello sceglie il tema, non scrive la risposta.
 */
export type Domanda =
  | ({ readonly tema: "linee" } & Richiesta)
  | {
    readonly tema: "gol";
    /** `null`: «quanti gol?», senza un mercato preciso. */
    readonly mercato: MercatoGol | null;
    readonly lato: Lato;
    readonly verso: "Over" | "Under";
    readonly soglie: readonly number[];
  }
  | { readonly tema: "arbitro" }
  | { readonly tema: "riassunto" };

/** Dal JSON del modello a una domanda, o `null` se non e' fra quelle a cui si risponde. */
export function leggiDomanda(grezzo: unknown): Domanda | null {
  if (typeof grezzo !== "object" || grezzo === null) return null;
  const r = grezzo as Record<string, unknown>;
  if (r.tema === "arbitro" || r.tema === "riassunto") return { tema: r.tema };
  if (r.tema === "gol") {
    return {
      tema: "gol",
      mercato: MERCATI_GOL.find((m) => m === r.mercato) ?? null,
      lato: r.lato === "casa" || r.lato === "trasferta" ? r.lato : "totale",
      verso: r.verso === "under" ? "Under" : "Over",
      soglie: soglieDa(r.soglie),
    };
  }
  // Senza tema ma con una famiglia vera e' una domanda sulle linee: il modello a volte
  // dimentica il campo, e la famiglia basta a non sbagliare.
  const linee = leggiRichiesta(grezzo);
  return linee === null ? null : { tema: "linee", ...linee };
}

export interface SuSoglia {
  /** La probabilita' di superare la soglia, da 0 a 1. */
  readonly sopra: number;
  readonly atteso: number;
  /** La soglia sta fuori dalle cinque su cui la calibrazione e' stata misurata. */
  readonly fuoriFinestra: boolean;
}

/**
 * La probabilita' del motore su una soglia qualunque.
 *
 * ponytail: stessa regola di `quoteDellaGara` in `scripts/expected-famiglie.ts`, che la
 * applica alle soglie del banco; li' e' privata e scrive l'artefatto di produzione. Se le
 * due copie divergono, portare questa nello script invece di correggerne una.
 */
export function probabilitaSuSoglia(
  bersaglio: ProiezioneDiGara,
  lato: Lato,
  soglia: number,
): SuSoglia | null {
  const artefatto = ARTEFATTI_DI_PRODUZIONE.get(bersaglio.target);
  if (artefatto === undefined) return null;
  if (bersaglio.casa.stato !== "prevista" || bersaglio.trasferta.stato !== "prevista") return null;

  let atteso: number;
  let distribuzione: Parameters<typeof probabilitaSopra>[0];
  let dispersione: number;
  if (lato === "totale") {
    if (bersaglio.totale === null || bersaglio.totale.linee === null) return null;
    if (artefatto.totale === null || artefatto.totale === undefined) return null;
    atteso = bersaglio.totale.valoreAtteso;
    distribuzione = artefatto.totale.distribuzione;
    dispersione = artefatto.totale.dispersione;
  } else {
    const delLato = lato === "casa" ? bersaglio.casa : bersaglio.trasferta;
    if (bersaglio.linee[lato] === null || delLato.stato !== "prevista") return null;
    atteso = delLato.valoreAtteso;
    distribuzione = artefatto.calibration.distribuzione_intervallo;
    dispersione = artefatto.calibration.dispersione;
  }

  const nostre = soglieDi(atteso);
  return {
    sopra: probabilitaSopra(distribuzione, dispersione, atteso, soglia),
    atteso,
    fuoriFinestra: soglia < nostre[0] || soglia > nostre[nostre.length - 1],
  };
}

function numero(valore: number, decimali = 1): string {
  return valore.toFixed(decimali).replace(".", ",");
}

const NON_CAPITO: Risposta = {
  capito: false,
  titolo: "Non ho capito la domanda",
  righe: [],
  collegamento: null,
  spiegazione:
    "Rispondo su questa gara: le linee di tiri, tiri in porta, corner, falli, cartellini "
    + "gialli, fuorigioco e parate; i gol, cioè esito, doppia chance, over e under, "
    + "entrambe segnano, multigol e risultato esatto; l'arbitro e quanto pesa sulle stime; "
    + "e come si presenta la gara. Per esempio: «conviene l'over 9,5 tiri della squadra "
    + "ospite?», «chi è favorito?», «com'è l'arbitro?».",
};

export const NON_DISPONIBILE: Risposta = {
  capito: false,
  titolo: "L'assistente non risponde in questo momento",
  righe: [],
  collegamento: null,
  spiegazione:
    "Non sono riuscito a leggere la domanda adesso. I numeri di questa gara restano tutti "
    + "nel dossier qui sotto: riprova fra poco.",
};

/**
 * La risposta, tutta da numeri del motore e prezzi del banco.
 *
 * @param richiesta gia' passata da `leggiRichiesta`; `null` se la domanda non e' sulle linee
 * @param quote     le linee che il banco quota su questa gara, da `quoteDiGara`
 */
export function rispostaSulleLinee(
  richiesta: Richiesta | null,
  bersagli: readonly ProiezioneDiGara[],
  quote: readonly RigaQuotata[],
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  if (richiesta === null) return NON_CAPITO;
  const { bersaglio, lato, verso } = richiesta;
  const famiglia = FAMIGLIE_CHIESTE[bersaglio];
  const diChi = lato === "totale" ? "in totale" : `di ${squadre[lato]}`;
  const titolo = `${verso} ${famiglia} ${diChi}`;

  const proiezione = bersagli.find((b) => b.target === bersaglio);
  const delBanco = quote.filter((q) => q.bersaglio === bersaglio && q.lato === lato);
  const quotaDi = (soglia: number, v: string): number | null =>
    delBanco.find((q) => q.soglia === soglia && q.verso === v)?.quota ?? null;

  // Senza soglie nella domanda si mostrano quelle che il banco ha aperto; se non ne ha
  // aperte, le cinque del motore.
  const centro = proiezione === undefined ? null : probabilitaSuSoglia(proiezione, lato, 0.5);
  const soglie = richiesta.soglie.length > 0
    ? richiesta.soglie
    : delBanco.some((q) => q.verso === verso)
      ? [...new Set(delBanco.filter((q) => q.verso === verso).map((q) => q.soglia))]
        .sort((a, b) => a - b).slice(0, SOGLIE_MASSIME)
      : centro === null ? [] : soglieDi(centro.atteso).filter((s) => s > 0);

  if (proiezione === undefined || centro === null || soglie.length === 0) {
    return {
      capito: true,
      titolo,
      righe: [],
      collegamento: null,
      spiegazione:
        `Su questa gara il motore non ha una stima dei ${famiglia} ${diChi}: senza quella non `
        + "c'è una probabilità da confrontare con un prezzo, e non ne invento una.",
    };
  }

  const altro = verso === "Over" ? "Under" : "Over";
  const righe: RigaDiRisposta[] = [];
  const frasi: string[] = [];
  const probabilita: number[] = [];
  for (const soglia of soglie) {
    const su = probabilitaSuSoglia(proiezione, lato, soglia);
    if (su === null) continue;
    const p = verso === "Over" ? su.sopra : 1 - su.sopra;
    probabilita.push(p);
    const quota = quotaDi(soglia, verso);
    const valore = quota === null ? null : valoreSoglia(p, quota, quotaDi(soglia, altro));
    const linea = `${verso} ${numero(soglia)}`;
    righe.push({
      etichetta: linea,
      valore: `${Math.round(p * 100)}%`,
      nota: [
        quota === null ? "il banco non la quota" : `quota ${numero(quota, 2)}`,
        valore === null ? null : testoValore(valore),
        su.fuoriFinestra ? "fuori dalle soglie tarate" : null,
      ].filter((x) => x !== null).join(" · "),
    });
    frasi.push(quota === null
      ? `${linea} non ha un prezzo: senza quota non si può dire se conviene.`
      : `${linea} a quota ${numero(quota, 2)}: ${testoValore(valore ?? 0)}.`);
  }

  const passo = probabilita.length < 2 ? "" : ` Da ${numero(soglie[0])} a `
    + `${numero(soglie[soglie.length - 1])} la nostra probabilità `
    + `${probabilita[probabilita.length - 1] < probabilita[0] ? "scende" : "sale"} di `
    + `${Math.abs(Math.round((probabilita[probabilita.length - 1] - probabilita[0]) * 100))} punti.`;

  return {
    capito: true,
    titolo,
    righe,
    collegamento: null,
    spiegazione:
      `Il motore attende ${numero(centro.atteso)} ${famiglia} ${diChi}. ${frasi.join(" ")}${passo}`,
  };
}

function percento(probabilita: number): string {
  return `${Math.round(probabilita * 100)}%`;
}

/** Una voce dei gol come riga: la probabilita' e' nostra, prezzo e valore sono del dossier. */
function rigaDiVoce(voce: Voce, etichetta = voce.etichetta): RigaDiRisposta {
  return {
    etichetta,
    valore: percento(voce.probabilita),
    nota: voce.quota == null
      ? "senza prezzo"
      : [`quota ${numero(voce.quota, 2)}`, voce.valore == null ? null : testoValore(voce.valore)]
        .filter((x) => x !== null).join(" · "),
  };
}

/** Oltre sei voci non e' una risposta: e' la sezione Gol, che sta gia' nel dossier. */
const VOCI_MASSIME = 6;

/**
 * La risposta sui gol, dalle stesse voci della sezione Gol.
 *
 * @param voci le voci di `vociDeiGol`, cioe' gli stessi prezzi e valori che la pagina mostra
 */
export function rispostaSuiGol(
  domanda: Extract<Domanda, { tema: "gol" }>,
  gol: GolDellaGara | null,
  voci: VociDeiGol | null,
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  if (gol === null || voci === null) {
    return {
      capito: true,
      titolo: "I gol di questa gara",
      righe: [],
      collegamento: null,
      spiegazione:
        "Su questa gara i mercati dei gol non ci sono: poggiano sui gol attesi osservati "
        + "nelle gare già giocate, e qui quel dato manca. Nessun numero viene stimato al suo posto.",
    };
  }
  const m = gol.mercati;
  const campione = `Poggia su ${gol.campioneCasa} gare in casa di ${squadre.casa} e `
    + `${gol.campioneTrasferta} fuori casa di ${squadre.trasferta}.`;
  const risposta = (titolo: string, righe: readonly RigaDiRisposta[], testo: string): Risposta => ({
    capito: true, titolo, righe, collegamento: null, spiegazione: `${testo} ${campione}`,
  });
  const attesi = `Il motore attende ${numero(m.casa.attesi, 2)} gol di ${squadre.casa} e `
    + `${numero(m.trasferta.attesi, 2)} di ${squadre.trasferta}.`;
  const nomi = [`1 · ${squadre.casa}`, "X · pareggio", `2 · ${squadre.trasferta}`];

  switch (domanda.mercato) {
    case "esito":
      return risposta("Esito finale", voci.esito.map((v, i) => rigaDiVoce(v, nomi[i])), attesi);
    case "doppia_chance":
      return risposta("Doppia chance", voci.doppia.map((v) => rigaDiVoce(v)), attesi);
    case "draw_no_bet":
      return risposta(
        "Draw no bet",
        voci.drawNoBet.map((v, i) => rigaDiVoce(v, i === 0 ? nomi[0] : nomi[2])),
        `${attesi} Il pareggio restituisce la posta, quindi resta 1 contro 2.`,
      );
    case "gol_nogol":
      return risposta(
        "Entrambe le squadre segnano",
        voci.entrambe.map((v) => rigaDiVoce(v, v.etichetta === "Sì" ? "Gol" : "No gol")),
        attesi,
      );
    case "risultato":
      return risposta(
        "Risultati esatti più probabili",
        m.risultati.slice(0, VOCI_MASSIME).map((r) => ({
          etichetta: `${r.casa}-${r.trasferta}`, valore: percento(r.probabilita), nota: null,
        })),
        attesi,
      );
    case "multigol": {
      const scelte = domanda.lato === "casa" ? voci.multiCasa
        : domanda.lato === "trasferta" ? voci.multiTrasferta : voci.multiPartita;
      const diChi = domanda.lato === "totale" ? "della gara" : `di ${squadre[domanda.lato]}`;
      return risposta(
        `Multigol ${diChi}`,
        [...scelte].sort((a, b) => b.probabilita - a.probabilita).slice(0, VOCI_MASSIME)
          .map((v) => rigaDiVoce(v)),
        `${attesi} Sono gli intervalli più probabili.`,
      );
    }
    case "over_under": {
      const linee = domanda.soglie.length === 0
        ? m.overUnder
        : m.overUnder.filter((l) => domanda.soglie.includes(l.linea));
      if (linee.length === 0) {
        return risposta(
          "Gol totali", [],
          `${attesi} Il motore calcola le linee `
          + `${m.overUnder.map((l) => numero(l.linea)).join(", ")}: quella chiesta non è fra queste.`,
        );
      }
      // Il prezzo e il valore il dossier li mostra sull'Over: sull'Under resta la probabilita'.
      const righe = domanda.verso === "Over"
        ? voci.over.filter((v) => linee.some((l) => v.etichetta === `Over ${numero(l.linea)}`))
          .map((v) => rigaDiVoce(v))
        : linee.map((l) => ({
          etichetta: `Under ${numero(l.linea)}`, valore: percento(l.sotto), nota: null,
        }));
      return risposta(
        `${domanda.verso} gol totali`, righe,
        `${attesi} In tutto ${numero(m.attesiTotali, 2)} gol attesi, fra ${m.totaliMinimo} e `
        + `${m.totaliMassimo} nella metà più probabile dei casi.`,
      );
    }
    default: {
      if (domanda.lato !== "totale") {
        const sua = domanda.lato === "casa" ? m.casa : m.trasferta;
        const nome = squadre[domanda.lato];
        return risposta(`I gol di ${nome}`, [
          { etichetta: "Gol attesi", valore: numero(sua.attesi, 2), nota: `fra ${sua.minimo} e ${sua.massimo}` },
          { etichetta: "Segna almeno un gol", valore: percento(sua.almenoUno), nota: null },
          { etichetta: "Ne segna almeno due", valore: percento(sua.almenoDue), nota: null },
        ], attesi);
      }
      const favorita = voci.esito.reduce((a, b, i) => (b.probabilita > voci.esito[a].probabilita ? i : a), 0);
      const dueEMezzo = voci.over.find((v) => v.etichetta === "Over 2,5");
      return risposta("I gol di questa gara", [
        {
          etichetta: "Gol attesi in tutto",
          valore: numero(m.attesiTotali, 2),
          nota: `fra ${m.totaliMinimo} e ${m.totaliMassimo}`,
        },
        rigaDiVoce(voci.esito[favorita], `Esito più probabile: ${nomi[favorita]}`),
        ...(dueEMezzo === undefined ? [] : [rigaDiVoce(dueEMezzo)]),
        rigaDiVoce(voci.entrambe[0], "Entrambe segnano"),
      ], attesi);
    }
  }
}

/** Cio' che il dossier sa dell'arbitro di questa gara, gia' calcolato dalla pagina. */
export interface DatiArbitro {
  /** `null` quando la fonte non l'ha ancora designato. */
  readonly nome: string | null;
  readonly profilo: {
    readonly gare: number;
    readonly media: { readonly falli: number; readonly gialli: number; readonly rossi: number };
    readonly metro: { readonly falli: number; readonly gialli: number; readonly rossi: number };
    readonly gialliControCasa: number;
    readonly gialliControTrasferta: number;
  } | null;
  /** Severo, in linea o permissivo rispetto ai colleghi dello stesso torneo. */
  readonly giudizio: Giudizio | null;
  /** Di quanto l'arbitro sposta l'atteso del motore, famiglia per famiglia: `0,08` e' +8%. */
  readonly influenza: readonly { readonly famiglia: string; readonly effetto: number }[];
}

/** L'arbitro e quanto pesa: le medie contro i colleghi, e l'effetto sulle stime del motore. */
export function rispostaSullArbitro(
  dati: DatiArbitro,
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  if (dati.nome === null) {
    return {
      capito: true,
      titolo: "L'arbitro di questa gara",
      righe: [],
      collegamento: null,
      spiegazione:
        "La fonte non ha ancora designato l'arbitro di questa gara: finché non c'è un nome "
        + "non ci sono medie da mostrare, e le stime di falli e cartellini ne tengono conto.",
    };
  }
  const p = dati.profilo;
  const righe: RigaDiRisposta[] = p === null ? [] : [
    { etichetta: "Gare osservate", valore: String(p.gare), nota: null },
    { etichetta: "Falli a gara", valore: numero(p.media.falli), nota: `colleghi ${numero(p.metro.falli)}` },
    { etichetta: "Gialli a gara", valore: numero(p.media.gialli, 2), nota: `colleghi ${numero(p.metro.gialli, 2)}` },
    { etichetta: "Rossi a gara", valore: numero(p.media.rossi, 2), nota: `colleghi ${numero(p.metro.rossi, 2)}` },
    { etichetta: "Gialli a chi gioca in casa", valore: numero(p.gialliControCasa, 2), nota: null },
    { etichetta: "Gialli a chi gioca fuori", valore: numero(p.gialliControTrasferta, 2), nota: null },
  ];
  for (const { famiglia, effetto } of dati.influenza) {
    righe.push({
      etichetta: `Effetto su ${famiglia}`,
      valore: `${effetto >= 0 ? "+" : "−"}${Math.round(Math.abs(effetto) * 100)}%`,
      nota: "sull'atteso del motore",
    });
  }
  const frasi = [
    p === null
      ? `Di ${dati.nome} non abbiamo abbastanza gare osservate in questa competizione per dare delle medie.`
      : `Le medie di ${dati.nome} sono a gara, accanto a quelle dei colleghi della stessa competizione.`,
    dati.giudizio === null ? null : `Sui cartellini è ${dati.giudizio} rispetto a loro.`,
    dati.influenza.length === 0
      ? "Sulle stime del motore per questa gara l'arbitro non sposta nessuna famiglia di più dell'1%."
      : `L'effetto è quanto la sua presenza alza o abbassa l'atteso totale di ${squadre.casa} e `
        + `${squadre.trasferta} messe insieme. È già dentro le stime del dossier: non va `
        + "sommato di nuovo.",
  ];
  return {
    capito: true,
    titolo: `L'arbitro: ${dati.nome}`,
    righe,
    collegamento: null,
    spiegazione: frasi.filter((f) => f !== null).join(" "),
  };
}

/**
 * Come si presenta la gara: le frasi del riassunto pre-gara, che il dossier scrive gia'
 * dai numeri del motore. Qui non se ne scrive nessuna.
 */
export function rispostaRiassunto(frasi: readonly string[]): Risposta {
  return {
    capito: true,
    titolo: "Come si presenta la gara",
    righe: [],
    collegamento: null,
    spiegazione: frasi.length > 0
      ? frasi.join(" ")
      : "Per questa gara non c'è un riassunto: nasce dall'artefatto di Expected, che copre "
        + "le gare dei prossimi tre giorni con una proiezione.",
  };
}

const ISTRUZIONI = `Traduci in JSON la domanda di un utente su una partita di calcio. Non rispondere alla domanda e non scrivere altro che il JSON.

Schema: {"tema": "linee"|"gol"|"arbitro"|"riassunto"|null, "bersaglio": "total_shots"|"shots_on_target"|"corner_kicks"|"fouls"|"yellow_cards"|"offsides"|"goalkeeper_saves"|null, "mercato": "esito"|"doppia_chance"|"draw_no_bet"|"over_under"|"gol_nogol"|"multigol"|"risultato"|null, "lato": "casa"|"trasferta"|"totale"|null, "verso": "over"|"under"|null, "soglie": [numeri]}

Regole:
- tema:
  - "linee": tiri, tiri in porta, corner, falli, cartellini, fuorigioco, parate delle squadre.
  - "gol": gol, chi vince, favorito, pareggio, 1X2, doppia chance, over/under gol, entrambe segnano, multigol, risultato esatto.
  - "arbitro": chi arbitra, com'e' l'arbitro, se e' severo, quanto pesa o influisce l'arbitro. Vale anche quando nomina una famiglia: "l'influenza dell'arbitro sui falli" e' "arbitro". Ma "quanti gialli in totale?" senza nominare l'arbitro resta "linee".
  - "riassunto": come si presenta la gara, che partita sara', un quadro generale, cosa consigli, il pronostico.
  - null: tutto il resto (giocatori, formazioni, meteo, classifica, altre partite, richieste che non riguardano la gara).
- mercato (solo per tema "gol", altrimenti null): chi vince o favorito o 1X2 = "esito"; 1X, X2, 12 = "doppia_chance"; draw no bet o rimborso col pareggio = "draw_no_bet"; over/under gol = "over_under"; gol/no gol o entrambe segnano = "gol_nogol"; multigol = "multigol"; risultato esatto = "risultato". null se chiede dei gol in generale ("quanti gol?", "quanti ne segna il Monza?").
- bersaglio (solo per tema "linee", altrimenti null): tiri = total_shots, tiri in porta o nello specchio = shots_on_target, corner o calci d'angolo = corner_kicks, falli = fouls, gialli o ammonizioni o cartellini = yellow_cards, fuorigioco = offsides, parate = goalkeeper_saves.
- lato: "casa" per la squadra di casa, "trasferta" per ospite o trasferta, "totale" per la gara intera. Se la domanda nomina una squadra usa i nomi dati sotto. null se non e' detto.
- verso: "over" per sopra, piu' di, almeno; "under" per sotto, meno di. null se non e' detto.
- soglie: TUTTE le soglie nominate nella domanda, anche quelle che l'utente dice assenti e quelle dette senza ripetere over o under ("c'e' il 25,5" -> 25.5). [] se non ne nomina. Ogni soglia finisce SEMPRE in .5, mai un numero intero:
  - "8.5", "8,5", "8 e mezzo" -> 8.5
  - numero intero con "piu' di", "sopra", "oltre": aggiungi 0.5. "piu' di 4 tiri" -> 4.5
  - numero intero con "almeno": togli 0.5. "almeno 5 corner" -> 4.5
  - numero intero con "meno di", "sotto": togli 0.5. "meno di 25 falli" -> 24.5
  - numero intero con "al massimo", "non piu' di": aggiungi 0.5. "al massimo 3" -> 3.5

Esempi:
"il Sassuolo fa piu' di 4 tiri in porta?" -> {"tema":"linee","bersaglio":"shots_on_target","mercato":null,"lato":"trasferta","verso":"over","soglie":[4.5]}
"meno di 25 falli nella partita?" -> {"tema":"linee","bersaglio":"fouls","mercato":null,"lato":"totale","verso":"under","soglie":[24.5]}
"l'over 6,5 corner casa non c'e', c'e' il 7,5: e' uguale?" -> {"tema":"linee","bersaglio":"corner_kicks","mercato":null,"lato":"casa","verso":"over","soglie":[6.5,7.5]}
"chi vince?" -> {"tema":"gol","bersaglio":null,"mercato":"esito","lato":null,"verso":null,"soglie":[]}
"over 2,5 gol conviene?" -> {"tema":"gol","bersaglio":null,"mercato":"over_under","lato":"totale","verso":"over","soglie":[2.5]}
"quanti gol segna la squadra di casa?" -> {"tema":"gol","bersaglio":null,"mercato":null,"lato":"casa","verso":null,"soglie":[]}
"l'arbitro e' uno che ammonisce tanto?" -> {"tema":"arbitro","bersaglio":null,"mercato":null,"lato":null,"verso":null,"soglie":[]}
"l'influenza arbitrale sui falli" -> {"tema":"arbitro","bersaglio":null,"mercato":null,"lato":null,"verso":null,"soglie":[]}
"che partita sara'?" -> {"tema":"riassunto","bersaglio":null,"mercato":null,"lato":null,"verso":null,"soglie":[]}
"chi e' il capocannoniere?" -> {"tema":null,"bersaglio":null,"mercato":null,"lato":null,"verso":null,"soglie":[]}`;

/**
 * Il modello di Groq che legge la domanda, scelto sulle domande di
 * `scripts/prova-assistente.ts`. La variabile serve a quella prova, per misurarne un altro.
 */
const MODELLO = process.env.IQSTATS_ASSISTENTE_MODELLO ?? "openai/gpt-oss-120b";

/** Oltre questa lunghezza non e' una domanda sulle linee. */
export const DOMANDA_MASSIMA = 200;

/**
 * La domanda tradotta dal modello, ancora da validare; `null` se il modello non risponde.
 *
 * ponytail: nessun tetto di richieste per utente, solo quello del piano gratuito di Groq:
 * esaurito, l'assistente dice che non risponde e il dossier resta intero. Un tetto per
 * utente serve quando l'app esce dal cantiere.
 */
export async function interpreta(
  domanda: string,
  squadre: { readonly casa: string; readonly trasferta: string },
): Promise<unknown | null> {
  const chiave = process.env.GROQ_API_KEY;
  if (!chiave) return null;
  try {
    const risposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0,
        // Il ragionamento conta nei gettoni al minuto del piano gratuito (8.000, misurato il
        // 5 ottobre 2026) e qui non serve: e' una traduzione, non un problema.
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ISTRUZIONI },
          {
            role: "user",
            content: `Squadra di casa: ${squadre.casa}. Squadra ospite: ${squadre.trasferta}.\n`
              + `Domanda: ${domanda.slice(0, DOMANDA_MASSIMA)}`,
          },
        ],
      }),
    });
    if (!risposta.ok) return null;
    const corpo = await risposta.json() as { choices?: { message?: { content?: string } }[] };
    return JSON.parse(corpo.choices?.[0]?.message?.content ?? "null") as unknown;
  } catch {
    return null;
  }
}
