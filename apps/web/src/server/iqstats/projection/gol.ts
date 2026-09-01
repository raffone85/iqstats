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

const MAX_GOL = 20;
const LINEE_TOTALI = [1.5, 2.5, 3.5, 4.5] as const;
const MULTIGOL_PARTITA: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 4], [3, 5], [3, 6],
  [4, 5], [4, 6], [5, 6],
];
const MULTIGOL_SQUADRA: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [2, 4], [2, 5],
];

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
  readonly attesi: number;
  readonly minimo: number;
  readonly massimo: number;
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
  readonly esito: { readonly uno: number; readonly x: number; readonly due: number };
  readonly doppiaChance: { readonly unoX: number; readonly xDue: number; readonly unoDue: number };
  readonly overUnder: readonly Linea[];
  readonly gg: number;
  readonly ng: number;
  readonly risultati: readonly Risultato[];
  readonly multigolPartita: readonly Intervallo[];
}

function distribuzione(media: number): number[] {
  const p: number[] = [Math.exp(-media)];
  for (let k = 1; k <= MAX_GOL; k += 1) p.push((p[k - 1] * media) / k);
  const massa = p.reduce((somma, valore) => somma + valore, 0);
  return p.map((valore) => valore / massa);
}

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

export function mercatiGol(attesiCasa: number, attesiTrasferta: number): MercatiGol {
  const pc = distribuzione(attesiCasa);
  const pt = distribuzione(attesiTrasferta);

  let uno = 0;
  let x = 0;
  let due = 0;
  const risultati: Risultato[] = [];
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
    gg: (1 - pc[0]) * (1 - pt[0]),
    ng: 1 - (1 - pc[0]) * (1 - pt[0]),
    risultati: risultati.slice(0, 5),
    multigolPartita: MULTIGOL_PARTITA.map(([da, a]) => ({
      da, a, probabilita: fra(totale, da, a),
    })),
  };
}

const GARE_DI_ANCORAGGIO = 4;

export interface Forza {
  readonly media: number;
  readonly campione: number;
}

export interface ForzeDellaGara {
  readonly attaccoCasa: Forza;
  readonly difesaCasa: Forza;
  readonly attaccoTrasferta: Forza;
  readonly difesaTrasferta: Forza;
  readonly legaCasa: number;
  readonly legaTrasferta: number;
}

function ancorata(forza: Forza, metro: number): number {
  const peso = forza.campione / (forza.campione + GARE_DI_ANCORAGGIO);
  return peso * forza.media + (1 - peso) * metro;
}

export function attesiDellaGara(forze: ForzeDellaGara): { casa: number; trasferta: number } | null {
  if (!(forze.legaCasa > 0) || !(forze.legaTrasferta > 0)) return null;
  const attaccoCasa = ancorata(forze.attaccoCasa, forze.legaCasa);
  const difesaTrasferta = ancorata(forze.difesaTrasferta, forze.legaCasa);
  const attaccoTrasferta = ancorata(forze.attaccoTrasferta, forze.legaTrasferta);
  const difesaCasa = ancorata(forze.difesaCasa, forze.legaTrasferta);
  return {
    casa: (attaccoCasa * difesaTrasferta) / forze.legaCasa,
    trasferta: (attaccoTrasferta * difesaCasa) / forze.legaTrasferta,
  };
}

/** Quota europea dei gol prima dell'intervallo. Non e' la misura di una coppia. */
export const QUOTA_PRIMO_TEMPO = 0.44;
export const QUOTA_SECONDO_TEMPO = 1 - QUOTA_PRIMO_TEMPO;

export function mercatiPrimoTempo(attesiCasa: number, attesiTrasferta: number): MercatiGol {
  return mercatiGol(attesiCasa * QUOTA_PRIMO_TEMPO, attesiTrasferta * QUOTA_PRIMO_TEMPO);
}

export function mercatiSecondoTempo(attesiCasa: number, attesiTrasferta: number): MercatiGol {
  return mercatiGol(attesiCasa * QUOTA_SECONDO_TEMPO, attesiTrasferta * QUOTA_SECONDO_TEMPO);
}
