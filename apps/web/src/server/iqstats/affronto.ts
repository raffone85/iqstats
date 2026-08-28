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
  readonly chiave: string;
  readonly nome: string;
  readonly produce: NumeroDiLato;
  readonly concede: NumeroDiLato;
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
  /** Che partita ne esce, in una riga sola: e' quello che si legge in cinque secondi. */
  readonly titolo: string;
  /** Il commento prepartita: due o tre frasi, con dentro i numeri che le reggono. */
  readonly commento: readonly string[];
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
    chiave: c.chiave,
    nome: c.nome,
    produce: c.produce,
    concede: c.concede,
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
 * Come si dice a parole quello che il numero ha detto.
 *
 * **Una parola per ogni verso, dichiarata qui e non scritta a mano.** Il verso e' quello
 * che **entrambi** i lati condividono: se chi attacca fa meno passaggi della media del suo
 * lato e chi difende ne concede meno della media del suo, in quella fase di gioco i
 * passaggi saranno pochi - ed e' questo che la frase dice, non un giudizio sulle squadre.
 *
 * E' l'unico punto del capitolo in cui un numero diventa un'etichetta, e per questo la
 * corrispondenza sta in tabella: il difetto peggiore delle schermate di riferimento e'
 * un'etichetta che contraddice il numero che le sta sotto, e qui l'etichetta **e'** il
 * numero, tradotto. La prova che la regge sta nella riga subito dopo.
 *
 * `[sotto, sopra]`.
 */
const VOCABOLARIO: Readonly<Record<string, {
  readonly su: string;
  readonly sotto: string;
  readonly sopra: string;
  /**
   * In quale fase si fa questa cosa: `"attacco"` la fa chi ha la palla, `"difesa"` chi non
   * ce l'ha, `null` quando la fa chiunque.
   *
   * **Serve a non scrivere una falsita'.** Il confronto e' sempre «quello che una squadra
   * fa» contro «quello che fanno gli avversari dell'altra», e le due cose accadono nella
   * stessa fase - ma quale sia dipende dalla metrica. I passaggi li fa chi ha la palla,
   * quindi la fase e' l'attacco di chi produce; gli intercetti li fa chi la palla non ce
   * l'ha, quindi la stessa riga descrive l'attacco dell'**altra**. «Quando attacca
   * Fluminense» sopra gli intercetti del Fluminense era falso, ed e' uscito leggendo gli
   * esempi generati, non il codice.
   */
  readonly fase: "attacco" | "difesa" | null;
}>> = {
  passaggi: { su: "Sui passaggi", sotto: "poco palleggio", sopra: "molto palleggio", fase: "attacco" },
  precisione: { su: "Sulla precisione dei passaggi", sotto: "molti palloni persi", sopra: "palloni puliti", fase: "attacco" },
  palle_lunghe: { su: "Sulle palle lunghe", sotto: "si costruisce da dietro", sopra: "si gioca lungo", fase: "attacco" },
  ultimo_terzo: { su: "Sugli ingressi in ultimo terzo", sotto: "si fatica ad arrivare davanti", sopra: "campo guadagnato spesso", fase: "attacco" },
  tocchi_area: { su: "Sui tocchi in area", sotto: "poca presenza in area", sopra: "molto traffico in area", fase: "attacco" },
  cross: { su: "Sui cross", sotto: "pochi cross", sopra: "tanti cross", fase: "attacco" },
  quota_area: { su: "Sui tiri dall'area", sotto: "si tira da fuori", sopra: "si tira da dentro l'area", fase: "attacco" },
  distanza_tiro: { su: "Sulla distanza del tiro", sotto: "conclusioni ravvicinate", sopra: "conclusioni da lontano", fase: "attacco" },
  qualita_tiro: { su: "Sulla qualità del tiro", sotto: "occasioni di poco peso", sopra: "occasioni pesanti", fase: "attacco" },
  quota_murati: { su: "Sui tiri murati", sotto: "pochi tiri respinti", sopra: "tanti tiri respinti", fase: "attacco" },
  tackle: { su: "Sui tackle", sotto: "pochi contrasti", sopra: "contrasti duri", fase: "difesa" },
  intercetti: { su: "Sugli intercetti", sotto: "linee di passaggio libere", sopra: "linee di passaggio chiuse", fase: "difesa" },
  recuperi: { su: "Sui recuperi", sotto: "palloni che restano dove sono", sopra: "palloni che cambiano padrone", fase: "difesa" },
  // Un duello lo giocano in due e nessuna delle due lo fa «in attacco»: senza una fase
  // vera non se ne dichiara una falsa, e la frase la lascia fuori.
  duelli: { su: "Sui duelli", sotto: "gioco continuo", sopra: "partita spezzettata", fase: null },
};

function parolaDi(f: Forte): string | null {
  const v = VOCABOLARIO[f.chiave];
  if (v === undefined) return null;
  return f.verso === 1 ? v.sopra : v.sotto;
}

/**
 * Come si nomina la metrica dentro una frase.
 *
 * La preposizione sta in tabella e non si costruisce: «Sui intercetti» e «Sui precisione»
 * sono due errori veri, visti negli esempi generati e non nel codice. Senza la voce in
 * tabella si ripiega sul nome nudo, che e' brutto ma non sgrammaticato.
 */
function suDi(f: Forte): string {
  return VOCABOLARIO[f.chiave]?.su ?? f.nome;
}

/** In quale attacco succede quello che la riga descrive, o `null` se la metrica non lo dice. */
function faseDi(f: Forte): string | null {
  const fase = VOCABOLARIO[f.chiave]?.fase ?? null;
  if (fase === null) return null;
  return fase === "attacco" ? f.chiAttacca : f.chiDifende;
}

/**
 * Il commento prepartita: un titolo che si legge in cinque secondi e due o tre frasi.
 *
 * **Il titolo dice che partita ne esce**, con al massimo due tratti presi dal vocabolario,
 * e nomina chi attacca solo quando tutte le prove guardano nella stessa direzione: dirlo
 * quando le prove stanno da tutt'e due le parti sarebbe scegliere invece di misurare.
 *
 * **Il commento non prevede il risultato e non ne parla.** Questo capitolo misura come si
 * gioca, non chi vince: qui si dice cosa dovrebbe assomigliare la partita se le due
 * squadre continuano a fare quello che hanno fatto finora, e quel «se» resta scritto.
 * Nessun numero nuovo: ogni cifra della prosa sta anche nella riga del riquadro.
 */
export function cappelloDi(letture: readonly Lettura[]): Cappello | null {
  if (letture.length === 0) return null;
  const forti = letture
    .filter((l): l is Lettura & { forte: Forte } => l.forte !== null)
    .sort((x, y) => y.forte.forza - x.forte.forza);
  const mute = letture.filter((l) => l.forte === null).map((l) => l.nome);
  const elenco = (nomi: readonly string[]) => nomi.length === 1
    ? nomi[0]
    : `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;

  if (forti.length === 0) {
    return {
      titolo: "Numeri troppo vicini per separare le due squadre.",
      commento: [
        "Nessuno dei confronti di questo capitolo supera l'errore delle proprie medie: su "
        + "questa gara i nostri numeri non dicono da che parte pende, e una differenza "
        + "dentro il rumore non è una differenza. Le medie restano, riquadro per riquadro, "
        + "con il loro metro e il loro campione.",
      ],
      rigaBreve: null,
    };
  }

  const primo = forti[0]!.forte;
  const secondo = forti[1]?.forte ?? null;
  // La direzione del titolo e' la **fase**, non chi produce il numero: e sta nel titolo solo
  // se tutte le prove guardano la stessa, quella compresa che non ne dichiara nessuna.
  const fasi = forti.map((l) => faseDi(l.forte));
  const dove = fasi.every((f) => f !== null && f === fasi[0]) && fasi[0] !== null
    ? ` quando attacca ${fasi[0]}`
    : "";
  const tratti = [parolaDi(primo), secondo === null ? null : parolaDi(secondo)]
    .filter((t): t is string => t !== null);
  // Maiuscola iniziale: e' un titolo, non la coda di una frase. E i tratti si legano con
  // «e», non con la virgola: due etichette separate da virgola sembrano un elenco troncato.
  const grezzo = tratti.length === 0
    ? `Le due squadre si separano su ${elenco(forti.map((l) => l.nome))}`
    : `${tratti.join(" e ")}${dove}`;
  const titolo = `${grezzo.charAt(0).toUpperCase()}${grezzo.slice(1)}.`;

  // **Niente articolo davanti ai numeri.** «contro i 8,2» e' sbagliato e «contro gli 8,2»
  // dipende da come si legge la cifra: l'articolo si toglie, e la frase resta giusta
  // qualunque numero arrivi.
  // **«Gli avversari di Y», non «Y concede».** E' quello che il numero e' davvero - il
  // valore registrato da chi gioca contro Y dal suo lato - ed e' vero per ogni metrica,
  // anche per quelle che Y non «concede» in nessun senso, come gli intercetti.
  const frase = (f: Forte, primaVolta: boolean) => {
    const verso = f.verso === 1 ? "sopra" : "sotto";
    const fase = faseDi(f);
    const quando = fase === null ? "" : `, quando attacca ${fase},`;
    const apre = primaVolta
      ? `${suDi(f)}${quando} i due numeri vanno tutt'e due ${verso} il metro del loro lato: `
      : `Stessa direzione. ${suDi(f)}${quando} `;
    return apre
      + `${f.chiAttacca} ne fa ${f.produce.testo} contro ${f.produce.metro} delle squadre `
      + `del suo lato, e gli avversari di ${f.chiDifende} ne fanno ${f.concede.testo} `
      + `contro ${f.concede.metro} del suo. Su ${f.campione} gare.`;
  };

  const commento = [
    "È quello che dicono i numeri se le due squadre continuano a fare quello che hanno "
    + "fatto finora, e riguarda come si gioca: del risultato non dice niente.",
    frase(primo, true),
    ...(secondo === null ? [] : [frase(secondo, false)]),
    ...(mute.length > 0
      ? [`Su ${elenco(mute)} i numeri non separano le due squadre: lì la differenza sta `
        + "dentro l'errore delle medie, e non c'è niente da leggere."]
      : []),
  ];

  return {
    titolo,
    commento,
    rigaBreve: `Come si affrontano: ${grezzo}`
      + ` — ${primo.nome.toLowerCase()} ${primo.produce.testo} contro ${primo.produce.metro} `
      + `e ${primo.concede.testo} contro ${primo.concede.metro}, su ${primo.campione} gare.`,
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
