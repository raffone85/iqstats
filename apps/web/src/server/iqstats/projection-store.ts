// Server-only: il livello dati del motore di proiezione.
//
// Legge le osservazioni squadra-gara conservate e ne compone il materiale che il calcolo
// delle feature «al momento di» si aspetta. Nessuna chiamata alla fonte: la fonte serve a
// riempire la tavola, non a rispondere a una pagina.
//
// Il taglio temporale e' dichiarato in due punti e uno solo dei due decide. In SQL si
// restringe con `kickoff_at <= calcio d'inizio`, che e' un soprainsieme e serve soltanto a
// non trascinare l'archivio intero attraverso la rete. La condizione esatta — gara
// anteriore, e mai la gara stessa — la applica `prima()` in `projection/snapshot.ts`, che
// e' l'unica autorita' e l'unico posto da leggere per sapere che cosa entra.
import "server-only";

import type postgres from "postgres";

import type { Lato } from "./projection/asof/contratto.ts";
import type {
  MaterialeDellaGara,
  OsservazioneGiocatore,
  OsservazioneSquadraGara,
} from "./projection/snapshot.ts";
import { anteriore, prima } from "./projection/snapshot.ts";

/** Le metriche del pannello conservate, nello stesso ordine della tavola. */
const METRICHE = [
  "ball_possession", "passes", "accurate_passes", "pass_accuracy_pct", "long_balls_total",
  "final_third_entries", "final_third_phase_total", "touches_in_penalty_area", "crosses_total",
  "duels", "ground_duels_total", "aerial_duels_total", "tackles", "interceptions",
  "recoveries", "clearances", "dribbles_total", "dispossessed",
  "shots_inside_box", "shots_outside_box", "blocked_shots", "hit_woodwork",
  "errors_lead_to_a_shot", "expected_goals", "big_chances",
  "free_kicks", "throw_ins", "goal_kicks", "fouled_in_final_third",
  "total_shots", "shots_on_target", "corner_kicks", "fouls", "yellow_cards", "offsides",
  "goalkeeper_saves", "second_yellow_red", "red_cards_direct", "bench_cards",
] as const;

/** I campi del profilo spaziale, dal nome nella tavola al nome nel contratto. */
const CAMPI_TIRI = [
  ["totali", "shot_map_total"],
  ["quotaInArea", "shot_map_share_in_box"],
  ["distanzaMedia", "shot_map_avg_distance"],
  ["xgPerTiro", "shot_map_xg_per_shot"],
  ["quotaQualita", "shot_map_share_quality"],
  ["quotaBloccati", "shot_map_share_blocked"],
  ["quotaDaFermo", "shot_map_share_set_piece"],
] as const;

/**
 * La gara da prevedere, con il contorno che esiste prima del calcio d'inizio.
 *
 * Turno, derby e allenatori non stanno fra le osservazioni — quelle esistono solo per le
 * gare gia' giocate — e arrivano dal dettaglio della gara che l'applicazione ha gia'.
 */
export interface GaraDaPrevedere {
  readonly matchId: number;
  readonly seasonId: number;
  readonly kickoffAt: string;
  readonly homeTeamId: number;
  readonly awayTeamId: number;
  readonly refereeId: number | null;
  readonly homeCoachSourceId: number | null;
  readonly awayCoachSourceId: number | null;
  readonly roundNumber: number | null;
  readonly isDerby: boolean | null;
}

interface RigaOsservazione {
  readonly match_id: string;
  readonly season_id: string;
  readonly team_id: string;
  readonly opponent_id: string;
  readonly side: string;
  readonly kickoff_at: string;
  readonly referee_id: string | null;
  readonly coach_source_id: string | null;
  readonly round_number: number | null;
  readonly is_derby: boolean | null;
  readonly goals_for: number | null;
  readonly goals_against: number | null;
  readonly value_provenance: Record<string, string> | null;
  readonly [metrica: string]: unknown;
}

interface RigaGiocatore {
  readonly match_id: string;
  readonly kickoff_at: string;
  readonly source_ordinal: number;
  readonly player_source_id: string;
  readonly minutes_played: number;
  readonly total_shots: number | null;
  readonly shots_on_target: number | null;
  readonly fouls: number | null;
  readonly yellow_card: number | null;
  readonly red_card: number | null;
  readonly saves: number | null;
}

const PROVENIENZE_AMMESSE = ["A", "B", "C"];

function numero(valore: unknown): number | null {
  if (valore === null || valore === undefined) return null;
  const convertito = typeof valore === "number" ? valore : Number(valore);
  return Number.isFinite(convertito) ? convertito : null;
}

/**
 * L'istante nella forma che il contratto usa per ordinare: ISO con la Z.
 * L'ordinamento fra righe e' un confronto fra stringhe, quindi la forma deve essere
 * una sola: due formati diversi ordinerebbero male senza dare errore.
 */
function istante(valore: string): string {
  return new Date(valore).toISOString().replace(".000Z", "Z");
}

/**
 * Il valore di una metrica, ma solo se la provenienza e' ammessa.
 *
 * E' la stessa politica del lato che addestra, applicata **prima** di qualunque media.
 * Una provenienza ambigua o mancante non e' un numero piccolo: non e' un numero.
 */
function noto(riga: RigaOsservazione, metrica: string): number | null {
  const provenienze = riga.value_provenance;
  if (provenienze !== null && provenienze !== undefined) {
    const classe = provenienze[metrica];
    if (classe !== undefined && PROVENIENZE_AMMESSE.indexOf(classe) < 0) {
      return null;
    }
  }
  return numero(riga[metrica]);
}

function osservazioneDa(
  riga: RigaOsservazione,
  gemella: RigaOsservazione | undefined,
): OsservazioneSquadraGara {
  const prodotte: Record<string, number | null> = {};
  const concesse: Record<string, number | null> = {};
  for (const metrica of METRICHE) {
    prodotte[metrica] = noto(riga, metrica);
    concesse[metrica] = gemella === undefined ? null : noto(gemella, metrica);
  }
  return {
    matchId: Number(riga.match_id),
    stagione: numero(riga.season_id),
    teamId: Number(riga.team_id),
    opponentId: Number(riga.opponent_id),
    lato: riga.side === "home" ? "home" : "away",
    quando: istante(riga.kickoff_at),
    refereeId: riga.referee_id === null ? null : Number(riga.referee_id),
    allenatoreId: riga.coach_source_id === null ? null : Number(riga.coach_source_id),
    turno: riga.round_number,
    derby: riga.is_derby,
    retiFatte: riga.goals_for,
    retiSubite: riga.goals_against,
    prodotte,
    concesse,
    tiri: profiloTiri(riga),
    tiriConcessi: gemella === undefined ? null : profiloTiri(gemella),
  };
}

function profiloTiri(riga: RigaOsservazione) {
  const profilo: Record<string, number | null> = {};
  let qualcosa = false;
  for (const coppia of CAMPI_TIRI) {
    const valore = numero(riga[coppia[1]]);
    profilo[coppia[0]] = valore;
    if (valore !== null) qualcosa = true;
  }
  return qualcosa ? (profilo as unknown as OsservazioneSquadraGara["tiri"]) : null;
}

/**
 * Le righe di una gara vengono a coppie: la seconda e' il «concesso» della prima.
 * Chi interroga chiede sempre entrambe, altrimenti meta' delle metriche resterebbe
 * ignota senza che nessuno lo dica.
 */
function accoppia(righe: readonly RigaOsservazione[]): OsservazioneSquadraGara[] {
  const perGara = new Map<string, RigaOsservazione[]>();
  for (const riga of righe) {
    const elenco = perGara.get(riga.match_id);
    if (elenco === undefined) perGara.set(riga.match_id, [riga]);
    else elenco.push(riga);
  }
  const uscita: OsservazioneSquadraGara[] = [];
  for (const riga of righe) {
    const coppia = perGara.get(riga.match_id) ?? [];
    const gemella = coppia.find((altra) => altra.team_id !== riga.team_id);
    uscita.push(osservazioneDa(riga, gemella));
  }
  return uscita;
}

type Sql = ReturnType<typeof postgres>;

export interface MediaOsservata {
  readonly media: number;
  readonly campione: number;
}

/**
 * La media di un bersaglio sulle gare gia' giocate dalla squadra **dallo stesso lato del
 * campo** e **nella stessa stagione**.
 *
 * Due vincoli, nessuno dei due estetico. Il lato, perche' una media che somma casa e
 * trasferta non risponde alla domanda «quanto produce in casa». La stagione, perche'
 * mescolarne due dice di che cosa parla la media solo a chi la ha scritta. Senza nemmeno
 * una gara utile si risponde `null`: un'assenza non diventa zero.
 */
export function mediaOsservata(
  righe: readonly OsservazioneSquadraGara[],
  target: string,
  lato: Lato,
  stagione: number,
): MediaOsservata | null {
  let somma = 0;
  let campione = 0;
  for (const riga of righe) {
    if (riga.lato !== lato || riga.stagione !== stagione) continue;
    const valore = riga.prodotte[target];
    if (valore === null || valore === undefined) continue;
    somma += valore;
    campione += 1;
  }
  return campione === 0 ? null : { media: somma / campione, campione };
}

/**
 * Il livello dati del motore: dalle osservazioni conservate al materiale di una gara.
 *
 * Un'interrogazione per concerne, e nessuna aritmetica in SQL. Medie, deviazioni e
 * profili si calcolano in TypeScript con le stesse primitive che il test di parita'
 * verifica contro Python: due implementazioni della stessa media, una per linguaggio,
 * sono due numeri che prima o poi divergono.
 */
export class ProjectionObservationStore {
  readonly #sql: Sql;

  constructor(sql: Sql) {
    this.#sql = sql;
  }

  /** Le osservazioni di una gara, entrambe le squadre, per riempire il «concesso». */
  async #gareDi(
    colonna: "team_id" | "coach_source_id",
    valore: number,
    finoA: string,
  ): Promise<OsservazioneSquadraGara[]> {
    const righe = await this.#sql<RigaOsservazione[]>`
      select gemella.*
      from football.team_match_observations propria
      join football.team_match_observations gemella
        on gemella.match_id = propria.match_id
      where propria.${this.#sql(colonna)} = ${valore}::bigint
        and propria.kickoff_at <= ${finoA}::timestamptz
      order by gemella.kickoff_at, gemella.match_id, gemella.side
    `;
    return accoppia(righe);
  }

  async #righeDellaStagione(
    seasonId: number,
    finoA: string,
  ): Promise<OsservazioneSquadraGara[]> {
    const righe = await this.#sql<RigaOsservazione[]>`
      select *
      from football.team_match_observations
      where season_id = ${seasonId}::bigint
        and kickoff_at <= ${finoA}::timestamptz
      order by kickoff_at, match_id, side
    `;
    return accoppia(righe);
  }

  async #righeDellArbitro(
    refereeId: number,
    finoA: string,
  ): Promise<OsservazioneSquadraGara[]> {
    const righe = await this.#sql<RigaOsservazione[]>`
      select *
      from football.team_match_observations
      where referee_id = ${refereeId}::bigint
        and kickoff_at <= ${finoA}::timestamptz
      order by kickoff_at, match_id, side
    `;
    return accoppia(righe);
  }

  async #giocatoriDi(
    teamId: number,
    seasonId: number,
    finoA: string,
  ): Promise<OsservazioneGiocatore[]> {
    const righe = await this.#sql<RigaGiocatore[]>`
      select match_id, kickoff_at, source_ordinal, player_source_id, minutes_played,
             total_shots, shots_on_target, fouls, yellow_card, red_card, saves
      from football.player_match_observations
      where team_id = ${teamId}::bigint
        and season_id = ${seasonId}::bigint
        and kickoff_at <= ${finoA}::timestamptz
      order by kickoff_at, match_id, source_ordinal
    `;
    return righe.map((riga) => ({
      matchId: Number(riga.match_id),
      quando: istante(riga.kickoff_at),
      ordinale: riga.source_ordinal,
      giocatoreId: Number(riga.player_source_id),
      minuti: riga.minutes_played,
      totalShots: riga.total_shots,
      shotsOnTarget: riga.shots_on_target,
      fouls: riga.fouls,
      yellowCard: riga.yellow_card,
      redCard: riga.red_card,
      saves: riga.saves,
    }));
  }

  /**
   * Il materiale di una gara da prevedere, da un lato del campo.
   *
   * Si legge una volta per lato e si compone sette volte, una per bersaglio: cambia
   * quale metrica diventa il valore prodotto, non quali righe si guardano.
   */
  async materiale(gara: GaraDaPrevedere, lato: Lato): Promise<MaterialeDellaGara> {
    const quando = istante(gara.kickoffAt);
    const teamId = lato === "home" ? gara.homeTeamId : gara.awayTeamId;
    const opponentId = lato === "home" ? gara.awayTeamId : gara.homeTeamId;
    const coachId = lato === "home" ? gara.homeCoachSourceId : gara.awayCoachSourceId;

    const [squadra, avversario, allenatore, lega, arbitro, giocatori] = await Promise.all([
      this.#gareDi("team_id", teamId, quando),
      this.#gareDi("team_id", opponentId, quando),
      coachId === null
        ? Promise.resolve<OsservazioneSquadraGara[]>([])
        : this.#gareDi("coach_source_id", coachId, quando),
      this.#righeDellaStagione(gara.seasonId, quando),
      gara.refereeId === null
        ? Promise.resolve<OsservazioneSquadraGara[] | null>(null)
        : this.#righeDellArbitro(gara.refereeId, quando),
      this.#giocatoriDi(teamId, gara.seasonId, quando),
    ]);

    // Le interrogazioni portano entrambe le righe di ogni gara: la storia di una squadra
    // e' fatta delle sole righe che quella squadra ha giocato.
    const sueSoltanto = squadra.filter((riga) => riga.teamId === teamId);
    const loroSoltanto = avversario.filter((riga) => riga.teamId === opponentId);
    const dellAllenatore = coachId === null
      ? []
      : allenatore.filter((riga) => riga.allenatoreId === coachId);

    const storiaSquadra = prima(sueSoltanto, quando, gara.matchId);
    const storiaAllenatore = prima(dellAllenatore, quando, gara.matchId);

    return {
      quando,
      lato,
      stagione: gara.seasonId,
      turno: gara.roundNumber,
      derby: gara.isDerby === null ? null : (gara.isDerby ? 1 : 0),
      squadra: storiaSquadra,
      avversario: prima(loroSoltanto, quando, gara.matchId),
      allenatore: storiaAllenatore,
      allenatoreConLaSquadra: storiaAllenatore.filter(
        (riga) => riga.teamId === teamId,
      ).length,
      lega: prima(lega, quando, gara.matchId),
      arbitro: arbitro === null ? null : prima(arbitro, quando, gara.matchId),
      giocatori: giocatori.filter(
        (riga) => anteriore(riga.quando, riga.matchId, quando, gara.matchId),
      ),
    };
  }
}
