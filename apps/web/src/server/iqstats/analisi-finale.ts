// L'analisi finale, in fondo al dossier: la rilettura in parole di quello che sta sopra.
//
// **Perche' sta in fondo e non in cima.** Nelle schermate di riferimento la sintesi chiude
// la pagina, e la decisione del 28 agosto 2026 e' di tenerla li' ma costruita in modo che
// non diventi la scorciatoia per saltare i numeri: **nessun numero nuovo**, prosa e non
// tessere, e **ogni voce rimanda indietro al capitolo da cui esce**.
//
// **Nessuna cifra, e non e' una svista.** Le stesse due sezioni che il 29 agosto scrivevano
// 18,4 e 18,9 per lo stesso fatto insegnano che due posti con gli stessi numeri divergono
// appena una finestra cambia. Qui i numeri non ci sono affatto: ci sono le parole che i
// capitoli usano gia', e il collegamento al punto dove quei numeri vivono con il loro
// campione e il loro metro. Cosi' questa sezione non puo' contraddire nessun'altra.
//
// **Quello che aggiunge davvero e' il secondo elenco.** Ogni limite - una famiglia che non
// sa dire quanto regge, un confronto dentro il rumore, i gol che non si possono costruire,
// l'arbitro non ancora designato - e' gia' dichiarato dove nasce, ma sparso su undicimila
// pixel. Raccoglierli in un posto solo e' l'unica cosa che nessun capitolo puo' fare di se'.
import type { Cappello } from "./affronto.ts";

/** Una voce dell'analisi: la frase, e il capitolo da cui esce. */
export interface Voce {
  /** L'`id` dell'intestazione di capitolo, senza cancelletto. */
  readonly ancora: string;
  readonly capitolo: string;
  readonly testo: string;
}

export interface Analisi {
  /** Che cosa dice il dossier, in parole. */
  readonly dice: readonly Voce[];
  /** Che cosa il dossier **non** riesce a dire, raccolto da tutta la pagina. */
  readonly limiti: readonly Voce[];
  readonly nota: string;
}

/** Un elenco italiano: «i corner», «i corner e i falli», «i corner, i falli e le parate». */
function elenco(nomi: readonly string[]): string {
  if (nomi.length <= 1) return nomi[0] ?? "";
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

/** La prima lettera minuscola: serve a incastrare un titolo dentro una frase. */
function minuscola(testo: string): string {
  return `${testo.charAt(0).toLowerCase()}${testo.slice(1)}`;
}

/** Le quattro aree di un candidato di valore, nella parola che la pagina usa. */
const AREA: Readonly<Record<string, string>> = {
  esito: "sull'esito",
  gol: "sui gol",
  gioco: "sul gioco",
  disciplina: "sulla disciplina",
};

export function analisiFinale(args: {
  /** Chi il modello da' avanti, senza la percentuale: quella sta nel quadro in cima. */
  readonly favorito: string | null;
  /** Le famiglie che si scostano di piu' dalla base di lega, nude e minuscole: «corner». */
  readonly famiglieForti: readonly string[];
  readonly cappello: Cappello | null;
  /** Il giudizio sull'arbitro sul metro della sua lega: «severo», «permissivo», «in linea». */
  readonly arbitroGiudizio: string | null;
  /** Vero quando la fonte non dichiara ancora il direttore di gara. */
  readonly senzaArbitro: boolean;
  /** Le famiglie lasciate fuori dalle letture perche' non sanno dire quanto reggono. */
  readonly senzaMisura: readonly string[];
  /** Vero quando i mercati dei gol non si possono costruire su questa gara. */
  readonly senzaGol: boolean;
  /** Vero quando la proiezione non gira e in pagina resta il motore di base. */
  readonly senzaProiezione: boolean;
  /**
   * Il candidato di valore, ridotto a cio' che qui si puo' scrivere: **l'area** e **il
   * verso** del confronto con il prezzo. La sua etichetta porta una soglia, e in questa
   * sezione una cifra non entra: chi vuole il numero apre Mercati.
   */
  readonly valore: {
    /** Una delle quattro aree: `esito`, `gol`, `gioco`, `disciplina`. */
    readonly area: string;
    /** Vero dove il modello sta sopra il prezzo, falso dove sta sotto, `null` senza quota. */
    readonly sopraIlPrezzo: boolean | null;
  } | null;
  /**
   * Le metriche su cui gli scontri con gli stessi avversari separano davvero le due
   * squadre, nude e minuscole. Vuoto quando nessuna supera l'errore delle due medie.
   */
  readonly comuni: { readonly separano: readonly string[] } | null;
  /**
   * Il pronostico della gara, ridotto a famiglia e verso: «i corner, verso l'alto». `null`
   * dove nessuna lettura si stacca abbastanza dalla norma e il dossier non consiglia niente.
   */
  readonly pronostico: { readonly famiglia: string; readonly verso: "Over" | "Under" } | null;
}): Analisi | null {
  const {
    favorito, famiglieForti, cappello, arbitroGiudizio, senzaArbitro, senzaMisura,
    senzaGol, senzaProiezione, valore, comuni, pronostico,
  } = args;

  const dice: Voce[] = [];

  // **Il colpo d'occhio, senza ripetere il quadro.** Il quadro in cima dice quanto ci si
  // attende e con che metro; qui si dice un'altra cosa, che vive nel pannello delle letture:
  // dove il modello si allontana da quanto quel campionato fa di solito.
  const scostamento = famiglieForti.length === 0
    ? null
    : `si allontana da quanto succede di solito in questo campionato soprattutto `
      // «su» e non «sui»: le sette famiglie non hanno tutte lo stesso genere, e «sui
      // parate» sarebbe uscito in pagina alla prima gara con quella famiglia in cima.
      + `su ${elenco(famiglieForti)}`;
  if (favorito !== null || scostamento !== null) {
    dice.push({
      ancora: "cap-insight",
      capitolo: "Insight",
      testo: favorito === null
        ? `Il modello ${scostamento}.`
        : scostamento === null
          ? `Il modello dà avanti ${favorito}.`
          : `Il modello dà avanti ${favorito}, e ${scostamento}.`,
    });
  }

  // **Il confronto con il prezzo, che il prodotto di riferimento non ha.** Qui non si scrive
  // ne' il margine ne' la quota - stanno in Mercati, con la loro fonte e la loro freschezza -
  // ma il verso si', perche' e' l'unica cosa che distingue una lettura nostra da una che
  // ripete il banco. Dove il mercato non quota quell'esito non c'e' nessun confronto da
  // dichiarare, e la voce lo dice invece di tacere.
  if (valore != null) {
    const dove = AREA[valore.area] ?? "su un'area";
    dice.push({
      ancora: "cap-mercati",
      capitolo: "Mercati",
      testo: valore.sopraIlPrezzo === null
        ? `Il candidato di valore sta ${dove}, ma quel bersaglio non e' quotato: non c'e' `
          + "nessun prezzo con cui confrontarlo."
        : valore.sopraIlPrezzo
          ? `Sul confronto con il banco il modello sta sopra il prezzo ${dove}.`
          : `Sul confronto con il banco il modello sta sotto il prezzo ${dove}, `
            + "cioe' e' piu' prudente di chi quota.",
    });
  }

  // Il capitolo dei due lati parla di gioco, non di esito: la frase resta la sua.
  if (cappello !== null && cappello.tratti.length > 0) {
    dice.push({
      ancora: "cap-trend",
      capitolo: "Trend",
      testo: `Dai due lati la gara si legge come ${minuscola(cappello.titolo)}`
        + `${cappello.fase === null ? "" : ` ${cappello.fase}`}, e vale se le due squadre `
        + "continuano così.",
    });
  }

  // **Gli stessi avversari, che togliono dal confronto la parte che e' calendario.** Due
  // squadre possono avere medie diverse perche' hanno incontrato avversari diversi: questo
  // capitolo guarda solo gli avversari in comune, e dichiara separate solo le metriche il
  // cui scarto supera l'errore delle due medie. Dove non ne separa nessuna e' un'informazione
  // vera, non un buco: vuol dire che su quel materiale le due squadre si somigliano.
  if (comuni != null) {
    dice.push({
      ancora: "cap-precedenti",
      capitolo: "Precedenti",
      testo: comuni.separano.length === 0
        ? "Contro gli stessi avversari nessuna metrica separa le due squadre oltre l'errore "
          + "delle proprie medie: su quel materiale si somigliano."
        : `Contro gli stessi avversari le due squadre si separano su ${elenco(comuni.separano)}.`,
    });
  }

  if (arbitroGiudizio !== null) {
    dice.push({
      ancora: "cap-arbitro",
      capitolo: "Arbitro",
      testo: `L'arbitro designato fischia ${arbitroGiudizio} rispetto ai colleghi che `
        + "dirigono questa competizione.",
    });
  }

  // **La chiusura, che e' la domanda vera: «e allora?»** Nelle schermate di riferimento
  // l'ultimo blocco e' lo scenario previsto, e qui la cosa piu' vicina e' il pronostico che
  // il dossier dichiara in cima. La soglia non si ripete - una cifra qui non entra - e
  // resta quello che serve a chiudere: su che cosa, e da che parte.
  if (pronostico != null) {
    dice.push({
      ancora: "cap-insight",
      capitolo: "Insight",
      testo: `Il pronostico di questa gara sta su ${pronostico.famiglia}, e va verso `
        + `${pronostico.verso === "Over" ? "l'alto" : "il basso"}: e' la lettura che si `
        + "stacca abbastanza dalla norma del campionato per meritare di essere detta.",
    });
  }

  const limiti: Voce[] = [];

  if (senzaProiezione) {
    limiti.push({
      ancora: "cap-proiezioni",
      capitolo: "Proiezioni",
      testo: "La proiezione non gira su questa gara: al suo posto si legge il motore di "
        + "base, che poggia su medie e non sui modelli.",
    });
  }
  if (senzaMisura.length > 0) {
    limiti.push({
      ancora: "cap-proiezioni",
      capitolo: "Proiezioni",
      testo: `Sulle famiglie ${elenco(senzaMisura)} non sappiamo ancora quanto il modello `
        + "regga fuori campione, quindi restano fuori dalle letture in cima.",
    });
  }
  if (senzaGol) {
    limiti.push({
      ancora: "cap-gol",
      capitolo: "Gol",
      testo: "I mercati dei gol non si possono costruire qui: manca la colonna dei gol "
        + "attesi osservati su cui poggiano.",
    });
  }
  if (cappello !== null && cappello.mute !== null) {
    limiti.push({
      ancora: "cap-trend",
      capitolo: "Trend",
      testo: "Non tutti i confronti fra i due lati separano le due squadre: quelli che non "
        + "superano l'errore delle proprie medie non si leggono.",
    });
  }
  if (senzaArbitro) {
    limiti.push({
      ancora: "cap-arbitro",
      capitolo: "Arbitro",
      testo: "L'arbitro non è ancora designato: quando la fonte lo dichiara, la sua scheda e "
        + "il metro della sua lega compaiono nella sua area.",
    });
  }

  if (dice.length === 0 && limiti.length === 0) return null;
  return {
    dice,
    limiti,
    nota: "Qui non c'è nessun numero nuovo: è la rilettura in parole di quello che sta "
      + "sopra. Ogni riga porta al capitolo dove il numero sta, con il suo campione e il "
      + "metro con cui va letto.",
  };
}
