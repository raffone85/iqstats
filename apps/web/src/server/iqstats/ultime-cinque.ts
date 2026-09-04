// Server-only: come si presentano le due squadre, dal lato che si giochera' qui.
//
// **A che domanda risponde.** Non «quanto hanno prodotto», ma «che partita ci si
// aspetta»: una frase sul carattere della gara e le tre differenze piu' marcate fra
// quello che la squadra di casa fa in casa e quello che l'ospite fa in trasferta. Le
// gare che stanno dietro restano disponibili, chiuse: chi vuole i dettagli li apre.
//
// **Solo la stagione in corso.** Nessun recupero dall'anno precedente: una squadra a
// settembre non e' la squadra di maggio, e riempire con le gare vecchie farebbe
// sembrare solido un campione che non c'e'. Quando le gare sono meno di tre il
// carattere non si dichiara: si mostrano i numeri e si dice che sono pochi.
//
// **Il lato non si mescola.** Casa contro casa, trasferta contro trasferta: sono i
// due lati che si giocheranno. Il campo pero' non e' neutro - in casa si produce di
// piu' ovunque - e la pagina lo dichiara accanto al confronto.
//
// **Non e' il motore.** Nessun numero atteso, nessuna probabilita', nessun mercato:
// il confronto e' fra due medie osservate, e il Projection Engine resta l'unico che
// dice quanto ci si aspetta.
//
// **Anti-leakage.** Finestra `kickoff_at < quando`, come ovunque.
import "server-only";

import { connessione } from "./lettura.ts";

/** Quante gare si guardano per lato. E' la definizione, non una soglia. */
const GARE = 5;
/** Sotto queste gare il carattere non si dichiara: si mostrano solo i numeri. */
const GARE_PER_UN_CARATTERE = 3;
/** Quante differenze si mostrano: tre si leggono in un colpo d'occhio, otto no. */
const DIFFERENZE = 3;
/**
 * Sotto questa somma per gara una metrica non entra nel confronto.
 *
 * Due occasioni contro una sono il 33% di scarto e sono due serate; venti tiri contro
 * quindici sono il 14% e sono una differenza vera. Senza questa soglia il confronto
 * pescherebbe sempre le voci piu' rare, cioe' le piu' rumorose.
 */
const PRESENZA_MINIMA = 2;

const METRICHE = [
  { chiave: "xg", colonna: "expected_goals", nome: "gol attesi", decimali: 2, unita: "" },
  { chiave: "tiri", colonna: "total_shots", nome: "tiri", decimali: 1, unita: "" },
  { chiave: "porta", colonna: "shots_on_target", nome: "tiri in porta", decimali: 1, unita: "" },
  { chiave: "area", colonna: "touches_in_penalty_area", nome: "tocchi in area", decimali: 1, unita: "" },
  { chiave: "occasioni", colonna: "big_chances", nome: "occasioni da gol", decimali: 1, unita: "" },
  { chiave: "palla", colonna: "ball_possession", nome: "possesso", decimali: 0, unita: "%" },
  { chiave: "corner", colonna: "corner_kicks", nome: "corner", decimali: 1, unita: "" },
  { chiave: "falli", colonna: "fouls", nome: "falli", decimali: 1, unita: "" },
] as const;

export interface GaraRecente {
  readonly quando: string;
  readonly avversario: string;
  readonly golFatti: number | null;
  readonly golSubiti: number | null;
}

export interface Differenza {
  readonly chiave: string;
  readonly nome: string;
  /** Gia' scritti, con i decimali e l'unita' della metrica. */
  readonly casa: string;
  readonly trasferta: string;
  /** Quanto pesa la casa sul totale delle due, da 0 a 1: e' la barra. */
  readonly quotaCasa: number;
  /** `true` quando davanti c'e' la squadra di casa. */
  readonly avantiLaCasa: boolean;
}

export interface SerieDiLato {
  readonly nome: string;
  readonly gare: readonly GaraRecente[];
  /** Gol fatti e subiti nelle gare della serie. */
  readonly golFatti: number;
  readonly golSubiti: number;
}

export interface ComeSiPresentano {
  /** La frase del carattere, o `null` quando il campione non la regge. */
  readonly verdetto: string | null;
  readonly differenze: readonly Differenza[];
  readonly casa: SerieDiLato;
  readonly trasferta: SerieDiLato;
}

/** Il numero, o `null` se la colonna non c'era: un'assenza non diventa zero. */
function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

function scritto(valore: number, decimali: number, unita: string): string {
  return valore.toFixed(decimali).replace(".", ",") + unita;
}

/**
 * Le tre differenze piu' marcate, e la frase che le riassume.
 *
 * Pura: si prova senza database. Lo scarto si misura come quota sul totale delle due
 * medie, cosi' il possesso e i corner si confrontano con lo stesso occhio; le voci
 * troppo rare restano fuori perche' il loro scarto e' rumore, non carattere.
 */
export function confronto(
  medieCasa: ReadonlyMap<string, number>,
  medieTrasferta: ReadonlyMap<string, number>,
  nomeCasa: string,
  nomeTrasferta: string,
  gareCasa: number,
  gareTrasferta: number,
): { verdetto: string | null; differenze: readonly Differenza[] } {
  const candidate: (Differenza & { scarto: number })[] = [];
  for (const m of METRICHE) {
    const a = medieCasa.get(m.chiave);
    const b = medieTrasferta.get(m.chiave);
    if (a === undefined || b === undefined) continue;
    const totale = a + b;
    if (totale < PRESENZA_MINIMA) continue;
    candidate.push({
      chiave: m.chiave,
      nome: m.nome,
      casa: scritto(a, m.decimali, m.unita),
      trasferta: scritto(b, m.decimali, m.unita),
      quotaCasa: a / totale,
      avantiLaCasa: a >= b,
      scarto: Math.abs(a - b) / totale,
    });
  }
  candidate.sort((x, y) => y.scarto - x.scarto);
  const differenze: Differenza[] = candidate.slice(0, DIFFERENZE).map((c) => ({
    chiave: c.chiave,
    nome: c.nome,
    casa: c.casa,
    trasferta: c.trasferta,
    quotaCasa: c.quotaCasa,
    avantiLaCasa: c.avantiLaCasa,
  }));

  if (differenze.length === 0) return { verdetto: null, differenze };
  // Sotto tre gare per lato non si dichiara un carattere: due serate non sono un modo
  // di giocare, e una frase netta qui varrebbe piu' del suo campione.
  if (gareCasa < GARE_PER_UN_CARATTERE || gareTrasferta < GARE_PER_UN_CARATTERE) {
    return { verdetto: null, differenze };
  }

  const avanti = differenze.filter((d) => d.avantiLaCasa).length;
  const verdetto = avanti === differenze.length
    ? `Gara sbilanciata: ${nomeCasa} comanda in casa`
    : avanti === 0
      ? `${nomeTrasferta} arriva meglio, e gioca fuori`
      : "Squadre vicine: si decide sui dettagli";
  return { verdetto, differenze };
}

async function latoDi(
  sql: NonNullable<ReturnType<typeof connessione>>,
  teamSourceId: number,
  competitionSourceId: number,
  stagioni: readonly number[],
  lato: "home" | "away",
  quando: string,
): Promise<{ serie: SerieDiLato; medie: Map<string, number> } | null> {
  const colonne = METRICHE.map((m) => "o." + m.colonna + "::text as v_" + m.chiave).join(",\n           ");
  const righe = await sql<Record<string, string | null>[]>`
    select o.kickoff_at::text as quando,
           t.name as nome,
           av.name as avversario,
           o.goals_for::text as gol_fatti,
           o.goals_against::text as gol_subiti,
           ${sql.unsafe(colonne)}
    from football.team_match_observations o
    join football.teams t on t.id = o.team_id
    join football.teams av on av.id = o.opponent_id
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where t.source_id = ${teamSourceId}::bigint
      and c.source_id = ${competitionSourceId}::bigint
      and s.source_id = any(${stagioni as number[]}::bigint[])
      and o.side = ${lato}
      and o.kickoff_at < ${quando}::timestamptz
    order by o.kickoff_at desc
    limit ${GARE}
  `;
  if (righe.length === 0) return null;

  const gare: GaraRecente[] = righe.map((r) => ({
    quando: r.quando ?? "",
    avversario: r.avversario ?? "",
    golFatti: numero(r.gol_fatti),
    golSubiti: numero(r.gol_subiti),
  }));

  // La media di una metrica si fa sulle gare che la portano davvero: una riga vuota
  // non entra come zero, e una metrica assente ovunque non entra affatto.
  const medie = new Map<string, number>();
  for (const m of METRICHE) {
    const valori = righe
      .map((r) => numero(r["v_" + m.chiave]))
      .filter((v): v is number => v !== null);
    if (valori.length === 0) continue;
    medie.set(m.chiave, valori.reduce((t, v) => t + v, 0) / valori.length);
  }

  return {
    serie: {
      nome: righe[0].nome ?? "",
      gare,
      golFatti: gare.reduce((t, g) => t + (g.golFatti ?? 0), 0),
      golSubiti: gare.reduce((t, g) => t + (g.golSubiti ?? 0), 0),
    },
    medie,
  };
}

/**
 * Come si presentano le due squadre: la casa con le sue ultime gare in casa di questa
 * stagione, l'ospite con le sue in trasferta.
 */
export async function comeSiPresentano(
  casaSourceId: number,
  trasfertaSourceId: number,
  competitionSourceId: number,
  stagioni: readonly number[],
  quando: string,
): Promise<ComeSiPresentano | null> {
  const sql = connessione();
  if (sql === null) return null;

  try {
    const [casa, trasferta] = await Promise.all([
      latoDi(sql, casaSourceId, competitionSourceId, stagioni, "home", quando),
      latoDi(sql, trasfertaSourceId, competitionSourceId, stagioni, "away", quando),
    ]);
    if (casa === null || trasferta === null) return null;

    const { verdetto, differenze } = confronto(
      casa.medie,
      trasferta.medie,
      casa.serie.nome,
      trasferta.serie.nome,
      casa.serie.gare.length,
      trasferta.serie.gare.length,
    );
    if (differenze.length === 0) return null;

    return { verdetto, differenze, casa: casa.serie, trasferta: trasferta.serie };
  } catch {
    // Un confronto che non si riesce a leggere non diventa un confronto inventato.
    return null;
  }
}
