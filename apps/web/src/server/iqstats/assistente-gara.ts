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
import { inCache } from "./lettura.ts";
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
export function leggiRichiesta(grezzo: unknown, domanda = ""): Richiesta | null {
  if (typeof grezzo !== "object" || grezzo === null) return null;
  const r = grezzo as Record<string, unknown>;
  if (typeof r.bersaglio !== "string" || !(r.bersaglio in FAMIGLIE_CHIESTE)) return null;
  const lato: Lato = r.lato === "casa" || r.lato === "trasferta" ? r.lato : "totale";
  return {
    bersaglio: r.bersaglio as Richiesta["bersaglio"],
    lato,
    verso: r.verso === "under" ? "Under" : "Over",
    soglie: soglieDa(r.soglie, domanda),
  };
}

/** Le parole che dicono da che parte sta la mezza soglia di un numero intero. */
const MEZZO_SOPRA = "piu di|sopra|oltre|al massimo|massimo|non piu di";
const MEZZO_SOTTO = "almeno|minimo|meno di|sotto";

/**
 * Un numero intero diventa una soglia leggendo la domanda, non chiedendolo al modello.
 *
 * **Il conto lo fa il codice.** «Piu' di 4» e' 4,5 e «almeno 5» e' anch'esso 4,5: il modello
 * di riserva, misurato il 5 ottobre 2026, sbagliava questo mezzo punto due volte su 64 e in
 * un caso spostava una soglia gia' giusta. Ora il modello ripete il numero come e' scritto
 * e la parola che lo precede decide il mezzo punto. Senza quella parola il numero non e'
 * una soglia e si butta: meglio mostrare le linee che ci sono che inventarne una.
 */
function mezzaSoglia(intero: number, domanda: string): number | null {
  const testo = domanda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f']/g, "");
  const prima = (parole: string) =>
    new RegExp(`(?:${parole})\\s+(?:i\\s+|gli\\s+|le\\s+)?${intero}(?!\\d|[.,]\\d)`).test(testo);
  if (prima(MEZZO_SOPRA)) return intero + 0.5;
  if (prima(MEZZO_SOTTO)) return intero - 0.5;
  return null;
}

/** Le soglie che si possono usare: col mezzo punto, senza doppioni, in ordine. */
function soglieDa(grezze: unknown, domanda: string): readonly number[] {
  if (!Array.isArray(grezze)) return [];
  const soglie = grezze
    .filter((s): s is number => typeof s === "number")
    .map((s) => (s % 1 === 0.5 ? s : Number.isInteger(s) ? mezzaSoglia(s, domanda) : null))
    .filter((s): s is number => s !== null && s > 0 && s < 100);
  return [...new Set(soglie)].sort((a, b) => a - b).slice(0, SOGLIE_MASSIME);
}

const MERCATI_GOL = [
  "esito", "doppia_chance", "draw_no_bet", "over_under", "gol_nogol", "multigol", "risultato",
] as const;
export type MercatoGol = (typeof MERCATI_GOL)[number];

/**
 * Una domanda letta: di che cosa parla, e con quali parametri.
 *
 * Un tema per capitolo del dossier che sa rispondere con numeri gia' calcolati.
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
  | { readonly tema: "riassunto" }
  | {
    readonly tema: "giocatori";
    /** `null`: «chi sono i giocatori da guardare?», tutte e due le letture. */
    readonly aspetto: "marcatori" | "cartellini" | null;
    readonly lato: Lato;
  }
  | { readonly tema: "formazioni"; readonly indisponibili: boolean; readonly lato: Lato }
  | { readonly tema: "classifica" | "forma" | "precedenti" }
  | {
    readonly tema: "perche";
    /** `null`: «su che cosa si basano le stime?», senza una famiglia precisa. */
    readonly bersaglio: keyof typeof FAMIGLIE_CHIESTE | null;
    readonly lato: Lato;
  };

/** Dal JSON del modello a una domanda, o `null` se non e' fra quelle a cui si risponde. */
export function leggiDomanda(grezzo: unknown, domanda = ""): Domanda | null {
  if (typeof grezzo !== "object" || grezzo === null) return null;
  const r = grezzo as Record<string, unknown>;
  if (r.tema === "arbitro" || r.tema === "riassunto") return { tema: r.tema };
  if (r.tema === "classifica" || r.tema === "forma" || r.tema === "precedenti") return { tema: r.tema };
  const lato: Lato = r.lato === "casa" || r.lato === "trasferta" ? r.lato : "totale";
  if (r.tema === "giocatori") {
    const aspetto = r.aspetto === "marcatori" || r.aspetto === "cartellini" ? r.aspetto : null;
    return { tema: "giocatori", aspetto, lato };
  }
  if (r.tema === "formazioni") {
    return { tema: "formazioni", indisponibili: r.aspetto === "indisponibili", lato };
  }
  if (r.tema === "perche") {
    const bersaglio = typeof r.bersaglio === "string" && r.bersaglio in FAMIGLIE_CHIESTE
      ? r.bersaglio as keyof typeof FAMIGLIE_CHIESTE
      : null;
    return { tema: "perche", bersaglio, lato };
  }
  if (r.tema === "gol") {
    return {
      tema: "gol",
      mercato: MERCATI_GOL.find((m) => m === r.mercato) ?? null,
      lato,
      verso: r.verso === "under" ? "Under" : "Over",
      soglie: soglieDa(r.soglie, domanda),
    };
  }
  // Senza tema ma con una famiglia vera e' una domanda sulle linee: il modello a volte
  // dimentica il campo, e la famiglia basta a non sbagliare.
  const linee = leggiRichiesta(grezzo, domanda);
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
    + "i giocatori che possono segnare o prendere il giallo, le formazioni e gli assenti; "
    + "classifica, forma e precedenti; da che cosa nasce una stima; e come si presenta la "
    + "gara. Per esempio: «conviene "
    + "l'over 9,5 tiri della squadra ospite?», «chi è favorito?», «chi può segnare?».",
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

/** Un candidato della lettura giocatori: solo cio' che la risposta mostra. */
export interface CandidatoChiesto {
  readonly nome: string;
  readonly squadra: string;
  /** Da 0 a 1: la probabilita' tarata che la sezione Giocatori mostra in grande. */
  readonly stima: number;
  readonly fattore: string;
  readonly valore: number;
  /** Di quanti punti la stima puo' sbagliare. */
  readonly incertezza: number;
  readonly gare: number;
}

/** Oltre cinque nomi e' la sezione Giocatori, non una risposta. */
const NOMI_MASSIMI = 5;

/**
 * Chi puo' segnare e chi rischia il giallo, dalla lettura giocatori del dossier.
 *
 * @param lettura `null` dove il dossier non ha la sezione: senza undici attesi o senza la
 *                tabella di base del campionato
 */
export function rispostaSuiGiocatori(
  domanda: Extract<Domanda, { tema: "giocatori" }>,
  lettura: {
    readonly marcatori: readonly CandidatoChiesto[];
    readonly cartellini: readonly CandidatoChiesto[];
  } | null,
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  const titolo = domanda.aspetto === "cartellini" ? "Chi rischia il giallo"
    : domanda.aspetto === "marcatori" ? "Chi può segnare" : "I giocatori da guardare";
  if (lettura === null) {
    return {
      capito: true, titolo, righe: [], collegamento: null,
      spiegazione:
        "Su questa gara non c'è una lettura per giocatore: nasce dagli undici attesi e dalla "
        + "tabella del campionato, e qui manca una delle due. Nessun nome viene indicato a caso.",
    };
  }
  const squadra = domanda.lato === "totale" ? null : squadre[domanda.lato];
  const scelti = (candidati: readonly CandidatoChiesto[], quanti: number, cosa: string) =>
    candidati.filter((c) => squadra === null || c.squadra === squadra).slice(0, quanti)
      .map((c): RigaDiRisposta => ({
        etichetta: `${c.nome} · ${cosa}`,
        valore: percento(c.stima),
        nota: `${c.squadra} · ${numero(c.valore)} ${c.fattore} ogni 90' su ${c.gare} gare · `
          + `±${numero(c.incertezza)} punti`,
      }));
  const righe = domanda.aspetto === "marcatori" ? scelti(lettura.marcatori, NOMI_MASSIMI, "gol")
    : domanda.aspetto === "cartellini" ? scelti(lettura.cartellini, NOMI_MASSIMI, "giallo")
      : [...scelti(lettura.marcatori, 3, "gol"), ...scelti(lettura.cartellini, 3, "giallo")];
  return {
    capito: true, titolo, righe, collegamento: null,
    spiegazione: righe.length === 0
      ? `Nessun giocatore${squadra === null ? "" : ` di ${squadra}`} supera il proprio ruolo di più `
        + "di quanto la stima sappia sbagliare: non c'è un nome da indicare."
      : "Sono i nomi in testa alla sezione Giocatori, fra gli undici attesi. La percentuale è "
        + "la stima tarata; accanto c'è il numero che l'ha scelto e di quanto può sbagliare. "
        + "Se l'undici cambia, cambia anche l'elenco.",
  };
}

/** Le due formazioni come il dossier le ha lette: solo cio' che la risposta mostra. */
export interface FormazioniChieste {
  readonly ufficiali: boolean;
  /** La fonte dichiara in prova l'elenco degli indisponibili. */
  readonly inProva: boolean;
  readonly casa: LatoDiFormazione | null;
  readonly trasferta: LatoDiFormazione | null;
}

interface LatoDiFormazione {
  readonly modulo: string | null;
  readonly titolari: readonly string[];
  readonly indisponibili: readonly {
    readonly nome: string;
    readonly stato: string;
    readonly motivo: string | null;
  }[];
}

/** Gli undici e chi manca. Nessuno di questi nomi entra in una stima, e la risposta lo dice. */
export function rispostaSulleFormazioni(
  domanda: Extract<Domanda, { tema: "formazioni" }>,
  formazioni: FormazioniChieste | null,
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  const titolo = domanda.indisponibili ? "Chi manca" : "Le formazioni";
  const lati = (["casa", "trasferta"] as const)
    .filter((lato) => domanda.lato === "totale" || domanda.lato === lato)
    .map((lato) => ({ nome: squadre[lato], dati: formazioni?.[lato] ?? null }));
  if (formazioni === null || lati.every((l) => l.dati === null)) {
    return {
      capito: true, titolo, righe: [], collegamento: null,
      spiegazione: "La fonte non ha ancora le formazioni di questa gara: né previste né ufficiali.",
    };
  }
  if (domanda.indisponibili) {
    const righe = lati.flatMap((l) => (l.dati?.indisponibili ?? []).map((i): RigaDiRisposta => ({
      etichetta: i.nome, valore: i.stato, nota: [l.nome, i.motivo].filter((x) => x !== null).join(" · "),
    })));
    return {
      capito: true, titolo, righe, collegamento: null,
      spiegazione: (righe.length === 0 ? "La fonte non segnala assenti. " : "")
        + (formazioni.inProva
          ? "L'elenco arriva da una parte della fonte dichiarata in prova: può essere incompleto "
            + "o non aggiornato, e non entra in nessuna stima. Chi manca senza comparire qui non "
            + "è detto che ci sia."
          : "L'elenco non entra in nessuna stima di questa pagina."),
    };
  }
  return {
    capito: true, titolo, collegamento: null,
    righe: lati.filter((l) => l.dati !== null).map((l): RigaDiRisposta => ({
      etichetta: l.nome,
      valore: l.dati?.modulo ?? "modulo non dichiarato",
      nota: (l.dati?.titolari ?? []).join(", "),
    })),
    spiegazione: formazioni.ufficiali
      ? "Sono le formazioni ufficiali."
      : "Sono le formazioni previste dalla fonte, non ancora ufficiali: possono cambiare fino al fischio.",
  };
}

/** Una riga di classifica: solo cio' che la risposta mostra. */
export interface RigaDiClassifica {
  readonly position: number;
  readonly played: number | null;
  readonly won: number | null;
  readonly drawn: number | null;
  readonly lost: number | null;
  readonly goalsFor: number | null;
  readonly goalsAgainst: number | null;
  readonly points: number | null;
}

/** Dove stanno le due squadre. Un campo che la fonte non porta resta fuori, non diventa zero. */
export function rispostaSullaClassifica(
  classifica: {
    readonly home: RigaDiClassifica | null;
    readonly away: RigaDiClassifica | null;
    readonly teams: number;
    readonly seasonName: string;
  } | null,
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  const riga = (nome: string, r: RigaDiClassifica | null): RigaDiRisposta[] => (r === null ? [] : [{
    etichetta: nome,
    valore: `${r.position}ª`,
    nota: [
      r.points === null ? null : `${r.points} punti`,
      r.played === null ? null : `${r.played} giocate`,
      r.won === null || r.drawn === null || r.lost === null ? null : `${r.won} V ${r.drawn} N ${r.lost} P`,
      r.goalsFor === null || r.goalsAgainst === null ? null : `gol ${r.goalsFor}-${r.goalsAgainst}`,
    ].filter((x) => x !== null).join(" · "),
  }]);
  const righe = classifica === null ? []
    : [...riga(squadre.casa, classifica.home), ...riga(squadre.trasferta, classifica.away)];
  return {
    capito: true, titolo: "La classifica", righe, collegamento: null,
    spiegazione: classifica === null || righe.length === 0
      ? "Per questa gara non c'è una classifica da leggere: nelle coppe la tabella è a gironi, "
        + "e una squadra può non esserci."
      : `Su ${classifica.teams} squadre, ${classifica.seasonName}.`,
  };
}

/** Una gara giocata, come la mostra la forma del dossier. */
export interface GaraDiForma {
  readonly opponent: string;
  readonly atHome: boolean;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly outcome: "V" | "N" | "P";
}

/** Le ultime gare davvero giocate dalle due squadre, la piu' recente per prima. */
export function rispostaSullaForma(
  casa: readonly GaraDiForma[] | null,
  trasferta: readonly GaraDiForma[] | null,
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  const riga = (nome: string, gare: readonly GaraDiForma[] | null): RigaDiRisposta[] =>
    (gare === null || gare.length === 0 ? [] : [{
      etichetta: nome,
      valore: gare.map((g) => g.outcome).join(" "),
      nota: gare.map((g) => `${g.goalsFor}-${g.goalsAgainst} ${g.atHome ? "in casa" : "fuori"} con ${g.opponent}`)
        .join(" · "),
    }]);
  const righe = [...riga(squadre.casa, casa), ...riga(squadre.trasferta, trasferta)];
  return {
    capito: true, titolo: "La forma", righe, collegamento: null,
    spiegazione: righe.length === 0
      ? "La fonte non ha gare giocate di recente da queste due squadre."
      : "Sono le ultime gare giocate, la più recente per prima, in qualunque competizione: "
        + "V vinta, N pareggiata, P persa. È un elenco, non una stima.",
  };
}

/** I precedenti fra le due squadre, come li registra la fonte. */
export function rispostaSuiPrecedenti(
  precedenti: {
    readonly totalMatches: number | null;
    readonly homeWins: number | null;
    readonly draws: number | null;
    readonly awayWins: number | null;
    readonly avgTotalGoals: number | null;
    readonly recent: readonly {
      readonly date: string | null;
      readonly home: string | null;
      readonly away: string | null;
      readonly score: string | null;
    }[];
  } | null,
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  if (precedenti === null || !precedenti.totalMatches) {
    return {
      capito: true, titolo: "I precedenti", righe: [], collegamento: null,
      spiegazione: "La fonte non registra precedenti fra queste due squadre.",
    };
  }
  const p = precedenti;
  const quanti = precedenti.totalMatches;
  const righe: RigaDiRisposta[] = [
    { etichetta: `Vittorie ${squadre.casa}`, valore: String(p.homeWins ?? 0), nota: null },
    { etichetta: "Pareggi", valore: String(p.draws ?? 0), nota: null },
    { etichetta: `Vittorie ${squadre.trasferta}`, valore: String(p.awayWins ?? 0), nota: null },
  ];
  if (p.avgTotalGoals !== null) {
    righe.push({ etichetta: "Gol medi a gara", valore: numero(p.avgTotalGoals), nota: null });
  }
  const ultimi = p.recent.slice(0, 3)
    .filter((g) => g.home !== null && g.away !== null && g.score !== null)
    .map((g) => `${g.home} ${g.score} ${g.away}`);
  return {
    capito: true, titolo: "I precedenti", righe, collegamento: null,
    spiegazione: `Su ${quanti} precedenti registrati dalla fonte.`
      + (ultimi.length === 0 ? "" : ` Gli ultimi: ${ultimi.join("; ")}.`)
      + (quanti < 4 ? " Sono pochi: da soli non dicono niente su questa gara." : ""),
  };
}

/** Di che cosa sono fatte le stime, detto una volta: sono i gruppi di `cause.ts`. */
const INGRESSI_DEL_MOTORE =
  "Ogni stima nasce da quanto la squadra produce e subisce in stagione e nelle ultime gare, "
  + "da quanto produce e concede l'avversario, dall'incrocio fra l'attacco dell'una e la "
  + "difesa dell'altra, dal fattore campo, dalla norma del campionato e, dove il modello li "
  + "usa, dall'arbitro, dagli undici attesi e dalla classifica. Non entrano le quote del "
  + "banco, il meteo e l'elenco degli assenti.";

/** Da dove viene il valore di un lato: il modello, una miscela col ripiego, o il ripiego. */
export type OrigineDellaStima = "modello" | "miscela" | "ripiego";

/**
 * Perche' il motore attende quel numero: le cause che pesano di piu', con il loro segno.
 *
 * @param cause  le cause di `causeDellaLettura` sullo stesso lato, dalla piu' grande
 * @param stima  `null` dove il motore non ha una stima di quella famiglia su quel lato
 */
export function rispostaSulPerche(
  domanda: Extract<Domanda, { tema: "perche" }>,
  stima: { readonly atteso: number; readonly origine: OrigineDellaStima } | null,
  cause: readonly { readonly nome: string; readonly effetto: number }[],
  squadre: { readonly casa: string; readonly trasferta: string },
): Risposta {
  if (domanda.bersaglio === null) {
    return {
      capito: true, titolo: "Da che cosa nascono le stime", righe: [], collegamento: null,
      spiegazione: `${INGRESSI_DEL_MOTORE} Chiedi di una famiglia - «perché tanti falli?», `
        + "«da cosa dipendono i tiri dell'ospite?» - per vedere che cosa pesa in questa gara.",
    };
  }
  const famiglia = FAMIGLIE_CHIESTE[domanda.bersaglio];
  const diChi = domanda.lato === "totale" ? "in totale" : `di ${squadre[domanda.lato]}`;
  const titolo = `Perché ${famiglia} ${diChi}`;
  if (stima === null) {
    return {
      capito: true, titolo, righe: [], collegamento: null,
      spiegazione: `Su questa gara il motore non ha una stima dei ${famiglia} ${diChi}, quindi `
        + "non c'è un numero da spiegare.",
    };
  }
  const righe = cause.map((c): RigaDiRisposta => ({
    etichetta: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
    valore: `${c.effetto >= 0 ? "+" : "−"}${Math.round(Math.abs(c.effetto) * 100)}%`,
    nota: c.effetto >= 0 ? "alza l'atteso" : "abbassa l'atteso",
  }));
  const daDove = stima.origine === "modello" ? ""
    : stima.origine === "miscela"
      ? " Il numero mescola il modello con una stima di ripiego, perché la storia di una delle due squadre è corta."
      : " Il numero viene da una stima di ripiego e non dal modello: manca un ingresso che gli serve, di solito l'arbitro o abbastanza gare.";
  return {
    capito: true, titolo, righe, collegamento: null,
    spiegazione: `Il motore attende ${numero(stima.atteso)} ${famiglia} ${diChi}.`
      + (righe.length === 0
        ? " Nessuna causa sposta il numero di più dell'1%: sta vicino a quello che queste squadre fanno di solito."
        : " Sono le cause che pesano di più, ognuna con quanto alza o abbassa quel numero "
          + "rispetto a una gara media: sono già dentro la stima, non vanno sommate.")
      + daDove,
  };
}

/**
 * Le istruzioni al modello, tenute corte di proposito.
 *
 * **Ogni parola qui si paga a ogni domanda.** Il piano gratuito di Groq da' 200.000 gettoni
 * al giorno per modello (misurato il 5 ottobre 2026, quando le prove li hanno esauriti): con
 * le istruzioni lunghe una domanda ne costava 2.060, cioe' meno di cento domande al giorno.
 * I campi che non servono si omettono per la stessa ragione, e `leggiDomanda` li ripiega.
 */
const ISTRUZIONI = `Traduci in JSON la domanda di un utente su una partita di calcio. Scrivi solo il JSON, non rispondere alla domanda. Ometti i campi che non servono.

Campi:
- tema: linee | gol | arbitro | riassunto | giocatori | formazioni | classifica | forma | precedenti | perche | null
- bersaglio (linee e perche): total_shots (tiri) | shots_on_target (tiri in porta, nello specchio) | corner_kicks (corner, calci d'angolo) | fouls (falli) | yellow_cards (gialli, ammonizioni, cartellini) | offsides (fuorigioco) | goalkeeper_saves (parate)
- mercato (solo gol): esito (chi vince, favorito, pareggio, 1X2) | doppia_chance (1X, X2, 12) | draw_no_bet | over_under (over o under gol) | gol_nogol (entrambe segnano) | multigol | risultato (risultato esatto). Omesso se chiede dei gol in generale.
- aspetto: marcatori | cartellini (solo giocatori) | indisponibili (solo formazioni: assenti, infortunati, squalificati, chi manca)
- lato: casa | trasferta (ospite) | totale. Se la domanda nomina una squadra usa i nomi dati sotto.
- verso: over (sopra, piu' di, almeno, oltre) | under (sotto, meno di, al massimo)
- soglie: tutti i numeri di soglia nominati, anche quelli detti assenti o senza ripetere over/under, COSI' COME SONO DETTI, senza fare conti: "8,5" o "8 e mezzo" -> 8.5; "piu' di 4" -> 4; "almeno 5" -> 5; "under 4,5" -> 4.5.

Temi:
- linee: statistiche di squadra (tiri, corner, falli, cartellini, fuorigioco, parate), anche senza soglia: "quanti gialli prende il Monza?".
- gol: gol, esito, favorito, mercati dei gol.
- arbitro: chi arbitra, se e' severo, quanto pesa o influisce, anche quando nomina una famiglia.
- riassunto: che partita sara', quadro generale, cosa consigli, pronostico.
- giocatori: chi segna, marcatori, quale giocatore rischia il giallo, giocatori da guardare.
- formazioni: undici, titolari, modulo, chi gioca, chi manca.
- classifica: posizione, punti. forma: come arrivano le squadre, ultimi risultati. precedenti: scontri diretti, l'ultima volta fra le due.
- perche: perche' una stima e' alta o bassa, da cosa dipende, su cosa si basa; col bersaglio se nomina una famiglia.
- null: meteo, stadio, altre partite, tutto cio' che non riguarda questa gara.

Esempi:
"il Sassuolo fa piu' di 4 tiri in porta?" -> {"tema":"linee","bersaglio":"shots_on_target","lato":"trasferta","verso":"over","soglie":[4]}
"meno di 25 falli nella partita?" -> {"tema":"linee","bersaglio":"fouls","lato":"totale","verso":"under","soglie":[25]}
"conviene l'under 4,5 corner del Monza?" -> {"tema":"linee","bersaglio":"corner_kicks","lato":"casa","verso":"under","soglie":[4.5]}
"l'over 6,5 corner casa non c'e', c'e' il 7,5: e' uguale?" -> {"tema":"linee","bersaglio":"corner_kicks","lato":"casa","verso":"over","soglie":[6.5,7.5]}
"chi vince?" -> {"tema":"gol","mercato":"esito"}
"over 2,5 gol conviene?" -> {"tema":"gol","mercato":"over_under","lato":"totale","verso":"over","soglie":[2.5]}
"quanti gol segna la squadra di casa?" -> {"tema":"gol","lato":"casa"}
"l'influenza arbitrale sui falli" -> {"tema":"arbitro"}
"chi puo' segnare nel Monza?" -> {"tema":"giocatori","aspetto":"marcatori","lato":"casa"}
"chi puo' segnare stasera?" -> {"tema":"giocatori","aspetto":"marcatori"}
"ci sono infortunati?" -> {"tema":"formazioni","aspetto":"indisponibili"}
"perche' cosi' tanti falli per il Sassuolo?" -> {"tema":"perche","bersaglio":"fouls","lato":"trasferta"}
"che tempo fa?" -> {"tema":null}`;

/**
 * I modelli di Groq che leggono la domanda, nell'ordine in cui si provano.
 *
 * Il secondo e' la riserva: ogni modello ha il suo tetto giornaliero, e quando il primo lo
 * esaurisce risponde 429. Nella prova `scripts/prova-assistente.ts` il primo legge meglio.
 * La variabile serve a quella prova, per misurarne uno solo.
 */
const MODELLI = process.env.IQSTATS_ASSISTENTE_MODELLO
  ? [process.env.IQSTATS_ASSISTENTE_MODELLO]
  : ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

/** Oltre questa lunghezza non e' una domanda su una gara. */
export const DOMANDA_MASSIMA = 200;

async function chiedi(modello: string, chiave: string, messaggio: string): Promise<unknown | null> {
  try {
    const risposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        model: modello,
        temperature: 0,
        // Il ragionamento conta nei gettoni del piano gratuito e qui non serve: e' una
        // traduzione, non un problema.
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ISTRUZIONI },
          { role: "user", content: messaggio },
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

/**
 * La stessa domanda sulla stessa gara si traduce una volta sola: la traduzione dipende solo
 * dal testo e dai due nomi, e rifarla spenderebbe gettoni per riavere lo stesso JSON. Un
 * modello che non risponde non si conserva: si riprova alla domanda dopo.
 */
const tradotta = inCache(
  "assistente-gara-domanda",
  async (domanda: string, casa: string, trasferta: string): Promise<unknown | null> => {
    const chiave = process.env.GROQ_API_KEY;
    if (!chiave) return null;
    const messaggio = `Squadra di casa: ${casa}. Squadra ospite: ${trasferta}.\nDomanda: ${domanda}`;
    for (const modello of MODELLI) {
      const letta = await chiedi(modello, chiave, messaggio);
      if (letta !== null) return letta;
    }
    return null;
  },
);

/**
 * La domanda tradotta dal modello, ancora da validare; `null` se nessun modello risponde.
 *
 * ponytail: nessun tetto di richieste per utente, solo quelli del piano gratuito di Groq:
 * esauriti, l'assistente dice che non risponde e il dossier resta intero. Un tetto per
 * utente serve quando l'app esce dal cantiere.
 */
export function interpreta(
  domanda: string,
  squadre: { readonly casa: string; readonly trasferta: string },
): Promise<unknown | null> {
  return tradotta(
    domanda.slice(0, DOMANDA_MASSIMA).trim().toLowerCase(), squadre.casa, squadre.trasferta,
  );
}
