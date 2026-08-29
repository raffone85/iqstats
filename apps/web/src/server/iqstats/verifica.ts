// Server-only: quello che avevamo detto, contro quello che è successo.
//
// **Perche' si puo' fare senza barare.** Il motore legge soltanto cio' che esisteva prima
// del calcio d'inizio: il taglio in SQL e' `kickoff_at <= calcio d'inizio` e la condizione
// esatta - gara anteriore, e mai la gara stessa - la applica `prima()` in
// `projection/snapshot.ts`. Quindi su una gara gia' giocata la proiezione che la pagina
// mostra e' la stessa che avrebbe mostrato prima, e confrontarla col risultato e' una
// verifica vera e non una profezia scritta dopo.
//
// **Il reale viene dalle nostre osservazioni, non dal tabellone della fonte.** La fonte
// espone le stesse cifre con etichette sue, in un'altra lingua e con un altro nome per ogni
// riga: accoppiarle per etichetta sarebbe fragile e, il giorno che ne cambia una, la verifica
// direbbe «sbagliato» a un modello che ha preso. Le colonne che il motore prevede sono le
// stesse che il nostro livello dati conserva, e si chiamano allo stesso modo.
//
// **Preso vuol dire dentro l'intervallo, non vicino.** Il modello non dichiara un numero ma
// una fascia con il suo livello nominale: la verifica usa quella. Un bersaglio senza
// intervallo non si giudica e si dichiara, invece di essere contato come sbagliato.
import "server-only";

import { connessione } from "./lettura.ts";
import type { ProiezioneDiGara } from "./projection/match.ts";

/** Le sette colonne che il motore prevede e che il livello dati conserva con lo stesso nome. */
const COLONNE = [
  "total_shots", "shots_on_target", "corner_kicks", "fouls",
  "yellow_cards", "offsides", "goalkeeper_saves",
] as const;

/** Quanto e' successo davvero in quella gara, per lato. */
export interface RealeDiGara {
  readonly casa: Readonly<Record<string, number | null>>;
  readonly fuori: Readonly<Record<string, number | null>>;
}

interface RigaReale {
  readonly side: string;
  readonly [colonna: string]: string | null;
}

/** Le due righe della gara, dalle nostre osservazioni. `null` se non l'abbiamo osservata. */
export async function realeDellaGara(matchSourceId: number): Promise<RealeDiGara | null> {
  const sql = connessione();
  if (sql === null) return null;
  const scelte = COLONNE.map((c) => "o." + c + "::text").join(", ");
  try {
    const righe = await sql<RigaReale[]>`
      select o.side, ${sql.unsafe(scelte)}
      from football.team_match_observations o
      join football.matches g on g.id = o.match_id
      where g.source_id = ${matchSourceId}::bigint
    `;
    if (righe.length === 0) return null;
    const perLato = (lato: string) => {
      const riga = righe.find((r) => r.side === lato);
      const valori: Record<string, number | null> = {};
      for (const c of COLONNE) {
        const grezzo = riga?.[c] ?? null;
        const n = grezzo === null ? null : Number(grezzo);
        valori[c] = n === null || !Number.isFinite(n) ? null : n;
      }
      return valori;
    };
    return { casa: perLato("home"), fuori: perLato("away") };
  } catch {
    return null;
  }
}

export type LatoVerifica = "casa" | "trasferta" | "totale";

/** Una previsione messa accanto al suo risultato. */
export interface VoceVerifica {
  readonly bersaglio: string;
  readonly lato: LatoVerifica;
  readonly atteso: number;
  readonly basso: number;
  readonly alto: number;
  readonly reale: number;
  /** `true` quando il reale cade dentro l'intervallo dichiarato prima della gara. */
  readonly dentro: boolean;
}

/** Le voci di una famiglia, con il suo parziale: si scorre per famiglia, non per riga. */
export interface GruppoVerifica {
  readonly bersaglio: string;
  readonly voci: readonly VoceVerifica[];
  readonly presi: number;
}

export interface VerificaDiGara {
  readonly gruppi: readonly GruppoVerifica[];
  readonly presi: number;
  readonly totali: number;
  /** I bersagli che non si sono potuti giudicare, e non contano come sbagliati. */
  readonly senzaGiudizio: readonly string[];
}

/** Il valore e l'intervallo di un lato, o `null` se quel lato non e' stato previsto. */
function previsione(
  bersaglio: ProiezioneDiGara,
  lato: LatoVerifica,
): { atteso: number; basso: number; alto: number } | null {
  if (lato === "totale") {
    const t = bersaglio.totale;
    if (t?.intervallo == null) return null;
    return { atteso: t.valoreAtteso, basso: t.intervallo.basso, alto: t.intervallo.alto };
  }
  const e = lato === "casa" ? bersaglio.casa : bersaglio.trasferta;
  if (e.stato !== "prevista" || e.intervallo === null) return null;
  return { atteso: e.valoreAtteso, basso: e.intervallo.basso, alto: e.intervallo.alto };
}

/**
 * La verifica della gara: una voce per ogni previsione che si poteva giudicare.
 *
 * Il totale e' la somma dei due lati osservati, non un numero a parte: sommare quello che
 * abbiamo visto e' l'unico modo di restare sulle stesse gare del prodotto e del concesso.
 */
export function verificaDellaGara(
  bersagli: readonly ProiezioneDiGara[],
  reale: RealeDiGara | null,
): VerificaDiGara | null {
  if (reale === null || bersagli.length === 0) return null;

  const voci: VoceVerifica[] = [];
  const senzaGiudizio: string[] = [];

  for (const bersaglio of bersagli) {
    const casa = reale.casa[bersaglio.target] ?? null;
    const fuori = reale.fuori[bersaglio.target] ?? null;
    const osservato: Record<LatoVerifica, number | null> = {
      casa,
      trasferta: fuori,
      totale: casa === null || fuori === null ? null : casa + fuori,
    };

    let giudicato = false;
    for (const lato of ["casa", "trasferta", "totale"] as const) {
      const previsto = previsione(bersaglio, lato);
      const vero = osservato[lato];
      if (previsto === null || vero === null) continue;
      giudicato = true;
      voci.push({
        bersaglio: bersaglio.target,
        lato,
        atteso: previsto.atteso,
        basso: previsto.basso,
        alto: previsto.alto,
        reale: vero,
        dentro: vero >= previsto.basso && vero <= previsto.alto,
      });
    }
    if (!giudicato) senzaGiudizio.push(bersaglio.target);
  }

  if (voci.length === 0) return null;
  // Le voci restano nell'ordine dei bersagli, e si raggruppano per famiglia: ventun righe in
  // fila sono un elenco, sette famiglie con il loro parziale sono una lettura.
  const gruppi: GruppoVerifica[] = [];
  for (const voce of voci) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo !== undefined && ultimo.bersaglio === voce.bersaglio) {
      (ultimo.voci as VoceVerifica[]).push(voce);
      continue;
    }
    gruppi.push({ bersaglio: voce.bersaglio, voci: [voce], presi: 0 });
  }
  const conParziale = gruppi.map((g) => ({
    ...g,
    presi: g.voci.filter((v) => v.dentro).length,
  }));

  return {
    gruppi: conParziale,
    presi: voci.filter((v) => v.dentro).length,
    totali: voci.length,
    senzaGiudizio,
  };
}
