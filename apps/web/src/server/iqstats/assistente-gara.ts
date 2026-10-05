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
  const verso = r.verso === "under" ? "Under" : "Over";
  const soglie = Array.isArray(r.soglie)
    ? [...new Set(r.soglie.filter(
      (s): s is number => typeof s === "number" && s > 0 && s < 100 && s % 1 === 0.5,
    ))].sort((a, b) => a - b).slice(0, SOGLIE_MASSIME)
    : [];
  return { bersaglio: r.bersaglio as Richiesta["bersaglio"], lato, verso, soglie };
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
    "Rispondo sulle linee di questa gara: tiri, tiri in porta, corner, falli, cartellini "
    + "gialli, fuorigioco e parate, per una squadra o in totale. Per esempio: «conviene "
    + "l'over 9,5 tiri della squadra ospite?».",
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

const ISTRUZIONI = `Traduci in JSON la domanda di un utente sulle linee di una partita di calcio. Non rispondere alla domanda e non scrivere altro che il JSON.

Schema: {"bersaglio": "total_shots"|"shots_on_target"|"corner_kicks"|"fouls"|"yellow_cards"|"offsides"|"goalkeeper_saves"|null, "lato": "casa"|"trasferta"|"totale"|null, "verso": "over"|"under"|null, "soglie": [numeri]}

Regole:
- bersaglio: tiri = total_shots, tiri in porta o nello specchio = shots_on_target, corner o calci d'angolo = corner_kicks, falli = fouls, gialli o ammonizioni o cartellini = yellow_cards, fuorigioco = offsides, parate = goalkeeper_saves. null se la domanda parla d'altro (gol, risultato, giocatori, altro).
- lato: "casa" per la squadra di casa, "trasferta" per ospite o trasferta, "totale" per la gara intera. Se la domanda nomina una squadra usa i nomi dati sotto. null se non e' detto.
- verso: "over" per sopra, piu' di, almeno; "under" per sotto, meno di. null se non e' detto.
- soglie: TUTTE le soglie nominate nella domanda, anche quelle che l'utente dice assenti e quelle dette senza ripetere over o under ("c'e' il 25,5" -> 25.5). [] se non ne nomina. Ogni soglia finisce SEMPRE in .5, mai un numero intero:
  - "8.5", "8,5", "8 e mezzo" -> 8.5
  - numero intero con "piu' di", "sopra", "oltre": aggiungi 0.5. "piu' di 4 tiri" -> 4.5
  - numero intero con "almeno": togli 0.5. "almeno 5 corner" -> 4.5
  - numero intero con "meno di", "sotto": togli 0.5. "meno di 25 falli" -> 24.5
  - numero intero con "al massimo", "non piu' di": aggiungi 0.5. "al massimo 3" -> 3.5

Esempi:
"il Sassuolo fa piu' di 4 tiri in porta?" -> {"bersaglio":"shots_on_target","lato":"trasferta","verso":"over","soglie":[4.5]}
"meno di 25 falli nella partita?" -> {"bersaglio":"fouls","lato":"totale","verso":"under","soglie":[24.5]}
"l'over 6,5 corner casa non c'e', c'e' il 7,5: e' uguale?" -> {"bersaglio":"corner_kicks","lato":"casa","verso":"over","soglie":[6.5,7.5]}
"chi vince?" -> {"bersaglio":null,"lato":null,"verso":null,"soglie":[]}`;

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
