/**
 * La sezione Gol: dai gol attesi di ciascuna squadra a tutti i mercati che ne discendono.
 *
 * Nessuna chiamata alla fonte e nessun modello nuovo da addestrare. Il materiale sono le
 * osservazioni che il motore gia' legge: `expected_goals` prodotto e concesso, riga per
 * riga, piu' le righe della competizione nella stagione come metro.
 *
 * **Il limite del modello, dichiarato qui perche' la pagina deve poterlo dire.** I gol
 * delle due squadre si trattano come due Poisson indipendenti. E' l'approssimazione
 * classica e regge sui totali, ma sottostima i risultati bassi in parita' — lo 0-0 e
 * l'1-1 — perche' nel gioco vero i due punteggi sono correlati. Chi legge una probabilita'
 * di pareggio la legge quindi come un minimo, non come un valore esatto.
 *
 * Questo file non tocca ne' la rete ne' il database: prende numeri e restituisce numeri,
 * cosi' il test lo esercita senza niente acceso.
 */

/**
 * Il tetto della griglia per squadra.
 *
 * Venti e non dieci: con dieci, a 2,54 gol attesi la coda tagliata valeva gia' quattro
 * milionesimi, abbastanza da far sommare i tre esiti a 0,999996 invece che a uno. La
 * distribuzione viene comunque rinormalizzata sotto, cosi' il conto chiude esatto per
 * qualunque valore.
 */
const MAX_GOL = 20;

/** Le linee che la pagina mostra, le stesse su cui si ragiona parlando di una gara. */
const LINEE_TOTALI = [1.5, 2.5, 3.5, 4.5] as const;

/** Gli intervalli del multigol di partita. */
const MULTIGOL_PARTITA: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 4], [3, 5], [3, 6],
  [4, 5], [4, 6], [5, 6],
];

/** Gli intervalli del multigol di squadra: piu' stretti, perche' una squadra sola segna meno. */
const MULTIGOL_SQUADRA: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [2, 4], [2, 5],
];

/**
 * Quota dei gol che si colloca nel primo tempo, usata per derivare i mercati 1T.
 *
 * Le osservazioni del motore non portano i gol attesi per tempo: inventarli da zero
 * sarebbe peggio di una quota dichiarata. 0,44 e' la quota europea tipica dei gol
 * nel primo tempo sul totale (poco sotto la meta', perche' il secondo tempo e' piu'
 * lungo di recupero). Non e' la quota di *questa* gara: e' il ripiego tarato, e la
 * pagina deve dirlo.
 */
export const QUOTA_PRIMO_TEMPO = 0.44;

export interface Intervallo {
  readonly da: number;
  readonly a: number;
  readonly probabilita: number;
}

export interface Linea {
  readonly linea: number;
  readonly sopra: number;
  readonly sotto: number;
}

export interface Risultato {
  readonly casa: number;
  readonly trasferta: number;
  readonly probabilita: number;
}

export interface GolDiSquadra {
  /** I gol attesi: la media della distribuzione, non una previsione secca. */
  readonly attesi: number;
  /** L'intervallo piu' stretto che contiene almeno meta' dei casi. */
  readonly minimo: number;
  readonly massimo: number;
  /** La probabilita' di segnarne esattamente 0, 1, ... fino a cinque. */
  readonly esatti: readonly number[];
  readonly almenoUno: number;
  readonly almenoDue: number;
  readonly multigol: readonly Intervallo[];
}

export interface MercatiGol {
  readonly casa: GolDiSquadra;
  readonly trasferta: GolDiSquadra;
  readonly attesiTotali: number;
  readonly totaliMinimo: number;
  readonly totaliMassimo: number;
  /** 1, X, 2. */
  readonly esito: { readonly uno: number; readonly x: number; readonly due: number };
  /** 1X, X2, 12. */
  readonly doppiaChance: { readonly unoX: number; readonly xDue: number; readonly unoDue: number };
  readonly overUnder: readonly Linea[];
  readonly gg: number;
  readonly ng: number;
  /** I risultati esatti piu' probabili, dal primo al quinto. */
  readonly risultati: readonly Risultato[];
  readonly multigolPartita: readonly Intervallo[];
}

/**
 * La distribuzione di Poisson da 0 a `MAX_GOL`, per ricorrenza, rinormalizzata.
 *
 * La rinormalizzazione non e' cosmetica: senza, la coda tagliata si porta via una briciola
 * di massa e ogni somma di mercati chiude poco sotto l'unita'. Meglio un troncamento
 * dichiarato e chiuso, che una probabilita' che non torna.
 */
function distribuzione(media: number): number[] {
  const p: number[] = [Math.exp(-media)];
  for (let k = 1; k <= MAX_GOL; k += 1) p.push((p[k - 1] * media) / k);
  const massa = p.reduce((somma, valore) => somma + valore, 0);
  return p.map((valore) => valore / massa);
}

/**
 * L'intervallo piu' stretto che contiene almeno meta' dei casi.
 *
 * Non i quartili: la loro soglia secca da' risultati che ballano di un gol per differenze
 * millesimali nella cumulata — a 2,54 gol attesi la cumulata al terzo gol vale 0,7493 e
 * per sette decimillesimi l'intervallo diventerebbe 1-4 invece di 1-3. Questo criterio
 * dice una cosa sola e la dice sempre: dove si concentra la meta' piu' densa dei casi.
 */
function intervalloCentrale(p: readonly number[]): { minimo: number; massimo: number } {
  for (let larghezza = 0; larghezza < p.length; larghezza += 1) {
    let migliore = { minimo: 0, massimo: larghezza, massa: -1 };
    for (let da = 0; da + larghezza < p.length; da += 1) {
      let massa = 0;
      for (let k = da; k <= da + larghezza; k += 1) massa += p[k];
      if (massa > migliore.massa) migliore = { minimo: da, massimo: da + larghezza, massa };
    }
    if (migliore.massa >= 0.5) return { minimo: migliore.minimo, massimo: migliore.massimo };
  }
  return { minimo: 0, massimo: p.length - 1 };
}

/** La probabilita' che il conteggio cada fra `da` e `a`, estremi inclusi. */
function fra(p: readonly number[], da: number, a: number): number {
  let somma = 0;
  for (let k = da; k <= Math.min(a, p.length - 1); k += 1) somma += p[k];
  return somma;
}

function golDiSquadra(p: readonly number[]): GolDiSquadra {
  const { minimo, massimo } = intervalloCentrale(p);
  return {
    attesi: p.reduce((somma, valore, k) => somma + valore * k, 0),
    minimo,
    massimo,
    esatti: p.slice(0, 6),
    almenoUno: 1 - p[0],
    almenoDue: 1 - p[0] - p[1],
    multigol: MULTIGOL_SQUADRA.map(([da, a]) => ({ da, a, probabilita: fra(p, da, a) })),
  };
}

/**
 * Tutti i mercati dei gol, dai gol attesi delle due squadre.
 *
 * Una griglia sola, percorsa una volta: ogni mercato e' una somma diversa sulle stesse
 * caselle. Vedi la nota in testa al file per il limite dell'indipendenza.
 */
export function mercatiGol(attesiCasa: number, attesiTrasferta: number): MercatiGol {
  const pc = distribuzione(attesiCasa);
  const pt = distribuzione(attesiTrasferta);

  let uno = 0;
  let x = 0;
  let due = 0;
  const risultati: Risultato[] = [];
  // La distribuzione del totale: la casella (i, j) contribuisce alla somma i + j.
  const totale = new Array<number>(MAX_GOL * 2 + 1).fill(0);

  for (let i = 0; i <= MAX_GOL; i += 1) {
    for (let j = 0; j <= MAX_GOL; j += 1) {
      const probabilita = pc[i] * pt[j];
      if (i > j) uno += probabilita;
      else if (i === j) x += probabilita;
      else due += probabilita;
      totale[i + j] += probabilita;
      risultati.push({ casa: i, trasferta: j, probabilita });
    }
  }

  risultati.sort((a, b) => b.probabilita - a.probabilita);
  const centraleTotale = intervalloCentrale(totale);

  return {
    casa: golDiSquadra(pc),
    trasferta: golDiSquadra(pt),
    attesiTotali: attesiCasa + attesiTrasferta,
    totaliMinimo: centraleTotale.minimo,
    totaliMassimo: centraleTotale.massimo,
    esito: { uno, x, due },
    doppiaChance: { unoX: uno + x, xDue: x + due, unoDue: uno + due },
    overUnder: LINEE_TOTALI.map((linea) => {
      const sopra = fra(totale, Math.ceil(linea), totale.length - 1);
      return { linea, sopra, sotto: 1 - sopra };
    }),
    // Entrambe segnano: indipendenza, ed e' il punto in cui l'approssimazione pesa di piu'.
    gg: (1 - pc[0]) * (1 - pt[0]),
    ng: 1 - (1 - pc[0]) * (1 - pt[0]),
    risultati: risultati.slice(0, 5),
    multigolPartita: MULTIGOL_PARTITA.map(([da, a]) => ({
      da, a, probabilita: fra(totale, da, a),
    })),
  };
}

/**
 * Gli stessi mercati, ma sul primo tempo.
 *
 * Si riapplica la stessa griglia Poisson agli attesi scalati per `QUOTA_PRIMO_TEMPO`.
 * Non e' un secondo modello: e' la stessa lettura, tagliata a 45'.
 */
export function mercatiPrimoTempo(
  attesiCasa: number,
  attesiTrasferta: number,
  quota = QUOTA_PRIMO_TEMPO,
): MercatiGol {
  return mercatiGol(attesiCasa * quota, attesiTrasferta * quota);
}

/**
 * Quante gare fittizie alla media di lega si sommano al campione vero.
 *
 * Senza questo peso il conto moltiplicativo esplode sui campioni minuscoli: misurato su
 * Go Ahead Eagles - ADO Den Haag il 23 agosto, con **una gara per lato**, dava 4,55 gol
 * attesi alla squadra di casa, vittoria al 95% e Over 4,5 al 59%. Non era una previsione
 * ardita: era una gara sola moltiplicata per un'altra gara sola.
 *
 * Con quattro, una squadra che ha giocato una volta pesa per un quinto e la lega per
 * quattro quinti; a dieci gare la squadra pesa per il 71%. Il numero cresce con la
 * stagione invece di sparare dal primo turno.
 */
const GARE_DI_ANCORAGGIO = 4;

export interface Forza {
  readonly media: number;
  readonly campione: number;
}

export interface ForzeDellaGara {
  /** Gol attesi prodotti dalla casa, nelle sue gare in casa. */
  readonly attaccoCasa: Forza;
  /** Gol attesi concessi dalla casa, nelle sue gare in casa. */
  readonly difesaCasa: Forza;
  readonly attaccoTrasferta: Forza;
  readonly difesaTrasferta: Forza;
  /** Il metro: la media della competizione nella stagione, per lato. */
  readonly legaCasa: number;
  readonly legaTrasferta: number;
}

/**
 * La media di una squadra riportata verso il metro di lega in proporzione al campione.
 *
 * Poche gare, quasi tutto metro; molte gare, quasi tutta squadra. E' la correzione
 * classica per le medie su campioni piccoli, e qui non e' un abbellimento: senza, il
 * prodotto dice numeri che nessuno crederebbe.
 */
function ancorata(forza: Forza, metro: number): number {
  const peso = forza.campione / (forza.campione + GARE_DI_ANCORAGGIO);
  return peso * forza.media + (1 - peso) * metro;
}

/**
 * I gol attesi della gara, dalle forze delle due squadre misurate contro il metro di lega.
 *
 * Il conto e' quello classico: quanto una squadra produce sopra o sotto la media, per
 * quanto l'avversaria concede sopra o sotto la media, riportato alla media stessa. Il
 * vantaggio del campo non e' un coefficiente aggiunto a mano: sta gia' dentro `legaCasa` e
 * `legaTrasferta`, che sono due numeri diversi perche' misurati sui due lati.
 *
 * Restituisce `null` se il metro non esiste: senza una media di lega positiva il rapporto
 * non e' definito, e un'assenza non diventa zero.
 */
export function attesiDellaGara(forze: ForzeDellaGara): { casa: number; trasferta: number } | null {
  if (!(forze.legaCasa > 0) || !(forze.legaTrasferta > 0)) return null;
  // Ogni forza passa prima dall'ancoraggio: e' li' che un campione di una gara smette di
  // pesare come una stagione intera.
  const attaccoCasa = ancorata(forze.attaccoCasa, forze.legaCasa);
  const difesaTrasferta = ancorata(forze.difesaTrasferta, forze.legaCasa);
  const attaccoTrasferta = ancorata(forze.attaccoTrasferta, forze.legaTrasferta);
  const difesaCasa = ancorata(forze.difesaCasa, forze.legaTrasferta);
  // (attacco / metro) x (difesa avversaria / metro) x metro, semplificato: i due rapporti
  // sono forze relative al metro dello **stesso lato**, e il metro torna una volta sola.
  return {
    casa: (attaccoCasa * difesaTrasferta) / forze.legaCasa,
    trasferta: (attaccoTrasferta * difesaCasa) / forze.legaTrasferta,
  };
}
