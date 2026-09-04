// Server-only: le ultime cinque gare **dal lato che si giochera' qui**, una per una.
//
// **Che cosa aggiunge a «Forma, in numeri».** Quella sezione dice quanto valgono le
// ultime tre, cinque e dieci contro il metro della competizione, e si ferma alle
// reti. Qui si vedono le gare: contro chi, com'e' finita, e con quali gol attesi e
// tiri da una parte e dall'altra. Una media di cinque gare nasconde se sono cinque
// serate uguali o quattro normali e una da sei gol, e la differenza si vede solo
// guardandole.
//
// **Il lato non si mescola.** La squadra di casa porta le sue ultime cinque **in
// casa**, l'ospite le sue ultime cinque **in trasferta**: sono i due lati che si
// giocheranno, e mediarli direbbe un'altra cosa.
//
// **Stagione in corso, e quando non basta si va indietro.** A settembre cinque gare
// nella stagione non ci sono: si prendono le piu' recenti dello stesso lato e della
// stessa competizione, e la pagina dichiara quante appartengono a questa stagione.
// Restare dentro la competizione evita di mettere una coppa accanto a un campionato.
//
// **Nessuna previsione.** Sono gare avvenute: nessun mercato, nessun modello, nessun
// numero che entri nel motore.
//
// **Anti-leakage.** Finestra `kickoff_at < quando`, come ovunque.
import "server-only";

import { connessione } from "./lettura.ts";

/** Quante gare si guardano per lato. E' la definizione, non una soglia. */
const GARE = 5;

export interface GaraRecente {
  readonly quando: string;
  readonly avversario: string;
  readonly golFatti: number | null;
  readonly golSubiti: number | null;
  readonly xgFatti: number | null;
  readonly xgSubiti: number | null;
  readonly tiriFatti: number | null;
  readonly tiriSubiti: number | null;
  readonly portaFatti: number | null;
  readonly portaSubiti: number | null;
  /** `true` quando la gara appartiene alla stagione di questa partita. */
  readonly diQuestaStagione: boolean;
}

/** La somma di una metrica sulle gare che ce l'hanno, con quante gare la portano. */
export interface Somma {
  readonly fatti: number;
  readonly subiti: number;
  readonly gare: number;
}

export interface TotaliDelLato {
  readonly gol: Somma | null;
  readonly xg: Somma | null;
  readonly tiri: Somma | null;
  readonly porta: Somma | null;
}

export interface CinqueDiLato {
  readonly nome: string;
  readonly lato: "casa" | "trasferta";
  readonly gare: readonly GaraRecente[];
  readonly diQuestaStagione: number;
  readonly totali: TotaliDelLato;
}

export interface UltimeCinque {
  readonly casa: CinqueDiLato;
  readonly trasferta: CinqueDiLato;
  /** Le due serie messe insieme: quello che le dieci gare hanno prodotto. */
  readonly insieme: TotaliDelLato;
  /** Il confronto scritto, gia' pronto: frasi separate, nessuna previsione. */
  readonly rapporto: readonly string[];
}

/** Il numero, o `null` se la colonna non c'era: un'assenza non diventa zero. */
function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

function somma(
  gare: readonly GaraRecente[],
  fatti: (g: GaraRecente) => number | null,
  subiti: (g: GaraRecente) => number | null,
): Somma | null {
  const buone = gare.filter((g) => fatti(g) !== null && subiti(g) !== null);
  if (buone.length === 0) return null;
  return {
    fatti: buone.reduce((t, g) => t + (fatti(g) ?? 0), 0),
    subiti: buone.reduce((t, g) => t + (subiti(g) ?? 0), 0),
    gare: buone.length,
  };
}

function totaliDi(gare: readonly GaraRecente[]): TotaliDelLato {
  return {
    gol: somma(gare, (g) => g.golFatti, (g) => g.golSubiti),
    xg: somma(gare, (g) => g.xgFatti, (g) => g.xgSubiti),
    tiri: somma(gare, (g) => g.tiriFatti, (g) => g.tiriSubiti),
    porta: somma(gare, (g) => g.portaFatti, (g) => g.portaSubiti),
  };
}

/** Una media scritta come si legge. */
function media(valore: number, gare: number, decimali: number): string {
  return (valore / gare).toFixed(decimali).replace(".", ",");
}

/**
 * Il confronto in parole.
 *
 * Puro: si prova senza database. Dice quello che i numeri dicono - quanto hanno
 * prodotto e concesso le due serie - e non aggiunge una conclusione che i numeri non
 * contengono. Se una metrica manca da un lato, quella frase non si scrive.
 */
export function rapportoDelConfronto(
  casa: CinqueDiLato,
  trasferta: CinqueDiLato,
  insieme: TotaliDelLato,
): readonly string[] {
  const frasi: string[] = [];

  const gc = casa.totali.gol;
  const gt = trasferta.totali.gol;
  if (gc !== null) {
    frasi.push(
      `${casa.nome} nelle ultime ${gc.gare} in casa ha fatto ${gc.fatti} gol e ne ha subiti `
      + `${gc.subiti}: ${media(gc.fatti, gc.gare, 1)} e ${media(gc.subiti, gc.gare, 1)} a gara.`,
    );
  }
  if (gt !== null) {
    frasi.push(
      `${trasferta.nome} nelle ultime ${gt.gare} in trasferta ne ha fatti ${gt.fatti} e subiti `
      + `${gt.subiti}: ${media(gt.fatti, gt.gare, 1)} e ${media(gt.subiti, gt.gare, 1)} a gara.`,
    );
  }

  const xc = casa.totali.xg;
  const xt = trasferta.totali.xg;
  if (xc !== null && gc !== null) {
    // I gol attesi accanto ai gol dicono se quel bottino era nel gioco o e' arrivato
    // oltre il gioco. E' un confronto fra due numeri gia' mostrati, non una stima.
    const scarto = gc.fatti - xc.fatti;
    frasi.push(
      `Con ${media(xc.fatti, xc.gare, 2)} gol attesi a gara, ${casa.nome} ha segnato `
      + `${Math.abs(scarto) < 1 ? "quanto il gioco diceva" : scarto > 0 ? "più di quanto il gioco diceva" : "meno di quanto il gioco diceva"}`
      + ` (${gc.fatti} gol contro ${xc.fatti.toFixed(1).replace(".", ",")} attesi).`,
    );
  }
  if (xt !== null && gt !== null) {
    const scarto = gt.fatti - xt.fatti;
    frasi.push(
      `${trasferta.nome} fuori casa: ${gt.fatti} gol contro `
      + `${xt.fatti.toFixed(1).replace(".", ",")} attesi, `
      + `${Math.abs(scarto) < 1 ? "in linea con il gioco" : scarto > 0 ? "sopra il gioco" : "sotto il gioco"}.`,
    );
  }

  const tc = casa.totali.tiri;
  const tt = trasferta.totali.tiri;
  if (tc !== null && tt !== null) {
    frasi.push(
      `Ai tiri: ${media(tc.fatti, tc.gare, 1)} a gara per ${casa.nome} contro `
      + `${media(tc.subiti, tc.gare, 1)} concessi, ${media(tt.fatti, tt.gare, 1)} per `
      + `${trasferta.nome} contro ${media(tt.subiti, tt.gare, 1)} concessi.`,
    );
  }

  const ins = insieme.gol;
  if (ins !== null) {
    frasi.push(
      `Nelle ${ins.gare} gare messe insieme sono arrivati ${ins.fatti + ins.subiti} gol, `
      + `${media(ins.fatti + ins.subiti, ins.gare, 1)} a gara. Sono partite già giocate, `
      + `non una previsione su questa.`,
    );
  }

  return frasi;
}

async function cinqueDi(
  sql: NonNullable<ReturnType<typeof connessione>>,
  teamSourceId: number,
  competitionSourceId: number,
  seasonSourceId: number,
  lato: "home" | "away",
  quando: string,
): Promise<CinqueDiLato | null> {
  const righe = await sql<Record<string, string | null>[]>`
    select o.kickoff_at::text as quando,
           t.name as nome,
           av.name as avversario,
           o.goals_for::text as gol_fatti,
           o.goals_against::text as gol_subiti,
           o.expected_goals::text as xg_fatti,
           a.expected_goals::text as xg_subiti,
           o.total_shots::text as tiri_fatti,
           a.total_shots::text as tiri_subiti,
           o.shots_on_target::text as porta_fatti,
           a.shots_on_target::text as porta_subiti,
           (s.source_id = ${seasonSourceId}::bigint)::text as stagione
    from football.team_match_observations o
    join football.team_match_observations a
      on a.match_id = o.match_id and a.side <> o.side
    join football.teams t on t.id = o.team_id
    join football.teams av on av.id = o.opponent_id
    join football.competitions c on c.id = o.competition_id
    join football.seasons s on s.id = o.season_id
    where t.source_id = ${teamSourceId}::bigint
      and c.source_id = ${competitionSourceId}::bigint
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
    xgFatti: numero(r.xg_fatti),
    xgSubiti: numero(r.xg_subiti),
    tiriFatti: numero(r.tiri_fatti),
    tiriSubiti: numero(r.tiri_subiti),
    portaFatti: numero(r.porta_fatti),
    portaSubiti: numero(r.porta_subiti),
    diQuestaStagione: r.stagione === "true",
  }));

  return {
    nome: righe[0].nome ?? "",
    lato: lato === "home" ? "casa" : "trasferta",
    gare,
    diQuestaStagione: gare.filter((g) => g.diQuestaStagione).length,
    totali: totaliDi(gare),
  };
}

/**
 * Le ultime cinque di casa della squadra di casa e le ultime cinque di trasferta
 * dell'ospite, con il confronto gia' scritto.
 */
export async function ultimeCinque(
  casaSourceId: number,
  trasfertaSourceId: number,
  competitionSourceId: number,
  seasonSourceId: number,
  quando: string,
): Promise<UltimeCinque | null> {
  const sql = connessione();
  if (sql === null) return null;

  try {
    const [casa, trasferta] = await Promise.all([
      cinqueDi(sql, casaSourceId, competitionSourceId, seasonSourceId, "home", quando),
      cinqueDi(sql, trasfertaSourceId, competitionSourceId, seasonSourceId, "away", quando),
    ]);
    if (casa === null || trasferta === null) return null;

    const insieme = totaliDi([...casa.gare, ...trasferta.gare]);
    return {
      casa,
      trasferta,
      insieme,
      rapporto: rapportoDelConfronto(casa, trasferta, insieme),
    };
  } catch {
    // Una serie che non si riesce a leggere non diventa una serie inventata.
    return null;
  }
}
