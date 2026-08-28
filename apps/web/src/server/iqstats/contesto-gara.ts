// Il quadro della gara in cinque secondi: una riga, tre numeri, una riserva.
//
// **Perche' esiste.** Prima del primo capitolo il dossier aveva quattro pannelli - «In
// breve», «Verdetto», «La lettura IQstatS», «Dove il modello dice qualcosa» - per 2.009 px
// a 375, e dicevano cose che si sovrapponevano: chi apriva la pagina doveva leggerli tutti
// per farsi un'idea. Qui i primi tre diventano uno.
//
// **Nessun numero nuovo, nessun criterio nuovo.** Le famiglie mostrate sono quelle che
// `lettureForti` ha gia' scelto, con il suo ordine - quanto il verso e' deciso per quanto
// quel bersaglio regge fuori campione - e non con la percentuale piu' alta. Il metro di un
// atteso e' la somma delle due medie di lega dei due lati, che `medieDiLato` calcola gia'.
// La soglia per dire «piu' della media» e' mezza dispersione, la stessa disciplina del
// giudizio dell'arbitro: mai un numero scelto a tavolino.
import type { Cappello } from "./affronto.ts";
import type { MedieDiLato } from "./lati.ts";
import type { LettureDellaGara } from "./projection/letture-forti.ts";
import type { ProiezioneDiGara } from "./projection/match.ts";

/**
 * Da bersaglio del motore a chiave di `medieDiLato`: e' l'unico punto in cui i due
 * vocabolari si toccano, e sta qui invece che sparso.
 */
const METRO_DEL_BERSAGLIO: Readonly<Record<string, string>> = {
  total_shots: "tiri",
  shots_on_target: "in_porta",
  corner_kicks: "corner",
  fouls: "falli",
  yellow_cards: "gialli",
  offsides: "fuorigioco",
  goalkeeper_saves: "parate",
};

/** Come si chiama una famiglia quando entra in una frase. */
const NOME_IN_FRASE: Readonly<Record<string, string>> = {
  total_shots: "tiri",
  shots_on_target: "tiri in porta",
  corner_kicks: "corner",
  fouls: "falli",
  yellow_cards: "cartellini",
  offsides: "fuorigioco",
  goalkeeper_saves: "parate",
};

export interface Tessera {
  readonly bersaglio: string;
  readonly nome: string;
  /** Quanti se ne attendono nella gara. */
  readonly atteso: string;
  /** La somma delle due medie di lega dei due lati, o `null` se manca a un lato. */
  readonly metro: string | null;
  /** `+1` sopra il metro, `-1` sotto, `0` quando lo scarto non supera mezza dispersione. */
  readonly verso: -1 | 0 | 1;
  /** La linea piu' forte su questa famiglia, gia' scritta. */
  readonly lettura: string | null;
  readonly probabilita: number | null;
}

export interface Contesto {
  /** Che gara e', in una riga: e' l'unica cosa che si legge in cinque secondi. */
  readonly titolo: string;
  /** Chi il modello da' avanti, quando lo dice. */
  readonly favorito: string | null;
  readonly tessere: readonly Tessera[];
  readonly riserva: string;
}

/** Quante famiglie stanno in un colpo d'occhio prima che torni a essere un elenco. */
const QUANTE = 3;

function numero(v: number, decimali = 1): string {
  return v.toLocaleString("it-IT", {
    minimumFractionDigits: decimali, maximumFractionDigits: decimali,
  });
}

/**
 * Il metro di un atteso di gara: la media di lega del lato di casa piu' quella del lato di
 * trasferta, con la dispersione della somma.
 *
 * I due lati hanno livelli diversi e vanno sommati come sono. La dispersione della somma si
 * compone in quadratura: sommare gli scarti direbbe piu' del vero.
 */
function metroDelTotale(chiave: string, casa: MedieDiLato, fuori: MedieDiLato):
  { media: number; dispersione: number | null } | null {
  const a = casa.voci.find((v) => v.chiave === chiave);
  const b = fuori.voci.find((v) => v.chiave === chiave);
  if (a === undefined || b === undefined) return null;
  const sa = a.prodotto.dispersione;
  const sb = b.prodotto.dispersione;
  return {
    media: a.prodotto.mediaDiLega + b.prodotto.mediaDiLega,
    dispersione: sa === null || sb === null ? null : Math.sqrt(sa * sa + sb * sb),
  };
}

export function contestoDiGara(args: {
  readonly bersagli: readonly ProiezioneDiGara[];
  readonly forti: LettureDellaGara | null;
  readonly casa: MedieDiLato | null;
  readonly fuori: MedieDiLato | null;
  readonly stile: Cappello | null;
  readonly favorito: { readonly nome: string; readonly probabilita: number } | null;
  /** Il verso del modello sui gol, quando e' netto: «pochi gol attesi». */
  readonly gol: string | null;
  /** I limiti del dato che «In breve» dichiarava: pochi precedenti, formazioni incerte. */
  readonly avvertenze: readonly string[];
}): Contesto | null {
  const { bersagli, forti, casa, fuori, stile, favorito, gol, avvertenze } = args;

  // L'ordine e' quello di `lettureForti`, che e' gia' il criterio del prodotto. Una famiglia
  // entra una volta sola: la sua linea piu' forte, non tutte le sue soglie.
  const viste = new Set<string>();
  const tessere: Tessera[] = [];
  for (const l of forti?.letture ?? []) {
    if (viste.has(l.bersaglio) || tessere.length >= QUANTE) continue;
    viste.add(l.bersaglio);
    const totale = bersagli.find((b) => b.target === l.bersaglio)?.totale ?? null;
    if (totale === null) continue;
    const chiave = METRO_DEL_BERSAGLIO[l.bersaglio];
    const metro = chiave === undefined || casa === null || fuori === null
      ? null
      : metroDelTotale(chiave, casa, fuori);
    // **Mezza dispersione, come nel giudizio dell'arbitro.** Sotto quella soglia lo scarto
    // dal metro non si distingue da come le squadre di quel torneo variano fra loro.
    const scarto = metro === null ? null : totale.valoreAtteso - metro.media;
    const verso: -1 | 0 | 1 = scarto === null || metro?.dispersione == null
      || Math.abs(scarto) <= metro.dispersione / 2
      ? 0
      : scarto > 0 ? 1 : -1;
    tessere.push({
      bersaglio: l.bersaglio,
      nome: NOME_IN_FRASE[l.bersaglio] ?? l.bersaglio,
      atteso: numero(totale.valoreAtteso),
      metro: metro === null ? null : numero(metro.media),
      verso,
      lettura: `${l.verso.toLowerCase()} ${numero(l.soglia, 1)}`,
      probabilita: Math.round(l.probabilita * 100),
    });
  }

  // **Il titolo si ferma a due famiglie e a un tratto di stile.** La prima stesura ne
  // metteva quattro e usciva a ventitre parole: «Gara da piu' fuorigioco e meno corner
  // della media di questo torneo, e poco palleggio e poca presenza in area quando attacca
  // Remo». In cinque secondi non si legge.
  const nome = (t: Tessera) => t.nome;
  const piu = tessere.filter((t) => t.verso === 1).map(nome);
  const meno = tessere.filter((t) => t.verso === -1).map(nome);
  const quantita = [
    piu.length > 0 ? `più ${piu[0]}` : null,
    meno.length > 0 ? `meno ${meno[0]}` : null,
  ].filter((p): p is string => p !== null).join(" e ");

  const stileCorto = stile === null || stile.parole.length === 0
    ? null
    : `${stile.parole[0]}${stile.fase === null ? "" : ` ${stile.fase}`}`;
  const stileIntero = stile === null || stile.tratti.length === 0
    ? null
    : `${stile.titolo.charAt(0).toLowerCase()}${stile.titolo.slice(1)}`
      + (stile.fase === null ? "" : ` ${stile.fase}`);

  if (quantita === "" && stileIntero === null && tessere.length === 0) return null;
  const titolo = quantita === ""
    ? (stileIntero === null
      ? "Su questa gara i numeri non si scostano dalla media del torneo."
      : `${stileIntero.charAt(0).toUpperCase()}${stileIntero.slice(1)}.`)
    : `${quantita.charAt(0).toUpperCase()}${quantita.slice(1)} della media`
      + (stileCorto === null ? "." : `, con ${stileCorto}.`);

  return {
    titolo,
    // Chi il modello da' avanti e il suo verso sui gol stavano in due pannelli diversi, e
    // sono la stessa cosa: qui vanno su una riga sola.
    favorito: [
      favorito === null ? null : `${favorito.nome} avanti al ${Math.round(favorito.probabilita)}%`,
      gol,
    ].filter((p): p is string => p !== null).join(" · ") || null,
    tessere,
    riserva: [
      ...avvertenze,
      "Sono letture di un modello statistico, mai certezze: ogni numero dichiara il metro "
      + "con cui va letto, e sotto trovi come ci si arriva.",
    ].join(" "),
  };
}
