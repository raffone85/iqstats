// Server-only: il ritmo e il contesto di gioco, come gruppo di metriche gia' osservate.
//
// **Non e' un secondo motore e non prevede niente.** Il motore di proiezione resta l'unico
// che dice quanto ci si aspetta; qui si dice soltanto **da che partita arrivano** le due
// squadre, sulle metriche che gia' osserviamo per ogni gara giocata.
//
// **Niente formule arbitrarie.** Non esiste da nessuna parte una misura che dica «ritmo
// alto = piu' gol»: inventarla sarebbe la cosa che il metodo vieta. Ogni metrica porta il
// suo valore e la sua **posizione nel campionato**, misurata come quota di squadre che
// stanno sotto. I gruppi - offensivo, intensita', territorio, verticalita' - sono una
// scelta di lettura dichiarata, non una misura: il numero del gruppo e' la mediana delle
// posizioni delle sue metriche, e le metriche restano visibili una per una.
//
// **Solo cio' che e' coperto.** Una metrica entra se e' presente su almeno la meta' delle
// gare guardate, per entrambe le squadre: un campo presente e quasi sempre vuoto e' un
// buco che sembra un dato, e qui si dichiara escluso.
//
// **Anti-leakage.** Finestra `kickoff_at < quando`, come ovunque nel motore.
import "server-only";

import { connessione } from "./lettura.ts";
import { mediana } from "./statistica.ts";

const MAX_GARE = 400;
/** Sotto queste gare per lato non si legge un ritmo: si leggono due o tre serate. */
const MIN_GARE_SQUADRA = 4;
/** Sotto questa quota di righe piene la metrica non entra, e si dichiara esclusa. */
const MIN_COPERTURA = 0.5;

/** Le metriche del pannello che descrivono come si gioca, e come si chiamano in italiano. */
const METRICHE = [
  { colonna: "ball_possession", nome: "possesso", gruppo: "territorio" },
  { colonna: "passes", nome: "passaggi", gruppo: "territorio" },
  { colonna: "pass_accuracy_pct", nome: "precisione dei passaggi", gruppo: "territorio" },
  { colonna: "long_balls_total", nome: "palle lunghe", gruppo: "verticalita" },
  { colonna: "final_third_entries", nome: "ingressi nell'ultimo terzo", gruppo: "territorio" },
  { colonna: "touches_in_penalty_area", nome: "tocchi in area", gruppo: "verticalita" },
  { colonna: "crosses_total", nome: "cross", gruppo: "verticalita" },
  { colonna: "duels", nome: "duelli", gruppo: "intensita" },
  { colonna: "tackles", nome: "contrasti", gruppo: "intensita" },
  { colonna: "interceptions", nome: "intercetti", gruppo: "intensita" },
  { colonna: "recoveries", nome: "recuperi", gruppo: "intensita" },
  { colonna: "dribbles_total", nome: "dribbling", gruppo: "verticalita" },
  { colonna: "total_shots", nome: "tiri", gruppo: "offensivo" },
  { colonna: "shots_inside_box", nome: "tiri dentro l'area", gruppo: "offensivo" },
  { colonna: "big_chances", nome: "occasioni da gol", gruppo: "offensivo" },
  { colonna: "expected_goals", nome: "gol attesi", gruppo: "offensivo" },
] as const;

export type Gruppo = (typeof METRICHE)[number]["gruppo"];

const NOME_GRUPPO: Record<Gruppo, string> = {
  offensivo: "Spinta offensiva",
  intensita: "Intensità",
  territorio: "Territorio",
  verticalita: "Verticalità",
};

export interface VoceDiRitmo {
  readonly nome: string;
  readonly gruppo: Gruppo;
  readonly casa: number;
  readonly trasferta: number;
  /** La mediana del campionato sulle stesse gare, per sapere se sono molti o pochi. */
  readonly lega: number;
  /** Quota di squadre-gara del campionato che stanno sotto, da 0 a 1. */
  readonly posizioneCasa: number;
  readonly posizioneTrasferta: number;
  readonly gareCasa: number;
  readonly gareTrasferta: number;
}

export interface GruppoDiRitmo {
  readonly gruppo: Gruppo;
  readonly nome: string;
  /** Mediana delle posizioni delle metriche del gruppo: una lettura, non una misura nuova. */
  readonly posizioneCasa: number;
  readonly posizioneTrasferta: number;
  readonly voci: readonly VoceDiRitmo[];
}

export interface RitmoDellaGara {
  readonly gruppi: readonly GruppoDiRitmo[];
  readonly gareDiLega: number;
  /** Le metriche lasciate fuori perche' coperte troppo poco, con la loro quota. */
  readonly escluse: readonly { readonly nome: string; readonly copertura: number }[];
}

interface Riga {
  readonly squadra: number;
  readonly lato: "home" | "away";
  readonly valori: Readonly<Record<string, number | null>>;
}

/** Quota di valori del campionato che stanno sotto questo. */
export function posizione(valore: number, distribuzione: readonly number[]): number {
  if (distribuzione.length === 0) return 0.5;
  const sotto = distribuzione.filter((v) => v < valore).length;
  return Math.round((sotto / distribuzione.length) * 1000) / 1000;
}

function media(valori: readonly number[]): number {
  return Math.round((valori.reduce((s, v) => s + v, 0) / valori.length) * 100) / 100;
}

/**
 * Come arrivano le due squadre, sulle metriche di gioco gia' osservate.
 *
 * `null` quando il livello dati non risponde, quando manca un identificativo o quando
 * nessuna metrica raggiunge la copertura minima: un ritmo con due metriche su sedici non
 * e' un ritmo.
 */
export async function ritmoDellaGara(args: {
  readonly leagueId: number | null;
  readonly seasonId: number | null;
  readonly homeTeamId: number | null;
  readonly awayTeamId: number | null;
  readonly kickoffAt: string;
}): Promise<RitmoDellaGara | null> {
  const { leagueId, seasonId, homeTeamId, awayTeamId, kickoffAt } = args;
  if (leagueId === null || seasonId === null || homeTeamId === null || awayTeamId === null) {
    return null;
  }
  const sql = connessione();
  if (sql === null) return null;

  const colonne = METRICHE.map((m) => m.colonna);
  const righe = await sql<Record<string, string | null>[]>`
    select t.source_id::text as squadra, o.side as lato,
           ${sql.unsafe(colonne.map((c) => `o.${c}::text as ${c}`).join(", "))}
    from football.team_match_observations o
    join football.matches g on g.id = o.match_id
    join football.competitions c on c.id = g.competition_id
    join football.teams t on t.id = o.team_id
    where c.source_id = ${leagueId}::bigint
      and g.season_id = (select id from football.seasons where source_id = ${seasonId}::bigint)
      and o.kickoff_at < ${kickoffAt}::timestamptz
    order by o.kickoff_at desc
    limit ${MAX_GARE * 2}
  `;

  const dati: Riga[] = righe.map((r) => ({
    squadra: Number(r.squadra),
    lato: r.lato === "home" ? "home" : "away",
    valori: Object.fromEntries(
      colonne.map((c) => {
        const grezzo = r[c];
        const numero = grezzo === null ? Number.NaN : Number(grezzo);
        return [c, Number.isFinite(numero) ? numero : null];
      }),
    ),
  }));
  if (dati.length === 0) return null;

  // Il lato conta anche qui: la casa si legge in casa, l'ospite in trasferta.
  const dellaCasa = dati.filter((r) => r.squadra === homeTeamId && r.lato === "home");
  const dellaTrasferta = dati.filter((r) => r.squadra === awayTeamId && r.lato === "away");
  if (dellaCasa.length < MIN_GARE_SQUADRA || dellaTrasferta.length < MIN_GARE_SQUADRA) {
    return null;
  }

  const voci: VoceDiRitmo[] = [];
  const escluse: { nome: string; copertura: number }[] = [];

  for (const metrica of METRICHE) {
    const pieni = (righeDi: readonly Riga[]) =>
      righeDi
        .map((r) => r.valori[metrica.colonna])
        .filter((v): v is number => v !== null);
    const casa = pieni(dellaCasa);
    const trasferta = pieni(dellaTrasferta);
    const lega = pieni(dati);
    const copertura = lega.length / dati.length;
    const coperturaSquadre = Math.min(
      casa.length / dellaCasa.length,
      trasferta.length / dellaTrasferta.length,
    );
    if (copertura < MIN_COPERTURA || coperturaSquadre < MIN_COPERTURA || lega.length === 0) {
      escluse.push({ nome: metrica.nome, copertura: Math.round(copertura * 1000) / 1000 });
      continue;
    }
    const mediaCasa = media(casa);
    const mediaTrasferta = media(trasferta);
    voci.push({
      nome: metrica.nome,
      gruppo: metrica.gruppo,
      casa: mediaCasa,
      trasferta: mediaTrasferta,
      // `lega` non e' mai vuoto qui: la metrica e' entrata solo perche' ha righe piene.
      lega: Math.round((mediana(lega) ?? 0) * 100) / 100,
      posizioneCasa: posizione(mediaCasa, lega),
      posizioneTrasferta: posizione(mediaTrasferta, lega),
      gareCasa: casa.length,
      gareTrasferta: trasferta.length,
    });
  }

  if (voci.length === 0) return null;

  const gruppi: GruppoDiRitmo[] = [];
  for (const gruppo of ["offensivo", "intensita", "territorio", "verticalita"] as const) {
    const dentro = voci.filter((v) => v.gruppo === gruppo);
    if (dentro.length === 0) continue;
    gruppi.push({
      gruppo,
      nome: NOME_GRUPPO[gruppo],
      // `dentro` non e' mai vuoto qui: il gruppo esiste solo se ha almeno una voce.
      posizioneCasa: Math.round((mediana(dentro.map((v) => v.posizioneCasa)) ?? 0) * 1000) / 1000,
      posizioneTrasferta:
        Math.round((mediana(dentro.map((v) => v.posizioneTrasferta)) ?? 0) * 1000) / 1000,
      voci: dentro,
    });
  }

  return { gruppi, gareDiLega: dati.length, escluse };
}
