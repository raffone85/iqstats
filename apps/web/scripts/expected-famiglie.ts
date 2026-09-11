// Expected: le sette famiglie del motore per ogni gara in arrivo.
//
// **Che cosa e', e perche' non e' la vetrina.** La vetrina tiene *una* lettura per gara, la
// piu' probabile dentro la fascia dove la taratura tiene. Expected tiene *tutte e sette* le
// famiglie di ogni gara - tiri, tiri in porta, falli, cartellini, corner, fuorigioco,
// parate - con la loro soglia, il loro verso e la loro affidabilita'. Sono due domande
// diverse: la vetrina risponde «che cosa gioco», Expected «che cosa dice il motore».
//
// **Per questo non passa da `ordinaLetture`.** Quella funzione e' il criterio della cima:
// scarta le letture sopra l'ottanta per cento e, dal 10 settembre 2026, i falli. Qui
// scartare sarebbe sbagliato - una sezione che si chiama Expected deve mostrare anche cio'
// che il motore non manderebbe in cima - quindi si parte da `candidateDiGara` e si passa da
// `arricchisci`, che e' li' apposta: aggiunge base di lega, sorpresa e forza senza filtrare.
//
// **Il costo.** Una proiezione sta fra 227 e 402 ms per gara: un giorno pieno sono minuti,
// e nessuna pagina puo' aspettarli. Come la vetrina, si scrive un artefatto e la pagina lo
// legge dichiarando quando e' stato scritto.
//
// Uso, con il livello dati locale in ascolto e le variabili della fonte:
//   node --env-file=.env.local --conditions=react-server --import ./test/risolutore-ts.mjs \
//     --experimental-strip-types scripts/expected-famiglie.ts [--giorni 3] [--insieme 6]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { baseDiLega } from "../src/server/iqstats/base-di-lega.ts";
import { connessione } from "../src/server/iqstats/lettura.ts";
import { getMatchDetail } from "../src/server/iqstats/match-context.ts";
import { getMatchesByDate, type MatchListItem } from "../src/server/iqstats/matches.ts";
import { ARTEFATTI_DI_PRODUZIONE } from "../src/server/iqstats/projection-artefatti.ts";
import {
  type GolDellaGara,
  proiezioniDellaGara,
} from "../src/server/iqstats/projection-runtime.ts";
import { type Causa, causeDellaLettura } from "../src/server/iqstats/projection/cause.ts";
import {
  distribuzioniDeiGol,
  type MercatiGol,
  quotaFra,
} from "../src/server/iqstats/projection/gol.ts";
import { type ProiezioneDiGara, soglieDi } from "../src/server/iqstats/projection/match.ts";
import { probabilitaSopra } from "../src/server/iqstats/projection/predictor.ts";
import {
  agganciaGara,
  chiaveDiLinea,
  eventoQuotato,
  type EventoGrezzo,
  type EventoQuotato,
  type QuoteGol,
} from "../src/server/iqstats/projection/quote.ts";
import {
  arricchisci,
  candidateDiGara,
  ordinaLetture,
} from "../src/server/iqstats/projection/letture-forti.ts";

interface RigaDiFamiglia {
  readonly bersaglio: string;
  readonly lato: "casa" | "trasferta" | "totale";
  readonly soglia: number;
  readonly verso: "Over" | "Under";
  readonly probabilita: number;
  readonly base: number | null;
  readonly gareDiBase: number | null;
  readonly affidabilita: number;
  /** Il valore che il motore attende su quella scala: la soglia nasce da qui. */
  readonly atteso: number;
  readonly intervallo: { readonly basso: number; readonly alto: number } | null;
  /**
   * Da dove viene il numero e quanto ci mette il modello.
   *
   * Sotto una miscela l'atteso e' `peso x modello + (1 - peso) x baseline`, e chi legge
   * le cause deve sapere che spiegano la quota del modello, non tutto il numero. Misurato
   * l'11 settembre 2026: sulla gara 213568 **tutte e quattordici** le scale erano miscela,
   * con peso da 0,75 a 0,95. Tacerlo e' l'errore che questa riga esiste per non fare.
   */
  readonly origine: "modello" | "miscela" | "ripiego";
  readonly pesoDelModello: number;
  /** Che cosa ha mosso l'atteso, dalla causa piu' grande. Vuoto sotto un ripiego. */
  readonly cause: readonly Causa[];
}

/**
 * Una linea che il banco quota, con la nostra probabilita' su **quella** soglia.
 *
 * **La soglia non e' nostra, il numero si'.** La quota non entra nel calcolo da nessuna
 * parte: si prende il valore atteso del lato e la distribuzione calibrata del bersaglio,
 * esattamente come per le cinque soglie del motore, e si chiede la probabilita' sulla
 * soglia che il bookmaker ha aperto. Una probabilita' derivata dal prezzo sarebbe il banco
 * confrontato con se stesso.
 */
interface RigaQuotata {
  readonly bersaglio: string;
  readonly lato: "casa" | "trasferta" | "totale";
  readonly soglia: number;
  readonly verso: "Over" | "Under";
  readonly quota: number;
  /**
   * La nostra probabilita' su quella soglia, `null` quando la scala non ha una
   * calibrazione: sotto un ripiego il motore non pubblica le proprie cinque linee, e non
   * puo' pubblicarne una sesta solo perche' il banco l'ha quotata.
   */
  readonly probabilita: number | null;
  /** Il valore che il motore attende su quella scala: dice quanto la soglia sia lontana. */
  readonly atteso: number;
  /**
   * Se la soglia del banco cade fuori dalle cinque su cui la calibrazione e' stata
   * misurata. Misurato l'11 settembre 2026: **51 righe su 448**, l'11,4%. La probabilita'
   * esce lo stesso - la distribuzione e' definita ovunque - ma nessuno ha verificato che
   * sia calibrata li', e la riga lo deve dire invece di far finta di niente.
   */
  readonly fuoriFinestra: boolean;
}

/**
 * I mercati sui gol: le nostre probabilita' e le quote del banco, fianco a fianco.
 *
 * **Si tiene solo cio' che ha un prezzo accanto.** `MercatiGol` porta anche la matrice
 * esito x linea, i risultati esatti e le distribuzioni per squadra: roba buona, che il
 * dossier mostra, e che qui sarebbe 1 MB di artefatto senza una quota di fronte.
 */
interface GolConQuote {
  readonly nostri: {
    readonly attesiCasa: number;
    readonly attesiTrasferta: number;
    /** Su quante gare per lato poggiano le due forze, e su quante la media di lega. */
    readonly campioneCasa: number;
    readonly campioneTrasferta: number;
    readonly campioneLega: number;
    /**
     * Gli expected goals delle stesse gare, con il metro della competizione accanto.
     *
     * Non entrano nel calcolo - le forze vengono dalle reti - e si mostrano con la media
     * di lega di fianco: senza quel confronto uno 0,00 sembra una squadra che non tira,
     * mentre in LaLiga 2 e' la fonte che non popola il campo, su 88 osservazioni.
     */
    readonly xgCasa: number | null;
    readonly xgTrasferta: number | null;
    readonly xgLegaCasa: number | null;
    readonly xgLegaTrasferta: number | null;
    readonly esito: MercatiGol["esito"];
    readonly doppiaChance: MercatiGol["doppiaChance"];
    readonly overUnder: MercatiGol["overUnder"];
    readonly gg: number;
    readonly ng: number;
    readonly multigolPartita: MercatiGol["multigolPartita"];
    readonly multigolCasa: MercatiGol["casa"]["multigol"];
    readonly multigolTrasferta: MercatiGol["trasferta"]["multigol"];
  };
  readonly quote: QuoteGol | null;
}

/**
 * I nostri mercati sui gol, sulle righe che il banco quota davvero.
 *
 * **Le soglie e gli intervalli li detta il palinsesto, come per le famiglie.** `mercatiGol`
 * produce le quattro linee e i quindici multigol che la pagina della gara mostra; il banco
 * ne apre di piu', e senza questo passaggio **7.043 righe quotate su 12.100** restavano con
 * un prezzo e un trattino al posto del nostro numero. Le probabilita' escono dalle stesse
 * due distribuzioni di Poisson: cambia solo l'intervallo su cui si sommano.
 */
function golNostri(gol: GolDellaGara, quote: QuoteGol | null): GolConQuote["nostri"] {
  const mercati = gol.mercati;
  const p = distribuzioniDeiGol(mercati.casa.attesi, mercati.trasferta.attesi);
  const arrotonda2 = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));
  const arrotonda = (v: number) => Number(v.toFixed(4));
  const intervalli = (
    chiesti: readonly { readonly da: number; readonly a: number }[],
    dove: readonly number[],
    difetto: readonly { readonly da: number; readonly a: number; readonly probabilita: number }[],
  ) => (chiesti.length === 0
    ? difetto
    : chiesti.map((i) => ({ da: i.da, a: i.a, probabilita: arrotonda(quotaFra(dove, i.da, i.a)) })));

  const soglie = quote === null
    ? mercati.overUnder.map((l) => l.linea)
    : [...new Set(quote.overUnder.map((q) => q.soglia))].sort((a, b) => a - b);

  return {
    attesiCasa: Number(mercati.casa.attesi.toFixed(2)),
    attesiTrasferta: Number(mercati.trasferta.attesi.toFixed(2)),
    campioneCasa: gol.campioneCasa,
    campioneTrasferta: gol.campioneTrasferta,
    campioneLega: gol.campioneLega,
    xgCasa: arrotonda2(gol.xgCasa),
    xgTrasferta: arrotonda2(gol.xgTrasferta),
    xgLegaCasa: arrotonda2(gol.xgLegaCasa),
    xgLegaTrasferta: arrotonda2(gol.xgLegaTrasferta),
    esito: mercati.esito,
    doppiaChance: mercati.doppiaChance,
    overUnder: soglie.map((linea) => {
      const sopra = arrotonda(quotaFra(p.totale, Math.ceil(linea), p.totale.length - 1));
      return { linea, sopra, sotto: arrotonda(1 - sopra) };
    }),
    gg: mercati.gg,
    ng: mercati.ng,
    multigolPartita: intervalli(quote?.multigolPartita ?? [], p.totale, mercati.multigolPartita),
    multigolCasa: intervalli(quote?.multigolCasa ?? [], p.casa, mercati.casa.multigol),
    multigolTrasferta: intervalli(
      quote?.multigolTrasferta ?? [], p.trasferta, mercati.trasferta.multigol,
    ),
  };
}

/**
 * Quanto il motore attende da una famiglia, sui due lati e sul totale.
 *
 * **Serve al riepilogo, e non si ricava dalle righe.** Una riga di famiglia porta l'atteso
 * del **suo** lato - quello su cui la lettura e' piu' decisa - e le righe quotate esistono
 * solo dove il banco ha aperto un mercato: per dire «attesi 25 falli» servono tutti e tre i
 * numeri di ogni famiglia, anche quando nessuno dei tre e' quotato da nessuno.
 */
interface AttesiDiFamiglia {
  readonly bersaglio: string;
  readonly casa: number | null;
  readonly trasferta: number | null;
  readonly totale: number | null;
}

function attesiDelleFamiglie(
  bersagli: readonly ProiezioneDiGara[],
): readonly AttesiDiFamiglia[] {
  const arrotonda = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));
  return bersagli.flatMap((b) => {
    const casa = scalaDi(b, "casa");
    const trasferta = scalaDi(b, "trasferta");
    const totale = scalaDi(b, "totale");
    if (casa === null && trasferta === null && totale === null) return [];
    return [{
      bersaglio: b.target,
      casa: arrotonda(casa?.atteso ?? null),
      trasferta: arrotonda(trasferta?.atteso ?? null),
      totale: arrotonda(totale?.atteso ?? null),
    }];
  });
}

/**
 * Le linee quotate della gara, una per soglia e per verso.
 *
 * Si passa dai segnali che il motore produce gia': quando `linee[lato]` e' `null` quella
 * scala non ha una calibrazione utilizzabile - un ripiego, o un totale che poggia su un
 * ripiego - e la riga esce con la quota e senza il nostro numero.
 */
function quoteDellaGara(
  evento: EventoQuotato,
  bersagli: readonly ProiezioneDiGara[],
): readonly RigaQuotata[] {
  const righe: RigaQuotata[] = [];
  for (const bersaglio of bersagli) {
    const artefatto = ARTEFATTI_DI_PRODUZIONE.get(bersaglio.target);
    if (artefatto === undefined) continue;
    for (const lato of ["casa", "trasferta", "totale"] as const) {
      const esiti = evento.linee.get(chiaveDiLinea(bersaglio.target, lato));
      if (esiti === undefined || esiti.length === 0) continue;
      const scala = scalaDi(bersaglio, lato);
      if (scala === null) continue;

      // La calibrazione del totale non e' quella dei lati: sono due grandezze diverse e
      // due dispersioni misurate a parte.
      const calibrata = lato === "totale"
        ? (bersaglio.totale?.linee === null || bersaglio.totale === null
          ? null
          : artefatto.totale === null || artefatto.totale === undefined
            ? null
            : {
              distribuzione: artefatto.totale.distribuzione,
              dispersione: artefatto.totale.dispersione,
            })
        : (bersaglio.linee[lato] === null
          ? null
          : {
            distribuzione: artefatto.calibration.distribuzione_intervallo,
            dispersione: artefatto.calibration.dispersione,
          });

      const nostre = soglieDi(scala.atteso);
      const minima = nostre[0];
      const massima = nostre[nostre.length - 1];
      for (const esito of esiti) {
        const sopra = calibrata === null
          ? null
          : probabilitaSopra(
            calibrata.distribuzione, calibrata.dispersione, scala.atteso, esito.soglia,
          );
        const probabilita = sopra === null
          ? null
          : Number((esito.verso === "Over" ? sopra : 1 - sopra).toFixed(4));
        righe.push({
          bersaglio: bersaglio.target,
          lato,
          soglia: esito.soglia,
          verso: esito.verso,
          quota: esito.quota,
          probabilita,
          atteso: Number(scala.atteso.toFixed(2)),
          fuoriFinestra: esito.soglia < minima || esito.soglia > massima,
        });
      }
    }
  }
  return righe;
}

/**
 * Il pronostico consigliato della gara, con i numeri che lo giustificano.
 *
 * **Non e' un criterio nuovo.** E' la lettura che `ordinaLetture` mette in cima - la piu'
 * probabile dentro la fascia fino all'ottanta per cento, a parita' di punto il bersaglio
 * che sbaglia meno - cioe' esattamente il criterio di cui il consuntivo di `/metodo`
 * conosce la resa. Un secondo criterio scelto qui sarebbe un pronostico senza consuntivo.
 *
 * **La motivazione sta nei campi, non in una frase.** `base` dice quanto quella linea
 * succede nella lega e `scarto` di quanto ce ne stacchiamo: e' li' che il consiglio smette
 * di essere banale, perche' una lettura che coincide con la norma del torneo non aggiunge
 * niente e il blocco lo deve dichiarare invece di spacciarla per nostra.
 */
interface Consigliato extends RigaDiFamiglia {
  /** Punti percentuali fra la nostra probabilita' e la frequenza della lega. */
  readonly scarto: number | null;
}

interface GaraExpected {
  readonly gara: number;
  readonly casa: string;
  readonly fuori: string;
  /** Gli identificativi servono agli stemmi: senza, la riga mostra solo le iniziali. */
  readonly casaId: number | null;
  readonly fuoriId: number | null;
  readonly legaId: number | null;
  readonly lega: string | null;
  readonly kickoff: string;
  readonly consigliato: Consigliato | null;
  readonly famiglie: readonly RigaDiFamiglia[];
  /** Le famiglie senza una misura di riscontro: si dichiarano, non si nascondono. */
  readonly senzaMisura: readonly string[];
  /**
   * Le linee che il banco quota, tutte, per i due lati e per il totale.
   *
   * Vuoto quando la gara non si aggancia al palinsesto: senza chiave comune l'aggancio
   * passa da nomi e data, e le ambigue si buttano invece di rischiare il prezzo della
   * gara sbagliata.
   */
  readonly quote: readonly RigaQuotata[];
  /** Quanto il motore attende da ogni famiglia, sui due lati e sul totale. */
  readonly attesi: readonly AttesiDiFamiglia[];
  /** I mercati sui gol, nostri e del banco. `null` se manca il materiale per i nostri. */
  readonly gol: GolConQuote | null;
}

function argomento(nome: string, difetto: number): number {
  const indice = process.argv.indexOf("--" + nome);
  if (indice < 0) return difetto;
  const valore = Number(process.argv[indice + 1]);
  return Number.isFinite(valore) && valore > 0 ? valore : difetto;
}

/** I giorni di Roma da oggi in avanti, in formato ISO. */
function giorniDaOggi(quanti: number): readonly string[] {
  const giorni: string[] = [];
  const oggi = new Date();
  for (let passo = 0; passo < quanti; passo += 1) {
    const giorno = new Date(oggi.getTime() + passo * 86_400_000);
    giorni.push(giorno.toISOString().slice(0, 10));
  }
  return giorni;
}

/**
 * Le sette famiglie di quella gara, una riga per famiglia.
 *
 * Dentro una famiglia ci sono piu' candidate - lati diversi, soglie diverse - e ne resta
 * **una**: la piu' probabile. Le altre non spariscono dal prodotto, restano nella card
 * della famiglia dentro il dossier; qui servirebbero solo a fare quattro righe che dicono
 * la stessa partita.
 */
/**
 * Atteso, intervallo e provenienza della scala su cui sta la lettura scelta.
 *
 * **Sul totale la provenienza e' la peggiore dei due lati**, non la media: un totale che
 * somma un lato dal modello e uno da un ripiego non e' meta' affidabile, e' un numero che
 * poggia anche su un ripiego. Il peso e' il minore per la stessa ragione.
 */
function scalaDi(bersaglio: ProiezioneDiGara, lato: "casa" | "trasferta" | "totale"): {
  readonly atteso: number;
  readonly intervallo: { readonly basso: number; readonly alto: number } | null;
  readonly origine: "modello" | "miscela" | "ripiego";
  readonly pesoDelModello: number;
} | null {
  const lati = [bersaglio.casa, bersaglio.trasferta].filter((v) => v.stato === "prevista");
  if (lati.length < 2) return null;
  const origine = lati.some((v) => v.origineDelValore === "ripiego")
    ? "ripiego"
    : lati.some((v) => v.origineDelValore === "miscela") ? "miscela" : "modello";
  const pesoDelModello = Math.min(...lati.map((v) => v.pesoDelModello));

  if (lato === "totale") {
    if (bersaglio.totale === null) return null;
    const i = bersaglio.totale.intervallo;
    return {
      atteso: bersaglio.totale.valoreAtteso,
      intervallo: i === null ? null : { basso: i.basso, alto: i.alto },
      origine,
      pesoDelModello,
    };
  }
  const v = lato === "casa" ? bersaglio.casa : bersaglio.trasferta;
  if (v.stato !== "prevista") return null;
  return {
    atteso: v.valoreAtteso,
    intervallo: v.intervallo === null ? null : { basso: v.intervallo.basso, alto: v.intervallo.alto },
    origine: v.origineDelValore,
    pesoDelModello: v.pesoDelModello,
  };
}

async function famiglieDi(
  gara: MatchListItem,
  palinsesto: readonly EventoQuotato[],
): Promise<GaraExpected | null> {
  const esito = await getMatchDetail(gara.eventId);
  if (esito.stato !== "trovato") return null;
  const detail = esito.detail;
  if (detail.leagueId === null || detail.seasonId === null) return null;

  const proiezioni = await proiezioniDellaGara(detail);
  if (typeof proiezioni === "string") return null;

  const { candidate, senzaMisura } = candidateDiGara(proiezioni.bersagli);
  if (candidate.length === 0) return null;

  const basi = await baseDiLega(
    detail.leagueId,
    detail.seasonId,
    candidate.map((c) => ({ target: c.bersaglio, lato: c.lato, soglia: c.soglia, verso: c.verso })),
  );

  const perBersaglio = new Map(proiezioni.bersagli.map((b) => [b.target, b]));
  const migliori = new Map<string, RigaDiFamiglia>();
  for (const l of arricchisci(candidate, basi)) {
    const gia = migliori.get(l.bersaglio);
    if (gia !== undefined && gia.probabilita >= l.probabilita) continue;
    const bersaglio = perBersaglio.get(l.bersaglio);
    if (bersaglio === undefined) continue;
    const scala = scalaDi(bersaglio, l.lato);
    if (scala === null) continue;
    migliori.set(l.bersaglio, {
      bersaglio: l.bersaglio,
      lato: l.lato,
      soglia: l.soglia,
      verso: l.verso,
      probabilita: Number(l.probabilita.toFixed(4)),
      base: l.base === null ? null : Number(l.base.toFixed(2)),
      gareDiBase: l.gareDiBase,
      affidabilita: l.affidabilita,
      atteso: Number(scala.atteso.toFixed(2)),
      intervallo: scala.intervallo,
      origine: scala.origine,
      pesoDelModello: scala.pesoDelModello,
      cause: causeDellaLettura(l.lato, bersaglio.casa, bersaglio.trasferta)
        .map((c) => ({ nome: c.nome, effetto: Number(c.effetto.toFixed(3)) })),
    });
  }
  if (migliori.size === 0) return null;

  // Il consigliato passa dal criterio della cima, che e' l'unico di cui si conosce la resa.
  const prima = ordinaLetture(candidate, senzaMisura, basi).consigliato ?? undefined;
  // La lettura in cima non e' sempre la piu' probabile della sua famiglia - una sceglie
  // sulla sorpresa, l'altra sulla probabilita' - quindi puo' stare su un altro lato, e la
  // sua scala si chiede per il lato **suo**, non per quello della riga di famiglia.
  const suo = prima === undefined ? null : perBersaglio.get(prima.bersaglio) ?? null;
  const scalaConsigliata = suo === null || prima === undefined ? null : scalaDi(suo, prima.lato);
  const consigliato: Consigliato | null = prima === undefined || suo === null
    || scalaConsigliata === null
    ? null
    : {
    bersaglio: prima.bersaglio,
    lato: prima.lato,
    soglia: prima.soglia,
    verso: prima.verso,
    probabilita: Number(prima.probabilita.toFixed(4)),
    base: prima.base === null ? null : Number(prima.base.toFixed(2)),
    gareDiBase: prima.gareDiBase,
    affidabilita: prima.affidabilita,
    scarto: prima.base === null
      ? null
      : Number((prima.probabilita * 100 - prima.base).toFixed(1)),
    atteso: Number(scalaConsigliata.atteso.toFixed(2)),
    intervallo: scalaConsigliata.intervallo,
    origine: scalaConsigliata.origine,
    pesoDelModello: scalaConsigliata.pesoDelModello,
    cause: causeDellaLettura(prima.lato, suo.casa, suo.trasferta)
      .map((c) => ({ nome: c.nome, effetto: Number(c.effetto.toFixed(3)) })),
  };

  const evento = agganciaGara(detail.homeTeam, detail.awayTeam, gara.kickoff, palinsesto);

  return {
    gara: gara.eventId,
    casa: detail.homeTeam,
    fuori: detail.awayTeam,
    casaId: gara.homeTeamId,
    fuoriId: gara.awayTeamId,
    legaId: gara.leagueId,
    lega: gara.leagueName,
    kickoff: gara.kickoff,
    consigliato,
    // Ordine stabile: la famiglia piu' probabile in cima, cosi' la riga apre sul numero
    // che regge di piu' invece che sull'ordine alfabetico dei bersagli.
    famiglie: [...migliori.values()].sort((a, b) => b.probabilita - a.probabilita),
    senzaMisura,
    quote: evento === null ? [] : quoteDellaGara(evento, proiezioni.bersagli),
    attesi: attesiDelleFamiglie(proiezioni.bersagli),
    gol: proiezioni.gol === null
      ? null
      : {
        nostri: golNostri(proiezioni.gol, evento === null ? null : evento.gol),
        quote: evento === null ? null : evento.gol,
      },
  };
}

/**
 * Il palinsesto piu' fresco che sta su disco, gia' normalizzato.
 *
 * L'archivio di `scripts/quote/output/` non entra in Git - 24 MB per giornata - quindi qui
 * si legge quello che c'e' e, se non c'e' niente, l'artefatto si scrive **senza** quote
 * invece di fallire: le probabilita' del motore non dipendono dal banco.
 */
function palinsestoPiuFresco(): {
  readonly eventi: readonly EventoQuotato[];
  /** Quando il palinsesto e' stato raccolto: una quota senza la sua ora non si legge. */
  readonly raccoltoIl: string | null;
} {
  const cartella = path.join(import.meta.dirname, "..", "..", "..", "scripts", "quote", "output");
  let file: string[];
  try {
    file = readdirSync(cartella).filter((n) => n.endsWith(".ndjson.gz")).sort();
  } catch {
    return { eventi: [], raccoltoIl: null };
  }
  const ultimo = file.at(-1);
  if (ultimo === undefined) return { eventi: [], raccoltoIl: null };
  const testo = gunzipSync(readFileSync(path.join(cartella, ultimo))).toString("utf8");
  const eventi: EventoQuotato[] = [];
  let raccoltoIl: string | null = null;
  for (const riga of testo.split("\n")) {
    if (riga.trim() === "") continue;
    const grezzo = JSON.parse(riga) as EventoGrezzo & { readonly raccolto_il?: string };
    // L'ultima riga scritta e' la piu' recente: e' quella l'ora che la pagina dichiara.
    if (typeof grezzo.raccolto_il === "string") raccoltoIl = grezzo.raccolto_il;
    eventi.push(eventoQuotato(grezzo));
  }
  console.log(`palinsesto ${ultimo}: ${eventi.length} eventi`);
  return { eventi, raccoltoIl };
}

async function main(): Promise<number> {
  if (connessione() === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const giorni = argomento("giorni", 3);
  const insieme = argomento("insieme", 6);

  const adesso = Date.now();
  const gare: MatchListItem[] = [];
  for (const giorno of giorniDaOggi(giorni)) {
    const esito = await getMatchesByDate(giorno);
    // Solo quello che deve ancora cominciare: Expected parla di gare da giocare.
    for (const gara of esito.matches) {
      if (Date.parse(gara.kickoff) > adesso) gare.push(gara);
    }
  }
  if (gare.length === 0) {
    console.error("nessuna gara in arrivo: l'artefatto non si scrive vuoto");
    return 1;
  }

  const palinsesto = palinsestoPiuFresco();

  const voci: GaraExpected[] = [];
  for (let inizio = 0; inizio < gare.length; inizio += insieme) {
    const lotto = gare.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(
      lotto.map((g) => famiglieDi(g, palinsesto.eventi).catch(() => null)),
    );
    for (const voce of esiti) if (voce !== null) voci.push(voce);
    process.stdout.write(`\r${Math.min(inizio + insieme, gare.length)}/${gare.length} gare`);
  }
  process.stdout.write("\n");

  voci.sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const righe = voci.reduce((n, v) => n + v.famiglie.length, 0);
  const righeQuotate = voci.reduce((n, v) => n + v.quote.length, 0);
  const gareQuotate = voci.filter((v) => v.quote.length > 0).length;
  const rapporto = {
    schema: "expected-famiglie/2",
    calcolato_il: new Date().toISOString(),
    giorni,
    gare_in_arrivo: gare.length,
    gare_con_proiezione: voci.length,
    righe,
    gare_con_quote: gareQuotate,
    quote_raccolte_il: palinsesto.raccoltoIl,
    righe_quotate: righeQuotate,
    come_sono_arrivate_le_quote: (
      "dal palinsesto Fastbet/Altenar raccolto da scripts/quote/fastbet-quote.py. Le soglie "
      + "le detta il bookmaker e la nostra probabilita' si calcola su quelle, dalla stessa "
      + "distribuzione calibrata delle cinque soglie del motore: la quota non entra nel "
      + "calcolo. L'aggancio passa da parole significative piu' data e le gare ambigue si "
      + "buttano; gli esiti sospesi, con quota a zero, non diventano un prezzo."
    ),
    come_e_stato_scelto: (
      "le stesse funzioni che disegnano il dossier - candidateDiGara, baseDiLega, "
      + "arricchisci - su ogni gara in arrivo. Una riga per famiglia, la candidata piu' "
      + "probabile fra i lati e le soglie di quella famiglia. Non si passa da ordinaLetture: "
      + "quello e' il criterio della cima, che scarta le letture sopra l'ottanta per cento e "
      + "i falli, e qui scartare direbbe il falso su una sezione che deve mostrare che cosa "
      + "dice il motore."
    ),
    gare: voci,
  };

  const percorso = path.join(
    import.meta.dirname, "..", "src", "server", "iqstats", "artefatti", "expected-famiglie.json",
  );
  writeFileSync(percorso, JSON.stringify(rapporto, null, 2) + "\n", "utf8");
  console.log(
    `${gare.length} gare in arrivo · ${voci.length} con proiezione · ${righe} righe di famiglia`
    + ` · ${gareQuotate} gare agganciate al palinsesto · ${righeQuotate} linee quotate`,
  );
  console.log(percorso);
  return 0;
}

process.exitCode = await main();
