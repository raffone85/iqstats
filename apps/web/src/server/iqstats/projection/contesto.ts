/**
 * Il contesto della gara: da dove nascono i numeri che la pagina mostra.
 *
 * **Esisteva gia', e non si vedeva.** `gruppi.ts` dichiara sette famiglie di contesto e il
 * motore le calcola su trentanove colonne di `team_match_observations` per darle in pasto
 * ai modelli. Nessuna arrivava in pagina: chi leggeva «tiri attesi 17,0» non poteva sapere
 * se quel numero nascesse da una squadra che arriva in area o da una che tira da fuori.
 *
 * **Si accoppia chi produce con chi concede.** Un tiro nasce dall'incontro fra chi lo
 * tira e chi lo lascia tirare: mostrare solo la produzione della squadra di casa direbbe
 * meta' della storia. Ogni riga mette la produzione di una squadra accanto a quanto
 * l'altra concede, ciascuna dal proprio lato del campo.
 *
 * **La finestra e' di 365 giorni**, la stessa scelta per le statistiche descrittive. Non e'
 * la stagione: nei cinque campionati principali la stagione in corso ha una o due gare a
 * squadra, e un contesto costruito li' sarebbe una serata, non un modo di giocare.
 *
 * **Le colonne sono piene all'87%**, misurato su 21.292 righe. Dove una metrica manca la
 * riga non compare: un'assenza non diventa uno zero.
 *
 * Zero interrogazioni nuove: sono le righe che il motore legge gia' per proiettare.
 */
import type { Lato } from './asof/contratto';
import type { OsservazioneSquadraGara } from './snapshot';

/** Quanto indietro si guarda. La stessa finestra delle statistiche descrittive. */
const GIORNI = 365;

/** Sotto questo campione una media non si dichiara: sarebbe un aneddoto. */
const CAMPIONE_MINIMO = 4;

interface Metrica {
  readonly chiave: string;
  readonly nome: string;
  /** `true` quando il valore e' gia' una percentuale e non va letto come un conteggio. */
  readonly percentuale?: boolean;
}

/**
 * Le famiglie, con i nomi che si leggono in pagina.
 *
 * Sono le stesse di `gruppi.ts`, ridotte alle metriche che spiegano qualcosa a chi legge:
 * il pannello intero e' trentanove colonne, e una tabella da trentanove righe non e' una
 * spiegazione, e' un riversamento.
 */
export const FAMIGLIE_DI_CONTESTO: ReadonlyArray<{
  readonly nome: string;
  readonly metriche: readonly Metrica[];
}> = [
  {
    nome: "Come circola la palla",
    metriche: [
      { chiave: "ball_possession", nome: "Possesso", percentuale: true },
      { chiave: "pass_accuracy_pct", nome: "Passaggi riusciti", percentuale: true },
      { chiave: "long_balls_total", nome: "Lanci lunghi" },
    ],
  },
  {
    nome: "Dove arriva",
    metriche: [
      { chiave: "final_third_entries", nome: "Ingressi nell'ultimo terzo" },
      { chiave: "touches_in_penalty_area", nome: "Tocchi in area" },
      { chiave: "crosses_total", nome: "Cross" },
    ],
  },
  {
    nome: "Quanto si lotta",
    metriche: [
      { chiave: "duels", nome: "Duelli" },
      { chiave: "aerial_duels_total", nome: "Duelli aerei" },
      { chiave: "tackles", nome: "Contrasti" },
      { chiave: "interceptions", nome: "Intercetti" },
      { chiave: "recoveries", nome: "Recuperi" },
    ],
  },
  {
    nome: "Da dove tira",
    metriche: [
      { chiave: "shots_inside_box", nome: "Tiri dentro l'area" },
      { chiave: "shots_outside_box", nome: "Tiri da fuori" },
      { chiave: "big_chances", nome: "Grandi occasioni" },
    ],
  },
  {
    nome: "Palle inattive",
    metriche: [
      { chiave: "free_kicks", nome: "Punizioni" },
      { chiave: "throw_ins", nome: "Rimesse laterali" },
    ],
  },
];

export interface VoceDiContesto {
  readonly nome: string;
  readonly percentuale: boolean;
  /** Quanto ne produce la squadra di casa, nelle sue gare in casa. */
  readonly casaProduce: number | null;
  /** Quanto ne concede la squadra ospite, nelle sue gare fuori casa. */
  readonly trasfertaConcede: number | null;
  /** Gli stessi due numeri a parti invertite. */
  readonly trasfertaProduce: number | null;
  readonly casaConcede: number | null;
  /** La media della competizione sul lato di casa, come riferimento. */
  readonly metroCasa: number | null;
  readonly metroTrasferta: number | null;
  /** Il campione piu' piccolo fra quelli usati nella riga. */
  readonly campione: number;
}

export interface FamigliaResa {
  readonly nome: string;
  readonly voci: readonly VoceDiContesto[];
}

/** La media di una metrica su un lato, dentro la finestra. `null` sotto il campione minimo. */
function media(
  righe: readonly OsservazioneSquadraGara[],
  verso: "prodotte" | "concesse",
  metrica: string,
  lato: Lato,
  dopo: string,
): { valore: number; campione: number } | null {
  let somma = 0;
  let campione = 0;
  for (const r of righe) {
    if (r.lato !== lato || r.quando < dopo) continue;
    const valore = r[verso][metrica];
    if (valore === null || valore === undefined) continue;
    somma += valore;
    campione += 1;
  }
  return campione < CAMPIONE_MINIMO ? null : { valore: somma / campione, campione };
}

/** L'istante da cui in poi una gara entra nella finestra. */
function inizioFinestra(quando: string): string {
  const data = new Date(quando);
  if (Number.isNaN(data.getTime())) return "";
  data.setUTCDate(data.getUTCDate() - GIORNI);
  return data.toISOString();
}

/**
 * Il contesto della gara, famiglia per famiglia.
 *
 * Una riga entra solo se ha almeno uno dei quattro numeri: una riga tutta vuota non e'
 * un'informazione, e una famiglia senza righe non compare affatto.
 */
export function contestoDellaGara(
  righeCasa: readonly OsservazioneSquadraGara[],
  righeTrasferta: readonly OsservazioneSquadraGara[],
  righeLega: readonly OsservazioneSquadraGara[],
  quandoSiGioca: string,
): readonly FamigliaResa[] {
  const dopo = inizioFinestra(quandoSiGioca);
  if (dopo === "") return [];

  const fuori: FamigliaResa[] = [];
  for (const famiglia of FAMIGLIE_DI_CONTESTO) {
    const voci: VoceDiContesto[] = [];
    for (const m of famiglia.metriche) {
      const cp = media(righeCasa, "prodotte", m.chiave, "home", dopo);
      const tc = media(righeTrasferta, "concesse", m.chiave, "away", dopo);
      const tp = media(righeTrasferta, "prodotte", m.chiave, "away", dopo);
      const cc = media(righeCasa, "concesse", m.chiave, "home", dopo);
      const mc = media(righeLega, "prodotte", m.chiave, "home", dopo);
      const mt = media(righeLega, "prodotte", m.chiave, "away", dopo);

      const campioni = [cp, tc, tp, cc].filter((v) => v !== null).map((v) => v.campione);
      if (campioni.length === 0) continue;

      voci.push({
        nome: m.nome,
        percentuale: m.percentuale === true,
        casaProduce: cp?.valore ?? null,
        trasfertaConcede: tc?.valore ?? null,
        trasfertaProduce: tp?.valore ?? null,
        casaConcede: cc?.valore ?? null,
        metroCasa: mc?.valore ?? null,
        metroTrasferta: mt?.valore ?? null,
        campione: Math.min(...campioni),
      });
    }
    if (voci.length > 0) fuori.push({ nome: famiglia.nome, voci });
  }
  return fuori;
}
