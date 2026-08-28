// Il read model del capitolo «Come si affrontano»: puro, senza query.
//
// **Che cosa aggiunge rispetto alle statistiche di squadra.** La scheda squadra dice come
// gioca una squadra; qui si guarda l'incontro: quello che una produce dal suo lato contro
// quello che l'altra concede dal suo. Sono due confronti per metrica, uno per direzione,
// perche' chi attacca in casa e chi attacca in trasferta non stanno leggendo lo stesso
// campionato: i livelli dei due lati sono diversi, ed e' il motivo per cui `medieDiLato`
// separa i lati invece di mediarli.
//
// **Niente numeri nuovi.** Tutto viene da `medieDiLato`: qui si raggruppa, si formatta e si
// decide che cosa merita una frase. Se il confronto non regge, la frase non c'e'.
import type { ConMetro, MedieDiLato } from "./lati.ts";

/** Come si scrive un numero: la scala non e' la stessa per tutte le metriche, ed e' misurato. */
type Unita = "conteggio" | "percento" | "frazione" | "metri" | "xg";

/**
 * Le scale che non sono conteggi.
 *
 * Misurate sul livello dati, non supposte: `ball_possession` e `pass_accuracy_pct` arrivano
 * gia' in centesimi (medie 49,99 e 80,18), le quote della shot map arrivano in frazione
 * (0,6265 la parte dall'area), la distanza e' in metri (17,76) e la qualita' e' xG per tiro
 * (0,1112). Scriverle tutte allo stesso modo direbbe il falso.
 */
const UNITA: Readonly<Record<string, Unita>> = {
  possesso: "percento",
  precisione: "percento",
  quota_area: "frazione",
  quota_murati: "frazione",
  distanza_tiro: "metri",
  qualita_tiro: "xg",
};

/**
 * Le quattro letture, e quali metriche stanno in ciascuna.
 *
 * L'ordine e' quello in cui si scorre. Una lettura senza righe non compare: una sezione
 * appare quando ha il suo contratto dati, e le metriche mancanti si dichiarano.
 */
/**
 * **Il possesso non entra, ed e' una misura, non un gusto.**
 *
 * Su 9.252 gare con entrambi i lati la correlazione fra il possesso di una squadra e quello
 * dell'avversario e' **-0,991**, e in 9.250 gare su 9.252 i due sommano a cento: quello che
 * una squadra «concede» di possesso e' cento meno quello che ha, cioe' lo stesso numero
 * scritto due volte. Messo in questa forma sembrerebbero due prove indipendenti e non lo
 * sono, e il suo scostamento sarebbe sempre l'opposto dell'altro: la frase non potrebbe mai
 * comparire, e le due colonne mentirebbero.
 */
const LETTURE = [
  {
    id: "palla",
    nome: "Palla",
    frase: "Chi tiene il pallone e come lo muove.",
    chiavi: ["passaggi", "precisione", "palle_lunghe"],
  },
  {
    id: "territorio",
    nome: "Territorio",
    frase: "Quanto campo si guadagna, e quanto ci si avvicina alla porta.",
    chiavi: ["ultimo_terzo", "tocchi_area", "cross"],
  },
  {
    id: "combattimento",
    nome: "Combattimento",
    frase: "Quanto si contende il pallone, e quanto lo si riprende.",
    chiavi: ["duelli", "tackle", "intercetti", "recuperi"],
  },
  {
    id: "tiro",
    nome: "Tiro",
    frase: "Da dove si tira, quanto vale il tiro e quanto ne arriva a destinazione.",
    chiavi: ["quota_area", "distanza_tiro", "qualita_tiro", "quota_murati"],
  },
] as const;

/** Un numero della squadra scritto come va letto, con il metro del suo lato accanto. */
export interface NumeroDiLato {
  readonly testo: string;
  /** La media di lega dello stesso lato, gia' scritta. */
  readonly metro: string;
  /** Quante squadre supera, da 0 a 1: e' l'unico posto dove il colore dice un verso. */
  readonly posizione: number;
  /** `true` quando lo scostamento dal metro supera l'errore della sua media. */
  readonly oltreIlRumore: boolean;
  /** `+1` sopra il metro, `-1` sotto, `0` quando non si distingue. */
  readonly verso: -1 | 0 | 1;
}

/** Un confronto: chi attacca da un lato contro chi difende dall'altro. */
export interface Confronto {
  readonly chiave: string;
  readonly nome: string;
  readonly produce: NumeroDiLato;
  readonly concede: NumeroDiLato;
  /**
   * Le gare su cui poggia il confronto: la piu' povera delle due.
   *
   * Un confronto vale quanto il suo lato piu' debole, e dichiarare il campione piu' ricco
   * direbbe che il numero e' piu' solido di quanto sia.
   */
  readonly campione: number;
}

/** Una direzione dell'incontro: una squadra attacca, l'altra difende. */
export interface Direzione {
  readonly id: "casa" | "fuori";
  readonly chiAttacca: string;
  readonly chiDifende: string;
  readonly confronti: readonly Confronto[];
}

/** Il confronto che regge di piu' dentro una lettura: e' quello che si racconta. */
export interface Forte {
  readonly testo: string;
  readonly nome: string;
  readonly chiAttacca: string;
  readonly chiDifende: string;
  readonly verso: -1 | 1;
  readonly campione: number;
  /** Quante volte i due scostamenti superano il proprio errore, sommate. */
  readonly forza: number;
}

export interface Lettura {
  readonly id: string;
  readonly nome: string;
  readonly frase: string;
  readonly direzioni: readonly Direzione[];
  /** Le metriche che questo torneo non osserva abbastanza: si dicono, non spariscono. */
  readonly assenti: readonly string[];
  /** Il confronto che regge di piu', o `null` se nessuno supera il rumore. */
  readonly forte: Forte | null;
  /** La riga che dice che partita ne esce, o `null`: e' il testo di `forte`. */
  readonly sintesi: string | null;
}

/**
 * Le tre righe che si leggono in cinque secondi.
 *
 * **Non contengono un solo numero nuovo** e non introducono una soglia: sono i confronti
 * che il capitolo ha gia' trovato, messi in ordine di quanto superano l'errore delle loro
 * medie. Quando nessuno lo supera, l'apertura lo dice: non sapere e' una lettura, fingere
 * di sapere no.
 */
export interface Cappello {
  /** Dove si decide questa gara, o che non si decide da nessuna parte. */
  readonly apertura: string;
  /** Al massimo due prove, la piu' netta per prima. */
  readonly prove: readonly string[];
  /** La riga sola da mandare in cima al dossier, o `null` se non c'e' niente da dire. */
  readonly rigaBreve: string | null;
}

/** Il numero scritto secondo la sua scala, con la virgola italiana. */
export function scrivi(valore: number, unita: Unita): string {
  const italiano = (n: number, decimali: number) =>
    n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
  if (unita === "percento") return italiano(valore, 1) + "%";
  if (unita === "frazione") return italiano(valore * 100, 1) + "%";
  if (unita === "metri") return italiano(valore, 1) + " m";
  if (unita === "xg") return italiano(valore, 3) + " xG";
  return italiano(valore, 1);
}

/**
 * Lo scostamento dal metro del proprio lato, e se supera il rumore.
 *
 * **L'errore e' quello della media di questa squadra**, cioe' lo scarto fra le sue gare
 * diviso la radice del campione: non la dispersione fra le squadre, che dice un'altra cosa.
 * La soglia non e' scelta: e' l'errore stesso. Sotto di esso lo scostamento non si
 * distingue dal caso, e la pagina non lo racconta.
 */
function numeroDiLato(c: ConMetro, unita: Unita): NumeroDiLato {
  const scostamento = c.media - c.mediaDiLega;
  const oltreIlRumore = c.errore !== null && Math.abs(scostamento) > c.errore;
  return {
    testo: scrivi(c.media, unita),
    metro: scrivi(c.mediaDiLega, unita),
    posizione: c.posizione,
    oltreIlRumore,
    verso: !oltreIlRumore ? 0 : scostamento > 0 ? 1 : -1,
  };
}

/** Quanto lo scostamento supera il proprio errore: serve solo a scegliere la riga da raccontare. */
function quanteVolte(c: ConMetro): number {
  if (c.errore === null || c.errore === 0) return 0;
  return Math.abs(c.media - c.mediaDiLega) / c.errore;
}

/**
 * Le metriche che i due lati muovono **insieme**: restano in pagina, mai nella frase.
 *
 * Misurata sulle stesse 9.252 gare, la correlazione fra i due lati e' **+0,885** sui
 * recuperi: e' soprattutto una proprieta' della partita - il ritmo - non del confronto fra
 * le due squadre. Trovare i due numeri sopra il loro metro non direbbe che una trova
 * terreno buono, direbbe che li' si recupera molto. Le altre stanno fra -0,43 e +0,39, la
 * shot map fra -0,01 e +0,05: quelle il confronto lo reggono.
 */
const SOLIDALI: ReadonlySet<string> = new Set(["recuperi"]);

/** Un confronto candidato alla riga in prosa, con quanto pesa la sua evidenza. */
interface Candidato {
  readonly direzione: Direzione;
  readonly confronto: Confronto;
  /** Quante volte i due scostamenti superano il proprio errore, sommate. */
  readonly forza: number;
}

/**
 * Il confronto che regge di piu' dentro la lettura, o `null`.
 *
 * Si racconta **un solo** confronto: quello in cui i due numeri si scostano di piu' dal loro
 * metro, e solo se **entrambi** superano il proprio errore e vanno **nello stesso verso**.
 * Una squadra che ne produce piu' della media del suo lato contro una che ne concede piu'
 * della media del suo e' un incontro che dice qualcosa; se uno dei due e' in linea non c'e'
 * niente da dire, e dirlo lo stesso sarebbe inventare una lettura.
 *
 * La frase non introduce **nessun numero nuovo**: ripete i quattro che stanno nella riga,
 * piu' il campione. La metrica si nomina: senza, «355,6 contro 404,1» non dice di che cosa,
 * ed e' un difetto visto leggendo le frasi vere su 150 gare e non dedotto dal codice.
 */
function forteDi(candidati: readonly Candidato[]): Forte | null {
  const scelto = candidati.reduce<Candidato | null>(
    (migliore, c) => (migliore === null || c.forza > migliore.forza ? c : migliore),
    null,
  );
  if (scelto === null) return null;
  const { direzione: d, confronto: c } = scelto;
  const verso = c.produce.verso === 1 ? "sopra" : "sotto";
  return {
    nome: c.nome,
    chiAttacca: d.chiAttacca,
    chiDifende: d.chiDifende,
    verso: c.produce.verso === 1 ? 1 : -1,
    campione: c.campione,
    forza: scelto.forza,
    testo: `${c.nome} — ${d.chiAttacca} ${c.produce.testo} contro i ${c.produce.metro} `
      + `del suo lato, ${d.chiDifende} ne concede ${c.concede.testo} contro i `
      + `${c.concede.metro} del suo: tutt'e due ${verso} il proprio metro, su `
      + `${c.campione} gare.`,
  };
}

/**
 * Le tre righe in cima al capitolo.
 *
 * **L'apertura dice dove si decide la gara**, cioe' quali letture separano le due squadre e
 * quali no. E' l'unica cosa che si legge in cinque secondi, e non e' un'etichetta inventata:
 * e' l'elenco delle letture in cui i numeri hanno superato l'errore delle loro medie.
 *
 * Quando tutte le prove stanno da una parte sola si aggiunge da che parte: e' il fatto piu'
 * utile del capitolo, ed e' gia' nei dati.
 */
export function cappelloDi(letture: readonly Lettura[]): Cappello | null {
  if (letture.length === 0) return null;
  const forti = letture
    .filter((l): l is Lettura & { forte: Forte } => l.forte !== null)
    .sort((x, y) => y.forte.forza - x.forte.forza);

  if (forti.length === 0) {
    return {
      apertura: "Su questa gara i numeri non separano le due squadre: nessun confronto "
        + "supera l'errore delle sue medie, e una differenza dentro il rumore non è una "
        + "differenza.",
      prove: [],
      rigaBreve: null,
    };
  }

  const mute = letture.filter((l) => l.forte === null).map((l) => l.nome);
  const elenco = (nomi: readonly string[]) => nomi.length === 1
    ? nomi[0]
    : `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
  // Da che parte pende, quando pende: vale solo se **tutte** le prove guardano nella stessa
  // direzione. Con prove da tutt'e due le parti non pende, e dirlo sarebbe scegliere.
  const attaccanti = new Set(forti.map((l) => l.forte.chiAttacca));
  const dovePende = attaccanti.size === 1
    ? ` Succede tutto quando attacca ${forti[0]?.forte.chiAttacca}.`
    : "";
  const apertura = `Queste due squadre si separano su ${elenco(forti.map((l) => l.nome))}`
    + (mute.length > 0 ? `; su ${elenco(mute)} i numeri non le distinguono.` : ".")
    + dovePende;

  const primo = forti[0]?.forte;
  return {
    apertura,
    prove: forti.slice(0, 2).map((l) => l.forte.testo),
    rigaBreve: primo === undefined ? null
      : `Come si affrontano: la lettura più netta è ${primo.nome.toLowerCase()}, con `
        + `${primo.chiAttacca} e ${primo.chiDifende} tutt'e due ${primo.verso === 1 ? "sopra" : "sotto"} `
        + `il metro del loro lato su ${primo.campione} gare.`,
  };
}

/** Un confronto vale quanto il suo lato piu' povero. */
function confrontoDi(
  chiave: string,
  nome: string,
  produce: ConMetro,
  concede: ConMetro,
  campione: number,
): Confronto {
  const unita = UNITA[chiave] ?? "conteggio";
  return {
    chiave,
    nome,
    produce: numeroDiLato(produce, unita),
    concede: numeroDiLato(concede, unita),
    campione,
  };
}

/**
 * Le quattro letture dell'incontro, o un elenco vuoto se non c'e' niente da confrontare.
 *
 * Serve **entrambi** i lati: con uno solo non c'e' un incontro, e mettere in pagina meta'
 * confronto direbbe piu' del vero. Una metrica entra solo se tutt'e due le squadre la
 * portano; le altre si dichiarano assenti.
 */
export function comeSiAffrontano(
  casa: MedieDiLato | null,
  fuori: MedieDiLato | null,
  nomeCasa: string,
  nomeFuori: string,
): readonly Lettura[] {
  if (casa === null || fuori === null) return [];
  const inCasa = new Map(casa.voci.map((v) => [v.chiave, v]));
  const inTrasferta = new Map(fuori.voci.map((v) => [v.chiave, v]));

  const letture: Lettura[] = [];
  for (const l of LETTURE) {
    const attaccaCasa: Confronto[] = [];
    const attaccaFuori: Confronto[] = [];
    const assenti: string[] = [];
    for (const chiave of l.chiavi) {
      const a = inCasa.get(chiave);
      const b = inTrasferta.get(chiave);
      if (a === undefined || b === undefined) {
        const nome = a?.nome ?? b?.nome ?? chiave;
        assenti.push(nome);
        continue;
      }
      // Il campione del confronto e' il minore dei due: le colonne non si riempiono
      // insieme, e le due squadre possono averne osservate un numero diverso.
      const campione = Math.min(a.campione, b.campione);
      attaccaCasa.push(confrontoDi(chiave, a.nome, a.prodotto, b.concesso, campione));
      attaccaFuori.push(confrontoDi(chiave, a.nome, b.prodotto, a.concesso, campione));
    }
    if (attaccaCasa.length === 0) continue;

    const direzioni: Direzione[] = [
      { id: "casa", chiAttacca: nomeCasa, chiDifende: nomeFuori, confronti: attaccaCasa },
      { id: "fuori", chiAttacca: nomeFuori, chiDifende: nomeCasa, confronti: attaccaFuori },
    ];
    // La forza si ricalcola dai numeri di partenza, non da quelli gia' scritti: il testo e'
    // arrotondato, e scegliere sull'arrotondamento sceglierebbe la riga sbagliata.
    const candidati: Candidato[] = [];
    for (const d of direzioni) {
      for (const c of d.confronti) {
        if (SOLIDALI.has(c.chiave)) continue;
        if (!c.produce.oltreIlRumore || !c.concede.oltreIlRumore) continue;
        if (c.produce.verso !== c.concede.verso) continue;
        const a = inCasa.get(c.chiave);
        const b = inTrasferta.get(c.chiave);
        if (a === undefined || b === undefined) continue;
        const [p, q] = d.id === "casa" ? [a.prodotto, b.concesso] : [b.prodotto, a.concesso];
        candidati.push({ direzione: d, confronto: c, forza: quanteVolte(p) + quanteVolte(q) });
      }
    }
    const forte = forteDi(candidati);
    letture.push({
      id: l.id,
      nome: l.nome,
      frase: l.frase,
      direzioni,
      assenti,
      forte,
      sintesi: forte?.testo ?? null,
    });
  }
  return letture;
}
