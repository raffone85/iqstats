/**
 * Le quote di mercato accanto alle nostre linee, dal palinsesto Fastbet.
 *
 * **Il verso e' invertito rispetto al resto del motore, ed e' il punto.** Altrove il
 * motore sceglie la soglia dal proprio atteso - cinque soglie attorno al valore previsto -
 * e poi si cerca la quota corrispondente: misurato l'11 settembre 2026, cosi' **56 righe
 * su 591** trovavano un prezzo, il 9,5%. Qui le soglie le detta il bookmaker e la nostra
 * probabilita' si calcola su quelle: ogni linea mostrata ha la sua quota per costruzione,
 * perche' non esiste una linea che il banco non abbia quotato.
 *
 * **Niente entra dalla quota nella nostra probabilita'.** Non c'e' deriva, non c'e'
 * aggiustamento sul prezzo: il numero resta quello del modello, altrimenti il confronto
 * sarebbe il banco contro se stesso. Questo modulo legge, normalizza e aggancia. Basta.
 *
 * **La soglia vera sta nel nome dell'esito, non nel campo `linea` del mercato**: un
 * mercato con `linea: 9.5` porta l'esito «Un. 8.5». Il campo si ignora.
 */

/** Un esito quotato dal banco: soglia, verso e prezzo. */
export interface EsitoQuotato {
  readonly soglia: number;
  readonly verso: "Over" | "Under";
  readonly quota: number;
}

/** Un intervallo di gol quotato: «multigol 2-4» e simili. */
export interface IntervalloQuotato {
  readonly da: number;
  readonly a: number;
  readonly quota: number;
}

/** I mercati sui gol che il banco quota su tutte le gare del palinsesto. */
export interface QuoteGol {
  readonly esito: { readonly uno: number; readonly x: number; readonly due: number } | null;
  readonly doppiaChance:
    | { readonly unoX: number; readonly xDue: number; readonly unoDue: number }
    | null;
  readonly overUnder: readonly EsitoQuotato[];
  readonly gol: number | null;
  readonly noGol: number | null;
  readonly multigolPartita: readonly IntervalloQuotato[];
  readonly multigolCasa: readonly IntervalloQuotato[];
  readonly multigolTrasferta: readonly IntervalloQuotato[];
}

export type Lato = "casa" | "trasferta" | "totale";

/** Un evento del palinsesto, gia' ridotto a quello che ci serve. */
export interface EventoQuotato {
  readonly casa: string;
  readonly fuori: string;
  /** Il giorno del calcio d'inizio in ISO, che e' meta' della chiave d'aggancio. */
  readonly giorno: string;
  /** Le linee per `bersaglio|lato`, gia' ripulite dai mercati combinati. */
  readonly linee: ReadonlyMap<string, readonly EsitoQuotato[]>;
  readonly gol: QuoteGol;
}

/** Come si scrive la chiave di `linee`: un solo posto, cosi' non si sbaglia da una parte. */
export function chiaveDiLinea(bersaglio: string, lato: Lato): string {
  return bersaglio + "|" + lato;
}

/**
 * I mercati che parlano di un'altra cosa, anche se il nome contiene la famiglia giusta.
 *
 * «U/O Tiri Totali + 1X2» non e' una linea sui tiri: e' una combinata con l'esito finale,
 * e sulla raccolta dell'11 settembre erano **5.370 mercati**, dieci volte i mercati puri.
 * Contarli come linee gonfiava la mediana da 36 a 110 linee per gara. Stesso discorso per
 * il primo tempo, il pari/dispari, l'handicap e le combinate fra le due squadre.
 *
 * **Le finestre di tempo sono la trappola peggiore**, perche' hanno lo stesso nome del
 * mercato di gara: «5 minuti - U/O cartellini da 0:00 a 4:59» porta «Over 0.5» a quota
 * 8,00, e su Venezia-Fiorentina finiva accanto alla nostra linea sui cartellini di tutta
 * la gara. Un prezzo giusto per un'altra domanda e' peggio di nessun prezzo.
 */
const COMBINATO =
  /\+ *1X2|&|1T *-|\d+ *minut|\bda \d+:\d+|tempo|sostituto|pari\/dispari|handicap|\b1x2\b|\be ospite\b|gara a |entrambe|primo|ultimo|gol da/i;

/** Un mercato e' una linea solo se dichiara un sopra/sotto o un totale. */
const SOPRA_SOTTO = /\bU\/O\b|totale/i;

/** «Casa» e «Ospite» nel nome del mercato: e' li' che sta il lato, non negli esiti. */
const NOME_CASA = /\bcasa\b/i;
const NOME_OSPITE = /\bospite\b/i;

const VERSO_SOPRA = /^(over|ov\.?)\b/i;
const VERSO_SOTTO = /^(under|un\.?)\b/i;
const NUMERO = /(\d+(?:[.,]\d+)?)/;

/** Il nome di un multigol: «0-1», «2-4», «1-7». */
const INTERVALLO = /^(\d+)\s*-\s*(\d+)$/;

/** La forma minima di un esito nel palinsesto: quello che ci serve leggere. */
export interface EsitoGrezzo {
  readonly nome: string | null;
  readonly quota: number | null;
}

/** La forma minima di un mercato nel palinsesto. */
export interface MercatoGrezzo {
  readonly nome: string | null;
  readonly famiglia: string | null;
  readonly giocatore: string | null;
  readonly esiti: readonly EsitoGrezzo[];
}

/** La forma minima di un evento nel palinsesto, come lo scrive `fastbet-quote.py`. */
export interface EventoGrezzo {
  readonly casa: string;
  readonly fuori: string;
  readonly inizio: string;
  readonly mercati: readonly MercatoGrezzo[];
}

/**
 * Una quota buona, oppure `null`.
 *
 * **Lo zero non e' un prezzo**: e' un mercato sospeso, e sulla raccolta dell'11 settembre
 * erano 13.319 esiti. Mostrarlo come quota sarebbe il valore inventato che
 * `niente-valori-inventati-ne-zeri` vieta; anche l'uno secco non e' una quota giocabile.
 */
function quotaBuona(quota: number | null | undefined): number | null {
  if (typeof quota !== "number" || !Number.isFinite(quota) || quota <= 1) return null;
  return quota;
}

/** Il verso e la soglia dal nome dell'esito, `null` se quel nome non ne porta. */
function esitoDiSoglia(esito: EsitoGrezzo): EsitoQuotato | null {
  const nome = esito.nome ?? "";
  const verso = VERSO_SOPRA.test(nome) ? "Over" : VERSO_SOTTO.test(nome) ? "Under" : null;
  if (verso === null) return null;
  const numero = nome.match(NUMERO);
  const quota = quotaBuona(esito.quota);
  if (numero === null || quota === null) return null;
  const soglia = Number(numero[1].replace(",", "."));
  if (!Number.isFinite(soglia) || soglia <= 0) return null;
  return { soglia, verso, quota };
}

/** Il lato di cui parla un mercato, dal suo nome. */
function latoDelMercato(nome: string): Lato {
  if (NOME_CASA.test(nome)) return "casa";
  if (NOME_OSPITE.test(nome)) return "trasferta";
  return "totale";
}

/**
 * Le linee delle sette famiglie, per `bersaglio|lato`.
 *
 * I mercati sui singoli giocatori restano fuori: il motore proietta la squadra, e «Tiri
 * Totali (Emerson)» non ha una nostra probabilita' accanto a cui stare.
 */
function lineeDellEvento(
  mercati: readonly MercatoGrezzo[],
): ReadonlyMap<string, readonly EsitoQuotato[]> {
  const raccolte = new Map<string, EsitoQuotato[]>();
  for (const mercato of mercati) {
    const nome = mercato.nome ?? "";
    if (mercato.famiglia === null || mercato.giocatore !== null) continue;
    if (COMBINATO.test(nome) || !SOPRA_SOTTO.test(nome)) continue;
    const chiave = chiaveDiLinea(mercato.famiglia, latoDelMercato(nome));
    for (const grezzo of mercato.esiti) {
      const esito = esitoDiSoglia(grezzo);
      if (esito === null) continue;
      const gia = raccolte.get(chiave);
      if (gia === undefined) raccolte.set(chiave, [esito]);
      // La stessa soglia puo' arrivare da due mercati diversi: vince la prima letta, e
      // non si mostrano due prezzi della stessa cosa.
      else if (!gia.some((v) => v.soglia === esito.soglia && v.verso === esito.verso)) {
        gia.push(esito);
      }
    }
  }
  for (const esiti of raccolte.values()) esiti.sort((a, b) => a.soglia - b.soglia);
  return raccolte;
}

/** Gli intervalli di un mercato multigol, scartati quelli sospesi. */
function intervalliDi(mercato: MercatoGrezzo | undefined): readonly IntervalloQuotato[] {
  if (mercato === undefined) return [];
  const fuori: IntervalloQuotato[] = [];
  for (const esito of mercato.esiti) {
    const trovato = (esito.nome ?? "").trim().match(INTERVALLO);
    const quota = quotaBuona(esito.quota);
    if (trovato === null || quota === null) continue;
    fuori.push({ da: Number(trovato[1]), a: Number(trovato[2]), quota });
  }
  return fuori.sort((a, b) => a.da - b.da || a.a - b.a);
}

/** La quota di un esito con quel nome esatto, `null` se manca o e' sospeso. */
function quotaDi(mercato: MercatoGrezzo | undefined, nome: string): number | null {
  if (mercato === undefined) return null;
  const esito = mercato.esiti.find((v) => (v.nome ?? "").trim().toLowerCase() === nome);
  return esito === undefined ? null : quotaBuona(esito.quota);
}

/**
 * I mercati sui gol: gli unici che il banco quota su **tutte** le gare del palinsesto,
 * misurato 82 su 82 fra quelle agganciate.
 */
function golDellEvento(mercati: readonly MercatoGrezzo[]): QuoteGol {
  const per = new Map<string, MercatoGrezzo>();
  for (const mercato of mercati) {
    const nome = (mercato.nome ?? "").trim().toLowerCase();
    if (!per.has(nome)) per.set(nome, mercato);
  }
  const esito = per.get("1x2");
  const doppia = per.get("doppia chance");
  const uno = quotaDi(esito, "1");
  const x = quotaDi(esito, "x");
  const due = quotaDi(esito, "2");
  const unoX = quotaDi(doppia, "1x");
  const xDue = quotaDi(doppia, "x2");
  const unoDue = quotaDi(doppia, "12");
  const overUnder: EsitoQuotato[] = [];
  for (const grezzo of per.get("u/o")?.esiti ?? []) {
    const quotato = esitoDiSoglia(grezzo);
    if (quotato !== null) overUnder.push(quotato);
  }
  overUnder.sort((a, b) => a.soglia - b.soglia || a.verso.localeCompare(b.verso));

  return {
    esito: uno === null || x === null || due === null ? null : { uno, x, due },
    doppiaChance:
      unoX === null || xDue === null || unoDue === null ? null : { unoX, xDue, unoDue },
    overUnder,
    gol: quotaDi(per.get("goal / nogoal"), "goal"),
    noGol: quotaDi(per.get("goal / nogoal"), "nogoal"),
    multigolPartita: intervalliDi(per.get("multigoal")),
    multigolCasa: intervalliDi(per.get("casa multigoal")),
    multigolTrasferta: intervalliDi(per.get("ospite multigoal")),
  };
}

/** Un evento del palinsesto ridotto a quello che serve: linee pulite e mercati sui gol. */
export function eventoQuotato(grezzo: EventoGrezzo): EventoQuotato {
  return {
    casa: grezzo.casa,
    fuori: grezzo.fuori,
    giorno: grezzo.inizio.slice(0, 10),
    linee: lineeDellEvento(grezzo.mercati),
    gol: golDellEvento(grezzo.mercati),
  };
}

/**
 * Le parole che identificano una squadra: le sigle e i sostantivi comuni non contano.
 *
 * Senza questo filtro «Real Sociedad» e «Real Madrid» si somigliano per la parola
 * sbagliata, ed e' cosi' che nasce un'ambiguita' che poi butta via due gare buone.
 */
const PAROLE_VUOTE = new Set([
  "fc", "cf", "ac", "sc", "as", "us", "ss", "if", "bk", "sk", "fk", "de", "of", "the",
  "club", "calcio", "city", "united", "real", "athletic", "atletico", "sporting",
  "deportivo", "team", "football", "futbol",
]);

/** Le parole significative di un nome di squadra, senza accenti e senza sigle. */
export function paroleDiSquadra(nome: string): ReadonlySet<string> {
  const piatto = nome.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const parole = new Set<string>();
  for (const parola of piatto.split(/[^a-z0-9]+/)) {
    if (parola.length > 2 && !PAROLE_VUOTE.has(parola)) parole.add(parola);
  }
  return parole;
}

function siIncontrano(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const parola of a) if (b.has(parola)) return true;
  return false;
}

/**
 * L'evento del palinsesto che corrisponde alla nostra gara, `null` se non e' certo.
 *
 * **Le ambigue si buttano.** Nessuna chiave comune esiste fra le due fonti - il
 * palinsesto porta solo nomi e data - e quando due eventi dello stesso giorno rispondono
 * ai due nomi, una quota attaccata alla gara sbagliata e' peggio di una quota assente.
 * Misurato sull'artefatto dell'11 settembre: 82 gare uniche su 102, 5 ambigue, 15 senza.
 */
export function agganciaGara(
  casa: string,
  fuori: string,
  kickoff: string,
  eventi: readonly EventoQuotato[],
): EventoQuotato | null {
  const giorno = kickoff.slice(0, 10);
  const nostraCasa = paroleDiSquadra(casa);
  const nostraFuori = paroleDiSquadra(fuori);
  let trovato: EventoQuotato | null = null;
  for (const evento of eventi) {
    if (evento.giorno !== giorno) continue;
    if (!siIncontrano(nostraCasa, paroleDiSquadra(evento.casa))) continue;
    if (!siIncontrano(nostraFuori, paroleDiSquadra(evento.fuori))) continue;
    if (trovato !== null) return null;
    trovato = evento;
  }
  return trovato;
}
