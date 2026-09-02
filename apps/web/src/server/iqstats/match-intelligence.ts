// Server-only: il dossier che tiene insieme tutte le letture della gara.
//
// **Non e' un motore e non calcola probabilita'.** Ogni numero qui dentro arriva gia'
// calcolato da chi lo sa fare: il motore di proiezione per i bersagli, `projection/gol` per
// i mercati dei gol, `tempi` per i due tempi, `match-picks` per il margine sul mercato.
// Quello che questo modulo aggiunge, e che prima non faceva nessuno, e' **contare quante
// letture indipendenti dicono la stessa cosa**.
//
// **Le quattro categorie sono dichiarate, non pesate.** Una convergenza forte vuole almeno
// tre fonti d'accordo e nessuna contraria; una convergenza ne vuole due; un conflitto basta
// che una fonte dica il contrario in modo netto. Non c'e' un punteggio composito, perche'
// sommare una probabilita' a una frequenza storica darebbe un numero che non significa
// niente.
//
// **Il valore resta separato dal segnale.** Un segnale statistico forte su un esito che il
// mercato prezza uguale non e' un'occasione, e un margine su una lettura fiacca non e' un
// segnale: le due cose stanno in due campi diversi e non si fondono mai.
import "server-only";

import type { MatchPick } from "./match-picks.ts";
import type { MercatiGol } from "./projection/gol.ts";
import type { ProiezioneDiGara } from "./projection/match.ts";
import { previstaDalModello } from "./projection/match.ts";
import type { MedieDelTempo, TempiDellaGara } from "./tempi.ts";

/** Quanto una fonte deve staccarsi dalla parita' per contare come voce a favore. */
const NETTO = 0.55;

export type Convergenza = "forte" | "convergenza" | "neutrale" | "conflitto";

export interface FonteDelSegnale {
  readonly nome: string;
  /** Quanto quella fonte sostiene l'affermazione, da 0 a 1. */
  readonly valore: number;
  readonly favorevole: boolean;
  readonly contraria: boolean;
}

export interface Segnale {
  readonly titolo: string;
  /** La probabilita' del modello che lo ha prodotto, da 0 a 100. */
  readonly probabilita: number;
  readonly convergenza: Convergenza;
  readonly fonti: readonly FonteDelSegnale[];
  /** Da 0 a 100 dove il bersaglio la porta misurata, altrimenti assente. */
  readonly affidabilita: number | null;
  readonly campione: number | null;
  /** La probabilita' implicita del mercato, dove quell'esito e' quotato. */
  readonly mercato: number | null;
  readonly margine: number | null;
  readonly perche: string;
}

export interface MatchIntelligence {
  readonly principale: Segnale | null;
  readonly secondo: Segnale | null;
  readonly conflitti: readonly Segnale[];
  /** Il miglior candidato di valore, che **non** e' il segnale principale. */
  readonly candidatoDiValore: MatchPick | null;
  readonly tutti: readonly Segnale[];
}

function fonte(nome: string, valore: number | null): FonteDelSegnale | null {
  if (valore === null || !Number.isFinite(valore)) return null;
  return {
    nome,
    valore: Math.round(valore * 1000) / 1000,
    favorevole: valore >= NETTO,
    contraria: valore <= 1 - NETTO,
  };
}

/**
 * La categoria di un segnale, dalle sole fonti che dicono qualcosa.
 *
 * Le fonti tiepide - quelle che stanno attorno alla parita' - non contano ne' da una parte
 * ne' dall'altra: contarle come favorevoli gonfierebbe ogni convergenza.
 */
function convergenzaDi(fonti: readonly FonteDelSegnale[]): Convergenza {
  const pro = fonti.filter((f) => f.favorevole).length;
  const contro = fonti.filter((f) => f.contraria).length;
  if (contro > 0 && pro > 0) return "conflitto";
  if (contro > 0) return "conflitto";
  if (pro >= 3) return "forte";
  if (pro === 2) return "convergenza";
  return "neutrale";
}

function quotaSopra(mercati: MercatiGol | null, linea: number): number | null {
  const trovata = mercati?.overUnder.find((l) => l.linea === linea);
  return trovata === undefined ? null : trovata.sopra;
}

/** La quota di gare in cui in quel tempo si e' segnato, dal punto di vista giusto. */
function conGol(medie: MedieDelTempo | undefined): number | null {
  return medie === undefined || medie.gare === 0 ? null : medie.conGol;
}

function segnaleDeiTempi(
  tempi: TempiDellaGara,
  meta: "primo" | "secondo",
  implicita: number | null,
): Segnale | null {
  const mercati = tempi.mercati[meta];
  const probabilita = quotaSopra(mercati, 0.5);
  if (probabilita === null) return null;

  const fonti = [
    fonte("proiezione del tempo", probabilita),
    fonte(`${tempi.casa.nome}, in casa`, conGol(tempi.casa.stagione[meta])),
    fonte(`${tempi.trasferta.nome}, in trasferta`, conGol(tempi.trasferta.stagione[meta])),
    fonte("il campionato", conGol(tempi.lega[meta])),
    fonte("ultime cinque in casa", conGol(tempi.casa.ultime5?.[meta])),
  ].filter((f): f is FonteDelSegnale => f !== null);

  const nome = meta === "primo" ? "primo tempo" : "secondo tempo";
  return {
    titolo: `Almeno un gol nel ${nome}`,
    probabilita: Math.round(probabilita * 1000) / 10,
    convergenza: convergenzaDi(fonti),
    fonti,
    // I mercati dei gol non portano una copertura misurata: resta assente, non alta.
    affidabilita: null,
    campione: Math.min(tempi.casa.stagione[meta].gare, tempi.trasferta.stagione[meta].gare),
    mercato: implicita,
    margine:
      implicita === null
        ? null
        : Math.round((probabilita * 100 - implicita) * 10) / 10,
    perche: `Nel ${nome} si segna nel ${Math.round(tempi.lega[meta].conGol * 100)}% delle gare di questo campionato, su ${tempi.gareDiLega} guardate.`,
  };
}

/**
 * I segnali dei sette bersagli: la linea piu' netta di ciascuno, con l'affidabilita' che il
 * motore gia' porta e le letture di contorno che la sostengono o la contraddicono.
 */
function segnaliDeiBersagli(
  bersagli: readonly ProiezioneDiGara[],
  nomi: Readonly<Record<string, string>>,
): Segnale[] {
  const fuori: Segnale[] = [];
  for (const proiezione of bersagli) {
    const totale = proiezione.totale;
    if (totale === null || totale.linee === null) continue;
    let migliore: { probabilita: number; sopra: boolean; soglia: number } | null = null;
    for (const linea of totale.linee) {
      const sopra = linea.probabilitaSopra >= linea.probabilitaSotto;
      const probabilita = sopra ? linea.probabilitaSopra : linea.probabilitaSotto;
      if (probabilita < NETTO) continue;
      if (migliore === null || probabilita > migliore.probabilita) {
        migliore = { probabilita, sopra, soglia: linea.soglia };
      }
    }
    if (migliore === null) continue;

    const gare = [proiezione.casa, proiezione.trasferta]
      .filter(previstaDalModello)
      .map((lato) => lato.evidenze.garePrecedenti)
      .filter((g): g is number => typeof g === "number");
    const fonti = [
      fonte("il modello del bersaglio", migliore.probabilita),
      totale.affidabilita === null
        ? null
        : fonte(
            "quanto quel modello regge fuori campione",
            totale.affidabilita.punteggio / 100,
          ),
    ].filter((f): f is FonteDelSegnale => f !== null);

    const nome = nomi[proiezione.target] ?? proiezione.target;
    fuori.push({
      titolo: `${migliore.sopra ? "Più" : "Meno"} di ${String(migliore.soglia).replace(".", ",")} ${nome.toLowerCase()}`,
      probabilita: Math.round(migliore.probabilita * 1000) / 10,
      convergenza: convergenzaDi(fonti),
      fonti,
      affidabilita: totale.affidabilita?.punteggio ?? null,
      campione: gare.length === 2 ? Math.min(...gare) : null,
      mercato: null,
      margine: null,
      perche: totale.perche,
    });
  }
  return fuori;
}

/** L'ordine con cui un segnale conta: prima la convergenza, poi l'affidabilita'. */
const PESO: Record<Convergenza, number> = { forte: 3, convergenza: 2, neutrale: 1, conflitto: 0 };

/**
 * Il dossier della gara: i segnali messi in fila, il conflitto dichiarato, il valore a
 * parte.
 *
 * Non ritorna mai `null`: una gara senza segnali e' una gara con l'elenco vuoto, e la
 * pagina lo dice invece di non mostrare la sezione.
 */
export function matchIntelligence(args: {
  readonly tempi: TempiDellaGara | null;
  readonly bersagli: readonly ProiezioneDiGara[];
  readonly nomiBersagli: Readonly<Record<string, string>>;
  readonly picks: readonly MatchPick[];
  /** La probabilita' implicita del mercato sull'over 0,5 del primo tempo, dove esiste. */
  readonly implicitaPrimoTempo?: number | null;
}): MatchIntelligence {
  const segnali: Segnale[] = [];

  if (args.tempi !== null) {
    const primo = segnaleDeiTempi(args.tempi, "primo", args.implicitaPrimoTempo ?? null);
    if (primo) segnali.push(primo);
    const secondo = segnaleDeiTempi(args.tempi, "secondo", null);
    if (secondo) segnali.push(secondo);
  }
  segnali.push(...segnaliDeiBersagli(args.bersagli, args.nomiBersagli));

  const ordinati = [...segnali].sort((a, b) => {
    const peso = PESO[b.convergenza] - PESO[a.convergenza];
    if (peso !== 0) return peso;
    const affidabilita = (b.affidabilita ?? 0) - (a.affidabilita ?? 0);
    if (affidabilita !== 0) return affidabilita;
    return b.probabilita - a.probabilita;
  });

  const buoni = ordinati.filter((s) => s.convergenza !== "conflitto");
  const conflitti = ordinati.filter((s) => s.convergenza === "conflitto");

  // Il candidato di valore e' il margine piu' largo fra le letture quotate, e resta
  // separato dal segnale: puo' benissimo non essere lo stesso esito.
  const candidati = args.picks
    .filter((p) => p.edge !== null && p.edge > 0)
    .sort((a, b) => (b.edge as number) - (a.edge as number));

  return {
    principale: buoni[0] ?? null,
    secondo: buoni[1] ?? null,
    conflitti,
    candidatoDiValore: candidati[0] ?? null,
    tutti: ordinati,
  };
}
